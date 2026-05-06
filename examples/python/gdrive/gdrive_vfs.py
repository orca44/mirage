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
import sys

from dotenv import load_dotenv

from mirage import MountMode, Workspace
from mirage.resource.gdrive import GoogleDriveConfig, GoogleDriveResource

load_dotenv(".env.development")

config = GoogleDriveConfig(
    client_id=os.environ["GOOGLE_CLIENT_ID"],
    client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
    refresh_token=os.environ["GOOGLE_REFRESH_TOKEN"],
)
resource = GoogleDriveResource(config=config)


async def main():
    with Workspace({"/gdrive/": resource}, mode=MountMode.READ) as ws:
        vos = sys.modules["os"]
        print("=== VFS MODE ===\n")

        print("--- os.listdir() root ---")
        entries = vos.listdir("/gdrive")
        for e in entries[:10]:
            print(f"  {e}")

        if entries:
            first = entries[0]
            path = f"/gdrive/{first}"
            print(f"\n--- os.path.isdir({first}) ---")
            print(f"  {vos.path.isdir(path)}")

            if vos.path.isfile(path):
                print(f"\n--- open() + read {first} ---")
                with open(path) as f:
                    content = f.read()
                print(f"  {len(content)} bytes")

        print("\n--- session observer ---")
        day_folders = vos.listdir("/.sessions")
        log_entries = vos.listdir(day_folders[0]) if day_folders else []
        for e in log_entries:
            print(f"  {e}")

        records = ws.ops.records
        total = sum(r.bytes for r in records)
        print(f"\nStats: {len(records)} ops, {total} bytes transferred")


asyncio.run(main())
