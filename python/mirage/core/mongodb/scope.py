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

from dataclasses import dataclass

from mirage.types import PathSpec


@dataclass
class MongoDBScope:
    level: str
    database: str | None = None
    collection: str | None = None
    resource_path: str = "/"


def detect_scope(
    path: PathSpec,
    single_db: bool = False,
    single_db_name: str | None = None,
) -> MongoDBScope:
    raw = path.strip_prefix if isinstance(path, PathSpec) else path
    key = raw.strip("/")

    if not key:
        if single_db:
            return MongoDBScope(level="database",
                                database=single_db_name,
                                resource_path="/")
        return MongoDBScope(level="root", resource_path="/")

    parts = key.split("/")

    if single_db:
        if key.endswith(".jsonl"):
            col = key.removesuffix(".jsonl")
            return MongoDBScope(level="file",
                                database=single_db_name,
                                collection=col,
                                resource_path=raw)
        return MongoDBScope(level="database",
                            database=single_db_name,
                            resource_path=raw)

    if len(parts) == 1:
        if parts[0].endswith(".jsonl"):
            return MongoDBScope(level="file",
                                database=None,
                                collection=parts[0].removesuffix(".jsonl"),
                                resource_path=raw)
        return MongoDBScope(level="database",
                            database=parts[0],
                            resource_path=raw)

    if len(parts) == 2 and parts[1].endswith(".jsonl"):
        return MongoDBScope(level="file",
                            database=parts[0],
                            collection=parts[1].removesuffix(".jsonl"),
                            resource_path=raw)

    return MongoDBScope(level="root", resource_path=raw)
