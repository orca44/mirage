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
from mirage.resource.s3 import S3Config, S3Resource

load_dotenv(".env.development")

config = S3Config(
    bucket=os.environ["AWS_S3_BUCKET"],
    region=os.environ.get("AWS_DEFAULT_REGION", "us-east-1"),
    aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
)

resource = S3Resource(config)


async def main():
    with Workspace({"/s3/": resource}, mode=MountMode.READ) as ws:
        vos = sys.modules["os"]
        print("=== VFS MODE: open() reads from S3 transparently ===\n")

        print("--- os.listdir() root ---")
        root = vos.listdir("/s3")
        for e in root:
            print(f"  {e}")

        print("\n--- os.path.isdir() on prefix ---")
        print(f"  /s3/data: {vos.path.isdir('/s3/data')}")

        print("\n--- open() + read ---")
        with open("/s3/data/example.jsonl") as f:
            for i, line in enumerate(f):
                if i >= 3:
                    break
                rec = json.loads(line)
                print(f"  [{i}] {json.dumps(rec)[:100]}...")

        print("\n--- os.listdir() ---")
        entries = vos.listdir("/s3/data")
        for e in entries:
            print(f"  {e}")

        print("\n--- os.path.exists() ---")
        print(f"  example.jsonl: {vos.path.exists('/s3/data/example.jsonl')}")
        print(f"  nonexistent: {vos.path.exists('/s3/data/nope.txt')}")

        print("\n--- VFS commands ---")
        result = await ws.execute("grep -c mirage /s3/data/example.jsonl")
        print(f"  grep matches: {(await result.stdout_str()).strip()}")

        print("\n--- session observer via VFS ---")
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
