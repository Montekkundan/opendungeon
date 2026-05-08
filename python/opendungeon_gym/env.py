from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import gymnasium as gym
import numpy as np
from gymnasium import spaces


class OpenDungeonEnv(gym.Env):
    """Gymnasium wrapper over the OpenDungeon TypeScript headless protocol."""

    metadata = {"render_modes": ["ansi"], "render_fps": 4}

    def __init__(
        self,
        repo_root: str | Path | None = None,
        seed: int | None = None,
        max_steps: int = 500,
        render_mode: str | None = "ansi",
        bun_bin: str = "bun",
    ) -> None:
        super().__init__()
        self.repo_root = Path(repo_root) if repo_root is not None else Path(__file__).resolve().parents[2]
        self.seed_value = seed
        self.max_steps = max_steps
        self.render_mode = render_mode
        self.bun_bin = bun_bin
        self._request_id = 0
        self._closed = False
        self._process = subprocess.Popen(
            [self.bun_bin, "run", "src/headless/cli.ts", "--", "--protocol", "--max-steps", str(max_steps)],
            cwd=self.repo_root,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        spec = self._request({"command": "spec"})
        self.action_ids = list(spec["actionIds"])
        self.action_space = spaces.Discrete(int(spec["actionCount"]))
        self.observation_space = spaces.Box(
            low=-10.0,
            high=10.0,
            shape=(int(spec["agentObservationSize"]),),
            dtype=np.float32,
        )

    def reset(self, *, seed: int | None = None, options: dict[str, Any] | None = None):
        super().reset(seed=seed)
        if seed is not None:
            self.seed_value = seed
        elif options and "seed" in options:
            self.seed_value = int(options["seed"])
        result = self._request(
            {
                "command": "reset",
                "seed": self.seed_value,
                "maxSteps": self.max_steps,
                "observationMode": "agent",
            }
        )
        observation = np.asarray(result["observation"], dtype=np.float32)
        return observation, self._info(result["info"])

    def step(self, action: int):
        result = self._request({"command": "step", "action": int(action)})
        observation = np.asarray(result["observation"], dtype=np.float32)
        return (
            observation,
            float(result["reward"]),
            bool(result["terminated"]),
            bool(result["truncated"]),
            self._info(result["info"]),
        )

    def render(self):
        result = self._request({"command": "render"})
        return result["text"]

    def observe_test(self) -> dict[str, Any]:
        return self._request({"command": "observe", "observationMode": "test"})

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        try:
            self._request({"command": "close"})
        except Exception:
            pass
        if self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self._process.kill()

    def _request(self, payload: dict[str, Any]) -> Any:
        if self._closed:
            raise RuntimeError("OpenDungeonEnv is closed.")
        if self._process.stdin is None or self._process.stdout is None:
            raise RuntimeError("OpenDungeon protocol process is unavailable.")
        self._request_id += 1
        payload = {"id": self._request_id, **payload}
        self._process.stdin.write(json.dumps(payload) + "\n")
        self._process.stdin.flush()
        line = self._process.stdout.readline()
        if not line:
            stderr = self._process.stderr.read() if self._process.stderr is not None else ""
            raise RuntimeError(f"OpenDungeon protocol stopped unexpectedly. {stderr}")
        response = json.loads(line)
        if not response.get("ok"):
            raise RuntimeError(response.get("error") or "OpenDungeon protocol request failed.")
        return response["result"]

    def _info(self, info: dict[str, Any]) -> dict[str, Any]:
        next_info = dict(info)
        next_info["action_mask"] = np.asarray(info["actionMask"], dtype=np.int8)
        return next_info
