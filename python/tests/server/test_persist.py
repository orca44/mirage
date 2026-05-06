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

import json

import pytest
from httpx import ASGITransport, AsyncClient

from mirage.server import build_app
from mirage.server.persist import restore_all, snapshot_all
from mirage.server.registry import WorkspaceRegistry


def _minimal_config() -> dict:
    return {
        "config": {
            "mounts": {
                "/": {
                    "resource": "ram",
                    "mode": "WRITE"
                }
            },
        },
    }


@pytest.mark.asyncio
async def test_snapshot_all_writes_index_and_tar(tmp_path):
    app = build_app(idle_grace_seconds=10.0)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport,
                           base_url="http://test") as client:
        r1 = await client.post("/v1/workspaces", json=_minimal_config())
        r2 = await client.post("/v1/workspaces", json=_minimal_config())
        wid_a = r1.json()["id"]
        wid_b = r2.json()["id"]

    saved = await snapshot_all(app.state.registry, tmp_path)
    assert saved == 2
    index = json.loads((tmp_path / "index.json").read_text(encoding="utf-8"))
    assert set(index["workspaces"]) == {wid_a, wid_b}
    assert (tmp_path / f"{wid_a}.tar").exists()
    assert (tmp_path / f"{wid_b}.tar").exists()
    await app.state.registry.close_all()


@pytest.mark.asyncio
async def test_snapshot_then_restore_round_trip(tmp_path):
    src_app = build_app(idle_grace_seconds=10.0)
    transport = ASGITransport(app=src_app)
    async with AsyncClient(transport=transport,
                           base_url="http://test") as client:
        r = await client.post("/v1/workspaces",
                              json={
                                  **_minimal_config(), "id": "ws_a"
                              })
        assert r.status_code == 201
        await client.post(
            "/v1/workspaces/ws_a/execute",
            json={"command": "echo persisted > /report.txt"},
        )

    saved = await snapshot_all(src_app.state.registry, tmp_path)
    assert saved == 1
    await src_app.state.registry.close_all()

    fresh_registry = WorkspaceRegistry(idle_grace_seconds=60.0)
    restored, skipped = restore_all(fresh_registry, tmp_path)
    assert restored == 1
    assert skipped == 0
    assert "ws_a" in fresh_registry

    entry = fresh_registry.get("ws_a")
    result = await entry.runner.call(entry.runner.ws.execute("cat /report.txt")
                                     )
    stdout = await result.materialize_stdout()
    assert b"persisted" in stdout
    await fresh_registry.close_all()


def test_restore_with_no_index_returns_zero_zero(tmp_path):
    fresh = WorkspaceRegistry(idle_grace_seconds=60.0)
    restored, skipped = restore_all(fresh, tmp_path)
    assert restored == 0
    assert skipped == 0


@pytest.mark.asyncio
async def test_per_workspace_failure_does_not_kill_restore(tmp_path):
    src_app = build_app(idle_grace_seconds=10.0)
    transport = ASGITransport(app=src_app)
    async with AsyncClient(transport=transport,
                           base_url="http://test") as client:
        await client.post("/v1/workspaces",
                          json={
                              **_minimal_config(), "id": "ws_good"
                          })
        await client.post("/v1/workspaces",
                          json={
                              **_minimal_config(), "id": "ws_bad"
                          })

    await snapshot_all(src_app.state.registry, tmp_path)
    await src_app.state.registry.close_all()

    bad_tar = tmp_path / "ws_bad.tar"
    bad_tar.write_bytes(b"this is not a valid tar archive")

    fresh = WorkspaceRegistry(idle_grace_seconds=60.0)
    restored, skipped = restore_all(fresh, tmp_path)
    assert restored == 1
    assert skipped == 1
    assert "ws_good" in fresh
    assert "ws_bad" not in fresh
    await fresh.close_all()
