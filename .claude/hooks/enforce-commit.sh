#!/bin/bash
# Cortex Commit Enforcement — Blocks git commit if quality gates haven't passed.
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
if [[ ! "$COMMAND" =~ ^git\ (commit|push) ]]; then exit 0; fi
CORTEX_STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.cortex/.session-state"
if [[ "$COMMAND" =~ ^git\ commit ]]; then
  if [ ! -f "$CORTEX_STATE_DIR/quality-gates-passed" ]; then
    echo "Quality gates not passed. Run: pnpm build && pnpm typecheck && pnpm lint first, then call cortex_quality_report." >&2
    exit 2
  fi
fi
if [[ "$COMMAND" =~ ^git\ push ]]; then
  echo "REMINDER: After push, call cortex_code_reindex to update code intelligence." >&2
fi
exit 0
