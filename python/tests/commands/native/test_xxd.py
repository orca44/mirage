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


def test_xxd_u(env):
    data = b"\xab\xcd"
    result = env.mirage("xxd -u", stdin=data)
    assert "AB" in result or "CD" in result


def test_xxd_r(env):
    data = b"hello"
    hex_out = env.mirage("xxd -p", stdin=data)
    restored = env.mirage("xxd -r -p", stdin=hex_out.encode())
    assert "hello" in restored


def test_xxd_p(env):
    data = b"AB"
    result = env.mirage("xxd -p", stdin=data)
    assert "4142" in result or "4142" in result.lower()


def test_xxd_l(env):
    data = b"hello world"
    result = env.mirage("xxd -l 5", stdin=data)
    assert "worl" not in result


def test_xxd_g(env):
    data = b"ABCD"
    result = env.mirage("xxd -g 4", stdin=data)
    assert len(result.strip()) > 0


def test_xxd_c(env):
    data = b"hello world"
    result = env.mirage("xxd -c 4", stdin=data)
    lines = result.strip().splitlines()
    assert len(lines) >= 2


def test_xxd_s(env):
    data = b"hello world"
    result = env.mirage("xxd -s 5", stdin=data)
    assert "6865" not in result.lower()
