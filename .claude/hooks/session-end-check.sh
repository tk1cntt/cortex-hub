#!/bin/bash
# Cortex Session End Check — Warns if cortex_session_end not called.
CORTEX_STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.cortex/.session-state"
if [ -f "$CORTEX_STATE_DIR/session-started" ] && [ ! -f "$CORTEX_STATE_DIR/session-ended" ]; then
  echo "WARNING: cortex_session_end has not been called. Call it with sessionId and summary before ending."
fi
exit 0
