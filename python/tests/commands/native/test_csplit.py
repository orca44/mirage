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


def test_csplit_s(env):
    env.create_file("f.txt", b"aaa\n---\nbbb\n")
    result = env.mirage("csplit -s /data/f.txt /---/")
    assert result.strip() == ""


def test_csplit_b(env):
    env.create_file("f.txt", b"aaa\n---\nbbb\n")
    result = env.mirage("csplit -b %03d /data/f.txt /---/")
    lines = result.strip().splitlines()
    assert len(lines) == 2


def test_csplit_k(env):
    env.create_file("f.txt", b"aaa\nbbb\nccc\n")
    env.mirage("csplit -k /data/f.txt /bbb/")
    result = env.mirage("cat /data/xx00")
    assert "aaa" in result


def test_csplit_f(env):
    env.create_file("f.txt", b"aaa\nbbb\nccc\n")
    env.mirage("csplit -f part /data/f.txt /bbb/")
    result = env.mirage("cat /data/part00")
    assert "aaa" in result


def test_csplit_n(env):
    env.create_file("f.txt", b"aaa\nbbb\nccc\n")
    env.mirage("csplit -n 3 /data/f.txt /bbb/")
    result = env.mirage("ls /data")
    assert "xx000" in result
