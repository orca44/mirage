# Steps 5, 15, 16 — PathSpec frozen, lazy stdin, interleaved stderr

**Three independent changes from the original backlog. Each is small in code-size but touches load-bearing infrastructure.**

| Step   | What                                                                 | Risk                                                                                    |
| ------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **5**  | Make `PathSpec` `@dataclass(frozen=True)`                            | Low — most usage is already immutable; ~10 mutation sites need rewriting to `replace()` |
| **15** | Replace `await materialize(stdin)` in loops with `AsyncLineBuffer`   | Medium — affects `for`/`while`/`until` loop body's stdin re-reads                       |
| **16** | Make `merge_stdout_stderr` truly interleave by time, not concatenate | Medium — affects \`2>&1                                                                 |

Do them in this order: **5 → 16 → 15**. Step 5 is purely defensive and unlocks confidence about not aliasing PathSpec across mutations (which the other two changes benefit from). Step 16 is small and self-contained. Step 15 needs the most care because it changes loop semantics.

______________________________________________________________________

## Step 5 — Make PathSpec frozen

### Current state

```python
# mirage/types.py
@dataclass
class PathSpec:
    original: str
    directory: str
    pattern: str | None = None
    resolved: bool = True
    prefix: str = ""
```

Mutated in 9 known places (from `grep`):

| File:Line                                   | Mutation                                         |
| ------------------------------------------- | ------------------------------------------------ |
| `mirage/workspace/planner/command.py:58`    | `p.prefix = mount_prefix`                        |
| `mirage/workspace/mount/mount.py:39`        | `self.prefix = prefix` (different class? verify) |
| `mirage/workspace/mount/mount.py:302`       | `p.prefix = mount_prefix`                        |
| `mirage/workspace/mount/mount.py:307`       | `v.prefix = mount_prefix`                        |
| `mirage/workspace/node/resolve_globs.py:33` | `item.prefix = prefix`                           |
| `mirage/resource/s3/s3.py:86`               | `p.prefix = prefix`                              |
| `mirage/resource/redis/redis.py:73`         | `p.prefix = prefix`                              |
| `mirage/resource/disk/disk.py:63`           | `p.prefix = prefix`                              |
| `mirage/resource/ram/ram.py:69`             | `p.prefix = prefix`                              |

All 9 sites do the same thing: stamp a `prefix` onto a PathSpec after construction. The fix is identical at each site:

```python
# Before
p.prefix = prefix

# After
p = dataclasses.replace(p, prefix=prefix)
```

Or, since these are inside a list-mutation loop, build a new list:

```python
paths = [replace(p, prefix=prefix) for p in paths]
```

### Tasks

1. Add `frozen=True` to `PathSpec` dataclass in `mirage/types.py`.
1. Rewrite each of the 9 mutation sites to use `dataclasses.replace()`.
1. Run full test suite — frozen will surface any unknown mutation as `FrozenInstanceError`. Fix as found.
1. Verify `__hash__` works (needed for frozen) — should be automatic.

### Risk

Low. The 9 sites are uniform. Anything missed will fail loudly at runtime. Property-based tests/ fuzz tests aren't needed — the frozen check is itself the test.

### Verification

- `uv run pytest` (full)
- Spot-check examples from a handful of resources (slack, s3, disk) — these use prefix-stamping
- Confirm no `__setattr__` needed elsewhere (the IDE will flag it)

______________________________________________________________________

## Step 16 — Interleaved merge_stdout_stderr

### Current state

```python
# mirage/io/stream.py:24
async def merge_stdout_stderr(stdout, io):
    stdout_bytes = await materialize(stdout)
    stderr_bytes = await materialize(io.stderr)
    parts = []
    if stdout_bytes:
        parts.append(stdout_bytes)
    if stderr_bytes:
        parts.append(stderr_bytes)
    return ByteListAsyncIter(parts)
```

This **fully buffers both streams**, then yields stdout-first-then-stderr. So `cmd 2>&1 | downstream` becomes batch-then-batch, not interleaved.

For real `cmd 2>&1` semantics, the merged stream should yield chunks **in arrival order**, not segregate by source.

### Design

Two sources, both async iterators yielding `bytes`. Use `asyncio.Queue` and two reader tasks:

```python
async def merge_stdout_stderr(stdout, io):
    queue: asyncio.Queue[bytes | None] = asyncio.Queue()

    async def pump(src):
        if src is None:
            return
        if isinstance(src, bytes):
            if src:
                await queue.put(src)
            return
        async for chunk in src:
            await queue.put(chunk)

    pumps = [asyncio.create_task(pump(stdout)),
             asyncio.create_task(pump(io.stderr))]
    done_count = 0

    async def gen():
        nonlocal done_count
        # signal completion via sentinel
        async def watch():
            await asyncio.gather(*pumps)
            await queue.put(None)
        asyncio.create_task(watch())
        while True:
            chunk = await queue.get()
            if chunk is None:
                return
            yield chunk

    return gen()
```

Order is wall-clock; chunks arrive in whatever order producers schedule them. If both sources emit at roughly the same rate, output interleaves at chunk boundaries — same model as a unix shell's `2>&1`.

### Tasks

1. Replace body of `merge_stdout_stderr` with the queue-based interleaver above.
1. Keep the function signature the same (takes stdout + IOResult, returns AsyncIterator[bytes]).
1. Drop `ByteListAsyncIter` if it's only used by the old `merge_stdout_stderr` (check first).
1. Add a unit test:
   - Make stdout yield "A", "B" with delays
   - Make stderr yield "X", "Y" with delays
   - Verify merged output preserves arrival order, not segregates

### Risk

Medium. Behavior is observably different — anything that depends on "stdout completes before stderr starts" will break. Search for callers and verify none assume that. Usually this assumption is a *bug*, but worth confirming.

### Verification

- New unit test for interleaving
- Run `examples/` for any resource that uses 2>&1 (search for `2>&1` in examples)
- Smoke test: a long-running command (e.g., `find` over a big tree) piping `2>&1` into `head` — make sure `head` exits early without hanging

______________________________________________________________________

## Step 15 — Lazy stdin via AsyncLineBuffer in loops

### Current state

In `mirage/workspace/executor/control.py`:

```python
# handle_for line ~127
prev_buffer = session._stdin_buffer
if stdin is not None:
    session._stdin_buffer = await materialize(stdin)  # ← reads ALL stdin upfront
    stdin = None

# similar in _condition_loop line ~173
```

When a loop body runs `read line < /dev/stdin` on each iteration, we need stdin to survive multiple reads — that's why it's materialized into `session._stdin_buffer`. But materialization reads the whole stream into memory before the loop even starts. For piped commands like `find /huge/tree | while read f; do ...; done`, this defeats streaming.

### Design

Replace eager `bytes` buffering with an **AsyncLineBuffer**: a lazy buffer that pulls lines on demand from the upstream stream and remembers them so subsequent readers can replay.

```python
# mirage/io/line_buffer.py (new)
class AsyncLineBuffer:
    """Lazy line-buffered view of an async byte source.

    Lines are pulled from upstream on demand. Multiple readers each get
    a fresh cursor and replay the same sequence.
    """
    def __init__(self, source: ByteSource | None) -> None:
        self._source = source
        self._buffered: list[bytes] = []  # complete lines (including \n)
        self._tail: bytes = b""           # partial last line, awaiting \n
        self._exhausted = False
        self._lock = asyncio.Lock()

    async def reader(self) -> AsyncIterator[bytes]:
        """Yield complete lines from index 0 onwards, pulling new ones lazily."""
        i = 0
        while True:
            if i < len(self._buffered):
                yield self._buffered[i]
                i += 1
                continue
            if self._exhausted:
                if self._tail:
                    # final partial line (no trailing newline)
                    yield self._tail
                    self._tail = b""
                return
            await self._pull_more()

    async def _pull_more(self) -> None:
        async with self._lock:
            # double-check after acquiring lock
            if self._exhausted:
                return
            if self._source is None:
                self._exhausted = True
                return
            if isinstance(self._source, bytes):
                self._tail += self._source
                self._source = None
                self._exhausted = True
                self._flush_tail_lines()
                return
            # async iterator
            try:
                chunk = await self._source.__anext__()
            except StopAsyncIteration:
                self._exhausted = True
                self._flush_tail_lines()
                return
            self._tail += chunk
            self._flush_tail_lines()

    def _flush_tail_lines(self) -> None:
        # split self._tail on \n, keep complete lines, retain trailing partial
        while b"\n" in self._tail:
            line, _, self._tail = self._tail.partition(b"\n")
            self._buffered.append(line + b"\n")
```

### Wire into loops

In `handle_for` and `_condition_loop`:

```python
# Before
prev_buffer = session._stdin_buffer
if stdin is not None:
    session._stdin_buffer = await materialize(stdin)  # eager
    stdin = None

# After
prev_buffer = session._stdin_buffer
if stdin is not None:
    session._stdin_buffer = AsyncLineBuffer(stdin)  # lazy
    stdin = None
```

Then anywhere `session._stdin_buffer` is consumed, treat it as either `bytes` (legacy) or `AsyncLineBuffer` (new). Likely there's a single consumer (`read` builtin); update it to call `.reader()` and read whatever the iteration needs.

### Tasks

1. Create `mirage/io/line_buffer.py` with `AsyncLineBuffer`.
1. Update `handle_for` and `_condition_loop` in `executor/control.py` to use it.
1. Find consumers of `session._stdin_buffer` (likely `read` builtin and possibly cat/head) and adapt them to handle the buffer type.
1. Add unit tests for `AsyncLineBuffer`:
   - Simple bytes input → yields lines correctly
   - Async iterator input → pulls lazily
   - Multiple readers → each gets independent cursor (replay)
   - Partial trailing line (no `\n`) → yielded at end
1. Add an integration test: `find /large | while read f; do echo $f; done | head -n 5` — verify it returns immediately after 5 lines, doesn't materialize all of `find`'s output.

### Risk

Medium. The current eager-materialization works for everyone. Changing to lazy means iteration order, error propagation, and partial-read semantics all need careful thought. Don't change the loop's iteration model — only change how stdin is buffered between iterations.

### Verification

- New unit tests for `AsyncLineBuffer` (4-5 cases)
- New integration test for streaming behavior
- Re-run any example that pipes into a loop (search examples for `while read` or `for f in $(`)
- Verify memory: a 10GB stdin into a `head` should not OOM

______________________________________________________________________

## Implementation order

| #   | Step                         | Effort | Why this order                                                      |
| --- | ---------------------------- | ------ | ------------------------------------------------------------------- |
| 1   | Step 5 (frozen PathSpec)     | Small  | Defensive; surfaces hidden mutations before we do the riskier work  |
| 2   | Step 16 (interleaved stderr) | Small  | Self-contained; one function rewrite + one test                     |
| 3   | Step 15 (lazy stdin)         | Medium | Touches loop control flow; do last when other foundations are solid |

Each step gets its own commit (or small PR). Run `uv run pytest` between them — early failures are easier to diagnose than late ones.

______________________________________________________________________

## Verification (across all 3)

- `uv run pytest` — full suite
- `pre-commit run --all-files`
- Spot-check `examples/disk/disk.py`, `examples/s3/s3.py`, `examples/discord/discord.py` — these exercise loops, prefix stamping, and pipes
- For step 15 specifically: write a temp script that pipes `find` into a `while read` loop and verifies it streams (uses memory < O(n))

______________________________________________________________________

## What we're NOT doing

- No new abstractions over PathSpec (e.g., builders, factories) — `replace()` is sufficient.
- No replacing `merge_stdout_stderr` with a generic N-way merge — only stdout+stderr today.
- No changing the `_stdin_buffer` field name in Session — keep the surface stable, only change the type.
