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

import posixpath
import re

from mirage.commands.spec.constants import AMBIGUOUS_NAMES
from mirage.commands.spec.types import CommandSpec, OperandKind, ParsedArgs

_NUMERIC_SHORT = re.compile(r"^-\d+$")


def _resolve(cwd: str, path: str) -> str:
    if path.startswith("/"):
        return posixpath.normpath(path)
    return posixpath.normpath(posixpath.join(cwd, path))


def parse_command(
    spec: CommandSpec,
    argv: list[str],
    cwd: str,
) -> ParsedArgs:
    bool_flags: set[str] = set()
    value_flags: set[str] = set()
    long_bool_flags: set[str] = set()
    long_value_flags: set[str] = set()
    value_flag_kinds: dict[str, OperandKind] = {}
    numeric_shorthand_flag: str | None = None
    for opt in spec.options:
        if opt.short:
            if opt.value_kind == OperandKind.NONE:
                bool_flags.add(opt.short)
            else:
                value_flags.add(opt.short)
                if opt.value_kind == OperandKind.PATH:
                    value_flag_kinds[opt.short] = OperandKind.PATH
                if opt.numeric_shorthand:
                    numeric_shorthand_flag = opt.short
        if opt.long:
            if opt.value_kind == OperandKind.NONE:
                long_bool_flags.add(opt.long)
            else:
                long_value_flags.add(opt.long)
                if opt.value_kind == OperandKind.PATH:
                    value_flag_kinds[opt.long] = OperandKind.PATH

    positional: tuple[OperandKind,
                      ...] = tuple(op.kind for op in spec.positional)
    rest_kind: OperandKind | None = (spec.rest.kind
                                     if spec.rest is not None else None)

    cache_paths: list[str] = []
    filtered_argv: list[str] = []
    i = 0
    while i < len(argv):
        if argv[i] == "--cache":
            i += 1
            while i < len(argv) and not argv[i].startswith("-"):
                cache_paths.append(_resolve(cwd, argv[i]))
                i += 1
        else:
            filtered_argv.append(argv[i])
            i += 1

    flags: dict[str, str | bool] = {}
    raw_args: list[str] = []
    i = 0
    end_of_flags = False

    while i < len(filtered_argv):
        tok = filtered_argv[i]

        if tok == "--" and not end_of_flags:
            end_of_flags = True
            i += 1
            continue

        if end_of_flags:
            raw_args.append(tok)
            i += 1
            continue

        if tok.startswith("--"):
            if tok in long_bool_flags:
                flags[tok] = True
                i += 1
            elif tok in long_value_flags and i + 1 < len(filtered_argv):
                flags[tok] = filtered_argv[i + 1]
                i += 2
            else:
                raw_args.append(tok)
                i += 1
            continue

        if tok.startswith("-") and len(tok) > 1:
            if numeric_shorthand_flag is not None and _NUMERIC_SHORT.match(
                    tok):
                flags[numeric_shorthand_flag] = tok[1:]
                i += 1
                continue
            matched_value = False
            for vf in value_flags:
                if tok == vf and i + 1 < len(filtered_argv):
                    flags[vf] = filtered_argv[i + 1]
                    i += 2
                    matched_value = True
                    break
                if tok.startswith(vf) and len(tok) > len(vf):
                    flags[vf] = tok[len(vf):]
                    i += 1
                    matched_value = True
                    break
            if matched_value:
                continue

            if tok in bool_flags:
                flags[tok] = True
                i += 1
                continue

            all_bool = True
            for ch in tok[1:]:
                if f"-{ch}" not in bool_flags:
                    all_bool = False
                    break
            if all_bool and len(tok) > 1:
                for ch in tok[1:]:
                    flags[f"-{ch}"] = True
                i += 1
                continue

            raw_args.append(tok)
            i += 1
            continue

        raw_args.append(tok)
        i += 1

    classified: list[tuple[str, OperandKind]] = []
    for j, arg in enumerate(raw_args):
        if j < len(positional):
            kind = positional[j]
        elif rest_kind is not None:
            kind = rest_kind
        else:
            continue
        if kind == OperandKind.PATH:
            classified.append((_resolve(cwd, arg), OperandKind.PATH))
        else:
            classified.append((arg, OperandKind.TEXT))

    path_flag_values: list[str] = []
    for flag_name, kind in value_flag_kinds.items():
        if (kind == OperandKind.PATH and flag_name in flags
                and isinstance(flags[flag_name], str)):
            resolved = _resolve(cwd, flags[flag_name])
            flags[flag_name] = resolved
            path_flag_values.append(resolved)

    return ParsedArgs(
        flags=flags,
        args=classified,
        cache_paths=cache_paths,
        path_flag_values=path_flag_values,
    )


def parse_to_kwargs(parsed: ParsedArgs) -> dict[str, str | bool]:
    result: dict[str, str | bool] = {}
    for key, value in parsed.flags.items():
        clean = key.lstrip("-").replace("-", "_")
        clean = AMBIGUOUS_NAMES.get(clean, clean)
        result[clean] = value
    return result
