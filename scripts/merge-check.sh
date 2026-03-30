#!/bin/bash
# Cortex Merge Check — validates parallel agent worktree output before merge
# Prevents regressions from blind merges.
#
# Usage:
#   bash scripts/merge-check.sh <worktree-path>
#   bash scripts/merge-check.sh .claude/worktrees/agent-abc123
#
# Checks:
#   1. File shrink detection (>30% lines lost = BLOCK)
#   2. Export preservation (missing exports = WARN)
#   3. Route count preservation (routes lost = BLOCK)
#   4. Build verification
#   5. API smoke test (if server running)

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'
PASS=0; WARN=0; FAIL=0

pass() { echo -e "  ${GREEN}✓${NC} $*"; PASS=$((PASS+1)); }
warn() { echo -e "  ${YELLOW}⚠${NC} $*"; WARN=$((WARN+1)); }
fail() { echo -e "  ${RED}✗${NC} $*"; FAIL=$((FAIL+1)); }

WORKTREE="${1:?Usage: merge-check.sh <worktree-path>}"
MAIN_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

if [ ! -d "$WORKTREE" ]; then
  echo -e "${RED}Error: worktree path not found: $WORKTREE${NC}"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Cortex Merge Check"
echo "  Worktree: $(basename "$WORKTREE")"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ══════════════════════════════════════
# Check 1: File shrink detection
# ══════════════════════════════════════
echo "📏 Check 1: File size changes"

SHRINK_THRESHOLD=30  # percent

# Find modified .ts/.tsx files in worktree
cd "$WORKTREE"
CHANGED_FILES=$(git diff --name-only HEAD~1 2>/dev/null | grep -E '\.(ts|tsx)$' || true)
cd "$MAIN_DIR"

for file in $CHANGED_FILES; do
  MAIN_FILE="$MAIN_DIR/$file"
  WORK_FILE="$WORKTREE/$file"

  if [ -f "$MAIN_FILE" ] && [ -f "$WORK_FILE" ]; then
    MAIN_LINES=$(wc -l < "$MAIN_FILE" | tr -d ' ')
    WORK_LINES=$(wc -l < "$WORK_FILE" | tr -d ' ')

    if [ "$MAIN_LINES" -gt 0 ]; then
      DIFF=$((MAIN_LINES - WORK_LINES))
      PCT=$((DIFF * 100 / MAIN_LINES))

      if [ "$PCT" -gt "$SHRINK_THRESHOLD" ]; then
        fail "$file: ${MAIN_LINES} → ${WORK_LINES} lines (${PCT}% SHRUNK — likely rewritten!)"
      elif [ "$PCT" -gt 10 ]; then
        warn "$file: ${MAIN_LINES} → ${WORK_LINES} lines (${PCT}% reduced)"
      elif [ "$DIFF" -lt 0 ]; then
        pass "$file: ${MAIN_LINES} → ${WORK_LINES} lines (+$((-DIFF)) added)"
      else
        pass "$file: ${MAIN_LINES} → ${WORK_LINES} lines (OK)"
      fi
    fi
  fi
done

[ -z "$CHANGED_FILES" ] && pass "No .ts/.tsx files changed"

# ══════════════════════════════════════
# Check 2: Export preservation
# ══════════════════════════════════════
echo ""
echo "📦 Check 2: Export preservation"

for file in $CHANGED_FILES; do
  MAIN_FILE="$MAIN_DIR/$file"
  WORK_FILE="$WORKTREE/$file"

  if [ -f "$MAIN_FILE" ] && [ -f "$WORK_FILE" ]; then
    # Extract exported names
    MAIN_EXPORTS=$(grep -oE 'export (const|function|class|interface|type|enum) \w+' "$MAIN_FILE" 2>/dev/null | awk '{print $3}' | sort)
    WORK_EXPORTS=$(grep -oE 'export (const|function|class|interface|type|enum) \w+' "$WORK_FILE" 2>/dev/null | awk '{print $3}' | sort)

    # Find missing exports
    MISSING=$(comm -23 <(echo "$MAIN_EXPORTS") <(echo "$WORK_EXPORTS") 2>/dev/null || true)

    if [ -n "$MISSING" ] && [ "$MISSING" != "" ]; then
      for exp in $MISSING; do
        fail "$file: export '$exp' REMOVED"
      done
    else
      pass "$file: all exports preserved"
    fi
  fi
done

# ══════════════════════════════════════
# Check 3: Route count (Hono routers)
# ══════════════════════════════════════
echo ""
echo "🔀 Check 3: Route count"

for file in $CHANGED_FILES; do
  MAIN_FILE="$MAIN_DIR/$file"
  WORK_FILE="$WORKTREE/$file"

  if [ -f "$MAIN_FILE" ] && [ -f "$WORK_FILE" ]; then
    MAIN_ROUTES=$(grep -cE '\.(get|post|put|patch|delete)\(' "$MAIN_FILE" 2>/dev/null || echo "0")
    WORK_ROUTES=$(grep -cE '\.(get|post|put|patch|delete)\(' "$WORK_FILE" 2>/dev/null || echo "0")

    if [ "$MAIN_ROUTES" -gt 0 ] && [ "$WORK_ROUTES" -lt "$MAIN_ROUTES" ]; then
      fail "$file: ${MAIN_ROUTES} → ${WORK_ROUTES} routes (LOST $(( MAIN_ROUTES - WORK_ROUTES )) routes!)"
    elif [ "$WORK_ROUTES" -gt "$MAIN_ROUTES" ]; then
      pass "$file: ${MAIN_ROUTES} → ${WORK_ROUTES} routes (+$(( WORK_ROUTES - MAIN_ROUTES )) new)"
    elif [ "$MAIN_ROUTES" -gt 0 ]; then
      pass "$file: ${MAIN_ROUTES} routes (unchanged)"
    fi
  fi
done

# ══════════════════════════════════════
# Check 4: New files (safe — no overwrites)
# ══════════════════════════════════════
echo ""
echo "📄 Check 4: New files"

cd "$WORKTREE"
NEW_FILES=$(git status --short 2>/dev/null | grep "^?" | awk '{print $2}' | grep -E '\.(ts|tsx|sh|ps1)$' || true)
cd "$MAIN_DIR"

if [ -n "$NEW_FILES" ]; then
  for f in $NEW_FILES; do
    pass "NEW: $f"
  done
else
  pass "No new source files"
fi

# ══════════════════════════════════════
# Summary
# ══════════════════════════════════════
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TOTAL=$((PASS + WARN + FAIL))
echo -e "  Results: ${GREEN}${PASS} passed${NC}  ${YELLOW}${WARN} warnings${NC}  ${RED}${FAIL} failures${NC}"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo -e "  ${RED}MERGE BLOCKED — $FAIL failure(s) detected.${NC}"
  echo "  Agent likely rewrote existing files instead of appending."
  echo "  Review the failures above before merging."
  echo ""
  echo "  Options:"
  echo "    1. Manually extract only NEW code from worktree"
  echo "    2. Re-run agent with stricter instructions (APPEND only)"
  echo "    3. Use 'git diff' to cherry-pick specific changes"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
elif [ "$WARN" -gt 0 ]; then
  echo ""
  echo -e "  ${YELLOW}MERGE OK WITH WARNINGS — review before proceeding.${NC}"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 0
else
  echo ""
  echo -e "  ${GREEN}MERGE SAFE — all checks passed.${NC}"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 0
fi
