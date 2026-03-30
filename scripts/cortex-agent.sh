#!/bin/bash
# Cortex Agent — Universal task executor with WebSocket connection
# Works with any IDE: Claude, Codex, Antigravity, Cursor
#
# Usage:
#   cortex-agent start                          # Auto-detect IDE
#   cortex-agent start --name "builder"         # Custom name
#   cortex-agent start --engine claude          # Specify engine
#   cortex-agent start --engine codex           # Use Codex
#   cortex-agent start --url wss://hub.jackle.dev/ws/conductor
#   cortex-agent stop                           # Stop daemon
#   cortex-agent status                         # Show status

set -euo pipefail

# ---------------------------------------------------------------------------
# Constants & defaults
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CORTEX_DIR="$REPO_ROOT/.cortex"
PID_FILE="$CORTEX_DIR/agent.pid"
LOG_FILE="$CORTEX_DIR/agent.log"
TASK_FILE="/tmp/cortex-task-$$.json"
WS_PID_FILE="$CORTEX_DIR/agent-ws.pid"
MAX_LOG_LINES=1000
RECONNECT_DELAY=5
MAX_RECONNECT_DELAY=60

# Defaults
WS_URL="${CORTEX_WS_URL:-ws://cortex-api:4000/ws/conductor}"
API_KEY="${HUB_API_KEY:-}"
AGENT_NAME="${CORTEX_AGENT_NAME:-}"
ENGINE=""
MAX_TURNS=30

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() {
  local ts
  ts="$(date '+%Y-%m-%d %H:%M:%S')"
  echo "[$ts] $*" >> "$LOG_FILE"
}

info()  { echo -e "${BLUE}[cortex-agent]${NC} $*"; log "INFO  $*"; }
ok()    { echo -e "${GREEN}[cortex-agent]${NC} $*"; log "OK    $*"; }
warn()  { echo -e "${YELLOW}[cortex-agent]${NC} $*"; log "WARN  $*"; }
err()   { echo -e "${RED}[cortex-agent]${NC} $*" >&2; log "ERROR $*"; }

rotate_log() {
  if [ -f "$LOG_FILE" ]; then
    local lines
    lines="$(wc -l < "$LOG_FILE" | tr -d ' ')"
    if [ "$lines" -gt "$MAX_LOG_LINES" ]; then
      local tmp="$LOG_FILE.tmp"
      tail -n "$MAX_LOG_LINES" "$LOG_FILE" > "$tmp"
      mv "$tmp" "$LOG_FILE"
    fi
  fi
}

ensure_cortex_dir() {
  mkdir -p "$CORTEX_DIR"
}

# ---------------------------------------------------------------------------
# Engine detection
# ---------------------------------------------------------------------------

detect_engine() {
  if [ -n "$ENGINE" ]; then
    # Validate user-specified engine
    if ! command -v "$ENGINE" >/dev/null 2>&1; then
      err "Specified engine '$ENGINE' not found in PATH"
      exit 1
    fi
    echo "$ENGINE"
    return
  fi

  # Auto-detect in order of preference
  if command -v claude >/dev/null 2>&1; then
    echo "claude"
  elif command -v codex >/dev/null 2>&1; then
    echo "codex"
  elif command -v gemini >/dev/null 2>&1; then
    echo "gemini"
  else
    err "No supported engine found. Install one of: claude, codex, gemini"
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Default agent name
# ---------------------------------------------------------------------------

resolve_agent_name() {
  if [ -n "$AGENT_NAME" ]; then
    echo "$AGENT_NAME"
    return
  fi

  # Try to read from agent-identity.json
  local identity_file="$CORTEX_DIR/agent-identity.json"
  if [ -f "$identity_file" ] && command -v node >/dev/null 2>&1; then
    local name
    name="$(node -e "try{const d=require('$identity_file');console.log(d.hostname||d.name||'')}catch(e){}" 2>/dev/null)"
    if [ -n "$name" ]; then
      echo "$name"
      return
    fi
  fi

  # Fallback: hostname + engine
  echo "$(hostname -s)-$(detect_engine)"
}

# ---------------------------------------------------------------------------
# WebSocket client (Node.js — no external deps beyond what the project needs)
# ---------------------------------------------------------------------------

start_ws_client() {
  local ws_url="$1"
  local agent_name="$2"
  local task_file="$3"

  # Build query params
  local qs="agentId=$(printf '%s' "$agent_name" | sed 's/ /%20/g')"
  if [ -n "$API_KEY" ]; then
    qs="${qs}&apiKey=$API_KEY"
  fi

  local full_url="${ws_url}?${qs}"

  node -e "
const WebSocket = require('ws');
const fs = require('fs');
const url = '${full_url}';
const taskFile = '${task_file}';

let reconnectDelay = ${RECONNECT_DELAY};
const maxDelay = ${MAX_RECONNECT_DELAY};
let alive = true;

process.on('SIGTERM', () => { alive = false; process.exit(0); });
process.on('SIGINT',  () => { alive = false; process.exit(0); });

function connect() {
  const ws = new WebSocket(url);

  ws.on('open', () => {
    console.log('CONNECTED');
    reconnectDelay = ${RECONNECT_DELAY};

    // Register identity
    ws.send(JSON.stringify({
      type: 'agent.register',
      agentId: '${agent_name}',
      engine: '${ENGINE:-auto}',
      capabilities: ['code', 'review', 'test'],
      timestamp: new Date().toISOString()
    }));
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'task.assigned') {
        fs.writeFileSync(taskFile, JSON.stringify(msg, null, 2));
        console.log('TASK:' + msg.taskId);
      } else if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      } else {
        console.log('MSG:' + msg.type);
      }
    } catch (e) {
      console.error('Parse error:', e.message);
    }
  });

  ws.on('close', () => {
    console.log('DISCONNECTED');
    if (alive) {
      setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, maxDelay);
        connect();
      }, reconnectDelay * 1000);
    }
  });

  ws.on('error', (err) => {
    console.error('WS_ERROR:' + err.message);
  });
}

connect();
" &

  echo $!
}

# ---------------------------------------------------------------------------
# Send completion report back to Hub via HTTP (simpler than WS for one-shot)
# ---------------------------------------------------------------------------

report_completion() {
  local task_id="$1"
  local status="$2"    # completed | failed
  local summary="$3"
  local agent_name="$4"

  # Derive HTTP URL from WS URL
  local http_url
  http_url="$(echo "$WS_URL" | sed 's|^ws://|http://|;s|^wss://|https://|;s|/ws/conductor.*||')"

  local payload
  payload=$(node -e "console.log(JSON.stringify({
    taskId: '${task_id}',
    agentId: '${agent_name}',
    status: '${status}',
    summary: $(node -e "console.log(JSON.stringify(require('fs').readFileSync('/dev/stdin','utf8')))" <<< "$summary"),
    completedAt: new Date().toISOString()
  }))")

  local auth_header=""
  if [ -n "$API_KEY" ]; then
    auth_header="-H \"Authorization: Bearer $API_KEY\""
  fi

  curl -s -X POST "${http_url}/v1/tasks/${task_id}/complete" \
    -H "Content-Type: application/json" \
    ${auth_header:+"$auth_header"} \
    -d "$payload" >/dev/null 2>&1 || warn "Failed to report completion for task $task_id"
}

# ---------------------------------------------------------------------------
# Execute a task with the detected engine
# ---------------------------------------------------------------------------

execute_task() {
  local engine="$1"
  local task_desc="$2"
  local task_id="$3"
  local task_branch="${4:-}"

  info "Executing task $task_id with engine=$engine"

  # Switch to task branch if specified
  if [ -n "$task_branch" ]; then
    info "Checking out branch: $task_branch"
    git -C "$REPO_ROOT" checkout -B "$task_branch" 2>/dev/null || \
      git -C "$REPO_ROOT" checkout "$task_branch" 2>/dev/null || \
      warn "Could not checkout branch $task_branch"
  fi

  local exit_code=0
  local output_file="/tmp/cortex-task-output-${task_id}.txt"

  case "$engine" in
    claude)
      claude -p "$task_desc" \
        --allowedTools "Edit,Write,Bash,Read,Grep,Glob" \
        --max-turns "$MAX_TURNS" \
        > "$output_file" 2>&1 || exit_code=$?
      ;;
    codex)
      codex exec "$task_desc" \
        > "$output_file" 2>&1 || exit_code=$?
      ;;
    gemini)
      gemini "$task_desc" \
        > "$output_file" 2>&1 || exit_code=$?
      ;;
    *)
      err "Unknown engine: $engine"
      return 1
      ;;
  esac

  # Read last 50 lines as summary
  local summary
  summary="$(tail -n 50 "$output_file" 2>/dev/null || echo "(no output)")"

  if [ "$exit_code" -eq 0 ]; then
    ok "Task $task_id completed successfully"
    return 0
  else
    warn "Task $task_id failed with exit code $exit_code"
    return 1
  fi
}

# ---------------------------------------------------------------------------
# Main loop: watch for tasks from WebSocket
# ---------------------------------------------------------------------------

run_agent_loop() {
  local engine
  engine="$(detect_engine)"
  local agent_name
  agent_name="$(resolve_agent_name)"

  ensure_cortex_dir
  rotate_log

  info "Starting Cortex Agent"
  info "  Engine:  $engine"
  info "  Name:    $agent_name"
  info "  WS URL:  $WS_URL"
  info "  PID:     $$"
  info "  Log:     $LOG_FILE"

  # Write PID
  echo $$ > "$PID_FILE"

  # Clean up on exit
  cleanup() {
    info "Shutting down agent..."
    # Kill WS client if running
    if [ -f "$WS_PID_FILE" ]; then
      local ws_pid
      ws_pid="$(cat "$WS_PID_FILE")"
      kill "$ws_pid" 2>/dev/null || true
      rm -f "$WS_PID_FILE"
    fi
    rm -f "$PID_FILE" "$TASK_FILE"
    info "Agent stopped"
    exit 0
  }
  trap cleanup SIGINT SIGTERM EXIT

  # Start WebSocket client
  info "Connecting to Hub WebSocket..."
  local ws_pid
  ws_pid="$(start_ws_client "$WS_URL" "$agent_name" "$TASK_FILE")"
  echo "$ws_pid" > "$WS_PID_FILE"
  info "WebSocket client PID: $ws_pid"

  # Main polling loop: check for task files written by WS client
  while true; do
    # Check WS client is still alive
    if ! kill -0 "$ws_pid" 2>/dev/null; then
      warn "WebSocket client died, restarting..."
      ws_pid="$(start_ws_client "$WS_URL" "$agent_name" "$TASK_FILE")"
      echo "$ws_pid" > "$WS_PID_FILE"
    fi

    # Check for new task
    if [ -f "$TASK_FILE" ]; then
      local task_json
      task_json="$(cat "$TASK_FILE")"
      rm -f "$TASK_FILE"

      # Parse task fields using Node.js
      local task_id task_desc task_branch
      task_id="$(node -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).taskId||'')" <<< "$task_json")"
      task_desc="$(node -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).description||JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).prompt||'')" <<< "$task_json")"
      task_branch="$(node -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).branch||'')" <<< "$task_json")"

      if [ -n "$task_id" ] && [ -n "$task_desc" ]; then
        info "Received task: $task_id"
        log "Task description: $task_desc"

        local status="completed"
        if execute_task "$engine" "$task_desc" "$task_id" "$task_branch"; then
          status="completed"
        else
          status="failed"
        fi

        # Report back
        local summary
        summary="$(tail -n 50 "/tmp/cortex-task-output-${task_id}.txt" 2>/dev/null || echo "Task $status")"
        report_completion "$task_id" "$status" "$summary" "$agent_name"

        rotate_log
      else
        warn "Received malformed task, skipping"
      fi
    fi

    sleep 2
  done
}

# ---------------------------------------------------------------------------
# Commands: start / stop / status
# ---------------------------------------------------------------------------

cmd_start() {
  ensure_cortex_dir

  # Check if already running
  if [ -f "$PID_FILE" ]; then
    local existing_pid
    existing_pid="$(cat "$PID_FILE")"
    if kill -0 "$existing_pid" 2>/dev/null; then
      err "Agent already running (PID $existing_pid). Use 'cortex-agent stop' first."
      exit 1
    else
      warn "Stale PID file found, cleaning up"
      rm -f "$PID_FILE"
    fi
  fi

  if [ "${FOREGROUND:-false}" = "true" ]; then
    run_agent_loop
  else
    info "Starting agent as background daemon..."
    nohup bash "$0" _run_loop \
      ${ENGINE:+--engine "$ENGINE"} \
      ${AGENT_NAME:+--name "$AGENT_NAME"} \
      --url "$WS_URL" \
      >> "$LOG_FILE" 2>&1 &
    local daemon_pid=$!
    echo "$daemon_pid" > "$PID_FILE"
    ok "Agent started (PID $daemon_pid)"
    ok "Logs: tail -f $LOG_FILE"
  fi
}

cmd_stop() {
  if [ ! -f "$PID_FILE" ]; then
    warn "No agent PID file found. Agent may not be running."
    exit 0
  fi

  local pid
  pid="$(cat "$PID_FILE")"
  if kill -0 "$pid" 2>/dev/null; then
    info "Stopping agent (PID $pid)..."
    kill "$pid"
    # Wait up to 5s for graceful shutdown
    local waited=0
    while kill -0 "$pid" 2>/dev/null && [ "$waited" -lt 5 ]; do
      sleep 1
      waited=$((waited + 1))
    done
    if kill -0 "$pid" 2>/dev/null; then
      warn "Agent did not stop gracefully, sending SIGKILL"
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE" "$WS_PID_FILE"
    ok "Agent stopped"
  else
    warn "Agent process $pid not found (stale PID file)"
    rm -f "$PID_FILE" "$WS_PID_FILE"
  fi
}

cmd_status() {
  ensure_cortex_dir

  echo -e "${BLUE}=== Cortex Agent Status ===${NC}"

  # Agent process
  if [ -f "$PID_FILE" ]; then
    local pid
    pid="$(cat "$PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      echo -e "  Agent:     ${GREEN}running${NC} (PID $pid)"
    else
      echo -e "  Agent:     ${RED}dead${NC} (stale PID $pid)"
    fi
  else
    echo -e "  Agent:     ${YELLOW}stopped${NC}"
  fi

  # WebSocket client
  if [ -f "$WS_PID_FILE" ]; then
    local ws_pid
    ws_pid="$(cat "$WS_PID_FILE")"
    if kill -0 "$ws_pid" 2>/dev/null; then
      echo -e "  WebSocket: ${GREEN}connected${NC} (PID $ws_pid)"
    else
      echo -e "  WebSocket: ${RED}disconnected${NC}"
    fi
  else
    echo -e "  WebSocket: ${YELLOW}not started${NC}"
  fi

  # Engine
  local engine
  engine="$(detect_engine 2>/dev/null || echo "none")"
  echo -e "  Engine:    $engine"

  # Name
  local name
  name="$(resolve_agent_name 2>/dev/null || echo "unknown")"
  echo -e "  Name:      $name"

  # WS URL
  echo -e "  WS URL:    $WS_URL"

  # Log file
  if [ -f "$LOG_FILE" ]; then
    local log_lines
    log_lines="$(wc -l < "$LOG_FILE" | tr -d ' ')"
    echo -e "  Log:       $LOG_FILE ($log_lines lines)"
    echo ""
    echo -e "${BLUE}--- Last 5 log entries ---${NC}"
    tail -n 5 "$LOG_FILE"
  fi
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --name)
        AGENT_NAME="$2"; shift 2 ;;
      --engine)
        ENGINE="$2"; shift 2 ;;
      --url)
        WS_URL="$2"; shift 2 ;;
      --api-key)
        API_KEY="$2"; shift 2 ;;
      --max-turns)
        MAX_TURNS="$2"; shift 2 ;;
      --foreground|-f)
        FOREGROUND="true"; shift ;;
      *)
        shift ;;
    esac
  done
}

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

main() {
  local command="${1:-help}"
  shift || true

  parse_args "$@"

  case "$command" in
    start)
      cmd_start
      ;;
    stop)
      cmd_stop
      ;;
    status)
      cmd_status
      ;;
    _run_loop)
      # Internal: called by daemon fork
      FOREGROUND="true"
      run_agent_loop
      ;;
    help|--help|-h)
      echo "Cortex Agent — Universal task executor with WebSocket connection"
      echo ""
      echo "Usage:"
      echo "  $(basename "$0") start   [options]   Start the agent daemon"
      echo "  $(basename "$0") stop                Stop the agent daemon"
      echo "  $(basename "$0") status              Show agent status"
      echo ""
      echo "Options:"
      echo "  --name <name>        Agent name (default: auto-detect)"
      echo "  --engine <engine>    Engine: claude, codex, gemini (default: auto-detect)"
      echo "  --url <ws-url>       WebSocket URL (default: ws://cortex-api:4000/ws/conductor)"
      echo "  --api-key <key>      Hub API key (or set HUB_API_KEY env var)"
      echo "  --max-turns <n>      Max turns for claude engine (default: 30)"
      echo "  --foreground, -f     Run in foreground (don't daemonize)"
      ;;
    *)
      err "Unknown command: $command"
      echo "Run '$(basename "$0") help' for usage"
      exit 1
      ;;
  esac
}

main "$@"
