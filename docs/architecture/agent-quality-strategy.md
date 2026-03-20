# Agent Quality Gates & Performance Strategy

> Architecture decision document — Cortex Hub
> Created: 2026-03-20

---

## 1. Design Philosophy

Cortex Hub uses a **hybrid approach** to quality enforcement:

| Layer | Tool | Cost | Purpose |
|-------|------|------|---------|
| **Client-side** | AGENTS.md + workflows + STATE.md | Zero latency, zero tokens | Enforce process, conventions, verify commands |
| **Server-side** | Cortex Hub MCP tools | ~200-500ms, ~500-2000 tokens | Shared knowledge, memory, code intelligence |

The key insight: **client-side rules enforce process** (what to do), **server-side MCP provides data** (what to know).

---

## 2. Project-Specific Verification

Each project defines verification commands in its `project-profile.json` → `verify` section:

```json
{
  "verify": {
    "pre_commit": [
      { "name": "Build shared", "cmd": "pnpm build --filter='@cortex/shared-*'" },
      { "name": "Typecheck", "cmd": "pnpm typecheck" },
      { "name": "Lint + Prettier", "cmd": "pnpm lint" }
    ],
    "full": [
      ...pre_commit,
      { "name": "Test", "cmd": "pnpm test" }
    ]
  }
}
```

Agents **never hardcode** verify commands. They read from the profile, ensuring:
- CI/CD parity — local verification matches exactly what CI runs
- Project portability — changing `verify` section adapts to any tech stack
- Single source of truth — one config, all agents follow the same rules

---

## 3. Context Engineering

Inspired by GSD-2's context engineering approach:

| File | Purpose | When Read |
|------|---------|-----------|
| `STATE.md` | Current phase, active tasks, decisions | Session start (ALWAYS) |
| `project-profile.json` | Tech stack, verify commands, patterns | Session start (ALWAYS) |
| `code-conventions.md` | Naming, imports, error handling | Before writing code |
| `AGENTS.md` | Routing rules, session protocol | Loaded by agent framework |

This ensures agents **never waste tool calls on orientation** — context is pre-loaded.

---

## 4. MCP Performance Impact

### Token Overhead

| Scenario | Additional Tokens | Latency Impact |
|----------|------------------|----------------|
| No MCP calls | +0% | Baseline |
| Smart (1 call when needed) | +10% (~1,500 tokens) | +0.5-1s |
| Full (3 calls per task) | +34% (~5,000 tokens) | +1-2s |

### When to Call MCP

| MCP Tool | Call When | Skip When |
|----------|-----------|-----------|
| `cortex.memory.search` | New project, unfamiliar codebase | Continuing same task |
| `cortex.code.search` | Complex code flow, cross-module changes | Simple single-file edits |
| `cortex.code.impact` | Refactoring, deleting, renaming | Adding new code |
| `cortex.quality.report` | After every session (lightweight) | Never skip |

### Trade-off Analysis

> **+10-34% token cost** yields **~80% reduction in edit-revert cycles** because agents understand context and avoid breaking changes.

---

## 5. Quality Enforcement Flow

```
Agent receives task
│
├─ [ALWAYS] Read STATE.md + project-profile.json (0ms, 0 tokens)
├─ [ALWAYS] Read code-conventions.md (0ms, 0 tokens)
│
├─ [IF NEEDED] cortex.memory.search — past context (~500ms, ~1000 tokens)
├─ [IF NEEDED] cortex.code.search — code intelligence (~1000ms, ~2000 tokens)
│
├─ [EXECUTE] Write code following conventions
│
├─ [ALWAYS] Run verify.pre_commit from profile
│   ├─ pnpm build --filter='@cortex/shared-*'
│   ├─ pnpm typecheck
│   └─ pnpm lint
│
├─ [ALWAYS] Update STATE.md
├─ [ALWAYS] cortex.quality.report → log score to Dashboard
│
└─ Done
```

---

## 6. Measurement Approach

Track these metrics via Dashboard `usage_logs`:

| Metric | Source | Formula |
|--------|--------|---------|
| MCP call latency | `usage_logs.latency_ms` | Average per tool type |
| Quality trend | `cortex.quality.report` logs | Score over time |
| CI success rate | GitHub Actions | Green vs red builds |
| Edit-revert ratio | Git history | Reverted commits / total |

### Recommended A/B Test
- **2 weeks**, same codebase
- Group A: Workflows only (no MCP context calls)
- Group B: Workflows + MCP context calls
- Measure: tasks/session, CI failures, tokens/task, time to completion
