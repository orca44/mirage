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


def test_gunzip_t(env):
    env.create_file("f.txt", b"hello\n")
    env.mirage("gzip /data/f.txt")
    result = env.mirage("gunzip -t /data/f.txt.gz")
    assert result.strip() == "" or "ok" in result.lower()


def test_gunzip_k(env):
    env.create_file("f.txt", b"hello\n")
    env.mirage("gzip /data/f.txt")
    env.mirage("gunzip -k /data/f.txt.gz")
    result = env.mirage("cat /data/f.txt")
    assert "hello" in result


def test_gunzip_c(env):
    env.create_file("f.txt", b"hello\n")
    env.mirage("gzip /data/f.txt")
    result = env.mirage("gunzip -c /data/f.txt.gz")
    assert "hello" in result


def test_gunzip_f(env):
    env.create_file("f.txt", b"hello\n")
    env.mirage("gzip /data/f.txt")
    env.mirage("gunzip -f /data/f.txt.gz")
    result = env.mirage("cat /data/f.txt")
    assert "hello" in result
