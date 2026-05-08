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


def test_readonly_blocks_reassignment(shell):
    out = shell.mirage("readonly X=1; X=2; echo $X")
    assert "1" in out
    assert "2" not in out


def test_readonly_blocks_unset(shell):
    out = shell.mirage("readonly X=5; unset X; echo $X")
    assert out == "5\n"


def test_declare_r_blocks_reassignment(shell):
    out = shell.mirage("declare -r Y=5; Y=10; echo $Y")
    assert out == "5\n"


def test_readonly_emits_error(shell):
    code = shell.mirage_exit("readonly X=1; X=2")
    assert code != 0


def test_readonly_first_assignment_succeeds(shell):
    assert shell.mirage("readonly X=hello; echo $X") == "hello\n"
