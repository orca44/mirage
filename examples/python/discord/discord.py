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
from mirage.resource.discord import DiscordConfig, DiscordResource

load_dotenv(".env.development")

config = DiscordConfig(token=os.environ["DISCORD_BOT_TOKEN"])
resource = DiscordResource(config=config)


async def main():
    ws = Workspace({"/discord": resource}, mode=MountMode.READ)

    # ── discover structure ────────────────────────────
    print("=== ls /discord/ (guilds) ===")
    r = await ws.execute("ls /discord/")
    print(await r.stdout_str())

    guilds = (await r.stdout_str()).strip().split("\n")
    if not guilds or not guilds[0]:
        print("no guilds found")
        return

    guild = guilds[0].strip()
    print(f"=== ls /discord/{guild}/channels/ ===")
    r = await ws.execute(f'ls "/discord/{guild}/channels/"')
    print(await r.stdout_str())

    channels = (await r.stdout_str()).strip().splitlines()
    if not channels:
        print("no channels found")
        return

    ch = channels[0].strip()
    base = f"/discord/{guild}/channels/{ch}"

    # Use search API to find a date that actually has messages
    print("\n=== finding a date with messages "
          "via search API ===")
    r = await ws.execute(f'grep -m 1 "" "{base}/"')
    search_out = (await r.stdout_str()).strip()
    if search_out:
        # Extract date from search result
        # (format: channelId/YYYY-MM-DD.jsonl:...)
        date_match = None
        for line in search_out.splitlines():
            parts = line.split("/")
            for part in parts:
                if part.endswith(".jsonl"):
                    date_match = part.split(":")[0]
                    break
            if date_match:
                break
        if date_match:
            target = date_match
        else:
            target = "2026-04-04.jsonl"
    else:
        target = "2026-04-04.jsonl"
    file_path = f"{base}/{target}"
    print(f"  using: {target}")

    # ── cat the file to see what's in it ──────────────
    print(f"\n=== cat {target} | head -n 3 ===")
    r = await ws.execute(f'cat "{file_path}" | head -n 3')
    print((await r.stdout_str())[:300])

    # ── grep at FILE level (download + grep) ──────────
    print(f"\n=== grep at FILE level: grep content {target} ===")
    r = await ws.execute(f'grep content "{file_path}"')
    lines = (await r.stdout_str()).strip().splitlines() if (
        await r.stdout_str()).strip() else []
    print(f"  matches: {len(lines)}")
    if lines:
        print(f"  first: {lines[0][:120]}...")

    print("\n=== grep -c content "
          "(file, count only) ===")
    r = await ws.execute(f'grep -c content "{file_path}"')
    print(f"  count: {(await r.stdout_str()).strip()}")

    # ── grep at CHANNEL level (Discord search API) ────
    print(f"\n=== grep at CHANNEL level: grep hihi {base}/ ===")
    r = await ws.execute(f'grep hihi "{base}/"')
    print(f"  exit={r.exit_code}")
    out = (await r.stdout_str()).strip()
    if out:
        for line in out.splitlines()[:5]:
            print(f"  {line[:120]}")
    else:
        print("  (no results)")
    if (await r.stderr_str()):
        print(f"  stderr: {await r.stderr_str()}")

    # ── grep at GUILD level (Discord search API) ──────
    print(f"\n=== grep at GUILD level: grep hihi /discord/{guild}/ ===")
    r = await ws.execute(f'grep hihi "/discord/{guild}/"')
    print(f"  exit={r.exit_code}")
    out = (await r.stdout_str()).strip()
    if out:
        for line in out.splitlines()[:5]:
            print(f"  {line[:120]}")
    else:
        print("  (no results)")
    if (await r.stderr_str()):
        print(f"  stderr: {await r.stderr_str()}")

    # ── rg at CHANNEL level ───────────────────────────
    print(f"\n=== rg at CHANNEL level: rg hihi {base}/ ===")
    r = await ws.execute(f'rg hihi "{base}/"')
    print(f"  exit={r.exit_code}")
    out = (await r.stdout_str()).strip()
    if out:
        for line in out.splitlines()[:5]:
            print(f"  {line[:120]}")
    else:
        print("  (no results)")

    # ── jq on a file (JSONL needs .[] to iterate) ───
    print(f"\n=== jq '.[] | .author.username' {target} ===")
    r = await ws.execute(f'jq ".[] | .author.username" "{file_path}"')
    print(f"  exit={r.exit_code}")
    out = (await r.stdout_str()).strip()
    if out:
        for line in out.splitlines()[:5]:
            print(f"  {line}")
    else:
        print("  (no output)")

    print(f"\n=== jq -r '.[] | .content' {target} | head -n 5 ===")
    r = await ws.execute(f'jq -r ".[] | .content" "{file_path}" | head -n 5')
    print(f"  exit={r.exit_code}")
    out = (await r.stdout_str()).strip()
    if out:
        for line in out.splitlines()[:5]:
            print(f"  {line}")

    # ── stat on a file ────────────────────────────────
    print(f"\n=== stat {target} ===")
    r = await ws.execute(f'stat "{file_path}"')
    print(f"  {(await r.stdout_str()).strip()}")

    # ── cat | jq pipeline (JSONL needs .[] to iterate) ──
    print(f"\n=== cat {target} | jq -r '.[] | .author.username'"
          " | sort | uniq -c ===")
    r = await ws.execute(f'cat "{file_path}" | jq -r ".[] | .author.username"'
                         ' | sort | uniq -c')
    print(f"  exit={r.exit_code}")
    out = (await r.stdout_str()).strip()
    if out:
        for line in out.splitlines()[:10]:
            print(f"  {line}")

    # ── wc across levels ─────────────────────────────
    print(f"\n=== wc -l {target} ===")
    r = await ws.execute(f'wc -l "{file_path}"')
    print(f"  {(await r.stdout_str()).strip()}")

    # ── head / tail ──────────────────────────────────
    print(f"\n=== head -n 3 {target} ===")
    r = await ws.execute(f'head -n 3 "{file_path}"')
    out = (await r.stdout_str()).strip()
    if out:
        for line in out.splitlines():
            print(f"  {line[:120]}")

    print(f"\n=== tail -n 2 {target} ===")
    r = await ws.execute(f'tail -n 2 "{file_path}"')
    out = (await r.stdout_str()).strip()
    if out:
        for line in out.splitlines():
            print(f"  {line[:120]}")

    # ── pwd / cd ─────────────────────────────────────
    print("\n=== pwd ===")
    r = await ws.execute("pwd")
    print(f"  {(await r.stdout_str()).strip()}")

    print(f'\n=== cd "/discord/{guild}/channels/{ch}" ===')
    r = await ws.execute(f'cd "/discord/{guild}/channels/{ch}"')
    print(f"  exit={r.exit_code}")

    print("\n=== pwd (after cd) ===")
    r = await ws.execute("pwd")
    print(f"  {(await r.stdout_str()).strip()}")

    print("\n=== ls (relative, in channel dir) ===")
    r = await ws.execute("ls | tail -n 5")
    out = (await r.stdout_str()).strip()
    if out:
        for line in out.splitlines():
            print(f"  {line}")

    print(f"\n=== cat {target} (relative) ===")
    r = await ws.execute(f'cat {target} | head -n 1')
    out = (await r.stdout_str()).strip()
    if out:
        print(f"  {out[:120]}")
    else:
        print("  (empty)")

    # ── cat two dates to compare ─────────────────────
    print("\n=== cat 2026-04-04.jsonl (messages) ===")
    r = await ws.execute(f'cat "{base}/2026-04-04.jsonl"')
    out = (await r.stdout_str()).strip()
    if out:
        for line in out.splitlines():
            print(f"  {line[:120]}")
    else:
        print("  (empty)")

    print("\n=== cat 2026-04-05.jsonl (no messages?) ===")
    r = await ws.execute(f'cat "{base}/2026-04-05.jsonl"')
    out = (await r.stdout_str()).strip()
    if out:
        for line in out.splitlines():
            print(f"  {line[:120]}")
    else:
        print("  (empty)")

    # ── tree ─────────────────────────────────────────
    print(f"\n=== tree -L 1 /discord/{guild}/ ===")
    r = await ws.execute(f'tree -L 1 "/discord/{guild}/"')
    print(f"  exit={r.exit_code}")
    out = (await r.stdout_str()).strip()
    if out:
        for line in out.splitlines():
            print(f"  {line}")

    # ── find ─────────────────────────────────────────
    print(f"\n=== find /discord/{guild}/ -name '*.jsonl'"
          " -maxdepth 3 ===")
    r = await ws.execute(f'find "/discord/{guild}/" -name "*.jsonl"'
                         ' -maxdepth 3 | head -n 10')
    print(f"  exit={r.exit_code}")
    out = (await r.stdout_str()).strip()
    if out:
        for line in out.splitlines():
            print(f"  {line}")

    print("\n=== find /discord/ -name 'general' ===")
    r = await ws.execute('find "/discord/" -name "general"')
    print(f"  exit={r.exit_code}")
    out = (await r.stdout_str()).strip()
    if out:
        for line in out.splitlines():
            print(f"  {line}")

    print(f"\n=== find {base}/ -name '2026-04-04*' ===")
    r = await ws.execute(f'find "{base}/" -name "2026-04-04*"')
    print(f"  exit={r.exit_code}")
    out = (await r.stdout_str()).strip()
    if out:
        for line in out.splitlines():
            print(f"  {line}")

    # ── glob expansion (exercises resolve_glob → readdir) ──
    # Quoted dir + unquoted glob: "/path with spaces/"*.ext
    print(f"\n=== echo {base}/*.jsonl (glob) ===")
    r = await ws.execute(f'echo "{base}/"*.jsonl')
    out = (await r.stdout_str()).strip()
    print(f"  {out[:200]}")

    print(f"\n=== for f in {base}/*.jsonl (glob loop) ===")
    r = await ws.execute(f'for f in "{base}/"*.jsonl; do echo found:$f; done'
                         ' | head -n 3')
    out = (await r.stdout_str()).strip()
    for line in out.splitlines():
        print(f"  {line[:120]}")


if __name__ == "__main__":
    asyncio.run(main())
