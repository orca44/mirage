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


def test_rm_d(env):
    env.mirage("mkdir /data/emptydir")
    env.mirage("rm -d /data/emptydir")
    result = env.mirage("ls /data/")
    assert "emptydir" not in result


def test_rm_r(env):
    if env.resource_type == "s3":
        pytest.skip("S3 cannot stat virtual directories for rm -r")
    env.create_file("sub/a.txt", b"hello")
    env.mirage("rm -r /data/sub")
    result = env.mirage("find /data -name a.txt")
    assert result.strip() == ""


def test_rm_f(env):
    result = env.mirage("rm -f /data/nonexistent.txt")
    assert result.strip() == ""


def test_rm_R(env):
    if env.resource_type == "s3":
        pytest.skip("S3 cannot stat virtual directories for rm -R")
    env.create_file("sub/a.txt", b"hi")
    env.mirage("rm -R /data/sub")
    result = env.mirage("find /data -name a.txt")
    assert result.strip() == ""


def test_rm_v(env):
    env.create_file("f.txt", b"hello")
    result = env.mirage("rm -v /data/f.txt")
    assert "f.txt" in result
