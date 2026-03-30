# Cortex Conductor — Multi-Agent Task Orchestration

## Overview

Conductor enables multiple AI agents across different machines and IDEs to collaborate on complex tasks. Agents can create tasks for each other, share results, and work in parallel with real-time visibility.

## Agent Identity System

Each agent knows who it is, where it is, and what it can do.

### 3-Layer Identity

**Layer 1: Auto-detect (by install.sh)**
Automatically detected at install time, stored in `.cortex/agent-identity.json`:
- OS (macOS / Windows / Linux)
- Hostname
- Available tools (godot, dotnet, python, cargo, blender, etc.)
- Project stacks detected
- Machine specs (optional)

**Layer 2: User-defined (edit `.cortex/agent-identity.json`)**
User adds context the script can't detect:
```json
{
  "role": "game-resource-extractor",
  "capabilities": ["extract-textures", "extract-models", "convert-formats"],
  "description": "Windows VPS with YG game client at C:\\YGOnline. Has access to all game resources.",
  "resources": ["yg-game-client", "r2-upload-access"],
  "tags": ["windows", "vps", "extraction", "gpu"]
}
```

**Layer 3: Session registration (sent to Cortex Hub)**
`cortex_session_start` sends identity to Hub. Other agents and Dashboard can see it.

### Identity File Schema (`.cortex/agent-identity.json`)

```json
{
  "schema_version": "1.0",
  "agent_name": "claude-vps-1",
  "environment": {
    "os": "windows",
    "hostname": "WIN-VPS-01",
    "arch": "x64",
    "tools": ["python", "dotnet", "godot"],
    "paths": {
      "game_client": "C:\\YGOnline",
      "output": "C:\\output"
    }
  },
  "role": "game-resource-extractor",
  "capabilities": ["extract-textures", "extract-models", "game-client", "r2-upload"],
  "description": "Windows VPS with YG game client. Can extract and convert game resources.",
  "resources": ["yg-game-client", "r2-storage"],
  "tags": ["windows", "vps", "extraction"]
}
```

### Auto-Detection in install.sh

```bash
# Detect OS
OS=$(uname -s)  # Darwin, Linux, MINGW64_NT (Windows Git Bash)

# Detect hostname
HOSTNAME=$(hostname)

# Detect available tools
TOOLS=()
command -v godot >/dev/null && TOOLS+=("godot")
command -v dotnet >/dev/null && TOOLS+=("dotnet")
command -v python3 >/dev/null && TOOLS+=("python")
command -v blender >/dev/null && TOOLS+=("blender")
command -v cargo >/dev/null && TOOLS+=("cargo")
command -v go >/dev/null && TOOLS+=("go")
# ... etc

# Generate .cortex/agent-identity.json (only if doesn't exist)
# User can then edit to add role, capabilities, description
```

## Task System

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS conductor_tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    project_id TEXT,
    parent_task_id TEXT,
    created_by_agent TEXT,
    assigned_to_agent TEXT,
    assigned_session_id TEXT,
    status TEXT DEFAULT 'pending'
        CHECK(status IN ('pending','assigned','accepted','in_progress','review','completed','failed','cancelled')),
    priority INTEGER DEFAULT 5,
    required_capabilities TEXT DEFAULT '[]',
    depends_on TEXT DEFAULT '[]',
    notify_on_complete TEXT DEFAULT '[]',
    context TEXT DEFAULT '{}',
    result TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    assigned_at TEXT,
    accepted_at TEXT,
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS conductor_task_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    agent_id TEXT,
    action TEXT NOT NULL,
    message TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
```

### MCP Tools (6 new tools)

| Tool | Input | Output | Description |
|------|-------|--------|-------------|
| `cortex_task_create` | title, description, assignTo?, capabilities?, dependsOn?, notifyOnComplete?, context? | task object | Create task, optionally assign |
| `cortex_task_pickup` | agentId | tasks[] | Get tasks assigned to this agent |
| `cortex_task_accept` | taskId | task + dependencies | Accept assigned task |
| `cortex_task_update` | taskId, status, message?, result? | task | Report progress/completion |
| `cortex_task_list` | projectId?, status?, assignedTo? | tasks[] | List/filter tasks |
| `cortex_task_notify` | (system only) | — | Push notification via hint injection |

### Hint Injection — Task Piggybacking

Every MCP tool response already has a hints section. Enhanced to include:

```
---
CONDUCTOR: You have 1 new task assigned:

[TASK task_abc] Priority: HIGH
Title: Extract textures from map Odin
From: claude-mac (Godot builder)
Context: { map: "odin", format: "png", uploadTo: "r2://textures/odin/" }

Call cortex_task_accept(taskId: "task_abc") to begin.
---
```

Also, task completion notifications:

```
---
CONDUCTOR: Task completed by another agent:

[DONE task_abc] "Extract textures from map Odin"
Agent: claude-vps-1
Result: 155 textures uploaded to r2://textures/odin/
Duration: 3m 22s

You can now proceed with tasks that depended on this.
---
```

## Dashboard UI — /conductor page

### Three Views

**1. Timeline View (default)**
Shows all agents on parallel swimlanes with tasks flowing through time.
Real-time updates via SWR polling (5s interval).

**2. Task Board (Kanban)**
Columns: Pending → Assigned → Active → Review → Done
Drag task to agent to assign.

**3. Agent Focus**
Click an agent to see: identity, capabilities, current tasks, task history.

### Agent Cards

Each agent shown with full identity:
```
┌─ claude-vps-1 ──────────────────────────────────┐
│ 🟢 active  │  Windows VPS  │  WIN-VPS-01        │
│                                                  │
│ Role: game-resource-extractor                    │
│ Caps: extract-textures, game-client, r2-upload   │
│ Tools: python, dotnet                            │
│                                                  │
│ Current: [task_abc] Extract textures (80%)       │
│ Queue: 2 tasks pending                           │
└──────────────────────────────────────────────────┘
```

## Workflow Examples

### Example 1: Cross-Machine Resource Pipeline

```
Agent A (Claude CLI, macOS) — Godot builder:
  1. cortex_session_start → registers as "godot-builder" with caps: [godot, build, test]
  2. Building game scene, needs textures
  3. cortex_task_create(
       title: "Extract Odin textures",
       assignTo: "claude-vps-1",   // knows VPS has game client
       context: { map: "odin", uploadTo: "r2://textures/" },
       notifyOnComplete: ["claude-mac"]
     )
  4. cortex_task_create(
       title: "Design battle UI",
       assignTo: "antigravity",    // Gemini good at design
       notifyOnComplete: ["claude-mac"]
     )
  5. Continues working on physics (not blocked)

Agent B (Claude CLI, Windows VPS) — extractor:
  6. Next MCP call → receives task notification
  7. cortex_task_accept("task_001")
  8. Runs extraction, uploads to R2
  9. cortex_task_update("task_001", status: "completed", result: { files: [...] })

Agent C (Antigravity, Linux) — designer:
  10. Next MCP call → receives task notification
  11. cortex_task_accept("task_002")
  12. Designs UI mockups
  13. cortex_task_update("task_002", status: "completed", result: { mockups: [...] })

Agent A (automatic notification):
  14. Next MCP call → "task_001 completed: textures at r2://..."
  15. Next MCP call → "task_002 completed: UI mockups ready"
  16. Downloads textures, applies to Godot scene
  17. Implements UI based on mockups
```

### Example 2: Code → Review → Deploy Pipeline

```
Agent A (Cursor, VS Code) — frontend dev:
  1. Builds new feature in React
  2. cortex_task_create(title: "Review PR #42", assignTo: "codex-reviewer", requiredCapabilities: ["review"])

Agent B (Codex) — reviewer:
  3. cortex_task_pickup() → "Review PR #42"
  4. Reviews code, writes comments
  5. cortex_task_update(status: "completed", result: { approved: true, comments: [...] })

Agent A (notification):
  6. "Review approved" → proceeds to merge
```

## Implementation Phases

### Phase 1: Agent Identity (enhance install.sh)
- Auto-detect environment in install.sh
- Generate `.cortex/agent-identity.json`
- Enhance `cortex_session_start` to send identity
- Store identity in `session_handoffs` table (new columns)

### Phase 2: Task Backend
- DB tables: `conductor_tasks`, `conductor_task_logs`
- API routes: `/api/tasks/*`
- 6 MCP tools

### Phase 3: Hint Injection Enhancement
- Task assignment notifications in MCP responses
- Task completion notifications
- Dependency unblocking

### Phase 4: Dashboard /conductor Page
- Agent list with identity cards
- Task board (Kanban)
- Task creation + assignment UI

### Phase 5: Timeline View
- Swimlane visualization
- Real-time progress tracking
- Dependency graph visualization

### Phase 6: Smart Features
- Auto-suggest assignment based on capabilities match
- Task decomposition (AI breaks complex task into sub-tasks)
- Workload balancing across agents
