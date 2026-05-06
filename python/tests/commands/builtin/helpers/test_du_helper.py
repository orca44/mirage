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

from mirage.commands.builtin.du_helper import du as _du_impl
from mirage.commands.builtin.du_helper import du_all as _du_all_impl
from mirage.types import FileStat, FileType
from mirage.utils.filetype import guess_type


def _norm(path):
    return "/" + path.strip("/")


def _write(backend, path, data):
    store = backend.accessor.store
    store.files[_norm(path)] = data


def _mkdir(backend, path):
    store = backend.accessor.store
    store.dirs.add(_norm(path))


def _sync_readdir(store, path):
    p = _norm(path)
    if p not in store.dirs:
        raise FileNotFoundError(p)
    prefix = p.rstrip("/") + "/"
    seen = set()
    for key in list(store.files) + list(store.dirs):
        if key == p:
            continue
        if key.startswith(prefix):
            remainder = key[len(prefix):]
            child = remainder.split("/")[0]
            if child:
                seen.add(prefix + child)
    return sorted(seen)


def _sync_stat(store, path):
    p = _norm(path)
    if p in store.dirs:
        return FileStat(
            name=p.rsplit("/", 1)[-1] or "/",
            size=None,
            modified=store.modified.get(p),
            type=FileType.DIRECTORY,
        )
    if p in store.files:
        data = store.files[p]
        return FileStat(
            name=p.rsplit("/", 1)[-1],
            size=len(data),
            modified=store.modified.get(p),
            type=guess_type(p),
        )
    raise FileNotFoundError(p)


def du(backend, path):
    store = backend.accessor.store
    return _du_impl(lambda p: _sync_readdir(store, p),
                    lambda p: _sync_stat(store, p), path)


def du_all(backend, path):
    store = backend.accessor.store
    return _du_all_impl(lambda p: _sync_readdir(store, p),
                        lambda p: _sync_stat(store, p), path)


class TestDuSingleFile:

    def test_single_file_returns_size(self, backend):
        _write(backend, "/tmp/f.txt", b"hello")
        result = du(backend, "/tmp/f.txt")
        assert result == 5


class TestDuDirectory:

    def test_directory_recursive_sum(self, backend):
        _write(backend, "/tmp/a.txt", b"aaa")
        _mkdir(backend, "/tmp/sub")
        _write(backend, "/tmp/sub/b.txt", b"bb")
        result = du(backend, "/tmp")
        assert result == 5


class TestDuMissingPath:

    def test_missing_path_returns_zero(self, backend):
        result = du(backend, "/nonexistent")
        assert result == 0


class TestDuAllSingleFile:

    def test_single_file(self, backend):
        _write(backend, "/tmp/f.txt", b"hello")
        result = du_all(backend, "/tmp/f.txt")
        assert result == [("/tmp/f.txt", 5)]


class TestDuAllDirectory:

    def test_directory_has_entries(self, backend):
        _write(backend, "/tmp/a.txt", b"aaa")
        _mkdir(backend, "/tmp/sub")
        _write(backend, "/tmp/sub/b.txt", b"bb")
        result = du_all(backend, "/tmp")
        paths = [p for p, _ in result]
        assert "/tmp/a.txt" in paths
        assert "/tmp/sub/b.txt" in paths
        assert "/tmp/sub" in paths
        assert "/tmp" in paths
        root_size = dict(result)["/tmp"]
        assert root_size == 5
