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
from mirage.resource.telegram import TelegramConfig, TelegramResource

load_dotenv(".env.development")

config = TelegramConfig(token=os.environ["TELEGRAM_BOT_TOKEN"])
resource = TelegramResource(config=config)

with Workspace({"/telegram/": resource}, mode=MountMode.READ, fuse=True) as ws:
    time.sleep(1)
    mp = ws.fuse_mountpoint

    print(f"=== FUSE MODE: mounted at {mp} ===\n")

    print("--- os.listdir() categories ---")
    categories = os.listdir(f"{mp}/telegram")
    for c in categories:
        print(f"  {c}")

    base = None
    for cat in ("groups", "channels", "private"):
        cat_path = f"{mp}/telegram/{cat}"
        if not os.path.isdir(cat_path):
            continue
        chats = os.listdir(cat_path)
        if chats:
            print(f"\n--- os.listdir() {cat} ---")
            for ch in chats:
                print(f"  {ch}")
            base = f"{cat_path}/{chats[0]}"
            break

    if base:
        chat_name = os.path.basename(base)
        print(f"\n--- os.listdir() {chat_name} ---")
        dates = os.listdir(base)
        for d in dates:
            print(f"  {d}")

        if dates:
            target = dates[-1]
            path = f"{base}/{target}"
            print(f"\n--- open() + read {target} ---")
            with open(path) as f:
                text = f.read().strip()
            if text:
                for i, line in enumerate(text.splitlines()):
                    if i >= 5:
                        print("  ...")
                        break
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        msg = json.loads(line)
                    except json.JSONDecodeError:
                        break
                    sender = msg.get("from", {})
                    name = (sender.get("username")
                            or sender.get("first_name", "?"))
                    content = msg.get("text", "")
                    print(f"  [{name}] {content[:80]}")
            else:
                print("  (empty — no messages on this date)")
    else:
        print("\nno chats found")

    print(f"\n>>> FUSE mounted at: {mp}")
    print(">>> Open another terminal and run:")
    print(f">>>   ls {mp}/telegram/")
    print(f">>>   ls {mp}/telegram/groups/")
    print(">>> Press Enter to unmount and exit...")
    input()

    records = ws.ops.records
    total = sum(r.bytes for r in records)
    print(f"\nStats: {len(records)} ops, {total} bytes transferred")
