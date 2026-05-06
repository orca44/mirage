# Postgres TypeScript Resource Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Port the Python `mirage.resource.postgres` package to TypeScript with the same path layout, the same size guard, and the same read-only discipline. Phase A targets `@struktoai/mirage-node` using the `pg` driver. Phase B adds browser support via a small driver abstraction so the same core works against `@neondatabase/serverless` (HTTPS/WS) without forking the implementation.

**Architecture:** Mirrors the existing TS resource pattern (`@struktoai/mirage-node`'s `redis/` and `gcs/`). Resource holds an accessor; accessor holds a driver-agnostic `PostgresStore`; core functions take the accessor and return synthetic JSON / rows; ops are static `RegisteredOp[]` objects exported from `ops/postgres/index.ts`; commands are static `RegisteredCommand[]` objects exported from `commands/builtin/postgres/index.ts`. Lazy import of the `pg` driver in the registry factory keeps it optional.

**Tech Stack:** `pg` (peer dep, optional), `vitest` for tests with `vi.mock()` for unit tests, the existing `PathSpec` / `Accessor` / `Resource` infrastructure in `@struktoai/mirage-core`.

**Reference Implementation:** Python at `python/mirage/{accessor,core,ops,resource}/postgres/` and `python/mirage/commands/builtin/postgres/`. SQL queries, scope rules, and EXPLAIN-based size guard logic must port verbatim — only the language and module structure change.

______________________________________________________________________

## Path Layout

Identical to Python. The mount root is the database name.

```
acme_prod/
├── database.json                           # cross-schema topology + relationships
├── public/                                 # Postgres schema = folder
│   ├── tables/
│   │   └── users/
│   │       ├── schema.json
│   │       └── rows.jsonl                  # size-guarded
│   └── views/
│       └── customer_360/
│           ├── schema.json
│           └── rows.jsonl
└── analytics/
    ├── tables/
    │   └── events/{schema.json, rows.jsonl}
    └── views/
        └── daily_revenue/{schema.json, rows.jsonl}
```

Materialized views land under `views/` with `"kind": "materialized_view"` in their `schema.json`.

## Path Levels (for `scope.ts`)

| Level           | Example                            | What it is                |
| --------------- | ---------------------------------- | ------------------------- |
| `root`          | `/`                                | Database root             |
| `database_json` | `/database.json`                   | Synthetic root file       |
| `schema`        | `/public`                          | Postgres schema directory |
| `kind`          | `/public/tables`                   | `tables` or `views`       |
| `entity`        | `/public/tables/users`             | One table/view folder     |
| `entity_schema` | `/public/tables/users/schema.json` | Synthetic per-entity card |
| `entity_rows`   | `/public/tables/users/rows.jsonl`  | The data file             |

Anything else → throw a NodeJS-style ENOENT error (`Object.assign(new Error(...), { code: 'ENOENT' })`).

## `database.json` and per-entity `schema.json`

Identical JSON shapes to the Python implementation. See `python/mirage/core/postgres/_schema_json.py` and `python/tests/core/postgres/test_schema_json.py` for the exact wire format. The TS port should match field-for-field so a YAML-mounted Postgres resource produces byte-identical JSON across both runtimes.

## Size Guard

Identical to Python: `EXPLAIN (FORMAT JSON) SELECT * FROM <schema>.<entity>` → if `rows > maxReadRows` or `rows * width > maxReadBytes`, throw an error. Applies only to `rows.jsonl` reads with no `limit`/`offset`. `head`/`tail`/`wc`/`grep` push down to SQL and bypass the guard.

`PostgresConfig` defaults: `defaultRowLimit=1000`, `maxReadRows=10_000`, `maxReadBytes=10 * 1024 * 1024`, `defaultSearchLimit=100`.

## Read-Only Discipline

`pg` pool's connection string carries `default_transaction_read_only=on`, or — if not supported by the driver-supplied connection options — issued as `SET default_transaction_read_only = on` on every checkout. Resource exposes only read ops + read-only commands. No `write`, `mkdir`, `unlink`, `rename`, `truncate`.

______________________________________________________________________

# Phase A — Node (`@struktoai/mirage-node`)

## Task A1: Add `pg` peer dependency

**Files:** Modify `typescript/packages/node/package.json`.

**Step 1:** Add to `peerDependencies` (alphabetical):

```json
"pg": "^8.13.0"
```

Add to `peerDependenciesMeta`:

```json
"pg": { "optional": true }
```

Add to `devDependencies` so tests/typecheck can resolve it:

```json
"pg": "^8.13.0",
"@types/pg": "^8.11.0"
```

**Step 2:** `cd typescript && pnpm install`.

**Step 3:** Verify: `cd typescript && node -e "import('pg').then(m => console.log(m.default.Pool.name))"` — expect `Pool`.

**Step 4:** Commit:

```bash
git add typescript/packages/node/package.json typescript/pnpm-lock.yaml
git commit -m "feat(postgres-ts): add pg as optional peer dependency"
```

______________________________________________________________________

## Task A2: Add `ResourceName.POSTGRES`

**Files:**

- Modify: `typescript/packages/core/src/types.ts` — append `POSTGRES = 'postgres'` to the `ResourceName` enum.
- Modify: `typescript/packages/core/src/types.test.ts` (or wherever the enum is exercised) — add `expect(ResourceName.POSTGRES).toBe('postgres')`.

**Step 1:** Failing test for the enum value.
**Step 2:** Run — fails.
**Step 3:** Add the enum entry.
**Step 4:** Run — passes.
**Step 5:** Commit `feat(postgres-ts): register ResourceName.POSTGRES`.

______________________________________________________________________

## Task A3: Config + package shell + prompt

**Files:**

- Create: `typescript/packages/node/src/resource/postgres/config.ts`
- Create: `typescript/packages/node/src/resource/postgres/prompt.ts`
- Create: `typescript/packages/node/src/resource/postgres/postgres.ts` (skeleton — fleshed out in A11)
- Create: `typescript/packages/node/src/resource/postgres/config.test.ts`

`config.ts` exports:

```ts
export interface PostgresConfig {
  dsn: string
  schemas?: readonly string[]
  defaultRowLimit?: number
  maxReadRows?: number
  maxReadBytes?: number
  defaultSearchLimit?: number
}

export interface PostgresConfigResolved {
  dsn: string
  schemas: readonly string[] | null
  defaultRowLimit: number
  maxReadRows: number
  maxReadBytes: number
  defaultSearchLimit: number
}

export function normalizePostgresConfig(input: Record<string, unknown>): PostgresConfig
export function resolvePostgresConfig(config: PostgresConfig): PostgresConfigResolved
```

`prompt.ts` exports `POSTGRES_PROMPT` — the same text as `python/mirage/resource/postgres/prompt.py`, with `{prefix}` replaced at construction time.

**Test cases (mirroring `tests/resource/postgres/test_config.py`):**

- `resolvePostgresConfig({ dsn })` — defaults match Python.
- `normalizePostgresConfig({ dsn: '…', max_read_rows: 50 })` — snake_case → camelCase.
- Schema filter survives.

Commit: `feat(postgres-ts): add PostgresConfig and prompt`.

______________________________________________________________________

## Task A4: PostgresStore (driver wrapper)

**Files:**

- Create: `typescript/packages/node/src/resource/postgres/store.ts`
- Create: `typescript/packages/node/src/resource/postgres/store.test.ts`

`store.ts` mirrors `RedisStore`'s pattern: it owns the `pg.Pool`, lazy-initializes on first use, and exposes typed methods used by core. Driver is loaded via dynamic `import('pg')` so the `pg` package can stay an optional peer dep.

```ts
export interface PgQueryResult {
  rows: Array<Record<string, unknown>>
  rowCount: number
}

export class PostgresStore {
  constructor(config: PostgresConfigResolved)
  query(sql: string, params?: readonly unknown[]): Promise<PgQueryResult>
  databaseName(): Promise<string>           // SELECT current_database()
  close(): Promise<void>
  // driver-agnostic seam: subclasses override _connect for non-pg drivers (Phase B)
  protected _connect(): Promise<unknown>
}
```

The `_connect()` seam is the only Phase-B-relevant abstraction worth carrying now — keeps the diff in Phase B small.

**Tests:** mock `pg`'s `Pool` constructor with `vi.mock('pg', …)`. Verify lazy init (no pool until first `query()`), verify `default_transaction_read_only=on` is applied, verify `close()` ends the pool.

Commit: `feat(postgres-ts): add PostgresStore with lazy pg pool`.

______________________________________________________________________

## Task A5: PostgresAccessor

**Files:**

- Create: `typescript/packages/node/src/accessor/postgres.ts`
- Create: `typescript/packages/node/src/accessor/postgres.test.ts`

```ts
import { Accessor } from '@struktoai/mirage-core'
import type { PostgresStore } from '../resource/postgres/store.ts'
import type { PostgresConfigResolved } from '../resource/postgres/config.ts'

export class PostgresAccessor extends Accessor {
  readonly store: PostgresStore
  readonly config: PostgresConfigResolved
  constructor(store: PostgresStore, config: PostgresConfigResolved) {
    super()
    this.store = store
    this.config = config
  }
}
```

Test: confirms `accessor.config === config` and `accessor.store === store`.

Commit: `feat(postgres-ts): add PostgresAccessor`.

______________________________________________________________________

## Task A6: Core SQL helpers (`_client.ts`)

**Files:**

- Create: `typescript/packages/node/src/core/postgres/_client.ts`
- Create: `typescript/packages/node/src/core/postgres/_client.test.ts`

Port the queries from `python/mirage/core/postgres/_client.py`:

- `listSchemas(accessor)` — `information_schema.schemata` filtered by `config.schemas` and excluding system schemas.
- `listEntities(accessor, schema, kind)` — tables / views / matviews.
- `entityExists(accessor, schema, entity)` → `'table' | 'view' | 'materialized_view' | null`.
- `columns(accessor, schema, entity)` — name, type, nullability, PK flag.
- `primaryKey(accessor, schema, entity)`.
- `foreignKeys(accessor, schema, entity)` — uses `pg_constraint` + `unnest(conkey/confkey) WITH ORDINALITY` (the column-ordering fix from Python — DO NOT regress to `constraint_column_usage`).
- `indexes(accessor, schema, entity)`.
- `rowCountEstimate(accessor, schema, entity)` — `pg_class.reltuples`.
- `sizeBytesEstimate(accessor, schema, entity)` — `pg_total_relation_size`.
- `estimateSize(accessor, schema, entity)` — `EXPLAIN (FORMAT JSON) SELECT * FROM …`. Returns `[planRows, planWidth]`. Handle the case where the EXPLAIN result is returned as a string (Python had to `JSON.parse` it; same applies here for some `pg` configurations — guard with `typeof === 'string'`).
- `selectRows(accessor, schema, entity, { limit, offset })` — `SELECT * FROM <schema>.<entity> ORDER BY <pk> LIMIT $1 OFFSET $2`.
- `countRows(accessor, schema, entity, where?)` and `searchRows(accessor, schema, entity, pattern, columns, limit)` — wc/grep helpers.

Tests use `vi.mock('pg')` and assert the exact SQL strings. Identifiers are quoted via a small `quoteIdent()` helper (`"` + escape inner `"` to `""`); never interpolate user-controlled strings without quoting.

Commit: `feat(postgres-ts): add core/postgres/_client SQL helpers`.

______________________________________________________________________

## Task A7: Synthetic JSON composition

**Files:**

- Create: `typescript/packages/node/src/core/postgres/_schema_json.ts`
- Create: `typescript/packages/node/src/core/postgres/_schema_json.test.ts`

Two functions:

- `databaseJson(accessor)` → `Uint8Array` with the `database.json` body.
- `entitySchemaJson(accessor, schema, entity, kind)` → `Uint8Array` with the per-entity `schema.json` body.

Output must match Python field-for-field (key order included where it matters for tests). Use `JSON.stringify(obj, null, 2)` and `Buffer.from(...)` → `Uint8Array`.

Commit: `feat(postgres-ts): compose database.json and per-entity schema.json`.

______________________________________________________________________

## Task A8: Scope detection + glob resolution

**Files:**

- Create: `typescript/packages/node/src/core/postgres/scope.ts`
- Create: `typescript/packages/node/src/core/postgres/glob.ts`
- Tests for both.

`scope.ts` exports `detectScope(path: PathSpec): PostgresScope` matching `python/mirage/core/postgres/scope.py`. Levels: `root`, `database_json`, `schema`, `kind`, `entity`, `entity_schema`, `entity_rows`. Anything else throws ENOENT.

`glob.ts` exports `resolveGlob(accessor, spec: PathSpec): Promise<PathSpec[]>` — walks the synthetic tree, expands `*` against schemas/kinds/entities. Mirrors Python's behavior closely enough that the `mountSnapshot` integration test produces equal listings across runtimes.

Commit: `feat(postgres-ts): add scope detection and glob resolution`.

______________________________________________________________________

## Task A9: readdir, stat, read, search core

**Files:**

- Create: `typescript/packages/node/src/core/postgres/readdir.ts`
- Create: `typescript/packages/node/src/core/postgres/stat.ts`
- Create: `typescript/packages/node/src/core/postgres/read.ts`
- Create: `typescript/packages/node/src/core/postgres/search.ts`
- Tests for each.

Behavior must match Python:

- `readdir` per scope level returns the right children.
- `stat` returns a `FileStat` with `kind: 'file' | 'dir'`, `size`, `mtime`. For synthetic JSONs, `size` is `Buffer.byteLength` of the produced JSON; for `rows.jsonl`, `size` comes from `pg_total_relation_size` (estimate).
- `read` for `database.json`/`schema.json` returns the synthetic bytes. For `rows.jsonl`, applies the size guard, otherwise calls `selectRows` and JSONL-encodes each row (use `JSON.stringify` per row + `\n`).
- `search` is the grep-pushdown helper: returns matching rows over text-typed columns. Allowed types match Python: `text`, `character varying`, `character`, `name`, `uuid`, `json`, `jsonb`.

Commit: `feat(postgres-ts): readdir/stat/read/search core for postgres`.

______________________________________________________________________

## Task A10: Op registration

**Files:**

- Create: `typescript/packages/node/src/ops/postgres/read.ts`
- Create: `typescript/packages/node/src/ops/postgres/readdir.ts`
- Create: `typescript/packages/node/src/ops/postgres/stat.ts`
- Create: `typescript/packages/node/src/ops/postgres/index.ts` (exports `POSTGRES_OPS: readonly RegisteredOp[]`)
- Create: `typescript/packages/node/src/ops/postgres/index.test.ts`

Each op file exports a singleton `RegisteredOp` with `resource: ResourceName.POSTGRES`, `write: false`, `fn: (accessor, path) => coreFn(accessor as PostgresAccessor, path)`.

Test asserts the array contains exactly the expected names.

Commit: `feat(postgres-ts): register postgres VFS ops`.

______________________________________________________________________

## Task A11: Resource class + registry wiring

**Files:**

- Flesh out: `typescript/packages/node/src/resource/postgres/postgres.ts`
- Modify: `typescript/packages/node/src/resource/registry.ts` — add the `postgres` factory and the `normalizePostgresConfig` import.
- Modify: `typescript/packages/node/src/resource/registry.test.ts` — add `'postgres'` to the expected registry entries.

Resource shape (mirror `RedisResource`):

```ts
export class PostgresResource implements Resource {
  readonly kind = ResourceName.POSTGRES
  readonly isRemote = true
  readonly indexTtl = 0
  readonly prompt: string
  readonly config: PostgresConfigResolved
  readonly store: PostgresStore
  readonly accessor: PostgresAccessor
  readonly index: IndexCacheStore = new RAMIndexCacheStore()

  constructor(config: PostgresConfig) {
    this.config = resolvePostgresConfig(config)
    this.store = new PostgresStore(this.config)
    this.accessor = new PostgresAccessor(this.store, this.config)
    this.prompt = POSTGRES_PROMPT.replace('{prefix}', '')
  }

  ops(): readonly RegisteredOp[] { return POSTGRES_OPS }
  commands(): readonly RegisteredCommand[] { return POSTGRES_COMMANDS }  // populated in A12
  async open() {}
  async close() { await this.store.close() }
  // glob: use core/postgres/glob.ts
}
```

Test: `buildResource('postgres', { dsn: '…' })` returns a working instance, `resource.kind === 'postgres'`, `resource.ops()` includes `read_bytes`/`readdir`/`stat`.

Commit: `feat(postgres-ts): PostgresResource + registry entry`.

______________________________________________________________________

## Task A12: Commands — ls, stat, head, tail, wc, cat, grep, find, tree, jq, rg

**Files:**

- Create: `typescript/packages/node/src/commands/builtin/postgres/{ls,stat,head,tail,wc,cat,find,tree,jq,rg}.ts`
- Create: `typescript/packages/node/src/commands/builtin/postgres/grep/{index.ts,run.ts}` (mirror Python's split if needed, otherwise a single `grep.ts`)
- Create: `typescript/packages/node/src/commands/builtin/postgres/index.ts` (exports `POSTGRES_COMMANDS`)
- Tests under `commands/builtin/postgres/*.test.ts`. At minimum write a focused test for `cat` that surfaces the size guard as `exit_code=1 + stderr` (this is the regression check for the Python bug).

Each command is a static `RegisteredCommand` tied to the existing `CommandSpec` declared in `core/src/commands/spec/types.ts`. Pushdown rules per command port verbatim from Python:

- `head -n N rows.jsonl` → `LIMIT N`
- `tail -n N rows.jsonl` → `LIMIT N OFFSET row_count - N` (one extra `COUNT(*)` query)
- `wc -l rows.jsonl` → `SELECT COUNT(*) FROM …`
- `grep <pattern> rows.jsonl` → `WHERE col1 ILIKE %pattern% OR col2 ILIKE %pattern% …` over text-typed columns only
- `cat rows.jsonl` → goes through `read` op; size guard surfaces as a non-zero exit + stderr

Wire `POSTGRES_COMMANDS` from `index.ts`.

Commit: `feat(postgres-ts): builtin commands for postgres`.

______________________________________________________________________

## Task A13: Mount integration test + snapshot

**Files:**

- Create: `typescript/packages/node/src/resource/postgres/postgres_mount.test.ts`

End-to-end test using a mocked `pg.Pool` (no live DB). Mount as `/pg/`, exercise:

- `readdir('/pg')` → `['database.json', 'public', …]`
- `read('/pg/database.json')` → JSON.parse to expected shape
- `read('/pg/public/tables/users/schema.json')` → expected shape
- `read('/pg/public/tables/users/rows.jsonl')` with 10k+ row estimate → size guard throws
- `read('/pg/public/tables/users/rows.jsonl')` with small estimate → JSONL bytes

Run `pnpm --filter @struktoai/mirage-node test`. Run `pnpm --filter @struktoai/mirage-node typecheck`.

Commit: `test(postgres-ts): mount integration coverage`.

______________________________________________________________________

## Task A14: Live smoke test (manual, not committed as test)

Run against the same Supabase instance used by Python (`POSTGRES_DSN` in `.env.development`). Spin up a small TS script:

```ts
import { buildResource } from '@struktoai/mirage-node'
const r = await buildResource('postgres', { dsn: process.env.POSTGRES_DSN! })
// readdir, read database.json, read schema.json, head -n 3 rows.jsonl, etc.
```

Verify outputs match Python's. Confirm the size guard fires on a large table. Don't commit the script — keep it disposable. Document the verified commands in the PR description instead.

______________________________________________________________________

# Phase B — Browser

## Task B1: Driver abstraction

**Files:**

- Move the driver-bound parts of `PostgresStore` behind an interface. Define `interface PgDriver { query(sql, params?): Promise<PgQueryResult>; close(): Promise<void> }`.
- Refactor `PostgresStore` to take a `PgDriver` factory rather than directly importing `pg`. The node factory wraps `pg.Pool`; the browser factory wraps the Neon serverless client.
- Move `PostgresStore` + `PostgresAccessor` + the entire `core/postgres/*` tree into `@struktoai/mirage-core` so the browser package can re-use them. Node-only piece is the `pg`-driver factory; browser-only piece is the Neon-driver factory.

This is a breaking-but-internal refactor: re-export the same class names from `@struktoai/mirage-node` for backwards source compatibility within the monorepo.

Run all node tests after the move.

Commit: `refactor(postgres-ts): hoist core to @struktoai/mirage-core behind PgDriver interface`.

______________________________________________________________________

## Task B2: Neon serverless driver

**Files:**

- Create: `typescript/packages/browser/src/resource/postgres/neon_driver.ts`
- Add `@neondatabase/serverless` as a peer dep in `typescript/packages/browser/package.json`.

Wraps `neon(connectionString)` from `@neondatabase/serverless`. Implements the `PgDriver` interface. Use the SQL-tag form (`sql<...>(strings, ...values)`) under the hood — convert `(text, params)` tuples by splitting `$1, $2, …` and reconstructing the tag arguments.

Tests: mock the Neon module, assert SQL pass-through.

Commit: `feat(postgres-ts): browser Neon driver`.

______________________________________________________________________

## Task B3: Browser PostgresResource

**Files:**

- Create: `typescript/packages/browser/src/resource/postgres/postgres.ts` — same shape as the node resource but constructs the store with the Neon driver factory.
- Modify: `typescript/packages/browser/src/resource/registry.ts` (or whatever the browser equivalent is — confirm during execution) to register `postgres`.

Test: `buildResource('postgres', { dsn: 'postgres://…' })` from the browser package returns a usable resource against a mocked Neon driver.

Commit: `feat(postgres-ts): browser PostgresResource via Neon`.

______________________________________________________________________

## Task B4: PGlite secondary driver (optional, demo path)

**Files:**

- Create: `typescript/packages/browser/src/resource/postgres/pglite_driver.ts`
- Add `@electric-sql/pglite` as an optional peer dep.

Same `PgDriver` interface, backed by `new PGlite()`. Used for zero-infra demos (no DSN needed; runs Postgres in WASM in the browser). Resource picks the driver by config: `{ driver: 'neon' | 'pglite' }` with `'neon'` default.

Commit: `feat(postgres-ts): optional PGlite driver for in-browser demos`.

______________________________________________________________________

## Task B5: Browser example

**Files:**

- Create: `examples/typescript/browser/postgres/index.html` + `index.ts` — a minimal Vite page that mounts a Postgres resource, lists `/pg/`, reads `database.json`, and runs `head -n 3 rows.jsonl`. Use Neon if a DSN is provided in the URL hash, otherwise PGlite with a seeded sample DB.

Commit: `examples(postgres-ts): browser demo with Neon + PGlite`.

______________________________________________________________________

## Task B6: Cross-runtime parity test

**Files:**

- Create: `typescript/packages/node/src/resource/postgres/parity.test.ts` (or wherever the cross-package tests live)

Mock both drivers against the same fake schema; assert that the JSON bytes produced by `database.json`, `schema.json`, and `rows.jsonl` match between node and browser builds. Catches any drift after future driver changes.

Commit: `test(postgres-ts): cross-driver parity coverage`.

______________________________________________________________________

# Open Questions for User

1. **Driver choice for node** — `pg` is the safest pick (mature, widely deployed, `@types/pg` is solid). `postgres.js` is faster but requires reworking parameter binding. Defaulting to `pg`. Override?

1. **Driver choice for browser primary** — Neon serverless is the natural fit (real Postgres wire over HTTPS/WS, no infra). PGlite is a great demo path but doesn't connect to real DBs. Plan defaults to Neon as primary, PGlite as the optional demo driver. Confirm?

1. **Phase A only first?** — Phase A is ~2 days of subagent work. Phase B is another ~1 day but depends on Neon being available. Recommend merging Phase A as its own PR before starting Phase B. OK?

1. **Where does shared core live after B1?** — Plan moves `core/postgres/*` from `@struktoai/mirage-node` to `@struktoai/mirage-core` in B1. This is the smallest hoist that keeps the node implementation intact while letting browser reuse it. Alternative: keep duplicates per package. Recommend the hoist. Confirm?
