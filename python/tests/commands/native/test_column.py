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


def test_column_o(env):
    data = b"a b c\nd e f\n"
    result = env.mirage("column -t -o '|'", stdin=data)
    assert result == "a|b|c\nd|e|f\n"


def test_column_s(env):
    data = b"a:b:c\nd:e:f\n"
    result = env.mirage("column -t -s :", stdin=data)
    assert "a" in result and "b" in result
