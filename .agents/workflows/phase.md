---
description: Start a new phase with automated gate checks and project-specific verification
---
# /phase — Phase Management with Quality Gates

// turbo-all

## Usage

```
/phase N          # Start Phase N (checks Gate N-1→N first)
/phase N status   # Check Gate N-1→N without starting
```

Also triggered by: "start phase N", "bắt đầu phase N", "phase N"

## Steps

### 1. Load Context
- Read `STATE.md` → verify current phase status
- Read `.forgewright/project-profile.json` → `verify` commands

### 2. Read Gate Definitions
Read the gate criteria for the requested phase transition:
- File: `Antigravity-Production-Grade-Suite/.protocols/gate-definitions.md`
- Find the relevant gate (Gate N-1 → N)

### 3. Run Gate Checks
Execute each check command from the gate definition table.

For local checks (from project-profile.json → verify.full):
// turbo
```bash
pnpm build --filter='@cortex/shared-*'
```
// turbo
```bash
pnpm typecheck
```
// turbo
```bash
pnpm lint
```
// turbo
```bash
pnpm test
```

For server checks (remote):
- SSH to `jackle@192.168.10.119` and run each health check command
- Example: `curl http://localhost:6333/healthz` (Qdrant)
- Example: `curl http://localhost:8317/` (CLIProxy)

### 4. Report Gate Results
Present gate results to user:
```
## Gate N-1→N Check Results

| Check | Status | Output |
|-------|--------|--------|
| Build shared | ✅ | OK |
| Typecheck | ✅ | 0 errors |
| Lint | ✅ | Clean |
| Test | ✅ | All pass |
| Qdrant healthy | ✅ | OK |
| ...

**Gate: PASSED ✅** — Ready to start Phase N.
```

If ANY check fails:
```
**Gate: FAILED ❌** — Cannot start Phase N.

Failed checks:
- [ ] Lint — 3 errors found
  → Fix: Review and fix lint errors
```

### 5. Enter DEFINE Step (if gate passed)
Follow the Phase Workflow Protocol:
- Read: `Antigravity-Production-Grade-Suite/.protocols/phase-workflow.md`
- Start DEFINE step:
  1. Read BRD (`product-manager/BRD/brd.md`) — find relevant epics
  2. Read Requirements Register — find R-codes for this phase
  3. Read Architecture Decisions — understand constraints
  4. Summarize what needs to be built

### 6. Proceed to PLAN Step
- Create implementation plan
- List files to create/modify/delete
- Define acceptance criteria
- **Request user approval** before proceeding to EXECUTE

### 7. After User Approves → EXECUTE → VERIFY → COMMIT
- EXECUTE: Write code following `.forgewright/code-conventions.md`
- VERIFY: Run all commands from `project-profile.json` → `verify.full`
- COMMIT: Conventional commit, update `STATE.md` and `AGENTS.md` phase status

## Important Rules

- ❌ NEVER skip gate checks
- ❌ NEVER skip the PLAN step
- ❌ NEVER start EXECUTE before user approves the plan
- ❌ NEVER hardcode verify commands — always read from project-profile.json
- ✅ ALWAYS update `AGENTS.md` "Current Phase" after completing a phase
- ✅ ALWAYS update `STATE.md` as work progresses
