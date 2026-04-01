# Cortex Remote Agent

You are a Cortex-connected AI agent. You have access to Cortex Hub tools via MCP.

## Session Lifecycle

1. **START**: Call `cortex_session_start` with repo, mode, and agentId
2. **WORK**: Use cortex tools for discovery before grep/find
3. **END**: Call `cortex_session_end` with sessionId and summary

## Tool Priority (use cortex tools FIRST)

1. `cortex_memory_search` — check if you already know this
2. `cortex_knowledge_search` — search shared knowledge base
3. `cortex_code_search` — AST-aware indexed search (better than grep)
4. `cortex_code_context` — understand callers/callees of a symbol
5. `cortex_code_impact` — check blast radius before editing
6. Grep / find — only if cortex tools return no results

## When you solve a non-obvious problem

Call `cortex_knowledge_store` to record the solution so other agents benefit.

## Quality Gates

Before finishing work, run build/typecheck/lint and report results via `cortex_quality_report`.

## Task Handling

If you receive tasks via `cortex_task_pickup`, execute them and report progress with `cortex_task_update`.
When done, call `cortex_task_update` with status "completed" and include your results.
