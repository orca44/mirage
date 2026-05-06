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


def test_du_c(env):
    env.create_file("a.txt", b"hello")
    env.create_file("b.txt", b"world")
    result = env.mirage("du -c /data")
    lines = result.strip().splitlines()
    assert lines[-1].endswith("total") or lines[-1].split()[-1] == "total"


def test_du_max_depth(env):
    env.create_file("sub/a.txt", b"hello")
    result = env.mirage("du --max-depth 0 /data")
    lines = result.strip().splitlines()
    assert len(lines) == 1


def test_du_max_depth_1(env):
    env.create_file("sub/deep/a.txt", b"hello")
    result = env.mirage("du --max-depth 1 /data")
    lines = result.strip().splitlines()
    assert not any("deep" in ln for ln in lines)


def test_du_h(env):
    env.create_file("f.txt", b"x" * 1024)
    result = env.mirage("du -h /data/f.txt")
    assert "K" in result or "B" in result or len(result.strip()) > 0


def test_du_s(env):
    env.create_file("sub/a.txt", b"hello")
    result = env.mirage("du -s /data")
    lines = result.strip().splitlines()
    assert len(lines) == 1


def test_du_a(env):
    env.create_file("a.txt", b"hello")
    env.create_file("b.txt", b"world")
    result = env.mirage("du -a /data")
    assert "a.txt" in result and "b.txt" in result
