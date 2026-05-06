# Search Push-down — Multi-path Coalescing & Runtime Fallback (Slack + Discord)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `grep` and `rg` honor the existing native-search push-down for Slack and Discord even when the shell expands a glob into many concrete paths or an agent loops one file at a time, and fall back gracefully to per-file scan when the native API errors at runtime.

**Architecture:** Per-resource, no shared protocol — keeps the convention from `2026-04-16-scope-detection-protocol.md` (each `core/<name>/scope.py` defines its own dataclass; the only convention is a `use_native: bool` for Slack-shape resources, or `level` for Discord). Three pieces, repeated for each resource:

1. **`coalesce_scopes(paths)`** in `core/<name>/scope.py`: given `list[PathSpec]`, return a single channel-level scope if every path resolves to the same channel/guild, else `None`.
1. **Multi-path dispatch** in each `<resource>/grep/grep.py` and `<resource>/rg.py`: when `detect_scope(paths[0])` doesn't take the native path, try `coalesce_scopes(paths)` before falling through to scan.
1. **Runtime fallback**: wrap the native call in `try/except`; on exception, log and proceed to the existing per-file scan. (Empty native results are NOT fallback — that's a legitimate "no match.")

**Tech Stack:** Python 3.12, `httpx` (Slack/Discord APIs), pytest with `pytest-asyncio`.

**Why now:** OpenHands run on 2026-04-25 spent ~2 minutes against Slack because the agent looped grep over 57 concrete `<date>.jsonl` paths. Each call hit `detect_scope(paths[0])` with a single concrete file → `use_native=False` → per-day fetch. With multi-path coalescing the same workload collapses to 1 `search.messages` call.

**Out of scope (separate plans):**

- `wc -l` push-down — both Slack and Discord search APIs require a content query; counting needs different machinery (history pagination or thread-only fields).
- Email / Gmail / Notion / MongoDB — same shape, sweep up in Tier 2.
- S3 — no content-search API since AWS deprecated S3 Select; needs parallel-scan plan instead.
- TypeScript parity — mirror after Python work lands.
- `find -name`, `head`, `tail` — different optimization shapes per builtin.

______________________________________________________________________

## Task 1: Slack `coalesce_scopes`

**Files:**

- Modify: `python/mirage/core/slack/scope.py` (add helper to existing module)
- Test: `python/tests/core/slack/test_scope.py` (extend if exists, else create)

**Step 1: Read existing scope code**

Read [python/mirage/core/slack/scope.py](python/mirage/core/slack/scope.py) end-to-end. The new helper must return the existing `SlackScope` dataclass — don't introduce a new type.

**Step 2: Write failing tests**

```python
# python/tests/core/slack/test_scope.py  (extend or create)
from mirage.core.slack.scope import coalesce_scopes
from mirage.types import PathSpec


def _spec(path: str, prefix: str = "/slack") -> PathSpec:
    return PathSpec(original=path, directory=path, prefix=prefix)


def test_coalesce_concrete_jsonl_paths_same_channel():
    paths = [
        _spec(f"/slack/channels/general__C1/2026-01-{day:02d}.jsonl")
        for day in range(1, 8)
    ]
    scope = coalesce_scopes(paths)
    assert scope is not None
    assert scope.use_native is True
    assert scope.channel_name == "general"
    assert scope.channel_id == "C1"
    assert scope.container == "channels"


def test_coalesce_returns_none_for_mixed_channels():
    paths = [
        _spec("/slack/channels/general__C1/2026-01-01.jsonl"),
        _spec("/slack/channels/random__C2/2026-01-01.jsonl"),
    ]
    assert coalesce_scopes(paths) is None


def test_coalesce_returns_none_for_mixed_containers():
    paths = [
        _spec("/slack/channels/general__C1/2026-01-01.jsonl"),
        _spec("/slack/dms/alice__D1/2026-01-01.jsonl"),
    ]
    assert coalesce_scopes(paths) is None


def test_coalesce_single_path_delegates_to_detect_scope():
    p = _spec("/slack/channels/general__C1/2026-01-01.jsonl")
    scope = coalesce_scopes([p])
    assert scope is not None
    assert scope.use_native is True
    assert scope.channel_name == "general"


def test_coalesce_empty_list_returns_none():
    assert coalesce_scopes([]) is None
```

**Step 3: Run tests to verify they fail**

```
cd python && uv run pytest tests/core/slack/test_scope.py -v --no-cov
```

Expected: ImportError on `coalesce_scopes`.

**Step 4: Implement `coalesce_scopes`**

Append to `python/mirage/core/slack/scope.py`:

```python
def coalesce_scopes(paths: list[PathSpec]) -> SlackScope | None:
    if not paths:
        return None
    scopes = [detect_scope(p) for p in paths]
    first = scopes[0]
    container = first.container
    channel = first.channel_name
    cid = first.channel_id
    if container is None or channel is None:
        return None
    for s in scopes[1:]:
        if (s.container != container
                or s.channel_name != channel
                or s.channel_id != cid):
            return None
    resource_path = (f"{container}/{channel}__{cid}"
                     if cid else f"{container}/{channel}")
    return SlackScope(
        use_native=True,
        container=container,
        channel_name=channel,
        channel_id=cid,
        resource_path=resource_path,
    )
```

**Step 5: Run tests to verify pass**

```
cd python && uv run pytest tests/core/slack/test_scope.py -v --no-cov
```

Expected: 5 passed.

**Step 6: Commit**

```
git add python/mirage/core/slack/scope.py python/tests/core/slack/test_scope.py
git commit -m "feat(slack/scope): coalesce_scopes for multi-path pushdown"
```

______________________________________________________________________

## Task 2: Slack `grep` + `rg` — coalesce + runtime fallback

**Files:**

- Modify: `python/mirage/commands/builtin/slack/grep/grep.py:81-92`
- Modify: `python/mirage/commands/builtin/slack/rg.py:73-84` (mirror grep changes — `rg` is a sibling)
- Test: `python/tests/commands/builtin/slack/test_grep_pushdown.py`

**Step 1: Read existing dispatch**

Read [python/mirage/commands/builtin/slack/grep/grep.py:81-92](python/mirage/commands/builtin/slack/grep/grep.py#L81-L92) and [python/mirage/commands/builtin/slack/rg.py:73-84](python/mirage/commands/builtin/slack/rg.py#L73-L84). The dispatch shape is identical — both need the same change.

**Step 2: Write failing tests**

```python
# python/tests/commands/builtin/slack/test_grep_pushdown.py
from unittest.mock import AsyncMock, patch

import pytest

from mirage.commands.builtin.slack.grep.grep import grep
from mirage.commands.builtin.slack.rg import rg
from mirage.types import PathSpec


def _concrete_paths(n: int = 7):
    return [
        PathSpec(
            original=f"/slack/channels/general__C1/2026-01-{d:02d}.jsonl",
            directory=f"/slack/channels/general__C1/2026-01-{d:02d}.jsonl",
            prefix="/slack",
        ) for d in range(1, n + 1)
    ]


@pytest.mark.asyncio
async def test_grep_with_many_concrete_paths_uses_native_search():
    accessor = AsyncMock()
    accessor.config = AsyncMock()
    fake_payload = (b'{"messages":{"matches":[{"channel":{"name":"general",'
                    b'"id":"C1"},"ts":"1700000000.0","text":"hello there"}]}}')
    with patch(
            "mirage.commands.builtin.slack.grep.grep.search_messages",
            new=AsyncMock(return_value=fake_payload),
    ) as fake_search:
        out, io = await grep(accessor, _concrete_paths(7), "hello", i=True)
    assert fake_search.await_count == 1
    assert io.exit_code == 0
    assert b"hello there" in out


@pytest.mark.asyncio
async def test_rg_with_many_concrete_paths_uses_native_search():
    accessor = AsyncMock()
    accessor.config = AsyncMock()
    fake_payload = (b'{"messages":{"matches":[{"channel":{"name":"general",'
                    b'"id":"C1"},"ts":"1700000000.0","text":"hello rg"}]}}')
    with patch(
            "mirage.commands.builtin.slack.rg.search_messages",
            new=AsyncMock(return_value=fake_payload),
    ) as fake_search:
        out, io = await rg(accessor, _concrete_paths(7), "hello", i=True)
    assert fake_search.await_count == 1
    assert io.exit_code == 0
    assert b"hello rg" in out


@pytest.mark.asyncio
async def test_grep_falls_back_when_native_search_raises():
    accessor = AsyncMock()
    accessor.config = AsyncMock()
    paths = [
        PathSpec(original="/slack/channels/general__C1/*.jsonl",
                 directory="/slack/channels/general__C1/",
                 pattern="*.jsonl",
                 prefix="/slack"),
    ]
    with patch(
            "mirage.commands.builtin.slack.grep.grep.search_messages",
            new=AsyncMock(side_effect=RuntimeError(
                "missing search:read scope")),
    ), patch(
            "mirage.commands.builtin.slack.grep.grep.resolve_glob",
            new=AsyncMock(return_value=paths),
    ), patch(
            "mirage.commands.builtin.slack.grep.grep.slack_read",
            new=AsyncMock(return_value=b""),
    ):
        out, io = await grep(accessor, paths, "hello", i=True)
    # Either no matches (1) or fall-through to scan (0) — but no exception
    assert io.exit_code in (0, 1)


@pytest.mark.asyncio
async def test_grep_native_empty_does_not_trigger_fallback():
    """search returning [] is a legit no-match — don't double-scan."""
    accessor = AsyncMock()
    accessor.config = AsyncMock()
    empty_payload = b'{"messages":{"matches":[]}}'
    with patch(
            "mirage.commands.builtin.slack.grep.grep.search_messages",
            new=AsyncMock(return_value=empty_payload),
    ) as fake_search, patch(
            "mirage.commands.builtin.slack.grep.grep.slack_read",
            new=AsyncMock(return_value=b""),
    ) as fake_read:
        out, io = await grep(accessor, _concrete_paths(7), "missing")
    assert fake_search.await_count == 1
    assert fake_read.await_count == 0  # critical: no fallback scan
    assert io.exit_code == 1
    assert out == b""
```

**Step 3: Run tests to verify they fail**

```
cd python && uv run pytest tests/commands/builtin/slack/test_grep_pushdown.py -v --no-cov
```

Expected: tests 1, 2 fail (`paths[0]` is concrete `.jsonl`, scope.use_native=False, search not called); test 3 fails (exception bubbles up); test 4 may pass coincidentally.

**Step 4: Modify dispatch — `grep`**

Update [python/mirage/commands/builtin/slack/grep/grep.py:81-92](python/mirage/commands/builtin/slack/grep/grep.py#L81-L92):

```python
if paths:
    scope = detect_scope(paths[0])
    if not scope.use_native:
        scope = coalesce_scopes(paths) or scope

    if scope.use_native:
        try:
            file_prefix = paths[0].prefix or ""
            query = build_query(pattern, scope)
            raw = await search_messages(accessor.config,
                                        query,
                                        count=max_count or 100)
            lines = format_grep_results(raw, scope, file_prefix)
            if not lines:
                return b"", IOResult(exit_code=1)
            return ("\n".join(lines) + "\n").encode(), IOResult()
        except Exception as e:
            logger.warning(
                "slack search push-down failed (%s); "
                "falling back to per-file scan", e)

    paths = await resolve_glob(accessor, paths, index)
    # ... existing scan logic unchanged
```

Add at top of file:

```python
import logging

from mirage.core.slack.scope import coalesce_scopes, detect_scope

logger = logging.getLogger(__name__)
```

**Step 5: Modify dispatch — `rg`** (same shape)

Apply the identical pattern to [python/mirage/commands/builtin/slack/rg.py:73-84](python/mirage/commands/builtin/slack/rg.py#L73-L84). Add the same imports.

**Step 6: Run tests to verify pass**

```
cd python && uv run pytest tests/commands/builtin/slack/ tests/core/slack/ -v --no-cov
```

Expected: 4 new tests pass; existing slack tests (`tests/commands/builtin/slack/`, `tests/core/slack/`) still pass.

**Step 7: Commit**

```
git add python/mirage/commands/builtin/slack/grep/grep.py python/mirage/commands/builtin/slack/rg.py python/tests/commands/builtin/slack/test_grep_pushdown.py
git commit -m "feat(slack/grep,rg): coalesce concrete paths + runtime fallback"
```

______________________________________________________________________

## Task 3: Discord `coalesce_scopes` (async)

**Files:**

- Modify: `python/mirage/core/discord/scope.py` (add async helper)
- Test: `python/tests/core/discord/test_scope.py` (extend or create)

**Step 1: Read existing scope code**

Read [python/mirage/core/discord/scope.py](python/mirage/core/discord/scope.py). Note Discord's scope is shape-different from Slack:

- Field is `level: "file" | "channel" | "guild" | "root"`, not `use_native: bool`.
- `detect_scope` is **async** because it consults the index to map names → snowflakes. Therefore `coalesce_scopes` is also async.

**Step 2: Write failing tests**

```python
# python/tests/core/discord/test_scope.py  (extend or create)
from unittest.mock import AsyncMock

import pytest

from mirage.core.discord.scope import coalesce_scopes
from mirage.types import PathSpec


def _spec(path: str, prefix: str = "/discord") -> PathSpec:
    return PathSpec(original=path, directory=path, prefix=prefix)


@pytest.fixture
def fake_index():
    idx = AsyncMock()

    async def _get(virtual_key):
        # Return guild_id / channel_id by inspecting the key
        result = AsyncMock()
        if virtual_key.endswith("/myguild/channels/general"):
            result.entry = type("E", (), {"id": "ch_456"})
        elif virtual_key.endswith("/myguild"):
            result.entry = type("E", (), {"id": "g_123"})
        else:
            result.entry = None
        return result

    idx.get.side_effect = _get
    return idx


@pytest.mark.asyncio
async def test_coalesce_concrete_jsonl_paths_same_channel(fake_index):
    paths = [
        _spec(f"/discord/myguild/channels/general/2026-01-{d:02d}.jsonl")
        for d in range(1, 8)
    ]
    scope = await coalesce_scopes(paths, fake_index)
    assert scope is not None
    assert scope.level == "channel"
    assert scope.guild_id == "g_123"
    assert scope.channel_id == "ch_456"


@pytest.mark.asyncio
async def test_coalesce_returns_none_for_mixed_channels(fake_index):
    paths = [
        _spec("/discord/myguild/channels/general/2026-01-01.jsonl"),
        _spec("/discord/myguild/channels/random/2026-01-01.jsonl"),
    ]
    assert await coalesce_scopes(paths, fake_index) is None


@pytest.mark.asyncio
async def test_coalesce_empty_list_returns_none(fake_index):
    assert await coalesce_scopes([], fake_index) is None
```

**Step 3: Run tests** — expected ImportError on `coalesce_scopes`.

```
cd python && uv run pytest tests/core/discord/test_scope.py -v --no-cov
```

**Step 4: Implement async `coalesce_scopes`**

Append to `python/mirage/core/discord/scope.py`:

```python
async def coalesce_scopes(
    paths: list[PathSpec],
    index: IndexCacheStore = None,
) -> DiscordScope | None:
    if not paths:
        return None
    scopes = [await detect_scope(p, index) for p in paths]
    first = scopes[0]
    if first.guild_id is None or first.channel_id is None:
        return None
    for s in scopes[1:]:
        if (s.guild_id != first.guild_id
                or s.channel_id != first.channel_id):
            return None
    return DiscordScope(
        level="channel",
        guild_id=first.guild_id,
        channel_id=first.channel_id,
        resource_path=first.resource_path.rsplit("/", 1)[0]
        if first.level == "file" else first.resource_path,
    )
```

**Step 5: Run tests** — expected 3 PASS.

**Step 6: Commit**

```
git add python/mirage/core/discord/scope.py python/tests/core/discord/test_scope.py
git commit -m "feat(discord/scope): async coalesce_scopes for multi-path pushdown"
```

______________________________________________________________________

## Task 4: Discord `grep` + `rg` — coalesce + runtime fallback

**Files:**

- Modify: `python/mirage/commands/builtin/discord/grep/grep.py:80-104`
- Modify: `python/mirage/commands/builtin/discord/rg.py:73-90` (mirror grep)
- Test: `python/tests/commands/builtin/discord/test_grep_pushdown.py`

**Step 1: Read existing dispatch**

Read [python/mirage/commands/builtin/discord/grep/grep.py:80-104](python/mirage/commands/builtin/discord/grep/grep.py#L80-L104). The native dispatch fires when `scope.level in ("channel", "guild", "root")`. With concrete file paths, level is `"file"` — falls through to download.

**Step 2: Write failing tests**

```python
# python/tests/commands/builtin/discord/test_grep_pushdown.py
from unittest.mock import AsyncMock, patch

import pytest

from mirage.commands.builtin.discord.grep.grep import grep
from mirage.commands.builtin.discord.rg import rg
from mirage.types import PathSpec


def _concrete_paths(n: int = 7):
    return [
        PathSpec(
            original=f"/discord/myguild/channels/general/2026-01-{d:02d}.jsonl",
            directory=f"/discord/myguild/channels/general/2026-01-{d:02d}.jsonl",
            prefix="/discord",
        ) for d in range(1, n + 1)
    ]


def _fake_index(channel_id: str = "ch_456", guild_id: str = "g_123"):
    idx = AsyncMock()

    async def _get(virtual_key):
        result = AsyncMock()
        if virtual_key.endswith("/myguild/channels/general"):
            result.entry = type("E", (), {"id": channel_id})
        elif virtual_key.endswith("/myguild"):
            result.entry = type("E", (), {"id": guild_id})
        else:
            result.entry = None
        return result

    idx.get.side_effect = _get
    return idx


@pytest.mark.asyncio
async def test_discord_grep_with_many_concrete_paths_uses_native_search():
    accessor = AsyncMock()
    accessor.config = AsyncMock()
    fake_msgs = [{"content": "hello world",
                  "channel_id": "ch_456",
                  "author": {"username": "alice"},
                  "id": "1"}]
    with patch(
            "mirage.commands.builtin.discord.grep.grep.search_guild",
            new=AsyncMock(return_value=fake_msgs),
    ) as fake_search:
        out, io = await grep(
            accessor, _concrete_paths(7), "hello",
            index=_fake_index())
    assert fake_search.await_count == 1
    assert io.exit_code == 0
    assert b"hello" in out


@pytest.mark.asyncio
async def test_discord_grep_falls_back_when_native_raises():
    accessor = AsyncMock()
    accessor.config = AsyncMock()
    paths = [
        PathSpec(original="/discord/myguild/channels/general/*.jsonl",
                 directory="/discord/myguild/channels/general/",
                 pattern="*.jsonl",
                 prefix="/discord"),
    ]
    with patch(
            "mirage.commands.builtin.discord.grep.grep.search_guild",
            new=AsyncMock(side_effect=RuntimeError("rate limited")),
    ), patch(
            "mirage.commands.builtin.discord.grep.grep.resolve_glob",
            new=AsyncMock(return_value=paths),
    ), patch(
            "mirage.commands.builtin.discord.grep.grep.discord_read",
            new=AsyncMock(return_value=b""),
    ):
        out, io = await grep(accessor, paths, "hello", index=_fake_index())
    assert io.exit_code in (0, 1)


@pytest.mark.asyncio
async def test_discord_rg_with_many_concrete_paths_uses_native_search():
    accessor = AsyncMock()
    accessor.config = AsyncMock()
    fake_msgs = [{"content": "hello rg",
                  "channel_id": "ch_456",
                  "author": {"username": "bob"},
                  "id": "2"}]
    with patch(
            "mirage.commands.builtin.discord.rg.search_guild",
            new=AsyncMock(return_value=fake_msgs),
    ) as fake_search:
        out, io = await rg(
            accessor, _concrete_paths(7), "hello",
            index=_fake_index())
    assert fake_search.await_count == 1
    assert io.exit_code == 0
    assert b"hello" in out
```

**Step 3: Run tests to verify they fail.**

```
cd python && uv run pytest tests/commands/builtin/discord/test_grep_pushdown.py -v --no-cov
```

**Step 4: Modify dispatch — `grep`**

Update the head of `if paths:` in [python/mirage/commands/builtin/discord/grep/grep.py:80-104](python/mirage/commands/builtin/discord/grep/grep.py#L80-L104):

```python
if paths:
    scope = await detect_scope(paths[0], index)
    if scope.level == "file":
        coalesced = await coalesce_scopes(paths, index)
        if coalesced is not None:
            scope = coalesced

    if scope.level in ("channel", "guild"):
        try:
            if scope.guild_id is None:
                raise RuntimeError("cannot resolve guild ID")
            msgs = await search_guild(
                accessor.config,
                scope.guild_id,
                pattern,
                channel_id=scope.channel_id,
                limit=max_count or 100,
            )
            lines = format_grep_results(msgs)
            if not lines:
                return b"", IOResult(exit_code=1)
            return "\n".join(lines).encode(), IOResult()
        except Exception as e:
            logger.warning(
                "discord search push-down failed (%s); "
                "falling back to per-file scan", e)
    elif scope.level == "root":
        return b"", IOResult(
            exit_code=1,
            stderr=b"grep: root-level search not yet supported\n")

    # File scope (or fallback) → existing download+grep logic
    paths = await resolve_glob(accessor, paths, index=index)
    # ... existing scan logic unchanged
```

Add at top:

```python
import logging

from mirage.core.discord.scope import coalesce_scopes

logger = logging.getLogger(__name__)
```

**Step 5: Modify dispatch — `rg`** (same shape).

Apply the identical pattern to [python/mirage/commands/builtin/discord/rg.py:73-90](python/mirage/commands/builtin/discord/rg.py#L73-L90).

**Step 6: Run tests**

```
cd python && uv run pytest tests/commands/builtin/discord/ tests/core/discord/ -v --no-cov
```

Expected: 3 new tests pass; existing discord tests still pass.

**Step 7: Commit**

```
git add python/mirage/commands/builtin/discord/grep/grep.py python/mirage/commands/builtin/discord/rg.py python/tests/commands/builtin/discord/test_grep_pushdown.py
git commit -m "feat(discord/grep,rg): coalesce concrete paths + runtime fallback"
```

______________________________________________________________________

## Task 5: End-to-end iteration test

**Files:**

- Create: `python/tests/integration/test_search_pushdown_iteration.py`

**Step 1: Write integration tests**

Mimic the OpenHands iteration pattern: a workspace with Slack/Discord mounts and a single `grep` call over a glob the shell has already expanded into many concrete paths. Each test injects the native search wrapper as a counted mock and asserts it's called exactly once.

```python
# python/tests/integration/test_search_pushdown_iteration.py
from unittest.mock import AsyncMock, patch

import pytest

from mirage import MountMode, Workspace
from mirage.resource.slack import SlackConfig, SlackResource


@pytest.mark.asyncio
async def test_slack_grep_glob_expanded_to_60_paths_is_one_native_call():
    slack = SlackResource(config=SlackConfig(token="xoxb-test"))
    ws = Workspace({"/slack": (slack, MountMode.READ)},
                   mode=MountMode.READ)
    fake_payload = (b'{"messages":{"matches":[{"channel":{"name":"general",'
                    b'"id":"C1"},"ts":"1700000000.0","text":"hello"}]}}')
    expanded = " ".join(
        f"/slack/channels/general__C1/2026-{m:02d}-{d:02d}.jsonl"
        for m in range(1, 5) for d in range(1, 16))
    try:
        with patch(
                "mirage.commands.builtin.slack.grep.grep.search_messages",
                new=AsyncMock(return_value=fake_payload),
        ) as fake_search:
            result = await ws.execute(f"grep -i hello {expanded}")
        assert fake_search.await_count == 1
        assert result.exit_code == 0
        assert b"hello" in (result.stdout or b"")
    finally:
        await ws.close()
```

(Discord integration test skipped here — its index lookups for guild/channel IDs require a live accessor or a more elaborate fixture; the unit-level Discord test in Task 4 already verifies the dispatch.)

**Step 2: Run**

```
cd python && uv run pytest tests/integration/test_search_pushdown_iteration.py -v --no-cov
```

Expected: PASS once Tasks 1+2 have landed.

**Step 3: Run all changed/related test suites**

```
cd python && uv run pytest tests/core/slack/ tests/core/discord/ tests/commands/builtin/slack/ tests/commands/builtin/discord/ tests/integration/test_search_pushdown_iteration.py -v --no-cov
```

**Step 4: Commit**

```
git add python/tests/integration/test_search_pushdown_iteration.py
git commit -m "test(integration): grep over expanded glob is one native call"
```

______________________________________________________________________

## References

- Existing pattern: [docs/plans/2026-04-16-scope-detection-protocol.md](docs/plans/2026-04-16-scope-detection-protocol.md)
- Slack grep dispatch (current): [python/mirage/commands/builtin/slack/grep/grep.py:81-92](python/mirage/commands/builtin/slack/grep/grep.py#L81-L92)
- Slack rg dispatch (current): [python/mirage/commands/builtin/slack/rg.py:73-84](python/mirage/commands/builtin/slack/rg.py#L73-L84)
- Discord grep dispatch (current): [python/mirage/commands/builtin/discord/grep/grep.py:80-104](python/mirage/commands/builtin/discord/grep/grep.py#L80-L104)
- Discord rg dispatch (current): [python/mirage/commands/builtin/discord/rg.py:73-90](python/mirage/commands/builtin/discord/rg.py#L73-L90)
- Slack `search.messages` wrapper: [python/mirage/core/slack/search.py](python/mirage/core/slack/search.py)
- Discord `messages/search` wrapper: [python/mirage/core/discord/search.py](python/mirage/core/discord/search.py)
- Triggering scenario: OpenHands example at [examples/python/agents/openhands/sandbox_agent.py](examples/python/agents/openhands/sandbox_agent.py) executed `for f in *.jsonl; do grep -il "hello" $f; done` over 57 days of Slack messages → 57 sequential API calls instead of 1.
