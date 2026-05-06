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


def test_dev_null_cat(shell):
    assert shell.mirage("cat /dev/null") == ""


def test_dev_null_redirect_stdout(shell):
    assert shell.mirage("echo hello > /dev/null") == ""


def test_dev_null_redirect_stderr(shell):
    cmd = "cat /data/nope.txt 2>/dev/null || echo recovered"
    assert "recovered" in shell.mirage(cmd)


def test_dev_null_preserves_exit_code(shell):
    cmd = ("if cat /data/nope.txt 2>/dev/null; "
           "then echo found; else echo missing; fi")
    assert shell.mirage(cmd) == "missing\n"


def test_dev_null_in_pipe(shell):
    assert shell.mirage("echo hello | cat > /dev/null") == ""


def test_dev_zero_head(shell):
    result = shell.mirage("head -c 4 /dev/zero")
    assert result == "\x00\x00\x00\x00"


def test_dev_null_stat(shell):
    cmd = "if [ -f /dev/null ]; then echo exists; fi"
    assert shell.mirage(cmd) == "exists\n"
