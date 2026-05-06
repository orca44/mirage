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

from mirage.commands.builtin.sort_helper import sort_lines as _sort_impl


def _norm(path):
    return "/" + path.strip("/")


def _write(backend, path, data):
    backend.accessor.store.files[_norm(path)] = data


def _read(backend, path):
    return backend.accessor.store.files[_norm(path)]


def sort_lines(backend, path, **kwargs):
    return _sort_impl(lambda p: _read(backend, p), path, **kwargs)


class TestSortDefault:

    def test_alphabetical(self, backend):
        _write(backend, "/tmp/f.txt", b"banana\napple\ncherry")
        result = sort_lines(backend, "/tmp/f.txt")
        assert result == ["apple", "banana", "cherry"]

    def test_already_sorted(self, backend):
        _write(backend, "/tmp/f.txt", b"a\nb\nc")
        result = sort_lines(backend, "/tmp/f.txt")
        assert result == ["a", "b", "c"]


class TestSortReverse:

    def test_reverse(self, backend):
        _write(backend, "/tmp/f.txt", b"banana\napple\ncherry")
        result = sort_lines(backend, "/tmp/f.txt", reverse=True)
        assert result == ["cherry", "banana", "apple"]


class TestSortNumeric:

    def test_numeric(self, backend):
        _write(backend, "/tmp/f.txt", b"10\n2\n30\n1")
        result = sort_lines(backend, "/tmp/f.txt", numeric=True)
        assert result == ["1", "2", "10", "30"]

    def test_non_numeric_lines(self, backend):
        _write(backend, "/tmp/f.txt", b"10\nabc\n2\nxyz")
        result = sort_lines(backend, "/tmp/f.txt", numeric=True)
        assert result[0] in ("abc", "xyz")
        assert "10" in result


class TestSortUnique:

    def test_unique(self, backend):
        _write(backend, "/tmp/f.txt", b"banana\napple\nbanana\napple\ncherry")
        result = sort_lines(backend, "/tmp/f.txt", unique=True)
        assert result == ["apple", "banana", "cherry"]


class TestSortIgnoreCase:

    def test_ignore_case(self, backend):
        _write(backend, "/tmp/f.txt", b"Banana\napple\nCherry")
        result = sort_lines(backend, "/tmp/f.txt", ignore_case=True)
        assert result == ["apple", "Banana", "Cherry"]


class TestSortKeyField:

    def test_key_field_numeric(self, backend):
        _write(backend, "/tmp/f.txt", b"a 10\nb 2\nc 30")
        result = sort_lines(backend, "/tmp/f.txt", key_field=2, numeric=True)
        assert result == ["b 2", "a 10", "c 30"]


class TestSortFieldSep:

    def test_field_sep_with_key(self, backend):
        _write(backend, "/tmp/f.txt", b"a:10\nb:2\nc:30")
        result = sort_lines(backend,
                            "/tmp/f.txt",
                            field_sep=":",
                            key_field=2,
                            numeric=True)
        assert result == ["b:2", "a:10", "c:30"]


class TestSortMixed:

    def test_numeric_reverse(self, backend):
        _write(backend, "/tmp/f.txt", b"10\n2\n30\n1")
        result = sort_lines(backend, "/tmp/f.txt", numeric=True, reverse=True)
        assert result == ["30", "10", "2", "1"]

    def test_unique_ignore_case(self, backend):
        _write(backend, "/tmp/f.txt", b"Apple\napple\nBanana\nbanana")
        result = sort_lines(backend,
                            "/tmp/f.txt",
                            unique=True,
                            ignore_case=True)
        assert len(result) == 2
        assert result[0].lower() == "apple"
        assert result[1].lower() == "banana"
