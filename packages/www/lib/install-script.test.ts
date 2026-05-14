import { describe, expect, test } from "bun:test";
import {
  installCommand,
  installScriptHeaders,
  opendungeonInstallScript,
} from "./install-script";

describe("install script", () => {
  test("serves the public curl installer command", () => {
    expect(installCommand).toBe(
      "curl -fsSL https://opendungeon.xyz/install | bash"
    );
    expect(installScriptHeaders["content-type"]).toContain("x-shellscript");
  });

  test("installs release binaries with package fallback", () => {
    expect(opendungeonInstallScript.startsWith("#!/usr/bin/env sh")).toBe(true);
    expect(opendungeonInstallScript).toContain("$APP-v$version");
    expect(opendungeonInstallScript).toContain("npm install -g");
    expect(opendungeonInstallScript).toContain("bun add -g");
  });
});
