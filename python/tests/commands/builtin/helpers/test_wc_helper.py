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

from mirage.commands.builtin.wc_helper import wc as _wc_impl


def _norm(path):
    return "/" + path.strip("/")


def _write(backend, path, data):
    backend.accessor.store.files[_norm(path)] = data


def _read(backend, path):
    return backend.accessor.store.files[_norm(path)]


def wc(backend, path, **kwargs):
    return _wc_impl(lambda p: _read(backend, p), path, **kwargs)


class TestWcDefault:

    def test_returns_dict(self, backend):
        _write(backend, "/tmp/f.txt", b"hello world\nfoo bar\n")
        result = wc(backend, "/tmp/f.txt")
        assert result == {"lines": 2, "words": 4, "bytes": 20}

    def test_empty_file(self, backend):
        _write(backend, "/tmp/f.txt", b"")
        result = wc(backend, "/tmp/f.txt")
        assert result == {"lines": 0, "words": 0, "bytes": 0}


class TestWcLinesOnly:

    def test_with_trailing_newline(self, backend):
        _write(backend, "/tmp/f.txt", b"a\nb\nc\n")
        result = wc(backend, "/tmp/f.txt", lines_only=True)
        assert result == 3

    def test_without_trailing_newline(self, backend):
        _write(backend, "/tmp/f.txt", b"a\nb\nc")
        result = wc(backend, "/tmp/f.txt", lines_only=True)
        assert result == 2


class TestWcWordsOnly:

    def test_single_line(self, backend):
        _write(backend, "/tmp/f.txt", b"one two three")
        result = wc(backend, "/tmp/f.txt", words_only=True)
        assert result == 3

    def test_multiline(self, backend):
        _write(backend, "/tmp/f.txt", b"one two\nthree four five\nsix\n")
        result = wc(backend, "/tmp/f.txt", words_only=True)
        assert result == 6


class TestWcBytesOnly:

    def test_ascii(self, backend):
        _write(backend, "/tmp/f.txt", b"hello")
        result = wc(backend, "/tmp/f.txt", bytes_only=True)
        assert result == 5

    def test_multibyte(self, backend):
        data = "caf\u00e9".encode()
        _write(backend, "/tmp/f.txt", data)
        result = wc(backend, "/tmp/f.txt", bytes_only=True)
        assert result == 5


class TestWcCharsOnly:

    def test_ascii(self, backend):
        _write(backend, "/tmp/f.txt", b"hello")
        result = wc(backend, "/tmp/f.txt", chars_only=True)
        assert result == 5

    def test_multibyte_utf8(self, backend):
        data = "caf\u00e9".encode()
        _write(backend, "/tmp/f.txt", data)
        result = wc(backend, "/tmp/f.txt", chars_only=True)
        assert result == 4

    def test_chars_vs_bytes_differ(self, backend):
        data = "\u00e9\u00e9\u00e9".encode()
        _write(backend, "/tmp/f.txt", data)
        chars = wc(backend, "/tmp/f.txt", chars_only=True)
        byte_count = wc(backend, "/tmp/f.txt", bytes_only=True)
        assert chars == 3
        assert byte_count == 6
        assert chars != byte_count
