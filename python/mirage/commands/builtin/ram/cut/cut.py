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

from collections.abc import AsyncIterator

from mirage.accessor.ram import RAMAccessor
from mirage.commands.builtin.utils.stream import _resolve_source
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.ram.glob import resolve_glob
from mirage.core.ram.stream import stream as _stream_core
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


def _parse_range_spec(spec: str) -> list[int]:
    indices: list[int] = []
    for part in spec.split(","):
        if "-" in part:
            lo, hi = part.split("-", 1)
            indices.extend(range(int(lo), int(hi) + 1))
        else:
            indices.append(int(part))
    return indices


def _parse_char_ranges(spec: str) -> list[tuple[int, int]]:
    ranges: list[tuple[int, int]] = []
    for part in spec.split(","):
        if "-" in part:
            lo, hi = part.split("-", 1)
            ranges.append((int(lo), int(hi)))
        else:
            val = int(part)
            ranges.append((val, val))
    return ranges


async def _cut_stream(
    source: AsyncIterator[bytes],
    delimiter: str = "\t",
    fields: list[int] | None = None,
    chars: list[tuple[int, int]] | None = None,
    complement: bool = False,
    zero_terminated: bool = False,
) -> AsyncIterator[bytes]:
    sep = b"\x00" if zero_terminated else b"\n"
    raw = b""
    async for chunk in source:
        raw += chunk
    records = raw.split(sep)
    if records and records[-1] == b"":
        records = records[:-1]
    for rec in records:
        line = rec.decode(errors="replace")
        if chars is not None:
            if complement:
                selected_indices: set[int] = set()
                for s, e in chars:
                    selected_indices.update(range(s - 1, e))
                parts = [
                    line[i] for i in range(len(line))
                    if i not in selected_indices
                ]
                yield "".join(parts).encode() + sep
            else:
                parts = []
                for s, e in chars:
                    parts.append(line[s - 1:e])
                yield "".join(parts).encode() + sep
        elif fields:
            parts_f = line.split(delimiter)
            if complement:
                field_set = set(fields)
                selected = [
                    parts_f[i] for i in range(len(parts_f))
                    if (i + 1) not in field_set
                ]
            else:
                selected = [
                    parts_f[f_idx - 1] for f_idx in fields
                    if 0 < f_idx <= len(parts_f)
                ]
            yield delimiter.join(selected).encode() + sep
        else:
            yield rec + sep


@command("cut", resource="ram", spec=SPECS["cut"])
async def cut(
    accessor: RAMAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    f: str | None = None,
    d: str | None = None,
    c: str | None = None,
    complement: bool = False,
    z: bool = False,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    fields = _parse_range_spec(f) if f is not None else None
    chars = _parse_char_ranges(c) if c is not None else None
    delim = d if d is not None else "\t"
    if paths and accessor.store is not None:
        paths = await resolve_glob(accessor, paths, _extra.get("index"))
        source = _stream_core(accessor, paths[0])
        return _cut_stream(source,
                           delimiter=delim,
                           fields=fields,
                           chars=chars,
                           complement=complement,
                           zero_terminated=z), IOResult()
    source = _resolve_source(stdin, "cut: missing operand")
    return _cut_stream(source,
                       delimiter=delim,
                       fields=fields,
                       chars=chars,
                       complement=complement,
                       zero_terminated=z), IOResult()
