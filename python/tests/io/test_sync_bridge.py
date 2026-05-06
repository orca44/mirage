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

from mirage.io.sync_bridge import async_to_sync_iter, sync_to_async_iter


async def _async_chunks():
    yield b"aaa"
    yield b"bbb"
    yield b"ccc"


async def _async_single_chunk():
    yield b"only"


async def _async_empty():
    return
    yield b""


def _make_loop() -> asyncio.AbstractEventLoop:
    loop = asyncio.new_event_loop()
    return loop


def test_basic_conversion():
    loop = _make_loop()
    try:
        chunks = list(async_to_sync_iter(_async_chunks(), loop))
        assert chunks == [b"aaa", b"bbb", b"ccc"]
    finally:
        loop.close()


def test_concatenated_output():
    loop = _make_loop()
    try:
        result = b"".join(async_to_sync_iter(_async_chunks(), loop))
        assert result == b"aaabbbccc"
    finally:
        loop.close()


def test_single_chunk():
    loop = _make_loop()
    try:
        chunks = list(async_to_sync_iter(_async_single_chunk(), loop))
        assert chunks == [b"only"]
    finally:
        loop.close()


def test_empty_iterator():
    loop = _make_loop()
    try:
        chunks = list(async_to_sync_iter(_async_empty(), loop))
        assert chunks == []
    finally:
        loop.close()


def test_early_termination():
    loop = _make_loop()
    consumed = []
    try:
        it = async_to_sync_iter(_async_chunks(), loop)
        first = next(it)
        consumed.append(first)
        assert first == b"aaa"
        assert len(consumed) == 1
    finally:
        loop.close()


def _sync_producer(queue: asyncio.Queue, items: list[bytes]) -> None:
    for item in items:
        queue.put_nowait(item)
    queue.put_nowait(None)


@pytest.mark.asyncio
async def test_sync_to_async_iter_yields_all_items():
    chunks = []
    async for item in sync_to_async_iter(_sync_producer,
                                         [b"aaa", b"bbb", b"ccc"]):
        chunks.append(item)
    assert chunks == [b"aaa", b"bbb", b"ccc"]


@pytest.mark.asyncio
async def test_sync_to_async_iter_empty():
    chunks = []
    async for item in sync_to_async_iter(_sync_producer, []):
        chunks.append(item)
    assert chunks == []


@pytest.mark.asyncio
async def test_sync_to_async_iter_single_item():
    chunks = []
    async for item in sync_to_async_iter(_sync_producer, [b"only"]):
        chunks.append(item)
    assert chunks == [b"only"]
