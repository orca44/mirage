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

from unittest.mock import AsyncMock, patch

import pytest

from mirage.resource.paperclip import PaperclipConfig, PaperclipResource
from mirage.types import DEFAULT_SESSION_ID, FileType, MountMode
from mirage.workspace import Workspace


@pytest.fixture
def resource():
    config = PaperclipConfig(
        base_url="https://paperclip.gxl.ai",
        credentials_path="/tmp/fake_creds.json",
    )
    with patch(
            "mirage.accessor.paperclip.PaperclipAccessor._load_credentials"):
        prov = PaperclipResource(config)
    prov.accessor.execute = AsyncMock()
    return prov


@pytest.fixture
def ws(resource):
    ws = Workspace(
        {"/paperclip/": resource},
        mode=MountMode.READ,
    )
    ws.get_session(DEFAULT_SESSION_ID).cwd = "/"
    return ws


@pytest.mark.asyncio
async def test_mount_list_root(ws):
    mount = ws._registry.mount_for("/paperclip/")
    result = await mount.execute_op("readdir", "/paperclip/")
    names = [p.rsplit("/", 1)[-1] for p in result]
    assert "biorxiv" in names
    assert "medrxiv" in names
    assert "pmc" in names


@pytest.mark.asyncio
async def test_mount_stat_source(ws):
    mount = ws._registry.mount_for("/paperclip/biorxiv")
    result = await mount.execute_op("stat", "/paperclip/biorxiv")
    assert result.name == "biorxiv"
    assert result.type == FileType.DIRECTORY


@pytest.mark.asyncio
async def test_mount_read_paper_file(ws, resource):
    resource.accessor.execute = AsyncMock(
        return_value={"output": '{"title": "Test Paper"}'})
    mount = ws._registry.mount_for(
        "/paperclip/biorxiv/2024/03/bio_abc/meta.json")
    result = await mount.execute_op(
        "read", "/paperclip/biorxiv/2024/03/bio_abc/meta.json")
    assert isinstance(result, bytes)
    assert b"Test Paper" in result
