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


def test_seq_1arg(env):
    assert env.mirage("seq 4") == env.native("seq 4")


def test_seq_2args(env):
    assert env.mirage("seq 3 5") == env.native("seq 3 5")


def test_seq_3args(env):
    assert env.mirage("seq 1 2 7") == env.native("seq 1 2 7")


def test_seq_s(env):
    assert env.mirage("seq -s , 1 3").strip() == "1,2,3"


def test_seq_f(env):
    assert env.mirage("seq -f '%.2f' 1 3") == env.native("seq -f '%.2f' 1 3")


def test_seq_w(env):
    assert env.mirage("seq -w 1 10") == env.native("seq -w 1 10")
