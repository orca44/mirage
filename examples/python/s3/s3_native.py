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
    with Workspace({"/s3/": resource},
                   mode=MountMode.READ,
                   fuse=True,
                   native=True) as ws:
        await asyncio.sleep(1)

        print("=== NATIVE MODE: real shell commands via FUSE ===\n")

        print("--- ls ---")
        result = await ws.execute("ls s3/data")
        print(await result.stdout_str())

        print("--- head -n 3 ---")
        result = await ws.execute("head -n 3 s3/data/example.jsonl")
        print((await result.stdout_str())[:200] + "...\n")

        print("--- grep | wc -l (real pipe) ---")
        result = await ws.execute("grep mirage s3/data/example.jsonl | wc -l")
        print(f"  matches: {(await result.stdout_str()).strip()}\n")

        print("--- grep | sort | uniq | head ---")
        result = await ws.execute("grep queue-operation s3/data/example.jsonl"
                                  " | sort | uniq | head -n 5")
        print(await result.stdout_str())

        print("--- awk (only available natively) ---")
        result = await ws.execute("head -n 5 s3/data/example.jsonl"
                                  " | awk -F',' '{print NR\": \"$1}'")
        print(await result.stdout_str())

        records = ws.ops.records
        total = sum(r.bytes for r in records)
        print(f"Stats: {len(records)} ops, {total} bytes transferred")


asyncio.run(main())
