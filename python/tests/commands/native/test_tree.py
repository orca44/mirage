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

import pytest


def test_tree_d(env):
    if env.resource_type == "s3":
        pytest.skip("S3 tree cannot stat virtual directories")
    env.create_file("sub/a.txt", b"hi")
    result = env.mirage("tree -d /data")
    assert "a.txt" not in result
    assert "sub" in result


def test_tree_a(env):
    env.create_file(".hidden", b"secret")
    env.create_file("visible.txt", b"hi")
    result = env.mirage("tree -a /data")
    assert ".hidden" in result


def test_tree_L(env):
    if env.resource_type == "s3":
        pytest.skip("S3 tree cannot stat virtual directories")
    env.create_file("sub/deep/a.txt", b"hi")
    result = env.mirage("tree -L 1 /data")
    assert "sub" in result
    assert "a.txt" not in result


def test_tree_P(env):
    env.create_file("hello.txt", b"hi")
    env.create_file("world.txt", b"hi")
    result = env.mirage("tree -P hello* /data")
    assert "hello" in result


def test_tree_I(env):
    env.create_file("keep.txt", b"hi")
    env.create_file("skip.log", b"hi")
    result = env.mirage("tree -I '*.log' /data")
    assert "keep.txt" in result
    assert "skip.log" not in result
