# Workspace runner, server, and CLI

**Context:** Today every consumer of Mirage constructs a `Workspace`
in-process and runs it on whatever event loop the host happens to be
using. That works for single-loop scripts and for the OpenAI Agents
sandbox integration. It does not cover three real workflows:

1. **Embedding in an existing async app** (FastAPI, aiohttp, anything
   with its own running loop) where you want the workspace's slow /
   blocking ops not to stall the host loop.
1. **A long-running agent fleet** that wants to share a workspace
   across many short-lived agent processes -- so cache stays warm and
   FUSE doesn't get re-mounted on every `python` invocation.
1. **A human operator** who wants to poke at a workspace from the
   shell: `mirage execute "ls /s3"` without writing Python.

The plan introduces three layered surfaces, lowest-to-highest:

| Layer                              | What it is                                                                                   | Who uses it                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **`Workspace`** (today)            | the kernel object                                                                            | direct in-process use, single-loop apps                                 |
| **`WorkspaceRunner`** (new)        | workspace pinned to its own thread + event loop, with an `await runner.call(coro)` interface | any app with an outer loop -- your FastAPI, the Mirage daemon, anything |
| **`mirage daemon`** (new, FastAPI) | thin REST shell over a `dict[workspace_id, WorkspaceRunner]`                                 | the Mirage CLI, remote / cross-process clients                          |
| **`mirage` CLI** (new, typer)      | typer commands; thin httpx client over the daemon                                            | humans, scripts                                                         |

`WorkspaceRunner` is the library primitive. Anyone embedding Mirage in
their own async app uses it directly. The daemon is one consumer of
it -- one process holding many runners, exposed over HTTP. The CLI is
one consumer of the daemon, an httpx wrapper.

**Both runner and FastAPI are required, for distinct reasons.** The
runner gives per-workspace isolation inside the daemon process (one
stuck workspace doesn't freeze the others or the HTTP server). FastAPI
gives the CLI -- and any future TS / Go / remote agent -- a way to
reach the daemon.

**Workspace lifecycle is fully explicit.** `mirage workspace --create`
spawns a runner that lives until `mirage workspace --delete` or the
daemon stops. No auto-launch on `mirage execute`, no implicit cleanup
by config hash. Same model as `docker container create` + `docker exec`. The one piece of magic: the *daemon process* itself
auto-spawns on the first `mirage workspace --create` if it isn't
already running, so users never have to think about the daemon as an
object -- only about workspaces.

Out of scope: auth model beyond a shared bearer token, multi-host
clustering, web UI, billing / quotas. Those are separate plans.

______________________________________________________________________

## `WorkspaceRunner`: the library primitive

`WorkspaceRunner` is the lowest layer added by this plan. Everything
else (the daemon, the CLI's daemon-backed mode, third-party embeds)
sits on top of it.

The contract:

- A `WorkspaceRunner` owns one `Workspace`, one daemon thread, and
  one `asyncio` event loop running inside that thread (call it the
  *workspace loop*).
- The `Workspace` only ever runs on its own loop -- never on the
  caller's.
- The caller dispatches work via `await runner.call(coro)`, which is
  safe to call from any other event loop. Internally:
  `asyncio.run_coroutine_threadsafe(coro, runner.loop)` to schedule,
  `asyncio.wrap_future(fut)` to await without blocking the caller's
  loop.

```python
class WorkspaceRunner:
    def __init__(self, ws: Workspace) -> None:
        self.ws = ws
        self.loop = asyncio.new_event_loop()
        self._thread = threading.Thread(
            target=self._run, name=f"ws-{ws.id}", daemon=True)
        self._thread.start()

    def _run(self) -> None:
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    async def call(self, coro: Coroutine) -> Any:
        fut = asyncio.run_coroutine_threadsafe(coro, self.loop)
        return await asyncio.wrap_future(fut)

    async def stop(self) -> None:
        await self.call(self.ws.close())
        self.loop.call_soon_threadsafe(self.loop.stop)
        await asyncio.to_thread(self._thread.join)
        self.loop.close()
```

### Embedding in your own FastAPI app

The runner is designed for this. Your FastAPI app keeps its main loop;
the workspace runs on its own thread+loop; handlers dispatch in:

```python
from fastapi import FastAPI
from mirage import Workspace, WorkspaceRunner, MountMode
from mirage.resource.s3 import S3Resource, S3Config

app = FastAPI()

@app.on_event("startup")
async def startup() -> None:
    ws = Workspace({"/s3": (S3Resource(S3Config(...)), MountMode.READ)})
    app.state.runner = WorkspaceRunner(ws)

@app.on_event("shutdown")
async def shutdown() -> None:
    await app.state.runner.stop()

@app.get("/list/{path:path}")
async def list_path(path: str) -> dict:
    runner = app.state.runner
    result = await runner.call(runner.ws.execute(f"ls /{path}"))
    return {"stdout": (result.stdout or b"").decode()}
```

This is the answer to "if I have FastAPI, can I create another event
loop to serve the workspace separately?" -- yes, and `WorkspaceRunner`
is the supported way to do it. No daemon, no HTTP, just the library.

### Why thread-per-workspace and not one shared loop

A shared loop would be ~30 LOC less plumbing. We pay the plumbing tax
for real isolation:

- A blocking syscall, a CPU-stall in pure Python (parquet decode,
  large JSON parse, regex over a giant buffer), or a runaway coroutine
  in workspace A cannot stall workspace B / the host app's loop. With
  a shared loop, every blocking call has to be perfectly routed
  through `asyncio.to_thread` -- edge cases will slip through.
- One workspace's bug (deadlock, infinite await) does not freeze
  anything else. Worst case the host kills that one runner thread.
- Matches the mental model: a workspace is an independent unit, like
  a process.
- Loops are cheap. One thread + one loop per workspace, even at 100
  workspaces, is rounding error compared to resource state and cache.

### Why thread-per-workspace and not subprocess-per-workspace

Subprocess gives stronger isolation but:

- Forces tar-snapshot IPC for every call -- defeats caching.
- Cannot share file descriptors (the FUSE mount is process-local).
- Hard fork-safety story for cloud SDK clients (boto3, aiohttp).

If we ever need that, v2 swaps the runner backend to subprocess.
Public surface (`runner.call(coro)`, the REST API) stays identical.

______________________________________________________________________

## Daemon process model

The Mirage-shipped daemon is one consumer of `WorkspaceRunner`:

- A single `uvicorn` process hosts the FastAPI app on its server loop.
- The process holds a `dict[workspace_id, WorkspaceRunner]` -- the
  workspace registry. One runner per workspace, each with its own
  thread + loop, exactly as above.
- Every router handler is a one-liner over `runner.call(...)`:

```python
@router.post("/v1/workspaces/{ws_id}/execute")
async def execute(ws_id: str, req: ExecuteRequest) -> IOResult:
    runner = registry.require(ws_id)
    return await runner.call(
        runner.ws.execute(req.command, session_id=req.session_id,
                          plan=req.plan))
```

### Sync vs background execution

There is no SSE streaming in v1. Execution is one of two modes:

- **Sync** (default). `POST /v1/workspaces/{id}/execute` blocks on the
  daemon side until the command completes, returns `IOResult` as JSON.
  The CLI prints the JSON. This is the everyday path.
- **Background**. `POST /v1/workspaces/{id}/execute?background=true`
  schedules the work on the runner's loop, immediately returns
  `{job_id, ...}`. The job runs to completion in the background; the
  client polls / waits via `GET /v1/jobs/{job_id}` or
  `POST /v1/jobs/{job_id}/wait`.

Streaming live stdout / stderr can come back as a v2 add-on if anyone
asks; sync + background covers every concrete use case we have today
without dragging in `janus`, SSE plumbing, or cross-loop chunk
forwarding.

### Cancellation: the job table

Every `runner.call(coro)` registers the returned
`concurrent.futures.Future` in a daemon-wide job table keyed by job id.
The job id is returned to clients in two ways: as `job_id` in the
background response, and as a header (`X-Mirage-Job-Id`) on sync
responses so the CLI can fire `DELETE /v1/jobs/{job_id}` from a
Ctrl-C handler even on a sync call. Cancel calls `future.cancel()` on
the server loop, which propagates `CancelledError` into the workspace
loop's task.

______________________________________________________________________

## Workspace lifecycle in the daemon

Each workspace flows through this state machine:

```
create  ─────►  ACTIVE  ─────►  CLOSED  ─────►  (gc'd)
           │        ▲
           │        │ clone
           ▼        │
        snapshot ───┘
```

- **`create(config)`** -- daemon parses the YAML/JSON config, builds
  resources via the registry, constructs a `Workspace`, wraps it in a
  `WorkspaceRunner` (own thread + own loop), registers under a fresh
  ULID. Returns the id and a summary (mounts, mode, sync policy).
- **`clone(id, override?)`** -- the cloned workspace gets its own
  runner = its own thread + its own event loop. Cloning rebuilds every
  resource from its saved config, so the clone has fully independent
  state -- fresh resource instances, fresh connection pools, fresh
  RAM/Disk backings. No shared mutable objects between original and
  clone, which sidesteps the cross-loop-aiohttp-session class of bug
  entirely. Optional `override` is a partial config (same schema as
  create) that lets the caller swap in different resource configs --
  e.g. point the clone at a different S3 bucket. Returns the new id.
- **`snapshot(id) -> bytes`** -- returns the workspace as a tar via
  the existing `Workspace.save` machinery. Cloud creds are redacted
  with `"<REDACTED>"` per the snapshot policy.
- **`load(tar, override?) -> id`** -- restores via `Workspace.load`.
  Optional `override` is a partial-config YAML that supplies fresh
  creds for redacted resources and any other config replacements. The
  override file is the SAME schema as the create config -- one mental
  model.
- **`delete(id)`** -- calls `await runner.stop()`, drops from
  registry. Stop = await `ws.close()` (flush, close FUSE, etc.) +
  stop the runner's loop + join the runner's thread.

### Daemon idle-shutdown

When the workspace count hits zero, the daemon does not exit
immediately. It starts a 30-second grace timer (configurable via
`~/.mirage/config.toml` `idle_grace_seconds`). If a new
`workspace --create` arrives before the timer fires, the timer is
canceled. If the timer fires, the daemon exits cleanly.

This absorbs the churn case (delete the only workspace, immediately
create a new one) without paying the ~250ms respawn cost. Set
`idle_grace_seconds = 0` to get strict "exit immediately when empty"
behavior. Set to a large value to effectively pin the daemon alive.

### Persist-on-shutdown (v1)

When `persist_dir` is configured in `~/.mirage/config.toml`, the
daemon snapshots every active workspace on exit and rehydrates them
from the same paths on next start. Off by default; opt in with one
config line.

**On shutdown:**

- For each `runner` in the registry, call `runner.ws.save(<persist_dir>/<id>.tar)`.
- Write a manifest at `<persist_dir>/index.json` mapping workspace
  id -> tar filename + saved-at timestamp.
- Cloud resource creds are redacted in the snapshot per the existing
  policy.

**On startup:**

- Read `<persist_dir>/index.json`. For each entry:
  - Look for a paired `<persist_dir>/<id>.override.yaml`. If
    present, parse it as a partial `WorkspaceConfig` (env
    interpolation applies).
  - Call `Workspace.load(<id>.tar, resources=overrides_to_resources(override))`.
  - Wrap in a fresh `WorkspaceRunner`; register under the same id.
- Failures during one workspace's restore are logged at WARN, that
  workspace is skipped, the daemon continues with the rest. No
  partial restoration -- a workspace either fully comes back or is
  absent.

**Override file convention:**

```yaml
# <persist_dir>/ws_01HX....override.yaml
mounts:
  /s3:
    config:
      aws_access_key_id: ${AWS_ACCESS_KEY_ID}
      aws_secret_access_key: ${AWS_SECRET_ACCESS_KEY}
  /redis:
    config:
      url: ${REDIS_URL}
```

User maintains the override file out-of-band (e.g. checked into a
private repo); env vars supply the actual secrets at daemon-startup
time. If no override file exists for a workspace with redacted
resources, that workspace fails to restore (logged + skipped) -- the
daemon does NOT attempt to invent or guess creds.

______________________________________________________________________

## Config file: shape

The config the daemon accepts maps 1-to-1 onto the `Workspace`
constructor. Either YAML or JSON works; the loader is shared.

```yaml
# full shape -- everything except `mounts:` is optional
mode: WRITE                  # MountMode for unspecified mounts
sync_policy: STAGED          # STAGED | EAGER | NONE
consistency: LAZY            # LAZY | STRICT
default_session_id: default
default_agent_id: default
fuse: false
native: false
history: 100

# workspace-wide file cache
cache:
  type: ram                  # ram | redis
  limit: 512MB
  max_drain_bytes: 10485760  # optional; drain segmentation threshold
  # if type: redis, also:
  # url: redis://localhost:6379/0
  # key_prefix: "mirage:cache:"

mounts:
  /:
    resource: ram
    mode: WRITE
    # no `index:` -- RAM resource doesn't use one
  /s3:
    resource: s3
    mode: READ
    config:
      bucket: my-bucket
      region: us-east-1
      aws_access_key_id: ${AWS_ACCESS_KEY_ID}
      aws_secret_access_key: ${AWS_SECRET_ACCESS_KEY}
    index:                   # per-mount index cache (optional)
      type: redis            # ram | redis
      ttl: 600
      url: redis://localhost:6379/0
      key_prefix: "mirage:index:s3:"
  /gdrive:
    resource: gdrive
    mode: READ
    config: { ... }
    # omit `index:` to get the default RAM index with the resource's
    # default TTL
  /custom:
    resource: pkg.module:MyResource     # third-party via loader.py
    mode: READ
    config:
      foo: bar
```

The minimal "just works" config stays tiny -- omit `cache:` to get
`CacheConfig()` (RAM, 512MB), omit `index:` on a mount to get
`IndexConfig(ttl=resource._index_ttl)` (RAM):

```yaml
mounts:
  /:
    resource: ram
  /s3:
    resource: s3
    config: { bucket: ..., region: ..., aws_access_key_id: ..., ... }
```

**Conventions:**

- `resource:` is either a `ResourceName` enum value (`ram`, `disk`,
  `s3`, ...) or a `module:Class` spec handled by
  `mirage.resource.loader.load_backend_class` (already exists).
- `config:` is the kwargs dict for that resource's `Config` dataclass.
  Each resource already has one (`S3Config`, `SlackConfig`, ...) -- the
  loader validates by instantiating the dataclass.
- `cache:` and `index:` use pydantic discriminated unions on the
  `type:` field -- `ram` selects `CacheConfig` / `IndexConfig`,
  `redis` selects `RedisCacheConfig` / `RedisIndexConfig`. Wrong
  fields for the chosen type fail validation cleanly.
- `${VAR}` substitution from the daemon process environment. No shell
  interpolation, no command execution.
- Missing required env vars: fail at create-time with a 400 listing
  every missing var, not lazily at first use.

A resource lookup table (`ResourceName -> (Resource class, Config class)`) goes in a new `mirage/resource/registry.py`. Today this
mapping is implicit -- every example does it inline. Centralizing it
both unblocks the daemon and removes the duplication.

______________________________________________________________________

## REST API surface

Versioned under `/v1`. JSON request/response except where noted.

### Workspaces

| Method | Path                           | Body                                                | Returns             |
| ------ | ------------------------------ | --------------------------------------------------- | ------------------- |
| POST   | `/v1/workspaces`               | `WorkspaceConfig`                                   | `WorkspaceDetail`   |
| GET    | `/v1/workspaces`               | --                                                  | `[WorkspaceBrief]`  |
| GET    | `/v1/workspaces/{id}`          | `?verbose=true` for extra internals                 | `WorkspaceDetail`   |
| DELETE | `/v1/workspaces/{id}`          | --                                                  | `{id, closed_at}`   |
| POST   | `/v1/workspaces/{id}/clone`    | `{id?, override?: WorkspaceConfig}`                 | `WorkspaceDetail`   |
| POST   | `/v1/workspaces/{id}/sync`     | `{}`                                                | `{flushed: int}`    |
| GET    | `/v1/workspaces/{id}/snapshot` | --                                                  | `application/x-tar` |
| POST   | `/v1/workspaces/load`          | `multipart` (`tar` part + optional `override` JSON) | `WorkspaceDetail`   |

`override` on `clone` and `load` is a partial `WorkspaceConfig`
(same schema as create). Only the keys present in the override are
applied -- e.g. swapping the bucket on `/s3` while leaving every
other mount untouched.

**`WorkspaceBrief`** -- the cheap shape `--list` returns. One line
per workspace, no mount details:

```json
{
  "id": "ws_01HXABCDEFGHJKMNPQRSTVWXYZ",
  "mode": "WRITE",
  "mount_count": 3,
  "session_count": 2,
  "created_at": "2026-04-17T12:34:56Z"
}
```

**`WorkspaceDetail`** -- the full shape `--get` returns. Everything
in `WorkspaceBrief` plus per-mount details:

```json
{
  "id": "ws_01HXABCDEFGHJKMNPQRSTVWXYZ",
  "mode": "WRITE",
  "created_at": "2026-04-17T12:34:56Z",
  "sessions": [
    {"session_id": "default", "cwd": "/"},
    {"session_id": "agent_a", "cwd": "/s3"}
  ],
  "mounts": [
    {
      "prefix": "/",
      "resource": "ram",
      "mode": "WRITE",
      "description": "In-memory tmpfs..."
    },
    {
      "prefix": "/s3",
      "resource": "s3",
      "mode": "READ",
      "description": "S3 bucket: my-bucket (region: us-east-1)"
    }
  ]
}
```

`description` comes from each resource's `PROMPT` constant (the
same text the LLM sees) plus a one-line interpolation of identifying
config (bucket name, base URL, etc.). Truncated to ~120 chars per
mount.

**`WorkspaceDetail` with `?verbose=true`** -- adds debug internals
that aren't in the default `--get` payload:

```json
{
  ...everything above...,
  "internals": {
    "cache_bytes": 134217728,
    "cache_entries": 1024,
    "dirty_inodes": 3,
    "history_length": 50,
    "in_flight_jobs": 1
  }
}
```

### Sessions

| Method | Path                                        | Body            | Returns               |
| ------ | ------------------------------------------- | --------------- | --------------------- |
| POST   | `/v1/workspaces/{id}/sessions`              | `{session_id?}` | `{session_id, cwd}`   |
| GET    | `/v1/workspaces/{id}/sessions`              | --              | `[{session_id, cwd}]` |
| DELETE | `/v1/workspaces/{id}/sessions/{session_id}` | --              | `{session_id}`        |

### Execute

| Method | Path                                          | Body                                                | Returns                                     |
| ------ | --------------------------------------------- | --------------------------------------------------- | ------------------------------------------- |
| POST   | `/v1/workspaces/{id}/execute`                 | `{command, session_id?, plan?, agent_id?, native?}` | `IOResult` (or `ProvisionResult` if `plan`) |
| POST   | `/v1/workspaces/{id}/execute?background=true` | same                                                | `{job_id, workspace_id, submitted_at}`      |

Sync responses include a `X-Mirage-Job-Id` header so a Ctrl-C in the
CLI can `DELETE /v1/jobs/{job_id}` to cancel server-side.

**stdin transport.** When stdin is needed, the request body switches
to `multipart/form-data` with two parts:

- `request` (`application/json`): the same `{command, session_id?, ...}` payload.
- `stdin` (`application/octet-stream`): the raw bytes piped to the command.

```
POST /v1/workspaces/ws_01HX.../execute
Content-Type: multipart/form-data; boundary=----X
------X
Content-Disposition: form-data; name="request"
Content-Type: application/json

{"command": "wc -l", "session_id": "default"}
------X
Content-Disposition: form-data; name="stdin"
Content-Type: application/octet-stream

<raw bytes>
------X--
```

When the body is plain JSON (no multipart, no `stdin` part), no
stdin is supplied -- equivalent to `command < /dev/null`. The CLI
auto-uses multipart whenever it detects piped input on its own
stdin (`not sys.stdin.isatty()`).

### Jobs

| Method | Path                     | Body           | Returns                                                       |
| ------ | ------------------------ | -------------- | ------------------------------------------------------------- |
| GET    | `/v1/jobs`               | --             | `[{job_id, workspace_id, status, submitted_at, finished_at}]` |
| GET    | `/v1/jobs/{job_id}`      | --             | `{job_id, status, result?, error?}`                           |
| POST   | `/v1/jobs/{job_id}/wait` | `{timeout_s?}` | blocks until done; same shape as `GET`                        |
| DELETE | `/v1/jobs/{job_id}`      | --             | `{job_id, canceled: bool}`                                    |

`status` is one of `pending | running | done | failed | canceled`.

### Health

`GET /v1/health` -- `{status: "ok", workspaces: int, jobs: int, uptime_s: int}`.

______________________________________________________________________

## CLI surface

Typer (already a dep). Single root `mirage` command. Every verb is a
thin httpx call to the daemon. There is **no `mirage daemon` namespace**
-- the daemon is invisible infrastructure that auto-spawns on first
`workspace --create` and auto-exits when idle.

```bash
# ── workspace management ──────────────────────────────────────────
mirage workspace --create CONFIG.yaml      # → prints id (ULID, auto-assigned)
                       [--id NAME]         # ... or override the id
mirage workspace --list
mirage workspace --get ID
mirage workspace --delete ID
mirage workspace --clone ID [--id NAME] [--override OVERRIDES.yaml]
mirage workspace --save ID PATH.tar
mirage workspace --load PATH.tar [--id NAME] [--override OVERRIDES.yaml]

# ── sessions (per-workspace) ──────────────────────────────────────
mirage session --create WS_ID [--id NAME]
mirage session --list WS_ID
mirage session --delete WS_ID SESSION_ID

# ── execute ───────────────────────────────────────────────────────
mirage execute --workspace_id WS_ID
               [--session_id SESSION_ID]   # default: workspace's default
               [--background]              # fire-and-forget; returns job_id
               --command "ls /s3 && cat /s3/foo"

# ── provision: dry-run the same command, returns a ProvisionResult ─
mirage provision --workspace_id WS_ID
                 [--session_id SESSION_ID]
                 --command "ls /s3 && cat /s3/foo"

# ── jobs (background execute follow-ups) ──────────────────────────
mirage job --list [--workspace_id WS_ID]
mirage job --get JOB_ID
mirage job --wait JOB_ID [--timeout SECS]
mirage job --cancel JOB_ID
```

**Output format:** every command prints structured JSON to stdout.
`mirage execute` returns an `IOResult` shape; `mirage execute --background` returns `{job_id, workspace_id, submitted_at}`. Scripts
pipe to `jq`, humans read directly. No TTY-detection magic, no
streaming, no buffered-vs-live mode. One predictable shape per verb.

**Override files** (`--override OVERRIDES.yaml`) are partial workspace
configs -- same schema as create -- merged into the loaded / cloned
workspace before construction. Example, for swapping the S3 bucket
on a clone:

```yaml
# clone-overrides.yaml
mounts:
  /s3:
    config:
      bucket: ${TEST_BUCKET}
      aws_access_key_id: ${AWS_ACCESS_KEY_ID}
      aws_secret_access_key: ${AWS_SECRET_ACCESS_KEY}
```

```bash
mirage workspace --clone foo --id foo_test --override clone-overrides.yaml
```

**Daemon auto-spawn:** CLI tries the configured daemon URL. If
unreachable AND the verb is `workspace --create`, CLI fork-execs the
daemon (`uvicorn mirage.server.app:app`) detached, waits for the
healthcheck (~200ms typical), continues. Every other verb fails fast
with "no daemon running -- run `mirage workspace --create ...` to
start one." Users never type a daemon command directly.

**Workspace lifetime:** lives from `--create` until either explicit
`--delete` or the daemon's idle-shutdown timer fires (default 30s
after the workspace count hits zero -- see lifecycle section above).

______________________________________________________________________

## `~/.mirage/config.toml`

All daemon-level configuration that used to live on `mirage daemon --start` flags (port, socket, persist-dir, auth token, idle grace)
moves here. Most users never edit it.

```toml
# ~/.mirage/config.toml -- defaults shown
[daemon]
url                 = "http://127.0.0.1:8765"
socket              = ""        # if non-empty, use UDS instead of TCP
persist_dir         = ""        # if non-empty, snapshot/restore on exit/start (v1.1)
auth_token          = ""        # if non-empty, require Bearer token
idle_grace_seconds  = 30        # 0 = exit immediately when last workspace deleted
```

**Discovery order** for the daemon URL (overrides the file):

1. `--daemon URL` flag on the CLI verb
1. `MIRAGE_DAEMON_URL` env var
1. `[daemon] url` in `~/.mirage/config.toml`
1. Default `http://127.0.0.1:8765`

**Auth:** if `auth_token` is set in the config, the daemon requires
`Authorization: Bearer <token>` on every request. The CLI reads the
token from `MIRAGE_TOKEN` env var or the same config file. Mismatch =
401\.

**Socket vs port:** if `socket` is non-empty, the daemon binds a Unix
domain socket and the CLI auto-uses an httpx UDS transport. Useful
for single-user-per-machine setups where you don't want to expose a
TCP port at all.

______________________________________________________________________

## Module layout

```
mirage/
  workspace/
    runner.py         # NEW -- WorkspaceRunner; library primitive,
                      # re-exported from `mirage`
  resource/
    registry.py       # NEW -- ResourceName -> (Resource, Config) lookup
  config.py           # NEW -- YAML/JSON -> WorkspaceConfig pydantic
                      # model; usable from library, daemon, and CLI
  server/             # NEW -- the daemon
    __init__.py
    app.py            # FastAPI app factory; mounts /v1/* routers
    registry.py       # workspace_id -> WorkspaceRunner, idle-shutdown timer
    jobs.py           # in-flight job table (status, cancel, wait)
    routers/
      workspaces.py
      sessions.py
      execute.py
      jobs.py
      health.py
    schemas.py        # pydantic request/response models
    auth.py           # bearer-token middleware
  cli/                # NEW -- typer commands
    __init__.py
    main.py           # typer Typer() root
    workspace.py      # create/list/get/delete/clone/save/load
    session.py        # create/list/delete
    execute.py        # execute (sync + --background)
    job.py            # list/get/wait/cancel
    client.py         # httpx wrapper + daemon auto-spawn logic
    settings.py       # read ~/.mirage/config.toml
```

Note `runner.py` lives under `mirage/workspace/`, not `mirage/server/`.
The runner is a library primitive, available to anyone embedding
Mirage in their own async app -- not coupled to the daemon.

Entry points in `pyproject.toml`:

```toml
[project.scripts]
mirage = "mirage.cli.main:app"
```

`mirage.cli.client` spawns the daemon via `uvicorn mirage.server.app:app`
(or programmatic `uvicorn.Server` for clean shutdown hooks) when it
detects the daemon is not reachable and the verb is `workspace --create`.

______________________________________________________________________

## Open design questions

Most are decided above. Remaining for follow-up:

1. **Auth model beyond shared bearer token.** Per-workspace ACLs and
   SSO wait for actual demand.
1. **`MirageRemoteSandboxClient`** for OpenAI Agents -- HTTP-backed
   client that talks to the daemon for cross-process agent isolation.
   Same `BaseSandboxClient` interface. In-process `MirageSandboxClient`
   stays as-is. Comments now reference this in
   `mirage/agents/openai_agents/sandbox.py`. Spec lands as its own
   plan once the daemon ships.

Closed during plan iteration: stdin transport (multipart, CLI
auto-detects piped input via isatty), `persist_dir` timing (v1, with
`.override.yaml` sidecar files for cred refresh), workspace id
collision (409), summary detail level (cheap `WorkspaceBrief` for
`--list`, full `WorkspaceDetail` for `--get`, internals only with
`?verbose=true`).

______________________________________________________________________

## Tasks

Ship as 8 independent PRs. Each task is self-contained -- the
acceptance criteria for one PR don't depend on a later task landing.
Slices 1-2 ship a useful library primitive that third parties can
embed without ever starting the daemon.

### Dependency graph

```
T1 (registry) ──┬──► T3 (config loader) ──┐
                │                          ▼
T2 (runner)  ──┴──────────────────────► T4 (daemon skeleton)
                                            │
                                            ▼
                                         T5 (execute + jobs)
                                            │
                          ┌─────────────────┴─────────────────┐
                          ▼                                   ▼
                       T6 (persist-on-shutdown)            T7 (CLI)
                                                              │
                                                              ▼
                                                           T8 (auth + UDS)
```

T1 and T2 are independent and can land in parallel. T6 and T7 are
also independent of each other once T5 is in.

### T1 -- Resource registry

**Files:** `mirage/resource/registry.py` (new), `tests/resource/test_registry.py` (new).

**Scope:**

- One static `REGISTRY: dict[ResourceName, ResourceEntry]` table covering every `ResourceName` value.
- `ResourceEntry = NamedTuple(resource_cls, config_cls | None)`.
- `build_resource(name: str | ResourceName, config: dict | None = None) -> BaseResource` helper.
- All imports at module top; verify `uv run python -c "import mirage.resource.registry"` works.
- Examples are not refactored.

**Acceptance:**

- For every `ResourceName`, `REGISTRY` has an entry.
- `build_resource("ram")` returns a `RAMResource`.
- `build_resource("s3", {...full s3 config...})` returns an `S3Resource`.
- `pre-commit run --all-files` clean; `uv run pytest tests/resource/test_registry.py` passes.

**Estimate:** 0.5 days. **Depends on:** nothing.

### T2 -- `WorkspaceRunner` library primitive

**Files:** `mirage/workspace/runner.py` (new), `mirage/__init__.py` (re-export `WorkspaceRunner`), `tests/workspace/test_runner.py` (new).

**Scope:**

- `WorkspaceRunner` per the snippet in the "WorkspaceRunner" section
  above: own thread, own event loop, `runner.call(coro)`, `runner.stop()`.
- Pure library, no HTTP, no FastAPI imports.

**Acceptance:**

- `runner.call(ws.execute("echo hi"))` from a test loop returns a real `IOResult`.
- Two runners in one process: a `time.sleep(2)` inside workspace A's command does NOT delay a 50ms `ls` in workspace B (measured wall-clock).
- `runner.stop()` cleanly closes the workspace, stops the loop, joins the thread; no warnings on garbage collection.
- Third-party FastAPI embed example in `examples/embed_fastapi/` (see plan's "Embedding in your own FastAPI app" section).

**Estimate:** 2 days. **Depends on:** nothing.

### T3 -- YAML/JSON config loader

**Files:** `mirage/config.py` (new), `tests/config/test_loader.py` (new), `tests/config/fixtures/*.yaml` (new).

**Scope:**

- `WorkspaceConfig` pydantic model matching the YAML shape in the "Config file: shape" section.
- `cache:` and per-mount `index:` use discriminated unions on `type:` (ram | redis).
- `${VAR}` env interpolation throughout.
- `load_config(path) -> WorkspaceConfig` and `config.to_workspace_kwargs() -> dict` (ready to splat into `Workspace(**kwargs)`).
- `merge_override(base: WorkspaceConfig, override: dict) -> WorkspaceConfig` for partial-config overrides used by clone / load.
- Missing required env vars at load time raise with a list of every missing var (not lazy).

**Acceptance:**

- Round-trip: a hand-built `Workspace` and `Workspace(**load_config(yaml).to_workspace_kwargs())` produce equivalent objects.
- Discriminated union: `cache: {type: redis, limit: 1GB}` without `url` fails validation cleanly.
- `${VAR}` interpolation works for both top-level and nested fields.
- Missing env var = clear error listing every missing var.

**Estimate:** 1 day. **Depends on:** T1.

### T4 -- Daemon skeleton + workspaces router + idle-shutdown

**Files:** `mirage/server/__init__.py`, `app.py`, `registry.py`, `schemas.py`, `routers/workspaces.py`, `routers/health.py` (all new); `tests/server/test_workspaces_router.py` (new).

**Scope:**

- FastAPI app factory; `dict[workspace_id, WorkspaceRunner]` registry.
- Endpoints: `POST/GET/DELETE /v1/workspaces`, `POST .../clone`, `POST /v1/workspaces/load`, `POST .../sync`, `GET .../snapshot`, `GET /v1/health`.
- `WorkspaceBrief` (list shape) and `WorkspaceDetail` (get/create/clone shape, with `?verbose=true` for internals) per the REST API section.
- Mount `description` field interpolates from each resource's `PROMPT` constant + identifying config (truncated ~120 chars).
- Clone uses rebuild-from-state semantics (see lifecycle section): `to_state_dict(redact=False)` then construct fresh resources via T1's registry.
- Idle-shutdown: 30s grace timer (configurable) starts when registry empties; cancels on next create.
- Workspace id collision on `--id NAME` returns 409.

**Acceptance:**

- `httpx.AsyncClient(transport=ASGITransport(app=app))` round-trips create / get / list / delete / clone / sync.
- Concurrency: two workspaces in one daemon, A's command sleeps 2s, B's `ls` returns in \<100ms.
- Snapshot round-trip: snapshot one workspace, POST to `/load`, get a new id, verify mounts match.
- Idle-shutdown: empty registry + grace timer expiry triggers `app.state.exit_event` (test the signal, don't actually exit the test process).

**Estimate:** 2 days. **Depends on:** T1, T2, T3.

### T5 -- Sessions, execute, jobs

**Files:** `mirage/server/jobs.py`, `routers/sessions.py`, `routers/execute.py`, `routers/jobs.py` (all new); `tests/server/test_execute_router.py`, `test_jobs_router.py` (new).

**Scope:**

- Sessions endpoints: `POST/GET/DELETE /v1/workspaces/{id}/sessions`.
- Execute endpoints:
  - `POST .../execute` -- sync, JSON or multipart-with-stdin. Response has `X-Mirage-Job-Id` header.
  - `POST .../execute?background=true` -- returns `{job_id, workspace_id, submitted_at}`.
- Jobs endpoints: `GET /v1/jobs`, `GET /v1/jobs/{id}`, `POST /v1/jobs/{id}/wait` (blocking with optional timeout), `DELETE /v1/jobs/{id}` (cancel).
- Job table is daemon-wide, keyed by job_id (ULID). Status: `pending | running | done | failed | canceled`.
- Cancel propagates `CancelledError` into the workspace loop's task via `future.cancel()`.

**Acceptance:**

- Sync execute returns `IOResult` shape.
- Background execute returns immediately, `GET /v1/jobs/{id}` shows `running`, then `done` with the `IOResult` in `result`.
- `POST /v1/jobs/{id}/wait` blocks until done, returns the result.
- Cancel: start a long-running command in background, `DELETE /v1/jobs/{id}` returns within 100ms, subsequent `GET` shows `canceled`.
- stdin multipart: `wc -l` with stdin "a\\nb\\nc\\n" returns "3".

**Estimate:** 2 days. **Depends on:** T4.

### T6 -- Persist-on-shutdown

**Files:** `mirage/server/persist.py` (new), wiring in `mirage/server/app.py`, `tests/server/test_persist.py` (new).

**Scope:**

- On graceful shutdown, snapshot every active workspace to `<persist_dir>/<id>.tar` and write `<persist_dir>/index.json`.
- On startup, scan `<persist_dir>/index.json`, load each tar, look for `<persist_dir>/<id>.override.yaml`, apply it via T3's `merge_override`, construct via `Workspace.load(tar, resources=...)`, register under the same id.
- Per-workspace restore failures log at WARN and skip; daemon continues with the rest.
- Triggered only when `persist_dir` is set in `~/.mirage/config.toml`.

**Acceptance:**

- Shutdown -> startup round-trip: 2 workspaces, snapshot, exit, restart, verify both come back with the same `WorkspaceDetail`.
- Override file: a workspace with an S3 mount restores correctly when its `.override.yaml` supplies fresh creds.
- Corrupt tar: load failure for one workspace doesn't prevent the others from rehydrating; WARN log present.

**Estimate:** 1 day. **Depends on:** T4, T5.

### T7 -- CLI (typer)

**Files:** `mirage/cli/__init__.py`, `main.py`, `workspace.py`, `session.py`, `execute.py`, `job.py`, `client.py`, `settings.py` (all new); `pyproject.toml` (add `[project.scripts] mirage = ...`); `tests/cli/test_*.py` (new, integration via subprocess).

**Scope:**

- Typer root + subcommands per the "CLI surface" section.
- Every verb is a thin httpx wrapper over the REST API.
- Daemon auto-spawn on first `workspace --create`: try the daemon URL, if unreachable fork-exec `uvicorn mirage.server.app:app` detached, wait for `/v1/health` (~200ms typical).
- `~/.mirage/config.toml` parsing per the "config.toml" section.
- Output: structured JSON to stdout for every verb.
- stdin auto-detection: `not sys.stdin.isatty()` -> use multipart with stdin part.
- `--background` flag on execute -> uses `?background=true` endpoint, returns `{job_id, ...}`.
- Override files (`--override OVERRIDES.yaml`) on `--clone` and `--load`: read the file, send as multipart `override` part for load / JSON body for clone.

**Acceptance:**

- End-to-end: `mirage workspace --create test.yaml` (daemon auto-spawns) -> `mirage execute --workspace_id <id> --command "ls /"` -> `mirage workspace --delete <id>` (daemon auto-exits after grace).
- Piped stdin: `echo "a\nb\nc" | mirage execute --workspace_id <id> --command "wc -l"` returns `3`.
- `--background` returns job_id; `mirage job --wait <id>` blocks then returns the IOResult.

**Estimate:** 2 days. **Depends on:** T5 (and ideally T6 for "first user opens a saved workspace" path).

### T8 -- Auth + UDS transport

**Files:** `mirage/server/auth.py` (new), wiring in `app.py` and `cli/client.py`, `tests/server/test_auth.py` (new).

**Scope:**

- Bearer token middleware on the daemon: if `auth_token` set in config, all `/v1/*` requests require `Authorization: Bearer <token>`; mismatch = 401.
- CLI: read token from `MIRAGE_TOKEN` env or `~/.mirage/config.toml`, send on every request.
- UDS support: if `socket` set in config, daemon binds Unix domain socket; CLI auto-uses httpx `AsyncHTTPTransport(uds=...)`.
- Daemon discovery order finalized: `--daemon URL` flag > `MIRAGE_DAEMON_URL` env > config file > default.

**Acceptance:**

- Auth on: requests without token get 401; requests with right token pass; wrong token gets 401.
- UDS: daemon on `/tmp/mirage.sock`, CLI talks to it without a TCP port being open.
- Discovery: each level of the override chain works (verify with explicit env / flag in tests).

**Estimate:** 1 day. **Depends on:** T7.

### Total

~11.5 days across 8 PRs. T1 + T2 can land in parallel right away.
After T4 lands, T6 and T7 can proceed in parallel.

______________________________________________________________________

## Testing strategy

- **Unit:** every router gets a `httpx.AsyncClient(transport= ASGITransport(app=app))` test that exercises the happy path and the
  obvious error paths (missing workspace id, bad config).
- **Integration:** spin up a real `uvicorn` in a fixture, run the CLI
  binary as a subprocess, assert on stdout. One smoke test per verb is
  enough -- the unit tests cover correctness, integration just proves
  wiring.
- **Reuse the existing workspace test suite via HTTP.** Most current
  tests construct a `Workspace`, call `execute(...)`, assert. A thin
  test fixture that proxies `execute(...)` through the HTTP API gives
  us coverage of the daemon for free.
- **Snapshot round-trip.** `mirage workspace save` + `mirage workspace load` produces a workspace whose `find / -type f` and per-file
  content match the original (the same property tested in
  `examples/cross/load_check.py` today).

______________________________________________________________________

## Related

- [Workspace](/home/design/workspace) -- the kernel object the daemon
  hosts.
- [Snapshot](/home/design/snapshot) -- the tar format used by save /
  load / clone, reused verbatim by the daemon.
- [Sessions](/home/design/session) -- per-session state surfaced via
  the sessions router.
