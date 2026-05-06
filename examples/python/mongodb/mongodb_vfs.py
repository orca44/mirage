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
import json
import os
import sys

from dotenv import load_dotenv

from mirage import MountMode, Workspace
from mirage.resource.mongodb import MongoDBConfig, MongoDBResource

load_dotenv(".env.development")

config = MongoDBConfig(uri=os.environ["MONGODB_URI"])
resource = MongoDBResource(config=config)


async def main():
    with Workspace({"/mongodb/": resource}, mode=MountMode.READ) as ws:
        vos = sys.modules["os"]
        print("=== VFS MODE: open() reads from MongoDB ===\n")

        print("--- os.listdir() databases ---")
        databases = vos.listdir("/mongodb")
        for db in databases:
            print(f"  {db}")

        if not databases:
            print("no databases found")
            return

        db = "sample_mflix"
        if db not in [d.split("/")[-1] for d in databases]:
            db = databases[0].split("/")[-1]

        print(f"\n--- os.listdir() {db} collections ---")
        collections = vos.listdir(f"/mongodb/{db}")
        for col in collections:
            print(f"  {col}")

        if not collections:
            print("no collections found")
            return

        target = None
        for col in collections:
            if "movies" in col:
                target = col
                break
        if not target:
            target = collections[0]

        path = f"/mongodb/{db}/{target}"
        print(f"\n--- open() + read {target} ---")
        with open(path) as f:
            content = f.read()
        lines = [ln for ln in content.strip().split("\n") if ln.strip()]
        print(f"  documents: {len(lines)}")
        for line in lines[:3]:
            try:
                doc = json.loads(line)
                title = doc.get("title", doc.get("name", "?"))
                doc_id = doc.get("_id", "?")
                print(f"  [{doc_id}] {title}")
            except json.JSONDecodeError:
                print(f"  {line[:80]}")

        print("\n--- session observer ---")
        day_folders = vos.listdir("/.sessions")
        log_entries = vos.listdir(day_folders[0]) if day_folders else []
        for e in log_entries:
            print(f"  {e}")
        if log_entries:
            with open(log_entries[0]) as f:
                for i, line in enumerate(f):
                    if i >= 3:
                        break
                    print(f"  [{i}] {line.strip()[:120]}")

        records = ws.ops.records
        total = sum(r.bytes for r in records)
        print(f"\nStats: {len(records)} ops, "
              f"{total} bytes transferred")


asyncio.run(main())
