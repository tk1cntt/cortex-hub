#!/usr/bin/env node
// Cross-platform hook runner for Claude Code
// Delegates to .sh (macOS/Linux/Git Bash) or .ps1 (Windows native)
//
// Path resolution strategy (each step is a fallback):
//   1. CLAUDE_PROJECT_DIR env var (set by Claude Code)
//   2. import.meta.url → derive from this script's own location
//   3. git rev-parse --show-toplevel (works inside any git repo)
//   4. CWD as last resort
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

// --- Resolve project root (bulletproof, multi-fallback) ---
function resolveProjectDir() {
  // 1. Env var (most reliable when set)
  if (process.env.CLAUDE_PROJECT_DIR) {
    return process.env.CLAUDE_PROJECT_DIR;
  }

  // 2. Derive from this script's absolute location:
  //    .claude/hooks/run-hook.mjs → ../../ = project root
  try {
    const scriptDir = dirname(fileURLToPath(import.meta.url));
    const candidate = resolve(scriptDir, "..", "..");
    if (existsSync(join(candidate, ".claude", "hooks"))) {
      return candidate;
    }
  } catch { /* import.meta.url unavailable — unlikely but safe */ }

  // 3. Git root
  try {
    const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (gitRoot && existsSync(join(gitRoot, ".claude", "hooks"))) {
      return gitRoot;
    }
  } catch { /* not in a git repo or git not installed */ }

  // 4. CWD (last resort)
  return process.cwd();
}

const projectDir = resolveProjectDir();
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
    cwd: projectDir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  });
} catch (err) {
  process.exit(err.status ?? 1);
}
