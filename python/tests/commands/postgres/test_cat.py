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

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from mirage.accessor.postgres import PostgresAccessor
from mirage.commands.builtin.postgres.cat import cat
from mirage.resource.postgres.config import PostgresConfig
from mirage.types import PathSpec


@asynccontextmanager
async def _fake_acquire():
    yield MagicMock()


def _accessor() -> PostgresAccessor:
    a = PostgresAccessor(PostgresConfig(dsn="postgres://localhost/db"))
    pool = MagicMock()
    pool.acquire = lambda: _fake_acquire()
    a.pool = AsyncMock(return_value=pool)
    return a


@pytest.mark.asyncio
async def test_cat_surfaces_size_guard_error():
    accessor = _accessor()
    p = PathSpec(original="/public/tables/users/rows.jsonl",
                 directory="/public/tables/users/rows.jsonl",
                 resolved=True)
    with patch("mirage.commands.builtin.postgres.cat.resolve_glob",
               new_callable=AsyncMock, return_value=[p]), \
         patch("mirage.commands.builtin.postgres.cat.postgres_read",
               new_callable=AsyncMock,
               side_effect=ValueError(
                   "users/tables/users/rows.jsonl too large "
                   "to read entirely")):
        result, io = await cat(accessor, [p])
    assert result is None
    assert io.exit_code == 1
    assert b"too large" in io.stderr


@pytest.mark.asyncio
async def test_cat_small_table_returns_data():
    accessor = _accessor()
    p = PathSpec(original="/public/tables/users/rows.jsonl",
                 directory="/public/tables/users/rows.jsonl",
                 resolved=True)
    fake_data = b'{"id":1}\n{"id":2}\n'
    with patch("mirage.commands.builtin.postgres.cat.resolve_glob",
               new_callable=AsyncMock, return_value=[p]), \
         patch("mirage.commands.builtin.postgres.cat.postgres_read",
               new_callable=AsyncMock, return_value=fake_data):
        result, io = await cat(accessor, [p])
    assert result == fake_data
    assert io.exit_code == 0 or io.exit_code is None
