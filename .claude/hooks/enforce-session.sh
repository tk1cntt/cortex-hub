#!/bin/bash
# ── Cortex Session Enforcement — HARD BLOCK ──
# Blocks Edit, Write, Bash (file-modifying) if cortex_session_start hasn't been called.
# This is the strongest enforcement layer — agent CANNOT do any work without starting a session.

CORTEX_STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.cortex/.session-state"

# If session already started, allow everything
if [ -f "$CORTEX_STATE_DIR/session-started" ]; then
  exit 0
fi

# Read hook input to get tool name
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)

# Allow read-only tools — agent can read files to understand context before starting session
# Allow: Read, Glob, Grep, ToolSearch, Agent (research), WebSearch, WebFetch
# Block: Edit, Write, Bash, NotebookEdit (anything that modifies state)

case "$TOOL_NAME" in
  Edit|Write|NotebookEdit)
    echo "BLOCKED: Call cortex_session_start before editing files. Session not started." >&2
    exit 2
    ;;
  Bash)
    # Allow specific read-only bash commands
    COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

    # Allow: ls, cat, head, tail, git status/log/diff, pnpm build/test/lint, curl (MCP calls), echo, pwd, which
    # Block: anything that modifies files (sed, awk with -i, mv, cp, rm, mkdir, touch, git commit/push/add)
    if [[ "$COMMAND" =~ ^(ls|cat|head|tail|pwd|which|echo|git\ (status|log|diff|branch|remote)|pnpm\ (build|typecheck|lint|test)|curl|python3\ -m\ json) ]]; then
      exit 0
    fi

    # Block file-modifying commands
    if [[ "$COMMAND" =~ (git\ (add|commit|push|reset)|rm\ |mv\ |cp\ |mkdir\ |touch\ |chmod\ |sed\ -i|> ) ]]; then
      echo "BLOCKED: Call cortex_session_start before modifying files. Session not started." >&2
      exit 2
    fi

    # Default: allow other bash commands (they might be read-only inspection)
    exit 0
    ;;
esac

# All other tools (Read, Glob, Grep, etc.) — allow
exit 0
