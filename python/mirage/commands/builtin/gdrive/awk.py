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

from mirage.accessor.gdrive import GDriveAccessor
from mirage.commands.builtin.utils.stream import _read_stdin_async
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.gdrive.read import read as gdrive_read
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
    if condition in ("BEGIN", "END"):
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


@command("awk", resource="gdrive", spec=SPECS["awk"])
async def awk(
    accessor: GDriveAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    F: str | None = None,
    v: str | None = None,
    f: str | None = None,
    prefix: str = "",
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if f is not None:
        f_spec = PathSpec(original=f, directory=f, prefix=prefix)
        program = (await gdrive_read(
            accessor,
            f_spec,
            _extra.get("index"),
        )).decode(errors="replace").strip()
        data_paths = list(texts) + list(paths)
    elif texts:
        program = texts[0]
        data_paths = list(paths)
    else:
        raise ValueError(
            "awk: usage: awk [-F fs] [-v var=val] 'program' [file ...]")
    fs = F if F else " "
    variables: dict[str, str] = {}
    if v and "=" in v:
        key, val = v.split("=", 1)
        variables[key] = val

    if data_paths:
        p = data_paths[0]
        p_spec = (p if isinstance(p, PathSpec) else PathSpec(
            original=p, directory=p, prefix=prefix))
        raw = await gdrive_read(accessor, p_spec, _extra.get("index"))
        text = raw.decode(errors="replace")
    else:
        raw_stdin = await _read_stdin_async(stdin)
        if raw_stdin is None:
            raise ValueError("awk: missing input")
        text = raw_stdin.decode(errors="replace")

    out_lines: list[str] = []
    for nr, line in enumerate(text.splitlines(), 1):
        result = _awk_eval_line(line, program, fs, variables, nr)
        if result is not None:
            out_lines.append(result)
    output = "\n".join(out_lines) + "\n" if out_lines else ""
    return output.encode(), IOResult()
