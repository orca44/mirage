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

import base64
from unittest.mock import AsyncMock, MagicMock

import pytest

from mirage.agents.openai_agents.runner import MirageRunner
from mirage.types import FileStat, FileType


def _stat(file_type: FileType) -> FileStat:
    return FileStat(name="x", type=file_type)


@pytest.fixture
def ws():
    workspace = MagicMock()
    workspace.ops = MagicMock()
    workspace.ops.stat = AsyncMock()
    workspace.ops.read = AsyncMock()
    return workspace


@pytest.mark.asyncio
async def test_build_blocks_image_inlines_base64(ws):
    ws.ops.stat.return_value = _stat(FileType.IMAGE_PNG)
    ws.ops.read.return_value = b"\x89PNG\r\n\x1a\n"
    runner = MirageRunner(ws)
    blocks = await runner.build_blocks("hi", ["/img.png"])
    assert blocks[0] == {"type": "input_text", "text": "hi"}
    assert blocks[1]["type"] == "input_image"
    expected_b64 = base64.b64encode(b"\x89PNG\r\n\x1a\n").decode()
    assert blocks[1]["image_url"] == f"data:image/png;base64,{expected_b64}"


@pytest.mark.asyncio
async def test_build_blocks_pdf_uploads_to_files_api(ws):
    ws.ops.stat.return_value = _stat(FileType.PDF)
    ws.ops.read.return_value = b"%PDF-1.4 ..."
    fake_client = MagicMock()
    fake_client.files = MagicMock()
    fake_client.files.create = AsyncMock(return_value=MagicMock(id="file-abc"))
    runner = MirageRunner(ws, client=fake_client)
    blocks = await runner.build_blocks("read", ["/doc.pdf"])
    assert blocks[1] == {"type": "input_file", "file_id": "file-abc"}
    fake_client.files.create.assert_awaited_once()
    args, kwargs = fake_client.files.create.call_args
    assert kwargs["purpose"] == "user_data"
    fname, fdata = kwargs["file"]
    assert fname == "doc.pdf"
    assert fdata == b"%PDF-1.4 ..."


@pytest.mark.asyncio
async def test_build_blocks_text_decoded_inline(ws):
    ws.ops.stat.return_value = _stat(FileType.TEXT)
    ws.ops.read.return_value = b"hello world"
    runner = MirageRunner(ws)
    blocks = await runner.build_blocks("look", ["/notes.txt"])
    assert blocks[1] == {"type": "input_text", "text": "hello world"}


@pytest.mark.asyncio
async def test_build_blocks_jpeg(ws):
    ws.ops.stat.return_value = _stat(FileType.IMAGE_JPEG)
    ws.ops.read.return_value = b"\xff\xd8\xff..."
    runner = MirageRunner(ws)
    blocks = await runner.build_blocks("see", ["/photo.jpg"])
    assert blocks[1]["type"] == "input_image"
    assert blocks[1]["image_url"].startswith("data:image/jpeg;base64,")


@pytest.mark.asyncio
async def test_build_blocks_multiple_paths_in_order(ws):
    types = [FileType.TEXT, FileType.IMAGE_PNG]
    bytes_seq = [b"first", b"\x89PNG\r\n\x1a\n"]

    async def fake_stat(p):
        return _stat(types.pop(0))

    async def fake_read(p):
        return bytes_seq.pop(0)

    ws.ops.stat.side_effect = fake_stat
    ws.ops.read.side_effect = fake_read
    runner = MirageRunner(ws)
    blocks = await runner.build_blocks("two", ["/a.txt", "/b.png"])
    assert len(blocks) == 3
    assert blocks[1] == {"type": "input_text", "text": "first"}
    assert blocks[2]["type"] == "input_image"
