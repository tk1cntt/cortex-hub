# /ce — Cortex End (session close + quality gates)

Run these steps IN ORDER before ending the session.

## Step 1: Quality Gates
Run verification commands:
```bash
pnpm build && pnpm typecheck && pnpm lint
```

## Step 2: Quality Report
Call `cortex_quality_report` with build/typecheck/lint results.

## Step 3: Store Knowledge (if applicable)
If you fixed bugs, discovered patterns, or made architectural decisions this session, call `cortex_knowledge_store` with a summary.

## Step 4: Store Memory
Call `cortex_memory_store` with key decisions and lessons from this session.

## Step 5: End Session
Call `cortex_session_end`:
```
sessionId: "<from session_start>"
summary: "<brief summary of work done>"
```

Print final session summary with compliance score.
