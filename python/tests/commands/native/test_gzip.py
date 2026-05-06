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


def test_gzip_c(env):
    data = b"hello world\n"
    result = env.mirage("gzip -c", stdin=data)
    assert len(result) > 0


def test_gzip_level(env):
    data = b"hello world " * 100
    r1 = env.mirage("gzip -1 -c", stdin=data)
    r9 = env.mirage("gzip -9 -c", stdin=data)
    assert len(r9) <= len(r1)


def test_gzip_d(env):
    env.create_file("f.txt", b"hello\n")
    env.mirage("gzip /data/f.txt")
    env.mirage("gzip -d /data/f.txt.gz")
    result = env.mirage("cat /data/f.txt")
    assert "hello" in result


def test_gzip_k(env):
    env.create_file("f.txt", b"hello\n")
    env.mirage("gzip -k /data/f.txt")
    original = env.mirage("cat /data/f.txt")
    assert "hello" in original


def test_gzip_f(env):
    env.create_file("f.txt", b"hello\n")
    env.mirage("gzip -f /data/f.txt")
    result = env.mirage("gunzip -c /data/f.txt.gz")
    assert "hello" in result
