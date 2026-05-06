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

from mirage.commands.spec import CommandSpec, OperandKind, parse_command
from mirage.io.types import ByteSource

COMPOUND_EXTENSIONS = frozenset({
    ".gdoc.json",
    ".gslide.json",
    ".gsheet.json",
    ".gmail.json",
})


def get_extension(path: str | None) -> str | None:
    if path is None:
        return None
    basename = path.rsplit("/", 1)[-1]
    for ext in COMPOUND_EXTENSIONS:
        if basename.endswith(ext):
            return ext
    dot = path.rfind(".")
    if dot == -1 or "/" in path[dot:]:
        return None
    return path[dot:]


def resolve_first_path(argv: list[str], cwd: str,
                       spec: CommandSpec) -> str | None:
    parsed = parse_command(spec, argv, cwd)
    paths = parsed.routing_paths()
    return paths[0] if paths else cwd


async def materialize_stdout(stdout: ByteSource | None) -> bytes:
    if stdout is None:
        return b""
    if isinstance(stdout, bytes):
        return stdout
    return b"".join([chunk async for chunk in stdout])


def strip_prefix_from_path_kwargs(
    kwargs: dict[str, str | bool],
    spec: CommandSpec,
    prefix: str,
) -> dict[str, str | bool]:
    if not prefix:
        return kwargs
    result = dict(kwargs)
    for opt in spec.options:
        if opt.value_kind != OperandKind.PATH:
            continue
        for flag_name in (opt.short, opt.long):
            if flag_name is None:
                continue
            clean = flag_name.lstrip("-")
            if clean in result and isinstance(result[clean], str):
                vp = result[clean]
                if vp.startswith(prefix + "/") or vp == prefix:
                    result[clean] = ("/" + vp[len(prefix):].lstrip("/"))
    return result
