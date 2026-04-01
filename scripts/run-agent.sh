#!/bin/bash
# Cortex Hub — Remote Agent Launcher
# Launch a Claude Code agent connected to Cortex Hub without cloning the repo.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/lktiep/cortex-hub/master/scripts/run-agent.sh | bash
#   curl ... | bash -s -- --key YOUR_API_KEY
#   curl ... | bash -s -- --key YOUR_API_KEY --url https://your-hub/mcp --agent my-agent --task "Build auth module"
#
# Options:
#   --key, -k        API key (required, or set HUB_API_KEY env)
#   --url, -u        Hub MCP URL (default: https://cortex-mcp.jackle.dev/mcp)
#   --agent, -a      Agent name (default: hostname-based)
#   --task, -t       Run a specific task then exit (headless mode)
#   --budget         Max USD budget per run (default: 5.00)
#   --turns          Max agentic turns (default: 50)
#   --interactive    Launch in interactive mode (default if no --task)
#   --skip-perms     Skip permission prompts (--dangerously-skip-permissions)

set -euo pipefail

# ── Colors ──
RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'
YELLOW='\033[0;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()  { echo -e "${BLUE}[cortex]${NC} $*"; }
ok()    { echo -e "${GREEN}[cortex]${NC} $*"; }
warn()  { echo -e "${YELLOW}[cortex]${NC} $*"; }
err()   { echo -e "${RED}[cortex]${NC} $*" >&2; }

# ── Defaults ──
HUB_URL="${HUB_MCP_URL:-https://cortex-mcp.jackle.dev/mcp}"
API_KEY="${HUB_API_KEY:-}"
AGENT_NAME=""
TASK=""
BUDGET="5.00"
MAX_TURNS="50"
INTERACTIVE=false
SKIP_PERMS=false

# ── Parse Args ──
while [[ $# -gt 0 ]]; do
  case "$1" in
    --key|-k)         API_KEY="$2"; shift 2 ;;
    --key=*)          API_KEY="${1#*=}"; shift ;;
    --url|-u)         HUB_URL="$2"; shift 2 ;;
    --url=*)          HUB_URL="${1#*=}"; shift ;;
    --agent|-a)       AGENT_NAME="$2"; shift 2 ;;
    --agent=*)        AGENT_NAME="${1#*=}"; shift ;;
    --task|-t)        TASK="$2"; shift 2 ;;
    --task=*)         TASK="${1#*=}"; shift ;;
    --budget)         BUDGET="$2"; shift 2 ;;
    --budget=*)       BUDGET="${1#*=}"; shift ;;
    --turns)          MAX_TURNS="$2"; shift 2 ;;
    --turns=*)        MAX_TURNS="${1#*=}"; shift ;;
    --interactive|-i) INTERACTIVE=true; shift ;;
    --skip-perms)     SKIP_PERMS=true; shift ;;
    *)                shift ;;
  esac
done

# ── Banner ──
echo ""
echo -e "${BOLD}${CYAN}  Cortex Hub — Remote Agent${NC}"
echo -e "  Launch a Claude Code agent connected to Cortex Hub."
echo -e "  No repo clone needed.\n"

# ── Check prerequisites ──
if ! command -v claude >/dev/null 2>&1; then
  err "Claude Code CLI not found. Install: npm install -g @anthropic-ai/claude-code"
  exit 1
fi
ok "Claude Code CLI found: $(command -v claude)"

# ── Interactive prompts ──
if [ -z "$API_KEY" ]; then
  read -rp "$(echo -e "${BLUE}API Key${NC}: ")" API_KEY < /dev/tty
  if [ -z "$API_KEY" ]; then
    err "API key required. Get one from Hub Dashboard → Keys."
    exit 1
  fi
fi

if [ -z "$AGENT_NAME" ]; then
  DEFAULT_AGENT="$(hostname | tr '[:upper:]' '[:lower:]' | tr ' ' '-')-agent"
  read -rp "$(echo -e "${BLUE}Agent name${NC} [$DEFAULT_AGENT]: ")" AGENT_NAME < /dev/tty
  AGENT_NAME="${AGENT_NAME:-$DEFAULT_AGENT}"
fi

if [ -z "$TASK" ] && [ "$INTERACTIVE" = "false" ]; then
  echo ""
  echo -e "  ${CYAN}Mode:${NC}"
  echo "  1) Interactive — chat with Cortex tools available"
  echo "  2) Task — run a specific task then exit"
  read -rp "$(echo -e "${BLUE}Select${NC} [1]: ")" MODE_CHOICE < /dev/tty
  if [ "$MODE_CHOICE" = "2" ]; then
    read -rp "$(echo -e "${BLUE}Task description${NC}: ")" TASK < /dev/tty
  else
    INTERACTIVE=true
  fi
fi

# ── Create temp workspace ──
WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/cortex-agent-XXXXXX")
trap 'rm -rf "$WORK_DIR"' EXIT
info "Workspace: $WORK_DIR"

# ── Download CLAUDE.md instructions from GitHub ──
info "Downloading agent instructions..."
CLAUDE_MD="$WORK_DIR/CLAUDE.md"
INSTRUCTIONS_URL="https://raw.githubusercontent.com/lktiep/cortex-hub/master/templates/remote-agent-instructions.md"
if curl -fsSL "$INSTRUCTIONS_URL" -o "$CLAUDE_MD" 2>/dev/null; then
  ok "Instructions downloaded"
else
  # Fallback: generate minimal instructions inline
  warn "Could not download instructions, using built-in defaults"
  cat > "$CLAUDE_MD" << 'MDEOF'
# Cortex Agent

At the START of every conversation, call `cortex_session_start` with the repo URL and agentId.
Use cortex tools (memory_search, knowledge_search, code_search) before grep/find.
When done, call `cortex_session_end` with a summary.
MDEOF
fi

# ── Generate MCP config ──
info "Configuring MCP connection..."
MCP_CONFIG="$WORK_DIR/mcp.json"
cat > "$MCP_CONFIG" << MCPEOF
{
  "mcpServers": {
    "cortex-hub": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "$HUB_URL", "--header", "Authorization:\${AUTH_HEADER}"],
      "env": {
        "AUTH_HEADER": "Bearer $API_KEY"
      }
    }
  }
}
MCPEOF
ok "MCP config ready → $MCP_CONFIG"

# ── Build claude command ──
CLAUDE_ARGS=(
  "--mcp-config" "$MCP_CONFIG"
  "--append-system-prompt-file" "$CLAUDE_MD"
  "--max-turns" "$MAX_TURNS"
)

if [ "$SKIP_PERMS" = "true" ]; then
  CLAUDE_ARGS+=("--dangerously-skip-permissions")
else
  CLAUDE_ARGS+=("--allowedTools" "Read,Glob,Grep,Bash,Edit,Write,mcp__cortex-hub__*")
fi

# ── Launch ──
echo ""
echo -e "${GREEN}${BOLD}  Launching agent: ${AGENT_NAME}${NC}"
echo -e "  Hub: $HUB_URL"
echo -e "  Budget: \$$BUDGET  |  Max turns: $MAX_TURNS"
echo ""

if [ -n "$TASK" ]; then
  # Headless mode — run task and exit
  info "Running task: $TASK"
  PROMPT="You are Cortex agent '$AGENT_NAME'. Call cortex_session_start(repo: \"local\", mode: \"development\", agentId: \"$AGENT_NAME\") first, then execute this task:\n\n$TASK\n\nWhen done, call cortex_session_end with a summary."

  claude "${CLAUDE_ARGS[@]}" \
    --max-budget-usd "$BUDGET" \
    -p "$PROMPT"
else
  # Interactive mode
  info "Starting interactive session. Type your requests, Cortex tools are available."
  CLAUDE_ARGS+=("--append-system-prompt" "You are Cortex agent '$AGENT_NAME'. Call cortex_session_start(repo: \"local\", mode: \"development\", agentId: \"$AGENT_NAME\") at the start of each session.")

  claude "${CLAUDE_ARGS[@]}"
fi

ok "Agent session ended."
