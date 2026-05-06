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

from mirage.core.notion.pages import search_pages
from mirage.core.notion.pathing import extract_title, page_dirname
from mirage.resource.notion.config import NotionConfig


@dataclass
class SearchResult:
    page_id: str
    title: str
    path: str


async def search_page_content(
    config: NotionConfig,
    query: str,
    page_size: int = 100,
) -> list[SearchResult]:
    pages = await search_pages(config, query=query, page_size=page_size)
    results = []
    for page in pages:
        title = extract_title(page) or "untitled"
        dirname = page_dirname(page)
        results.append(
            SearchResult(
                page_id=page["id"],
                title=title,
                path=f"pages/{dirname}/page.json",
            ))
    return results


def format_grep_results(
    results: list[SearchResult],
    prefix: str,
) -> list[str]:
    lines: list[str] = []
    for r in results:
        path = f"{prefix}/{r.path}" if prefix else "/" + r.path
        lines.append(f"{path}:{r.title}")
    return lines
