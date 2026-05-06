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


def test_create_and_cat(env):
    env.create_file("f.txt", b"hello world\n")
    assert env.mirage("cat /data/f.txt") == env.native("cat f.txt")


def test_create_subdir_and_cat(env):
    env.create_file("sub/f.txt", b"nested\n")
    assert env.mirage("cat /data/sub/f.txt") == env.native("cat sub/f.txt")
