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


def test_unexpand_a(env):
    data = b"        hello        world\n"
    result = env.mirage("unexpand -a", stdin=data)
    assert "\t" in result


def test_unexpand_t(env):
    data = b"    hello\n"
    result = env.mirage("unexpand -t 4", stdin=data)
    assert "\t" in result
