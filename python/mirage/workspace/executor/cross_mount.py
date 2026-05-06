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

import re

from mirage.io import IOResult
from mirage.io.types import ByteSource
from mirage.types import PathSpec
from mirage.workspace.types import ExecutionNode

_CROSS_COMMANDS = frozenset({"cp", "mv", "diff", "cmp"})
_MULTI_READ_COMMANDS = frozenset({"cat", "head", "tail", "wc", "grep", "rg"})


def is_cross_mount(cmd_name: str, scopes: list[PathSpec], registry) -> bool:
    allowed = _CROSS_COMMANDS | _MULTI_READ_COMMANDS
    if cmd_name not in allowed or len(scopes) < 2:
        return False
    mounts = set()
    for s in scopes:
        try:
            mounts.add(registry.mount_for(s.original).prefix)
        except ValueError:
            pass
    return len(mounts) > 1


async def handle_cross_mount(
    cmd_name: str,
    scopes: list[PathSpec],
    text_args: list[str],
    dispatch,
    cmd_str: str,
) -> tuple[ByteSource | None, IOResult, ExecutionNode]:
    """Handle commands that span multiple mounts."""
    try:
        if cmd_name == "cp":
            return await _cross_cp(scopes, dispatch, cmd_str)
        if cmd_name == "mv":
            return await _cross_mv(scopes, dispatch, cmd_str)
        if cmd_name == "diff":
            return await _cross_diff(scopes, dispatch, cmd_str)
        if cmd_name == "cmp":
            return await _cross_cmp(scopes, dispatch, cmd_str)
        if cmd_name in _MULTI_READ_COMMANDS:
            return await _cross_multi_read(cmd_name, scopes, text_args,
                                           dispatch, cmd_str)
    except (FileNotFoundError, PermissionError) as exc:
        err = f"{cmd_name}: {exc}\n".encode()
        return None, IOResult(exit_code=1,
                              stderr=err), ExecutionNode(command=cmd_str,
                                                         exit_code=1,
                                                         stderr=err)

    err = f"{cmd_name}: cross-mount not supported\n".encode()
    return None, IOResult(exit_code=1,
                          stderr=err), ExecutionNode(command=cmd_str,
                                                     exit_code=1)


async def _cross_cp(scopes, dispatch, cmd_str):
    src, dst = scopes[0], scopes[1]
    data, _ = await dispatch("read", src)
    await dispatch("write", dst, data=data)
    return None, IOResult(), ExecutionNode(command=cmd_str, exit_code=0)


async def _cross_mv(scopes, dispatch, cmd_str):
    src, dst = scopes[0], scopes[1]
    data, _ = await dispatch("read", src)
    await dispatch("write", dst, data=data)
    await dispatch("unlink", src)
    return None, IOResult(), ExecutionNode(command=cmd_str, exit_code=0)


async def _cross_diff(scopes, dispatch, cmd_str):
    import difflib

    data_a, _ = await dispatch("read", scopes[0])
    data_b, _ = await dispatch("read", scopes[1])
    lines_a = data_a.decode(errors="replace").splitlines(keepends=True)
    lines_b = data_b.decode(errors="replace").splitlines(keepends=True)
    diff = list(
        difflib.unified_diff(lines_a,
                             lines_b,
                             fromfile=scopes[0].original,
                             tofile=scopes[1].original))
    if diff:
        out = "".join(diff).encode()
        return out, IOResult(exit_code=1), ExecutionNode(command=cmd_str,
                                                         exit_code=1)
    return b"", IOResult(), ExecutionNode(command=cmd_str, exit_code=0)


async def _cross_cmp(scopes, dispatch, cmd_str):
    data_a, _ = await dispatch("read", scopes[0])
    data_b, _ = await dispatch("read", scopes[1])
    if data_a == data_b:
        return b"", IOResult(), ExecutionNode(command=cmd_str, exit_code=0)
    for i, (a, b) in enumerate(zip(data_a, data_b)):
        if a != b:
            msg = (f"{scopes[0].original} {scopes[1].original} "
                   f"differ: byte {i + 1}\n")
            return msg.encode(), IOResult(exit_code=1), ExecutionNode(
                command=cmd_str, exit_code=1)
    shorter = scopes[0].original if len(data_a) < len(
        data_b) else scopes[1].original
    msg = f"cmp: EOF on {shorter}\n"
    return msg.encode(), IOResult(exit_code=1), ExecutionNode(command=cmd_str,
                                                              exit_code=1)


async def _cross_multi_read(cmd_name, scopes, text_args, dispatch, cmd_str):
    """Read each file from its own mount, apply command logic per-file."""
    file_data: list[tuple[str, bytes]] = []
    reads: dict[str, bytes] = {}
    cache: list[str] = []
    for scope in scopes:
        data, _ = await dispatch("read", scope)
        if isinstance(data, bytes):
            file_data.append((scope.original, data))
            reads[scope.original] = data
            cache.append(scope.original)

    io = IOResult(reads=reads, cache=cache)

    if cmd_name == "cat":
        combined = b"".join(d for _, d in file_data)
        return combined, io, ExecutionNode(command=cmd_str, exit_code=0)

    if cmd_name in ("head", "tail"):
        n = 10
        for i, arg in enumerate(text_args):
            if arg == "-n" and i + 1 < len(text_args):
                try:
                    n = int(text_args[i + 1])
                except ValueError:
                    err = (f"{cmd_name}: invalid number: "
                           f"{text_args[i + 1]!r}\n").encode()
                    return None, IOResult(
                        exit_code=1,
                        stderr=err,
                    ), ExecutionNode(
                        command=cmd_str,
                        exit_code=1,
                        stderr=err,
                    )
        parts: list[str] = []
        multi = len(file_data) > 1
        for name, data in file_data:
            lines = data.decode(errors="replace").splitlines()
            if multi:
                parts.append(f"==> {name} <==")
            if cmd_name == "head":
                parts.extend(lines[:n])
            else:
                parts.extend(lines[-n:])
        return "\n".join(parts).encode() + b"\n", io, ExecutionNode(
            command=cmd_str, exit_code=0)

    if cmd_name in ("grep", "rg"):
        pattern = text_args[0] if text_args else ""
        flags = 0
        if "-i" in text_args:
            flags = re.IGNORECASE
        compiled = re.compile(pattern, flags)
        results: list[str] = []
        for name, data in file_data:
            for line in data.decode(errors="replace").splitlines():
                if compiled.search(line):
                    results.append(f"{name}:{line}")
        if not results:
            io.exit_code = 1
            return b"", io, ExecutionNode(command=cmd_str, exit_code=1)
        return "\n".join(results).encode() + b"\n", io, ExecutionNode(
            command=cmd_str, exit_code=0)

    if cmd_name == "wc":
        parts = []
        for name, data in file_data:
            text = data.decode(errors="replace")
            lines = text.count("\n")
            words = len(text.split())
            chars = len(data)
            if "-l" in text_args:
                parts.append(f"{lines} {name}")
            elif "-w" in text_args:
                parts.append(f"{words} {name}")
            elif "-c" in text_args:
                parts.append(f"{chars} {name}")
            else:
                parts.append(f"{lines} {words} {chars} {name}")
        return "\n".join(parts).encode() + b"\n", io, ExecutionNode(
            command=cmd_str, exit_code=0)

    combined = b"".join(d for _, d in file_data)
    return combined, io, ExecutionNode(command=cmd_str, exit_code=0)
