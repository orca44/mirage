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
from mirage.resource.gcs import GCSConfig, GCSResource

load_dotenv(".env.development")

config = GCSConfig(
    bucket=os.environ["GCS_BUCKET"],
    access_key_id=os.environ["GCS_ACCESS_KEY_ID"],
    secret_access_key=os.environ["GCS_SECRET_ACCESS_KEY"],
)

resource = GCSResource(config)


async def main():
    with Workspace({"/gcs/": resource}, mode=MountMode.READ) as ws:
        vos = sys.modules["os"]
        print("=== VFS MODE: open() reads from GCS transparently ===\n")

        print("--- os.listdir() root ---")
        root = vos.listdir("/gcs")
        for e in root:
            print(f"  {e}")

        print("\n--- os.path.isdir() on prefix ---")
        print(f"  /gcs/data: {vos.path.isdir('/gcs/data')}")

        print("\n--- os.listdir() data ---")
        entries = vos.listdir("/gcs/data")
        for e in entries:
            print(f"  {e}")

        print("\n--- open() + read example.json (first 5 lines) ---")
        with open("/gcs/data/example.json") as f:
            for i, line in enumerate(f):
                if i >= 5:
                    break
                print(f"  {line.rstrip()[:120]}")

        print("\n--- open() + read example.jsonl (first 3 lines) ---")
        with open("/gcs/data/example.jsonl") as f:
            for i, line in enumerate(f):
                if i >= 3:
                    break
                rec = json.loads(line)
                print(f"  [{i}] {json.dumps(rec)[:100]}...")

        print("\n--- os.path.exists() ---")
        print(f"  example.json: {vos.path.exists('/gcs/data/example.json')}")
        print(f"  nonexistent: {vos.path.exists('/gcs/data/nope.txt')}")

        print("\n--- VFS commands ---")
        result = await ws.execute("grep -c mirage /gcs/data/example.jsonl")
        print(f"  grep matches: {(await result.stdout_str()).strip()}")

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
        print(f"\nStats: {len(records)} ops, {total} bytes transferred")


asyncio.run(main())
