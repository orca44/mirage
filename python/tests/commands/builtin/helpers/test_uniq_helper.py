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

from mirage.commands.builtin.uniq_helper import uniq as _uniq_impl


def _norm(path):
    return "/" + path.strip("/")


def _write(backend, path, data):
    backend.accessor.store.files[_norm(path)] = data


def _read(backend, path):
    return backend.accessor.store.files[_norm(path)]


def uniq(backend, path, **kwargs):
    return _uniq_impl(lambda p: _read(backend, p), path, **kwargs)


class TestUniqDefault:

    def test_removes_consecutive_dupes(self, backend):
        _write(backend, "/tmp/f.txt", b"aaa\naaa\nbbb\nccc\nccc")
        result = uniq(backend, "/tmp/f.txt")
        assert result == ["aaa", "bbb", "ccc"]

    def test_non_consecutive_kept(self, backend):
        _write(backend, "/tmp/f.txt", b"aaa\nbbb\naaa")
        result = uniq(backend, "/tmp/f.txt")
        assert result == ["aaa", "bbb", "aaa"]


class TestUniqCount:

    def test_count(self, backend):
        _write(backend, "/tmp/f.txt", b"aaa\naaa\nbbb\nccc\nccc\nccc")
        result = uniq(backend, "/tmp/f.txt", count=True)
        assert result == ["      2 aaa", "      1 bbb", "      3 ccc"]


class TestUniqDuplicatesOnly:

    def test_with_dupes(self, backend):
        _write(backend, "/tmp/f.txt", b"aaa\naaa\nbbb\nccc\nccc")
        result = uniq(backend, "/tmp/f.txt", duplicates_only=True)
        assert result == ["aaa", "ccc"]

    def test_without_dupes(self, backend):
        _write(backend, "/tmp/f.txt", b"aaa\nbbb\nccc")
        result = uniq(backend, "/tmp/f.txt", duplicates_only=True)
        assert result == []


class TestUniqUniqueOnly:

    def test_with_unique(self, backend):
        _write(backend, "/tmp/f.txt", b"aaa\naaa\nbbb\nccc\nccc")
        result = uniq(backend, "/tmp/f.txt", unique_only=True)
        assert result == ["bbb"]

    def test_without_unique(self, backend):
        _write(backend, "/tmp/f.txt", b"aaa\naaa\nbbb\nbbb")
        result = uniq(backend, "/tmp/f.txt", unique_only=True)
        assert result == []


class TestUniqMixed:

    def test_count_duplicates_only(self, backend):
        _write(backend, "/tmp/f.txt", b"aaa\naaa\nbbb\nccc\nccc\nccc")
        result = uniq(backend, "/tmp/f.txt", count=True, duplicates_only=True)
        assert result == ["      2 aaa", "      3 ccc"]


class TestUniqEdge:

    def test_empty_file(self, backend):
        _write(backend, "/tmp/f.txt", b"")
        result = uniq(backend, "/tmp/f.txt")
        assert result == []

    def test_single_line(self, backend):
        _write(backend, "/tmp/f.txt", b"hello")
        result = uniq(backend, "/tmp/f.txt")
        assert result == ["hello"]
