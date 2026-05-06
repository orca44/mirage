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

from mirage.ops.open import make_open

from .conftest import make_ops_with_dir


def _write(ops, path, data):
    asyncio.run(ops.write(path, data))


def _read(ops, path):
    return asyncio.run(ops.read(path))


class TestPatchedOpen:

    def test_read_mounted(self):
        ops, _ = make_ops_with_dir()
        _write(ops, "/data/dir/f.txt", b"patched")
        patched = make_open(ops)
        with patched("/data/dir/f.txt", "r") as f:
            assert f.read() == "patched"

    def test_write_mounted(self):
        ops, _ = make_ops_with_dir()
        patched = make_open(ops)
        with patched("/data/dir/new.txt", "w") as f:
            f.write("via open")
        assert _read(ops, "/data/dir/new.txt") == b"via open"

    def test_fallthrough_real_file(self, tmp_path):
        ops, _ = make_ops_with_dir()
        patched = make_open(ops)
        real_file = tmp_path / "real.txt"
        real_file.write_text("real content")
        with patched(str(real_file), "r") as f:
            assert f.read() == "real content"
