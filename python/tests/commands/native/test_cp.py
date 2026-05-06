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


def test_cp_basic(env):
    env.create_file("src.txt", b"hello")
    env.mirage("cp /data/src.txt /data/dst.txt")
    assert env.mirage("cat /data/dst.txt") == "hello"


def test_cp_a(env):
    env.create_file("src/a.txt", b"aaa")
    env.mirage("cp -a /data/src/ /data/dst/")
    assert env.mirage("cat /data/dst/a.txt") == "aaa"


def test_cp_n(env):
    env.create_file("src.txt", b"new")
    env.create_file("dst.txt", b"old")
    env.mirage("cp -n /data/src.txt /data/dst.txt")
    assert env.mirage("cat /data/dst.txt") == "old"


def test_cp_v(env):
    env.create_file("src.txt", b"hello")
    result = env.mirage("cp -v /data/src.txt /data/dst.txt")
    assert "src.txt" in result and "->" in result and "dst.txt" in result


def test_cp_f(env):
    env.create_file("src.txt", b"hello")
    env.create_file("dst.txt", b"old")
    env.mirage("cp -f /data/src.txt /data/dst.txt")
    assert env.mirage("cat /data/dst.txt") == "hello"


def test_cp_r(env):
    env.create_file("src/a.txt", b"hello")
    env.mirage("cp -r /data/src /data/dst")
    result = env.mirage("cat /data/dst/a.txt")
    assert "hello" in result


def test_cp_R(env):
    env.create_file("src/a.txt", b"hello")
    env.mirage("cp -R /data/src /data/dst2")
    result = env.mirage("cat /data/dst2/a.txt")
    assert "hello" in result
