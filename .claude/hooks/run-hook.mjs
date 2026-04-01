#!/usr/bin/env node
// Cross-platform hook runner for Claude Code
// Delegates to .sh (macOS/Linux/Git Bash) or .ps1 (Windows native)
import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { platform } from "os";

const hookName = process.argv[2];
if (!hookName) {
  console.error("Usage: run-hook.mjs <hook-name>");
  process.exit(0);
}

// Derive project dir from this script's location (.claude/hooks/run-hook.mjs → project root)
// Falls back to CLAUDE_PROJECT_DIR env, then CWD as last resort
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectDir = process.env.CLAUDE_PROJECT_DIR || resolve(__dirname, "..", "..");
const hooksDir = join(projectDir, ".claude", "hooks");
const isWindows = platform() === "win32";

// Determine which script and shell to use
const shPath = join(hooksDir, `${hookName}.sh`);
const ps1Path = join(hooksDir, `${hookName}.ps1`);

let cmd, args;

if (isWindows && existsSync(ps1Path)) {
  cmd = "powershell.exe";
  args = ["-ExecutionPolicy", "Bypass", "-File", ps1Path];
} else if (existsSync(shPath)) {
  cmd = "bash";
  args = [shPath];
} else {
  // No hook file found — not an error, just skip
  process.exit(0);
}

try {
  execFileSync(cmd, args, {
    stdio: "inherit",
    env: process.env,
  });
} catch (err) {
  process.exit(err.status ?? 1);
}
