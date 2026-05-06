# MongoDB TypeScript Resource Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Port `python/mirage/resource/mongodb/` to TypeScript with the same path layout, the same `single_db` collapse mode, and the same default-doc-limit semantics. Phase A targets `@struktoai/mirage-core` + `@struktoai/mirage-node` using the official `mongodb` driver. Phase B adds browser support via an HTTP proxy driver (Atlas Data API was deprecated in March 2025; the proxy works against any MongoDB).

**Key learnings applied from the postgres port:**

1. **Hoist to `@struktoai/mirage-core` from day one.** Don't put the core layer in `@struktoai/mirage-node` and re-shuffle later — that's the painful refactor we did in `d8146137`. Mongo's core (driver-agnostic logic + accessor + ops + commands) lives in `@struktoai/mirage-core` from the start.
1. **`MongoDriver` interface in core upfront.** Browser and node both implement it. Avoids the `PgDriver`-shaped retrofit.
1. **Skip `database.json` / `schema.json` synthetic files.** Mongo is schema-less; collections are leaf JSONL files, not folders. Path layout is `/<db>/<col>.jsonl`. Simpler, fewer scope levels.

**Architecture:** Same shape as the postgres TS port post-hoist:

- `core/src/core/mongodb/{_driver,_client,scope,glob,readdir,stat,read,search}.ts`
- `core/src/accessor/mongodb.ts`
- `core/src/ops/mongodb/*.ts` (read/readdir/stat)
- `core/src/commands/builtin/mongodb/*.ts` (11 commands + `_provision.ts`)
- `core/src/resource/mongodb/{config,prompt}.ts`
- `node/src/resource/mongodb/{store,mongodb}.ts` — node Mongo driver via `mongodb` package, `MongoDBResource` class
- `browser/src/resource/mongodb/{http_driver,mongodb}.ts` — fetch-based driver, `BrowserMongoDBResource`

**Reference:** Python at `python/mirage/{accessor,core,ops,resource}/mongodb/` and `python/mirage/commands/builtin/mongodb/`. Driver methods, scope rules, default limits port verbatim.

______________________________________________________________________

## Path Layout

Identical to Python.

```
my_app/                                  # mount root (no synthetic database.json — schemaless)
├── users/                               # database
│   ├── profiles.jsonl                   # collection — JSONL of documents
│   └── sessions.jsonl
└── analytics/
    ├── events.jsonl
    └── pageviews.jsonl
```

**Single-db mode:** When `MongoDBConfig.databases = ["my_app"]` (exactly one), the `/my_app/` level collapses and you get `/profiles.jsonl` directly at the root. Useful for app-specific mounts.

## Path Levels (for `scope.ts`)

| Level      | Multi-db example         | Single-db example | What it is                         |
| ---------- | ------------------------ | ----------------- | ---------------------------------- |
| `root`     | `/`                      | n/a (collapses)   | List of databases                  |
| `database` | `/my_app`                | `/`               | List of `<col>.jsonl` files        |
| `file`     | `/my_app/profiles.jsonl` | `/profiles.jsonl` | The collection's documents (JSONL) |

Anything else → ENOENT.

## Doc-Limit Semantics

Different from postgres' EXPLAIN-based size guard. Mongo uses three knobs:

- `defaultDocLimit` (default `1000`) — used when a `cat` reads a collection without explicit limit/offset.
- `maxDocLimit` (default `5000`) — hard cap on any single read.
- `defaultSearchLimit` (default `100`) — for `grep`/`rg`-style searches.

No EXPLAIN equivalent in Mongo (cardinality estimates aren't free). We just always paginate — `cat` returns up to `defaultDocLimit` docs and the agent uses `head -n N` / `tail -n N` to push limits down to `find().limit()`.

## Read-Only Discipline

For Phase A: read-only ops only. No writes. Future phase could add `INSERT`/`UPDATE`/`DELETE` via shell semantics.

______________________________________________________________________

# Phase A — Node + Core (`@struktoai/mirage-core` + `@struktoai/mirage-node`)

## Task A1: Add `mongodb` peer dependency to node package

**Files:** Modify `typescript/packages/node/package.json`.

- Add `"mongodb": "^6.10.0"` to `peerDependencies`, `peerDependenciesMeta` (optional), and `devDependencies`.
- `cd typescript && pnpm install`
- Verify: `node -e "import('mongodb').then(m => console.log(m.MongoClient.name))"` from inside `packages/node` → `MongoClient`.

Commit: `feat(mongodb-ts): add mongodb as optional peer dependency`.

______________________________________________________________________

## Task A2: Define `MongoDriver` interface + MongoDBConfig + prompt in core

**Files (all in core):**

- `typescript/packages/core/src/core/mongodb/_driver.ts`:

  ```ts
  export interface MongoQueryResult<T = Record<string, unknown>> {
    docs: T[]
  }
  export interface MongoDriver {
    listDatabases(): Promise<string[]>
    listCollections(database: string): Promise<string[]>
    findDocuments<T = Record<string, unknown>>(
      database: string,
      collection: string,
      filter?: Record<string, unknown>,
      options?: { limit?: number; sort?: Record<string, 1 | -1>; projection?: Record<string, unknown> },
    ): Promise<T[]>
    countDocuments(
      database: string,
      collection: string,
      filter?: Record<string, unknown>,
    ): Promise<number>
    listIndexes(database: string, collection: string): Promise<Array<Record<string, unknown>>>
    close(): Promise<void>
  }
  ```

  This abstracts all Mongo operations — node's MongoClient and browser's HTTP proxy both implement it.

- `typescript/packages/core/src/resource/mongodb/config.ts`:

  ```ts
  export interface MongoDBConfig {
    uri: string
    databases?: readonly string[]
    defaultDocLimit?: number
    defaultSearchLimit?: number
    maxDocLimit?: number
  }
  export interface MongoDBConfigResolved {
    uri: string
    databases: readonly string[] | null
    defaultDocLimit: number
    defaultSearchLimit: number
    maxDocLimit: number
  }
  export function normalizeMongoDBConfig(input: Record<string, unknown>): MongoDBConfig
  export function resolveMongoDBConfig(config: MongoDBConfig): MongoDBConfigResolved
  ```

  Defaults match Python: `defaultDocLimit=1000`, `defaultSearchLimit=100`, `maxDocLimit=5000`.

- `typescript/packages/core/src/resource/mongodb/prompt.ts` — port `python/mirage/resource/mongodb/prompt.py` text verbatim.

**Test:** `core/src/resource/mongodb/config.test.ts` — defaults, snake_case→camelCase, single-db config.

Commit: `feat(mongodb-ts): MongoDriver interface + config + prompt in core`.

______________________________________________________________________

## Task A3: MongoDBAccessor in core

**File:** `typescript/packages/core/src/accessor/mongodb.ts`:

```ts
export class MongoDBAccessor extends Accessor {
  readonly driver: MongoDriver
  readonly config: MongoDBConfigResolved
  constructor(driver: MongoDriver, config: MongoDBConfigResolved) {
    super()
    this.driver = driver
    this.config = config
  }
}
```

**Test:** holds driver + config.

Commit: `feat(mongodb-ts): add MongoDBAccessor in core`.

______________________________________________________________________

## Task A4: Core `_client.ts` thin wrappers

**File:** `typescript/packages/core/src/core/mongodb/_client.ts` — port `python/mirage/core/mongodb/_client.py`:

- `listDatabases(accessor)` — calls `accessor.driver.listDatabases()`, filters out `admin`/`local`/`config`, applies `databases` allowlist, returns sorted.
- `listCollections(accessor, db)` — calls `accessor.driver.listCollections(db)`, returns sorted.
- `findDocuments(accessor, db, collection, opts)` — passes through to driver; bumps limit by `Math.min(opts.limit, config.maxDocLimit)`.
- `countDocuments(accessor, db, collection, filter?)` — passes through.
- `listIndexes(accessor, db, collection)` — passes through.

**Test:** mock driver, assert SQL-pattern equivalent (filter, limit, sort args).

Commit: `feat(mongodb-ts): core/mongodb/_client wrappers`.

______________________________________________________________________

## Task A5: Scope detection

**File:** `typescript/packages/core/src/core/mongodb/scope.ts` — port `python/mirage/core/mongodb/scope.py`:

```ts
export interface MongoDBScope {
  level: 'root' | 'database' | 'file' | 'invalid'
  database: string | null
  collection: string | null
  resourcePath: string
}
export function detectScope(
  path: PathSpec | string,
  options?: { singleDb?: boolean; singleDbName?: string | null },
): MongoDBScope
```

Honor single-db mode: with `singleDb=true`, `/` becomes `database`, `/foo.jsonl` becomes `file`. Without, `/foo` is `database`, `/foo/bar.jsonl` is `file`.

**Test:** all the same cases as `python/tests/core/mongodb/test_scope.py`.

Commit: `feat(mongodb-ts): scope detection`.

______________________________________________________________________

## Task A6: readdir / stat / read / search core

**Files (in core):**

- `core/src/core/mongodb/readdir.ts` — list databases, list collections (suffixed `.jsonl`), single-db collapse.
- `core/src/core/mongodb/stat.ts` — `FileStat` per scope level. For `file` scope, `size: null` (unknown without a count query — match Python).
- `core/src/core/mongodb/read.ts` — `find()` with `limit = config.defaultDocLimit`, JSONL-encode each doc with BSON-aware serializer (ObjectId → string, Date → ISO, etc.).
- `core/src/core/mongodb/search.ts` — port Python's `_text_search`: build `$or` of `$regex` against each text field (heuristic: any string-typed field). Cap at `config.defaultSearchLimit`.
- `core/src/core/mongodb/glob.ts` — same fnmatch-style as postgres glob; calls readdir.

**Tests:** focused tests per module mocking the driver (similar to postgres pattern).

**BSON serializer note:** the `mongodb` Node driver returns `ObjectId`, `Date`, `Decimal128`, `Long`, `Binary`, `BSONRegExp`, `Timestamp`. JSON.stringify-by-default converts `Date` to ISO; everything else needs a custom replacer:

```ts
function bsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  // ObjectId / Decimal128 / Long / Binary all have toJSON or toString
  if (typeof value === 'object' && value !== null && 'toJSON' in value) return (value as { toJSON(): unknown }).toJSON()
  return value
}
```

Verify against real Atlas data in A14.

Commit: `feat(mongodb-ts): readdir/stat/read/search/glob core`.

______________________________________________________________________

## Task A7: Op registration in core

**Files:** `core/src/ops/mongodb/{read,readdir,stat,index}.ts` + `index.test.ts`.

Three ops, all read-only, all targeting `ResourceName.MONGODB`. Mirror `core/src/ops/postgres/*` exactly.

Commit: `feat(mongodb-ts): register Mongo VFS ops`.

______________________________________________________________________

## Task A8: Builtin commands in core

**Files:** `core/src/commands/builtin/mongodb/{ls,stat,head,tail,wc,cat,grep,find,tree,jq,rg}.ts` + `_provision.ts` + `index.ts`.

Port `python/mirage/commands/builtin/mongodb/*.py`. Pushdowns:

- `head -n N foo.jsonl` → `findDocuments(db, col, {}, { limit: N })`
- `tail -n N foo.jsonl` → `countDocuments` then `findDocuments(... { sort: { _id: -1 }, limit: N })` then reverse client-side
- `wc -l foo.jsonl` → `countDocuments`
- `grep <pat> foo.jsonl` (and `rg`) → use `core/mongodb/search.ts` with `$regex`
- `cat` → goes through `read` op (returns up to `defaultDocLimit`); honor explicit `limit`/`offset` via kwargs

**Test:** `cat.test.ts` — verify it surfaces driver errors as `exitCode=1 + stderr` (parallel to postgres regression).

Commit: `feat(mongodb-ts): builtin commands for mongodb`.

______________________________________________________________________

## Task A9: Node `MongoDBStore` (driver implementation) + `MongoDBResource`

**Files:**

- `typescript/packages/node/src/resource/mongodb/store.ts`:
  ```ts
  import { loadOptionalPeer, type MongoDriver } from '@struktoai/mirage-core'
  import type { MongoClient } from 'mongodb'

  export class MongoDBStore implements MongoDriver {
    private clientPromise: Promise<MongoClient> | null = null
    constructor(readonly uri: string) {}
    private async client(): Promise<MongoClient> {
      this.clientPromise ??= (async () => {
        const mod = await loadOptionalPeer(() => import('mongodb'), {
          feature: 'MongoDBResource', packageName: 'mongodb',
        })
        const c = new mod.MongoClient(this.uri)
        await c.connect()
        return c
      })()
      return this.clientPromise
    }
    async listDatabases(): Promise<string[]> {
      const c = await this.client()
      const r = await c.db().admin().listDatabases()
      return r.databases.map(d => d.name)
    }
    // ... listCollections, findDocuments, countDocuments, listIndexes, close
  }
  ```
- `typescript/packages/node/src/resource/mongodb/mongodb.ts` — `MongoDBResource implements Resource`. Same shape as `node/src/resource/postgres/postgres.ts`.

**Tests:** `store.test.ts` mocks `mongodb` module. `mongodb_mount.test.ts` exercises end-to-end via `Workspace.execute()` with mocked driver, ports the same 7 cases as `postgres_mount.test.ts` adapted to Mongo path layout.

Commit: `feat(mongodb-ts): MongoDBStore + MongoDBResource (node)`.

______________________________________________________________________

## Task A10: Wire node registry + index.ts

**Files:**

- `typescript/packages/node/src/resource/registry.ts` — add `mongodb` factory.
- `typescript/packages/node/src/resource/registry.test.ts` — assert `'mongodb'` in `knownResources()`.
- `typescript/packages/node/src/index.ts` — export `MongoDBResource`, `MongoDBStore`. (Accessor / config / ops / commands flow through `export * from '@struktoai/mirage-core'`.)

Commit: `feat(mongodb-ts): wire mongodb into node registry`.

______________________________________________________________________

## Task A11: Live smoke test against Atlas

**Steps:**

- `MONGODB_URI` is already in `.env.development`.
- Write a disposable `tsx` script (don't commit) at `typescript/packages/node/smoke.ts` that mirrors what we did for postgres:
  - `buildResource('mongodb', { uri })`
  - `readdir('/')` → list databases
  - `readdir('/<db>')` → list collections
  - `readFile('/<db>/<col>.jsonl')` → JSONL bytes
- Run `tsx smoke.ts`. Expect output to match Python's smoke against the same Atlas instance.
- Anticipated bugs to watch for (parallel to postgres' QUERY-PLAN bug):
  - BSON serialization edge cases (ObjectId, Decimal128) — the bsonReplacer must produce strings, not objects.
  - Mongo's `_id` field appears in every doc — test reading + grep against it.

Commit any bug fixes; **delete `smoke.ts` before final stage**.

______________________________________________________________________

## Task A12: TS examples mirroring Python

**Files (NEW):**

- `examples/typescript/mongodb/mongodb.ts` — `Workspace.execute()` exercising all 11 commands against live Atlas. Mirror `examples/typescript/postgres/postgres.ts`.
- `examples/typescript/mongodb/mongodb_vfs.ts` — VFS shell pipelines.
- `examples/typescript/mongodb/mongodb_fuse.ts` — FUSE mount via `FuseManager`. Same caveats as postgres FUSE (use `ws.execute()` for content reads).

**Run:**

```bash
./typescript/node_modules/.bin/tsx examples/typescript/mongodb/mongodb.ts
./typescript/node_modules/.bin/tsx examples/typescript/mongodb/mongodb_vfs.ts
./typescript/node_modules/.bin/tsx examples/typescript/mongodb/mongodb_fuse.ts
```

Commit: `examples(mongodb-ts): add mongodb / mongodb_vfs / mongodb_fuse`.

______________________________________________________________________

# Phase B — Browser

## Task B1: HTTP proxy driver in browser

**Files (NEW):**

- `typescript/packages/browser/src/resource/mongodb/http_driver.ts`:
  ```ts
  export interface HttpMongoDriverOptions {
    endpoint: string  // e.g., '/api/mongo'
    fetchImpl?: typeof fetch
    headers?: Record<string, string>
  }
  export class HttpMongoDriver implements MongoDriver {
    constructor(options: HttpMongoDriverOptions)
    private async post<T>(op: string, payload: unknown): Promise<T> {
      const r = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.headers },
        body: JSON.stringify({ op, ...payload }),
      })
      if (!r.ok) throw new Error(`mongo proxy ${op} → ${r.status} ${await r.text()}`)
      return r.json()
    }
    listDatabases() { return this.post<string[]>('listDatabases', {}) }
    listCollections(db: string) { return this.post<string[]>('listCollections', { db }) }
    findDocuments(...) { return this.post('findDocuments', { ... }) }
    // ... etc.
    async close(): Promise<void> {}
  }
  ```
- `typescript/packages/browser/src/resource/mongodb/mongodb.ts` — `BrowserMongoDBResource`. Constructor accepts `{ config, driver }` so users can inject any driver (default = HttpMongoDriver constructed from `config.uri` if it's an HTTPS URL).

**Test:** mock `fetch`, assert request shapes.

Commit: `feat(mongodb-ts): browser MongoDBResource via HTTP proxy driver`.

______________________________________________________________________

## Task B2: Vite middleware for the proxy + browser demo

**Files (NEW):**

- `examples/typescript/browser/scripts/mongo_proxy.ts` — middleware that:
  - On POST to `/api/mongo`, parse `{ op, ... }`, dispatch to a long-lived `MongoClient` (loaded from `mongodb` package; node-side, since vite dev server runs in node).
  - Implement: `listDatabases`, `listCollections`, `findDocuments`, `countDocuments`, `listIndexes`.
  - Read `MONGODB_URI` from `.env.development`.
- Modify `examples/typescript/browser/vite.config.ts` — register `mongo_proxy` plugin alongside `mirage-presigner`.
- `examples/typescript/browser/mongodb.html` + `src/mongodb.ts` — demo page mirroring `postgres.html`. Construct `BrowserMongoDBResource` with `HttpMongoDriver({ endpoint: '/api/mongo' })`. Run `ls /mongodb`, `cat .../profiles.jsonl | head -n 3`, etc.
- `examples/typescript/browser/scripts/mongodb_smoke.mjs` — playwright headless runner.

**Run:**

```bash
cd examples/typescript/browser && node scripts/mongodb_smoke.mjs
```

Expect "done." in the page log + matching output to the Atlas data.

Commit: `feat(mongodb-ts): browser demo (HTTP proxy via Vite middleware) + headless smoke`.

______________________________________________________________________

# Open Questions for User

1. **Browser driver — proxy vs Realm Web SDK?** Plan defaults to the HTTP-proxy approach because it works against any MongoDB. Realm Web SDK only works for Atlas customers who've configured App Services (extra setup, brittle). Confirm proxy?

1. **Single-db mode prominence.** Python supports it as a config flag. Plan ports it as-is. Worth surfacing as the *recommended* mode for browser demos (collapses paths)?

1. **Phase A as its own PR?** Same as the postgres flow — Phase A is a complete, mergeable unit. Phase B follows. Confirm.

1. **`mongodb` package version.** Plan says `^6.10.0` (current latest). The official driver also has a [`mongodb-rust-driver`](https://github.com/mongodb/mongo-rust-driver) and [`@mongodb-js/driver-extensions`](https://github.com/mongodb-js) variants. Sticking with vanilla `mongodb` (most common).
