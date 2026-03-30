#!/bin/bash
# Cortex Session Init (v4.0) — Creates session marker + resets quality gates
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
STATE_DIR="$PROJECT_DIR/.cortex/.session-state"
mkdir -p "$STATE_DIR"
# Create session marker immediately (session IS starting)
touch "$STATE_DIR/session-started"
# Reset quality gates and discovery (need to re-verify each session)
rm -f "$STATE_DIR/quality-gates-passed" \
      "$STATE_DIR/gate-build" "$STATE_DIR/gate-typecheck" "$STATE_DIR/gate-lint" \
      "$STATE_DIR/session-ended" "$STATE_DIR/discovery-used" 2>/dev/null
echo "HARD REQUIREMENT: Call cortex_session_start IMMEDIATELY. Grep/find BLOCKED until cortex discovery tools used."
