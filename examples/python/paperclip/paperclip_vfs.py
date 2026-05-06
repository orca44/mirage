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
import sys

from mirage import MountMode, Workspace
from mirage.resource.paperclip import PaperclipConfig, PaperclipResource

config = PaperclipConfig()
resource = PaperclipResource(config=config)


async def main():
    with Workspace({"/paperclip/": resource}, mode=MountMode.READ) as ws:
        vos = sys.modules["os"]
        print(
            "=== VFS MODE: os module reads from Paperclip transparently ===\n")

        print("--- os.listdir() sources ---")
        sources = vos.listdir("/paperclip")
        for s in sources:
            print(f"  {s}")

        print("\n--- os.listdir() biorxiv years ---")
        years = vos.listdir("/paperclip/biorxiv")
        for y in years[-5:]:
            print(f"  {y}")

        if years:
            year = years[-1]
            print(f"\n--- os.listdir() biorxiv/{year} months ---")
            months = vos.listdir(f"/paperclip/biorxiv/{year}")
            for m in months:
                print(f"  {m}")

            if months:
                month = months[0]
                papers = vos.listdir(f"/paperclip/biorxiv/{year}/{month}")
                if papers:
                    paper = papers[0]
                    base = f"/paperclip/biorxiv/{year}/{month}"
                    path = f"{base}/{paper}/meta.json"

                    print(f"\n--- open() + read meta.json for {paper} ---")
                    with open(path) as f:
                        content = f.read()
                    print(f"  {content[:300]}")

                    print("\n--- os.path.exists() ---")
                    print(f"  exists: {vos.path.exists(path)}")
                    fake = "/paperclip/biorxiv/9999"
                    print(f"  nonexistent: {vos.path.exists(fake)}")

        records = ws.ops.records
        total = sum(r.bytes for r in records)
        print(f"\nStats: {len(records)} ops, {total} bytes transferred")


asyncio.run(main())
