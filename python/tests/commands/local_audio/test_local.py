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

from mirage.commands.local_audio.disk import COMMANDS
from mirage.resource.disk.disk import DiskResource
from mirage.types import MountMode
from mirage.workspace import Workspace

DATA_DIR = str(Path(__file__).resolve().parents[4] / "data")


def _make_workspace():
    backend = DiskResource(DATA_DIR)
    ws = Workspace({"/": backend}, mode=MountMode.READ)
    ws.mount("/").register_fns(COMMANDS)
    return ws


@pytest.mark.asyncio
async def test_stat_wav():
    ws = _make_workspace()
    result = await ws.execute("stat /example.wav")
    text = await result.stdout_str()
    assert "Duration:" in text
    assert "Sample rate:" in text


@pytest.mark.asyncio
async def test_stat_mp3():
    ws = _make_workspace()
    result = await ws.execute("stat /example.mp3")
    text = await result.stdout_str()
    assert "Duration:" in text
    assert "Sample rate:" in text


@pytest.mark.asyncio
async def test_stat_ogg():
    ws = _make_workspace()
    result = await ws.execute("stat /example.ogg")
    text = await result.stdout_str()
    assert "Duration:" in text
    assert "Sample rate:" in text


@pytest.mark.asyncio
async def test_stat_wav_has_channels():
    ws = _make_workspace()
    result = await ws.execute("stat /example.wav")
    text = await result.stdout_str()
    assert "Channels:" in text


@pytest.mark.asyncio
async def test_stat_wav_has_file_size():
    ws = _make_workspace()
    result = await ws.execute("stat /example.wav")
    text = await result.stdout_str()
    assert "File size:" in text


@pytest.mark.asyncio
async def test_stat_wav_has_bitrate():
    ws = _make_workspace()
    result = await ws.execute("stat /example.wav")
    text = await result.stdout_str()
    assert "Bitrate:" in text
