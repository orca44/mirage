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

from mirage.commands.builtin.cut_helper import cut as _cut_impl


def _norm(path):
    return "/" + path.strip("/")


def _write(backend, path, data):
    backend.accessor.store.files[_norm(path)] = data


def _read(backend, path):
    return backend.accessor.store.files[_norm(path)]


def cut(backend, path, **kwargs):
    return _cut_impl(lambda p: _read(backend, p), path, **kwargs)


class TestCutFieldsDefaultDelimiter:

    def test_single_field(self, backend):
        _write(backend, "/tmp/f.txt", b"a\tb\tc\n")
        result = cut(backend, "/tmp/f.txt", fields=[2])
        assert result == ["b"]

    def test_multiple_fields(self, backend):
        _write(backend, "/tmp/f.txt", b"a\tb\tc\n")
        result = cut(backend, "/tmp/f.txt", fields=[1, 3])
        assert result == ["a\tc"]

    def test_multiline(self, backend):
        _write(backend, "/tmp/f.txt", b"x\ty\nw\tz\n")
        result = cut(backend, "/tmp/f.txt", fields=[2])
        assert result == ["y", "z"]


class TestCutCustomDelimiter:

    def test_colon_delimiter(self, backend):
        _write(backend, "/tmp/f.txt", b"root:x:0:0\n")
        result = cut(backend, "/tmp/f.txt", delimiter=":", fields=[1])
        assert result == ["root"]

    def test_comma_delimiter(self, backend):
        _write(backend, "/tmp/f.txt", b"a,b,c\n")
        result = cut(backend, "/tmp/f.txt", delimiter=",", fields=[2, 3])
        assert result == ["b,c"]


class TestCutChars:

    def test_char_range(self, backend):
        _write(backend, "/tmp/f.txt", b"abcdefgh\n")
        result = cut(backend, "/tmp/f.txt", chars=[(2, 5)])
        assert result == ["bcde"]

    def test_single_char(self, backend):
        _write(backend, "/tmp/f.txt", b"abcdefgh\n")
        result = cut(backend, "/tmp/f.txt", chars=[(3, 3)])
        assert result == ["c"]

    def test_multiple_ranges(self, backend):
        _write(backend, "/tmp/f.txt", b"abcdefgh\n")
        result = cut(backend, "/tmp/f.txt", chars=[(1, 2), (5, 6)])
        assert result == ["abef"]


class TestCutFieldOutOfRange:

    def test_field_beyond_columns(self, backend):
        _write(backend, "/tmp/f.txt", b"a\tb\n")
        result = cut(backend, "/tmp/f.txt", fields=[5])
        assert result == [""]


class TestCutNoFieldsOrChars:

    def test_returns_full_lines(self, backend):
        _write(backend, "/tmp/f.txt", b"hello world\nfoo bar\n")
        result = cut(backend, "/tmp/f.txt")
        assert result == ["hello world", "foo bar"]
