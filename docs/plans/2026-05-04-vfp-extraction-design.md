# VFP — Virtual Filesystem Protocol Extraction

Date: 2026-05-04
Status: Design

## Background

Mirage today is a framework that mounts heterogeneous services (S3, Slack, Gmail, GitHub, Linear, Notion, Redis, ...) as a unified filesystem and exposes Unix-style shell tools (`ls`, `cat`, `grep`, `jq`, `cp`, `mv`) over them. Coding agents drive this surface using the shell vocabulary they already know.

Internally, every backend implements a small set of POSIX-shaped operations (`read`, `readdir`, `stat`, `write`, `unlink`, `mkdir`, `rmdir`, `rename`) plus a uniform metadata shape (`FileStat` with an extended `FileType` enum that goes beyond POSIX). Each backend also declares which Unix commands it supports for which filetypes. Today these conventions live as code shapes in `python/mirage/types.py`, `python/mirage/resource/base.py`, and the `@op` / `@command` decorator registries.

We want to factor those conventions into a reusable surface called **VFP** (Virtual Filesystem Protocol), modeled structurally on the [Agent Client Protocol](https://github.com/agentclientprotocol/agent-client-protocol) (ACP). VFP defines:

- A small set of POSIX-shaped methods (`fs/read`, `fs/readdir`, `fs/stat`, `fs/write`, `fs/unlink`, `fs/mkdir`, `fs/rmdir`, `fs/rename`, `fs/glob`).
- A workspace-lifecycle method group (`workspace/snapshot`, `workspace/load`, `workspace/list`, `workspace/delete`, `workspace/info`), parallel to ACP's `session/*`.
- A uniform command surface (`command/exec`) keyed by command name.
- Typed metadata (`Entry`, `FileStat`, `FileType`).
- A capability declaration shape advertising per-method, per-filetype, and per-command-flag support, plus mounted services.
- A skill renderer that turns a capability declaration into a markdown system prompt for LLMs.

VFP is not shipped as a separate repo or branded protocol on day one. It lives in-tree under `python/mirage/vfp/` and `typescript/packages/core/src/vfp/` so Mirage can consume it during the upcoming refactor without adding a public-spec project. Public extraction comes later, when there is empirical pressure (a second implementer, a partner asking for a spec, or Mirage TS and Python drifting on conventions).

## Goals

- Centralize the VFP-shaped types (`FileStat`, `FileType`, `Entry`) so Mirage Python and Mirage TS share one definition instead of two.
- Replace hand-written `PROMPT` / `WRITE_PROMPT` strings on each backend with a generated skill rendered from the capability declaration. Adding a backend automatically updates what agents see, with no manual prompt curation.
- Give each `BaseResource` a concrete `vfp_capability()` method that declares which POSIX ops, commands, and filetypes it supports. Drop hand-rolled prompt strings and ad-hoc capability checks.
- Expose `Workspace.capability_declaration()` and `Workspace.skill()` so agent SDK adapters consume one canonical surface instead of bespoke per-adapter prompt assembly.
- Set up the layout so that future extraction of `python/mirage/vfp/` into a standalone `vfp` repo is mostly mechanical (file moves plus codegen wiring), not a redesign.
- Match ACP's structure where they overlap (capability negotiation in `initialize`, JSON Schema with `x-method` / `x-side` extensions when wire mode lands, `_meta` for forward-compat extension data).

## Non-goals

- No public VFP spec, no separate `vfp` repo, no branded "open protocol" announcement. Defer until an external party asks.
- No JSON-RPC wire transport in v0.1. VFP starts as an in-process Python and TypeScript module surface. Wire mode (server, client, transports) is a later addition triggered by remote-workspace use cases.
- No conformance test suite. Single implementation (Mirage), so conformance is enforced by Mirage's own tests.
- No Rust / Go / other-language SDKs.
- No JSON Schema artifact yet. Pydantic models are canonical for v0.1; JSON Schema can be derived later via `model_json_schema()`.
- No git-style workspace versioning (fork / diff / log). Snapshot lifecycle in v0.1 is `snapshot`, `load`, `list`, `delete`, `info`. A `parent_id` field on snapshots gives free lineage without branch operations.
- No protocol-level auth, sandbox, or permission machinery. Those stay framework concerns.
- No filetype-specific method overloads (`read_text`, `read_structured`, `read_pdf`). One `fs/read` returns bytes; backends declare which filetypes they support via capability.

## Architecture

### Phased: in-tree, then extracted

```
Phase 1 (now, during refactor)            Phase 2 (later, on-demand)

  python/mirage/                            vfp/
  ├── vfp/  ← lives here                    ├── schema/vfp.json (codegenned from Pydantic)
  │   ├── types.py                          ├── packages/python/  (← was mirage/vfp/)
  │   ├── capability.py                     ├── packages/typescript/
  │   ├── skill.py                          ├── codegen/
  │   └── methods.py                        └── conformance/
  │
  └── (everything else)                     mirage/  (depends on vfp packages)
                                            └── (everything else)
```

Phase 1 ships during the Mirage refactor. Phase 2 is an extraction triggered by external demand.

### Mirage Python layout (post-refactor, in-tree VFP)

```
python/mirage/
├── vfp/                          in-tree VFP surface, pre-extraction
│   ├── __init__.py
│   ├── types.py                  Entry, FileStat, FileType, ErrorCode, Mount
│   ├── capability.py             CapabilityBuilder, ServerCapabilities, CapabilityDeclaration
│   ├── skill.py                  render(capability) -> markdown
│   └── methods.py                request/response Pydantic models per method
│
├── runtime/
│   ├── workspace.py              Workspace; exposes VFP method surface + lifecycle
│   └── dispatcher.py             routes calls across mounts
│
├── resources/
│   ├── base.py                   BaseResource; abstract vfp_capability()
│   ├── s3/, slack/, gmail/, ...  each backend implements VFP methods + vfp_capability()
│   └── ...
│
├── extensions/                   Mirage-only, not VFP
│   ├── cache/
│   ├── snapshot/                 snapshot file format and storage
│   ├── fuse/
│   └── observability/
│
├── adapters/                     agent-SDK / framework integrations
│   ├── openai_agents/            consume ws.skill() instead of hand-written prompts
│   ├── vercel_ai/
│   ├── langchain/
│   ├── pydantic_ai/
│   └── mcp_bridge/
│
├── shell/                        shell parsing -> command/exec
└── cli/
```

### TypeScript mirror

```
typescript/packages/core/src/
├── vfp/                          in-tree VFP surface
│   ├── types.ts
│   ├── capability.ts
│   ├── skill.ts
│   └── methods.ts
├── runtime/
├── resources/
├── extensions/
└── adapters/
```

For Phase 1, types are hand-defined in both languages. Drift is policed by tests and review. Phase 2 codegens both from a generated `schema/vfp.json`.

### Boundary rules

1. `mirage/vfp/` does not import from `runtime/`, `resources/`, `extensions/`, or `adapters/`. It is a leaf module.
1. `runtime/` and `resources/` may import from `vfp/`. Never the reverse.
1. `extensions/` may use `vfp/`, `runtime/`, `resources/`. Not the reverse.
1. `adapters/` may import from any of the above. Adapters are the glue layer.
1. When Phase 2 extracts `mirage/vfp/` to `vfp` repo, rule 1 is what makes the move trivial.

## Protocol surface (VFP/0.1)

Total: 16 methods across 3 groups, 1 capability shape, 4 type definitions.

### Methods

```
# Initialization (1)
initialize                  handshake, version negotiation, capability advertisement

# Filesystem ops (9)
fs/read                     read bytes
fs/readdir                  list directory entries
fs/stat                     metadata for one entry
fs/write                    write bytes
fs/unlink                   delete a file
fs/mkdir                    create a directory
fs/rmdir                    remove an empty directory
fs/rename                   move / rename
fs/glob                     pattern match (capability-gated optimization)

# Commands (1)
command/exec                run a registered command (ls, cat, grep, jq, ...) with argv

# Workspace lifecycle (5)
workspace/snapshot          snapshot current state, return id
workspace/load              load a snapshot by id
workspace/list              list available snapshots
workspace/delete            delete a snapshot
workspace/info              current workspace metadata + capabilities
```

### Types

```python
class FileType(str, Enum):
    """Open enum. Custom values use namespace prefix `x-<vendor>:<type>`."""
    DIRECTORY = "directory"
    TEXT = "text"
    BINARY = "binary"
    JSON = "json"
    CSV = "csv"
    MARKDOWN = "markdown"
    IMAGE_PNG = "image/png"
    IMAGE_JPEG = "image/jpeg"
    IMAGE_GIF = "image/gif"
    PDF = "application/pdf"
    ZIP = "application/zip"
    GZIP = "application/gzip"
    GDOC = "application/vnd.google-apps.document"
    PARQUET = "parquet"
    ORC = "orc"
    FEATHER = "feather"
    HDF5 = "hdf5"

class Entry(BaseModel):
    name: str
    type: FileType
    size: int | None = None
    modified: datetime | None = None

class FileStat(BaseModel):
    name: str
    type: FileType
    size: int | None = None
    modified: datetime | None = None
    fingerprint: str | None = None  # opaque change-token; MUST change iff content changes
    extra: dict[str, Any] = {}      # backend-specific fields (e.g., S3 etag, GitHub sha)

class Mount(BaseModel):
    path: str                       # absolute, MUST start with "/"
    type: str                       # soft hint: object-store, messaging, email, documents, ...
    writable: bool = False
    filetypes: list[FileType] = []
```

### Capability shape

```python
class FileTypeFilter(RootModel):
    """Either bool (universal support) or list of supported filetypes."""
    root: bool | dict[Literal["filetypes"], list[FileType]]

class FlagFilter(BaseModel):
    exclude: list[str] = []   # standard set MINUS these
    include: list[str] = []   # standard set PLUS these
    only: list[str] | None = None  # explicit subset, ignores spec defaults

class CommandCapability(RootModel):
    root: bool | dict[Literal["filetypes", "flags"], Any]

class PosixCapabilities(BaseModel):
    read: FileTypeFilter = False
    readdir: bool = False
    stat: bool = False
    write: FileTypeFilter = False
    unlink: bool = False
    mkdir: bool = False
    rmdir: bool = False
    rename: bool = False
    glob: bool = False

class CommandCapabilities(BaseModel):
    """Standard + custom commands. Custom keys use `x-<vendor>:` prefix."""
    ls: CommandCapability = False
    cat: CommandCapability = False
    head: CommandCapability = False
    tail: CommandCapability = False
    wc: CommandCapability = False
    grep: CommandCapability = False
    find: CommandCapability = False
    jq: CommandCapability = False
    sed: CommandCapability = False
    cp: CommandCapability = False
    mv: CommandCapability = False

class WorkspaceCapabilities(BaseModel):
    snapshot: bool = False
    load: bool = False
    list: bool = False
    delete: bool = False
    info: bool = False

class ServerCapabilities(BaseModel):
    posix: PosixCapabilities
    commands: CommandCapabilities
    workspace: WorkspaceCapabilities
    mounts: list[Mount]

class Implementation(BaseModel):
    name: str
    language: str
    version: str

class CapabilityDeclaration(BaseModel):
    protocol_version: int
    implementation: Implementation
    capabilities: ServerCapabilities
```

### Errors

Native exceptions in-process. When wire mode lands, map to a JSON-RPC error envelope with these named conditions:

```
NotFound, Denied, Conflict, IsADirectory, NotADirectory,
UnsupportedFileType, InvalidPath, NotImplemented, RateLimited, Network
```

### Path rules (MUST clauses)

- Paths MUST be absolute (start with `/`).
- Paths MUST NOT contain `..` segments.
- Paths MUST NOT contain null bytes.
- Glob patterns are accepted only on `fs/glob`. Other ops MUST reject patterns with `InvalidPath`.
- Glob grammar: POSIX-glob subset (`*`, `?`, `[abc]`, `[!abc]`, `**`).

### Extensibility

- Custom filetypes: `x-<vendor>:<type>` (e.g., `x-mirage:slack-message`).
- Custom commands: capability keys prefixed `x-<vendor>:` (e.g., `x-mirage:mongo-find`).
- Custom methods: prefixed with `_` (ACP convention).
- `_meta` field on every Pydantic model with `additionalProperties: true` for forward-compat data.

## Mirage integration

Six concrete changes during the refactor:

### 1. Drop Mirage's own type definitions; import from `mirage.vfp`

Move `FileStat`, `FileType`, `Entry` out of `python/mirage/types.py` into `python/mirage/vfp/types.py`. Re-export from old location for backward compat during migration:

```python
# python/mirage/types.py
from mirage.vfp.types import Entry, FileStat, FileType  # re-export
# PathSpec stays here (internal Mirage convenience, not on the wire)
```

### 2. Add `vfp_capability()` to `BaseResource`

```python
class BaseResource:
    name: str = "base"
    is_remote: bool = False
    accessor: Accessor = Accessor()
    _ops: dict[str, Callable[..., Any]] = {}

    @classmethod
    def vfp_capability(cls) -> CapabilityBuilder:
        raise NotImplementedError
```

Drop the static `PROMPT` and `WRITE_PROMPT` class attributes. They are replaced by the generated skill.

### 3. Each resource implements `vfp_capability()`

Mechanical work, ~30 minutes per backend, 26 backends. Example for S3:

```python
class S3Resource(BaseResource):
    name = "s3"
    is_remote = True

    @classmethod
    def vfp_capability(cls) -> CapabilityBuilder:
        cb = CapabilityBuilder(mount_type="object-store", writable=True)
        cb.posix.read = {"filetypes": [FileType.TEXT, FileType.JSON, FileType.CSV,
                                         FileType.PARQUET, FileType.IMAGE_PNG]}
        cb.posix.readdir = True
        cb.posix.stat = True
        cb.posix.write = {"filetypes": [FileType.TEXT, FileType.JSON, FileType.CSV,
                                          FileType.PARQUET]}
        cb.posix.unlink = True
        cb.posix.mkdir = True
        cb.posix.rmdir = True
        cb.posix.rename = True
        cb.posix.glob = True
        cb.commands.cat = {"filetypes": [FileType.TEXT, FileType.JSON, FileType.CSV,
                                           FileType.PARQUET]}
        cb.commands.grep = {"filetypes": [FileType.TEXT, FileType.JSON, FileType.CSV]}
        cb.commands.jq = {"filetypes": [FileType.JSON]}
        # ... rest of standard commands
        return cb
```

Read-only backends (Gmail, Slack, Linear, Notion, Discord, Telegram, Trello, Langfuse, GitHub-CI) declare only the read-side ops + `cat` / `grep` / `jq` / etc. as appropriate.

### 4. Workspace exposes capability + skill

```python
class Workspace:
    def capability_declaration(self) -> CapabilityDeclaration:
        """Aggregate per-mount capabilities into a workspace-level declaration."""
        ...

    def skill(self) -> str:
        """Auto-generated workspace description for LLM system prompts."""
        from mirage.vfp.skill import render
        return render(self.capability_declaration())
```

### 5. Workspace exposes the VFP method surface

`Workspace` already has `read`, `readdir`, `stat`, `write` etc. internally via the dispatcher. Standardize their signatures to match VFP method types from `mirage.vfp.methods`:

```python
class Workspace:
    # VFP method surface (in-process)
    async def read(self, path: str) -> bytes: ...
    async def readdir(self, path: str) -> list[Entry]: ...
    async def stat(self, path: str) -> FileStat: ...
    async def write(self, path: str, data: bytes) -> None: ...
    async def unlink(self, path: str) -> None: ...
    async def mkdir(self, path: str) -> None: ...
    async def rmdir(self, path: str) -> None: ...
    async def rename(self, src: str, dst: str) -> None: ...
    async def glob(self, pattern: str) -> list[str]: ...

    # Workspace lifecycle (existing, signatures aligned to VFP)
    async def snapshot(self, name: str | None = None) -> SnapshotInfo: ...
    async def load(self, snapshot_id: str) -> None: ...
    async def list_snapshots(self) -> list[SnapshotInfo]: ...
    async def delete_snapshot(self, snapshot_id: str) -> bool: ...
    async def info(self) -> WorkspaceInfo: ...

    # Mirage extensions (NOT VFP)
    async def execute(self, command: str) -> ExecResult: ...
    async def provision(self, command: str) -> ProvisionResult: ...
```

### 6. Adapters consume `ws.skill()`

Replace hand-written system prompts in each agent-SDK adapter:

```python
# Before (python/mirage/agents/openai_agents/sandbox.py)
from mirage.prompts import build_system_prompt
agent = SandboxAgent(
    name="Mirage Sandbox Agent",
    instructions=build_system_prompt({"mountInfo": {...}}),
)

# After
agent = SandboxAgent(
    name="Mirage Sandbox Agent",
    instructions=ws.skill(),
)
```

Same for Vercel AI SDK, LangChain, Pydantic AI, MCP bridge.

## Migration plan

Slot into the ongoing Mirage refactor. Each step is small.

| Step | Work                                                                                                                                                       | Effort   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1    | Create `python/mirage/vfp/` directory. Move type shapes from `mirage/types.py` to `mirage/vfp/types.py`. Re-export from old location.                      | 1 day    |
| 2    | Define `CapabilityBuilder`, `ServerCapabilities`, `CapabilityDeclaration` in `mirage/vfp/capability.py`.                                                   | 1-2 days |
| 3    | Implement `mirage/vfp/skill.py` (capability declaration, markdown).                                                                                        | 1-2 days |
| 4    | Add `vfp_capability()` abstract method to `BaseResource`. Implement for one backend (RAM) end to end. Verify capability builds, skill renders, tests pass. | 2-3 days |
| 5    | Implement `vfp_capability()` for the remaining 25 backends. Mechanical work, parallelizable.                                                               | 3-4 days |
| 6    | Add `Workspace.capability_declaration()` and `Workspace.skill()`.                                                                                          | 1-2 days |
| 7    | Standardize `Workspace` method signatures to match `mirage.vfp.methods` types.                                                                             | 2-3 days |
| 8    | Replace hand-written prompts in agent SDK adapters with `ws.skill()`. Drop `PROMPT` / `WRITE_PROMPT` class attributes from `BaseResource`.                 | 2-3 days |
| 9    | Repeat steps 1-8 for `typescript/packages/core/src/vfp/`.                                                                                                  | 1 week   |
| 10   | Drop dead code: old prompt builders, old type imports, `PROMPT` / `WRITE_PROMPT` shims.                                                                    | 1 day    |

Total: about three focused weeks. Done as part of the broader refactor, not as a separate project.

## Public release strategy

VFP stays in-tree for the foreseeable future. Trigger conditions for extraction:

1. Someone external asks "where is the spec, can I implement this?"
1. A non-Mirage runtime (Rust, Go, ...) wants to participate.
1. Mirage Python and TS drift on conventions and we need a single source of truth.

When a trigger fires, Phase 2 extraction:

1. Create `vfp` repo with Apache 2.0 license, `GOVERNANCE.md`, `CONTRIBUTING.md` modeled on ACP.
1. Move `python/mirage/vfp/` -> `vfp/packages/python/src/vfp/`. Same for TS.
1. Generate `schema/vfp.json` from Pydantic models via `model_json_schema()`. Add `x-method` and `x-side` extensions per ACP convention.
1. Set up codegen: spec -> Python types, spec -> TS types. Phase 1 hand-written types become generated.
1. Add JSON-RPC server / client / transport modules if wire mode is needed by the trigger use case.
1. Conformance test suite that any implementation can run.
1. Mirage updates dependency: `pip install vfp-spec`, `npm install @vfp/spec`.

The extraction is paperwork plus codegen wiring. The substance (types, capability, skill renderer, method shapes) is settled before extraction starts.

## README posture during Phase 1

No "VFP" or "UVFS Protocol" framing in the public README during Phase 1. Mirage is positioned as a framework that mounts services as a unified filesystem for coding agents, with familiar shell tools across every mount. The README's "Architecture" section keeps the existing diagram (Mirage Shell, FUSE Adapter, VFS, Dispatcher) but does not claim a public protocol.

When Phase 2 ships, the README adds a "Virtual Filesystem Protocol" section pointing to the `vfp` repo and positioning Mirage as the reference framework.

## Open questions

These need decisions during implementation, not before starting:

1. **Snapshot identifier shape.** Opaque string in the spec, but Mirage today uses tar file paths. Move to UUIDs? Hash-based ids? Keep paths? Probably UUIDs, with a sidecar registry mapping id to storage location.

1. **Should `command/exec` accept `stdin` and stream `stdout`?** ACP's `terminal/output` is poll-based. For VFP v0.1, a synchronous `(name, argv, stdin?) -> { stdout, stderr, exit_code }` shape is enough for shell commands. Streaming long-lived processes is out of scope.

1. **Should the skill renderer have multiple output formats?** Markdown is the obvious default. JSON output (for tool-schema-generation) and OpenAI-tool-format output are useful. Probably one renderer with a `format` parameter.

1. **When does `fs/watch` enter the spec?** Defer to v0.2 when there is a real consumer (FUSE-style live updates, IDE-side change subscriptions).

1. **Should `mounts` capability advertise per-mount capability?** Right now mounts just declare path and type. A `Mount` could carry its own `posix` / `commands` capability subset, allowing heterogeneous capability across mounts. v0.2 candidate.

1. **What about `fs/stat` for directories?** `stat` returns `FileStat`. For directories, what's `size`? Mirage today returns null. Spec it: `size` is null for directories unless backend has a meaningful aggregate.

## References

- ACP repo: https://github.com/agentclientprotocol/agent-client-protocol
- ACP Python SDK: https://github.com/agentclientprotocol/python-sdk
- ACP schema (Rust canonical, JSON Schema generated): `schema/schema.json` in ACP repo
- Prior Mirage plans:
  - `docs/plans/2026-04-17-workspace-save-load-copy.md` (workspace lifecycle in Mirage)
  - `docs/plans/2026-04-16-pathspec-frozen-stdin-stderr.md` (PathSpec internal type)
- Mirage code touchpoints:
  - `python/mirage/types.py` (types to move into `mirage/vfp/types.py`)
  - `python/mirage/resource/base.py` (BaseResource, drops `PROMPT` / `WRITE_PROMPT`)
  - `python/mirage/ops/registry.py` (op registry, source of capability data)
  - `python/mirage/commands/config.py` (command registry, source of capability data)
  - `python/mirage/workspace/workspace.py` (gains `capability_declaration()` + `skill()`)
  - `python/mirage/agents/*` (consume `ws.skill()` instead of hand-written prompts)
