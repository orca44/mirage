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

import time
from unittest.mock import patch

import pytest

from mirage.core.google.cache import CacheEntry, FileCache


@pytest.fixture
def cache():
    return FileCache(ttl=60)


@pytest.fixture
def entry():
    return CacheEntry(
        file_id="file1",
        name="Test File",
        mime_type="text/plain",
        modified_time="2026-04-01T00:00:00.000Z",
        filename="test_file.txt",
    )


def test_put_and_get(cache, entry):
    cache.put("folder/test_file.txt", entry)
    result = cache.get("folder/test_file.txt")
    assert result is not None
    assert result.file_id == "file1"
    assert result.name == "Test File"


def test_get_missing(cache):
    result = cache.get("nonexistent/file.txt")
    assert result is None


def test_list_dir_empty(cache):
    result = cache.list_dir("some_dir")
    assert result is None


def test_set_dir_and_list(cache):
    entries = [
        ("a.txt",
         CacheEntry(
             file_id="a",
             name="A",
             mime_type="text/plain",
             modified_time="2026-04-01T00:00:00.000Z",
             filename="a.txt",
         )),
        ("b.txt",
         CacheEntry(
             file_id="b",
             name="B",
             mime_type="text/plain",
             modified_time="2026-04-01T00:00:00.000Z",
             filename="b.txt",
         )),
    ]
    cache.set_dir("mydir", entries)
    result = cache.list_dir("mydir")
    assert result is not None
    assert sorted(result) == ["mydir/a.txt", "mydir/b.txt"]


def test_list_dir_ttl_expiry(cache):
    entries = [
        ("file.txt",
         CacheEntry(
             file_id="f",
             name="F",
             mime_type="text/plain",
             modified_time="2026-04-01T00:00:00.000Z",
             filename="file.txt",
         )),
    ]
    cache.set_dir("dir", entries)
    assert cache.list_dir("dir") is not None

    with patch("mirage.core.google.cache.time") as mock_time:
        mock_time.time.return_value = time.time() + 120
        result = cache.list_dir("dir")
        assert result is None


def test_clear(cache, entry):
    cache.put("folder/test.txt", entry)
    cache.set_dir("folder", [("test.txt", entry)])
    assert cache.get("folder/test.txt") is not None
    assert cache.list_dir("folder") is not None

    cache.clear()
    assert cache.get("folder/test.txt") is None
    assert cache.list_dir("folder") is None
