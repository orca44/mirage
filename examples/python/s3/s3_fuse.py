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

with Workspace({"/s3/": resource}, mode=MountMode.READ, fuse=True) as ws:
    time.sleep(1)
    mp = ws.fuse_mountpoint

    print(f"=== FUSE MODE: mounted at {mp} ===\n")

    print("--- os.listdir() ---")
    entries = os.listdir(f"{mp}/s3/data")
    for e in entries:
        print(f"  {e}")

    print("\n--- open() + read ---")
    with open(f"{mp}/s3/data/example.jsonl") as f:
        for i, line in enumerate(f):
            if i >= 3:
                break
            print(f"  [{i}] {line.strip()[:100]}...")

    print("\n--- os.path.getsize() ---")
    size = os.path.getsize(f"{mp}/s3/data/example.jsonl")
    print(f"  size: {size} bytes")

    print(f"\n>>> FUSE mounted at: {mp}")
    print(">>> Open another terminal and run:")
    print(f">>>   ls {mp}/s3/data/")
    print(f">>>   cat {mp}/s3/data/example.json")
    print(">>> Press Enter to unmount and exit...")
    input()

    records = ws.ops.records
    total = sum(r.bytes for r in records)
    print(f"\nStats: {len(records)} ops, {total} bytes transferred")
