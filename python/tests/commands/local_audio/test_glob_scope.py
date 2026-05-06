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

from pathlib import Path

import pytest

from mirage import MountMode, RAMResource, Workspace
from mirage.commands.local_audio.ram import COMMANDS as RAM_COMMANDS

DATA_DIR = Path(__file__).resolve().parents[4] / "data"


def _make_workspace():
    mem = RAMResource()
    with open(DATA_DIR / "example.wav", "rb") as f:
        mem._store.files["/audio/test.wav"] = f.read()
    with open(DATA_DIR / "example.mp3", "rb") as f:
        mem._store.files["/audio/test.mp3"] = f.read()
    with open(DATA_DIR / "example.ogg", "rb") as f:
        mem._store.files["/audio/test.ogg"] = f.read()
    mem._store.dirs.add("/audio")
    ws = Workspace({"/": mem}, mode=MountMode.READ)
    ws.mount("/").register_fns(RAM_COMMANDS)
    return ws


@pytest.mark.asyncio
async def test_stat_wav():
    ws = _make_workspace()
    result = await ws.execute("stat /audio/test.wav")
    assert result.exit_code == 0
    assert "Duration:" in (await result.stdout_str())


@pytest.mark.asyncio
async def test_stat_mp3():
    ws = _make_workspace()
    result = await ws.execute("stat /audio/test.mp3")
    assert result.exit_code == 0
    assert "Duration:" in (await result.stdout_str())


@pytest.mark.asyncio
async def test_stat_ogg():
    ws = _make_workspace()
    result = await ws.execute("stat /audio/test.ogg")
    assert result.exit_code == 0
    assert "Duration:" in (await result.stdout_str())


@pytest.mark.asyncio
async def test_stat_glob_wav():
    ws = _make_workspace()
    result = await ws.execute("stat /audio/*.wav")
    assert result.exit_code == 0
    assert "Duration:" in (await result.stdout_str())


@pytest.mark.asyncio
async def test_stat_glob_all():
    ws = _make_workspace()
    result = await ws.execute("stat /audio/*.mp3")
    assert result.exit_code == 0
    assert "Duration:" in (await result.stdout_str())
