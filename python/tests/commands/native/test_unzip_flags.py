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


def test_unzip_q(env):
    env.create_file("a.txt", b"hello")
    env.mirage("zip /data/out.zip /data/a.txt")
    result = env.mirage("unzip -q -d /data/ext /data/out.zip")
    assert result.strip() == "" or "inflating" not in result


def test_unzip_t(env):
    env.create_file("a.txt", b"hello")
    env.mirage("zip /data/out.zip /data/a.txt")
    result = env.mirage("unzip -t /data/out.zip")
    assert "OK" in result or "ok" in result.lower() or "No errors" in result


def test_unzip_l(env):
    env.create_file("a.txt", b"hello")
    env.mirage("zip /data/out.zip /data/a.txt")
    result = env.mirage("unzip -l /data/out.zip")
    assert "a.txt" in result


def test_unzip_p(env):
    env.create_file("a.txt", b"hello")
    env.mirage("zip /data/out.zip /data/a.txt")
    result = env.mirage("unzip -p /data/out.zip")
    assert "hello" in result


def test_unzip_o(env):
    env.create_file("a.txt", b"hello")
    env.mirage("zip /data/out.zip /data/a.txt")
    env.mirage("unzip -o /data/out.zip")
    result = env.mirage("ls /data")
    assert "a.txt" in result
