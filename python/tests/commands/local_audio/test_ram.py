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
from mirage.commands.local_audio.ram import COMMANDS

DATA_DIR = Path(__file__).resolve().parents[4] / "data"


def _make_workspace():
    mem = RAMResource()
    with open(DATA_DIR / "example.wav", "rb") as f:
        mem._store.files["/test.wav"] = f.read()
    ws = Workspace({"/": mem}, mode=MountMode.READ)
    ws.mount("/").register_fns(COMMANDS)
    return ws


@pytest.mark.asyncio
async def test_stat_wav_memory():
    ws = _make_workspace()
    result = await ws.execute("stat /test.wav")
    text = await result.stdout_str()
    assert "Duration:" in text
    assert "Sample rate:" in text
