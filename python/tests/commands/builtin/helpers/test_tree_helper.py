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

from mirage.commands.builtin.tree_helper import tree as _tree_impl
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


def tree(backend, path, **kwargs):
    store = backend.accessor.store
    return _tree_impl(lambda p: _sync_readdir(store, p),
                      lambda p: _sync_stat(store, p), path, **kwargs)


class TestBasic:

    def test_has_connectors(self, backend):
        _write(backend, "/tmp/a.txt", b"hello")
        _write(backend, "/tmp/b.txt", b"world")
        result = tree(backend, "/tmp")
        joined = "\n".join(result)
        assert "\u251c\u2500\u2500" in joined or "\u2514\u2500\u2500" in joined

    def test_single_file_uses_last_connector(self, backend):
        _write(backend, "/tmp/a.txt", b"hello")
        result = tree(backend, "/tmp")
        assert len(result) == 1
        assert "\u2514\u2500\u2500" in result[0]


class TestMaxDepth:

    def test_max_depth_limits_recursion(self, backend):
        _mkdir(backend, "/tmp/sub")
        _write(backend, "/tmp/sub/deep.txt", b"deep")
        result_no_limit = tree(backend, "/tmp")
        assert any("deep.txt" in line for line in result_no_limit)
        result_limited = tree(backend, "/tmp", max_depth=0)
        assert not any("deep.txt" in line for line in result_limited)


class TestShowHidden:

    def test_default_hides_dotfiles(self, backend):
        _write(backend, "/tmp/.hidden", b"secret")
        _write(backend, "/tmp/visible.txt", b"visible")
        result = tree(backend, "/tmp")
        assert not any(".hidden" in line for line in result)
        assert any("visible.txt" in line for line in result)

    def test_show_hidden_includes_dotfiles(self, backend):
        _write(backend, "/tmp/.hidden", b"secret")
        result = tree(backend, "/tmp", show_hidden=True)
        assert any(".hidden" in line for line in result)


class TestIgnorePattern:

    def test_ignore_pattern_excludes_matching(self, backend):
        _write(backend, "/tmp/a.txt", b"hello")
        _write(backend, "/tmp/b.log", b"log")
        result = tree(backend, "/tmp", ignore_pattern="*.log")
        assert any("a.txt" in line for line in result)
        assert not any("b.log" in line for line in result)


class TestRecursiveDepth:

    def test_nested_directories(self, backend):
        _mkdir(backend, "/tmp/d1")
        _mkdir(backend, "/tmp/d1/d2")
        _write(backend, "/tmp/d1/d2/f.txt", b"nested")
        result = tree(backend, "/tmp")
        assert any("d1" in line for line in result)
        assert any("d2" in line for line in result)
        assert any("f.txt" in line for line in result)


class TestWarnings:

    def test_warnings_collected(self, backend):
        warnings = []
        result = tree(backend, "/nonexistent", warnings=warnings)
        assert result == []
        assert len(warnings) > 0
