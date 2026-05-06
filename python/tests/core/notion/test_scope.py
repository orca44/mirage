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

from mirage.core.notion.scope import detect_scope
from mirage.types import PathSpec


def _gs(path: str,
        prefix: str = "",
        pattern: str | None = None,
        directory: str | None = None) -> PathSpec:
    return PathSpec(
        original=path,
        directory=directory
        or (path.rsplit("/", 1)[0] + "/" if "/" in path else "/"),
        pattern=pattern,
        prefix=prefix,
    )


def test_root_empty():
    scope = detect_scope("/")
    assert scope.use_native is True


def test_root_with_prefix():
    scope = detect_scope(_gs("/notion/", prefix="/notion"))
    assert scope.use_native is True


def test_pages_dir():
    scope = detect_scope(_gs("/notion/pages", prefix="/notion"))
    assert scope.use_native is True


def test_page_dir():
    scope = detect_scope(_gs("/notion/pages/MyPage__abc123", prefix="/notion"))
    assert scope.use_native is True
    assert scope.page_id == "abc123"


def test_page_json_file():
    scope = detect_scope(
        _gs("/notion/pages/MyPage__abc123/page.json", prefix="/notion"))
    assert scope.use_native is False
    assert scope.page_id == "abc123"


def test_nested_page():
    scope = detect_scope(
        _gs("/notion/pages/MyPage__abc/Child__xyz", prefix="/notion"))
    assert scope.use_native is True
    assert scope.page_id == "xyz"


def test_glob_in_page_dir():
    spec = PathSpec(
        original="/notion/pages/MyPage__abc/*.json",
        directory="/notion/pages/MyPage__abc/",
        pattern="*.json",
        resolved=False,
        prefix="/notion",
    )
    scope = detect_scope(spec)
    assert scope.use_native is True


def test_unknown_root_not_native():
    scope = detect_scope(_gs("/notion/databases", prefix="/notion"))
    assert scope.use_native is False
