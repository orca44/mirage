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

from mirage.core.telegram.scope import detect_scope
from mirage.types import PathSpec


def test_root_empty():
    scope = detect_scope("/")
    assert scope.level == "root"


def test_root_globscope():
    gs = PathSpec(
        original="/telegram/",
        directory="/telegram/",
        prefix="/telegram",
    )
    scope = detect_scope(gs)
    assert scope.level == "root"


def test_category():
    scope = detect_scope("groups")
    assert scope.level == "category"
    assert scope.category == "groups"


def test_chat():
    scope = detect_scope("groups/Test Group__-100")
    assert scope.level == "chat"
    assert scope.category == "groups"


def test_file():
    scope = detect_scope("groups/Test Group__-100/2026-04-11.jsonl")
    assert scope.level == "file"
    assert scope.category == "groups"
    assert scope.date_str == "2026-04-11"
