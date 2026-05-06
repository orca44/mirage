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

from mirage import MountMode, Workspace
from mirage.resource.ssh import SSHConfig, SSHResource

# ~/.ssh/config:
#   Host dev
#       HostName ec2-18-224-181-224.us-east-2.compute.amazonaws.com
#       IdentityFile ~/.ssh/dev.pem
#       User ubuntu
#       Port 22

config = SSHConfig(
    host="dev",
    root="/home/ubuntu/mirage-test",
    known_hosts=None,
)

resource = SSHResource(config)


async def main() -> None:
    ws = Workspace({"/ssh/": resource}, mode=MountMode.WRITE)

    print("=== ls /ssh/ ===")
    result = await ws.execute("ls /ssh/")
    print(await result.stdout_str())

    print("=== stat /ssh/ ===")
    result = await ws.execute("stat /ssh/")
    print(await result.stdout_str())

    print("=== tree /ssh/ ===")
    result = await ws.execute("tree /ssh/")
    print(await result.stdout_str())

    print("=== find /ssh/ ===")
    result = await ws.execute("find /ssh/")
    print(await result.stdout_str())

    print("=== du /ssh/ ===")
    result = await ws.execute("du /ssh/")
    print(await result.stdout_str())

    print("=== cat /ssh/readme.txt ===")
    result = await ws.execute("cat /ssh/readme.txt")
    print(await result.stdout_str())

    print("=== head -n 1 /ssh/data.txt ===")
    result = await ws.execute("head -n 1 /ssh/data.txt")
    print(await result.stdout_str())

    print("=== wc /ssh/readme.txt ===")
    result = await ws.execute("wc /ssh/readme.txt")
    print(await result.stdout_str())

    print("=== grep hello /ssh/readme.txt ===")
    result = await ws.execute("grep hello /ssh/readme.txt")
    print(await result.stdout_str())

    print("=== cd /ssh/ && ls ===")
    await ws.execute("cd /ssh/")
    result = await ws.execute("ls")
    print(await result.stdout_str())

    print("=== pwd ===")
    result = await ws.execute("pwd")
    print(await result.stdout_str())

    print("=== cd /ssh/docs && cat guide.txt ===")
    await ws.execute("cd /ssh/docs")
    result = await ws.execute("cat guide.txt")
    print(await result.stdout_str())

    print("=== cd .. && ls ===")
    await ws.execute("cd ..")
    result = await ws.execute("ls")
    print(await result.stdout_str())

    print("=== echo hello > /ssh/test.txt ===")
    await ws.execute("echo hello > /ssh/test.txt")

    print("=== cat /ssh/test.txt ===")
    result = await ws.execute("cat /ssh/test.txt")
    print(await result.stdout_str())

    print("=== cp /ssh/test.txt /ssh/test2.txt ===")
    await ws.execute("cp /ssh/test.txt /ssh/test2.txt")
    result = await ws.execute("ls /ssh/")
    print(await result.stdout_str())

    print("=== mv /ssh/test2.txt /ssh/renamed.txt ===")
    await ws.execute("mv /ssh/test2.txt /ssh/renamed.txt")
    result = await ws.execute("ls /ssh/")
    print(await result.stdout_str())

    print("=== mkdir /ssh/subdir ===")
    await ws.execute("mkdir /ssh/subdir")

    print("=== echo world > /ssh/subdir/nested.txt ===")
    await ws.execute("echo world > /ssh/subdir/nested.txt")

    print("=== tree /ssh/ ===")
    result = await ws.execute("tree /ssh/")
    print(await result.stdout_str())

    print("=== rm /ssh/renamed.txt ===")
    await ws.execute("rm /ssh/renamed.txt")

    print("=== rm -r /ssh/subdir ===")
    await ws.execute("rm -r /ssh/subdir")

    print("=== rm /ssh/test.txt ===")
    await ws.execute("rm /ssh/test.txt")

    print("=== final ls /ssh/ ===")
    result = await ws.execute("ls /ssh/")
    print(await result.stdout_str())

    await resource.accessor.close()


if __name__ == "__main__":
    asyncio.run(main())
