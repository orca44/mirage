# Shell Robustness Follow-ups

**Context:** After Step 15 (lazy stdin) and Step 16 (2>&1 fixes), the shell
is noticeably more robust. This plan covers the remaining items that
commonly bite AI agents, in priority order.

______________________________________________________________________

## Phase 1 — Quick wins (~30 min)

### 1a. Fix limitations.mdx — name the real mechanism

The current doc has two rows (`tail -f`, "cache race") that are symptoms of
the same underlying behavior, but the doc doesn't explain the mechanism.
Replace vague wording with the truth.

**File:** `docs/home/design/limitations.mdx`

**Current row:**

```
| Cache race after `cat file | head -n 1` | Background drain is async; sequential `execute()` calls naturally resolve |
```

**Replace with:**

```
| Background cache drain after partial read (`cat file | head -n 1`) | When a cached file is read partially, a background task continues downloading to populate the cache. Sequential `execute()` calls observe the drain completing; does not affect correctness. |
```

Add a note paragraph above the table explaining:

> Mirage's pipe handling is **demand-driven**: when downstream stops
> reading, upstream stops producing. The exception is the cache-drain
> task — when a file is flagged for caching, a background task finishes
> the download even if downstream exited early, so the cache entry is
> complete for the next read. Not a bug; trade-off between bandwidth
> and cache fill rate.

### 1b. Bump `_MAX_WHILE` 1000 → 10000

**File:** `mirage/workspace/executor/control.py:16`

Trivial. Update the comment too — 10000 still silently truncates, so
agents processing >10k records in a while-loop would still get wrong
results. Consider raising `ValueError` on hit instead of silent truncation.

Decision: **bump + make the cap hit surface as stderr warning** (already
warns at `merged_io.stderr = warn`). Keep the warning clear enough that
an agent would notice.

______________________________________________________________________

## Phase 2 — Streaming cleanup (half day)

### 2a. Add explicit `aclose()` discipline in pipe handler

**Problem:** upstream cleanup currently relies on Python GC to fire
`aclose()` on async generators. GC timing is non-deterministic under an
event loop — resources (HTTP connections, file handles) may stay open
longer than necessary.

**Fix:** in `handle_pipe` and `handle_connection` (`mirage/workspace/executor/pipes.py`),
wrap the pipeline in a `try/finally` that explicitly calls `aclose()` on
any ByteSource that's still an async generator when the pipeline exits.

**Scope:** ~30 lines in `pipes.py`. No protocol change to resources —
existing generators already support `aclose()` via Python's built-in
mechanism. This just removes the GC-timing window.

**Doesn't fix:** `tail -f` (that needs the cancellation protocol —
deferred).

### 2b. Make cache drain cancellable for partial reads

**Problem:** `cat big.jsonl | head -n 1` over a cacheable file kicks off
a background task that downloads the rest of the file. For a 10 GB file,
that's 10 GB of bandwidth the user didn't ask for.

**Fix:** `mirage/cache/file/io.py:_background_drain` takes an
`asyncio.Event` cancellation flag. When the pipeline finishes, if the
upstream stream was only partially consumed AND the file exceeds some
threshold (e.g., 100 MB), skip the drain. The file won't be cached, but
next read will fetch it fresh.

**Tunable:** `cache.drain_threshold_bytes = 100 * 1024 * 1024` in
workspace config. Default: always drain (current behavior). Opt-in.

**Scope:** ~40 lines in `cache/file/io.py` + `workspace/workspace.py`
for config wiring.

______________________________________________________________________

## Phase 3 — Testing & audit (half day each)

### 3a. Heredoc coverage audit

**Status:** heredocs are already parsed (NT.HEREDOC\_\* in shell/types.py)
and executed (redirect.py:32). Need to verify each idiom works.

**Test matrix:**

| Pattern                       | Expected behavior                   |
| ----------------------------- | ----------------------------------- |
| `cat <<EOF\nhello\nEOF`       | stdin = `"hello\n"`                 |
| `cat <<-EOF\n\thello\nEOF`    | tab-indented heredoc, tabs stripped |
| `cat <<'EOF'\n$var\nEOF`      | quoted — no variable expansion      |
| `cat <<EOF\n$var\nEOF`        | unquoted — `$var` expanded          |
| `cat <<EOF ... EOF \| grep x` | pipe from heredoc to next command   |
| Heredoc in a function body    | works across function call          |
| Heredoc in a loop body        | works per iteration                 |

Write `tests/shell/test_heredoc_coverage.py` with one test per row.
Document any that fail in `limitations.mdx`; fix easy ones.

### 3b. Quoting / escaping survey

**Status:** unknown. No fuzzing, minimal edge-case coverage.

**Approach:**

1. Build a test matrix of realistic agent patterns:

   - Paths with spaces: `ls '/data/my folder/'`, `find / -name 'My File.txt'`
   - Paths with special chars: `cat "/data/file's copy.txt"`
   - Quoted args containing quotes: `grep "she said \"hi\"" file`
   - Unicode in paths: `ls '/数据/'`
   - Env vars in paths: `ls "$HOME/data"`, `ls "${dir}/data"`
   - Command substitution in args: `grep "$(cat pattern)" file`
   - Escaped special chars: `echo \$PATH`, `echo 'a\nb'`

1. Write `tests/shell/test_quoting_coverage.py` — one test per pattern,
   against `ram` and `disk` resources (local = easiest to set up).

1. For each failure: categorize as (a) parser issue, (b) classifier
   issue, (c) expand-time issue. Fix the cheap ones; document the rest.

### 3c. Cross-mount matrix — s3 × gdrive × ram × redis × disk

**Status:** `cross_mount.py` already supports `cp`, `mv`, `diff`,
`cmp`, `cat`, `head`, `tail`, `wc`, `grep`, `rg` across any two mounts.
Implementation is "download + upload" for cp/mv, "read all + compare"
for diff/cmp, "read each + process" for read commands. Works in principle
but untested across the full matrix.

**Plan:**

1. Set up integration test fixtures that mount all 5 resources
   simultaneously (`ram` + `disk` + `redis` + `s3` + `gdrive`).
1. Create `tests/integration/test_cross_mount_matrix.py` — for each
   ordered pair (src, dst) from the 5 resources, exercise:
   - `cp /src/file.txt /dst/file.txt`
   - `mv /src/file.txt /dst/file.txt`
   - `diff /src/a.txt /dst/b.txt`
   - `cmp /src/a.txt /dst/b.txt`
   - `cat /src/a.txt /dst/b.txt`
   - `grep pattern /src/a.txt /dst/b.txt`
1. That's 20 pair combinations × ~6 commands = ~120 tests. Write a
   parametrized generator, not 120 separate functions.

**Out of scope:** server-side copy (e.g., S3→S3 CopyObject). Current
download-then-upload is the right default; server-side is a separate
optimization project.

______________________________________________________________________

## Ordering

| Phase | Item                                | Effort | Risk                                    |
| ----- | ----------------------------------- | ------ | --------------------------------------- |
| 1a    | Doc fix (limitations.mdx mechanism) | 15 min | zero                                    |
| 1b    | `_MAX_WHILE` bump + warning         | 30 min | low                                     |
| 2a    | `aclose()` discipline in pipes.py   | 2 hr   | low (no API change)                     |
| 2b    | Cancellable cache drain             | 3 hr   | medium (new config option)              |
| 3a    | Heredoc coverage                    | 3 hr   | low                                     |
| 3b    | Quoting survey                      | 4 hr   | medium (unknowns surface)               |
| 3c    | Cross-mount matrix                  | 4 hr   | medium (needs real creds for s3/gdrive) |

**Suggested sequence:** 1a → 1b → 2a → 3a → 3b → 2b → 3c.
(Docs/caps first → streaming/heredoc easy wins → then the
testing-heavy items.)

______________________________________________________________________

## Explicitly NOT in this plan

- `tail -f` / infinite-source mounts (needs cancellation protocol — deferred)
- `for f in $(cmd)` lazy iteration (deferred, documented in limitations.mdx)
- Server-side copy between cloud resources (separate optimization project)
- Fuzzing shell parser (could follow 3b if useful)
- Trap/signal handling, brace expansion (not used by agents per the survey)
