# Postgres Resource Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Mount a Postgres database in MIRAGE so each Postgres schema is a folder containing `tables/` and `views/`, each table/view is itself a folder holding `schema.json` (its column structure) and `rows.jsonl` (its data). A single `database.json` at the root describes cross-table relationships and rough sizes. Read-only at first, with a size guard that refuses a full `rows.jsonl` read above configurable thresholds and steers the agent toward `head`/`tail`/`grep`.

**Architecture:** Mirrors the MongoDB resource (`accessor/postgres.py`, `core/postgres/*`, `ops/postgres/*`, `commands/builtin/postgres/*`, `resource/postgres/*`). Reads use `asyncpg`. Tables come from `information_schema.tables` (`table_type='BASE TABLE'`), views from `information_schema.views`, materialized views from `pg_matviews`. The synthetic JSON files (`database.json`, per-entity `schema.json`) are composed on read from `information_schema` + `pg_catalog`. Size guard runs `EXPLAIN (FORMAT JSON) SELECT * FROM <table>` and refuses unbounded reads above thresholds. `head`/`tail`/`wc`/`grep` push predicates down to SQL and bypass the guard.

**Tech Stack:** `asyncpg`, `pydantic`, `pytest` + `pytest-asyncio`, `unittest.mock.AsyncMock`, `orjson`.

______________________________________________________________________

## Path Layout

```
acme_prod/                                  # database name (mount root)
├── database.json                           # cross-schema topology + relationships
├── public/                                 # Postgres schema = folder
│   ├── tables/
│   │   └── users/
│   │       ├── schema.json                 # this table's columns/PK/FK/indexes/size
│   │       └── rows.jsonl                  # the data (size-guarded)
│   └── views/
│       └── customer_360/
│           ├── schema.json
│           └── rows.jsonl
└── analytics/
    ├── tables/
    │   └── events/
    │       ├── schema.json
    │       └── rows.jsonl
    └── views/
        └── daily_revenue/
            ├── schema.json
            └── rows.jsonl
```

The Postgres-schema folder is **always** shown (option A — no single-schema collapse). Materialized views are listed under `views/` alongside regular views; their `schema.json` carries `"kind": "materialized"`.

## Path Levels (for `scope.py`)

| Level           | Example                            | What it is                        |
| --------------- | ---------------------------------- | --------------------------------- |
| `root`          | `/`                                | The database root                 |
| `database_json` | `/database.json`                   | Synthetic root file               |
| `schema`        | `/public`                          | Postgres schema directory         |
| `kind`          | `/public/tables`                   | The `tables` or `views` directory |
| `entity`        | `/public/tables/users`             | One table/view folder             |
| `entity_schema` | `/public/tables/users/schema.json` | Synthetic per-entity card         |
| `entity_rows`   | `/public/tables/users/rows.jsonl`  | The data file                     |

Anything else → `FileNotFoundError`.

## `database.json` shape

```json
{
  "database": "acme_prod",
  "schemas": ["public", "analytics"],
  "tables": [
    {"schema": "public", "name": "users", "row_count_estimate": 12453, "size_bytes_estimate": 2097152}
  ],
  "views": [
    {"schema": "analytics", "name": "daily_revenue", "kind": "materialized"}
  ],
  "relationships": [
    {
      "from": {"schema": "public", "table": "orders", "columns": ["user_id"]},
      "to":   {"schema": "public", "table": "users",  "columns": ["id"]},
      "kind": "many_to_one"
    }
  ]
}
```

## Per-entity `schema.json` shape

```json
{
  "schema": "public",
  "name": "users",
  "kind": "table",
  "columns": [
    {"name": "id", "type": "uuid", "nullable": false, "primary_key": true},
    {"name": "team_id", "type": "uuid", "nullable": true,
     "references": {"schema": "public", "table": "teams", "column": "id"}}
  ],
  "primary_key": ["id"],
  "foreign_keys": [
    {"columns": ["team_id"], "references": {"schema": "public", "table": "teams", "columns": ["id"]}}
  ],
  "indexes": [{"name": "users_email_idx", "columns": ["email"], "unique": true}],
  "row_count_estimate": 12453,
  "size_bytes_estimate": 2097152
}
```

`kind` is `"table"`, `"view"`, or `"materialized_view"`.

## Size Guard

`PostgresConfig.max_read_rows` (default `10_000`) and `max_read_bytes` (default `10 * 1024 * 1024`). Applies **only to `rows.jsonl`** reads with no `limit`/`offset`. Synthetic JSON files (`database.json`, per-entity `schema.json`) bypass the guard — they're metadata-bounded.

When `core.postgres.read.read()` is called against `rows.jsonl` without `limit`/`offset`, it runs `EXPLAIN (FORMAT JSON) SELECT * FROM <schema>.<entity>`, reads `Plan Rows`/`Plan Width`. If `rows > max_read_rows` or `rows * width > max_read_bytes`, raise `ValueError` with a message naming the path and suggesting `head`, `tail`, `wc`, `grep`, or explicit `limit`/`offset`. `cat` surfaces this as `exit_code=1` + `stderr`.

## Read-Only Discipline

Pool opens with `default_transaction_read_only='on'`. Resource registers only read ops + read-only commands. No write ops.

______________________________________________________________________

## Task List

### Task 1: Add `postgres` optional dependency

**Files:** Modify `python/pyproject.toml`.

**Step 1:** Add to `[project.optional-dependencies]` (alphabetical):

```toml
# --- postgres ---
postgres = ["asyncpg>=0.30.0"]
```

Add `"mirage-ai[postgres]"` to the `all` list.

**Step 2:** `cd python && uv sync --all-extras --no-extra camel`

**Step 3:** `./python/.venv/bin/python -c "import asyncpg; print(asyncpg.__version__)"` — expect a version string.

**Step 4:** Commit:

```bash
git add python/pyproject.toml python/uv.lock
git commit -m "feat(postgres): add asyncpg optional dependency"
```

______________________________________________________________________

### Task 2: Resource config + package shell

**Files:**

- Create: `python/mirage/resource/postgres/__init__.py`
- Create: `python/mirage/resource/postgres/config.py`
- Create: `python/mirage/resource/postgres/prompt.py`
- Test: `python/tests/resource/postgres/__init__.py` (empty)
- Test: `python/tests/resource/postgres/test_config.py`

**Step 1: Failing test**

```python
from mirage.resource.postgres.config import PostgresConfig


def test_defaults():
    cfg = PostgresConfig(dsn="postgres://localhost/db")
    assert cfg.dsn == "postgres://localhost/db"
    assert cfg.schemas is None
    assert cfg.default_row_limit == 1000
    assert cfg.max_read_rows == 10_000
    assert cfg.max_read_bytes == 10 * 1024 * 1024
    assert cfg.default_search_limit == 100


def test_schema_filter():
    cfg = PostgresConfig(dsn="postgres://localhost/db", schemas=["public"])
    assert cfg.schemas == ["public"]
```

**Step 2:** `cd python && uv run pytest tests/resource/postgres/test_config.py -v` — fails with ModuleNotFoundError.

**Step 3: Implement**

`python/mirage/resource/postgres/config.py`:

```python
from pydantic import BaseModel


class PostgresConfig(BaseModel):
    dsn: str
    schemas: list[str] | None = None
    default_row_limit: int = 1000
    max_read_rows: int = 10_000
    max_read_bytes: int = 10 * 1024 * 1024
    default_search_limit: int = 100
```

`python/mirage/resource/postgres/prompt.py`:

```python
PROMPT = """\
{prefix}
  database.json                  cross-schema graph + sizes
  <schema>/                      Postgres schema (namespace)
    tables/<table>/
      schema.json                column types, PK/FK, indexes
      rows.jsonl                 data (size-guarded)
    views/<view>/
      schema.json
      rows.jsonl
  Read database.json first to plan joins. Reading rows.jsonl is refused
  for tables above the configured row/byte threshold; use head, tail, wc,
  or grep, all of which push predicates down to SQL."""
```

`python/mirage/resource/postgres/__init__.py`:

```python
from mirage.resource.postgres.config import PostgresConfig

__all__ = ["PostgresConfig", "PostgresResource"]


def __getattr__(name: str):
    if name == "PostgresResource":
        from mirage.resource.postgres.postgres import PostgresResource
        return PostgresResource
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
```

**Step 4:** Run test — pass.

**Step 5: Commit**

```bash
git add python/mirage/resource/postgres python/tests/resource/postgres
git commit -m "feat(postgres): add PostgresConfig and package shell"
```

______________________________________________________________________

### Task 3: Accessor

**Files:** Create `python/mirage/accessor/postgres.py`; test `python/tests/resource/postgres/test_accessor.py`.

**Step 1: Failing test**

```python
from mirage.accessor.postgres import PostgresAccessor
from mirage.resource.postgres.config import PostgresConfig


def test_accessor_holds_config():
    cfg = PostgresConfig(dsn="postgres://localhost/db")
    a = PostgresAccessor(cfg)
    assert a.config is cfg
    assert a._pool is None
```

**Step 2:** Run — fails.

**Step 3: Implement**

```python
import asyncpg

from mirage.accessor.base import Accessor
from mirage.resource.postgres.config import PostgresConfig


class PostgresAccessor(Accessor):

    def __init__(self, config: PostgresConfig) -> None:
        self.config = config
        self._pool: asyncpg.Pool | None = None

    async def pool(self) -> asyncpg.Pool:
        if self._pool is None:
            self._pool = await asyncpg.create_pool(
                self.config.dsn,
                server_settings={"default_transaction_read_only": "on"},
                min_size=1,
                max_size=4,
            )
        return self._pool

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None
```

**Step 4:** Run — pass.

**Step 5:** Commit:

```bash
git add python/mirage/accessor/postgres.py python/tests/resource/postgres/test_accessor.py
git commit -m "feat(postgres): add PostgresAccessor with lazy read-only pool"
```

______________________________________________________________________

### Task 4: Low-level SQL client

**Files:**

- Create: `python/mirage/core/postgres/__init__.py` (empty)
- Create: `python/mirage/core/postgres/_client.py`
- Test: `python/tests/core/postgres/__init__.py` (empty)
- Test: `python/tests/core/postgres/test_client.py`

**Step 1: Failing tests** for: `list_schemas`, `list_tables`, `list_views`, `list_matviews`, `count_rows`, `estimate_size`, `fetch_rows`, `fetch_columns`, `fetch_primary_key`, `fetch_foreign_keys`, `fetch_indexes`, `fetch_relationships`, `fetch_table_size_bytes`, `fetch_estimated_row_count`. Each test mocks the asyncpg connection and asserts the parsed return.

**Step 2:** Run — fails.

**Step 3: Implement** (long file; key signatures below — fill in queries against `information_schema` and `pg_catalog`):

```python
import asyncpg


async def list_schemas(conn, allowlist: list[str] | None) -> list[str]: ...
async def list_tables(conn, schema: str) -> list[str]: ...
async def list_views(conn, schema: str) -> list[str]: ...           # information_schema.views
async def list_matviews(conn, schema: str) -> list[str]: ...        # pg_matviews
async def count_rows(conn, schema: str, name: str) -> int: ...
async def estimate_size(conn, schema: str, name: str) -> tuple[int, int]: ...   # (rows, width) from EXPLAIN JSON
async def estimated_row_count(conn, schema: str, name: str) -> int: ...         # pg_class.reltuples
async def table_size_bytes(conn, schema: str, name: str) -> int: ...            # pg_relation_size
async def fetch_rows(conn, schema: str, name: str, *, limit: int, offset: int) -> list[dict]: ...
async def fetch_columns(conn, schema: str, name: str) -> list[dict]: ...        # information_schema.columns
async def fetch_primary_key(conn, schema: str, name: str) -> list[str]: ...     # information_schema.table_constraints
async def fetch_foreign_keys(conn, schema: str, name: str) -> list[dict]: ...   # information_schema.referential_constraints
async def fetch_indexes(conn, schema: str, name: str) -> list[dict]: ...        # pg_indexes + pg_index
async def fetch_all_relationships(conn, schemas: list[str]) -> list[dict]: ...  # FK graph DB-wide
```

Implement queries with the standard catalog joins. For `fetch_columns`, return:

```python
[{"name": "id", "type": "uuid", "nullable": False}, ...]
```

For `fetch_foreign_keys`, return:

```python
[{"columns": ["team_id"],
  "references": {"schema": "public", "table": "teams", "columns": ["id"]}}]
```

**Step 4:** Run all `test_client.py` tests — pass.

**Step 5: Commit**

```bash
git add python/mirage/core/postgres python/tests/core/postgres/__init__.py python/tests/core/postgres/test_client.py
git commit -m "feat(postgres): low-level SQL client for catalog and data queries"
```

______________________________________________________________________

### Task 5: Synthetic JSON composers (`_schema_json.py`)

**Files:**

- Create: `python/mirage/core/postgres/_schema_json.py`
- Test: `python/tests/core/postgres/test_schema_json.py`

**Step 1: Failing tests** that mock `_client.py` functions and assert `build_database_json`, `build_table_schema_json`, `build_view_schema_json` produce dicts matching the shapes specified above (database.json + per-entity).

**Step 2:** Run — fails.

**Step 3: Implement**

```python
from mirage.accessor.postgres import PostgresAccessor
from mirage.core.postgres._client import (estimated_row_count, fetch_columns,
                                          fetch_foreign_keys, fetch_indexes,
                                          fetch_primary_key,
                                          fetch_all_relationships,
                                          list_matviews, list_schemas,
                                          list_tables, list_views,
                                          table_size_bytes)


async def build_database_json(accessor: PostgresAccessor) -> dict:
    pool = await accessor.pool()
    async with pool.acquire() as conn:
        schemas = await list_schemas(conn, accessor.config.schemas)
        tables: list[dict] = []
        views: list[dict] = []
        for s in schemas:
            for t in await list_tables(conn, s):
                tables.append({
                    "schema": s, "name": t,
                    "row_count_estimate": await estimated_row_count(conn, s, t),
                    "size_bytes_estimate": await table_size_bytes(conn, s, t),
                })
            for v in await list_views(conn, s):
                views.append({"schema": s, "name": v, "kind": "view"})
            for v in await list_matviews(conn, s):
                views.append({"schema": s, "name": v, "kind": "materialized"})
        relationships = await fetch_all_relationships(conn, schemas)
    return {
        "database": _db_name_from_dsn(accessor.config.dsn),
        "schemas": schemas,
        "tables": tables,
        "views": views,
        "relationships": relationships,
    }


async def build_entity_schema_json(accessor: PostgresAccessor, schema: str,
                                   name: str, kind: str) -> dict:
    pool = await accessor.pool()
    async with pool.acquire() as conn:
        cols = await fetch_columns(conn, schema, name)
        pk = await fetch_primary_key(conn, schema, name)
        fks = await fetch_foreign_keys(conn, schema, name)
        idx = await fetch_indexes(conn, schema, name)
        rows = await estimated_row_count(conn, schema, name)
        size = await table_size_bytes(conn, schema, name)
    pk_set = set(pk)
    fk_map = {}
    for fk in fks:
        for c in fk["columns"]:
            fk_map[c] = fk["references"]
    for col in cols:
        if col["name"] in pk_set:
            col["primary_key"] = True
        if col["name"] in fk_map:
            col["references"] = fk_map[col["name"]]
    return {
        "schema": schema, "name": name, "kind": kind,
        "columns": cols, "primary_key": pk, "foreign_keys": fks,
        "indexes": idx, "row_count_estimate": rows,
        "size_bytes_estimate": size,
    }


def _db_name_from_dsn(dsn: str) -> str:
    return dsn.rstrip("/").rsplit("/", 1)[-1].split("?")[0] or "postgres"
```

**Step 4:** Run — pass.

**Step 5: Commit**

```bash
git add python/mirage/core/postgres/_schema_json.py python/tests/core/postgres/test_schema_json.py
git commit -m "feat(postgres): compose database.json and per-entity schema.json"
```

______________________________________________________________________

### Task 6: Scope detection

**Files:** Create `python/mirage/core/postgres/scope.py`; test `python/tests/core/postgres/test_scope.py`.

**Step 1: Failing tests** for every level: `root`, `database_json`, `schema`, `kind`, `entity`, `entity_schema`, `entity_rows`. Plus invalid cases.

**Step 2:** Run — fails.

**Step 3: Implement**

```python
from dataclasses import dataclass

from mirage.types import PathSpec


@dataclass
class PostgresScope:
    level: str
    schema: str | None = None
    kind: str | None = None       # "tables" or "views"
    entity: str | None = None
    file: str | None = None       # "schema.json" or "rows.jsonl"
    resource_path: str = "/"


def detect_scope(path: PathSpec) -> PostgresScope:
    raw = path.strip_prefix if isinstance(path, PathSpec) else path
    key = raw.strip("/")

    if not key:
        return PostgresScope(level="root", resource_path="/")

    if key == "database.json":
        return PostgresScope(level="database_json", file="database.json",
                             resource_path=raw)

    parts = key.split("/")

    if len(parts) == 1:
        return PostgresScope(level="schema", schema=parts[0],
                             resource_path=raw)

    if len(parts) == 2 and parts[1] in ("tables", "views"):
        return PostgresScope(level="kind", schema=parts[0], kind=parts[1],
                             resource_path=raw)

    if len(parts) == 3 and parts[1] in ("tables", "views"):
        return PostgresScope(level="entity", schema=parts[0], kind=parts[1],
                             entity=parts[2], resource_path=raw)

    if len(parts) == 4 and parts[1] in ("tables", "views") and parts[3] in (
            "schema.json", "rows.jsonl"):
        level = "entity_schema" if parts[3] == "schema.json" else "entity_rows"
        return PostgresScope(level=level, schema=parts[0], kind=parts[1],
                             entity=parts[2], file=parts[3],
                             resource_path=raw)

    return PostgresScope(level="invalid", resource_path=raw)
```

**Step 4:** Run — pass.

**Step 5: Commit**

```bash
git add python/mirage/core/postgres/scope.py python/tests/core/postgres/test_scope.py
git commit -m "feat(postgres): scope detection across all path levels"
```

______________________________________________________________________

### Task 7: `glob`

**Files:** Create `python/mirage/core/postgres/glob.py`; test `python/tests/core/postgres/test_glob.py`.

Direct port of [mongodb glob.py](python/mirage/core/mongodb/glob.py) with module substitution. Same fnmatch behavior; same `SCOPE_ERROR` truncation. Test the `*.jsonl` pattern resolves under an entity folder.

**Steps 1–5:** Test → fail → implement → pass → commit.

```bash
git commit -m "feat(postgres): add glob resolution"
```

______________________________________________________________________

### Task 8: `readdir`

**Files:** Create `python/mirage/core/postgres/readdir.py`; test `python/tests/core/postgres/test_readdir.py`.

**Step 1: Failing tests** covering each level:

| Path                   | Expected entries                   |
| ---------------------- | ---------------------------------- |
| `/`                    | `["database.json", <schema>...]`   |
| `/<schema>`            | `["tables", "views"]`              |
| `/<schema>/tables`     | `[<table_name>...]`                |
| `/<schema>/tables/<t>` | `["schema.json", "rows.jsonl"]`    |
| `/<schema>/views`      | `[<view_name>... + matview names]` |
| `/<schema>/views/<v>`  | `["schema.json", "rows.jsonl"]`    |

Mock `list_schemas`, `list_tables`, `list_views`, `list_matviews` via `patch`.

**Step 2:** Run — fails.

**Step 3: Implement** with branching on `detect_scope(path).level`:

```python
from mirage.accessor.postgres import PostgresAccessor
from mirage.cache.index import IndexCacheStore, IndexEntry
from mirage.core.postgres._client import (list_matviews, list_schemas,
                                          list_tables, list_views)
from mirage.core.postgres.scope import detect_scope
from mirage.types import PathSpec


async def readdir(accessor: PostgresAccessor, path: PathSpec,
                  index: IndexCacheStore = None) -> list[str]:
    if isinstance(path, str):
        path = PathSpec(original=path, directory=path)
    prefix = path.prefix
    raw = path.directory if path.pattern else path.original
    if prefix and raw.startswith(prefix):
        raw = raw[len(prefix):] or "/"
    scope = detect_scope(PathSpec(original=raw, directory=raw, prefix=prefix))
    virtual_key = (prefix or "") + raw

    if scope.level == "root":
        return await _list_root(accessor, virtual_key, index, prefix)
    if scope.level == "schema":
        return [f"{prefix}{raw.rstrip('/')}/tables",
                f"{prefix}{raw.rstrip('/')}/views"]
    if scope.level == "kind":
        return await _list_entities(accessor, scope.schema, scope.kind,
                                    virtual_key, index, prefix, raw)
    if scope.level == "entity":
        return [f"{prefix}{raw.rstrip('/')}/schema.json",
                f"{prefix}{raw.rstrip('/')}/rows.jsonl"]
    raise FileNotFoundError(raw)


async def _list_root(accessor, virtual_key, index, prefix):
    if index is not None:
        listing = await index.list_dir(virtual_key)
        if listing.entries is not None:
            return listing.entries
    pool = await accessor.pool()
    async with pool.acquire() as conn:
        schemas = await list_schemas(conn, accessor.config.schemas)
    entries = [("database.json",
                IndexEntry(id="database.json", name="database.json",
                           resource_type="postgres/database_json",
                           vfs_name="database.json"))]
    for s in schemas:
        entries.append((s, IndexEntry(id=s, name=s,
                                      resource_type="postgres/schema",
                                      vfs_name=s)))
    if index is not None:
        await index.set_dir(virtual_key, entries)
    return [f"{prefix}/{n}" for n, _ in entries]


async def _list_entities(accessor, schema, kind, virtual_key, index, prefix,
                         raw):
    if index is not None:
        listing = await index.list_dir(virtual_key)
        if listing.entries is not None:
            return listing.entries
    pool = await accessor.pool()
    async with pool.acquire() as conn:
        if kind == "tables":
            names = await list_tables(conn, schema)
        else:
            names = sorted(set(await list_views(conn, schema)) |
                           set(await list_matviews(conn, schema)))
    entries = [(n, IndexEntry(id=n, name=n,
                              resource_type=f"postgres/{kind}",
                              vfs_name=n)) for n in names]
    if index is not None:
        await index.set_dir(virtual_key, entries)
    return [f"{prefix}{raw.rstrip('/')}/{n}" for n, _ in entries]
```

**Step 4:** Run — pass.

**Step 5: Commit**

```bash
git add python/mirage/core/postgres/readdir.py python/tests/core/postgres/test_readdir.py
git commit -m "feat(postgres): readdir across all path levels"
```

______________________________________________________________________

### Task 9: `stat`

**Files:** Create `python/mirage/core/postgres/stat.py`; test `python/tests/core/postgres/test_stat.py`.

**Step 1: Failing tests** for each level:

| Path                               | Expected                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `/`                                | `FileType.DIRECTORY`, name `"/"`                                           |
| `/database.json`                   | `FileType.JSON`, synthetic; small bounded size                             |
| `/<schema>`                        | `FileType.DIRECTORY`, `extra={"schema": s}`                                |
| `/<schema>/tables`                 | `FileType.DIRECTORY`, `extra={"kind": "tables"}`                           |
| `/<schema>/tables/<t>`             | `FileType.DIRECTORY`, `extra={"schema", "name", "kind"}`                   |
| `/<schema>/tables/<t>/schema.json` | `FileType.JSON`                                                            |
| `/<schema>/tables/<t>/rows.jsonl`  | `FileType.TEXT`, `extra={"row_count", "size_bytes"}`, `fingerprint=<hash>` |

**Step 2:** Run — fails.

**Step 3: Implement** with branching on `detect_scope`. Use `_client.estimated_row_count` and `_client.table_size_bytes` for `rows.jsonl` size hints; fingerprint via a fast hash of the column-list + row-count tuple (good enough for cache invalidation).

**Step 4:** Run — pass.

**Step 5: Commit**

```bash
git add python/mirage/core/postgres/stat.py python/tests/core/postgres/test_stat.py
git commit -m "feat(postgres): stat for synthetic and data files"
```

______________________________________________________________________

### Task 10: `read` with size guard + synthetic JSON dispatch

**Files:** Create `python/mirage/core/postgres/read.py`; test `python/tests/core/postgres/test_read.py`.

**Step 1: Failing tests:**

```python
# /database.json -> returns composed JSON (no size guard)
# /public/tables/users/schema.json -> returns composed per-entity JSON
# /public/tables/users/rows.jsonl (small) -> returns JSONL
# /public/tables/users/rows.jsonl (huge) -> raises ValueError("too large")
# /public/tables/users/rows.jsonl with limit/offset -> bypasses guard
# /unknown/path -> FileNotFoundError
```

**Step 2:** Run — fails.

**Step 3: Implement**

```python
import orjson

from mirage.accessor.postgres import PostgresAccessor
from mirage.cache.index import IndexCacheStore
from mirage.core.postgres._client import estimate_size, fetch_rows
from mirage.core.postgres._schema_json import (build_database_json,
                                               build_entity_schema_json)
from mirage.core.postgres.scope import detect_scope
from mirage.types import PathSpec


async def read(
    accessor: PostgresAccessor,
    path: PathSpec,
    index: IndexCacheStore = None,
    *,
    limit: int | None = None,
    offset: int | None = None,
) -> bytes:
    if isinstance(path, str):
        path = PathSpec(original=path, directory=path)
    prefix = path.prefix
    raw = path.original
    if prefix and raw.startswith(prefix):
        raw = raw[len(prefix):] or "/"
    scope = detect_scope(PathSpec(original=raw, directory=raw, prefix=prefix))

    if scope.level == "database_json":
        doc = await build_database_json(accessor)
        return orjson.dumps(doc, option=orjson.OPT_INDENT_2)

    if scope.level == "entity_schema":
        kind = "table" if scope.kind == "tables" else "view"
        doc = await build_entity_schema_json(accessor, scope.schema,
                                             scope.entity, kind)
        return orjson.dumps(doc, option=orjson.OPT_INDENT_2)

    if scope.level == "entity_rows":
        return await _read_rows(accessor, scope.schema, scope.entity,
                                limit=limit, offset=offset)

    raise FileNotFoundError(raw)


async def _read_rows(accessor, schema, entity, *, limit, offset) -> bytes:
    cfg = accessor.config
    if limit is None and offset is None:
        pool = await accessor.pool()
        async with pool.acquire() as conn:
            rows, width = await estimate_size(conn, schema, entity)
        if rows > cfg.max_read_rows or rows * max(width, 1) > cfg.max_read_bytes:
            raise ValueError(
                f"{schema}/{entity}/rows.jsonl too large to read entirely: "
                f"~{rows} rows / ~{rows * max(width, 1)} bytes "
                f"(thresholds: {cfg.max_read_rows} rows / {cfg.max_read_bytes} "
                f"bytes); use head, tail, wc, grep, or pass limit/offset")
        limit = rows or cfg.default_row_limit
        offset = 0
    pool = await accessor.pool()
    async with pool.acquire() as conn:
        data = await fetch_rows(conn, schema, entity, limit=limit,
                                offset=offset or 0)
    if not data:
        return b""
    lines = [orjson.dumps(r, default=str).decode() for r in data]
    return ("\n".join(lines) + "\n").encode()
```

**Step 4:** Run — pass.

**Step 5: Commit**

```bash
git add python/mirage/core/postgres/read.py python/tests/core/postgres/test_read.py
git commit -m "feat(postgres): read with size guard and synthetic JSON dispatch"
```

______________________________________________________________________

### Task 11: `search` (grep pushdown)

**Files:** Create `python/mirage/core/postgres/search.py`; test `python/tests/core/postgres/test_search.py`.

`search_entity(accessor, schema, kind, name, pattern, limit)` translates to `WHERE col::text ILIKE $1 OR ...` across text-typed columns (`text`, `varchar`, `character`, `name`, `uuid`, `json`, `jsonb`). `search_kind(accessor, schema, kind, pattern, limit)` iterates entities. `search_schema` iterates schemas. `format_grep_results` returns lines like `<schema>/tables/<t>/rows.jsonl:<json-line>`.

**Steps 1–5:** Test → fail → implement → pass → commit.

```bash
git commit -m "feat(postgres): grep pushdown via ILIKE on text columns"
```

______________________________________________________________________

### Task 12: VFS ops registration

**Files:**

- Create: `python/mirage/ops/postgres/__init__.py`
- Create: `python/mirage/ops/postgres/read.py`
- Create: `python/mirage/ops/postgres/readdir.py`
- Create: `python/mirage/ops/postgres/stat.py`
- Test: `python/tests/ops/postgres/__init__.py` (empty), `test_ops_register.py`

Each op file is a one-line wrapper exactly like [mongodb's read op](python/mirage/ops/mongodb/read.py). `__init__.py`:

```python
from mirage.ops.postgres.read import read
from mirage.ops.postgres.readdir import readdir
from mirage.ops.postgres.stat import stat

OPS = [read, readdir, stat]
```

**Steps 1–5:** Test → fail → implement → pass → commit.

```bash
git commit -m "feat(postgres): register read/readdir/stat VFS ops"
```

______________________________________________________________________

### Task 13: Resource class + registry wiring

**Files:**

- Create: `python/mirage/resource/postgres/postgres.py`
- Modify: `python/mirage/types.py` (`POSTGRES = "postgres"`)
- Modify: `python/mirage/resource/registry.py`
- Test: `python/tests/resource/postgres/test_resource.py` (start with ops-only assertion; add command assertions in Task 18)

**Step 3: Implement**

```python
from mirage.accessor.postgres import PostgresAccessor
from mirage.core.postgres.glob import resolve_glob as _resolve_glob
from mirage.resource.base import BaseResource
from mirage.resource.postgres.config import PostgresConfig
from mirage.resource.postgres.prompt import PROMPT
from mirage.types import ResourceName


class PostgresResource(BaseResource):

    name: str = ResourceName.POSTGRES
    is_remote: bool = True
    PROMPT: str = PROMPT

    def __init__(self, config: PostgresConfig) -> None:
        super().__init__()
        self.config = config
        self.accessor = PostgresAccessor(self.config)
        from mirage.commands.builtin.postgres import COMMANDS
        from mirage.ops.postgres import OPS as POSTGRES_VFS_OPS
        for fn in COMMANDS:
            self.register(fn)
        for fn in POSTGRES_VFS_OPS:
            self.register_op(fn)

    async def resolve_glob(self, paths, prefix: str = ""):
        return await _resolve_glob(self.accessor, paths, index=self._index)

    async def fingerprint(self, path: str) -> str | None:
        return None

    def get_state(self) -> dict:
        redacted = ["dsn"]
        cfg = self.config.model_dump()
        for f in redacted:
            if cfg.get(f) is not None:
                cfg[f] = "<REDACTED>"
        return {"type": self.name, "needs_override": True,
                "redacted_fields": redacted, "config": cfg}

    def load_state(self, state: dict) -> None:
        pass
```

`registry.py` entry:

```python
    "postgres": ResourceEntry(
        "mirage.resource.postgres:PostgresResource",
        "mirage.resource.postgres:PostgresConfig"),
```

**Steps 1–5** as usual; the `COMMANDS` import is exercised in tasks 14–17, so the resource test should be split: ops assertion now, commands assertion deferred.

```bash
git commit -m "feat(postgres): add PostgresResource and registry entry"
```

______________________________________________________________________

### Task 14: Command provision helper + `ls` + `stat`

Direct ports of [mongodb \_provision.py](python/mirage/commands/builtin/mongodb/_provision.py), [ls.py](python/mirage/commands/builtin/mongodb/ls.py), [stat.py](python/mirage/commands/builtin/mongodb/stat.py). Replace `mongodb_*` imports with `postgres_*`. The terminology `document_count` becomes `row_count`.

`__init__.py` (will grow):

```python
from mirage.commands.builtin.postgres.ls import ls
from mirage.commands.builtin.postgres.stat import stat

COMMANDS = [ls, stat]
```

**Steps 1–5** per command.

```bash
git commit -m "feat(postgres): add ls and stat commands"
```

______________________________________________________________________

### Task 15: `head`, `tail`, `wc`

`head` → `core.postgres.read.read(..., limit=N, offset=0)` (bypasses guard). `tail` → first calls `count_rows`, then `read(..., limit=N, offset=count-N)`. `wc -l` → `count_rows` directly. `wc -c` → standard read+len.

Each command must reject unsupported path levels (e.g., `head /` makes no sense — return error). Use `detect_scope` to gate.

**Steps 1–5** per command (3 commits).

______________________________________________________________________

### Task 16: `cat` (size guard surfaced)

Port [mongodb cat.py](python/mirage/commands/builtin/mongodb/cat.py). Wrap the `core.postgres.read.read(...)` call in `try/except ValueError`:

```python
try:
    data = await postgres_read(accessor, p, _extra.get("index"))
except ValueError as exc:
    return None, IOResult(exit_code=1, stderr=str(exc).encode())
```

Test: cat of small `rows.jsonl` returns rows; cat of huge `rows.jsonl` returns `exit_code=1`; cat of `database.json` and per-entity `schema.json` always works.

```bash
git commit -m "feat(postgres): add cat with size-guard error surfacing"
```

______________________________________________________________________

### Task 17: `grep` (predicate pushdown)

Port [mongodb grep.py](python/mirage/commands/builtin/mongodb/grep/grep.py). Replace mongodb client calls with `core.postgres.search.search_entity` / `search_kind` / `search_schema` / `search_database` / `format_grep_results`. Keep all standard grep flags (`-i`, `-n`, `-c`, `-l`, `-v`, `-A`/`-B`/`-C`).

Path-scope routing:

- `grep pat /` → `search_database`
- `grep pat /<schema>` → `search_schema`
- `grep pat /<schema>/tables` → `search_kind(... "tables" ...)`
- `grep pat /<schema>/tables/<t>` → `search_entity` (or its `rows.jsonl`)
- `grep pat /<schema>/tables/<t>/rows.jsonl` → `search_entity`

```bash
git commit -m "feat(postgres): add grep with ILIKE pushdown"
```

______________________________________________________________________

### Task 18: `find`, `tree`, `jq`, `rg`; finalize COMMANDS

Direct ports from mongodb. `jq` over `rows.jsonl` inherits the size guard via `read` — large views fail with the same error, which is correct.

Final `__init__.py`:

```python
from mirage.commands.builtin.postgres.cat import cat
from mirage.commands.builtin.postgres.find import find
from mirage.commands.builtin.postgres.grep import COMMANDS as _GREP
from mirage.commands.builtin.postgres.head import head
from mirage.commands.builtin.postgres.jq import jq
from mirage.commands.builtin.postgres.ls import ls
from mirage.commands.builtin.postgres.rg import rg
from mirage.commands.builtin.postgres.stat import stat
from mirage.commands.builtin.postgres.tail import tail
from mirage.commands.builtin.postgres.tree import tree
from mirage.commands.builtin.postgres.wc import wc

COMMANDS = [cat, find, head, jq, ls, stat, tail, tree, wc, *_GREP, rg]
```

Re-enable the deferred resource-class command assertion from Task 13. Run the full Postgres test subset:

```bash
cd python && uv run pytest tests/core/postgres tests/resource/postgres tests/commands/postgres tests/ops/postgres -v
```

Expected: all green.

```bash
git commit -m "feat(postgres): add find/tree/jq/rg and finalize COMMANDS"
```

______________________________________________________________________

### Task 19: Import hygiene + lint

**Step 1:** No-circular check:

```bash
cd python && uv run python -c "import mirage.resource.postgres; import mirage.resource.postgres.postgres; import mirage.commands.builtin.postgres; import mirage.ops.postgres; import mirage.core.postgres._client; import mirage.core.postgres._schema_json; print('ok')"
```

**Step 2:** Pre-commit:

```bash
./python/.venv/bin/pre-commit run --all-files
```

**Step 3:** Full pytest:

```bash
cd python && uv run pytest -q
```

**Step 4:** Commit any lint fixups.

```bash
git commit -m "chore(postgres): lint fixups"
```

______________________________________________________________________

### Task 20: Live smoke test (optional)

If a local Postgres is available:

```bash
docker run -e POSTGRES_PASSWORD=pw -p 5432:5432 -d postgres:16
```

Seed:

```sql
CREATE SCHEMA acme;
CREATE TABLE acme.teams (id SERIAL PRIMARY KEY, name TEXT);
CREATE TABLE acme.users (id SERIAL PRIMARY KEY, email TEXT, team_id INT REFERENCES acme.teams(id));
INSERT INTO acme.teams VALUES (1, 'Eng'), (2, 'Sales');
INSERT INTO acme.users SELECT i, 'u'||i||'@x.io', (i % 2) + 1 FROM generate_series(1, 50) i;
CREATE VIEW acme.user_summary AS SELECT t.name AS team, COUNT(*) AS n FROM acme.users u JOIN acme.teams t ON t.id = u.team_id GROUP BY t.name;
```

Then verify:

- `/database.json` lists `acme` schema, two tables, one view, one relationship
- `/acme/tables/users/schema.json` shows columns including `team_id` with `references` set
- `/acme/tables/users/rows.jsonl` returns 50 lines
- `head -n 5 /acme/tables/users/rows.jsonl` returns 5 lines
- `wc -l /acme/tables/users/rows.jsonl` returns `50`
- `grep "u1@" /acme/tables/users/rows.jsonl` returns the matching row
- After `INSERT INTO acme.users SELECT ...` to push to 1M+ rows: `cat /acme/tables/users/rows.jsonl` errors with the size-guard message; `head -n 10 ...` still works

Document any rough edges as follow-ups.

______________________________________________________________________

## Out of Scope (Future Work)

1. **TS/browser port** — separate plan; will use `@neondatabase/serverless` for hosted PG and PGlite for in-browser PG.
1. **Writes** — `INSERT`/`UPDATE`/`DELETE` via VFS. Requires careful read-only-by-default + explicit opt-in.
1. **Stored procedures / table-valued functions** mounted as parameterized directories.
1. **Native FTS pushdown** — when an entity exposes `tsvector`, use `@@ tsquery` instead of `ILIKE`.
1. **`COPY (SELECT ...) TO STDOUT WITH (FORMAT json)`** — possibly faster than row-by-row `fetch` for big pushed-down reads. Benchmark first.
1. **Sampling** — a `sample.jsonl` sibling under each entity folder, providing N random rows for cheap exploration.
1. **Per-entity custom config** — column allowlist, alternate `ORDER BY` for stable line numbers.
1. **Cross-schema `single_schema` collapse** — option B/C from layout discussion. Currently always show schema folder.
