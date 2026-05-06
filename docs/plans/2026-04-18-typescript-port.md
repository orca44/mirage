# TypeScript Port Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Incrementally port the Python `mirage` package to TypeScript as a universal (Node + browser) SDK, ported one slice at a time so `main` stays shippable at every step.

**Architecture:** pnpm workspace under `typescript/` with three published packages — `@struktoai/mirage-core` (platform-agnostic core), `@struktoai/mirage-node` (disk/fuse/daemon/CLI), `@struktoai/mirage-browser` (OPFS + CORS-aware fetch adapters). Core stays fetch-only and runtime-free; platform specifics live in adapter packages registered via a resource registry. Port is phased: scaffold → core abstractions → one trivial backend (RAM) end-to-end → grow resource/command coverage horizontally.

**Who installs what:**

- App developers in Node: `npm i @struktoai/mirage-node` — exposes everything (core is a transitive dep).
- App developers in browser: `npm i @struktoai/mirage-browser` — exposes everything (core is a transitive dep).
- Library authors writing isomorphic code: `npm i @struktoai/mirage-core` and declare `@struktoai/mirage-node` + `@struktoai/mirage-browser` as peer deps. This is the LangChain model — `core` is public and intentional, not internal. Docs should show this as the minority path; most users only ever import from their platform package.

**Tech Stack:** TypeScript 5.x, pnpm workspaces, tsup for bundling, vitest for tests, changesets for release, zod for schema validation, ESM-only. Node 20+, modern evergreen browsers.

______________________________________________________________________

## Package Topology

```
typescript/
├── package.json                  # private workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsup.config.base.ts
├── vitest.config.ts
├── .changeset/
├── packages/
│   ├── core/                     # @struktoai/mirage-core, platform-agnostic
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── path-spec.ts      # ports mirage/types.py PathSpec
│   │   │   ├── workspace.ts      # ports mirage/workspace/
│   │   │   ├── mount-mode.ts
│   │   │   ├── resource/
│   │   │   │   ├── base.ts       # Resource interface
│   │   │   │   ├── registry.ts
│   │   │   │   └── ram.ts        # first ported resource
│   │   │   ├── ops/              # read/list/write/stat/delete primitives
│   │   │   ├── commands/         # shell builtins (later phase)
│   │   │   └── shell/            # pipeline engine (later phase)
│   │   └── package.json
│   ├── node/                     # @struktoai/mirage-node
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── resource/
│   │   │       ├── disk.ts       # fs-based
│   │   │       └── redis.ts      # ioredis-based
│   │   └── package.json
│   └── browser/                  # @struktoai/mirage-browser
│       ├── src/
│       │   ├── index.ts
│       │   └── resource/
│       │       └── opfs.ts       # Origin Private File System
│       └── package.json
└── examples/
    ├── node-ram/
    └── browser-opfs/
```

**Key rules for the split:**

- `@struktoai/mirage-core` has **zero runtime deps that require Node or browser globals**. No `fs`, no `path`, no `process`, no `window`. Uses `fetch`, `AbortController`, `crypto.subtle`, `ReadableStream` — all universal.
- Resources that need platform-specific APIs live in `@struktoai/mirage-node` or `@struktoai/mirage-browser` and register themselves with the core registry at import time.
- `@struktoai/mirage-node` re-exports everything from `@struktoai/mirage-core` so Node users install one package.
- `@struktoai/mirage-browser` re-exports everything from `@struktoai/mirage-core` plus browser-only backends.

______________________________________________________________________

## Phasing Strategy

Each phase ends with a releasable state — nothing half-wired. Python package is untouched throughout; the TS port catches up at its own pace.

| Phase | Scope                                                                                                | Deliverable                                    |
| ----- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 0     | Workspace scaffold                                                                                   | Empty packages build + publish-dry-run cleanly |
| 1     | `PathSpec` + `Resource` interface + `Workspace` shell                                                | Types compile, tests pass, no I/O yet          |
| 2     | `RAMResource` + basic ops (`read`, `write`, `list`, `stat`, `delete`)                                | Node + browser example reads/writes in-memory  |
| 3     | `DiskResource` in `@struktoai/mirage-node`                                                           | Node-only parity with Python disk backend      |
| 4     | `S3Resource` in `mirage` core (fetch + SigV4)                                                        | Works in both Node and browser                 |
| 5     | `GDriveResource` + OAuth helper                                                                      | First Google API backend                       |
| 6     | Shell parser + pipeline engine                                                                       | `ws.execute("ls /ram")` returns results        |
| 7     | Port builtin commands one by one: `cat`, `ls`, `head`, `tail`, `wc`, `grep`, `cut`, `file`, `stat`   | Command parity with Python for ported backends |
| 8     | Remaining resources (Gmail, Slack, Notion, GitHub, Linear, MongoDB, SSH, Redis, GCS/R2/OCI/Supabase) | Full backend parity                            |
| 9     | CLI + daemon (`@struktoai/mirage-node` only)                                                         | `mirage workspace create ws.yaml` works        |

**Only Phase 0–2 are broken into TDD-sized steps below.** Later phases get a one-paragraph sketch and will be expanded to task granularity when their predecessor lands — avoids churn from decisions that aren't yet informed.

______________________________________________________________________

## Phase 0 — Scaffold the workspace

### Task 0.1: Create `pnpm-workspace.yaml` and root `package.json`

**Files:**

- Create: `typescript/pnpm-workspace.yaml`
- Create: `typescript/package.json`
- Create: `typescript/.npmrc`
- Create: `typescript/.gitignore`
- Delete: `typescript/.gitkeep`

**Step 1:** Write `typescript/pnpm-workspace.yaml`:

```yaml
packages:
  - packages/*
  - examples/*
```

**Step 2:** Write `typescript/package.json`:

```json
{
  "name": "mirage-ts-monorepo",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.0.0",
  "scripts": {
    "build": "pnpm -r --filter './packages/*' build",
    "test": "pnpm -r --filter './packages/*' test",
    "typecheck": "pnpm -r --filter './packages/*' typecheck",
    "lint": "eslint .",
    "changeset": "changeset",
    "release": "pnpm build && changeset publish"
  },
  "devDependencies": {
    "@changesets/cli": "^2.30.0",
    "@types/node": "^22.0.0",
    "eslint": "^9.0.0",
    "tsup": "^8.5.0",
    "typescript": "^5.9.0",
    "typescript-eslint": "^8.0.0",
    "vitest": "^3.0.0"
  }
}
```

**Step 3:** Write `typescript/.npmrc`:

```
engine-strict=true
auto-install-peers=true
```

**Step 4:** Write `typescript/.gitignore`:

```
node_modules/
dist/
.turbo/
coverage/
*.tsbuildinfo
```

**Step 5:** Delete placeholder:

```bash
rm typescript/.gitkeep
```

**Step 6:** Verify install works:

```bash
cd typescript && pnpm install
```

Expected: exits 0, creates `node_modules/` and `pnpm-lock.yaml`.

**Step 7:** Commit:

```bash
git add typescript/
git commit -m "feat(ts): scaffold pnpm workspace for typescript port"
```

______________________________________________________________________

### Task 0.2: Scaffold the three packages

**Files:**

- Create: `typescript/packages/core/package.json`
- Create: `typescript/packages/core/tsconfig.json`
- Create: `typescript/packages/core/tsup.config.ts`
- Create: `typescript/packages/core/src/index.ts`
- Create: `typescript/packages/node/package.json`
- Create: `typescript/packages/node/tsconfig.json`
- Create: `typescript/packages/node/tsup.config.ts`
- Create: `typescript/packages/node/src/index.ts`
- Create: `typescript/packages/browser/package.json`
- Create: `typescript/packages/browser/tsconfig.json`
- Create: `typescript/packages/browser/tsup.config.ts`
- Create: `typescript/packages/browser/src/index.ts`
- Create: `typescript/tsconfig.base.json`

**Step 1:** Write `typescript/tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  }
}
```

**Step 2:** Write `typescript/packages/core/package.json`:

```json
{
  "name": "@struktoai/mirage-core",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "tsup": "^8.5.0",
    "typescript": "^5.9.0",
    "vitest": "^3.0.0"
  }
}
```

**Step 3:** Write `typescript/packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM"],
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Note:** `lib: ["ES2022", "DOM"]` is deliberate — core uses `fetch`, `ReadableStream`, `AbortController`, `crypto.subtle` which all appear in DOM lib types and are available in Node 20+ as well.

**Step 4:** Write `typescript/packages/core/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
})
```

**Step 5:** Write `typescript/packages/core/src/index.ts`:

```ts
export const VERSION = '0.0.0'
```

**Step 6:** Repeat steps 2–5 for `@struktoai/mirage-node` under `packages/node/` — set `name: "@struktoai/mirage-node"`, add `"@struktoai/mirage-core": "workspace:*"` as a dependency, drop the DOM lib from tsconfig.

**Step 7:** Repeat steps 2–5 for `@struktoai/mirage-browser` under `packages/browser/` — set `name: "@struktoai/mirage-browser"`, add `"@struktoai/mirage-core": "workspace:*"` as a dependency, keep DOM lib.

**Step 8:** Install and build everything:

```bash
cd typescript && pnpm install && pnpm build
```

Expected: three `dist/` folders appear, each containing `index.js` + `index.d.ts`, exits 0.

**Step 9:** Commit:

```bash
git add typescript/
git commit -m "feat(ts): scaffold @struktoai/mirage-core / @struktoai/mirage-node / @struktoai/mirage-browser packages"
```

______________________________________________________________________

### Task 0.3: Wire up vitest + eslint + prettier + changesets + pre-commit

**Files:**

- Create: `typescript/vitest.config.ts`
- Create: `typescript/eslint.config.js`
- Create: `typescript/.prettierrc.json`
- Create: `typescript/.prettierignore`
- Create: `typescript/.changeset/config.json`
- Modify: `typescript/package.json` (add prettier + eslint-config-prettier devDeps, add `format` + `format:check` scripts)
- Modify: `.pre-commit-config.yaml` (add local hook that runs TS lint/format on staged TS files)

**Step 1:** Write `typescript/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts'],
  },
})
```

**Step 2:** Write `typescript/eslint.config.js` (ESLint flat config, ESM):

```js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/*.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  prettierConfig,
)
```

**Step 3:** Write `typescript/.prettierrc.json`:

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "arrowParens": "always"
}
```

**Step 4:** Write `typescript/.prettierignore`:

```
dist/
node_modules/
pnpm-lock.yaml
*.tsbuildinfo
```

**Step 5:** Add to `typescript/package.json` devDependencies:

```json
"@eslint/js": "^9.39.4",
"eslint-config-prettier": "^10.1.8",
"prettier": "^3.8.2"
```

And add scripts:

```json
"format": "prettier --write .",
"format:check": "prettier --check ."
```

**Step 6:** Initialize changesets:

```bash
cd typescript && pnpm changeset init
```

Then edit `.changeset/config.json` to set `"access": "public"` and `"linked": [["@struktoai/mirage-core", "@struktoai/mirage-node", "@struktoai/mirage-browser"]]` so the three packages version together.

**Step 7:** Extend `.pre-commit-config.yaml` at the repo root. Append a local hook at the end of `repos:`:

```yaml
  - repo: local
    hooks:
      - id: ts-prettier
        name: Prettier (typescript)
        entry: pnpm --dir typescript exec prettier --write
        language: system
        files: ^typescript/.*\.(ts|tsx|js|mjs|cjs|json|md|yaml|yml)$
        pass_filenames: true
      - id: ts-eslint
        name: ESLint (typescript)
        entry: pnpm --dir typescript exec eslint --fix
        language: system
        files: ^typescript/.*\.(ts|tsx|js|mjs|cjs)$
        pass_filenames: true
```

Rationale: `language: system` means pre-commit won't try to install a Python env for these — it shells out to `pnpm` which must already be installed. `files:` limits hooks to the `typescript/` subtree so Python-only commits aren't slowed down.

**Step 8:** Verify the whole pipeline:

```bash
cd typescript && pnpm install && pnpm format:check && pnpm lint && pnpm test
```

Expected: all four exit 0 (test is a no-op since no tests exist yet). Then run the root pre-commit:

```bash
cd /Users/zecheng/strukto/mirage && pre-commit run --files typescript/packages/core/src/index.ts
```

Expected: `ts-prettier` and `ts-eslint` both pass.

**Step 9:** Commit:

```bash
git add typescript/ .pre-commit-config.yaml
git commit -m "chore(ts): add vitest, eslint, prettier, changesets, pre-commit hooks"
```

______________________________________________________________________

## Phase 1 — Core abstractions

Port the three load-bearing types from Python, with no I/O.

### Task 1.1: `PathSpec`

**Files:**

- Create: `typescript/packages/core/src/path-spec.ts`
- Create: `typescript/packages/core/src/path-spec.test.ts`
- Reference: `mirage/types.py` (Python `PathSpec` class)

Mirror Python's `PathSpec` fields and constructors. Keep the same method names so Python and TS docs can share examples: `isAbsolute()`, `join(segment: string)`, `parent()`, `name()`, `toString()`.

**TDD loop:**

1. Write `path-spec.test.ts` covering: normalize trailing slash, reject empty, `join` handles `..`, `parent()` of `/` is `/`, round-trip through `toString()`. Run it — expect all to fail.
1. Implement `PathSpec` in `path-spec.ts` as a class. Re-run — expect green.
1. Export from `src/index.ts`. Commit.

### Task 1.2: `MountMode` enum and `Resource` interface

**Files:**

- Create: `typescript/packages/core/src/mount-mode.ts`
- Create: `typescript/packages/core/src/resource/base.ts`
- Create: `typescript/packages/core/src/resource/registry.ts`
- Create: `typescript/packages/core/src/resource/base.test.ts`
- Reference: `mirage/resource/base.py`, `mirage/resource/registry.py`

**`MountMode`:** match Python — `READ`, `WRITE`, `APPEND` (check `mirage/workspace/` for exact values before coding).

**`Resource` interface:** method surface mirrors `mirage/resource/base.py`. Draft:

```ts
export interface Resource {
  readonly kind: string
  open(): Promise<void>
  close(): Promise<void>
  list(path: PathSpec): AsyncIterable<DirEntry>
  stat(path: PathSpec): Promise<FileStat>
  readStream(path: PathSpec, range?: ByteRange): ReadableStream<Uint8Array>
  writeStream(path: PathSpec): WritableStream<Uint8Array>
  delete(path: PathSpec): Promise<void>
}
```

Freeze `DirEntry`, `FileStat`, `ByteRange` as plain interfaces in the same file — no classes.

**`Registry`:** a `Map<string, ResourceFactory>` with `register(kind, factory)` and `create(kind, config)`. Adapter packages call `register` at import time.

TDD loop: write registry tests (register/create/duplicate kind throws), implement, commit.

### Task 1.3: `Workspace` shell

**Files:**

- Create: `typescript/packages/core/src/workspace.ts`
- Create: `typescript/packages/core/src/workspace.test.ts`
- Reference: `mirage/workspace/__init__.py`

For Phase 1, `Workspace` only needs to: accept `{[mountPoint]: Resource}` + `MountMode`, resolve a path to `(resource, relativePath)`, call `open()` on each resource lazily, provide `close()`. No `execute()` yet — that lands in Phase 6.

**Acceptance:** `new Workspace({'/data': ramResource}, {mode: MountMode.WRITE})` + `await ws.resolve('/data/foo.txt')` returns `[ramResource, PathSpec('/foo.txt')]`.

Commit.

______________________________________________________________________

## Phase 2 — First backend end-to-end: `RAMResource`

This is the milestone where the port proves viable. After this task, a user can `pnpm add mirage` in Node OR a browser and read/write to an in-memory mount.

### Task 2.1: `RAMResource`

**Files:**

- Create: `typescript/packages/core/src/resource/ram.ts`
- Create: `typescript/packages/core/src/resource/ram.test.ts`
- Reference: `mirage/resource/ram/__init__.py`, `mirage/core/ram/`

Backing store: `Map<string, Uint8Array>` keyed by normalized absolute path string. `readStream`/`writeStream` bridge through small internal queues. `list()` is a prefix scan over the map keys.

Register in `src/index.ts` so `import 'mirage/resource/ram'` has the side effect of calling `registry.register('ram', ...)`.

TDD coverage: write → read round-trip, list empty dir, stat on missing file throws, delete removes entry.

### Task 2.2: Node example

**Files:**

- Create: `typescript/examples/node-ram/package.json`
- Create: `typescript/examples/node-ram/index.ts`

Port `examples/ram/ram.py` to TS:

```ts
import { MountMode, Workspace, RAMResource } from '@struktoai/mirage-node'

const ws = new Workspace({ '/data': new RAMResource() }, { mode: MountMode.WRITE })

const writer = ws.writeStream('/data/hello.txt')
await new Blob(['hello mirage']).stream().pipeTo(writer)

const text = await new Response(ws.readStream('/data/hello.txt')).text()
console.log(text)

await ws.close()
```

Run with `tsx examples/node-ram/index.ts` — expect `hello mirage`.

### Task 2.3: Browser example

**Files:**

- Create: `typescript/examples/browser-opfs/index.html`
- Create: `typescript/examples/browser-opfs/main.ts`

Same code path, loaded in a browser via Vite. Confirms core bundles without Node globals.

### Task 2.4: First release

Generate a changeset:

```bash
cd typescript && pnpm changeset
```

Mark all three packages as `patch` bumps. Publish `0.0.1` to npm under a `next` dist-tag so the port is installable but not the default for `npm install @struktoai/mirage-node`.

______________________________________________________________________

## Phase 3+ — Roadmap outline

Each of these is a future plan document; expand to TDD granularity when its predecessor ships.

**Phase 3 — `DiskResource` (`@struktoai/mirage-node`).** Port `mirage/resource/disk/` using `node:fs/promises` + `fs.createReadStream`. Cross-check byte-range semantics with the Python implementation. Use `memfs` in tests so CI doesn't touch real disk.

**Phase 4 — `S3Resource` (core).** SigV4 in pure JS (port logic from `mirage/core/s3/`). Works in both Node (via `fetch`) and browser (via `fetch` + CORS on the bucket). Reference: AWS's own JS SDK does exactly this.

**Phase 5 — `GDriveResource` + OAuth helper.** REST-only, browser-compatible. Split the OAuth flow into `@struktoai/mirage-node` (local loopback redirect) and `@struktoai/mirage-browser` (popup + PKCE). The resource itself stays in core.

**Phase 6 — Shell pipeline engine.** Port `mirage/shell/` parser (argv splitter + pipe/redirection AST) into `packages/core/src/shell/`. Expose `ws.execute(line: string): ExecuteResult`. Initially supports only backends we've ported (Phases 2–5).

**Phase 7 — Builtin commands.** Port one at a time in this order (matches Python's `mirage/commands/builtin/`, easiest first): `ls`, `cat`, `head`, `tail`, `wc`, `file`, `stat`, `cut`, `grep`. Each gets its own TDD task. A command is "done" when it passes the same fixtures the Python version passes — copy the fixture files across.

**Phase 8 — Remaining resources.** Bulk-port in this order based on effort and dependencies:

- Low effort (REST + OAuth2): Gmail, GDocs, GSheets, GSlides, GitHub, Linear, Notion, Slack, Discord, Telegram, Trello, Email.
- Medium effort: GCS, R2, OCI, Supabase (S3-compat or fetch-based).
- High effort (Node-only, needs raw sockets): Redis (`ioredis`), MongoDB (`mongodb`), SSH (`ssh2`). These all live in `@struktoai/mirage-node`.

**Phase 9 — CLI + daemon (`@struktoai/mirage-node`).** Port `mirage/cli/` + `mirage/server/` using `commander` + `undici`. Ship as `mirage` binary via the `bin` field of `@struktoai/mirage-node`. Skip FUSE initially — it's macOS/Linux only and adds a native dependency.

______________________________________________________________________

## Non-goals and open decisions

**Out of scope for this plan:**

- FUSE mount in Node (needs native deps; revisit post-Phase 9 if demand exists).
- `jq`/`sed`/`awk` in the browser — those wrap binaries in Python; either wasm-port or skip.
- Python-generated tests → auto-port. We'll re-author tests in vitest; don't try to translate pytest fixtures mechanically.

**Decisions deferred:**

- **`@mirage-ai` npm scope availability.** Confirm the scope is claimable (and claim it) before Phase 2's `0.0.1` release. If taken, fall back to `@mirage-io` or similar.
- **Shared schemas.** Consider emitting zod schemas from Python Pydantic models so resource configs stay in sync across languages. Revisit at Phase 6.
- **Bundled size budget for browser.** Aim for `@struktoai/mirage-browser` + `@struktoai/mirage-core` < 50 kB gzipped at Phase 5. Add `size-limit` to CI if we approach it.

______________________________________________________________________

## Execution notes

- Python package is **not** modified by this plan. Python and TS evolve independently; parity is enforced by documentation and fixture sharing, not by code generation (for now).
- Every phase ends with a green `pnpm build && pnpm test && pnpm typecheck` and a commit — `main` must stay shippable.
- Use `superpowers:test-driven-development` for every task inside Phases 0–2. Later phases should be re-planned to task granularity before they start, not up-front.
