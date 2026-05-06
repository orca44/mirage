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


def test_exit_code_true(shell):
    cmd = "true; echo $?"
    assert shell.mirage(cmd) == shell.native(cmd)


def test_exit_code_false(shell):
    cmd = "false; echo $?"
    assert shell.mirage(cmd) == shell.native(cmd)


def test_exit_code_pipe_last(shell):
    cmd = "true | false; echo $?"
    assert shell.mirage(cmd) == shell.native(cmd)


def test_exit_code_pipe_success(shell):
    cmd = "false | true; echo $?"
    assert shell.mirage(cmd) == shell.native(cmd)


def test_exit_code_and_success(shell):
    cmd = "true && echo $?"
    assert shell.mirage(cmd) == shell.native(cmd)


def test_exit_code_and_short_circuit(shell):
    cmd = "false && echo $?"
    assert shell.mirage(cmd) == shell.native(cmd)


def test_exit_code_or_fallback(shell):
    cmd = "false || echo $?"
    assert shell.mirage(cmd) == shell.native(cmd)


def test_exit_code_or_short_circuit(shell):
    cmd = "true || echo $?"
    assert shell.mirage(cmd) == shell.native(cmd)


def test_exit_code_and_then_semi(shell):
    cmd = "true && false; echo $?"
    assert shell.mirage(cmd) == shell.native(cmd)


def test_exit_code_or_then_semi(shell):
    cmd = "false || true; echo $?"
    assert shell.mirage(cmd) == shell.native(cmd)


def test_exit_code_if_true(shell):
    cmd = "if true; then echo $?; fi"
    assert shell.mirage(cmd) == shell.native(cmd)


def test_exit_code_if_else(shell):
    cmd = "if false; then echo a; else echo $?; fi"
    assert shell.mirage(cmd) == shell.native(cmd)


def test_exit_code_semicolon_chain_true(shell):
    cmd = "false; true; echo $?"
    assert shell.mirage(cmd) == shell.native(cmd)


def test_exit_code_semicolon_chain_false(shell):
    cmd = "true; false; echo $?"
    assert shell.mirage(cmd) == shell.native(cmd)


def test_exit_code_if_resets(shell):
    cmd = "false; if true; then echo $?; fi"
    assert shell.mirage(cmd) == shell.native(cmd)


def test_exit_code_subshell(shell):
    cmd = "true; (false); echo $?"
    assert shell.mirage(cmd) == shell.native(cmd)


def test_exit_code_while_no_body(shell):
    cmd = "false; while false; do echo x; done; echo $?"
    assert shell.mirage(cmd) == shell.native(cmd)


def test_exit_code_negation_true(shell):
    cmd = "! true; echo $?"
    assert shell.mirage(cmd) == shell.native(cmd)


def test_exit_code_negation_false(shell):
    cmd = "! false; echo $?"
    assert shell.mirage(cmd) == shell.native(cmd)
