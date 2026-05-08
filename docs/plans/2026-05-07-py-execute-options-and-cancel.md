# Python ExecuteOptions Parity: per-call `cwd`, `env`, and mid-flight `cancel`

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bring Python's `Workspace.execute()` to parity with the TS implementation: per-call `cwd`/`env` overrides with bash subshell semantics, and an `asyncio.Event`-based cancel that propagates through recursion + races inside `handle_sleep`.

**Architecture:**

1. **Per-call cwd/env:** Mirror TS exactly. When `cwd` or `env` is provided, build an ephemeral `Session` clone via `dataclasses.replace(...)` (or manual construction) with overrides applied (`env = {**session.env, **(env or {})}`). The executor runs against the clone. Mutations don't leak. Without overrides, current behavior preserved.

2. **Mid-flight cancel:** Add `cancel: asyncio.Event | None = None`. Thread through `_execute_node`'s function chain. Gate at top of `_execute_node`: `if cancel is not None and cancel.is_set(): raise MirageAbortError(...)`. `handle_sleep` races `asyncio.sleep` against `cancel.wait()` via `asyncio.wait(..., return_when=FIRST_COMPLETED)`. The recursive `self.execute(...)` call inside `Workspace.execute` (used for `eval`, `source`, `$(...)`) forwards `cancel`.

**Two-scope model (same as TS):**

| Need | API | Bash equivalent |
|---|---|---|
| One isolated command | `execute(cmd, cwd=..., env=...)` | `(cd /data && cmd)` |
| Many isolated commands sharing scoped state | `session_id=...` | a separate terminal |
| Persistent shell mutations | run without options | `cd /data; cmd` |

**Tech stack:** Python 3.11+, asyncio, pytest, `tree-sitter-bash`. Tests live under `python/tests/workspace/`.

**Key files:**
- [python/mirage/workspace/workspace.py:481](python/mirage/workspace/workspace.py#L481) — `execute()` signature
- [python/mirage/workspace/session/session.py](python/mirage/workspace/session/session.py) — `Session` dataclass
- [python/mirage/workspace/node/execute_node.py:60](python/mirage/workspace/node/execute_node.py#L60) — `execute_node()` recursion entry
- [python/mirage/workspace/executor/builtins.py:756](python/mirage/workspace/executor/builtins.py#L756) — `handle_sleep`

**Out of scope:**
- Changing the ProvisionResult/IOResult error path.
- Native FUSE mode (separate code path; `cancel` etc. don't apply there).

---

## Test commands

From repo root:
```bash
./python/.venv/bin/python -m pytest python/tests/workspace/test_execute_options.py -xvs
```

For full Python suite (per memory rule, only run when not doing parallel work):
```bash
cd python && uv run pytest
```

---

## Task 1: Failing tests for per-call `cwd` and `env`

**Files:**
- Create: `python/tests/workspace/test_execute_options.py`

Use existing pytest patterns from neighboring tests (e.g. `python/tests/workspace/test_cwd_integration.py` if present, or `test_workspace.py`). Use `RAMResource` mounted at `/ram/`. Mark tests `@pytest.mark.asyncio`.

**Step 1: Write failing tests**

```python
# License header (copy from a neighboring test file)

import asyncio
import pytest
from mirage.types import MountMode, PathSpec
from mirage.resource.ram import RAMResource
from mirage.workspace.workspace import Workspace


async def make_ws() -> Workspace:
    r = RAMResource()
    r.store.dirs.add("/")
    r.store.dirs.add("/subdir")
    ws = Workspace({PathSpec("/ram/"): r}, mode=MountMode.WRITE)
    return ws


# ── per-call cwd: bash subshell semantics ─────────────────────────

@pytest.mark.asyncio
async def test_cwd_runs_in_override():
    ws = await make_ws()
    r = await ws.execute("pwd", cwd="/ram/subdir")
    assert r.stdout.decode().strip() == "/ram/subdir"
    await ws.close()


@pytest.mark.asyncio
async def test_cwd_does_not_mutate_session():
    ws = await make_ws()
    before = ws.cwd
    await ws.execute("pwd", cwd="/ram/subdir")
    assert ws.cwd == before
    await ws.close()


@pytest.mark.asyncio
async def test_cwd_cd_does_not_leak():
    ws = await make_ws()
    before = ws.cwd
    await ws.execute("cd /ram/subdir", cwd="/ram")
    assert ws.cwd == before
    await ws.close()


@pytest.mark.asyncio
async def test_cwd_parallel_isolation():
    ws = await make_ws()
    a, b = await asyncio.gather(
        ws.execute("pwd", cwd="/ram/subdir"),
        ws.execute("pwd", cwd="/ram"),
    )
    assert a.stdout.decode().strip() == "/ram/subdir"
    assert b.stdout.decode().strip() == "/ram"
    await ws.close()


@pytest.mark.asyncio
async def test_setup_persists_overrides_inherit():
    ws = await make_ws()
    cwd_before = ws.cwd
    await ws.execute("export DEBUG=1")
    a, b = await asyncio.gather(
        ws.execute("printenv DEBUG; pwd", cwd="/ram/subdir"),
        ws.execute("printenv DEBUG; pwd", cwd="/ram"),
    )
    assert "1" in a.stdout.decode()
    assert "/ram/subdir" in a.stdout.decode()
    assert "1" in b.stdout.decode()
    assert "/ram" in b.stdout.decode()
    assert ws.env.get("DEBUG") == "1"
    assert ws.cwd == cwd_before
    await ws.close()


@pytest.mark.asyncio
async def test_function_definitions_do_not_leak():
    ws = await make_ws()
    await ws.execute("greet() { echo hi; }", cwd="/ram")
    assert "greet" not in ws.session_manager.get(
        ws.session_manager.default_id).functions
    await ws.close()


# ── per-call env: bash subshell semantics ─────────────────────────

@pytest.mark.asyncio
async def test_env_exposes_override():
    ws = await make_ws()
    r = await ws.execute("printenv FOO", env={"FOO": "bar"})
    assert r.exit_code == 0
    assert r.stdout.decode().strip() == "bar"
    await ws.close()


@pytest.mark.asyncio
async def test_env_does_not_mutate_session():
    ws = await make_ws()
    before = dict(ws.env)
    await ws.execute("printenv FOO", env={"FOO": "bar"})
    assert ws.env == before
    await ws.close()


@pytest.mark.asyncio
async def test_env_export_does_not_leak():
    ws = await make_ws()
    await ws.execute("export LEAKED=yes", env={"FOO": "bar"})
    assert "LEAKED" not in ws.env
    await ws.close()


@pytest.mark.asyncio
async def test_env_layers_onto_session():
    ws = await make_ws()
    await ws.execute("export BASE=keep")
    r = await ws.execute("printenv BASE; printenv FOO", env={"FOO": "bar"})
    assert "keep" in r.stdout.decode()
    assert "bar" in r.stdout.decode()
    assert ws.env.get("BASE") == "keep"
    assert "FOO" not in ws.env
    await ws.close()


@pytest.mark.asyncio
async def test_env_parallel_isolation():
    ws = await make_ws()
    a, b = await asyncio.gather(
        ws.execute("printenv X", env={"X": "one"}),
        ws.execute("printenv X", env={"X": "two"}),
    )
    assert a.stdout.decode().strip() == "one"
    assert b.stdout.decode().strip() == "two"
    await ws.close()
```

**Step 2: Run tests to verify they fail**

```bash
./python/.venv/bin/python -m pytest python/tests/workspace/test_execute_options.py -xvs
```

Expected: TypeError or AttributeError on the unknown kwargs `cwd`/`env`. (Python doesn't have a TS-style compile error; it's a runtime error.)

**Step 3: Commit**

```bash
git add python/tests/workspace/test_execute_options.py
git commit -m "test(python): add failing tests for per-call cwd and env"
```

---

## Task 2: Implement per-call cwd + env via Session clone

**Files:**
- Modify: [python/mirage/workspace/workspace.py:481](python/mirage/workspace/workspace.py#L481)

**Step 1: Update `execute()` signature and clone the session**

Add `cwd: str | None = None, env: dict[str, str] | None = None` to the keyword args.

After `session = self._session_mgr.get(session_id)`, build the ephemeral clone if an override is given. Use `dataclasses.replace` for clarity:

```python
from dataclasses import replace

# Existing:
session = self._session_mgr.get(session_id)

# New:
use_override = cwd is not None or env is not None
effective_session = (
    replace(
        session,
        cwd=cwd if cwd is not None else session.cwd,
        env={**session.env, **(env or {})},
        functions=dict(session.functions),
        arrays=dict(session.arrays),
        readonly_vars=set(session.readonly_vars),
        shell_options=dict(session.shell_options),
    )
    if use_override
    else session
)
```

Then pass `effective_session` to `_execute_node` instead of `session`. After the execute, write `last_exit_code` back to the persistent `session` (not the clone), matching TS semantics:

```python
stdout, io, exec_node = await _execute_node(
    self.dispatch,
    self._registry,
    self.job_table,
    self.execute,
    self._current_agent_id,
    ast,
    effective_session,
    stdin,
    history=self.history,
)
# ...
session.last_exit_code = io.exit_code   # persistent session, not clone
```

**Step 2: Add docstring on the new args**

Bash subshell semantics. Match the TS JSDoc text style. No em-dashes.

**Step 3: Run tests**

```bash
./python/.venv/bin/python -m pytest python/tests/workspace/test_execute_options.py -xvs
```

Expected: all 11 tests pass.

**Step 4: Run scoped Python tests for workspace**

```bash
cd python && uv run pytest tests/workspace/ -x
```

Expected: PASS, no regressions.

**Step 5: Commit**

```bash
git add python/mirage/workspace/workspace.py
git commit -m "feat(python): support per-call cwd and env in Workspace.execute()"
```

---

## Task 3: Failing tests for `cancel`

**Files:**
- Modify: `python/tests/workspace/test_execute_options.py`

**Step 1: Append cancel tests**

```python
# ── mid-flight cancel ─────────────────────────────────────────────

class MirageAbortError(RuntimeError):
    """Forward-declared for tests; real definition lives in workspace package."""


@pytest.mark.asyncio
async def test_cancel_pre_set_raises_immediately():
    ws = await make_ws()
    cancel = asyncio.Event()
    cancel.set()
    with pytest.raises(Exception) as exc_info:
        await ws.execute("echo hi", cancel=cancel)
    assert "abort" in str(exc_info.value).lower()
    await ws.close()


@pytest.mark.asyncio
async def test_cancel_aborts_sleep_within_timeout():
    ws = await make_ws()
    cancel = asyncio.Event()

    async def trigger():
        await asyncio.sleep(0.1)
        cancel.set()

    asyncio.create_task(trigger())
    t0 = asyncio.get_event_loop().time()
    with pytest.raises(Exception):
        await ws.execute("sleep 5", cancel=cancel)
    assert asyncio.get_event_loop().time() - t0 < 1.0
    await ws.close()


@pytest.mark.asyncio
async def test_cancel_inside_for_loop():
    ws = await make_ws()
    cancel = asyncio.Event()

    async def trigger():
        await asyncio.sleep(0.1)
        cancel.set()

    asyncio.create_task(trigger())
    t0 = asyncio.get_event_loop().time()
    with pytest.raises(Exception):
        await ws.execute(
            "for i in 1 2 3 4 5 6 7 8 9 10; do sleep 1; done",
            cancel=cancel,
        )
    assert asyncio.get_event_loop().time() - t0 < 1.5
    await ws.close()


@pytest.mark.asyncio
async def test_cancel_between_list_stages():
    ws = await make_ws()
    cancel = asyncio.Event()

    async def trigger():
        await asyncio.sleep(0.1)
        cancel.set()

    asyncio.create_task(trigger())
    t0 = asyncio.get_event_loop().time()
    with pytest.raises(Exception):
        await ws.execute(
            "sleep 1 && sleep 1 && sleep 1 && echo done",
            cancel=cancel,
        )
    assert asyncio.get_event_loop().time() - t0 < 2.0
    await ws.close()


@pytest.mark.asyncio
async def test_cancel_inside_command_substitution():
    ws = await make_ws()
    cancel = asyncio.Event()

    async def trigger():
        await asyncio.sleep(0.1)
        cancel.set()

    asyncio.create_task(trigger())
    t0 = asyncio.get_event_loop().time()
    with pytest.raises(Exception):
        await ws.execute('echo "$(sleep 5)"', cancel=cancel)
    assert asyncio.get_event_loop().time() - t0 < 1.0
    await ws.close()


@pytest.mark.asyncio
async def test_cancel_workspace_remains_usable():
    ws = await make_ws()
    cancel = asyncio.Event()

    async def trigger():
        await asyncio.sleep(0.05)
        cancel.set()

    asyncio.create_task(trigger())
    with pytest.raises(Exception):
        await ws.execute("sleep 5", cancel=cancel)
    r = await ws.execute("echo recovered")
    assert r.exit_code == 0
    assert r.stdout.decode().strip() == "recovered"
    await ws.close()
```

**Step 2: Verify they fail**

Expected: all 6 cancel tests fail (param doesn't exist yet).

**Step 3: Commit**

```bash
git add python/tests/workspace/test_execute_options.py
git commit -m "test(python): add failing tests for mid-flight cancel"
```

---

## Task 4: Implement cancel + sleep race + executeFn forwarding

**Files:**
- Create: `python/mirage/workspace/abort.py` (new)
- Modify: `python/mirage/workspace/workspace.py`
- Modify: `python/mirage/workspace/node/execute_node.py`
- Modify: `python/mirage/workspace/executor/builtins.py`

**Step 1: Create the abort module**

```python
# python/mirage/workspace/abort.py
# (license header)
import asyncio


class MirageAbortError(RuntimeError):
    """Raised when execution is cancelled mid-flight via `cancel` event."""

    def __init__(self) -> None:
        super().__init__("execute aborted")


async def cancellable_sleep(
    seconds: float, cancel: asyncio.Event | None = None
) -> None:
    if cancel is None:
        await asyncio.sleep(seconds)
        return
    if cancel.is_set():
        raise MirageAbortError()
    sleep_task = asyncio.create_task(asyncio.sleep(seconds))
    cancel_task = asyncio.create_task(cancel.wait())
    done, pending = await asyncio.wait(
        {sleep_task, cancel_task},
        return_when=asyncio.FIRST_COMPLETED,
    )
    for p in pending:
        p.cancel()
    if cancel_task in done:
        raise MirageAbortError()
```

**Step 2: Add `cancel` to `execute()` and forward through executeFn recursion**

```python
async def execute(
    self,
    command: str,
    session_id: str = DEFAULT_SESSION_ID,
    stdin: ... = None,
    provision: bool = False,
    agent_id: str = DEFAULT_AGENT_ID,
    native: bool | None = None,
    cwd: str | None = None,
    env: dict[str, str] | None = None,
    cancel: asyncio.Event | None = None,
) -> IOResult | ProvisionResult:
    if cancel is not None and cancel.is_set():
        raise MirageAbortError()
    # ... existing native/session setup ...

    async def _exec_for_recursion(cmd: str, **opts: Any) -> IOResult:
        return await self.execute(cmd, cancel=cancel, **opts)

    # pass _exec_for_recursion as the executeFn to _execute_node
    # AND forward cancel as a new kwarg to _execute_node
```

The `self.execute` reference passed at line 515 needs to be wrapped so it forwards `cancel` to recursive calls. Inline a small lambda or local async function.

**Step 3: Thread `cancel` through `_execute_node` and add the gate**

In `python/mirage/workspace/node/execute_node.py`:

- Add `cancel: asyncio.Event | None = None` to `execute_node` signature.
- At the very top of the function (after `cs = call_stack or CallStack()` and `recurse = partial(...)`), add:

```python
if cancel is not None and cancel.is_set():
    raise MirageAbortError()
```

Make sure the `partial(execute_node, ...)` for `recurse` includes `cancel=cancel` so recursion carries the cancel token.

**Step 4: Update `handle_sleep` to use `cancellable_sleep`**

```python
async def handle_sleep(
    args: list[str],
    cancel: asyncio.Event | None = None,
) -> tuple[ByteSource | None, IOResult, ExecutionNode]:
    try:
        seconds = float(args[0]) if args else 0
    except ValueError:
        ...
    await cancellable_sleep(seconds, cancel)
    return None, IOResult(), ExecutionNode(command="sleep", exit_code=0)
```

The dispatch site for sleep in `_execute_node` (or `executor/command.py`) needs to forward `cancel` to `handle_sleep`. Use grep to find the call site:

```bash
grep -rn "handle_sleep" python/mirage/workspace/
```

**Step 5: Run tests**

```bash
./python/.venv/bin/python -m pytest python/tests/workspace/test_execute_options.py -xvs
```

Expected: all 17 tests pass (11 cwd/env + 6 cancel).

**Step 6: Run scoped Python suite**

```bash
cd python && uv run pytest tests/workspace/ -x
```

Expected: PASS, no regressions.

**Step 7: Commit**

```bash
git add python/mirage/workspace/abort.py python/mirage/workspace/workspace.py python/mirage/workspace/node/execute_node.py python/mirage/workspace/executor/builtins.py
git commit -m "feat(python): support mid-flight cancel via asyncio.Event with sleep race"
```

---

## Task 5: Final verification

**Step 1: Lint and format**

```bash
./python/.venv/bin/pre-commit run --all-files
```

Expected: PASS. Fix any issues.

**Step 2: Full Python suite**

```bash
cd python && uv run pytest
```

Expected: PASS. If anything regressed, investigate before patching.

**Step 3: Confirm the original 17 + any extras still pass**

```bash
./python/.venv/bin/python -m pytest python/tests/workspace/test_execute_options.py -v
```

**Step 4: Diff sanity check**

```bash
git log --oneline <base>..HEAD
git diff --stat <base>..HEAD
```

Confirm only Python files touched (plus the plan).

---

## Notes

- The `MirageAbortError` is a `RuntimeError` so the existing `except Exception` block in `execute()` would catch it and convert to `IOResult(exit_code=1, ...)`. We must either: (a) re-raise it explicitly inside that handler, (b) use a different base class, or (c) restructure the try/except. Cleanest: change the handler to `except MirageAbortError: raise` followed by `except Exception:`. The implementer should pick one and document it in the commit.
- `asyncio.CancelledError` is NOT what we want here — that's for task-level cancellation. We use a separate event-based mechanism so the user doesn't have to wrap calls in tasks.
- The Session dataclass uses `field(default_factory=...)`, so `dataclasses.replace` correctly produces independent containers when we pass dict/set/dict overrides. Verify the spreads (`{**session.env, **(env or {})}`, `dict(...)`, `set(...)`) explicitly to avoid aliasing.
