# Hub MCP API Reference

> Complete reference for all tools exposed by the Cortex Hub MCP Server.

---

## Authentication

All requests require a valid API key in the `Authorization` header:

```
Authorization: Bearer <API_KEY>
```

Keys are issued per-agent via the Dashboard (Settings → API Keys).

---

## Tool Reference

### Code Intelligence (7 tools)

#### `cortex_code_search`

Search the code knowledge graph for execution flows related to a concept.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | ✓ | Natural language or keyword search |
| `project` | string | | Project name (e.g. "cortex-hub"), slug, or git URL |
| `projectId` | string | | Project ID (overrides `project`) |
| `branch` | string | | Git branch to search |
| `limit` | number | | Maximum results (default: 5) |

#### `cortex_code_context`

Get a 360° view of a code symbol: callers, callees, methods, execution flows.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | ✓ | Symbol name (function, class, method) |
| `project` | string | | Project name, slug, or git URL |
| `projectId` | string | | Project ID (overrides `project`) |
| `file` | string | | File path for disambiguation |

#### `cortex_code_impact`

Analyze blast radius of changing a symbol — what breaks if you edit it.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `target` | string | ✓ | Symbol name to analyze |
| `project` | string | | Project name, slug, or git URL |
| `projectId` | string | | Project ID (overrides `project`) |
| `branch` | string | | Git branch |
| `direction` | string | | `upstream`, `downstream` (default) |

#### `cortex_code_read`

Read raw source code from an indexed repository.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file` | string | ✓ | Relative file path (e.g. "src/utils/auth.ts") |
| `project` | string | | Project name, slug, or git URL |
| `projectId` | string | | Project ID (overrides `project`) |
| `startLine` | number | | Start line (1-indexed, inclusive) |
| `endLine` | number | | End line (1-indexed, inclusive) |

#### `cortex_list_repos`

List all indexed repositories with project ID mapping.

No parameters required.

#### `cortex_cypher`

Run Cypher queries against the GitNexus knowledge graph.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | ✓ | Cypher query (e.g. `MATCH (n) RETURN n.name LIMIT 10`) |
| `project` | string | | Project name, slug, or git URL |
| `projectId` | string | | Project ID (overrides `project`) |

#### `cortex_detect_changes`

Detect uncommitted changes and analyze risk level.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `scope` | string | | `all` (default), `staged`, or `unstaged` |
| `project` | string | | Project name, slug, or git URL |
| `projectId` | string | | Project ID (overrides `project`) |

---

### Agent Memory (2 tools)

#### `cortex_memory_store`

Store a memory for an AI agent. Persists across sessions.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `content` | string | ✓ | Memory content |
| `agentId` | string | | Agent identifier (default: "default") |
| `project` | string | | Project name to scope memory |
| `projectId` | string | | Project ID (overrides `project`) |
| `branch` | string | | Git branch (requires projectId) |
| `metadata` | object | | Optional metadata tags |

#### `cortex_memory_search`

Search agent memories by semantic similarity.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | ✓ | Search query |
| `agentId` | string | | Filter by agent |
| `project` | string | | Project name |
| `projectId` | string | | Project ID (overrides `project`) |
| `branch` | string | | Git branch |
| `limit` | number | | Max results (default: 5) |

---

### Knowledge Base (2 tools)

#### `cortex_knowledge_store`

Store a knowledge document in the platform knowledge base.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `title` | string | ✓ | Document title |
| `content` | string | ✓ | Document content |
| `tags` | string[] | | Tags for categorization |
| `project` | string | | Project name |
| `projectId` | string | | Project ID (overrides `project`) |
| `agentId` | string | | Contributing agent |

#### `cortex_knowledge_search`

Search the knowledge base by semantic similarity.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | ✓ | Search query |
| `tags` | string[] | | Filter by tags |
| `project` | string | | Project name |
| `projectId` | string | | Project ID (overrides `project`) |
| `limit` | number | | Max results (default: 5) |

---

### Indexing (1 tool)

#### `cortex_code_reindex`

Trigger re-indexing of a project after code changes.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string | ✓ | Project name, slug, or git URL |
| `branch` | string | | Branch to index (default: auto-detected) |

---

### Quality (1 tool)

#### `cortex_quality_report`

Report quality gate check results.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `gate_name` | string | ✓ | Gate name (e.g. "pre_commit", "full") |
| `passed` | boolean | ✓ | Whether the gate passed |
| `score` | number | | Score (0-100) |
| `details` | object | | JSON details |
| `agentId` | string | | Agent identifier |

---

### Sessions (2 tools)

#### `cortex_session_start`

Start a new execution session with project context.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `repo` | string | ✓ | Repository URL |
| `mode` | string | | `development`, `production` |
| `agentId` | string | ✓ | Agent identifier |

#### `cortex_session_end`

Close a session with work summary.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `sessionId` | string | ✓ | Session ID from session_start |
| `summary` | string | | Work summary |

---

### Change Awareness (1 tool)

#### `cortex_changes`

Check for recent code changes pushed by other agents.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `agentId` | string | ✓ | Your agent identifier |
| `project` | string | ✓ | Project name |
| `projectId` | string | | Project ID (overrides `project`) |
| `acknowledge` | boolean | | Mark as seen (default: true) |

---

### Analytics (1 tool)

#### `cortex_tool_stats`

View Cortex MCP tool usage analytics.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `days` | number | | Time window in days (default: 7) |
| `agentId` | string | | Filter by agent |
| `project` | string | | Project name |
| `projectId` | string | | Project ID (overrides `project`) |

---

### Health (1 tool)

#### `cortex_health`

Check health of all backend services.

No parameters required.

---

### Task Management (7 tools)

#### `cortex_task_create`

Create a task, optionally assign to another agent.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `title` | string | ✓ | Task title |
| `description` | string | ✓ | Task description |
| `projectId` | string | | Project ID |
| `priority` | number | | Priority 1-10 (default: 5) |
| `assignedTo` | string | | Agent to assign to |

#### `cortex_task_list`

List tasks with optional filters.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string | | Project name |
| `projectId` | string | | Project ID |
| `status` | string | | Filter by status |
| `assignedTo` | string | | Filter by assignee |
| `limit` | number | | Max results (default: 20) |

#### `cortex_task_pickup`

Pick up an assigned task.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `agentId` | string | ✓ | Your agent identifier |

#### `cortex_task_accept`

Accept an assigned task.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `taskId` | string | ✓ | Task ID |

#### `cortex_task_update`

Update task status.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `taskId` | string | ✓ | Task ID |
| `status` | string | ✓ | New status |
| `result` | string | | Task result |

#### `cortex_task_status`

Get detailed task status.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `taskId` | string | ✓ | Task ID |

#### `cortex_task_submit_strategy`

Submit task execution strategy for review.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `taskId` | string | ✓ | Task ID |
| `strategy` | object | ✓ | Strategy object |
