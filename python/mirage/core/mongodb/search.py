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

import json

from bson.json_util import default
from motor.motor_asyncio import AsyncIOMotorClient

from mirage.core.mongodb._client import get_indexes, list_collections


async def _regex_filter(col, pattern: str) -> list[dict]:
    sample = await col.find_one()
    if not sample:
        return [{}]
    string_fields = [
        k for k, v in sample.items() if isinstance(v, str) and k != "_id"
    ]
    if not string_fields:
        return [{}]
    return [{f: {"$regex": pattern, "$options": "i"}} for f in string_fields]


async def search_collection(
    client: AsyncIOMotorClient,
    database: str,
    collection: str,
    pattern: str,
    limit: int = 100,
) -> list[dict]:
    db = client[database]
    col = db[collection]
    indexes = await get_indexes(client, database, collection)
    has_text_index = any(
        any(v == "text" for v in idx.get("key", {}).values())
        for idx in indexes)
    if has_text_index:
        cursor = col.find({"$text": {"$search": pattern}}).limit(limit)
    else:
        cursor = col.find({
            "$or": await _regex_filter(col, pattern)
        }).limit(limit)
    return await cursor.to_list(length=limit)


async def search_database(
    client: AsyncIOMotorClient,
    database: str,
    pattern: str,
    limit: int,
) -> list[tuple[str, str, list[dict]]]:
    collections = await list_collections(client, database)
    results: list[tuple[str, str, list[dict]]] = []
    for col in collections:
        docs = await search_collection(client,
                                       database,
                                       col,
                                       pattern,
                                       limit=limit)
        if docs:
            results.append((database, col, docs))
    return results


def format_grep_results(
        results: list[tuple[str, str, list[dict]]]) -> list[str]:  # noqa: E125
    lines: list[str] = []
    for db_name, col_name, docs in results:
        for doc in docs:
            doc["_id"] = str(doc.get("_id", ""))
            line_json = json.dumps(doc, ensure_ascii=False, default=default)
            lines.append(f"{db_name}/{col_name}.jsonl:{line_json}")
    return lines
