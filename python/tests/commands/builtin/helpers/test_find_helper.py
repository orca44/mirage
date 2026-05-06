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

from mirage.commands.builtin.find_helper import find as _find_impl
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


def find(backend, path, **kwargs):
    store = backend.accessor.store
    return _find_impl(lambda p: _sync_readdir(store, p),
                      lambda p: _sync_stat(store, p), path, **kwargs)


class TestDefault:

    def test_all_files_recursively(self, backend):
        _write(backend, "/tmp/a.txt", b"hello")
        _write(backend, "/tmp/b.txt", b"world")
        result = find(backend, "/tmp")
        assert sorted(result) == ["/tmp/a.txt", "/tmp/b.txt"]

    def test_includes_subdirectories(self, backend):
        _mkdir(backend, "/tmp/sub")
        _write(backend, "/tmp/sub/c.txt", b"nested")
        result = find(backend, "/tmp")
        assert "/tmp/sub" in result
        assert "/tmp/sub/c.txt" in result

    def test_empty_dir(self, backend):
        result = find(backend, "/tmp")
        assert result == []


class TestName:

    def test_glob_pattern(self, backend):
        _write(backend, "/tmp/a.txt", b"aaa")
        _write(backend, "/tmp/b.py", b"bbb")
        _write(backend, "/tmp/c.txt", b"ccc")
        result = find(backend, "/tmp", name="*.txt")
        assert sorted(result) == ["/tmp/a.txt", "/tmp/c.txt"]

    def test_exact_name(self, backend):
        _write(backend, "/tmp/a.txt", b"aaa")
        _write(backend, "/tmp/b.txt", b"bbb")
        result = find(backend, "/tmp", name="a.txt")
        assert result == ["/tmp/a.txt"]


class TestTypeDirectory:

    def test_type_directory(self, backend):
        _mkdir(backend, "/tmp/sub")
        _write(backend, "/tmp/file.txt", b"data")
        result = find(backend, "/tmp", type=FileType.DIRECTORY)
        assert result == ["/tmp/sub"]

    def test_type_directory_nested(self, backend):
        _mkdir(backend, "/tmp/a")
        _mkdir(backend, "/tmp/a/b")
        _write(backend, "/tmp/a/b/f.txt", b"x")
        result = find(backend, "/tmp", type=FileType.DIRECTORY)
        assert sorted(result) == ["/tmp/a", "/tmp/a/b"]


class TestTypeFile:

    def test_type_file(self, backend):
        _mkdir(backend, "/tmp/sub")
        _write(backend, "/tmp/file.txt", b"data")
        _write(backend, "/tmp/sub/nested.py", b"code")
        result = find(backend, "/tmp", type="file")
        assert sorted(result) == ["/tmp/file.txt", "/tmp/sub/nested.py"]


class TestSize:

    def test_min_size(self, backend):
        _write(backend, "/tmp/small.txt", b"hi")
        _write(backend, "/tmp/big.txt", b"a" * 100)
        result = find(backend, "/tmp", min_size=50)
        assert result == ["/tmp/big.txt"]

    def test_max_size(self, backend):
        _write(backend, "/tmp/small.txt", b"hi")
        _write(backend, "/tmp/big.txt", b"a" * 100)
        result = find(backend, "/tmp", max_size=50)
        assert result == ["/tmp/small.txt"]

    def test_size_range(self, backend):
        _write(backend, "/tmp/tiny.txt", b"x")
        _write(backend, "/tmp/mid.txt", b"a" * 50)
        _write(backend, "/tmp/huge.txt", b"a" * 200)
        result = find(backend, "/tmp", min_size=10, max_size=100)
        assert result == ["/tmp/mid.txt"]


class TestMaxdepth:

    def test_depth_zero(self, backend):
        _write(backend, "/tmp/a.txt", b"aaa")
        result = find(backend, "/tmp", maxdepth=0)
        assert result == ["/tmp/a.txt"]

    def test_depth_limits_recursion(self, backend):
        _mkdir(backend, "/tmp/d1")
        _mkdir(backend, "/tmp/d1/d2")
        _write(backend, "/tmp/a.txt", b"a")
        _write(backend, "/tmp/d1/b.txt", b"b")
        _write(backend, "/tmp/d1/d2/c.txt", b"c")
        result = find(backend, "/tmp", maxdepth=1)
        assert "/tmp/a.txt" in result
        assert "/tmp/d1" in result
        assert "/tmp/d1/b.txt" in result
        assert "/tmp/d1/d2/c.txt" not in result


class TestNameExclude:

    def test_exclude_pattern(self, backend):
        _write(backend, "/tmp/a.txt", b"aaa")
        _write(backend, "/tmp/b.pyc", b"bbb")
        _write(backend, "/tmp/c.txt", b"ccc")
        result = find(backend, "/tmp", name_exclude="*.pyc")
        assert sorted(result) == ["/tmp/a.txt", "/tmp/c.txt"]

    def test_exclude_with_name(self, backend):
        _write(backend, "/tmp/a.txt", b"aaa")
        _write(backend, "/tmp/b.txt", b"bbb")
        _write(backend, "/tmp/c.py", b"ccc")
        result = find(backend, "/tmp", name="*.txt", name_exclude="b*")
        assert result == ["/tmp/a.txt"]


class TestOrNames:

    def test_or_names(self, backend):
        _write(backend, "/tmp/a.txt", b"aaa")
        _write(backend, "/tmp/b.py", b"bbb")
        _write(backend, "/tmp/c.md", b"ccc")
        result = find(backend, "/tmp", or_names=["*.txt", "*.py"])
        assert sorted(result) == ["/tmp/a.txt", "/tmp/b.py"]


class TestMixed:

    def test_name_and_min_size(self, backend):
        _write(backend, "/tmp/small.txt", b"hi")
        _write(backend, "/tmp/big.txt", b"a" * 100)
        _write(backend, "/tmp/big.py", b"a" * 100)
        result = find(backend, "/tmp", name="*.txt", min_size=50)
        assert result == ["/tmp/big.txt"]


class TestWarnings:

    def test_warnings_on_missing_path(self, backend):
        warnings = []
        result = find(backend, "/nonexistent", warnings=warnings)
        assert result == []
        assert len(warnings) == 1
        assert "/nonexistent" in warnings[0]
