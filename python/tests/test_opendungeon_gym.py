from __future__ import annotations

import sys
from pathlib import Path

import pytest

gymnasium = pytest.importorskip("gymnasium")
np = pytest.importorskip("numpy")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from opendungeon_gym import OpenDungeonEnv


def test_gymnasium_checker():
    from gymnasium.utils.env_checker import check_env

    env = OpenDungeonEnv(seed=1234, max_steps=10)
    try:
        check_env(env, skip_render_check=True)
    finally:
        env.close()


def test_random_policy_uses_action_mask():
    env = OpenDungeonEnv(seed=1234, max_steps=10)
    try:
        observation, info = env.reset(seed=1234)
        assert observation.shape == env.observation_space.shape
        assert info["action_mask"].shape == (env.action_space.n,)

        for _ in range(5):
            legal = np.flatnonzero(info["action_mask"])
            action = int(legal[0]) if len(legal) else 0
            observation, reward, terminated, truncated, info = env.step(action)
            assert observation.shape == env.observation_space.shape
            assert isinstance(reward, float)
            if terminated or truncated:
                break
    finally:
        env.close()


def test_deterministic_replay_hash():
    def rollout_hash():
        env = OpenDungeonEnv(seed=2222, max_steps=10)
        try:
            env.reset(seed=2222)
            for action_id in ["rest", "noop", "open-inventory", "close-panel"]:
                env.step(env.action_ids.index(action_id))
            return env.observe_test()["snapshot"]["stateHash"]
        finally:
            env.close()

    assert rollout_hash() == rollout_hash()


def test_optional_pufferlib_wrapper():
    pytest.importorskip("pufferlib")

    env = OpenDungeonEnv(seed=1234, max_steps=5)
    try:
        try:
            from pufferlib.emulation import GymnasiumPufferEnv

            wrapped = GymnasiumPufferEnv(env)
            assert wrapped is not None
        except Exception as exc:
            pytest.skip(f"Installed pufferlib does not expose the expected Gymnasium wrapper API: {exc}")
    finally:
        env.close()


def test_optional_stable_baselines_checker():
    pytest.importorskip("stable_baselines3")
    from stable_baselines3.common.env_checker import check_env

    env = OpenDungeonEnv(seed=1234, max_steps=5)
    try:
        check_env(env, warn=True)
    finally:
        env.close()
