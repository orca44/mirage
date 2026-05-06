# Daytona × Mirage POC Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a working Mirage-on-Daytona proof-of-concept (snapshot + multi-backend example + benchmark + 1-page pitch) so that the CEO meeting has a concrete demo and numbers, not a slide deck.

**Architecture:** Everything lives under `examples/python/daytona/` plus one pitch doc at `paper/daytona-pitch.md`. We never modify Daytona internals — we use their public Python SDK (`daytona` package) to (a) bake `mirage[s3,gcs,redis,fuse]` + `fuse3` into a snapshot, (b) inside that sandbox run a Python script that opens a Mirage `Workspace({...}, fuse=True)` and exercises a fixed workload, (c) run the same workload against a stock Daytona `VolumeMount`, and (d) compare wall-time + bytes-transferred. The benchmark workload runs **inside** the sandbox via a single `sandbox.process.exec("python /tmp/bench.py")` call — measuring file-op time, not Daytona-RPC time.

**Tech Stack:** Python 3.12, `daytona` SDK (PyPI), this repo's `mirage` package with `s3,gcs,redis,fuse` extras, pytest, real S3 dev bucket (the same one already used by [examples/python/s3/](../../examples/python/s3/)).

**Reference docs:**

- Daytona SDK:
  - `Image.debian_slim("3.12").apt_install([...]).pip_install([...]).run("...")` → snapshot recipe
  - `daytona.snapshot.create(CreateSnapshotParams(name=..., image=...))` → idempotent get-or-create via `daytona.snapshot.get(name)`
  - `daytona.volume.get(name, create=True)` + `VolumeMount(volume_id, mount_path, subpath)` → baseline path
  - `daytona.create(CreateSandboxFromSnapshotParams(snapshot=..., volumes=[...]))` → sandbox lifecycle
  - `sandbox.fs.upload_file(content, dest)`, `sandbox.process.exec(cmd)` → drive workloads
  - Volumes use `mount-s3` per [March 2026 changelog](https://www.daytona.io/changelog/runner-recovery-fuse-optimization)
- Mirage Workspace API (already used in [examples/python/s3/s3_fuse.py](../../examples/python/s3/s3_fuse.py) and [examples/python/s3/s3.py](../../examples/python/s3/s3.py)):
  - `Workspace({"/data": resource}, mode=MountMode.READ, fuse=True)` → context manager, `ws.fuse_mountpoint` exposes path
  - `ws.ops.records`, `ws.ops.network_bytes`, `ws.ops.cache_bytes` → stats
- Existing `.env.development` at repo root has `AWS_S3_BUCKET`, `AWS_DEFAULT_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`. Add `DAYTONA_API_KEY`, `DAYTONA_API_URL` if not present.

**Strategic positioning (from earlier conversation, already in repo):**

- Three integration models in [paper/competitor.md:203-209](../../paper/competitor.md#L203-L209). This POC executes **Model B** (library-inside-sandbox), which is the only one that requires zero Daytona engineering. Model A (`mount_provider="mirage"`) is the partnership ask the pitch doc makes.
- Daytona's own docs admit Volumes are "generally slower for both read and write operations compared to local sandbox filesystem" ([paper/competitor.md:189](../../paper/competitor.md#L189)). This benchmark is what proves Mirage closes that gap.

**What this plan deliberately is NOT:**

- Not a Daytona SDK fork, not a `mount_provider` patch — that's Phase 3, post-CEO buy-in.
- Not a `mirage server` daemon variant — that's Phase 2.
- Not cross-sandbox shared state. Phase 1 is single-sandbox read-heavy.
- Not a pytest-everything CI integration. Cloud-touching scripts run on demand; only pure-logic helpers are unit-tested.

**Pre-flight (run before Task 1):**

1. Create a worktree per `superpowers:using-git-worktrees`. Branch name: `feat/daytona-mirage-poc`.
1. Verify `.env.development` at repo root has Daytona + AWS credentials. If `DAYTONA_API_KEY` is missing, ask the user before proceeding.
1. From `python/`, run `uv add --optional daytona daytona-sdk` to add Daytona as a new optional extras group. Verify with `uv sync --extra daytona`.

______________________________________________________________________

## Task 1: Skeleton + dependency wiring

**Files:**

- Create: `examples/python/daytona/__init__.py` (empty)
- Create: `examples/python/daytona/_env.py`
- Modify: `python/pyproject.toml` (add `daytona` optional extras)

**Step 1: Add Daytona optional extras to pyproject**

Locate the `[project.optional-dependencies]` block in [python/pyproject.toml](../../python/pyproject.toml). After the `redis` line, add:

```toml
# --- sandbox runtimes (examples-only) ---
daytona  = ["daytona-sdk>=0.10"]
```

**Step 2: Sync extras**

Run from repo root: `cd python && uv sync --extra s3 --extra gcs --extra redis --extra fuse --extra daytona`
Expected: lockfile updates with `daytona-sdk` resolved. No errors.

**Step 3: Verify import works**

Run: `./python/.venv/bin/python -c "from daytona import Daytona, Image, CreateSandboxFromSnapshotParams, VolumeMount; print('ok')"`
Expected: `ok` (no ImportError).

**Step 4: Write env loader**

Create `examples/python/daytona/_env.py`:

```python
import os

from dotenv import load_dotenv

load_dotenv(".env.development")


def require(key: str) -> str:
    val = os.environ.get(key)
    if not val:
        raise RuntimeError(
            f"Missing required env var {key!r}. "
            "Set it in .env.development at the repo root."
        )
    return val


def daytona_kwargs() -> dict[str, str]:
    out: dict[str, str] = {"api_key": require("DAYTONA_API_KEY")}
    api_url = os.environ.get("DAYTONA_API_URL")
    if api_url:
        out["api_url"] = api_url
    return out


def s3_kwargs() -> dict[str, str]:
    return {
        "bucket": require("AWS_S3_BUCKET"),
        "region": os.environ.get("AWS_DEFAULT_REGION", "us-east-1"),
        "aws_access_key_id": require("AWS_ACCESS_KEY_ID"),
        "aws_secret_access_key": require("AWS_SECRET_ACCESS_KEY"),
    }
```

**Step 5: Smoke-test the env loader**

Run: `./python/.venv/bin/python -c "from examples.python.daytona._env import daytona_kwargs, s3_kwargs; print(list(daytona_kwargs())); print(list(s3_kwargs()))"`
Expected: `['api_key']` (or `['api_key', 'api_url']`) and `['bucket', 'region', 'aws_access_key_id', 'aws_secret_access_key']`.

**Step 6: Commit**

```bash
git add python/pyproject.toml python/uv.lock examples/python/daytona/
git commit -m "chore(examples/daytona): scaffold daytona example dir + env helpers"
```

______________________________________________________________________

## Task 2: Snapshot helper (idempotent get-or-create)

**Files:**

- Create: `examples/python/daytona/snapshot.py`
- Create: `python/tests/examples/test_daytona_snapshot.py`

**Step 1: Write the failing test**

Create `python/tests/examples/test_daytona_snapshot.py`:

```python
from unittest.mock import MagicMock

from examples.python.daytona.snapshot import build_image, MIRAGE_SNAPSHOT_NAME, get_or_create_snapshot


def test_build_image_includes_fuse_and_mirage_extras():
    image = build_image()
    rendered = repr(image)
    assert "fuse3" in rendered
    assert "mirage-ai[s3,gcs,redis,fuse]" in rendered


def test_get_or_create_returns_existing_when_snapshot_present():
    client = MagicMock()
    existing = MagicMock(name="snapshot")
    existing.name = MIRAGE_SNAPSHOT_NAME
    client.snapshot.get.return_value = existing

    result = get_or_create_snapshot(client)

    assert result is existing
    client.snapshot.create.assert_not_called()


def test_get_or_create_creates_when_missing():
    client = MagicMock()
    client.snapshot.get.side_effect = LookupError("not found")
    created = MagicMock()
    client.snapshot.create.return_value = created

    result = get_or_create_snapshot(client)

    assert result is created
    client.snapshot.create.assert_called_once()
```

**Step 2: Run the test (expect ImportError / module-not-found)**

Run: `cd python && uv run pytest tests/examples/test_daytona_snapshot.py -v`
Expected: collection error / `ModuleNotFoundError: examples.python.daytona.snapshot`.

**Step 3: Implement snapshot.py**

Create `examples/python/daytona/snapshot.py`:

```python
import logging
from typing import Any

from daytona import CreateSnapshotParams, Image
from daytona.common.sandbox import Resources

logger = logging.getLogger(__name__)

MIRAGE_SNAPSHOT_NAME = "mirage-poc"
MIRAGE_PIP_SPEC = "mirage-ai[s3,gcs,redis,fuse]"


def build_image() -> Image:
    return (
        Image.debian_slim("3.12")
        .apt_install(["fuse3", "git"])
        .pip_install([MIRAGE_PIP_SPEC])
        .run("mkdir -p /data")
    )


def get_or_create_snapshot(client: Any) -> Any:
    try:
        return client.snapshot.get(MIRAGE_SNAPSHOT_NAME)
    except (LookupError, Exception) as exc:  # SDK raises NotFound; broaden once verified
        logger.info("snapshot %r not found (%s); creating", MIRAGE_SNAPSHOT_NAME, exc)
    params = CreateSnapshotParams(
        name=MIRAGE_SNAPSHOT_NAME,
        image=build_image(),
        resources=Resources(cpu=2, memory=4, disk=20),
    )
    return client.snapshot.create(params, on_logs=lambda log: logger.info("[BUILD] %s", log), timeout=600)
```

(The bare-except is intentional and logged — Daytona's `NotFound` exception shape isn't documented; tighten to the real exception class once we hit it once.)

**Step 4: Run the test — expect PASS**

Run: `cd python && uv run pytest tests/examples/test_daytona_snapshot.py -v`
Expected: 3 passed.

**Step 5: Commit**

```bash
git add examples/python/daytona/snapshot.py python/tests/examples/test_daytona_snapshot.py
git commit -m "feat(examples/daytona): idempotent mirage snapshot helper"
```

______________________________________________________________________

## Task 3: Mirage-in-sandbox demo (Model B — multi-backend FUSE)

**Files:**

- Create: `examples/python/daytona/mirage_in_sandbox.py`
- Create: `examples/python/daytona/_workload.py` (the script that runs *inside* the sandbox)

**Step 1: Write the in-sandbox workload**

Create `examples/python/daytona/_workload.py`. This file is uploaded to and executed inside the Daytona sandbox, so it imports only what's pre-baked into the snapshot:

```python
import json
import os
import subprocess
import sys
import time

from mirage import MountMode, Workspace
from mirage.resource.s3 import S3Config, S3Resource

COMMANDS = [
    "ls /data/raw",
    "head -n 5 /data/raw/example.jsonl",
    "wc -l /data/raw/example.jsonl",
    "grep mirage /data/raw/example.jsonl | wc -l",
    "grep -m 1 mirage /data/raw/example.jsonl",
    "cat /data/raw/example.jsonl | wc -c",
]


def main() -> None:
    config = S3Config(
        bucket=os.environ["AWS_S3_BUCKET"],
        region=os.environ.get("AWS_DEFAULT_REGION", "us-east-1"),
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    )
    with Workspace({"/data/raw": S3Resource(config)}, mode=MountMode.READ, fuse=True) as ws:
        time.sleep(1)
        mp = ws.fuse_mountpoint
        results: list[dict[str, object]] = []
        for cmd in COMMANDS:
            full = cmd.replace("/data/raw", f"{mp}/data/raw")
            t0 = time.perf_counter()
            proc = subprocess.run(full, shell=True, capture_output=True)
            elapsed = time.perf_counter() - t0
            results.append({
                "cmd": cmd,
                "wall_seconds": elapsed,
                "exit_code": proc.returncode,
                "stdout_bytes": len(proc.stdout),
            })
        stats = {
            "ops": len(ws.ops.records),
            "network_bytes": ws.ops.network_bytes,
            "cache_bytes": ws.ops.cache_bytes,
        }
    print(json.dumps({"mode": "mirage", "results": results, "stats": stats}, indent=2))


if __name__ == "__main__":
    main()
    sys.stdout.flush()
```

**Step 2: Write the driver**

Create `examples/python/daytona/mirage_in_sandbox.py`:

```python
import json
from pathlib import Path

from daytona import CreateSandboxFromSnapshotParams, Daytona

from examples.python.daytona._env import daytona_kwargs, s3_kwargs
from examples.python.daytona.snapshot import MIRAGE_SNAPSHOT_NAME, get_or_create_snapshot

WORKLOAD_PATH = Path(__file__).with_name("_workload.py")
SANDBOX_WORKLOAD = "/tmp/workload.py"


def run() -> dict[str, object]:
    daytona = Daytona(**daytona_kwargs())
    get_or_create_snapshot(daytona)

    s3 = s3_kwargs()
    sandbox = daytona.create(CreateSandboxFromSnapshotParams(
        snapshot=MIRAGE_SNAPSHOT_NAME,
        env_vars={
            "AWS_S3_BUCKET": s3["bucket"],
            "AWS_DEFAULT_REGION": s3["region"],
            "AWS_ACCESS_KEY_ID": s3["aws_access_key_id"],
            "AWS_SECRET_ACCESS_KEY": s3["aws_secret_access_key"],
        },
    ))
    try:
        sandbox.fs.upload_file(WORKLOAD_PATH.read_bytes(), SANDBOX_WORKLOAD)
        response = sandbox.process.exec(f"python {SANDBOX_WORKLOAD}", timeout=300)
        if response.exit_code != 0:
            raise RuntimeError(f"workload failed exit={response.exit_code}: {response.result}")
        return json.loads(response.result)
    finally:
        sandbox.delete()


if __name__ == "__main__":
    print(json.dumps(run(), indent=2))
```

**Step 3: Smoke test against real Daytona + S3**

Run: `./python/.venv/bin/python -m examples.python.daytona.mirage_in_sandbox`
Expected: ~1-2 minutes wall time. Stdout ends with a JSON object containing `"mode": "mirage"`, six `results` entries with `exit_code: 0`, and non-zero `stats.network_bytes`. Sandbox is deleted on exit.

**Step 4: If first run fails on snapshot creation**

Read the error. Common: `apt_install` syntax differs by SDK version; `Image.base()` vs `Image.debian_slim()`. Adjust `build_image()` in [snapshot.py](../../examples/python/daytona/snapshot.py) and re-run. **Do not** swallow the error — it'll be the real exception class for `LookupError` we wanted in Task 2's `except` clause; tighten the type after.

**Step 5: Commit**

```bash
git add examples/python/daytona/_workload.py examples/python/daytona/mirage_in_sandbox.py
git commit -m "feat(examples/daytona): mirage-in-sandbox demo (Model B)"
```

______________________________________________________________________

## Task 4: Daytona Volume baseline (the comparison target)

**Files:**

- Create: `examples/python/daytona/_workload_volume.py`
- Create: `examples/python/daytona/daytona_volume.py`

**Step 1: Write the in-sandbox baseline workload**

Create `examples/python/daytona/_workload_volume.py`. Same six commands as `_workload.py`, but reading from the Daytona-mounted volume path. No Mirage import:

```python
import json
import subprocess
import sys
import time

VOLUME_PATH = "/data/raw"
COMMANDS = [
    f"ls {VOLUME_PATH}",
    f"head -n 5 {VOLUME_PATH}/example.jsonl",
    f"wc -l {VOLUME_PATH}/example.jsonl",
    f"grep mirage {VOLUME_PATH}/example.jsonl | wc -l",
    f"grep -m 1 mirage {VOLUME_PATH}/example.jsonl",
    f"cat {VOLUME_PATH}/example.jsonl | wc -c",
]


def main() -> None:
    results = []
    for cmd in COMMANDS:
        t0 = time.perf_counter()
        proc = subprocess.run(cmd, shell=True, capture_output=True)
        elapsed = time.perf_counter() - t0
        results.append({
            "cmd": cmd.replace(VOLUME_PATH, "/data/raw"),
            "wall_seconds": elapsed,
            "exit_code": proc.returncode,
            "stdout_bytes": len(proc.stdout),
        })
    print(json.dumps({"mode": "volume", "results": results}, indent=2))


if __name__ == "__main__":
    main()
    sys.stdout.flush()
```

**Step 2: Decide the volume seeding strategy**

Daytona Volumes only mount S3-compatible buckets that *they* manage. We can't point a `VolumeMount` at our existing dev bucket. So either:

1. **(picked)** Seed a Daytona volume by creating it, mounting it to a bootstrap sandbox, and `aws s3 cp` the dev bucket's `example.jsonl` into it. One-time cost, captured in the helper below.
1. (rejected) Compare against `s3fs-fuse` we install ourselves inside the sandbox — that's not the actual product surface they ship.

**Step 3: Write the volume seeder**

Add to `examples/python/daytona/daytona_volume.py`:

```python
import json
from pathlib import Path

from daytona import CreateSandboxFromSnapshotParams, Daytona, VolumeMount

from examples.python.daytona._env import daytona_kwargs, s3_kwargs
from examples.python.daytona.snapshot import MIRAGE_SNAPSHOT_NAME, get_or_create_snapshot

WORKLOAD_PATH = Path(__file__).with_name("_workload_volume.py")
SANDBOX_WORKLOAD = "/tmp/workload_volume.py"
VOLUME_NAME = "mirage-poc-bench"
MOUNT_PATH = "/data/raw"


def seed_volume(daytona: Daytona) -> str:
    volume = daytona.volume.get(VOLUME_NAME, create=True)
    s3 = s3_kwargs()
    seeder = daytona.create(CreateSandboxFromSnapshotParams(
        snapshot=MIRAGE_SNAPSHOT_NAME,
        volumes=[VolumeMount(volume_id=volume.id, mount_path=MOUNT_PATH)],
        env_vars={
            "AWS_DEFAULT_REGION": s3["region"],
            "AWS_ACCESS_KEY_ID": s3["aws_access_key_id"],
            "AWS_SECRET_ACCESS_KEY": s3["aws_secret_access_key"],
        },
    ))
    try:
        seeder.process.exec("apt-get update && apt-get install -y awscli", timeout=300)
        seeder.process.exec(
            f"aws s3 cp s3://{s3['bucket']}/data/example.jsonl {MOUNT_PATH}/example.jsonl",
            timeout=300,
        )
    finally:
        seeder.delete()
    return volume.id


def run() -> dict[str, object]:
    daytona = Daytona(**daytona_kwargs())
    get_or_create_snapshot(daytona)
    volume_id = seed_volume(daytona)

    sandbox = daytona.create(CreateSandboxFromSnapshotParams(
        snapshot=MIRAGE_SNAPSHOT_NAME,
        volumes=[VolumeMount(volume_id=volume_id, mount_path=MOUNT_PATH)],
    ))
    try:
        sandbox.fs.upload_file(WORKLOAD_PATH.read_bytes(), SANDBOX_WORKLOAD)
        response = sandbox.process.exec(f"python {SANDBOX_WORKLOAD}", timeout=300)
        if response.exit_code != 0:
            raise RuntimeError(f"workload failed exit={response.exit_code}: {response.result}")
        return json.loads(response.result)
    finally:
        sandbox.delete()


if __name__ == "__main__":
    print(json.dumps(run(), indent=2))
```

**Step 4: Smoke test**

Run: `./python/.venv/bin/python -m examples.python.daytona.daytona_volume`
Expected: 2-3 minutes (volume seed adds ~30s the first time). JSON ends with `"mode": "volume"` and six `exit_code: 0` results.

**Step 5: Commit**

```bash
git add examples/python/daytona/_workload_volume.py examples/python/daytona/daytona_volume.py
git commit -m "feat(examples/daytona): daytona volume baseline"
```

______________________________________________________________________

## Task 5: Benchmark harness + comparison report

**Files:**

- Create: `examples/python/daytona/benchmark.py`
- Create: `python/tests/examples/test_daytona_benchmark.py`

**Step 1: Write the failing test for the comparison logic**

Create `python/tests/examples/test_daytona_benchmark.py`:

```python
from examples.python.daytona.benchmark import compare


def test_compare_aligns_results_by_command_and_computes_speedup():
    mirage = {
        "mode": "mirage",
        "results": [
            {"cmd": "wc -l /data/raw/example.jsonl", "wall_seconds": 0.5, "exit_code": 0, "stdout_bytes": 12},
            {"cmd": "grep mirage /data/raw/example.jsonl | wc -l", "wall_seconds": 0.8, "exit_code": 0, "stdout_bytes": 5},
        ],
        "stats": {"ops": 4, "network_bytes": 1234, "cache_bytes": 0},
    }
    volume = {
        "mode": "volume",
        "results": [
            {"cmd": "wc -l /data/raw/example.jsonl", "wall_seconds": 2.0, "exit_code": 0, "stdout_bytes": 12},
            {"cmd": "grep mirage /data/raw/example.jsonl | wc -l", "wall_seconds": 6.4, "exit_code": 0, "stdout_bytes": 5},
        ],
    }
    rows = compare(mirage, volume)

    assert [r["cmd"] for r in rows] == ["wc -l /data/raw/example.jsonl", "grep mirage /data/raw/example.jsonl | wc -l"]
    assert rows[0]["mirage_seconds"] == 0.5
    assert rows[0]["volume_seconds"] == 2.0
    assert rows[0]["speedup"] == 4.0
    assert rows[1]["speedup"] == 8.0


def test_compare_flags_diverging_stdout():
    mirage = {"mode": "mirage", "results": [{"cmd": "x", "wall_seconds": 1, "exit_code": 0, "stdout_bytes": 100}], "stats": {}}
    volume = {"mode": "volume", "results": [{"cmd": "x", "wall_seconds": 2, "exit_code": 0, "stdout_bytes": 99}]}

    rows = compare(mirage, volume)

    assert rows[0]["stdout_match"] is False
```

**Step 2: Run — expect ImportError**

Run: `cd python && uv run pytest tests/examples/test_daytona_benchmark.py -v`
Expected: `ModuleNotFoundError`.

**Step 3: Implement benchmark.py**

Create `examples/python/daytona/benchmark.py`:

```python
import json
from typing import Any

from examples.python.daytona import daytona_volume, mirage_in_sandbox


def compare(mirage: dict[str, Any], volume: dict[str, Any]) -> list[dict[str, Any]]:
    by_cmd_v = {r["cmd"]: r for r in volume["results"]}
    rows: list[dict[str, Any]] = []
    for r in mirage["results"]:
        v = by_cmd_v.get(r["cmd"])
        if v is None:
            continue
        m_s = float(r["wall_seconds"])
        v_s = float(v["wall_seconds"])
        rows.append({
            "cmd": r["cmd"],
            "mirage_seconds": m_s,
            "volume_seconds": v_s,
            "speedup": (v_s / m_s) if m_s > 0 else float("inf"),
            "stdout_match": r["stdout_bytes"] == v["stdout_bytes"],
        })
    return rows


def render_markdown(rows: list[dict[str, Any]], stats: dict[str, Any]) -> str:
    lines = [
        "| Command | Daytona Volume (s) | Mirage (s) | Speedup | stdout match |",
        "|---|---:|---:|---:|:---:|",
    ]
    for r in rows:
        lines.append(
            f"| `{r['cmd']}` | {r['volume_seconds']:.2f} | {r['mirage_seconds']:.2f} | {r['speedup']:.2f}× | {'✓' if r['stdout_match'] else '✗'} |"
        )
    lines.append("")
    lines.append(f"**Mirage stats:** {stats.get('ops', '?')} ops, {stats.get('network_bytes', '?')} net bytes, {stats.get('cache_bytes', '?')} cache bytes.")
    return "\n".join(lines)


def main() -> None:
    print("=== running mirage-in-sandbox ===")
    mirage = mirage_in_sandbox.run()
    print("=== running daytona-volume baseline ===")
    volume = daytona_volume.run()

    rows = compare(mirage, volume)
    md = render_markdown(rows, mirage.get("stats", {}))
    print("\n" + md + "\n")

    out = {"mirage": mirage, "volume": volume, "comparison": rows, "markdown": md}
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
```

**Step 4: Run unit tests — expect PASS**

Run: `cd python && uv run pytest tests/examples/test_daytona_benchmark.py -v`
Expected: 2 passed.

**Step 5: End-to-end run + capture numbers**

Run: `./python/.venv/bin/python -m examples.python.daytona.benchmark | tee /tmp/daytona-bench.json`
Expected: ~5 minutes wall time. Captures the markdown table that goes into the pitch doc.

**Step 6: Commit**

```bash
git add examples/python/daytona/benchmark.py python/tests/examples/test_daytona_benchmark.py
git commit -m "feat(examples/daytona): comparison benchmark harness"
```

______________________________________________________________________

## Task 6: Pitch one-pager for the CEO meeting

**Files:**

- Create: `paper/daytona-pitch.md`

**Step 1: Draft the pitch with placeholders**

Create `paper/daytona-pitch.md`. Lead with the partnership ask, not the academic positioning. Reference [paper/competitor.md:182-217](competitor.md#L182-L217) instead of duplicating it. Structure:

````markdown
# Mirage × Daytona: Faster Volumes, Multi-Backend Mounts

## TL;DR

Daytona Volumes today are FUSE mounts powered by `mount-s3`. They work, but
your own docs admit they are "generally slower than local FS." Mirage is a
drop-in mount provider that closes that gap with caching, command-aware
pushdown, write staging, and (uniquely) **multi-backend volumes** — one
mount path can blend S3 + GCS + Redis + 25 other backends.

## Benchmark (this repo: examples/python/daytona/)

<!-- PASTE markdown table from `examples.python.daytona.benchmark` here -->

Same sandbox image, same S3 object, same six commands. Driven from
identical Python via `sandbox.process.exec()` so RPC overhead cancels.

## What we're asking for

One field on `VolumeMount`:

```python
VolumeMount(
    volume_id=...,
    mount_path="/data",
    mount_provider="mirage",            # NEW
    backends={                           # NEW (mirage-only)
        "/data/raw":    "s3://...",
        "/data/models": "gcs://...",
        "/data/cache":  "redis://...",
    },
)
````

When `mount_provider == "mirage"`, your runner spawns `mirage mount …`
instead of `mount-s3`. Everything else (volume lifecycle, dashboard,
cross-sandbox sharing, billing) stays Daytona's.

## What Daytona gets

1. Closes the "slower than local FS" admission with measured numbers.
1. Multi-backend volumes — a feature E2B / Modal / Runloop don't have.
1. Write-heavy workloads become viable (mount-s3 punishes them today).
1. Free OTel observability on every mount op.

## What Mirage gets

Distribution. Every Daytona sandbox becomes a Mirage user the moment
`mount_provider="mirage"` is checked.

## Phasing

| Phase                                       | Status               |
| ------------------------------------------- | -------------------- |
| 1. Mirage-in-sandbox POC + benchmark        | ✅ shipped (this PR) |
| 2. `mount_provider="mirage"` API in Daytona | ⏳ partnership       |
| 3. Co-marketed example + dashboard support  | ⏳ partnership       |

## Appendix: why Mirage and not just `mount-s3` tuning

(Pull 5-6 bullets from `paper/competitor.md` "Where Mirage Wins":
multi-backend, command awareness, S3 Select pushdown, write staging,
agent observability, sub-100ms mount.)

````

**Step 2: Fill in the benchmark numbers**

After Task 5 produced real numbers, replace the `<!-- PASTE -->` block with the actual markdown table from `/tmp/daytona-bench.json` (the `markdown` field).

**Step 3: Cross-check claims against the repo**

Run grep audits to make sure every claim in the pitch is sourced:

- `multi-backend` → `git grep "Workspace({" examples/python/`
- `command awareness` → `git grep -l FuseOpRegistry python/mirage/`
- `S3 Select` → `git grep -l "S3 Select" paper/ python/`
- `OpenTelemetry` → `git grep -l opentelemetry python/mirage/observe/`

If any claim has zero hits, either back it out of the pitch or open an issue.

**Step 4: Commit**

```bash
git add paper/daytona-pitch.md
git commit -m "docs(paper): daytona partnership pitch w/ benchmark numbers"
````

______________________________________________________________________

## Task 7: Lint, final test run, PR

**Step 1: Run pre-commit**

Run from repo root: `./python/.venv/bin/pre-commit run --all-files`
Expected: all checks pass. If formatters changed files, `git add -A` and amend / re-commit per repo convention.

**Step 2: Run scoped tests**

Run: `cd python && uv run pytest tests/examples/ -v`
Expected: all green. Per CLAUDE.md "Skip full test suite — only run scoped tests when parallel work is in progress."

**Step 3: Push branch + open PR**

```bash
git push -u origin feat/daytona-mirage-poc
gh pr create --title "POC: Mirage × Daytona partnership demo + benchmark" --body "$(cat <<'EOF'
## Summary

- Adds [examples/python/daytona/](examples/python/daytona/) — snapshot recipe, mirage-in-sandbox demo, daytona-volume baseline, comparison benchmark.
- Adds [paper/daytona-pitch.md](paper/daytona-pitch.md) — one-pager for the CEO meeting with measured speedup numbers and a concrete `mount_provider="mirage"` API ask.
- Adds optional `daytona` extras group to `python/pyproject.toml`.

This is the Phase 1 deliverable described in [paper/competitor.md:203-209](paper/competitor.md#L203-L209). Phase 2 (`mount_provider="mirage"` patch in Daytona) is the partnership ask, not in this PR.

## Test plan

- [x] `pytest tests/examples/test_daytona_snapshot.py` (unit, mocked)
- [x] `pytest tests/examples/test_daytona_benchmark.py` (unit, pure logic)
- [x] `python -m examples.python.daytona.mirage_in_sandbox` (E2E vs real Daytona+S3)
- [x] `python -m examples.python.daytona.daytona_volume` (E2E baseline)
- [x] `python -m examples.python.daytona.benchmark` (full comparison)
- [x] `pre-commit run --all-files`

EOF
)"
```

______________________________________________________________________

## Risks & open questions

1. **Daytona `Image` API drift.** Recent SDK versions changed `apt_install` / `pip_install` / `Image.base()` ergonomics. Task 3 Step 4 explicitly catches this. If `Image.debian_slim` is removed, fall back to `Image.base("python:3.12-slim")`.
1. **Snapshot creation is slow.** First run can be 5-10 minutes. The helper is idempotent — re-runs reuse it. Don't bake unnecessary deps; `mirage[s3,gcs,redis,fuse]` is the minimum.
1. **Volume seeding requires `awscli` in the seeder sandbox.** The seeder installs it on the fly (Step 3 of Task 4). Slow but acceptable; if Daytona has a faster volume-seeding API by the time you read this, prefer it.
1. **Numbers might not be 6-8× on small files.** That AWS Mountpoint figure was for large-file sequential reads. If the dev `example.jsonl` is small, expect smaller speedups; either grow the test file (a multi-MB synthetic) or be honest in the pitch ("on small JSONL we see ~2×; on large CSV the published Mountpoint baseline of 6-8× applies").
1. **No cross-sandbox shared-state demo in Phase 1.** That's a Phase 2 ask. The pitch flags it explicitly.
1. **Benchmark variance.** Single-shot timings will be noisy. If time permits, wrap each command in a 5-iteration loop and take median; if not, run the benchmark twice and pick the run where stdout matches across modes (rules out cold-cache outliers).

______________________________________________________________________

## Done means

- [ ] PR open against `main` with green CI.
- [ ] `paper/daytona-pitch.md` has real numbers, not placeholders.
- [ ] `python -m examples.python.daytona.benchmark` runs end-to-end on a fresh checkout with only `.env.development` configured.
- [ ] You can hand the CEO a single link (the PR or the pitch doc) and they'll see: working demo, measurable speedup, clean partnership ask.
