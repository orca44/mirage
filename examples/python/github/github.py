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
from mirage.resource.github import GitHubConfig, GitHubResource

load_dotenv(".env.development")

config = GitHubConfig(token=os.environ["GITHUB_TOKEN"])


async def main() -> None:
    resource = GitHubResource(
        config=config,
        owner="strukto-ai",
        repo="mirage-internal",
        ref="main",
    )
    ws = Workspace({"/github": resource}, mode=MountMode.READ)

    r = await ws.execute("ls /github")
    print(await r.stdout_str())

    r = await ws.execute("ls /github/python/mirage/core")
    print(await r.stdout_str())

    r = await ws.execute("cat /github/python/pyproject.toml")
    print(await r.stdout_str())

    r = await ws.execute(
        "grep 'BaseResource' /github/python/mirage/resource/base.py")
    print(await r.stdout_str())

    r = await ws.execute("grep 'import' /github/python/mirage/*")
    print(await r.stdout_str())

    r = await ws.execute("grep 'import' /github/python/mirage/core/s3/*.py")
    print(await r.stdout_str())

    r = await ws.execute("grep -r 'async def' /github/python/mirage/core/s3/")
    print(await r.stdout_str())

    r = await ws.execute("find /github/mirage -name '*.py'")
    print(await r.stdout_str())

    r = await ws.execute("stat /github/python/mirage/types.py")
    print(await r.stdout_str())

    r = await ws.execute("du /github/python/mirage/core")
    print(await r.stdout_str())

    print("=== head -n 5 ===")
    r = await ws.execute("head -n 5 /github/python/pyproject.toml")
    print(await r.stdout_str())

    print("=== tail -n 3 ===")
    r = await ws.execute("tail -n 3 /github/python/pyproject.toml")
    print(await r.stdout_str())

    print("=== wc ===")
    r = await ws.execute("wc /github/python/pyproject.toml")
    print(await r.stdout_str())

    print("=== wc -l ===")
    r = await ws.execute("wc -l /github/python/pyproject.toml")
    print(await r.stdout_str())

    print("=== grep -n (line numbers) ===")
    r = await ws.execute("grep -n 'def ' /github/python/mirage/types.py")
    print(await r.stdout_str())

    print("=== grep -c (count) ===")
    r = await ws.execute("grep -c 'import' /github/python/mirage/types.py")
    print(await r.stdout_str())

    print("=== grep -i (case insensitive) ===")
    r = await ws.execute("grep -i 'filestat' /github/python/mirage/types.py")
    print(await r.stdout_str())

    print("=== grep -l (files with matches) ===")
    r = await ws.execute(
        "grep -rl 'BaseResource' /github/python/mirage/resource/")
    print(await r.stdout_str())

    # ── native search dispatch (GitHub code search narrows files) ──
    s3_dir = "/github/python/mirage/core/s3/"
    for label, cmd in [
        (f"grep -r mirage {s3_dir} (narrows via search.code)",
         f"grep -r mirage {s3_dir}"),
        (f"grep -r FileType {s3_dir} (recursive scope)",
         f"grep -r FileType {s3_dir}"),
        (f"rg mirage {s3_dir} (rg recursive scope)", f"rg mirage {s3_dir}"),
    ]:
        print(f"\n=== {label} ===")
        r = await ws.execute(cmd)
        out = (await r.stdout_str()).strip()
        err = (await r.stderr_str()).strip()
        lines = out.splitlines() if out else []
        print(f"  exit={r.exit_code} matches: {len(lines)}")
        if err:
            print(f"  stderr: {err[:200]}")
        for line in lines[:3]:
            print(f"  {line[:150]}")

    print("=== find -type d ===")
    r = await ws.execute("find /github/python/mirage/core -type d")
    print(await r.stdout_str())

    print("=== ls -l ===")
    r = await ws.execute("ls -l /github/python/mirage/core/s3/")
    print(await r.stdout_str())

    print("=== find | sort ===")
    r = await ws.execute(
        "find /github/python/mirage/core/s3 -name '*.py' | sort")
    print(await r.stdout_str())

    print("=== diff ===")
    r = await ws.execute("diff /github/python/mirage/core/s3/stat.py"
                         " /github/python/mirage/core/s3/read.py")
    print(await r.stdout_str())

    print("=== cat + pipe to wc ===")
    r = await ws.execute("cat /github/python/mirage/types.py | wc -l")
    print(await r.stdout_str())

    print("=== grep + cut ===")
    r = await ws.execute(
        "grep -n 'class ' /github/python/mirage/types.py | cut -d: -f1")
    print(await r.stdout_str())

    print("=== grep + awk ===")
    r = await ws.execute(
        "grep 'class ' /github/python/mirage/types.py | awk '{print $2}'")
    print(await r.stdout_str())

    print("=== md5 ===")
    r = await ws.execute("md5 /github/python/mirage/types.py")
    print(await r.stdout_str())

    print("=== tree ===")
    r = await ws.execute("tree /github/python/mirage/core/s3/")
    print(await r.stdout_str())

    print("=== find workspace.py ===")
    r = await ws.execute("find /github -name 'workspace.py'")
    print(await r.stdout_str())

    print("=== wc -l (lines) ===")
    r = await ws.execute("wc -l /github/python/mirage/workspace/workspace.py")
    print(await r.stdout_str())

    print("=== wc -w (words) ===")
    r = await ws.execute("wc -w /github/python/mirage/workspace/workspace.py")
    print(await r.stdout_str())

    print("=== jq ===")
    r = await ws.execute('jq ".name" /github/python/pyproject.toml')
    print(await r.stdout_str())

    print("=== nl ===")
    r = await ws.execute("nl /github/python/mirage/types.py")
    print(await r.stdout_str())

    print("=== tr ===")
    r = await ws.execute("cat /github/python/mirage/types.py | tr 'a-z' 'A-Z'")
    print(await r.stdout_str())

    print("=== sort | uniq ===")
    r = await ws.execute(
        "grep 'import' /github/python/mirage/types.py | sort | uniq")
    print(await r.stdout_str())

    print("=== sha256sum ===")
    r = await ws.execute("sha256sum /github/python/mirage/types.py")
    print(await r.stdout_str())

    print("=== file ===")
    r = await ws.execute("file /github/python/mirage/types.py")
    print(await r.stdout_str())

    print("=== basename ===")
    r = await ws.execute("basename /github/python/mirage/core/s3/read.py")
    print(await r.stdout_str())

    print("=== dirname ===")
    r = await ws.execute("dirname /github/python/mirage/core/s3/read.py")
    print(await r.stdout_str())

    print("=== tree -L ===")
    r = await ws.execute("tree -L 2 /github/python/mirage/")
    print(await r.stdout_str())

    print("=== rg ===")
    r = await ws.execute("rg 'BaseResource' /github/python/mirage/resource/")
    print(await r.stdout_str())


if __name__ == "__main__":
    asyncio.run(main())
