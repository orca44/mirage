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


def test_readlink_n(env):
    env.create_file("rl.txt", b"x")
    result = env.mirage("readlink -n -f /data/rl.txt")
    assert not result.endswith("\n")


def test_readlink_m(env):
    result = env.mirage("readlink -m /data/nonexistent/path")
    assert "/data/nonexistent/path" in result or "nonexistent" in result


def test_readlink_e(env):
    env.create_file("f.txt", b"hello")
    result = env.mirage("readlink -e /data/f.txt")
    assert "f.txt" in result
