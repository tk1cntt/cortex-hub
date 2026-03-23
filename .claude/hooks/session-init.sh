#!/bin/bash
# Cortex Session Init — Injects mandatory reminder + resets session markers.
CORTEX_STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.cortex/.session-state"
mkdir -p "$CORTEX_STATE_DIR"
rm -f "$CORTEX_STATE_DIR/session-started" "$CORTEX_STATE_DIR/quality-gates-passed" \
      "$CORTEX_STATE_DIR/gate-build" "$CORTEX_STATE_DIR/gate-typecheck" "$CORTEX_STATE_DIR/gate-lint" \
      "$CORTEX_STATE_DIR/session-ended" 2>/dev/null
cat <<'MSG'
MANDATORY SESSION PROTOCOL — You MUST complete these steps NOW before any other work:
1. Call cortex_session_start with repo, mode: "development", agentId: "claude-code"
2. If recentChanges.count > 0, warn user and run git pull
3. Read STATE.md for current task progress
DO NOT proceed with any code changes until step 1 is complete.
MSG
