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


def test_mv_v(env):
    env.create_file("mv_src.txt", b"hello")
    result = env.mirage("mv -v /data/mv_src.txt /data/mv_dst.txt")
    assert "->" in result


def test_mv_n(env):
    env.create_file("a.txt", b"aaa")
    env.create_file("b.txt", b"bbb")
    env.mirage("mv -n /data/a.txt /data/b.txt")
    result = env.mirage("cat /data/b.txt")
    assert "bbb" in result


def test_mv_f(env):
    env.create_file("a.txt", b"aaa")
    env.create_file("b.txt", b"bbb")
    env.mirage("mv -f /data/a.txt /data/b.txt")
    result = env.mirage("cat /data/b.txt")
    assert "aaa" in result
