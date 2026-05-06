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

from mirage.commands.builtin.tr_helper import tr as _tr_impl


def _norm(path):
    return "/" + path.strip("/")


def _write(backend, path, data):
    backend.accessor.store.files[_norm(path)] = data


def _read(backend, path):
    return backend.accessor.store.files[_norm(path)]


def tr(backend, path, src, dst):
    return _tr_impl(lambda p: _read(backend, p), path, src, dst)


class TestTrBasicTranslate:

    def test_vowels_to_uppercase(self, backend):
        _write(backend, "/tmp/f.txt", b"hello world\n")
        result = tr(backend, "/tmp/f.txt", "aeiou", "AEIOU")
        assert result == "hEllO wOrld\n"

    def test_multiple_occurrences(self, backend):
        _write(backend, "/tmp/f.txt", b"aaa bbb\n")
        result = tr(backend, "/tmp/f.txt", "ab", "AB")
        assert result == "AAA BBB\n"


class TestTrSingleChar:

    def test_single_char_translate(self, backend):
        _write(backend, "/tmp/f.txt", b"cat\n")
        result = tr(backend, "/tmp/f.txt", "c", "b")
        assert result == "bat\n"


class TestTrNoMatch:

    def test_unchanged_when_no_match(self, backend):
        _write(backend, "/tmp/f.txt", b"hello\n")
        result = tr(backend, "/tmp/f.txt", "xyz", "XYZ")
        assert result == "hello\n"
