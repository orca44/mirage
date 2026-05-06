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
from pathlib import Path

from dotenv import load_dotenv

from mirage import MountMode, Workspace
from mirage.commands.local_audio.s3 import COMMANDS as S3_AUDIO_COMMANDS
from mirage.commands.local_audio.utils import configure
from mirage.resource.s3 import S3Config, S3Resource

load_dotenv(".env.development")
REPO_ROOT = Path(__file__).resolve().parents[3]

configure(model_dir=str(REPO_ROOT / "models" / "sherpa-onnx-whisper-base"))

config = S3Config(
    bucket=os.environ["AWS_S3_BUCKET"],
    region=os.environ.get("AWS_DEFAULT_REGION", "us-east-1"),
    aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
)

backend = S3Resource(config)
ws = Workspace({"/s3/": backend}, mode=MountMode.READ)
ws.mount("/s3/").register_fns(S3_AUDIO_COMMANDS)

WAV = "/s3/data/example.wav"
MP3 = "/s3/data/example.mp3"
OGG = "/s3/data/example.ogg"


def ops_summary() -> str:
    records = ws.ops.records
    total = sum(r.bytes for r in records)
    return f"{len(records)} ops, {total} bytes transferred"


async def main():
    print("=== PLAN: estimate network cost ===\n")

    for label, path in [("wav", WAV), ("mp3", MP3), ("ogg", OGG)]:
        for cmd in [
                f"stat {path}", f"cat {path}", f"head -n 3 {path}",
                f"tail -n 3 {path}", f"grep the {path}"
        ]:
            dr = await ws.execute(cmd, provision=True)
            net = dr.network_read
            print(f"  {cmd.split()[0]:5s} {label}: net={net}, "
                  f"ops={dr.read_ops}, {dr.precision}")
        print()

    print(f"Stats after plans (should be 0): {ops_summary()}\n")

    print("=== STAT: metadata only (128KB range read) ===\n")

    for label, path in [("wav", WAV), ("mp3", MP3), ("ogg", OGG)]:
        print(f"--- stat {label} ---")
        result = await ws.execute(f"stat {path}")
        print(await result.stdout_str())

    print(f"\nStats after stat: {ops_summary()}\n")

    print("=== CAT: full transcription ===\n")

    print("--- cat wav ---")
    result = await ws.execute(f"cat {WAV}")
    print(await result.stdout_str())

    print(f"Stats after cat: {ops_summary()}\n")

    print("=== HEAD: first 3 seconds ===\n")

    print("--- head -n 3 wav ---")
    result = await ws.execute(f"head -n 3 {WAV}")
    print(await result.stdout_str())

    print(f"Stats after head: {ops_summary()}\n")

    print("=== TAIL: last 3 seconds ===\n")

    print("--- tail -n 3 wav ---")
    result = await ws.execute(f"tail -n 3 {WAV}")
    print(await result.stdout_str())

    print(f"Stats after tail: {ops_summary()}\n")

    print("=== GREP: search transcription ===\n")

    print("--- grep nightfall wav ---")
    result = await ws.execute(f"grep nightfall {WAV}")
    print(f"exit_code={result.exit_code}")
    if (await result.stdout_str()):
        print(await result.stdout_str())

    print(f"\nStats after grep: {ops_summary()}\n")

    print("=== GREP: no match ===\n")

    print("--- grep nonexistent wav ---")
    result = await ws.execute(f"grep nonexistent {WAV}")
    print(f"exit_code={result.exit_code}")

    print(f"\nFinal stats: {ops_summary()}")

    print("\n=== SESSION: cd + commands ===\n")

    await ws.execute("cd /s3/data")
    result = await ws.execute("stat example.wav")
    print(f"  stat via cd:\n{await result.stdout_str()}")

    print("=== MOUNT INTROSPECTION ===\n")

    m = ws.mount("/s3/")
    cmds = m.commands()
    audio_cmds = {
        k: v
        for k, v in cmds.items()
        if any(ft in (v or []) for ft in [".wav", ".mp3", ".ogg"])
    }
    print("Audio-capable commands:")
    for name, filetypes in sorted(audio_cmds.items()):
        print(f"  {name}: {filetypes}")

    print(f"\nTotal commands: {len(cmds)}")
    print(f"Total ops: {len(m.registered_ops())}")

    print("\n=== UNREGISTER DEMO ===\n")

    print("--- ls before unregister ---")
    result = await ws.execute("ls /s3/data/")
    print((await result.stdout_str())[:200])

    m.unregister(["ls"])
    print("--- ls after unregister ---")
    result = await ws.execute("ls /s3/data/")
    print(f"exit_code={result.exit_code}")
    if result.stderr:
        print(f"stderr: {result.stderr.decode()[:100]}")


asyncio.run(main())
