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
from mirage.resource.discord import DiscordConfig, DiscordResource

load_dotenv(".env.development")

config = DiscordConfig(token=os.environ["DISCORD_BOT_TOKEN"])
resource = DiscordResource(config=config)


async def main():
    with Workspace({"/discord/": resource}, mode=MountMode.READ) as ws:
        vos = sys.modules["os"]
        print("=== VFS MODE: open() reads from Discord transparently ===\n")

        print("--- os.listdir() guilds ---")
        guilds = vos.listdir("/discord")
        for g in guilds:
            print(f"  {g}")

        if guilds:
            guild = guilds[0]
            print(f"\n--- os.listdir() {guild} ---")
            sections = vos.listdir(guild)
            for s in sections:
                print(f"  {s}")

            print("\n--- os.listdir() channels ---")
            ch_dir = [
                s for s in sections
                if s.endswith("/channels") or "channels" in s
            ][0] if sections else None
            if ch_dir:
                channels = vos.listdir(ch_dir)
            else:
                channels = []
            for ch in channels[:5]:
                print(f"  {ch}")

            if channels:
                ch = channels[0]
                print("\n--- os.listdir() dates ---")
                dates = vos.listdir(ch)
                for d in dates[-5:]:
                    print(f"  {d}")

                if dates:
                    for d in reversed(dates):
                        path = d
                        with open(path) as f:
                            content = f.read()
                        lines = [
                            line_text
                            for line_text in content.strip().split("\n")
                            if line_text.strip()
                        ]
                        if lines:
                            print(f"\n--- open() + read {d} ---")
                            print(f"  messages: {len(lines)}")
                            for line in lines[:3]:
                                rec = json.loads(line)
                                author = rec.get("author",
                                                 {}).get("username", "?")
                                text = rec.get("content", "")[:80]
                                print(f"  [{author}] {text}")
                            break
                    else:
                        print("\n  (no messages found in recent dates)")

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
