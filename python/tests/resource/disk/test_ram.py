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
import hashlib

import pytest

from mirage.types import FileType


def _cat_sync(backend, path):

    async def _collect():
        return b"".join([c async for c in backend.read_stream(path)])

    return asyncio.run(_collect())


def test_write_and_read(memory_backend):
    asyncio.run(memory_backend.write("/f.txt", data=b"hello"))
    assert _cat_sync(memory_backend, "/f.txt") == b"hello"


def test_create_and_write(memory_backend):
    asyncio.run(memory_backend.write("/a.txt", data=b"data"))
    assert _cat_sync(memory_backend, "/a.txt") == b"data"


def test_read_partial_with_offset(memory_backend):
    asyncio.run(memory_backend.write("/f.txt", data=b"abcdef"))
    assert _cat_sync(memory_backend, "/f.txt")[2:5] == b"cde"


def test_read_missing_raises(memory_backend):
    with pytest.raises(FileNotFoundError):
        _cat_sync(memory_backend, "/missing.txt")


def test_mkdir_and_readdir(memory_backend):
    asyncio.run(memory_backend.mkdir("/mydir"))
    entries = asyncio.run(
        memory_backend.readdir("/mydir", memory_backend.index))
    assert entries == []


def test_mkdir_missing_parent_raises(memory_backend):
    with pytest.raises(FileNotFoundError):
        asyncio.run(memory_backend.mkdir("/a/b/c"))


def test_rmdir_empty(memory_backend):
    asyncio.run(memory_backend.mkdir("/emptydir"))
    asyncio.run(memory_backend.rmdir("/emptydir"))
    with pytest.raises(FileNotFoundError):
        asyncio.run(memory_backend.stat("/emptydir"))


def test_rmdir_nonempty_raises(memory_backend):
    asyncio.run(memory_backend.mkdir("/dir"))
    asyncio.run(memory_backend.write("/dir/file.txt", data=b""))
    with pytest.raises(OSError):
        asyncio.run(memory_backend.rmdir("/dir"))


def test_unlink(memory_backend):
    asyncio.run(memory_backend.write("/del.txt", data=b""))
    asyncio.run(memory_backend.unlink("/del.txt"))
    with pytest.raises(FileNotFoundError):
        _cat_sync(memory_backend, "/del.txt")


def test_unlink_missing_raises(memory_backend):
    with pytest.raises(FileNotFoundError):
        asyncio.run(memory_backend.unlink("/nope.txt"))


def test_rename_file(memory_backend):
    asyncio.run(memory_backend.write("/old.txt", data=b"content"))
    asyncio.run(memory_backend.rename("/old.txt", "/new.txt"))
    assert _cat_sync(memory_backend, "/new.txt") == b"content"
    with pytest.raises(FileNotFoundError):
        _cat_sync(memory_backend, "/old.txt")


def test_stat_file(memory_backend):
    asyncio.run(memory_backend.write("/f.txt", data=b"hello"))
    s = asyncio.run(memory_backend.stat("/f.txt"))
    assert s.name == "f.txt"
    assert s.size == 5
    assert s.type == "text"


def test_stat_directory(memory_backend):
    asyncio.run(memory_backend.mkdir("/mydir"))
    s = asyncio.run(memory_backend.stat("/mydir"))
    assert s.type == FileType.DIRECTORY
    assert s.size is None


def test_stat_missing_raises(memory_backend):
    with pytest.raises(FileNotFoundError):
        asyncio.run(memory_backend.stat("/missing.txt"))


def test_exists_true(memory_backend):
    asyncio.run(memory_backend.write("/f.txt", data=b""))
    try:
        asyncio.run(memory_backend.stat("/f.txt"))
        exists = True
    except FileNotFoundError:
        exists = False
    assert exists


def test_exists_false(memory_backend):
    try:
        asyncio.run(memory_backend.stat("/nope.txt"))
        exists = True
    except FileNotFoundError:
        exists = False
    assert not exists


def test_checksum_deterministic(memory_backend):
    asyncio.run(memory_backend.write("/f.txt", data=b"data"))
    raw = asyncio.run(memory_backend.read_bytes("/f.txt"))
    c1 = hashlib.md5(raw).hexdigest()
    c2 = hashlib.md5(raw).hexdigest()
    assert c1 == c2
    assert len(c1) == 32


def test_readdir_lists_direct_children(memory_backend):
    asyncio.run(memory_backend.mkdir("/parent"))
    asyncio.run(memory_backend.mkdir("/parent/child1"))
    asyncio.run(memory_backend.write("/parent/file.txt", data=b""))
    entries = asyncio.run(
        memory_backend.readdir("/parent", memory_backend.index))
    assert any("child1" in e for e in entries)
    assert any("file.txt" in e for e in entries)
