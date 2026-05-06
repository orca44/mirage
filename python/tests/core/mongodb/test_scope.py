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

from mirage.core.mongodb.scope import detect_scope
from mirage.types import PathSpec


def test_root_path():
    scope = detect_scope("/")
    assert scope.level == "root"
    assert scope.database is None
    assert scope.collection is None


def test_database_path():
    scope = detect_scope("/sample_mflix")
    assert scope.level == "database"
    assert scope.database == "sample_mflix"
    assert scope.collection is None


def test_file_path():
    scope = detect_scope("/sample_mflix/movies.jsonl")
    assert scope.level == "file"
    assert scope.database == "sample_mflix"
    assert scope.collection == "movies"


def test_single_db_root():
    scope = detect_scope("/", single_db=True, single_db_name="mydb")
    assert scope.level == "database"
    assert scope.database == "mydb"


def test_single_db_file():
    scope = detect_scope("/movies.jsonl",
                         single_db=True,
                         single_db_name="mydb")
    assert scope.level == "file"
    assert scope.database == "mydb"
    assert scope.collection == "movies"


def test_glob_scope_root():
    gs = PathSpec(
        original="/mongo/",
        directory="/mongo/",
        pattern=None,
        resolved=False,
        prefix="/mongo",
    )
    scope = detect_scope(gs)
    assert scope.level == "root"


def test_glob_scope_database():
    gs = PathSpec(
        original="/mongo/sample_mflix",
        directory="/mongo/",
        pattern=None,
        resolved=False,
        prefix="/mongo",
    )
    scope = detect_scope(gs)
    assert scope.level == "database"
    assert scope.database == "sample_mflix"


def test_glob_scope_file():
    gs = PathSpec(
        original="/mongo/sample_mflix/movies.jsonl",
        directory="/mongo/sample_mflix/",
        pattern="*.jsonl",
        resolved=True,
        prefix="/mongo",
    )
    scope = detect_scope(gs)
    assert scope.level == "file"
    assert scope.database == "sample_mflix"
    assert scope.collection == "movies"
