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

from mirage.commands.builtin.ls_helper import ls as _ls_impl
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


def ls(backend, path, **kwargs):
    store = backend.accessor.store
    return _ls_impl(lambda p: _sync_readdir(store, p),
                    lambda p: _sync_stat(store, p), path, **kwargs)


class TestBasic:

    def test_list_files_returns_filestat(self, backend):
        _write(backend, "/tmp/a.txt", b"hello")
        result = ls(backend, "/tmp")
        assert len(result) == 1
        assert isinstance(result[0], FileStat)
        assert result[0].name == "a.txt"

    def test_empty_dir(self, backend):
        result = ls(backend, "/tmp")
        assert result == []

    def test_multiple_files(self, backend):
        _write(backend, "/tmp/b.txt", b"bb")
        _write(backend, "/tmp/a.txt", b"aaa")
        _write(backend, "/tmp/c.txt", b"c")
        result = ls(backend, "/tmp")
        assert len(result) == 3


class TestLong:

    def test_long_returns_size(self, backend):
        _write(backend, "/tmp/file.txt", b"hello")
        result = ls(backend, "/tmp", long=True)
        assert len(result) == 1
        assert result[0].size == 5

    def test_long_dir_has_no_size(self, backend):
        _mkdir(backend, "/tmp/sub")
        result = ls(backend, "/tmp", long=True)
        assert len(result) == 1
        assert result[0].size is None


class TestAllFiles:

    def test_hides_dotfiles_by_default(self, backend):
        _write(backend, "/tmp/.hidden", b"secret")
        _write(backend, "/tmp/visible.txt", b"hi")
        result = ls(backend, "/tmp")
        assert len(result) == 1
        assert result[0].name == "visible.txt"

    def test_shows_dotfiles_when_all(self, backend):
        _write(backend, "/tmp/.hidden", b"secret")
        _write(backend, "/tmp/visible.txt", b"hi")
        result = ls(backend, "/tmp", all_files=True)
        names = [e.name for e in result]
        assert ".hidden" in names
        assert "visible.txt" in names
        assert len(result) == 2


class TestSortByName:

    def test_default_sort_alphabetical(self, backend):
        _write(backend, "/tmp/cherry.txt", b"c")
        _write(backend, "/tmp/apple.txt", b"a")
        _write(backend, "/tmp/banana.txt", b"b")
        result = ls(backend, "/tmp")
        names = [e.name for e in result]
        assert names == ["apple.txt", "banana.txt", "cherry.txt"]


class TestReverse:

    def test_reverse_name_sort(self, backend):
        _write(backend, "/tmp/a.txt", b"a")
        _write(backend, "/tmp/b.txt", b"b")
        _write(backend, "/tmp/c.txt", b"c")
        result = ls(backend, "/tmp", reverse=True)
        names = [e.name for e in result]
        assert names == ["c.txt", "b.txt", "a.txt"]


class TestSortBySize:

    def test_sort_by_size_default(self, backend):
        """Default gives descending."""
        _write(backend, "/tmp/big.txt", b"x" * 100)
        _write(backend, "/tmp/small.txt", b"x")
        _write(backend, "/tmp/medium.txt", b"x" * 50)
        result = ls(backend, "/tmp", sort_by="size")
        names = [e.name for e in result]
        assert names == ["big.txt", "medium.txt", "small.txt"]

    def test_sort_by_size_reverse(self, backend):
        """Reverse gives ascending."""
        _write(backend, "/tmp/big.txt", b"x" * 100)
        _write(backend, "/tmp/small.txt", b"x")
        _write(backend, "/tmp/medium.txt", b"x" * 50)
        result = ls(backend, "/tmp", sort_by="size", reverse=True)
        names = [e.name for e in result]
        assert names == ["small.txt", "medium.txt", "big.txt"]


class TestRecursive:

    def test_recursive_shows_subdirectory_contents(self, backend):
        _write(backend, "/tmp/top.txt", b"top")
        _mkdir(backend, "/tmp/sub")
        _write(backend, "/tmp/sub/deep.txt", b"deep")
        result = ls(backend, "/tmp", recursive=True)
        names = [e.name for e in result]
        assert "sub" in names
        assert "deep.txt" in names
        assert "top.txt" in names

    def test_recursive_order(self, backend):
        _write(backend, "/tmp/a.txt", b"a")
        _mkdir(backend, "/tmp/b_dir")
        _write(backend, "/tmp/b_dir/inner.txt", b"inner")
        _write(backend, "/tmp/c.txt", b"c")
        result = ls(backend, "/tmp", recursive=True)
        names = [e.name for e in result]
        assert names.index("b_dir") < names.index("inner.txt")
        assert names.index("a.txt") < names.index("b_dir")
        assert names.index("inner.txt") < names.index("c.txt")


class TestListDir:

    def test_list_dir_returns_single_entry(self, backend):
        _write(backend, "/tmp/file.txt", b"data")
        result = ls(backend, "/tmp", list_dir=True)
        assert len(result) == 1
        assert result[0].name == "tmp"
        assert result[0].type == FileType.DIRECTORY


class TestMixed:

    def test_all_files_with_reverse(self, backend):
        _write(backend, "/tmp/.z_hidden", b"z")
        _write(backend, "/tmp/a.txt", b"a")
        _write(backend, "/tmp/m.txt", b"m")
        result = ls(backend, "/tmp", all_files=True, reverse=True)
        names = [e.name for e in result]
        assert names == ["m.txt", "a.txt", ".z_hidden"]

    def test_recursive_with_all_files(self, backend):
        _mkdir(backend, "/tmp/sub")
        _write(backend, "/tmp/.hidden", b"h")
        _write(backend, "/tmp/sub/.nested_hidden", b"nh")
        _write(backend, "/tmp/sub/visible.txt", b"v")
        result = ls(backend, "/tmp", recursive=True, all_files=True)
        names = [e.name for e in result]
        assert ".hidden" in names
        assert ".nested_hidden" in names
        assert "visible.txt" in names

    def test_sort_by_size_with_long_and_reverse(self, backend):
        """Reverse gives ascending."""
        _write(backend, "/tmp/big.txt", b"x" * 100)
        _write(backend, "/tmp/small.txt", b"x")
        result = ls(backend, "/tmp", long=True, sort_by="size", reverse=True)
        assert result[0].name == "small.txt"
        assert result[0].size == 1
        assert result[1].name == "big.txt"
        assert result[1].size == 100


class TestWarnings:

    def test_warnings_empty_case(self, backend):
        _write(backend, "/tmp/ok.txt", b"fine")
        warnings: list[str] = []
        result = ls(backend, "/tmp", warnings=warnings)
        assert len(result) == 1
        assert warnings == []
