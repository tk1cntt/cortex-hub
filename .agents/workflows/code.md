---
description: Write code following project-specific quality gates from project-profile.json
---
# /code — Implement with Quality Gates

// turbo-all

## Trigger Patterns
- User says: "add X", "implement X", "thêm X", "làm X", "write X"
- Any request involving code changes

## Steps

### 1. Load Context
- Read `STATE.md` → current phase + active tasks
- Read `.forgewright/project-profile.json` → verify commands + patterns
- Read `.forgewright/code-conventions.md` → naming, imports, error handling

### 2. Plan
- Identify files to create/modify/delete
- Check conventions: camelCase vars, PascalCase types, @cortex/* imports
- Create implementation plan
- **Get user approval before proceeding** (unless trivial fix)

### 3. Execute
Write code following project conventions:
- ✅ `camelCase` for variables/functions
- ✅ `PascalCase` for types/components
- ✅ `@cortex/*` path aliases (never relative cross-package)
- ✅ Custom `CortexError` classes for errors
- ✅ No `any` without explicit comment
- ✅ Co-located tests: `foo.ts` → `foo.test.ts`

### 4. Verify (from project-profile.json → verify.pre_commit)
Run each command sequentially. ALL must pass:
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

### 5. Fix Issues
If any verify step fails:
- Fix the issue
- Re-run the failed command
- Continue until all pass

### 6. Update & Commit
- Update `STATE.md` with progress
- Commit with conventional prefix: `feat:`, `fix:`, `docs:`, `chore:`
- Push to remote

### 7. Report
```
## Quality Report
- Build: ✅/❌ | Typecheck: ✅/❌ | Lint: ✅/❌
- Files changed: N
- Conventions followed: ✅
```
