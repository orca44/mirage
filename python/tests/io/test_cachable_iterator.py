# ========= Copyright 2026 @ Strukto.AI All Rights Reserved. =========
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# ========= Copyright 2026 @ Strukto.AI All Rights Reserved. =========

import asyncio

import pytest

from mirage.io.cachable_iterator import CachableAsyncIterator


async def _async_source_two_chunks():
    yield b"aaa"
    yield b"bbb"


async def _async_source_three_chunks():
    yield b"aaa"
    yield b"bbb"
    yield b"ccc"


async def _run_yields_chunks():
    ci = CachableAsyncIterator(_async_source_two_chunks())
    chunks = []
    async for chunk in ci:
        chunks.append(chunk)
    assert chunks == [b"aaa", b"bbb"]


async def _run_drain_after_partial():
    ci = CachableAsyncIterator(_async_source_three_chunks())
    chunk = await ci.__anext__()
    assert chunk == b"aaa"
    result = await ci.drain()
    assert result == b"aaabbbccc"


async def _run_drain_without_iteration():
    ci = CachableAsyncIterator(_async_source_two_chunks())
    assert await ci.drain() == b"aaabbb"


def test_cachable_async_iterator_yields_chunks():
    asyncio.run(_run_yields_chunks())


def test_cachable_async_iterator_drain_after_partial():
    asyncio.run(_run_drain_after_partial())


def test_cachable_async_iterator_drain_without_iteration():
    asyncio.run(_run_drain_without_iteration())


async def _run_exhausted_false_before_full_consumption():
    ci = CachableAsyncIterator(_async_source_two_chunks())
    assert ci.exhausted is False
    await ci.__anext__()
    assert ci.exhausted is False


async def _run_exhausted_true_after_full_iteration():
    ci = CachableAsyncIterator(_async_source_two_chunks())
    async for _ in ci:
        pass
    assert ci.exhausted is True


async def _run_exhausted_true_after_drain():
    ci = CachableAsyncIterator(_async_source_two_chunks())
    await ci.__anext__()
    await ci.drain()
    assert ci.exhausted is True


async def _run_drain_includes_already_consumed():
    ci = CachableAsyncIterator(_async_source_three_chunks())
    await ci.__anext__()
    await ci.__anext__()
    result = await ci.drain()
    assert result == b"aaabbbccc"


async def _run_wait_for_drain_returns_full_data():
    ci = CachableAsyncIterator(_async_source_three_chunks())
    await ci.__anext__()
    task = asyncio.create_task(ci.drain())
    result = await ci.wait_for_drain()
    await task
    assert result == b"aaabbbccc"


async def _slow_source():
    yield b"aaa"
    await asyncio.sleep(0.05)
    yield b"bbb"
    await asyncio.sleep(0.05)
    yield b"ccc"


async def _run_wait_for_drain_concurrent_with_background_drain():
    ci = CachableAsyncIterator(_slow_source())
    await ci.__anext__()
    drain_task = asyncio.create_task(ci.drain())
    r1 = await ci.wait_for_drain()
    r2 = await ci.wait_for_drain()
    drain_result = await drain_task
    assert r1 == b"aaabbbccc"
    assert r2 == b"aaabbbccc"
    assert drain_result == b"aaabbbccc"


async def _run_wait_for_drain_after_drain_already_done():
    ci = CachableAsyncIterator(_async_source_two_chunks())
    await ci.drain()
    result = await ci.wait_for_drain()
    assert result == b"aaabbb"


async def _run_drain_event_set_after_drain():
    ci = CachableAsyncIterator(_async_source_two_chunks())
    assert not ci.drain_event.is_set()
    await ci.drain()
    assert ci.drain_event.is_set()


def test_cachable_async_iterator_exhausted_false_before_full():
    asyncio.run(_run_exhausted_false_before_full_consumption())


def test_cachable_async_iterator_exhausted_true_after_iteration():
    asyncio.run(_run_exhausted_true_after_full_iteration())


def test_cachable_async_iterator_exhausted_true_after_drain():
    asyncio.run(_run_exhausted_true_after_drain())


def test_cachable_async_iterator_drain_includes_already_consumed():
    asyncio.run(_run_drain_includes_already_consumed())


def test_cachable_async_iterator_wait_for_drain_returns_full_data():
    asyncio.run(_run_wait_for_drain_returns_full_data())


def test_cachable_async_iterator_wait_for_drain_concurrent():
    asyncio.run(_run_wait_for_drain_concurrent_with_background_drain())


def test_cachable_async_iterator_wait_for_drain_after_done():
    asyncio.run(_run_wait_for_drain_after_drain_already_done())


def test_cachable_async_iterator_drain_event_set_after_drain():
    asyncio.run(_run_drain_event_set_after_drain())


async def _failing_source():
    yield b"aaa"
    raise RuntimeError("source failed")


async def _run_wait_for_drain_after_normal_iteration():
    ci = CachableAsyncIterator(_async_source_two_chunks())
    async for _ in ci:
        pass
    assert ci.exhausted is True
    result = await ci.wait_for_drain()
    assert result == b"aaabbb"


def test_cachable_async_iterator_wait_for_drain_after_normal_iteration():
    asyncio.run(_run_wait_for_drain_after_normal_iteration())


async def _run_drain_event_set_on_source_exception():
    ci = CachableAsyncIterator(_failing_source())
    with pytest.raises(RuntimeError, match="source failed"):
        await ci.drain()
    assert ci.drain_event.is_set()


def test_cachable_async_iterator_drain_event_set_on_exception():
    asyncio.run(_run_drain_event_set_on_source_exception())


async def _run_drain_event_set_on_cancellation():

    async def _blocking_source():
        yield b"aaa"
        await asyncio.sleep(10)
        yield b"bbb"

    ci = CachableAsyncIterator(_blocking_source())
    task = asyncio.create_task(ci.drain())
    await asyncio.sleep(0.05)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert ci.drain_event.is_set()


def test_cachable_async_iterator_drain_event_set_on_cancellation():
    asyncio.run(_run_drain_event_set_on_cancellation())


async def _run_wait_for_drain_during_normal_iteration():
    ci = CachableAsyncIterator(_slow_source())

    async def consume():
        async for _ in ci:
            pass

    task = asyncio.create_task(consume())
    result = await ci.wait_for_drain()
    await task
    assert result == b"aaabbbccc"


def test_cachable_async_iterator_wait_for_drain_during_normal_iteration():
    asyncio.run(_run_wait_for_drain_during_normal_iteration())
