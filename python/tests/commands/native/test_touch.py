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


def test_touch_c_no_create(env):
    env.mirage("touch -c /data/nonexistent.txt")
    result = env.mirage("find /data -name nonexistent.txt")
    assert result.strip() == ""


def test_touch_r(env):
    env.create_file("ref.txt", b"ref")
    env.mirage("touch /data/new.txt")
    result = env.mirage("ls /data")
    assert "new.txt" in result


def test_touch_d(env):
    env.mirage("touch /data/dated.txt")
    result = env.mirage("ls /data")
    assert "dated.txt" in result


def test_touch_r_explicit(env):
    env.create_file("ref.txt", b"ref")
    env.create_file("new.txt", b"")
    env.mirage("touch -r /data/ref.txt /data/new.txt")
    result = env.mirage("ls /data")
    assert "new.txt" in result


def test_touch_d_explicit(env):
    env.create_file("dated.txt", b"")
    env.mirage("touch -d '2024-01-01' /data/dated.txt")
    result = env.mirage("ls /data")
    assert "dated.txt" in result
