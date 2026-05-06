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
from pathlib import Path

from mirage import DiskResource, MountMode, Workspace
from mirage.commands.local_audio.disk import COMMANDS as DISK_AUDIO_COMMANDS
from mirage.commands.local_audio.ram import COMMANDS as RAM_AUDIO_COMMANDS
from mirage.commands.local_audio.utils import configure

REPO_ROOT = Path(__file__).resolve().parents[3]

configure(model_dir=str(REPO_ROOT / "models" / "sherpa-onnx-whisper-base"))

backend = DiskResource(str(REPO_ROOT / "data"))
ws = Workspace({"/": backend}, mode=MountMode.READ)
ws.mount("/").register_fns(DISK_AUDIO_COMMANDS)
ws.cache_mount.register_fns(RAM_AUDIO_COMMANDS)


async def main():
    print("=== stat wav (metadata only, no transcription) ===")
    result = await ws.execute("stat /example.wav")
    print(await result.stdout_str())

    print("\n=== stat mp3 ===")
    result = await ws.execute("stat /example.mp3")
    print(await result.stdout_str())

    print("\n=== stat ogg ===")
    result = await ws.execute("stat /example.ogg")
    print(await result.stdout_str())

    print("\n=== cat wav (full transcription) ===")
    result = await ws.execute("cat /example.wav")
    print(await result.stdout_str())

    print("\n=== head -n 5 wav (first 5 seconds) ===")
    result = await ws.execute("head -n 5 /example.wav")
    print(await result.stdout_str())

    print("\n=== cat mp3 | grep (search transcription) ===")
    result = await ws.execute("cat /example.mp3 | grep the")
    print(f"exit_code={result.exit_code}")
    if (await result.stdout_str()):
        print(await result.stdout_str())


asyncio.run(main())
