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

from mirage.accessor.redis import RedisAccessor
from mirage.commands.builtin.utils.stream import _resolve_source
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.redis.glob import resolve_glob
from mirage.core.redis.read import read_bytes
from mirage.core.redis.stream import stream as _stream_core
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


def _parse_blocks(program: str) -> tuple[str, str, str]:
    """Split program into BEGIN, main, END blocks."""
    begin = ""
    end = ""
    main = program

    begin_match = re.match(r"BEGIN\s*\{([^}]*)\}\s*(.*)", program, re.DOTALL)
    if begin_match:
        begin = begin_match.group(1).strip()
        main = begin_match.group(2).strip()

    end_match = re.search(r"END\s*\{([^}]*)\}\s*$", main)
    if end_match:
        end = end_match.group(1).strip()
        main = main[:end_match.start()].strip()

    return begin, main, end


def _eval_accumulator(action: str, field_map: dict, accum: dict) -> None:
    """Handle s+=$2 style accumulations."""
    for stmt in action.split(";"):
        stmt = stmt.strip()
        m = re.match(r"(\w+)\s*\+=\s*(.+)", stmt)
        if m:
            var, expr = m.group(1), m.group(2).strip()
            val = field_map.get(expr, expr)
            try:
                accum[var] = accum.get(var, 0) + float(val)
            except ValueError:
                pass


def _eval_end_action(action: str, accum: dict) -> str:
    """Evaluate END block with accumulated variables."""
    parts = []
    for stmt in action.split(";"):
        stmt = stmt.strip()
        if stmt.startswith("print"):
            args = stmt[5:].strip()
            if not args:
                continue
            tokens = re.split(r",\s*", args)
            vals = []
            for tok in tokens:
                tok = tok.strip().strip('"')
                if tok in accum:
                    v = accum[tok]
                    vals.append(str(int(v)) if v == int(v) else str(v))
                else:
                    vals.append(tok)
            parts.append(" ".join(vals))
    return "\n".join(parts)


async def _awk_stream(
    source: AsyncIterator[bytes],
    program: str,
    fs: str,
    variables: dict[str, str],
) -> AsyncIterator[bytes]:
    begin, main, end = _parse_blocks(program)
    accum: dict[str, float] = {}
    nr = 0

    async for line_bytes in AsyncLineIterator(source):
        nr += 1
        line = line_bytes.decode(errors="replace")
        if main:
            fields = re.split(re.escape(fs) if len(fs) == 1 else fs,
                              line) if fs else line.split()
            field_map = {"$0": line, "NR": str(nr), "NF": str(len(fields))}
            for i, f in enumerate(fields, 1):
                field_map[f"${i}"] = f

            condition, action = _parse_program(main)
            if condition and not _eval_condition(condition, field_map):
                continue

            _eval_accumulator(action, field_map, accum)

            if not any(s.strip().startswith("print")
                       for s in action.split(";") if "+=" not in s):
                result = _awk_eval_line(line, main, fs, variables, nr)
                if result is not None and result:
                    yield (result + "\n").encode()
            else:
                result = _awk_eval_line(line, main, fs, variables, nr)
                if result is not None and result:
                    yield (result + "\n").encode()

    if end:
        result = _eval_end_action(end, accum)
        if result:
            yield (result + "\n").encode()


def _strip_mount(virtual_path: str, prefix: str) -> str:
    if prefix and virtual_path.startswith(prefix + "/"):
        return "/" + virtual_path[len(prefix):].lstrip("/")
    return virtual_path


@command("awk", resource="redis", spec=SPECS["awk"])
async def awk(
    accessor: RedisAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    F: str | None = None,
    v: str | None = None,
    f: PathSpec | None = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if accessor.store is not None:
        paths = await resolve_glob(accessor, paths, _extra.get("index"))
    if f is not None and accessor.store is not None:
        f_path = f.strip_prefix
        program = (await read_bytes(accessor,
                                    f_path)).decode(errors="replace").strip()
        mount_prefix = paths[0].prefix if paths else ""
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
    if data_paths and accessor.store is not None:
        source: AsyncIterator[bytes] = _stream_core(accessor, data_paths[0])
        cache = [data_paths[0]]
    else:
        source = _resolve_source(stdin, "awk: missing input")

    return _awk_stream(source, program, fs, variables), IOResult(cache=cache)
