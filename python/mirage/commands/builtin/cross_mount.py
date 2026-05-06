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

from itertools import product

from mirage.commands.registry import RegisteredCommand
from mirage.commands.spec import SPECS
from mirage.io.types import IOResult
from mirage.types import PathSpec


async def _cp_cross(
    ws,
    paths: list[PathSpec],
    *texts: str,
    stdin: bytes | None = None,
    r: bool = False,
    R: bool = False,
    **kw: object,
) -> tuple[bytes | None, IOResult]:
    recursive = r or R
    if recursive:
        src_entries, _ = await ws.dispatch("find", paths[0], type="f")
        if isinstance(src_entries, list):
            entries = src_entries
        else:
            raw = src_entries.decode().strip() if src_entries else ""
            entries = raw.split("\n") if raw else []
        src_base = paths[0].rstrip("/")
        for entry in entries:
            rel = entry[len(src_base):]
            dst = paths[1].rstrip("/") + rel
            data, _ = await ws.dispatch("read_bytes", entry)
            await ws.dispatch("write_bytes", dst, data=data)
    else:
        data, _ = await ws.dispatch("read_bytes", paths[0])
        await ws.dispatch("write_bytes", paths[1], data=data)
    return None, IOResult()


async def _mv_cross(
    ws,
    paths: list[PathSpec],
    *texts: str,
    stdin: bytes | None = None,
    **kw: object,
) -> tuple[bytes | None, IOResult]:
    data, _ = await ws.dispatch("read_bytes", paths[0])
    await ws.dispatch("write_bytes", paths[1], data=data)
    await ws.dispatch("unlink", paths[0])
    return None, IOResult()


async def _diff_cross(
    ws,
    paths: list[PathSpec],
    *texts: str,
    stdin: bytes | None = None,
    i: bool = False,
    w: bool = False,
    b: bool = False,
    e: bool = False,
    **kw: object,
) -> tuple[bytes | None, IOResult]:
    from mirage.commands.builtin.diff_helper import diff

    data_a, _ = await ws.dispatch("read_bytes", paths[0])
    data_b, _ = await ws.dispatch("read_bytes", paths[1])
    store = {paths[0]: data_a, paths[1]: data_b}
    result = diff(
        lambda p: store[p],
        paths[0],
        paths[1],
        ignore_case=i,
        ignore_whitespace=w,
        ignore_space_change=b,
        ed_script=e,
    )
    output = "".join(result) if result else ""
    return output.encode() if output else None, IOResult()


async def _comm_cross(
    ws,
    paths: list[PathSpec],
    *texts: str,
    stdin: bytes | None = None,
    **kw: object,
) -> tuple[bytes | None, IOResult]:
    data_a, _ = await ws.dispatch("read_bytes", paths[0])
    data_b, _ = await ws.dispatch("read_bytes", paths[1])
    skip1 = kw.get("args_1", False)
    skip2 = kw.get("args_2", False)
    skip3 = kw.get("args_3", False)
    lines_a = data_a.decode(errors="replace").splitlines()
    lines_b = data_b.decode(errors="replace").splitlines()
    result: list[str] = []
    idx_a, idx_b = 0, 0
    while idx_a < len(lines_a) and idx_b < len(lines_b):
        if lines_a[idx_a] < lines_b[idx_b]:
            if not skip1:
                result.append(lines_a[idx_a])
            idx_a += 1
        elif lines_a[idx_a] > lines_b[idx_b]:
            if not skip2:
                result.append("\t" + lines_b[idx_b])
            idx_b += 1
        else:
            if not skip3:
                result.append("\t\t" + lines_a[idx_a])
            idx_a += 1
            idx_b += 1
    while idx_a < len(lines_a):
        if not skip1:
            result.append(lines_a[idx_a])
        idx_a += 1
    while idx_b < len(lines_b):
        if not skip2:
            result.append("\t" + lines_b[idx_b])
        idx_b += 1
    output = "\n".join(result) + "\n" if result else ""
    return output.encode() if output else None, IOResult()


async def _cmp_cross(
    ws,
    paths: list[PathSpec],
    *texts: str,
    stdin: bytes | None = None,
    args_l: bool = False,
    s: bool = False,
    **kw: object,
) -> tuple[bytes | None, IOResult]:
    data_a, _ = await ws.dispatch("read_bytes", paths[0])
    data_b, _ = await ws.dispatch("read_bytes", paths[1])
    if data_a == data_b:
        return None, IOResult()
    if s:
        return None, IOResult(exit_code=1)
    for idx in range(min(len(data_a), len(data_b))):
        if data_a[idx] != data_b[idx]:
            line = data_a[:idx].count(b"\n") + 1
            msg = (f"{paths[0]} {paths[1]} differ: "
                   f"byte {idx + 1}, line {line}\n")
            return msg.encode(), IOResult(exit_code=1)
    shorter = paths[0] if len(data_a) < len(data_b) else paths[1]
    msg = f"cmp: EOF on {shorter}\n"
    return msg.encode(), IOResult(exit_code=1)


async def _join_cross(
    ws,
    paths: list[PathSpec],
    *texts: str,
    stdin: bytes | None = None,
    t: str | None = None,
    **kw: object,
) -> tuple[bytes | None, IOResult]:
    data_a, _ = await ws.dispatch("read_bytes", paths[0])
    data_b, _ = await ws.dispatch("read_bytes", paths[1])
    sep = t if t else " "
    lines_a = data_a.decode(errors="replace").splitlines()
    lines_b = data_b.decode(errors="replace").splitlines()
    b_map: dict[str, str] = {}
    for line in lines_b:
        parts = line.split(sep, 1)
        if parts:
            b_map[parts[0]] = parts[1] if len(parts) > 1 else ""
    result: list[str] = []
    for line in lines_a:
        parts = line.split(sep, 1)
        if parts and parts[0] in b_map:
            a_rest = parts[1] if len(parts) > 1 else ""
            result.append(f"{parts[0]}{sep}{a_rest}{sep}{b_map[parts[0]]}")
    output = "\n".join(result) + "\n" if result else ""
    return output.encode() if output else None, IOResult()


async def _paste_cross(
    ws,
    paths: list[PathSpec],
    *texts: str,
    stdin: bytes | None = None,
    d: str | None = None,
    s: bool = False,
    **kw: object,
) -> tuple[bytes | None, IOResult]:
    delimiter = d if d else "\t"
    file_lines: list[list[str]] = []
    for p in paths:
        data, _ = await ws.dispatch("read_bytes", p)
        file_lines.append(data.decode(errors="replace").splitlines())
    max_lines = max(len(fl) for fl in file_lines) if file_lines else 0
    result: list[str] = []
    for idx in range(max_lines):
        parts = [fl[idx] if idx < len(fl) else "" for fl in file_lines]
        result.append(delimiter.join(parts))
    output = "\n".join(result) + "\n" if result else ""
    return output.encode(), IOResult()


RESOURCES = ["ram", "s3", "disk"]
_RESOURCE_PAIRS = list(product(RESOURCES, repeat=2))

_CROSS_FNS = [
    (_cp_cross, "cp"),
    (_mv_cross, "mv"),
    (_diff_cross, "diff"),
    (_comm_cross, "comm"),
    (_cmp_cross, "cmp"),
    (_join_cross, "join"),
    (_paste_cross, "paste"),
]

CROSS_COMMANDS: list[RegisteredCommand] = []
for _src, _dst in _RESOURCE_PAIRS:
    for _fn, _name in _CROSS_FNS:
        CROSS_COMMANDS.append(
            RegisteredCommand(
                name=_name,
                spec=SPECS[_name],
                resource=f"{_src}->{_dst}",
                filetype=None,
                fn=_fn,
                src=_src,
                dst=_dst,
            ))
