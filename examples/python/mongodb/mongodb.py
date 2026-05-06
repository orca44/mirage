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
from mirage.resource.mongodb import MongoDBConfig, MongoDBResource

load_dotenv(".env.development")

config = MongoDBConfig(uri=os.environ["MONGODB_URI"])
resource = MongoDBResource(config=config)


async def _run(ws, cmd):
    print(f"\n>>> {cmd}")
    r = await ws.execute(cmd)
    out = (await r.stdout_str()).strip()
    err = await r.stderr_str()
    if out:
        for line in out.splitlines()[:10]:
            print(f"  {line[:120]}")
        total = len(out.splitlines())
        if total > 10:
            print(f"  ... ({total} lines total)")
    if err:
        print(f"  [stderr] {err.strip()[:120]}")
    if not out and not err:
        print(f"  (empty, exit={r.exit_code})")
    return r


async def main():
    ws = Workspace({"/mongodb": resource}, mode=MountMode.READ)

    await _run(ws, "ls /mongodb/")
    await _run(ws, "ls /mongodb/sample_mflix/")
    await _run(ws, "tree -L 1 /mongodb/")

    fp = "/mongodb/sample_mflix/movies.jsonl"

    await _run(ws, f'head -n 3 "{fp}"')
    await _run(ws, f'tail -n 3 "{fp}"')
    await _run(ws, f'wc -l "{fp}"')
    await _run(ws, f'stat "{fp}"')

    print("\n" + "=" * 60)
    print("GREP at different scopes")
    print("=" * 60)

    await _run(ws, f'grep Godfather "{fp}"')

    await _run(ws, f'grep -c Godfather "{fp}"')

    await _run(ws, 'grep Godfather "/mongodb/sample_mflix/"')

    await _run(ws, 'grep Godfather "/mongodb/"')

    print("\n" + "=" * 60)
    print("RG at database scope")
    print("=" * 60)

    await _run(ws, 'rg Godfather "/mongodb/sample_mflix/"')

    print("\n>>> native search across all dbs:")
    await _run(ws, 'rg Godfather /mongodb/')

    print("\n" + "=" * 60)
    print("JQ at different granularities")
    print("=" * 60)

    await _run(ws, f'jq ".[] | .title" "{fp}" | head -n 5')

    await _run(ws, f'jq -r ".[] | .title" "{fp}" | head -n 5')

    await _run(
        ws,
        f'jq -r ".[] | select(.year > 2000) | .title" "{fp}"'
        " | head -n 5",
    )

    await _run(
        ws,
        f'jq -r ".[] | select(.year > 1990) | .title"'
        f' "{fp}" | head -n 5',
    )

    await _run(
        ws,
        f'jq -r ".[] | ._id"'
        f' "{fp}" | head -n 5',
    )

    await _run(
        ws,
        'jq -r ".[] | .name" '
        '"/mongodb/sample_mflix/users.jsonl" | head -n 5',
    )

    await _run(
        ws,
        'jq -r ".[] | .cuisine" '
        '"/mongodb/sample_restaurants/restaurants.jsonl"'
        " | sort | uniq -c | sort -rn | head -n 10",
    )

    print("\n" + "=" * 60)
    print("FIND and CD")
    print("=" * 60)

    await _run(
        ws,
        'find "/mongodb/sample_mflix/" -name "*.jsonl"',
    )

    await ws.execute('cd "/mongodb/sample_mflix"')
    await _run(ws, "pwd")
    await _run(ws, "ls")


if __name__ == "__main__":
    asyncio.run(main())
