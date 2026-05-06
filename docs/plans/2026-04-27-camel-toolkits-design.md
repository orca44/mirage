# CAMEL-AI Toolkits Integration — Design

**Goal:** Provide first-class CAMEL-AI integration so a `camel.agents.ChatAgent` can use Mirage's virtual filesystem through camel's standard toolkit API. Ship `MirageTerminalToolkit` and `MirageFileToolkit` that mirror camel's `TerminalToolkit` / `FileToolkit` function surfaces but route everything through a Mirage `Workspace` — so agents can read, write, and shell over S3 / GDrive / Slack / Redis mounts the same way they shell over a local working directory.

## Scope

In scope:

- New subpackage `mirage/agents/camel/` with `MirageTerminalToolkit` and `MirageFileToolkit`
- New `camel` extra in `pyproject.toml` (`camel-ai>=0.2.40`)
- One example at `examples/python/agents/camel/sandbox_agent.py`
- Unit tests covering both toolkits with a `RAMResource` workspace

Out of scope (deferred):

- Other camel toolkits (browser, audio/image, search, social) — they don't benefit from a VFS
- Live PTY behavior (`shell_write_to_process` against a running job) — would require extending Mirage `JobTable` with a stdin queue + streaming stdout buffer; that's a mirage-core change, not a toolkit change. The function exists for API compatibility and returns a clear "not supported" message.
- Camel's `safe_mode`, docker backend, env-cloning, and dependency-install features. Mirage Workspace already isolates; those camel features are dropped on purpose.

## Package layout

```
python/mirage/agents/camel/
├── __init__.py        # re-exports MirageTerminalToolkit, MirageFileToolkit
├── terminal.py        # MirageTerminalToolkit(BaseToolkit)
└── file.py            # MirageFileToolkit(camel.toolkits.FileToolkit)

examples/python/agents/camel/
└── sandbox_agent.py
```

`pyproject.toml` adds:

```toml
camel = ["camel-ai>=0.2.40"]
```

…and `mirage-ai[camel]` is added to the `all` meta-extra.

If `camel-ai` is missing, the import errors propagate naturally — same pattern as the existing `redis` / `openhands` integrations. No defensive try/except at import time.

## `MirageTerminalToolkit` — design

**API surface mirrors camel's `TerminalToolkit` exactly** so any agent already trained on camel's tool descriptions works unchanged:

```python
class MirageTerminalToolkit(BaseToolkit):
    def __init__(self, workspace: Workspace, timeout: float | None = 20.0) -> None: ...

    def shell_exec(self, id: str, command: str, block: bool = True,
                   timeout: float = 20.0) -> str: ...
    def shell_view(self, id: str) -> str: ...
    def shell_write_to_process(self, id: str, command: str) -> str: ...
    def shell_kill_process(self, id: str) -> str: ...
    def shell_ask_user_for_help(self, id: str, prompt: str) -> str: ...
    def shell_write_content_to_file(self, content: str, file_path: str) -> str: ...

    def get_tools(self) -> list[FunctionTool]: ...
```

### Behavior mapping

Mirage's bash already supports `&`, `wait %N`, `kill %N`, `jobs`, `ps` via [`JobTable`](../../python/mirage/shell/job_table.py) and [`handle_background`](../../python/mirage/workspace/executor/jobs.py). The toolkit translates camel's string-id session model onto Mirage's int-id job model with a single `dict[str, int]`.

| Camel call                                   | Mirage translation                                                                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `shell_exec(id, cmd, block=True)`            | `await ws.execute(cmd)` → format stdout+stderr                                                                                          |
| `shell_exec(id, cmd, block=False)`           | `await ws.execute(f"{cmd} &")`, parse `[N]` from stderr, store `_sessions[id]=N`                                                        |
| `shell_view(id)`                             | look up int id; if running → run `jobs` for status; if done → `wait %N` for full stdout                                                 |
| `shell_kill_process(id)`                     | `await ws.execute(f"kill %{N}")`, drop from `_sessions`                                                                                 |
| `shell_write_to_process(id, input)`          | returns `"Mirage shell is not interactive — relaunch the command with stdin redirected (e.g. `cmd \<<EOF\\n...\\nEOF`)."`               |
| `shell_ask_user_for_help(id, prompt)`        | logs the prompt and returns a placeholder; real-user prompting is the agent framework's job                                             |
| `shell_write_content_to_file(content, path)` | `await ws.execute(f"cat > {shlex.quote(path)}", stdin=content.encode())` — uses `Workspace.execute`'s existing `stdin: bytes` parameter |

### Internal state

```python
self._ws: Workspace
self._sessions: dict[str, int]   # camel string id -> Mirage JobTable id
```

No threading. No subprocess management. No log files. Mirage Workspace owns all execution state.

## `MirageFileToolkit` — design

**Subclass camel's `FileToolkit`** to inherit the 7 public methods *and* every format writer (PDF / DOCX / JSON / CSV / HTML / ipynb / plain text) for free:

```python
class MirageFileToolkit(FileToolkit):
    def __init__(self, workspace: Workspace, working_directory: str = "/", **kwargs):
        super().__init__(working_directory=working_directory, **kwargs)
        self._ws = workspace
```

### What we override

The minimal set of internal helpers that touch the local disk. Everything else (format-specific writers, markdown parsing, table rendering, font registration, etc.) is inherited unchanged.

| Inherited method                                                                     | Override strategy                                                                                                                                              |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_resolve_filepath`, `_resolve_existing_filepath`                                    | resolve to a logical Mirage path (returned as `Path`, not actually used to touch disk)                                                                         |
| `_write_simple_text_file`, `_write_text_file`, `_write_csv_file`, `_write_json_file` | render content in memory → push bytes via `await ws.execute(f"cat > {path}", stdin=...)`                                                                       |
| `_write_docx_file`, `_write_pdf_file`                                                | **temp-file trick**: let camel's writer produce the format in a local `tempfile.NamedTemporaryFile`, then read the bytes back and push to Mirage               |
| `read_file`                                                                          | binary formats: pull bytes via Mirage → write to tempfile → call `super().read_file()` on tempfile path. Text formats: `await ws.execute(f"cat {path}")`       |
| `search_files`, `glob_files`                                                         | `await ws.execute(f"find ... -name ...")` — pushdown into Mirage's bash                                                                                        |
| `grep_files`                                                                         | `await ws.execute(f"grep -n ... {paths}")`                                                                                                                     |
| `edit_file`                                                                          | read via Mirage → apply edit in memory → write back via Mirage. Skip camel's local-FS backup logic; rely on Mirage `history`                                   |
| `notebook_edit_cell`                                                                 | read .ipynb bytes via Mirage → mutate JSON → write back. Reuses camel's `_normalize_notebook_source` / `_build_notebook_cell` for parity with camel's behavior |

### Risk

Subclassing depends on camel's private helper names (`_resolve_filepath`, `_write_text_file`, etc.) staying stable across releases. Mitigations:

- Pin camel via `camel-ai>=0.2.40,<0.3` in the extra
- Add a unit test that verifies all expected hooks exist on import (catches breaking camel renames at test time, not runtime)

## Sync/async bridge

Camel's `BaseToolkit` expects sync methods. `Workspace.execute()` is async. Both toolkits share one helper:

```python
def _run_async(coro):
    """Run an async coroutine from a sync method.

    Uses the existing event loop if one is running (via a worker thread +
    run_coroutine_threadsafe); otherwise creates a fresh loop. Avoids the
    'asyncio.run() from a running loop' pitfall called out in CLAUDE.md.
    """
```

Implementation: lazy-create a single dedicated worker thread + event loop on first call, cache it on the toolkit instance, run all async work via `asyncio.run_coroutine_threadsafe(coro, self._loop).result(timeout)`.

This pattern is robust to being called from inside an outer async event loop (e.g. when camel's `ChatAgent` is itself awaited in an async app).

## Example: `examples/python/agents/camel/sandbox_agent.py`

Mirrors the existing `examples/python/agents/openai_agents/ram_agent.py` structure:

1. `load_dotenv(".env.development")` from repo root
1. `RAMResource` mounted at `/` with `MountMode.WRITE`
1. Build a camel `ChatAgent` with `MirageTerminalToolkit(ws).get_tools() + MirageFileToolkit(ws).get_tools()`
1. Run a task that creates `/hello.txt`, makes `/data/`, writes `/data/numbers.csv`, lists files, prints them
1. Print `ws.ops.records` summary at the end (same observability as the openai_agents example)

Run with `./python/.venv/bin/python examples/python/agents/camel/sandbox_agent.py` per CLAUDE.md.

## Testing

- `tests/agents/camel/test_terminal.py` — exercises every `shell_*` method against a `RAMResource` workspace; verifies `shell_exec` blocking + non-blocking flows, `shell_view`, `shell_kill_process`, the str-id ↔ int-job-id mapping
- `tests/agents/camel/test_file.py` — exercises every public method: write+read for txt/json/csv/md, `glob_files`, `grep_files`, `search_files`, `edit_file`, `notebook_edit_cell`. PDF/DOCX use the temp-file path
- `tests/agents/camel/test_compat.py` — guard test that imports camel's `FileToolkit` and asserts the private hooks we override (`_resolve_filepath`, `_write_text_file`, …) still exist. Catches breaking camel releases at CI time

No network or API-key tests — all tests use `RAMResource`.

## Out-of-scope follow-ups

- Live PTY: extend `JobTable` with a streaming stdout buffer + stdin queue, then upgrade `shell_write_to_process` and `shell_view` to true tail/write semantics. Separate plan.
- Other camel toolkits (`code_execution`, `markitdown`, `retrieval`) — viable VFS fits, but each is its own scope.
- Mount-aware path mapping: today the toolkit assumes the `Workspace`'s path namespace is what the agent sees. If users want to expose only a sub-mount (`/s3/`) to the toolkit, add a `working_directory` filter. Already present on `FileToolkit`; needs threading through to the terminal toolkit if useful.
