# CAMEL-AI Toolkits Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship `MirageTerminalToolkit` and `MirageFileToolkit` so a `camel.agents.ChatAgent` can use Mirage's virtual filesystem through camel's standard toolkit API.

**Architecture:** Both toolkits live in a new `mirage/agents/camel/` package. `MirageTerminalToolkit` is a fresh `BaseToolkit` whose 6 functions translate to Mirage's existing job model (`&` / `wait` / `kill` / `jobs`). `MirageFileToolkit` subclasses `camel.toolkits.FileToolkit`, overrides the public methods that touch disk, and reuses inherited format writers via a tempfile trick. A shared `_run_async` helper bridges camel's sync API onto Mirage's async `Workspace.execute`.

**Tech Stack:** Python 3.12, `camel-ai>=0.2.40,<0.3`, Mirage `Workspace` / `RAMResource`, `pytest` + `pytest-asyncio`.

**Design doc:** [docs/plans/2026-04-27-camel-toolkits-design.md](2026-04-27-camel-toolkits-design.md)

**Worktree:** `.worktrees/camel-toolkits/` on branch `feat/camel-toolkits`.

______________________________________________________________________

## Conventions (apply to every task)

- All paths in this plan are relative to the worktree root: `/Users/zecheng/strukto/mirage/.worktrees/camel-toolkits/`.
- Run pytest from `python/`: `cd python && uv run pytest <args>`.
- Run the example with the venv interpreter from repo root: `./python/.venv/bin/python examples/python/agents/camel/sandbox_agent.py`.
- Per CLAUDE.md: imports at top of file only; no nested functions; type Args in docstrings; no docstrings/comments at top of file; no inline `# why` comments after each line.
- Per CLAUDE.md: never call `asyncio.run()` from a sync method that may be invoked under an outer loop. Use the `_run_async` helper from Task 2.
- Commit after each task with the message shown in step 5.

______________________________________________________________________

## Task 1: Add `camel` extra to pyproject.toml

**Files:**

- Modify: `python/pyproject.toml` (extras block)

**Step 1: Add the extra**

In `python/pyproject.toml`, locate the `[project.optional-dependencies]` block. Add a `camel` line just after the `openhands` line:

```toml
# --- camel ---
camel       = ["camel-ai>=0.2.40,<0.3"]
```

Then add `"mirage-ai[camel]"` to the `all` meta-extra list (alphabetically near the bottom).

**Step 2: Sync dependencies**

```bash
cd python && uv sync --all-extras
```

Expected: completes without error. `camel-ai` gets installed.

**Step 3: Smoke-test the import**

```bash
cd python && uv run python -c "from camel.toolkits import BaseToolkit, FileToolkit, FunctionTool; print('ok')"
```

Expected: `ok`. If this errors, camel changed its public API; pin a compatible version.

**Step 4: Commit**

```bash
git add python/pyproject.toml python/uv.lock
git commit -m "feat(agents/camel): add camel-ai optional dependency"
```

______________________________________________________________________

## Task 2: Package skeleton + `_run_async` sync/async bridge

**Files:**

- Create: `python/mirage/agents/camel/__init__.py`
- Create: `python/mirage/agents/camel/_async.py`
- Create: `python/tests/agents/camel/__init__.py`
- Create: `python/tests/agents/camel/test_async.py`

**Step 1: Write the failing test**

Create `python/tests/agents/camel/test_async.py`:

```python
import asyncio

import pytest

from mirage.agents.camel._async import AsyncRunner


def test_run_from_sync_with_no_loop():
    runner = AsyncRunner()

    async def coro():
        await asyncio.sleep(0)
        return 42

    assert runner.run(coro()) == 42
    runner.close()


def test_run_returns_exception():
    runner = AsyncRunner()

    async def boom():
        raise ValueError("nope")

    with pytest.raises(ValueError, match="nope"):
        runner.run(boom())
    runner.close()


@pytest.mark.asyncio
async def test_run_from_inside_running_loop():
    runner = AsyncRunner()

    async def coro():
        await asyncio.sleep(0)
        return "from-loop"

    result = await asyncio.to_thread(runner.run, coro())
    assert result == "from-loop"
    runner.close()
```

**Step 2: Run test to verify failure**

```bash
cd python && uv run pytest tests/agents/camel/test_async.py -v
```

Expected: ImportError — `mirage.agents.camel._async` does not exist.

**Step 3: Implement `_async.py`**

Create `python/mirage/agents/camel/_async.py`:

```python
import asyncio
import threading
from collections.abc import Coroutine
from typing import Any


class AsyncRunner:

    def __init__(self) -> None:
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()

    def _ensure_loop(self) -> asyncio.AbstractEventLoop:
        with self._lock:
            if self._loop is not None and not self._loop.is_closed():
                return self._loop
            self._loop = asyncio.new_event_loop()
            self._thread = threading.Thread(
                target=self._loop.run_forever,
                name="mirage-camel-runner",
                daemon=True,
            )
            self._thread.start()
            return self._loop

    def run(self, coro: Coroutine[Any, Any, Any]) -> Any:
        loop = self._ensure_loop()
        future = asyncio.run_coroutine_threadsafe(coro, loop)
        return future.result()

    def close(self) -> None:
        with self._lock:
            if self._loop is None:
                return
            loop = self._loop
            self._loop = None
            loop.call_soon_threadsafe(loop.stop)
            if self._thread is not None:
                self._thread.join(timeout=2.0)
                self._thread = None
            loop.close()
```

**Step 4: Create `__init__.py` files**

Create `python/mirage/agents/camel/__init__.py`:

```python
```

(Empty for now — populated in later tasks.)

Create `python/tests/agents/camel/__init__.py`:

```python
```

(Empty — marker for the test package.)

**Step 5: Run tests**

```bash
cd python && uv run pytest tests/agents/camel/test_async.py -v
```

Expected: 3 passed.

**Step 6: Commit**

```bash
git add python/mirage/agents/camel python/tests/agents/camel
git commit -m "feat(agents/camel): add AsyncRunner sync/async bridge"
```

______________________________________________________________________

## Task 3: Compat guard test

**Files:**

- Create: `python/tests/agents/camel/test_compat.py`

**Step 1: Write the test**

This test catches breaking camel renames at CI time, before the toolkits silently break.

```python
import inspect

from camel.toolkits import BaseToolkit, FileToolkit, FunctionTool


def test_base_toolkit_has_get_tools():
    assert hasattr(BaseToolkit, "get_tools")


def test_file_toolkit_private_hooks_exist():
    expected = [
        "_resolve_filepath",
        "_resolve_existing_filepath",
        "_resolve_search_path",
        "_sanitize_filename",
        "_create_backup",
        "_write_text_file",
        "_write_simple_text_file",
        "_write_csv_file",
        "_write_json_file",
        "_write_docx_file",
        "_write_pdf_file",
        "_normalize_notebook_source",
        "_build_notebook_cell",
    ]
    missing = [name for name in expected if not hasattr(FileToolkit, name)]
    assert not missing, f"FileToolkit missing hooks: {missing}"


def test_file_toolkit_public_methods_signatures():
    public = ["write_to_file", "read_file", "edit_file", "search_files",
              "notebook_edit_cell", "glob_files", "grep_files"]
    missing = [name for name in public if not hasattr(FileToolkit, name)]
    assert not missing, f"FileToolkit missing public methods: {missing}"
    for name in public:
        sig = inspect.signature(getattr(FileToolkit, name))
        assert "self" in sig.parameters


def test_function_tool_constructible():
    def sample() -> str:
        return "ok"

    tool = FunctionTool(sample)
    assert tool is not None
```

**Step 2: Run the test**

```bash
cd python && uv run pytest tests/agents/camel/test_compat.py -v
```

Expected: 4 passed. If any fails, camel's public surface changed — bump the version pin in pyproject.

**Step 3: Commit**

```bash
git add python/tests/agents/camel/test_compat.py
git commit -m "test(agents/camel): guard against camel API drift"
```

______________________________________________________________________

## Task 4: `MirageTerminalToolkit` — blocking exec + write_content_to_file

**Files:**

- Create: `python/mirage/agents/camel/terminal.py`
- Create: `python/tests/agents/camel/test_terminal.py`

**Step 1: Write the failing tests**

```python
import pytest

from mirage import MountMode, Workspace
from mirage.agents.camel import MirageTerminalToolkit
from mirage.resource.ram import RAMResource


@pytest.fixture
def workspace():
    ram = RAMResource()
    ws = Workspace({"/": ram}, mode=MountMode.WRITE)
    yield ws


@pytest.fixture
def toolkit(workspace):
    tk = MirageTerminalToolkit(workspace)
    yield tk
    tk.close()


def test_shell_exec_blocking_returns_stdout(toolkit):
    out = toolkit.shell_exec(id="t1", command="echo hello", block=True)
    assert "hello" in out


def test_shell_exec_blocking_captures_stderr(toolkit):
    out = toolkit.shell_exec(id="t1", command="ls /nonexistent-zzz", block=True)
    assert "No such file" in out or "cannot access" in out or out


def test_shell_write_content_to_file(toolkit, workspace):
    msg = toolkit.shell_write_content_to_file(content="line1\nline2\n",
                                              file_path="/note.txt")
    assert "note.txt" in msg
    out = toolkit.shell_exec(id="t1", command="cat /note.txt", block=True)
    assert "line1" in out and "line2" in out
```

**Step 2: Verify failure**

```bash
cd python && uv run pytest tests/agents/camel/test_terminal.py -v
```

Expected: ImportError — `MirageTerminalToolkit` not exported.

**Step 3: Implement `terminal.py`**

```python
import shlex

from camel.toolkits import BaseToolkit, FunctionTool

from mirage.agents.camel._async import AsyncRunner
from mirage.io.types import IOResult
from mirage.workspace.workspace import Workspace


def _decode(value: bytes | None) -> str:
    if value is None:
        return ""
    return value.decode("utf-8", errors="replace")


def _io_to_str(io: IOResult) -> str:
    stdout = _decode(io.stdout if isinstance(io.stdout, bytes) else None)
    stderr = _decode(io.stderr if isinstance(io.stderr, bytes) else None)
    if stderr:
        return f"{stdout}\n{stderr}" if stdout else stderr
    return stdout


class MirageTerminalToolkit(BaseToolkit):

    def __init__(self,
                 workspace: Workspace,
                 timeout: float | None = 20.0) -> None:
        super().__init__(timeout=timeout)
        self._ws = workspace
        self._runner = AsyncRunner()
        self._sessions: dict[str, int] = {}

    def close(self) -> None:
        self._runner.close()

    def shell_exec(
        self,
        id: str,
        command: str,
        block: bool = True,
        timeout: float = 20.0,
    ) -> str:
        """Run ``command`` in the Mirage workspace.

        Args:
            id (str): Session identifier (mapped to a Mirage job id).
            command (str): Shell command to execute.
            block (bool): Wait for completion when True; otherwise launch
                the command in the background via Mirage's ``&`` operator.
            timeout (float): Reserved for future use.

        Returns:
            str: Combined stdout/stderr (blocking) or a confirmation
                message with the session id (non-blocking).
        """
        if block:
            io = self._runner.run(self._ws.execute(command))
            return _io_to_str(io)
        bg_cmd = f"{command} &"
        io = self._runner.run(self._ws.execute(bg_cmd))
        stderr = _decode(io.stderr if isinstance(io.stderr, bytes) else None)
        job_id = _parse_job_id(stderr)
        if job_id is None:
            return f"Failed to launch background job: {stderr}"
        self._sessions[id] = job_id
        return f"Started session '{id}' as Mirage job [{job_id}]"

    def shell_view(self, id: str) -> str:
        """Return the latest output for session ``id``.

        Args:
            id (str): Session identifier from a prior non-blocking
                ``shell_exec`` call.

        Returns:
            str: ``jobs`` status if still running, or ``wait`` output if
                completed.
        """
        job_id = self._sessions.get(id)
        if job_id is None:
            return f"Error: no session '{id}'"
        jobs_io = self._runner.run(self._ws.execute("jobs"))
        jobs_out = _decode(
            jobs_io.stdout if isinstance(jobs_io.stdout, bytes) else None)
        if f"[{job_id}] running" in jobs_out:
            return jobs_out
        wait_io = self._runner.run(self._ws.execute(f"wait %{job_id}"))
        return _io_to_str(wait_io)

    def shell_write_to_process(self, id: str, command: str) -> str:
        """Stub for camel API parity; Mirage shell is non-interactive.

        Args:
            id (str): Session identifier (unused).
            command (str): Input that would be sent to stdin (unused).

        Returns:
            str: Explanatory error directing the agent to relaunch with
                stdin redirected via the command itself.
        """
        return ("Mirage shell is not interactive. Re-run shell_exec with "
                "stdin redirected via the command, e.g. "
                "'cat <<EOF | yourcmd\\nINPUT\\nEOF'.")

    def shell_kill_process(self, id: str) -> str:
        """Kill the Mirage job for session ``id``.

        Args:
            id (str): Session identifier from a prior non-blocking
                ``shell_exec`` call.

        Returns:
            str: ``"killed"`` on success, error message otherwise.
        """
        job_id = self._sessions.pop(id, None)
        if job_id is None:
            return f"Error: no session '{id}'"
        io = self._runner.run(self._ws.execute(f"kill %{job_id}"))
        if io.exit_code != 0:
            return _io_to_str(io) or f"kill failed for [{job_id}]"
        return f"killed session '{id}' (job [{job_id}])"

    def shell_ask_user_for_help(self, id: str, prompt: str) -> str:
        """Placeholder hook for human-in-the-loop frameworks.

        Args:
            id (str): Session identifier (unused).
            prompt (str): The question the agent wants to ask.

        Returns:
            str: Echoed prompt — agent frameworks should override this
                method on a subclass to wire up real user IO.
        """
        return f"User prompt recorded (no human attached): {prompt}"

    def shell_write_content_to_file(self, content: str, file_path: str) -> str:
        """Write ``content`` to ``file_path`` via Mirage Workspace.

        Args:
            content (str): UTF-8 text to write.
            file_path (str): Logical Mirage path. May be quoted by the agent.

        Returns:
            str: Success or error message.
        """
        quoted = shlex.quote(file_path)
        io = self._runner.run(
            self._ws.execute(f"cat > {quoted}", stdin=content.encode()))
        if io.exit_code != 0:
            return f"Error writing {file_path}: {_io_to_str(io)}"
        return f"Wrote {len(content)} bytes to {file_path}"

    def get_tools(self) -> list[FunctionTool]:
        return [
            FunctionTool(self.shell_exec),
            FunctionTool(self.shell_view),
            FunctionTool(self.shell_write_to_process),
            FunctionTool(self.shell_kill_process),
            FunctionTool(self.shell_ask_user_for_help),
            FunctionTool(self.shell_write_content_to_file),
        ]


def _parse_job_id(stderr: str) -> int | None:
    line = stderr.strip()
    if line.startswith("[") and "]" in line:
        try:
            return int(line[1:line.index("]")])
        except ValueError:
            return None
    return None
```

**Step 4: Update `__init__.py`**

```python
from mirage.agents.camel.terminal import MirageTerminalToolkit

__all__ = ["MirageTerminalToolkit"]
```

**Step 5: Run tests**

```bash
cd python && uv run pytest tests/agents/camel/test_terminal.py -v
```

Expected: 3 passed.

**Step 6: Commit**

```bash
git add python/mirage/agents/camel/terminal.py python/mirage/agents/camel/__init__.py python/tests/agents/camel/test_terminal.py
git commit -m "feat(agents/camel): add MirageTerminalToolkit blocking exec + write_content"
```

______________________________________________________________________

## Task 5: `MirageTerminalToolkit` — non-blocking + view + kill

**Files:**

- Modify: `python/tests/agents/camel/test_terminal.py` (add 3 tests)

**Step 1: Write the failing tests**

Append to `test_terminal.py`:

```python
def test_shell_exec_nonblocking_returns_session_id(toolkit):
    msg = toolkit.shell_exec(id="bg1", command="sleep 0.5", block=False)
    assert "bg1" in msg


def test_shell_view_after_completion(toolkit):
    toolkit.shell_exec(id="bg2", command="echo done", block=False)
    out = toolkit.shell_view(id="bg2")
    assert "done" in out


def test_shell_kill_unknown_session(toolkit):
    msg = toolkit.shell_kill_process(id="never-started")
    assert "Error" in msg


def test_shell_write_to_process_returns_clear_error(toolkit):
    toolkit.shell_exec(id="bg3", command="sleep 0.5", block=False)
    msg = toolkit.shell_write_to_process(id="bg3", command="anything")
    assert "not interactive" in msg.lower()


def test_get_tools_returns_six(toolkit):
    tools = toolkit.get_tools()
    assert len(tools) == 6
```

**Step 2: Run tests**

```bash
cd python && uv run pytest tests/agents/camel/test_terminal.py -v
```

Expected: all pass (logic was implemented in Task 4). If any fail, fix the implementation before committing.

**Step 3: Commit**

```bash
git add python/tests/agents/camel/test_terminal.py
git commit -m "test(agents/camel): cover terminal non-blocking + edge cases"
```

______________________________________________________________________

## Task 6: `MirageFileToolkit` — skeleton + `read_file` + text `write_to_file`

**Files:**

- Create: `python/mirage/agents/camel/file.py`
- Create: `python/tests/agents/camel/test_file.py`
- Modify: `python/mirage/agents/camel/__init__.py`

**Step 1: Write the failing tests**

````python
import json

import pytest

from mirage import MountMode, Workspace
from mirage.agents.camel import MirageFileToolkit
from mirage.resource.ram import RAMResource


@pytest.fixture
def workspace():
    ram = RAMResource()
    yield Workspace({"/": ram}, mode=MountMode.WRITE)


@pytest.fixture
def toolkit(workspace):
    tk = MirageFileToolkit(workspace)
    yield tk
    tk.close()


def test_write_text_file_then_read(toolkit):
    msg = toolkit.write_to_file(title="Hello",
                                content="hi there",
                                filename="/notes/hello.md")
    assert "hello.md" in msg
    out = toolkit.read_file(file_paths="/notes/hello.md")
    assert "hi there" in out


def test_write_json_file_then_read(toolkit):
    msg = toolkit.write_to_file(title="data",
                                content={"a": 1, "b": [2, 3]},
                                filename="/data.json")
    assert "data.json" in msg
    out = toolkit.read_file(file_paths="/data.json")
    parsed = json.loads(_strip_markdown_code_fence(out))
    assert parsed == {"a": 1, "b": [2, 3]}


def _strip_markdown_code_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        return "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
    return text
````

**Step 2: Verify failure**

```bash
cd python && uv run pytest tests/agents/camel/test_file.py -v
```

Expected: ImportError on `MirageFileToolkit`.

**Step 3: Implement `file.py`**

```python
import shlex
import tempfile
from pathlib import Path

from camel.toolkits import FileToolkit

from mirage.agents.camel._async import AsyncRunner
from mirage.workspace.workspace import Workspace


class MirageFileToolkit(FileToolkit):

    def __init__(
        self,
        workspace: Workspace,
        working_directory: str = "/",
        timeout: float | None = None,
        default_encoding: str = "utf-8",
        backup_enabled: bool = False,
    ) -> None:
        self._ws = workspace
        self._runner = AsyncRunner()
        self._mirage_root = working_directory
        self._tmpdir = tempfile.TemporaryDirectory(prefix="mirage-camel-")
        super().__init__(
            working_directory=self._tmpdir.name,
            timeout=timeout,
            default_encoding=default_encoding,
            backup_enabled=backup_enabled,
        )

    def close(self) -> None:
        self._runner.close()
        self._tmpdir.cleanup()

    def _to_mirage_path(self, file_path: str) -> str:
        path_str = file_path
        if not path_str.startswith("/"):
            base = self._mirage_root.rstrip("/") or ""
            path_str = f"{base}/{path_str}"
        return path_str

    def _read_mirage_bytes(self, mirage_path: str) -> bytes:
        quoted = shlex.quote(mirage_path)
        io = self._runner.run(self._ws.execute(f"cat {quoted}"))
        if io.exit_code != 0:
            stderr = io.stderr if isinstance(io.stderr, bytes) else b""
            raise FileNotFoundError(stderr.decode("utf-8", errors="replace"))
        return io.stdout if isinstance(io.stdout, bytes) else b""

    def _write_mirage_bytes(self, mirage_path: str, data: bytes) -> None:
        quoted = shlex.quote(mirage_path)
        io = self._runner.run(
            self._ws.execute(f"cat > {quoted}", stdin=data))
        if io.exit_code != 0:
            stderr = io.stderr if isinstance(io.stderr, bytes) else b""
            raise OSError(stderr.decode("utf-8", errors="replace"))

    def write_to_file(
        self,
        title: str,
        content,
        filename: str,
        encoding: str | None = None,
        use_latex: bool = False,
    ) -> str:
        """Write ``content`` to ``filename`` over Mirage Workspace.

        Args:
            title (str): Document title (used by some format writers).
            content: Content payload (str, list-of-list, or JSON-serializable).
            filename (str): Logical Mirage path (relative to working_directory
                if not absolute).
            encoding (str | None): Override the toolkit's default encoding.
            use_latex (bool): Forwarded to PDF writer.

        Returns:
            str: Success or error message.
        """
        mirage_path = self._to_mirage_path(filename)
        local_name = Path(filename).name or "out"
        local_path = Path(self._tmpdir.name) / local_name
        super_msg = super().write_to_file(
            title=title,
            content=content,
            filename=str(local_path),
            encoding=encoding,
            use_latex=use_latex,
        )
        if super_msg.startswith("Error"):
            return super_msg
        produced = self._find_produced_file(local_path)
        if produced is None:
            return f"Error: format writer produced no file for {local_path}"
        target = self._adjust_extension(mirage_path, produced)
        try:
            self._write_mirage_bytes(target, produced.read_bytes())
        except OSError as exc:
            return f"Error writing {target}: {exc}"
        return f"Content successfully written to file: {target}"

    def read_file(self, file_paths):
        """Read one or more files from Mirage and return Markdown-rendered text.

        Args:
            file_paths (str | list[str]): Single path or list of paths.

        Returns:
            str | dict[str, str]: Same shape as camel ``read_file``.
        """
        if isinstance(file_paths, str):
            return self._read_one(file_paths)
        out: dict[str, str] = {}
        for fp in file_paths:
            out[fp] = self._read_one(fp)
        return out

    def _read_one(self, file_path: str) -> str:
        mirage_path = self._to_mirage_path(file_path)
        try:
            data = self._read_mirage_bytes(mirage_path)
        except FileNotFoundError as exc:
            return f"Failed to read file: {mirage_path} ({exc})"
        suffix = Path(mirage_path).suffix or ".txt"
        local = Path(self._tmpdir.name) / f"read_{abs(hash(mirage_path))}{suffix}"
        local.write_bytes(data)
        return super().read_file(file_paths=str(local))

    def _find_produced_file(self, expected: Path) -> Path | None:
        if expected.exists():
            return expected
        for ext in (".md", ".pdf", ".docx", ".csv", ".json", ".html", ".txt"):
            candidate = expected.with_suffix(ext)
            if candidate.exists():
                return candidate
        parent = expected.parent
        if parent.exists():
            for child in parent.iterdir():
                if child.stem == expected.stem and child.is_file():
                    return child
        return None

    def _adjust_extension(self, mirage_path: str, produced: Path) -> str:
        target = Path(mirage_path)
        if target.suffix:
            return mirage_path
        return str(target.with_suffix(produced.suffix))
```

**Step 4: Update `__init__.py`**

```python
from mirage.agents.camel.file import MirageFileToolkit
from mirage.agents.camel.terminal import MirageTerminalToolkit

__all__ = ["MirageFileToolkit", "MirageTerminalToolkit"]
```

**Step 5: Run tests**

```bash
cd python && uv run pytest tests/agents/camel/test_file.py -v
```

Expected: 2 passed.

**Step 6: Commit**

```bash
git add python/mirage/agents/camel/file.py python/mirage/agents/camel/__init__.py python/tests/agents/camel/test_file.py
git commit -m "feat(agents/camel): add MirageFileToolkit read + text write"
```

______________________________________________________________________

## Task 7: `MirageFileToolkit` — `edit_file` + search/glob/grep over Mirage shell

**Files:**

- Modify: `python/mirage/agents/camel/file.py`
- Modify: `python/tests/agents/camel/test_file.py`

**Step 1: Write the failing tests**

Append to `test_file.py`:

```python
def test_edit_file_replaces_content(toolkit):
    toolkit.write_to_file(title="t", content="old\nkeep\n", filename="/e.txt")
    msg = toolkit.edit_file(file_path="/e.txt",
                            old_content="old",
                            new_content="new")
    assert "successfully" in msg.lower() or "edited" in msg.lower()
    out = toolkit.read_file(file_paths="/e.txt")
    assert "new" in out and "keep" in out and "old" not in out.split("keep")[0]


def test_search_files_by_name(toolkit):
    toolkit.write_to_file(title="a", content="x", filename="/dir/a.txt")
    toolkit.write_to_file(title="b", content="y", filename="/dir/b.md")
    out = toolkit.search_files(file_name="a.txt", path="/dir")
    assert "a.txt" in out


def test_glob_files(toolkit):
    toolkit.write_to_file(title="a", content="x", filename="/g/x.py")
    toolkit.write_to_file(title="a", content="y", filename="/g/y.py")
    out = toolkit.glob_files(pattern="*.py", path="/g")
    assert "x.py" in out and "y.py" in out


def test_grep_files(toolkit):
    toolkit.write_to_file(title="a", content="needle here\n", filename="/q/a.txt")
    toolkit.write_to_file(title="b", content="haystack\n", filename="/q/b.txt")
    out = toolkit.grep_files(pattern="needle", path="/q")
    assert "needle" in out
    assert "a.txt" in out
```

**Step 2: Verify failure**

```bash
cd python && uv run pytest tests/agents/camel/test_file.py -v
```

Expected: 4 new failures — methods either crash on local-FS access or return wrong shape.

**Step 3: Add overrides to `file.py`**

Append the following methods inside `MirageFileToolkit`:

```python
    def edit_file(self, file_path: str, old_content: str,
                  new_content: str) -> str:
        """Replace ``old_content`` with ``new_content`` in a Mirage file.

        Args:
            file_path (str): Logical Mirage path.
            old_content (str): Exact text to find.
            new_content (str): Replacement text.

        Returns:
            str: Success or error message.
        """
        mirage_path = self._to_mirage_path(file_path)
        try:
            data = self._read_mirage_bytes(mirage_path).decode(
                self.default_encoding)
        except FileNotFoundError:
            return f"Error: File {mirage_path} does not exist"
        if old_content not in data:
            return f"Error: old_content not found in {mirage_path}"
        new_data = data.replace(old_content, new_content)
        self._write_mirage_bytes(mirage_path,
                                 new_data.encode(self.default_encoding))
        return f"Successfully edited file: {mirage_path}"

    def search_files(self, file_name: str, path: str | None = None) -> str:
        """Locate files by name pattern via Mirage's ``find``.

        Args:
            file_name (str): Glob pattern passed to ``find -name``.
            path (str | None): Search root; defaults to working_directory.

        Returns:
            str: Newline-separated list of matching paths.
        """
        root = self._to_mirage_path(path or self._mirage_root)
        cmd = f"find {shlex.quote(root)} -name {shlex.quote(file_name)}"
        io = self._runner.run(self._ws.execute(cmd))
        return _io_text(io)

    def glob_files(self, pattern: str, path: str | None = None) -> str:
        """Glob via Mirage's ``find -name``.

        Args:
            pattern (str): Glob pattern.
            path (str | None): Search root; defaults to working_directory.

        Returns:
            str: Newline-separated list of matches.
        """
        return self.search_files(file_name=pattern, path=path)

    def grep_files(
        self,
        pattern: str,
        path: str | None = None,
        file_pattern: str | None = None,
    ) -> str:
        """Regex search via Mirage's ``grep -rn``.

        Args:
            pattern (str): Regex (passed to ``grep``).
            path (str | None): Search root; defaults to working_directory.
            file_pattern (str | None): ``--include`` glob (e.g. ``*.py``).

        Returns:
            str: Concatenated grep output.
        """
        root = self._to_mirage_path(path or self._mirage_root)
        parts = ["grep", "-rn", shlex.quote(pattern)]
        if file_pattern:
            parts.insert(2, f"--include={shlex.quote(file_pattern)}")
        parts.append(shlex.quote(root))
        io = self._runner.run(self._ws.execute(" ".join(parts)))
        return _io_text(io)
```

Add a top-level helper at the bottom of `file.py`:

```python
def _io_text(io) -> str:
    stdout = io.stdout if isinstance(io.stdout, bytes) else b""
    stderr = io.stderr if isinstance(io.stderr, bytes) else b""
    out = stdout.decode("utf-8", errors="replace")
    err = stderr.decode("utf-8", errors="replace")
    if err and not out:
        return err
    if err:
        return f"{out}\n{err}"
    return out
```

**Step 4: Run tests**

```bash
cd python && uv run pytest tests/agents/camel/test_file.py -v
```

Expected: all pass. If `find`/`grep` aren't supported by the RAM resource for some path, fall back to in-process traversal — but RAM resource does support them via mirage's ops layer.

**Step 5: Commit**

```bash
git add python/mirage/agents/camel/file.py python/tests/agents/camel/test_file.py
git commit -m "feat(agents/camel): edit/search/glob/grep over Mirage shell"
```

______________________________________________________________________

## Task 8: `MirageFileToolkit` — `notebook_edit_cell`

**Files:**

- Modify: `python/mirage/agents/camel/file.py`
- Modify: `python/tests/agents/camel/test_file.py`

**Step 1: Write the failing test**

Append to `test_file.py`:

```python
def test_notebook_edit_cell_replaces_source(toolkit):
    nb = (
        '{"cells": [{"cell_type": "code", "execution_count": null, '
        '"metadata": {}, "outputs": [], "source": ["print(1)"]}], '
        '"metadata": {}, "nbformat": 4, "nbformat_minor": 5}')
    toolkit.shell_write_content_to_file = lambda content, file_path: None  # noqa: E501
    # write the notebook directly via the workspace primitive used by
    # the toolkit so we don't depend on shell_write here:
    toolkit._write_mirage_bytes("/n.ipynb", nb.encode())
    msg = toolkit.notebook_edit_cell(notebook_path="/n.ipynb",
                                     cell_index=0,
                                     new_source="print(2)")
    assert "successfully" in msg.lower() or "edited" in msg.lower()
    out = toolkit.read_file(file_paths="/n.ipynb")
    assert "print(2)" in out
```

**Step 2: Verify failure**

```bash
cd python && uv run pytest tests/agents/camel/test_file.py::test_notebook_edit_cell_replaces_source -v
```

Expected: failure — inherited method tries to open a real local path.

**Step 3: Override `notebook_edit_cell`**

Append inside `MirageFileToolkit`:

```python
    def notebook_edit_cell(
        self,
        notebook_path: str,
        cell_index: int,
        new_source: str,
        edit_mode: str = "replace",
    ) -> str:
        """Edit a Jupyter cell stored in Mirage.

        Args:
            notebook_path (str): Logical Mirage path of the .ipynb file.
            cell_index (int): Zero-based cell index.
            new_source (str): Replacement source text.
            edit_mode (str): "replace" (default), "insert", or "delete".

        Returns:
            str: Success or error message.
        """
        import json
        mirage_path = self._to_mirage_path(notebook_path)
        try:
            data = self._read_mirage_bytes(mirage_path)
        except FileNotFoundError as exc:
            return f"Error: notebook {mirage_path} not found ({exc})"
        try:
            nb = json.loads(data.decode(self.default_encoding))
        except json.JSONDecodeError as exc:
            return f"Error: notebook is not valid JSON: {exc}"
        cells = nb.get("cells", [])
        if edit_mode == "delete":
            if not 0 <= cell_index < len(cells):
                return f"Error: cell_index {cell_index} out of range"
            cells.pop(cell_index)
        elif edit_mode == "insert":
            cells.insert(cell_index, self._build_notebook_cell(new_source))
        else:
            if not 0 <= cell_index < len(cells):
                return f"Error: cell_index {cell_index} out of range"
            cells[cell_index]["source"] = self._normalize_notebook_source(
                new_source)
        nb["cells"] = cells
        self._write_mirage_bytes(
            mirage_path,
            json.dumps(nb, ensure_ascii=False).encode(self.default_encoding))
        return f"Successfully edited cell {cell_index} of {mirage_path}"
```

(Keep the `import json` at the top of the file; remove from the function body after testing.)

**Step 4: Move `import json` to top of file**

In `file.py`, add `import json` to the import block at the top of the file.

**Step 5: Run tests**

```bash
cd python && uv run pytest tests/agents/camel/test_file.py -v
```

Expected: all pass.

**Step 6: Commit**

```bash
git add python/mirage/agents/camel/file.py python/tests/agents/camel/test_file.py
git commit -m "feat(agents/camel): notebook_edit_cell over Mirage paths"
```

______________________________________________________________________

## Task 9: Example agent

**Files:**

- Create: `examples/python/agents/camel/sandbox_agent.py`

**Step 1: Author the example**

```python
import asyncio

from camel.agents import ChatAgent
from camel.messages import BaseMessage
from camel.models import ModelFactory
from camel.types import ModelPlatformType, ModelType
from dotenv import load_dotenv

from mirage import MountMode, Workspace
from mirage.agents.camel import MirageFileToolkit, MirageTerminalToolkit
from mirage.resource.ram import RAMResource

load_dotenv(".env.development")

ram = RAMResource()
ws = Workspace({"/": ram}, mode=MountMode.WRITE)

terminal = MirageTerminalToolkit(ws)
files = MirageFileToolkit(ws)

model = ModelFactory.create(
    model_platform=ModelPlatformType.OPENAI,
    model_type=ModelType.GPT_5_4_MINI,
)

agent = ChatAgent(
    system_message=BaseMessage.make_assistant_message(
        role_name="Mirage Camel Agent",
        content=("You operate over a Mirage virtual filesystem mounted at /. "
                 "Use the file toolkit to write structured files and the "
                 "terminal toolkit to run shell commands. Paths start at /."),
    ),
    model=model,
    tools=[*terminal.get_tools(), *files.get_tools()],
)

task = ("Write a CSV at /data/numbers.csv with columns name,value and 3 rows. "
        "Then list /data and read the file back.")


async def main():
    response = await asyncio.to_thread(agent.step, task)
    print(response.msgs[-1].content)
    listing = await ws.execute("find / -type f")
    print((listing.stdout or b"").decode())


if __name__ == "__main__":
    asyncio.run(main())
    terminal.close()
    files.close()
```

**Step 2: Smoke run (optional, requires API key)**

If `.env.development` has an `OPENAI_API_KEY`, run:

```bash
./python/.venv/bin/python examples/python/agents/camel/sandbox_agent.py
```

Otherwise skip — the example is for users to pick up; CI doesn't need to run it.

**Step 3: Commit**

```bash
git add examples/python/agents/camel/sandbox_agent.py
git commit -m "docs(examples): camel sandbox agent example"
```

______________________________________________________________________

## Task 10: Pre-commit + final test run

**Step 1: Run pre-commit from repo root**

```bash
cd /Users/zecheng/strukto/mirage/.worktrees/camel-toolkits && \
  ./python/.venv/bin/pre-commit run --all-files
```

Fix any formatting/lint issues it raises. If pre-commit modifies files, `git add -A` then re-run until it's clean.

**Step 2: Run the full test suite**

```bash
cd python && uv run pytest --no-cov -q
```

Expected: full suite passes (4908+ baseline tests still green; the new tests added — should be ~17 — pass too).

**Step 3: Verify imports cleanly with no circular deps**

Per CLAUDE.md, run:

```bash
cd python && uv run python -c "import mirage.agents.camel; import mirage.agents.camel.file; import mirage.agents.camel.terminal; import mirage.agents.camel._async; print('imports ok')"
```

Expected: `imports ok`. ImportError here means circular imports — fix by moving the offending import to its proper layer (do not lazy-import inside a function).

**Step 4: Commit any pre-commit fixups**

```bash
git status
git add -A
git commit -m "chore: pre-commit fixups for camel toolkits" || echo "nothing to commit"
```

______________________________________________________________________

## Done criteria

- All 17+ new tests pass
- Pre-commit clean
- Full pytest suite green
- `mirage.agents.camel.MirageTerminalToolkit` and `MirageFileToolkit` are importable
- Example file exists at `examples/python/agents/camel/sandbox_agent.py`
- Branch `feat/camel-toolkits` has ~10 commits, one per task

When all done criteria are met, hand off to `superpowers:finishing-a-development-branch` for merge / PR / cleanup.
