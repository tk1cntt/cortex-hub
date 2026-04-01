# /cs — Cortex Start (mandatory session init)

Run these steps IN ORDER. Do NOT skip any step. Do NOT proceed to user work until all steps complete.

## Step 1: Session Start
Call `cortex_session_start`:
```
repo: "https://github.com/lktiep/cortex-hub.git"
mode: "development"
agentId: "claude-code"
ide: "<your IDE>"
os: "<macOS or Windows>"
branch: "<current git branch>"
```

If `recentChanges.count > 0` → warn user and run `git pull`.

## Step 2: Knowledge Recall
Call `cortex_knowledge_search`:
```
query: "session summary progress next session"
```

## Step 3: Memory Recall
Call `cortex_memory_search`:
```
query: "session context decisions lessons"
agentId: "claude-code"
```

## Step 4: Check for Conflicts
Call `cortex_changes`:
```
agentId: "claude-code"
projectId: "<from step 1 response>"
```

## Step 5: Summarize
Print a brief summary of what you found:
- Recent session progress
- Any unseen changes from other agents
- Key memories/lessons
- Confirm ready to start work

Mark all cortex gates as satisfied. You may now proceed with user tasks.
