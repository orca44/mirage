# `whoami` Shell Builtin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `whoami` shell builtin that echoes `$USER` from the session env, with `whoami: USER not set\n` on stderr (exit 1) when unset. Parity in TS and Python.

**Architecture:** Mirror `printenv` exactly — direct `Session` access, no `Mount` registration, no `WorkspaceOptions` field. Three touch points per language: builtin name table, handler function, dispatcher branch.

**Tech Stack:** TypeScript (vitest), Python (pytest, uv).

**Design doc:** [docs/plans/2026-05-02-whoami-builtin-design.md](2026-05-02-whoami-builtin-design.md)

______________________________________________________________________

## Task 1: TS — `handleWhoami` (TDD)

**Files:**

- Modify: `typescript/packages/core/src/shell/types.ts:147` (add `WHOAMI`)
- Modify: `typescript/packages/core/src/workspace/executor/builtins.ts:119` (add handler after `handlePrintenv`)
- Modify: `typescript/packages/core/src/workspace/node/execute_node.ts:538` (add dispatch branch after `PRINTENV`)
- Test: `typescript/packages/core/src/workspace/executor/builtins.test.ts:32` (extend describe block)

**Step 1: Write failing tests**

Add a new `describe` block in `builtins.test.ts` after the existing `handleExport / handleUnset / handlePrintenv` block:

```typescript
import { ..., handleWhoami } from './builtins.ts'

describe('handleWhoami', () => {
  it('echoes USER + newline, exit 0', () => {
    const s = new Session({ sessionId: 'test', env: { USER: 'alice' } })
    const [out, io] = handleWhoami(s)
    expect(decode(out as Uint8Array)).toBe('alice\n')
    expect(io.exitCode).toBe(0)
    expect(io.stderr).toBeUndefined()
  })

  it('exits 1 with stderr when USER unset', () => {
    const s = new Session({ sessionId: 'test' })
    const [out, io] = handleWhoami(s)
    expect(out).toBeNull()
    expect(io.exitCode).toBe(1)
    expect(decode(io.stderr as Uint8Array)).toBe('whoami: USER not set\n')
  })

  it('echoes empty string when USER explicitly empty', () => {
    const s = new Session({ sessionId: 'test', env: { USER: '' } })
    const [out, io] = handleWhoami(s)
    expect(decode(out as Uint8Array)).toBe('\n')
    expect(io.exitCode).toBe(0)
  })
})
```

**Step 2: Verify failure**

Run: `cd typescript && pnpm --filter @struktoai/mirage-core exec vitest run src/workspace/executor/builtins.test.ts`

Expected: 3 failures (`handleWhoami` not exported).

**Step 3: Add `WHOAMI` constant**

In `shell/types.ts`, add after `PRINTENV: 'printenv',`:

```typescript
WHOAMI: 'whoami',
```

**Step 4: Add `handleWhoami` function**

In `executor/builtins.ts`, add after `handlePrintenv`:

```typescript
export function handleWhoami(session: Session): Result {
  const user = session.env.USER
  if (user === undefined) {
    const err = new TextEncoder().encode('whoami: USER not set\n')
    return [
      null,
      new IOResult({ exitCode: 1, stderr: err }),
      new ExecutionNode({ command: 'whoami', exitCode: 1, stderr: err }),
    ]
  }
  const out = new TextEncoder().encode(`${user}\n`)
  return [out, new IOResult(), new ExecutionNode({ command: 'whoami', exitCode: 0 })]
}
```

**Step 5: Add dispatch branch**

In `workspace/node/execute_node.ts`, add after the `PRINTENV` branch (~line 538):

```typescript
if (name === SB.WHOAMI) return handleWhoami(session)
```

Also add `handleWhoami` to the `import { ... } from '../executor/builtins.ts'` block.

**Step 6: Verify pass**

Run: `cd typescript && pnpm --filter @struktoai/mirage-core exec vitest run src/workspace/executor/builtins.test.ts`

Expected: all pass (including the 3 new tests).

**Step 7: Commit**

```bash
git add typescript/packages/core/src/shell/types.ts \
        typescript/packages/core/src/workspace/executor/builtins.ts \
        typescript/packages/core/src/workspace/executor/builtins.test.ts \
        typescript/packages/core/src/workspace/node/execute_node.ts
git commit -m "feat(ts): add whoami shell builtin"
```

______________________________________________________________________

## Task 2: Python — `handle_whoami` (TDD)

**Files:**

- Modify: `python/mirage/shell/types.py:138` (add `WHOAMI`)
- Modify: `python/mirage/workspace/executor/builtins.py:109` (add handler after `handle_printenv`)
- Modify: `python/mirage/workspace/node/execute_node.py:596` (add dispatch branch after `PRINTENV`)
- Test: `python/tests/workspace/node/test_execute_node.py:359` (extend after `test_printenv_all`)

**Step 1: Write failing tests**

Add to `test_execute_node.py` after `test_printenv_all`:

```python
# ── whoami ──────────────────────────────────────


def test_whoami_set():
    stdout, io, _, _, _, _ = _exec("whoami", env={"USER": "alice"})
    assert io.exit_code == 0
    assert stdout == b"alice\n"


def test_whoami_unset():
    stdout, io, _, _, _, _ = _exec("whoami", env={})
    assert io.exit_code == 1
    assert io.stderr == b"whoami: USER not set\n"


def test_whoami_empty():
    stdout, io, _, _, _, _ = _exec("whoami", env={"USER": ""})
    assert io.exit_code == 0
    assert stdout == b"\n"
```

**Step 2: Verify failure**

Run: `cd python && uv run pytest tests/workspace/node/test_execute_node.py -k whoami -v`

Expected: 3 failures (probably "command not found" or similar — `whoami` not registered).

**Step 3: Add `WHOAMI` enum value**

In `python/mirage/shell/types.py`, add after `PRINTENV = "printenv"`:

```python
WHOAMI = "whoami"
```

**Step 4: Add `handle_whoami` function**

In `python/mirage/workspace/executor/builtins.py`, add after `handle_printenv`:

```python
async def handle_whoami(
    session: Session,
) -> tuple[ByteSource | None, IOResult, ExecutionNode]:
    user = session.env.get("USER")
    if user is None:
        err = b"whoami: USER not set\n"
        return None, IOResult(exit_code=1, stderr=err), ExecutionNode(
            command="whoami", exit_code=1, stderr=err)
    out = f"{user}\n".encode()
    return out, IOResult(), ExecutionNode(command="whoami", exit_code=0)
```

**Step 5: Add dispatch branch**

In `python/mirage/workspace/node/execute_node.py`, add after the `PRINTENV` branch (~line 596):

```python
if name == SB.WHOAMI:
    return await handle_whoami(session)
```

Also add `handle_whoami` to the imports from `mirage.workspace.executor.builtins`.

**Step 6: Verify pass**

Run: `cd python && uv run pytest tests/workspace/node/test_execute_node.py -k whoami -v`

Expected: 3 passes.

**Step 7: Run the full test_execute_node.py file**

Run: `cd python && uv run pytest tests/workspace/node/test_execute_node.py -q`

Expected: no regressions.

**Step 8: Commit**

```bash
git add python/mirage/shell/types.py \
        python/mirage/workspace/executor/builtins.py \
        python/mirage/workspace/node/execute_node.py \
        python/tests/workspace/node/test_execute_node.py
git commit -m "feat(python): add whoami shell builtin"
```

______________________________________________________________________

## Task 3: Pre-commit + final verification

**Step 1: Run pre-commit from repo root**

Run: `./python/.venv/bin/pre-commit run --all-files`

Expected: passes (or auto-fixes formatting; if so, re-stage and amend).

**Step 2: Re-run scoped tests after any pre-commit fixups**

Run:

```bash
cd typescript && pnpm --filter @struktoai/mirage-core exec vitest run src/workspace/executor/builtins.test.ts
cd ../python && uv run pytest tests/workspace/node/test_execute_node.py -q
```

Expected: all pass.

**Step 3: If pre-commit modified files, commit the fixups**

```bash
git add -A
git commit -m "style: pre-commit fixups"
```

______________________________________________________________________

## Out of scope (per design doc)

- `whoami -u`, `-g`, `-G` flags.
- Fallback to `LOGNAME` when `USER` unset.
- Auto-seeding `USER` from `WorkspaceOptions` or host env.
- Registering `whoami` in `Mount.generalCmds`.

## Acceptance

- `whoami` with `$USER=alice` prints `alice\n`, exit 0, both languages.
- `whoami` with `$USER` unset prints `whoami: USER not set\n` to stderr, exit 1, both languages.
- `Mount.commands()` does not list `whoami` (it's not a registered command).
- `pre-commit run --all-files` passes.
