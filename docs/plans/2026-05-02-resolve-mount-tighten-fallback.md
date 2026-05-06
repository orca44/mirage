# Tighten `resolve_mount` Cross-Mount Fallback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stop `resolve_mount` from silently routing a command on mount A's path to a *different* mount's resource-specific handler. Resource-specific fallback is wrong (mount B can't read mount A's storage); general (storage-agnostic) fallback is fine.

**Architecture:** Add `is_general_command(name)` / `isGeneralCommand(name)` to `Mount`. In `resolve_mount`, when the cwd/target-path mount lacks the command, only accept a fallback whose command is *general* (registered via `register_general` / `generalCmds`). Otherwise return null and let the caller emit `command not found at <mount>`.

**Tech Stack:** Python (`mirage.workspace.mount.registry`, `mirage.workspace.mount.mount`), TypeScript (`workspace/mount/registry.ts`, `workspace/mount/mount.ts`), pytest, vitest.

______________________________________________________________________

## Repository state assumptions

- Work happens directly on `main` in `/Users/zecheng/strukto/mirage` (no worktree — small, contained change).
- TS reference: [registry.ts:283-308](../../typescript/packages/core/src/workspace/mount/registry.ts#L283-L308), [mount.ts:89-104](../../typescript/packages/core/src/workspace/mount/mount.ts#L89-L104).
- Python reference: [registry.py:189-247](../../python/mirage/workspace/mount/registry.py#L189-L247), [mount.py:75-94](../../python/mirage/workspace/mount/mount.py#L75-L94).
- The error `grep: file not found: /github_ci/workflows` reproduces because:
  1. cwd is in `/github_ci/` (no `grep` handler).
  1. `resolve_mount('grep', [], cwd)` falls back to `mount_for_command('grep')` which returns a *resource-specific* grep on a different mount.
  1. That mount tries to read `/github_ci/workflows` from its own backing store → ENOENT.

## Behavior matrix

| cwd mount has cmd? | fallback mount has cmd as general? | fallback mount has cmd as resource-specific? | Today                           | After fix                     |
| ------------------ | ---------------------------------- | -------------------------------------------- | ------------------------------- | ----------------------------- |
| yes                | —                                  | —                                            | run on cwd mount                | run on cwd mount (unchanged)  |
| no                 | yes                                | —                                            | run on fallback (`seq`, `expr`) | run on fallback (unchanged)   |
| no                 | no                                 | yes                                          | run on fallback ❌              | **return null → 127**         |
| no                 | no                                 | no                                           | return null → 127               | return null → 127 (unchanged) |

The third row is the only behavior change.

## Error message

When `resolve_mount` returns null AND the cwd/target path *did* belong to a known mount that lacked the command, the executor should emit:

```
<cmd>: command not found at <mount.prefix>
```

(instead of `<cmd>: command not found`). This makes the failure mode obvious in transcripts.

______________________________________________________________________

## Task 1: TS — failing test reproducing the bug

**Files:**

- Modify: `typescript/packages/core/src/workspace/mount/registry.test.ts` (or create if absent — check first with `Glob`).

**Step 1: Locate or create the test file**

Run: `ls typescript/packages/core/src/workspace/mount/`

If `registry.test.ts` doesn't exist, create it. Otherwise append to it.

**Step 2: Write the failing test**

Add this test case (use existing fixtures/helpers from the file when possible — read the file first):

```typescript
import { describe, expect, it } from 'vitest'
import { command } from '../../commands/registry.ts'
import { CommandSpec } from '../../commands/spec.ts'
import { RAMResource } from '../../resource/ram/ram.ts'
import { MountMode, PathSpec } from '../../types.ts'
import { Mount } from './mount.ts'
import { MountRegistry } from './registry.ts'

const NOOP_FN = async () => [null, { exitCode: 0 } as never] as never
const SPEC = new CommandSpec({ positional: [], rest: null, flags: {} })

function ramMount(prefix: string): Mount {
  return new Mount({ prefix, resource: new RAMResource(), mode: MountMode.READ })
}

describe('resolveMount: cross-mount fallback', () => {
  it('returns null when cwd mount lacks cmd and only a resource-specific fallback exists', async () => {
    const a = ramMount('/a/')
    const b = ramMount('/b/')
    const [grepB] = command({ name: 'grep', resource: 'ram', spec: SPEC, fn: NOOP_FN })
    if (grepB === undefined) throw new Error('missing')
    b.register(grepB)
    const reg = new MountRegistry()
    reg.add(a)
    reg.add(b)
    const mount = await reg.resolveMount('grep', [], '/a/x')
    expect(mount).toBeNull()
  })

  it('still allows fallback when fallback cmd is general (e.g. seq)', async () => {
    const a = ramMount('/a/')
    const b = ramMount('/b/')
    const [seqB] = command({ name: 'seq', resource: null, spec: SPEC, fn: NOOP_FN })
    if (seqB === undefined) throw new Error('missing')
    b.registerGeneral(seqB)
    const reg = new MountRegistry()
    reg.add(a)
    reg.add(b)
    const mount = await reg.resolveMount('seq', [], '/a/x')
    expect(mount).toBe(b)
  })
})
```

> **Note for executor:** If actual class/method names differ (e.g. `MountRegistry.add` is `register`, `command()` arity differs), match the existing test file's conventions before running.

**Step 3: Run test to verify it fails**

Run: `cd typescript && pnpm --filter @mirage/core test -- registry.test.ts`

Expected: first `it` fails (returns mount `b` instead of null). Second `it` passes.

**Step 4: Commit**

```bash
git add typescript/packages/core/src/workspace/mount/registry.test.ts
git commit -m "test: reproduce cross-mount fallback bug in resolveMount"
```

______________________________________________________________________

## Task 2: TS — add `isGeneralCommand` to `Mount`

**Files:**

- Modify: `typescript/packages/core/src/workspace/mount/mount.ts:54-104`
- Modify: `typescript/packages/core/src/workspace/mount/mount.test.ts`

**Step 1: Write the failing test**

Append to [mount.test.ts](../../typescript/packages/core/src/workspace/mount/mount.test.ts):

```typescript
describe('Mount.isGeneralCommand', () => {
  it('returns true for general commands', () => {
    const m = makeMount()
    const [cmd] = command({ name: 'seq', resource: null, spec: BASIC_SPEC, fn: OK_CMD })
    if (cmd === undefined) throw new Error('missing')
    m.registerGeneral(cmd)
    expect(m.isGeneralCommand('seq')).toBe(true)
  })

  it('returns false for resource-specific commands', () => {
    const m = makeMount()
    const [cmd] = command({ name: 'cat', resource: 'ram', spec: BASIC_SPEC, fn: OK_CMD })
    if (cmd === undefined) throw new Error('missing')
    m.register(cmd)
    expect(m.isGeneralCommand('cat')).toBe(false)
  })

  it('returns false for unknown commands', () => {
    expect(makeMount().isGeneralCommand('nope')).toBe(false)
  })
})
```

**Step 2: Run test, verify failure**

Run: `cd typescript && pnpm --filter @mirage/core test -- mount.test.ts`

Expected: 3 failures (`isGeneralCommand` doesn't exist).

**Step 3: Add the method**

In [mount.ts:104](../../typescript/packages/core/src/workspace/mount/mount.ts#L104), right after `resolveCommand`:

```typescript
isGeneralCommand(cmdName: string): boolean {
  return this.generalCmds.has(cmdName)
}
```

**Step 4: Verify tests pass**

Run: `cd typescript && pnpm --filter @mirage/core test -- mount.test.ts`

Expected: all 3 new tests pass.

**Step 5: Commit**

```bash
git add typescript/packages/core/src/workspace/mount/mount.ts typescript/packages/core/src/workspace/mount/mount.test.ts
git commit -m "feat(ts): add Mount.isGeneralCommand"
```

______________________________________________________________________

## Task 3: TS — tighten `resolveMount` fallback

**Files:**

- Modify: `typescript/packages/core/src/workspace/mount/registry.ts:283-308`

**Step 1: Re-read the failing test from Task 1**

Goal: make the first `it` pass without breaking the second.

**Step 2: Update `resolveMount`**

Replace [registry.ts:289-292](../../typescript/packages/core/src/workspace/mount/registry.ts#L289-L292):

```typescript
const cwdMount = this.mountFor(mountPath)
let mount = cwdMount
if (mount?.resolveCommand(cmdName) == null) {
  const fallback = this.mountForCommand(cmdName)
  // Only accept fallback when its handler is mount-agnostic (general).
  // Resource-specific fallback would dispatch mount A's path through
  // mount B's storage layer — guaranteed wrong.
  if (fallback !== null && fallback.isGeneralCommand(cmdName)) {
    mount = fallback
  } else {
    mount = null
  }
}
```

The rest of the function (cache eviction / default-mount swap) stays the same.

**Step 3: Run all registry tests**

Run: `cd typescript && pnpm --filter @mirage/core test -- registry.test.ts`

Expected: both `it` cases from Task 1 pass.

**Step 4: Run wider test suite**

Run: `cd typescript && pnpm --filter @mirage/core test`

Expected: all tests pass. If others break, they likely depended on the buggy fallback — read each failure and either (a) fix the test setup to register the cmd as general where appropriate, or (b) flag the failure to the human reviewer before changing test expectations.

**Step 5: Commit**

```bash
git add typescript/packages/core/src/workspace/mount/registry.ts
git commit -m "fix(ts): refuse cross-mount fallback for resource-specific commands"
```

______________________________________________________________________

## Task 4: TS — surface `command not found at <mount>` in executor

**Files:**

- Modify: `typescript/packages/core/src/workspace/executor/command.ts:129-137`

**Step 1: Write the failing test**

Append to existing `command.test.ts` (find it via `Glob "**/executor/command*.test.ts"`). If it doesn't exist, add the assertion to a workspace-level integration test such as [workspace.test.ts](../../typescript/packages/core/src/workspace/workspace.test.ts) using a mounted RAMResource at `/a/` with no `grep`:

```typescript
it('reports command not found WITH mount prefix when cwd mount lacks the command', async () => {
  const ws = new Workspace({ '/a/': new RAMResource() }, { mode: MountMode.READ })
  const r = await ws.execute('cd /a && grep -R foo .')
  expect(r.exitCode).toBe(127)
  expect(new TextDecoder().decode(await materialize(r.stderr))).toMatch(
    /grep: command not found at \/a\//,
  )
})
```

**Step 2: Run test, verify it fails on the message check**

Run: `cd typescript && pnpm --filter @mirage/core test -- workspace.test.ts`

Expected: exit code is 127, but stderr says `command not found` without the mount prefix.

**Step 3: Update the error path**

In [command.ts:129](../../typescript/packages/core/src/workspace/executor/command.ts#L129), capture the cwd mount before resolving so we can include its prefix in the error:

```typescript
const cwdMount = registry.mountFor(session.cwd)
const mount = await registry.resolveMount(cmdName, pathScopes, session.cwd)
if (mount === null) {
  const where = cwdMount !== null ? ` at ${cwdMount.prefix}` : ''
  const err = new TextEncoder().encode(`${cmdName}: command not found${where}`)
  return [
    null,
    new IOResult({ exitCode: 127, stderr: err }),
    new ExecutionNode({ command: cmdStr, exitCode: 127 }),
  ]
}
```

(If `pathScopes[0]` is in a different mount than cwd, prefer that — see Task 6 if you decide to refine.)

**Step 4: Verify**

Run: `cd typescript && pnpm --filter @mirage/core test -- workspace.test.ts`

Expected: pass.

**Step 5: Commit**

```bash
git add typescript/packages/core/src/workspace/executor/command.ts typescript/packages/core/src/workspace/workspace.test.ts
git commit -m "fix(ts): include mount prefix in 'command not found' error"
```

______________________________________________________________________

## Task 5: Python — failing test reproducing the bug

**Files:**

- Modify: `python/tests/workspace/mount/test_registry.py`

**Step 1: Read the existing test file**

Run: `Read python/tests/workspace/mount/test_registry.py` — note the fixtures (`registry`, `multi_registry`) and how mounts are constructed.

**Step 2: Append failing tests**

```python
@pytest.mark.asyncio
async def test_resolve_mount_refuses_resource_specific_fallback(multi_registry):
    # cwd is in mount A which lacks 'grep'. mount B has resource-specific
    # 'grep'. resolve_mount must NOT fall back to B.
    mount = await multi_registry.resolve_mount("grep", [], "/a/x")
    assert mount is None


@pytest.mark.asyncio
async def test_resolve_mount_allows_general_fallback(multi_registry_with_general_seq):
    mount = await multi_registry_with_general_seq.resolve_mount("seq", [], "/a/x")
    assert mount is not None
```

You will need to add the `multi_registry_with_general_seq` fixture — model it on the existing `multi_registry`, but register `seq` via `register_general` on one mount.

**Step 3: Run, verify the first fails, second passes (or fails for missing fixture)**

Run: `cd python && uv run pytest tests/workspace/mount/test_registry.py -v`

Expected: first test fails (returns a mount instead of None).

**Step 4: Commit**

```bash
git add python/tests/workspace/mount/test_registry.py
git commit -m "test: reproduce cross-mount fallback bug in resolve_mount (python)"
```

______________________________________________________________________

## Task 6: Python — add `is_general_command` to `Mount`

**Files:**

- Modify: `python/mirage/workspace/mount/mount.py:75-94`
- Modify: `python/tests/workspace/mount/test_mount.py` (locate via `Glob "**/test_mount.py"`).

**Step 1: Write failing tests**

Add to the relevant test file:

```python
def test_is_general_command_true_for_general():
    m = _make_mount()
    cmd = _make_cmd("seq", general=True)
    m.register_general(cmd)
    assert m.is_general_command("seq") is True


def test_is_general_command_false_for_resource_specific():
    m = _make_mount()
    cmd = _make_cmd("cat")
    m.register(cmd)
    assert m.is_general_command("cat") is False


def test_is_general_command_false_for_unknown():
    m = _make_mount()
    assert m.is_general_command("nope") is False
```

(Use `_make_mount` / `_make_cmd` patterns already in the test file. If the helpers don't exist, copy minimal versions from existing tests.)

**Step 2: Run, verify failure**

Run: `cd python && uv run pytest tests/workspace/mount/ -v -k is_general_command`

Expected: AttributeError on `is_general_command`.

**Step 3: Add method**

In [mount.py:94](../../python/mirage/workspace/mount/mount.py#L94), right after `resolve_command`:

```python
def is_general_command(self, cmd_name: str) -> bool:
    return cmd_name in self._general_cmds
```

**Step 4: Verify**

Run: `cd python && uv run pytest tests/workspace/mount/ -v -k is_general_command`

Expected: 3 passes.

**Step 5: Commit**

```bash
git add python/mirage/workspace/mount/mount.py python/tests/workspace/mount/
git commit -m "feat(python): add Mount.is_general_command"
```

______________________________________________________________________

## Task 7: Python — tighten `resolve_mount` fallback

**Files:**

- Modify: `python/mirage/workspace/mount/registry.py:226-232`

**Step 1: Update logic**

Replace [registry.py:226-232](../../python/mirage/workspace/mount/registry.py#L226-L232):

```python
try:
    mount = self.mount_for(mount_path)
except ValueError:
    mount = None

if mount is None or mount.resolve_command(cmd_name) is None:
    fallback = self.mount_for_command(cmd_name)
    if fallback is not None and fallback.is_general_command(cmd_name):
        mount = fallback
    else:
        mount = None
```

**Step 2: Run targeted tests**

Run: `cd python && uv run pytest tests/workspace/mount/test_registry.py -v`

Expected: Task 5 tests pass.

**Step 3: Run full Python test suite**

Run: `cd python && uv run pytest`

Expected: pass. If other tests fail, they likely registered resource-specific handlers as fallbacks for un-mounted resources. Triage each: (a) move to `register_general` if the handler is genuinely storage-agnostic; (b) update test fixture to mount the right resource; (c) escalate to the human reviewer if it looks load-bearing.

**Step 4: Commit**

```bash
git add python/mirage/workspace/mount/registry.py
git commit -m "fix(python): refuse cross-mount fallback for resource-specific commands"
```

______________________________________________________________________

## Task 8: Python — surface `command not found at <mount>`

**Files:**

- Modify: `python/mirage/workspace/executor/command.py:610-625` (locate exact lines via `Grep "command not found"`).

**Step 1: Write failing test**

Append to `python/tests/workspace/test_cwd_integration.py`:

```python
@pytest.mark.asyncio
async def test_grep_in_mount_without_grep_emits_clear_error():
    ws = _make_ws()
    r = await ws.execute("cd /ram && grep -R foo .")
    assert r.exit_code == 127
    stderr = (await r.stderr_str()).strip()
    assert "grep: command not found at /ram" in stderr
```

(`_make_ws` already exists in that file and uses RAMResource at `/ram/`. Verify RAM mount does NOT register grep — it shouldn't, since RAM is content-only.)

**Step 2: Run, expect missing-prefix failure**

Run: `cd python && uv run pytest tests/workspace/test_cwd_integration.py -v -k command_not_found`

Expected: stderr says `command not found` without `at /ram/`.

**Step 3: Update error path**

In [command.py near line 615](../../python/mirage/workspace/executor/command.py#L615), where `mount` is None and we return 127:

```python
try:
    cwd_mount = registry.mount_for(session.cwd)
except ValueError:
    cwd_mount = None
mount = await registry.resolve_mount(cmd_name, path_scopes, session.cwd)
if mount is None:
    where = f" at {cwd_mount.prefix}" if cwd_mount is not None else ""
    err = f"{cmd_name}: command not found{where}".encode()
    return None, IOResult(exit_code=127, stderr=err), ExecutionNode(
        command=cmd_str, exit_code=127)
```

**Step 4: Verify**

Run: `cd python && uv run pytest tests/workspace/test_cwd_integration.py -v`

Expected: pass.

**Step 5: Commit**

```bash
git add python/mirage/workspace/executor/command.py python/tests/workspace/test_cwd_integration.py
git commit -m "fix(python): include mount prefix in 'command not found' error"
```

______________________________________________________________________

## Task 9: Reproduce the original `cd && grep` scenario end-to-end

**Files:**

- Modify: `python/tests/workspace/test_cwd_integration.py`
- Modify: `typescript/packages/core/src/workspace/cwd_integration.test.ts`

**Step 1: Add Python regression test**

```python
@pytest.mark.asyncio
async def test_cd_into_resourceless_mount_then_grep_does_not_fall_through():
    # The original symptom: ls works (resource has ls), grep should NOT
    # silently dispatch to disk and emit "file not found: <cwd>".
    ws = _make_ws()
    r = await ws.execute('cd /ram && ls && grep -R "foo" -n .')
    stderr = (await r.stderr_str())
    # It's fine for grep to fail (127), but it must not produce an
    # ENOENT error pointing at the cwd path.
    assert "file not found: /ram" not in stderr
    assert r.exit_code != 0
```

**Step 2: Add TS regression test**

Mirror in [cwd_integration.test.ts](../../typescript/packages/core/src/workspace/cwd_integration.test.ts) using the same RAM workspace pattern.

**Step 3: Run**

Run:

- `cd python && uv run pytest tests/workspace/test_cwd_integration.py -v -k does_not_fall_through`
- `cd typescript && pnpm --filter @mirage/core test -- cwd_integration.test.ts`

Expected: both pass.

**Step 4: Commit**

```bash
git add python/tests/workspace/test_cwd_integration.py typescript/packages/core/src/workspace/cwd_integration.test.ts
git commit -m "test: regression for cd-into-mount-without-cmd not falling through to disk"
```

______________________________________________________________________

## Task 10: Final verification

**Step 1: Full test suites**

Run in parallel:

- `cd python && uv run pytest`
- `cd typescript && pnpm test`

**Step 2: Pre-commit**

Run: `./python/.venv/bin/pre-commit run --all-files`

(Per [CLAUDE.md](../../CLAUDE.md), invoke the venv binary directly so cwd stays at repo root.)

**Step 3: Manual smoke**

If `.env.development` has `GITHUB_TOKEN`:

Run: `./python/.venv/bin/python -c "from mirage import Workspace, MountMode; from mirage.resource.ram import RAMResource; import asyncio; ws = Workspace({'/r/': RAMResource()}, mode=MountMode.READ); print(asyncio.run(ws.execute('cd /r && grep -R foo .')).exit_code)"`

Expected: prints `127` (not the old behavior of hanging or producing a misleading file-not-found).

______________________________________________________________________

## Out of scope

- Fix (b) from the diagnosis — adding a generic `rg`/`grep` to `_general_cmds` so github_ci/slack/gmail get grep-for-free. Track separately.
- Refining the error to mention the *path*'s mount when it differs from cwd's mount (e.g. `cat /a/x` from `cwd=/b/`). Edge case; do later if it bites.

## Risks

- Other tests may have inadvertently relied on the wrong fallback (e.g. they mounted RAM at `/x/` and expected disk's `cat` to handle text reads). Each such failure is the bug, not the fix — but flag to the human if the count is high.
- `register_general` is the right call site for genuinely storage-agnostic commands. Audit with `Grep "register("` vs `Grep "register_general"` in `commands/builtin/general/` to confirm general commands are registered correctly. If we discover commands wrongly registered via `register`, fix them in their own commit (not in this plan).
