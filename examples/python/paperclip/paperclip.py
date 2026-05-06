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

from mirage import MountMode, Workspace
from mirage.resource.paperclip import PaperclipConfig, PaperclipResource

config = PaperclipConfig()
resource = PaperclipResource(config=config)


async def main():
    ws = Workspace({"/paperclip": resource}, mode=MountMode.READ)

    print("=== ls /paperclip/ (sources) ===")
    r = await ws.execute("ls /paperclip/")
    print(await r.stdout_str())

    print("=== ls /paperclip/biorxiv/ (years) ===")
    r = await ws.execute("ls /paperclip/biorxiv/")
    print(await r.stdout_str())

    print("=== ls /paperclip/biorxiv/2024/ (months) ===")
    r = await ws.execute("ls /paperclip/biorxiv/2024/")
    print(await r.stdout_str())

    print('=== search "CRISPR delivery" /paperclip/biorxiv/ ===')
    r = await ws.execute('search "CRISPR delivery" /paperclip/biorxiv/')
    print(await r.stdout_str())

    print("=== ls /paperclip/biorxiv/2024/03/ (papers) ===")
    r = await ws.execute("ls /paperclip/biorxiv/2024/03/")
    print(await r.stdout_str())

    r = await ws.execute("ls /paperclip/biorxiv/2024/03/ | head -n 1")
    first_paper = (await r.stdout_str()).strip()
    if not first_paper:
        print("no papers found")
        return

    base = f"/paperclip/biorxiv/2024/03/{first_paper}"
    print(f"  using paper: {first_paper}")

    print(f"\n=== cat {base}/meta.json ===")
    r = await ws.execute(f'cat "{base}/meta.json"')
    print((await r.stdout_str())[:500])

    print(f"\n=== head -n 20 {base}/content.lines ===")
    r = await ws.execute(f'head -n 20 "{base}/content.lines"')
    print(await r.stdout_str())

    print(f"\n=== ls {base}/sections/ ===")
    r = await ws.execute(f'ls "{base}/sections/"')
    print(await r.stdout_str())

    print(f'\n=== grep -i "method" {base}/content.lines ===')
    r = await ws.execute(f'grep -i "method" "{base}/content.lines"')
    lines = (await r.stdout_str()).strip().splitlines() if (
        await r.stdout_str()).strip() else []
    print(f"  matches: {len(lines)}")
    for line in lines[:5]:
        print(f"  {line[:120]}")

    print(f"\n=== stat {base}/meta.json ===")
    r = await ws.execute(f'stat "{base}/meta.json"')
    print(await r.stdout_str())


if __name__ == "__main__":
    asyncio.run(main())
