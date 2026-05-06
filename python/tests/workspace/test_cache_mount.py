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

from mirage.commands.local_audio.disk import COMMANDS as DISK_AUDIO_COMMANDS
from mirage.commands.local_audio.ram import COMMANDS as RAM_AUDIO_COMMANDS
from mirage.commands.registry import command
from mirage.commands.spec import CommandSpec, Operand, OperandKind
from mirage.io.types import IOResult
from mirage.ops.registry import op
from mirage.resource.disk import DiskResource
from mirage.resource.ram import RAMResource
from mirage.types import MountMode, PathSpec
from mirage.workspace import Workspace
from mirage.workspace.mount import Mount

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / "data"

ECHO_SPEC = CommandSpec(positional=(Operand(kind=OperandKind.PATH), ))


@command("echopath", resource="ram", spec=ECHO_SPEC)
async def echopath(
    accessor,
    paths: list[PathSpec],
    *texts: str,
    stdin=None,
    **_extra: object,
) -> tuple[bytes | None, IOResult]:
    if not paths:
        return None, IOResult(exit_code=1,
                              stderr=b"echopath: missing operand\n")
    return f"echopath:{paths[0].original}".encode(), IOResult()


@op("hello_op", resource="ram")
async def hello_op(accessor, path, *args, **kwargs) -> str:
    return f"hello:{path}"


def test_cache_mount_is_default_mount():
    ws = Workspace({"/data/": RAMResource()}, mode=MountMode.WRITE)
    assert isinstance(ws.cache_mount, Mount)
    assert ws.cache_mount is ws._registry.default_mount
    assert ws.cache_mount.prefix == "/_default/"


def test_cache_mount_resource_is_cache():
    ws = Workspace({"/data/": RAMResource()}, mode=MountMode.WRITE)
    assert ws.cache_mount.resource is ws.cache


def test_cache_mount_register_command():
    ws = Workspace({"/data/": RAMResource()}, mode=MountMode.WRITE)
    ws.cache_mount.register_fns([echopath])
    cmd = ws.cache_mount.resolve_command("echopath")
    assert cmd is not None
    assert cmd.fn is echopath


def test_cache_mount_register_op():
    ws = Workspace({"/data/": RAMResource()}, mode=MountMode.WRITE)
    ws.cache_mount.register_fns([hello_op])
    assert ("hello_op", None) in ws.cache_mount._ops


def test_cache_mount_rejects_wrong_resource_kind():
    ws = Workspace({"/data/": RAMResource()}, mode=MountMode.WRITE)

    @command("disk_only", resource="disk", spec=ECHO_SPEC)
    async def disk_only(accessor, paths, *texts, stdin=None, **_extra):
        return None, IOResult()

    with pytest.raises(ValueError, match="ram"):
        ws.cache_mount.register_fns([disk_only])


@pytest.mark.asyncio
async def test_audio_stat_after_cache_promotion():
    """After the first stat caches the bytes, the dispatcher reroutes the
    second stat to cache_mount. Without RAM_AUDIO_COMMANDS registered there,
    the second stat would fall through to built-in stat and lose the audio
    metadata output."""
    if not (DATA_DIR / "example.wav").exists():
        pytest.skip("example.wav fixture not present")
    disk = DiskResource(root=str(DATA_DIR))
    disk.is_remote = True
    ws = Workspace({"/": disk}, mode=MountMode.READ)
    ws.mount("/").register_fns(DISK_AUDIO_COMMANDS)
    ws.cache_mount.register_fns(RAM_AUDIO_COMMANDS)

    first = await ws.execute("stat /example.wav")
    second = await ws.execute("stat /example.wav")
    first_text = (await first.stdout_str())
    second_text = (await second.stdout_str())
    assert "Sample rate:" in first_text
    assert "Sample rate:" in second_text, (
        "second stat after cache promotion lost audio handler "
        "(cache_mount missing RAM_AUDIO_COMMANDS?)")


@pytest.mark.asyncio
async def test_audio_stat_after_cache_promotion_without_fix_falls_through():
    """Sanity check: without registering on cache_mount, the second stat
    routes to built-in RAM stat (not the audio variant). This guards the
    regression — if dispatch ever stops promoting to cache, this test
    flips and the test above becomes redundant."""
    if not (DATA_DIR / "example.wav").exists():
        pytest.skip("example.wav fixture not present")
    disk = DiskResource(root=str(DATA_DIR))
    disk.is_remote = True
    ws = Workspace({"/": disk}, mode=MountMode.READ)
    ws.mount("/").register_fns(DISK_AUDIO_COMMANDS)
    # Intentionally NOT calling ws.cache_mount.register_fns(...)

    await ws.execute("stat /example.wav")
    second = await ws.execute("stat /example.wav")
    second_text = (await second.stdout_str())
    assert "Sample rate:" not in second_text


def test_set_default_mount_auto_registers_resource_ops():
    """Symmetry fix: set_default_mount() now mirrors mount() and pulls in
    resource.ops_list() the same way."""
    res = RAMResource()
    ws = Workspace({"/data/": res}, mode=MountMode.WRITE)
    user_op_keys = set(ws.mount("/data/")._ops.keys())
    cache_op_keys = set(ws.cache_mount._ops.keys())
    cache_resource_op_names = {
        ro.name
        for ro in ws.cache_mount.resource.ops_list()
    }
    for name in cache_resource_op_names:
        assert (name,
                None) in cache_op_keys, f"{name!r} missing on cache mount"
    assert user_op_keys.issubset(cache_op_keys) or len(user_op_keys) == 0
