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

from mirage.commands.builtin.nl_helper import nl as _nl_impl


def _norm(path):
    return "/" + path.strip("/")


def _write(backend, path, data):
    backend.accessor.store.files[_norm(path)] = data


def _read(backend, path):
    return backend.accessor.store.files[_norm(path)]


def nl(backend, path, **kwargs):
    return _nl_impl(lambda p: _read(backend, p), path, **kwargs)


class TestDefault:

    def test_numbers_non_empty_lines(self, backend):
        _write(backend, "/tmp/f.txt", b"hello\n\nworld\n")
        result = nl(backend, "/tmp/f.txt")
        lines = result.split("\n")
        assert "1" in lines[0]
        assert "hello" in lines[0]
        assert "2" in lines[2]
        assert "world" in lines[2]
        assert lines[1].strip() == ""


class TestBodyNumberingAll:

    def test_numbers_all_lines(self, backend):
        _write(backend, "/tmp/f.txt", b"hello\n\nworld\n")
        result = nl(backend, "/tmp/f.txt", body_numbering="a")
        lines = result.split("\n")
        assert "1" in lines[0]
        assert "2" in lines[1]
        assert "3" in lines[2]


class TestBodyNumberingNone:

    def test_no_line_numbers(self, backend):
        _write(backend, "/tmp/f.txt", b"hello\nworld\n")
        result = nl(backend, "/tmp/f.txt", body_numbering="n")
        lines = result.split("\n")
        for line in lines:
            assert line.lstrip().startswith("hello") or line.lstrip(
            ).startswith("world") or line.strip() == ""


class TestCustomWidthSeparator:

    def test_custom_width_and_separator(self, backend):
        _write(backend, "/tmp/f.txt", b"hello\n")
        result = nl(backend, "/tmp/f.txt", width=3, separator=":")
        assert "  1:hello" in result


class TestCustomStartIncrement:

    def test_custom_start_and_increment(self, backend):
        _write(backend, "/tmp/f.txt", b"a\nb\nc\n")
        result = nl(backend, "/tmp/f.txt", start=10, increment=5)
        lines = result.split("\n")
        assert "10" in lines[0]
        assert "15" in lines[1]
        assert "20" in lines[2]
