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

import os
import time

from mirage import MountMode, Workspace
from mirage.resource.paperclip import PaperclipConfig, PaperclipResource

config = PaperclipConfig()
resource = PaperclipResource(config=config)

with Workspace({"/paperclip/": resource}, mode=MountMode.READ,
               fuse=True) as ws:
    time.sleep(1)
    mp = ws.fuse_mountpoint

    print(f"=== FUSE MODE: mounted at {mp} ===\n")

    print("--- os.listdir() sources ---")
    sources = os.listdir(f"{mp}/paperclip")
    for s in sources:
        print(f"  {s}")

    print("\n--- os.listdir() biorxiv years ---")
    years = os.listdir(f"{mp}/paperclip/biorxiv")
    for y in years[-5:]:
        print(f"  {y}")

    if years:
        year = years[-1]
        print(f"\n--- os.listdir() biorxiv/{year} months ---")
        months = os.listdir(f"{mp}/paperclip/biorxiv/{year}")
        for m in months:
            print(f"  {m}")

        if months:
            month = months[0]
            papers = os.listdir(f"{mp}/paperclip/biorxiv/{year}/{month}")
            if papers:
                paper = papers[0]
                base = f"{mp}/paperclip/biorxiv"
                meta_path = f"{base}/{year}/{month}/{paper}/meta.json"

                print(f"\n--- open() + read meta.json for {paper} ---")
                with open(meta_path) as f:
                    content = f.read()
                print(f"  {content[:300]}")

    print(f"\n>>> FUSE mounted at: {mp}")
    print(">>> Open another terminal and run:")
    print(f">>>   ls {mp}/paperclip/")
    print(f">>>   cat {mp}/paperclip/biorxiv/2024/03/<paper_id>/meta.json")
    print(">>> Press Enter to unmount and exit...")
    input()

    records = ws.ops.records
    total = sum(r.bytes for r in records)
    print(f"\nStats: {len(records)} ops, {total} bytes transferred")
