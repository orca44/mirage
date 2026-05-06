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

import asyncio

from mirage.ops.file import MirageFile

from .conftest import make_ops_with_dir


def _write(ops, path, data):
    asyncio.run(ops.write(path, data))


def _read(ops, path):
    return asyncio.run(ops.read(path))


class TestMirageFile:

    def test_read_text(self):
        ops, _ = make_ops_with_dir()
        _write(ops, "/data/dir/f.txt", b"hello")
        f = MirageFile(ops, "/data/dir/f.txt", "r")
        assert f.read() == "hello"
        f.close()

    def test_read_binary(self):
        ops, _ = make_ops_with_dir()
        _write(ops, "/data/dir/f.bin", b"\x00\x01\x02")
        f = MirageFile(ops, "/data/dir/f.bin", "rb")
        assert f.read() == b"\x00\x01\x02"
        f.close()

    def test_write_text(self):
        ops, _ = make_ops_with_dir()
        f = MirageFile(ops, "/data/dir/out.txt", "w")
        f.write("written")
        f.close()
        assert _read(ops, "/data/dir/out.txt") == b"written"

    def test_write_binary(self):
        ops, _ = make_ops_with_dir()
        f = MirageFile(ops, "/data/dir/out.bin", "wb")
        f.write(b"\xff\xfe")
        f.close()
        assert _read(ops, "/data/dir/out.bin") == b"\xff\xfe"

    def test_context_manager(self):
        ops, _ = make_ops_with_dir()
        with MirageFile(ops, "/data/dir/ctx.txt", "w") as f:
            f.write("ctx")
        assert _read(ops, "/data/dir/ctx.txt") == b"ctx"

    def test_append(self):
        ops, _ = make_ops_with_dir()
        _write(ops, "/data/dir/app.txt", b"hello")
        with MirageFile(ops, "/data/dir/app.txt", "a") as f:
            f.write(" world")
        assert _read(ops, "/data/dir/app.txt") == b"hello world"

    def test_readline(self):
        ops, _ = make_ops_with_dir()
        _write(ops, "/data/dir/lines.txt", b"line1\nline2\nline3")
        f = MirageFile(ops, "/data/dir/lines.txt", "r")
        assert f.readline() == "line1\n"
        assert f.readline() == "line2\n"
        f.close()

    def test_iter(self):
        ops, _ = make_ops_with_dir()
        _write(ops, "/data/dir/iter.txt", b"a\nb\nc")
        f = MirageFile(ops, "/data/dir/iter.txt", "r")
        lines = list(f)
        assert lines == ["a\n", "b\n", "c"]
        f.close()

    def test_seek_tell(self):
        ops, _ = make_ops_with_dir()
        _write(ops, "/data/dir/seek.txt", b"abcdef")
        f = MirageFile(ops, "/data/dir/seek.txt", "rb")
        f.seek(3)
        assert f.tell() == 3
        assert f.read() == b"def"
        f.close()

    def test_properties(self):
        ops, _ = make_ops_with_dir()
        _write(ops, "/data/dir/p.txt", b"data")
        f = MirageFile(ops, "/data/dir/p.txt", "r")
        assert f.name == "/data/dir/p.txt"
        assert f.mode == "r"
        assert f.readable() is True
        assert f.writable() is False
        assert f.closed is False
        f.close()
        assert f.closed is True
