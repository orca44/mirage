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
from mirage.resource.gmail import GmailConfig, GmailResource

load_dotenv(".env.development")

config = GmailConfig(
    client_id=os.environ["GOOGLE_CLIENT_ID"],
    client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
    refresh_token=os.environ["GOOGLE_REFRESH_TOKEN"],
)
resource = GmailResource(config=config)


async def show(ws, cmd):
    print(f"\n$ {cmd}")
    r = await ws.execute(cmd)
    out = await r.stdout_str()
    err = await r.stderr_str()
    if out:
        print(f"STDOUT:\n{out}")
    if err:
        print(f"STDERR:\n{err}")
    print(f"exit={r.exit_code}")
    return out, err, r.exit_code


async def main():
    ws = Workspace({"/gmail": resource}, mode=MountMode.READ)

    await show(ws, "ls /gmail/INBOX/ | head -5")

    await show(ws, "ls /gmail/INBOX/2026-04-27")

    out, _, _ = await show(ws, "ls /gmail/INBOX/2026-04-27 | head -1")
    folder = out.strip().split("\n")[0]
    assert not folder.endswith(".gmail.json"), (
        f"date dir should list folders, got file: {folder}")

    await show(ws, f"ls /gmail/INBOX/2026-04-27/{folder}")

    await show(
        ws, f"cat /gmail/INBOX/2026-04-27/{folder}/email.gmail.json "
        "| jq '{subject, from: .from.email, "
        "attachments: [.attachments[].filename]}'")

    nested = ('for d in 2026-04-27 2026-04-28 2026-04-29; do '
              'for folder in $(ls /gmail/INBOX/$d | head -2); do '
              'cat "/gmail/INBOX/$d/$folder/email.gmail.json" '
              "| jq -r '.subject'; "
              'done; done')
    await show(ws, nested)

    # Find a message with attachments and exercise the attachment path.
    print("\n=== finding a message with attachments ===")
    for d in [
            "2026-04-17", "2026-04-19", "2026-04-20", "2026-04-21",
            "2026-04-22", "2026-04-27", "2026-04-28", "2026-04-29",
            "2026-04-30", "2026-05-01"
    ]:
        r = await ws.execute(f"ls /gmail/INBOX/{d}")
        for folder in (await r.stdout_str()).strip().split("\n"):
            if not folder:
                continue
            r2 = await ws.execute(f"ls /gmail/INBOX/{d}/{folder}")
            entries = (await r2.stdout_str()).strip().split("\n")
            if "attachments" in entries:
                print(f"FOUND: /gmail/INBOX/{d}/{folder}")
                await show(ws, f"ls /gmail/INBOX/{d}/{folder}/attachments")
                await show(
                    ws, f"cat /gmail/INBOX/{d}/{folder}/email.gmail.json "
                    "| jq '.attachments'")
                return
    print("(no attachments found in scanned dates)")


if __name__ == "__main__":
    asyncio.run(main())
