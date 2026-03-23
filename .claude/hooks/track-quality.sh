#!/bin/bash
# Cortex Quality Tracker — Marks gates as passed when build/typecheck/lint succeed.
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
CORTEX_STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.cortex/.session-state"
mkdir -p "$CORTEX_STATE_DIR"
[[ "$COMMAND" =~ pnpm\ build ]] && touch "$CORTEX_STATE_DIR/gate-build"
[[ "$COMMAND" =~ pnpm\ typecheck ]] && touch "$CORTEX_STATE_DIR/gate-typecheck"
[[ "$COMMAND" =~ pnpm\ lint ]] && touch "$CORTEX_STATE_DIR/gate-lint"
if [ -f "$CORTEX_STATE_DIR/gate-build" ] && [ -f "$CORTEX_STATE_DIR/gate-typecheck" ] && [ -f "$CORTEX_STATE_DIR/gate-lint" ]; then
  touch "$CORTEX_STATE_DIR/quality-gates-passed"
fi
[[ "$TOOL_NAME" =~ cortex_session_start ]] && touch "$CORTEX_STATE_DIR/session-started"
[[ "$TOOL_NAME" =~ cortex_session_end ]] && touch "$CORTEX_STATE_DIR/session-ended"
exit 0
