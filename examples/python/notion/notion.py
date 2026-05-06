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

import asyncio
import os

from dotenv import load_dotenv

from mirage import MountMode, Workspace
from mirage.resource.notion import NotionConfig, NotionResource

load_dotenv(".env.development")

config = NotionConfig(api_key=os.environ["NOTION_API_KEY"])
resource = NotionResource(config=config)


async def main() -> None:
    ws = Workspace({"/notion": resource}, mode=MountMode.READ)

    print("=== ls /notion/pages/ ===")
    result = await ws.execute("ls /notion/pages/")
    print(await result.stdout_str())

    first_page = (await result.stdout_str()).strip().splitlines()[0] if (
        await result.stdout_str()).strip() else ""
    if not first_page:
        print("No pages available")
        return

    page_path = f"/notion/pages/{first_page}"

    print(f"=== cat {page_path}/page.json ===")
    result = await ws.execute(f"cat {page_path}/page.json")
    print((await result.stdout_str())[:2000])

    print(f"\n=== jq .title {page_path}/page.json ===")
    result = await ws.execute(f'jq ".title" {page_path}/page.json')
    print(await result.stdout_str())

    print(f"=== jq .url {page_path}/page.json ===")
    result = await ws.execute(f'jq ".url" {page_path}/page.json')
    print(await result.stdout_str())

    print(f"=== jq .markdown {page_path}/page.json ===")
    result = await ws.execute(f'jq ".markdown" {page_path}/page.json')
    print((await result.stdout_str())[:500])

    print(f"\n=== stat {page_path}/page.json ===")
    result = await ws.execute(f"stat {page_path}/page.json")
    print(await result.stdout_str())

    print(f"=== head -n 5 {page_path}/page.json ===")
    result = await ws.execute(f"head -n 5 {page_path}/page.json")
    print(await result.stdout_str())

    print("=== tree -L 1 /notion/ ===")
    result = await ws.execute("tree -L 1 /notion/")
    print(await result.stdout_str())

    print(f"=== tree -L 1 {page_path}/ ===")
    result = await ws.execute(f"tree -L 1 {page_path}/")
    print(await result.stdout_str())

    print(f"=== find {page_path}/ -name '*.json' ===")
    result = await ws.execute(f'find {page_path}/ -name "*.json"')
    print(await result.stdout_str())

    print(f"=== basename {page_path}/page.json ===")
    result = await ws.execute(f"basename {page_path}/page.json")
    print(await result.stdout_str())

    print(f"=== dirname {page_path}/page.json ===")
    result = await ws.execute(f"dirname {page_path}/page.json")
    print(await result.stdout_str())

    print("=== notion-search --query EVO ===")
    result = await ws.execute("notion-search --query EVO")
    print((await result.stdout_str())[:1000])

    # ── native search dispatch (Notion search API) ──
    print(f"\n=== grep Graph {page_path}/*.json (page glob) ===")
    result = await ws.execute(f'grep Graph "{page_path}/"*.json')
    out = (await result.stdout_str()).strip()
    lines = out.splitlines() if out else []
    print(f"  exit={result.exit_code} matches: {len(lines)}")
    for line in lines[:3]:
        print(f"  {line[:150]}")

    print("\n=== grep Graph /notion/pages/ (pages root scope) ===")
    result = await ws.execute('grep Graph /notion/pages/')
    out = (await result.stdout_str()).strip()
    lines = out.splitlines() if out else []
    print(f"  exit={result.exit_code} matches: {len(lines)}")
    for line in lines[:3]:
        print(f"  {line[:150]}")

    print("\n=== grep Graph /notion/ (workspace scope) ===")
    result = await ws.execute('grep Graph /notion/')
    out = (await result.stdout_str()).strip()
    lines = out.splitlines() if out else []
    print(f"  exit={result.exit_code} matches: {len(lines)}")
    for line in lines[:3]:
        print(f"  {line[:150]}")

    print("\n=== rg Graph /notion/ ===")
    result = await ws.execute('rg Graph /notion/')
    out = (await result.stdout_str()).strip()
    lines = out.splitlines() if out else []
    print(f"  exit={result.exit_code} matches: {len(lines)}")
    for line in lines[:3]:
        print(f"  {line[:150]}")

    print(f"\n=== ls {page_path}/ (children) ===")
    result = await ws.execute(f"ls {page_path}/")
    children = await result.stdout_str()
    print(children)

    child_dirs = [
        line for line in children.strip().splitlines()
        if not line.endswith(".json")
    ]
    if child_dirs:
        child = child_dirs[0]
        print(f"=== cat {page_path}/{child}/page.json (child page) ===")
        result = await ws.execute(f"cat {page_path}/{child}/page.json")
        print((await result.stdout_str())[:1000])

    # ── glob expansion (exercises resolve_glob → readdir) ──
    print(f"\n=== echo {page_path}/*.json (glob) ===")
    r = await ws.execute(f"echo {page_path}/*.json")
    out = (await r.stdout_str()).strip()
    print(f"  {out[:200]}")


if __name__ == "__main__":
    asyncio.run(main())
