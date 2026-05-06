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

from mirage.commands.builtin.cat_helper import cat as _cat_impl


def _norm(path):
    return "/" + path.strip("/")


def _write(backend, path, data):
    store = backend.accessor.store
    store.files[_norm(path)] = data


def _read(backend, path):
    return backend.accessor.store.files[_norm(path)]


def cat(backend, path):
    return _cat_impl(lambda p: _read(backend, p), path)


class TestCatBasic:

    def test_returns_bytes(self, backend):
        _write(backend, "/tmp/f.txt", b"hello world")
        result = cat(backend, "/tmp/f.txt")
        assert result == b"hello world"
        assert isinstance(result, bytes)

    def test_empty_file(self, backend):
        _write(backend, "/tmp/f.txt", b"")
        result = cat(backend, "/tmp/f.txt")
        assert result == b""


class TestCatBinaryData:

    def test_full_byte_range(self, backend):
        data = bytes(range(256))
        _write(backend, "/tmp/f.bin", data)
        result = cat(backend, "/tmp/f.bin")
        assert result == data
        assert len(result) == 256


class TestCatMultiline:

    def test_multiline_content(self, backend):
        data = b"line1\nline2\nline3\n"
        _write(backend, "/tmp/f.txt", data)
        result = cat(backend, "/tmp/f.txt")
        assert result == data
