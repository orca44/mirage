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
import shutil
import sys
import tempfile
from pathlib import Path

from mirage import MountMode, Workspace
from mirage.resource.disk import DiskResource

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / "data"

tmp = tempfile.mkdtemp()
shutil.copytree(DATA_DIR, Path(tmp) / "files", dirs_exist_ok=True)

resource = DiskResource(root=tmp + "/files")


async def main():
    ws = Workspace({"/data/": resource}, mode=MountMode.READ)

    with ws:
        vos = sys.modules["os"]
        print("=== VFS MODE ===\n")

        print("--- os.listdir() ---")
        entries = vos.listdir("/data")
        for e in entries:
            print(f"  {e}")

        print("\n--- open() + read ---")
        with open("/data/example.json") as f:
            print(f"  {f.read().strip()}")

        print("\n--- os.path.exists() ---")
        print(f"  example.json: {vos.path.exists('/data/example.json')}")
        print(f"  nope.txt: {vos.path.exists('/data/nope.txt')}")

        print("\n--- os.path.isdir() ---")
        print(f"  /data: {vos.path.isdir('/data')}")

        records = ws.ops.records
        total = sum(r.bytes for r in records)
        print(f"\nStats: {len(records)} ops, {total} bytes transferred")


asyncio.run(main())
