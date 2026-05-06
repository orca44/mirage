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

from mirage.accessor.ram import RAMAccessor
from mirage.commands.builtin.utils.formatting import _human_size
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.ram.du import du as du_core
from mirage.core.ram.du import du_all as du_all_core
from mirage.core.ram.glob import resolve_glob
from mirage.core.ram.stat import stat as stat_core
from mirage.io.types import ByteSource, IOResult
from mirage.types import FileType, PathSpec


def _format_size(size: int, human: bool) -> str:
    return _human_size(size) if human else str(size)


def _depth(entry_path: str, base_path: str) -> int:
    base = base_path.rstrip("/")
    rel = entry_path.rstrip("/")[len(base):]
    if not rel:
        return 0
    return rel.strip("/").count("/") + 1


@command("du", resource="ram", spec=SPECS["du"])
async def du(
    accessor: RAMAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: bytes | None = None,
    h: bool = False,
    s: bool = False,
    a: bool = False,
    max_depth: str | None = None,
    c: bool = False,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if accessor.store is None:
        raise ValueError("du: no resource")
    paths = await resolve_glob(accessor, paths, _extra.get("index"))
    if not paths:
        raise ValueError("du: missing operand")
    if len(paths) > 1:
        all_lines: list[str] = []
        all_warnings: list[str] = []
        grand_total = 0
        for p in paths:
            sub_stdout, sub_io = await du(accessor, [p],
                                          *texts,
                                          stdin=stdin,
                                          h=h,
                                          s=s,
                                          a=a,
                                          max_depth=max_depth,
                                          **_extra)
            if sub_stdout is not None:
                if isinstance(sub_stdout, bytes):
                    all_lines.append(sub_stdout.decode())
                else:
                    chunks = []
                    async for chunk in sub_stdout:
                        chunks.append(chunk)
                    all_lines.append(b"".join(chunks).decode())
            if sub_io.stderr:
                all_warnings.append(sub_io.stderr.decode())
        if c:
            for line in "\n".join(all_lines).splitlines():
                parts = line.split("\t", 1)
                if parts[0].strip():
                    try:
                        grand_total += int(parts[0].strip())
                    except ValueError:
                        pass
            all_lines.append(_format_size(grand_total, h) + "\ttotal")
        stderr = "\n".join(all_warnings).encode() if all_warnings else None
        return "\n".join(all_lines).encode(), IOResult(stderr=stderr)
    path_gs = paths[0]
    path = path_gs.original
    mount_prefix = path_gs.prefix
    if s:
        total = await du_core(accessor, path_gs)
        output = _format_size(total, h) + "\t" + path
        if c:
            output += "\n" + _format_size(total, h) + "\ttotal"
        return output.encode(), IOResult()
    all_entries, total = await du_all_core(accessor, path_gs)
    if not all_entries:
        total = await du_core(accessor, path_gs)
        output = _format_size(total, h) + "\t" + path
        if c:
            output += "\n" + _format_size(total, h) + "\ttotal"
        return output.encode(), IOResult()
    if not a:
        dir_entries: list[tuple[str, int]] = []
        for p, sz in all_entries:
            if p == path:
                dir_entries.append((p, sz))
                continue
            try:
                p_spec = PathSpec(original=p,
                                  directory=p,
                                  resolved=False,
                                  prefix=mount_prefix)
                st = await stat_core(accessor, p_spec)
                if st.type == FileType.DIRECTORY:
                    dir_entries.append((p, sz))
            except (FileNotFoundError, ValueError):
                pass
        all_entries = dir_entries
    if max_depth is not None:
        md = int(max_depth)
        all_entries = [(p, sz) for p, sz in all_entries
                       if _depth(p, path) <= md]
    if not all_entries:
        output = _format_size(total, h) + "\t" + path
        if c:
            output += "\n" + _format_size(total, h) + "\ttotal"
        return output.encode(), IOResult()
    lines = [_format_size(sz, h) + "\t" + p for p, sz in all_entries]
    if c:
        grand = sum(sz for _, sz in all_entries)
        lines.append(_format_size(grand, h) + "\ttotal")
    return "\n".join(lines).encode(), IOResult()
