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
import os
import time

from dotenv import load_dotenv

from mirage import MountMode, Workspace
from mirage.resource.mongodb import MongoDBConfig, MongoDBResource

load_dotenv(".env.development")

config = MongoDBConfig(uri=os.environ["MONGODB_URI"])
resource = MongoDBResource(config=config)

with Workspace(
    {"/mongodb/": resource},
        mode=MountMode.READ,
        fuse=True,
) as ws:
    time.sleep(1)
    mp = ws.fuse_mountpoint

    print(f"=== FUSE MODE: mounted at {mp} ===\n")

    print("--- os.listdir() databases ---")
    databases = os.listdir(f"{mp}/mongodb")
    for db in databases:
        print(f"  {db}")

    if not databases:
        print("no databases found")
    else:
        db = "sample_mflix"
        if db not in databases:
            db = databases[0]

        print(f"\n--- os.listdir() {db} collections ---")
        collections = os.listdir(f"{mp}/mongodb/{db}")
        for col in collections:
            print(f"  {col}")

        if collections:
            target = None
            for col in collections:
                if "movies" in col:
                    target = col
                    break
            if not target:
                target = collections[0]

            path = f"{mp}/mongodb/{db}/{target}"
            print(f"\n--- open() + read {target} ---")
            with open(path) as f:
                text = f.read().strip()
            if text:
                lines = text.splitlines()
                print(f"  documents: {len(lines)}")
                for line in lines[:5]:
                    try:
                        doc = json.loads(line)
                        title = doc.get("title", doc.get("name", "?"))
                        print(f"  {title}")
                    except json.JSONDecodeError:
                        print(f"  {line[:80]}")
            else:
                print("  (empty)")

    print(f"\n>>> FUSE mounted at: {mp}")
    print(">>> Open another terminal and run:")
    print(f">>>   ls {mp}/mongodb/")
    print(f">>>   cat {mp}/mongodb/sample_mflix/movies.jsonl"
          " | head -n 5")
    print(">>> Press Enter to unmount and exit...")
    input()

    records = ws.ops.records
    total = sum(r.bytes for r in records)
    print(f"\nStats: {len(records)} ops, "
          f"{total} bytes transferred")
