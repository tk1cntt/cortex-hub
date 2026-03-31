#!/bin/bash
# Cortex Commit Enforcement (v4.0) — Blocks commit without full workflow compliance
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
STATE_DIR="$PROJECT_DIR/.cortex/.session-state"
INPUT=$(cat)
COMMAND=""
if command -v jq >/dev/null 2>&1; then
  COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
elif command -v python3 >/dev/null 2>&1; then
  COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null || true)
fi
[[ ! "$COMMAND" =~ ^git\ (commit|push) ]] && exit 0
if [[ "$COMMAND" =~ ^git\ commit ]]; then
  MISSING=""
  [ ! -f "$STATE_DIR/session-started" ] && MISSING="${MISSING}\n  - cortex_session_start (not called)"
  [ ! -f "$STATE_DIR/discovery-used" ] && MISSING="${MISSING}\n  - cortex_code_search or cortex_knowledge_search (0 calls — must search before editing)"
  [ ! -f "$STATE_DIR/quality-gates-passed" ] && MISSING="${MISSING}\n  - Quality gates: run build/typecheck/lint then call cortex_quality_report"
  if [ -n "$MISSING" ]; then
    echo "BLOCKED: Cannot commit — missing Cortex workflow steps:${MISSING}" >&2
    echo "" >&2
    echo "Fix these steps, then try committing again." >&2
    echo "Read CLAUDE.md 'Tool Priority' section for the required workflow." >&2
    exit 2
  fi
fi
if [[ "$COMMAND" =~ ^git\ push ]]; then
  echo "REMINDER: After push, call cortex_code_reindex to update code intelligence." >&2
fi
exit 0
