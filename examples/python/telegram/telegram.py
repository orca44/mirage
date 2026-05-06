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
from mirage.resource.telegram import TelegramConfig, TelegramResource

load_dotenv(".env.development")

config = TelegramConfig(token=os.environ["TELEGRAM_BOT_TOKEN"])
resource = TelegramResource(config=config)


async def main():
    ws = Workspace({"/telegram": resource}, mode=MountMode.READ)

    print("=== ls /telegram/ (categories) ===")
    r = await ws.execute("ls /telegram/")
    print(await r.stdout_str())

    print("=== ls /telegram/groups/ ===")
    r = await ws.execute("ls /telegram/groups/")
    print(await r.stdout_str())

    groups = (await r.stdout_str()).strip().splitlines()
    if not groups or not groups[0].strip():
        print("no groups found, trying private chats")
        r = await ws.execute("ls /telegram/private/")
        print(await r.stdout_str())
        chats = (await r.stdout_str()).strip().splitlines()
        if not chats or not chats[0].strip():
            print("no chats found")
            return
        chat = chats[0].strip()
        base = f"/telegram/private/{chat}"
    else:
        chat = groups[0].strip()
        base = f"/telegram/groups/{chat}"

    print(f"\n=== ls {base}/ ===")
    r = await ws.execute(f'ls "{base}/"')
    print(await r.stdout_str())

    dates = (await r.stdout_str()).strip().splitlines()
    if dates:
        target = dates[0].strip()
        file_path = f"{base}/{target}"

        print(f"\n=== cat {target} | head -n 5 ===")
        r = await ws.execute(f'cat "{file_path}" | head -n 5')
        print((await r.stdout_str())[:500])

        print(f"\n=== wc -l {target} ===")
        r = await ws.execute(f'wc -l "{file_path}"')
        print(await r.stdout_str())

        print(f'\n=== jq ".from.first_name" {target} | head -n 5 ===')
        r = await ws.execute(f'jq ".from.first_name" "{file_path}" | head -n 5'
                             )
        print(await r.stdout_str())

    print("\n=== tree -L 2 /telegram/ ===")
    r = await ws.execute("tree -L 2 /telegram/")
    print(await r.stdout_str())

    print(f"\n=== stat {base} ===")
    r = await ws.execute(f'stat "{base}"')
    print(await r.stdout_str())

    chat_id = base.rsplit("__", 1)[-1]

    print(f"\n=== telegram-send-message --chat_id {chat_id} ===")
    r = await ws.execute(
        f'telegram-send-message --chat_id {chat_id} --text "Hello from MIRAGE"'
    )
    print((await r.stdout_str())[:500])


if __name__ == "__main__":
    asyncio.run(main())
