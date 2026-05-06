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

from mirage.accessor.gdrive import GDriveAccessor
from mirage.cache.index.ram import RAMIndexCacheStore
from mirage.commands.builtin.gdrive.rg import rg
from mirage.core.google._client import TokenManager
from mirage.core.google.config import GoogleConfig
from mirage.io.stream import materialize
from mirage.types import FileStat, FileType, PathSpec


@pytest.fixture
def config():
    return GoogleConfig(
        client_id="test-id",
        client_secret="test-secret",
        refresh_token="test-refresh",
    )


@pytest.fixture
def token_manager(config):
    mgr = TokenManager(config)
    mgr._access_token = "fake-token"
    mgr._expires_at = 9999999999
    return mgr


@pytest.fixture
def accessor(config, token_manager):
    return GDriveAccessor(config=config, token_manager=token_manager)


@pytest.fixture
def index():
    return RAMIndexCacheStore()


def _scope(path: str, prefix: str = "") -> PathSpec:
    return PathSpec(original=path,
                    directory=path.rsplit("/", 1)[0] or "/",
                    prefix=prefix)


@pytest.mark.asyncio
async def test_rg_single_file(accessor, index):
    stat_result = FileStat(
        name="file.txt",
        type=FileType.TEXT,
        size=100,
    )
    with (
            patch(
                "mirage.commands.builtin.gdrive.rg._stat",
                new_callable=AsyncMock,
                return_value=stat_result,
            ),
            patch(
                "mirage.commands.builtin.gdrive.rg.gdrive_read",
                new_callable=AsyncMock,
                return_value=b"alpha\nbeta\ngamma\n",
            ),
    ):
        result, io = await rg(
            accessor,
            [_scope("/test/file.txt")],
            "beta",
            index=index,
        )
        data = await materialize(result)
        assert b"beta" in data
        assert io.exit_code == 0


@pytest.mark.asyncio
async def test_rg_no_match(accessor, index):
    stat_result = FileStat(
        name="file.txt",
        type=FileType.TEXT,
        size=100,
    )
    with (
            patch(
                "mirage.commands.builtin.gdrive.rg._stat",
                new_callable=AsyncMock,
                return_value=stat_result,
            ),
            patch(
                "mirage.commands.builtin.gdrive.rg.gdrive_read",
                new_callable=AsyncMock,
                return_value=b"alpha\nbeta\ngamma\n",
            ),
    ):
        result, io = await rg(
            accessor,
            [_scope("/test/file.txt")],
            "nonexistent",
            index=index,
        )
        await materialize(result)
        assert io.exit_code == 1
