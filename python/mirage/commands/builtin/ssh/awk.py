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
from collections.abc import AsyncIterator

from mirage.accessor.ssh import SSHAccessor
from mirage.cache.index import IndexCacheStore
from mirage.commands.builtin.utils.stream import _resolve_source
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.ssh.glob import resolve_glob
from mirage.core.ssh.read import read_bytes
from mirage.core.ssh.stream import read_stream
from mirage.io.async_line_iterator import AsyncLineIterator
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


def _awk_eval_line(
    line: str,
    program: str,
    fs: str,
    variables: dict[str, str],
    nr: int,
) -> str | None:
    fields = re.split(re.escape(fs) if len(fs) == 1 else fs,
                      line) if fs else line.split()
    nf = len(fields)
    field_map = {"$0": line, "NR": str(nr), "NF": str(nf)}
    for i, f in enumerate(fields, 1):
        field_map[f"${i}"] = f
    for k, v in variables.items():
        field_map[k] = v

    condition, action = _parse_program(program)

    if condition and not _eval_condition(condition, field_map):
        return None

    if not action:
        return line

    return _eval_action(action, field_map, fs)


def _parse_program(program: str) -> tuple[str, str]:
    program = program.strip()
    if program.startswith("{"):
        return "", program[1:].rstrip("}")
    if "{" in program:
        idx = program.index("{")
        condition = program[:idx].strip()
        action = program[idx + 1:].rstrip("}").strip()
        return condition, action
    return "", program


def _eval_condition(condition: str, field_map: dict[str, str]) -> bool:
    condition = condition.strip()
    if condition == "BEGIN" or condition == "END":
        return False
    for pattern in [
            r"(\$\d+|NR|NF)\s*==\s*(.+)", r"(\$\d+|NR|NF)\s*!=\s*(.+)",
            r"(\$\d+|NR|NF)\s*>\s*(.+)", r"(\$\d+|NR|NF)\s*<\s*(.+)",
            r"(\$\d+|NR|NF)\s*>=\s*(.+)", r"(\$\d+|NR|NF)\s*<=\s*(.+)"
    ]:
        m = re.match(pattern, condition)
        if m:
            lhs_key, rhs_raw = m.group(1), m.group(2).strip().strip('"')
            lhs = field_map.get(lhs_key, "")
            op = re.search(r"(==|!=|>=|<=|>|<)", condition).group(1)
            try:
                lhs_num, rhs_num = float(lhs), float(rhs_raw)
                if op == "==":
                    return lhs_num == rhs_num
                if op == "!=":
                    return lhs_num != rhs_num
                if op == ">":
                    return lhs_num > rhs_num
                if op == "<":
                    return lhs_num < rhs_num
                if op == ">=":
                    return lhs_num >= rhs_num
                if op == "<=":
                    return lhs_num <= rhs_num
            except ValueError:
                if op == "==":
                    return lhs == rhs_raw
                if op == "!=":
                    return lhs != rhs_raw
                return False
    if condition.startswith("/") and condition.endswith("/"):
        regex = condition[1:-1]
        return bool(re.search(regex, field_map.get("$0", "")))
    return True


def _eval_action(action: str, field_map: dict[str, str], fs: str) -> str:
    parts: list[str] = []
    for stmt in action.split(";"):
        stmt = stmt.strip()
        if not stmt:
            continue
        if stmt.startswith("print"):
            args = stmt[5:].strip()
            if not args:
                parts.append(field_map.get("$0", ""))
            else:
                tokens = re.split(r",\s*", args)
                vals: list[str] = []
                for tok in tokens:
                    tok = tok.strip().strip('"')
                    vals.append(field_map.get(tok, tok))
                parts.append(" ".join(vals))
    return "\n".join(parts) if parts else ""


async def _awk_stream(
    source: AsyncIterator[bytes],
    program: str,
    fs: str,
    variables: dict[str, str],
) -> AsyncIterator[bytes]:
    nr = 0
    async for line_bytes in AsyncLineIterator(source):
        nr += 1
        line = line_bytes.decode(errors="replace")
        result = _awk_eval_line(line, program, fs, variables, nr)
        if result is not None:
            yield (result + "\n").encode()


def _strip_mount(virtual_path: str, prefix: str) -> str:
    if prefix and virtual_path.startswith(prefix + "/"):
        return "/" + virtual_path[len(prefix):].lstrip("/")
    return virtual_path


@command("awk", resource="ssh", spec=SPECS["awk"])
async def awk(
    accessor: SSHAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    F: str | None = None,
    v: str | None = None,
    f: PathSpec | None = None,
    prefix: str = "",
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if paths:
        paths = await resolve_glob(accessor, paths, index)
    mount_prefix = paths[0].prefix if paths else (f.prefix if f else "")
    if f is not None:
        f_path = f.strip_prefix
        program = (await read_bytes(accessor,
                                    f_path)).decode(errors="replace").strip()
        data_paths = [_strip_mount(t, mount_prefix)
                      for t in texts] + [p.strip_prefix for p in paths]
    elif texts:
        program = texts[0]
        data_paths = [p.strip_prefix for p in paths]
    else:
        raise ValueError(
            "awk: usage: awk [-F fs] [-v var=val] 'program' [file ...]")
    fs = F if F else " "
    variables: dict[str, str] = {}
    if v and "=" in v:
        key, val = v.split("=", 1)
        variables[key] = val

    cache: list[str] = []
    if data_paths:
        source: AsyncIterator[bytes] = read_stream(accessor, data_paths[0])
        cache = [data_paths[0]]
    else:
        source = _resolve_source(stdin, "awk: missing input")

    return _awk_stream(source, program, fs, variables), IOResult(cache=cache)
