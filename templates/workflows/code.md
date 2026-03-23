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
- Read `.cortex/project-profile.json` → verify commands + patterns
- Read `.cortex/code-conventions.md` → naming, imports, error handling
- **`cortex_memory_search`** → recall past decisions, debugging findings, or gotchas related to this topic. If no results, proceed.

### 2. Research & Plan (Cortex-First Discovery)

> ⚠️ **MANDATORY: Use Cortex tools BEFORE grep/find.** Only fall back to grep_search/find_by_name if Cortex tools return no results or are unavailable.

**Discovery Order (MUST follow):**
1. **`cortex_memory_search`** → "Have I or another agent seen this before?"
2. **`cortex_knowledge_search`** → "Is there documented knowledge about this?"
3. **`cortex_code_search`** → "Where does this pattern exist in the codebase?"
4. **`cortex_code_impact`** → "What will break if I change these files?"
5. `grep_search` / `find_by_name` → FALLBACK only if steps 1-4 are insufficient

**Then plan:**
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

**During execution — Cortex inline usage:**
- Before editing a core file → run `cortex_code_impact` on target symbol/file
- If you encounter a compilation error or runtime bug:
  1. **FIRST** → `cortex_knowledge_search("error message or symptom")`
  2. If no result → debug manually
  3. After fixing → **`cortex_knowledge_store`** the problem + solution (MANDATORY if fix was non-obvious)

### 4. Verify (MANDATORY — from .cortex/project-profile.json)
Run ALL verify commands. ALL must pass before committing:
// turbo
```bash
pnpm build
```
// turbo
```bash
pnpm typecheck
```
// turbo
```bash
pnpm lint
```

> ⚠️ ALWAYS run `pnpm build` (FULL build). NEVER use `--filter`.
> The pre-commit hook (Lefthook) will BLOCK the commit if these fail.

### 5. Fix Issues
If any verify step fails:
- **`cortex_knowledge_search`** the error first — maybe it's a known issue
- Fix the issue
- Re-run ALL verify commands (not just the failed one)
- If fix was non-obvious → **`cortex_knowledge_store`** the problem + solution
- Continue until all pass
- Max retries: 2

### 6. Commit & Push
- Update `STATE.md` with progress
- `git commit` → Lefthook pre-commit runs automatically
- `git push` → Lefthook pre-push double-checks
- Conventional prefix: `feat:`, `fix:`, `docs:`, `chore:`

### 7. Report & Learn (MANDATORY — never skip)
- **`cortex_quality_report`** → report gate results (build/typecheck/lint)
- **`cortex_memory_store`** → store any debugging findings, architecture decisions, or deployment gotchas learned during this session
- If you fixed a non-obvious bug → **`cortex_knowledge_store`** with title, problem, and solution

```
## Quality Report
- Build: ✅/❌ | Typecheck: ✅/❌ | Lint: ✅/❌
- Files changed: N
- Conventions followed: ✅
- Cortex tools used: code_search ✅/❌ | memory ✅/❌ | impact ✅/❌ | knowledge ✅/❌
```

## Cortex Tool Quick Reference

| When | Tool | Why |
|------|------|-----|
| Starting work | `cortex_memory_search` | Recall past context |
| Finding code | `cortex_code_search` | AST-aware search (better than grep) |
| Before editing | `cortex_code_impact` | Check blast radius |
| Hitting an error | `cortex_knowledge_search` | Check if known bug |
| After fixing bug | `cortex_knowledge_store` | Save solution for others |
| After verify pass | `cortex_quality_report` | Report build/lint/typecheck |
| End of session | `cortex_memory_store` | Persist session learnings |

## Anti-Patterns (NEVER do these)

- ❌ Use `grep_search` without trying `cortex_code_search` first
- ❌ Debug an error without searching `cortex_knowledge_search` first
- ❌ Fix a non-obvious bug without storing it via `cortex_knowledge_store`
- ❌ Skip `cortex_quality_report` at end of session
- ❌ Skip `cortex_code_impact` before editing core infrastructure files
