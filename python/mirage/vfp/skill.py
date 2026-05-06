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

from typing import Literal

from mirage.vfp.capability import (CapabilityDeclaration, CommandCapabilities,
                                   FileTypeFilter, PosixCapabilities)
from mirage.vfp.types import FileType, Mount

SkillFormat = Literal["markdown", "text"]


def render(
    declaration: CapabilityDeclaration,
    *,
    format: SkillFormat = "markdown",
) -> str:
    """Render a capability declaration as an LLM-facing skill description.

    Args:
        declaration (CapabilityDeclaration): the workspace capability snapshot.
        format (SkillFormat): output format. Currently ``"markdown"`` and
            ``"text"`` are supported; both produce the same content with light
            formatting tweaks.

    Returns:
        str: skill text suitable for an LLM system prompt.
    """
    impl = declaration.implementation
    caps = declaration.capabilities

    h1, h2 = ("# ", "## ") if format == "markdown" else ("", "")

    lines: list[str] = []
    lines.append(f"{h1}{impl.name} workspace ({impl.language} {impl.version})")
    lines.append("")
    lines.append(f"{h2}Mounts")
    if not caps.mounts:
        lines.append("- (none)")
    else:
        for m in caps.mounts:
            lines.append(_render_mount(m))
    lines.append("")

    lines.append(f"{h2}Filesystem operations")
    lines.extend(_render_posix(caps.posix))
    lines.append("")

    lines.append(f"{h2}Commands")
    lines.extend(_render_commands(caps.commands))
    lines.append("")

    if any([
            caps.workspace.snapshot,
            caps.workspace.load,
            caps.workspace.list,
            caps.workspace.delete,
            caps.workspace.info,
    ]):
        lines.append(f"{h2}Workspace lifecycle")
        for name in ("snapshot", "load", "list", "delete", "info"):
            if getattr(caps.workspace, name):
                lines.append(f"- workspace/{name}")
        lines.append("")

    lines.append(f"{h2}Path rules")
    lines.append("- Paths are absolute (start with `/`).")
    lines.append("- Glob patterns are accepted only on `fs/glob`.")
    lines.append("- Other ops reject patterns with `InvalidPath`.")

    return "\n".join(lines).rstrip() + "\n"


def _render_mount(m: Mount) -> str:
    rw = "writable" if m.writable else "read-only"
    types = ", ".join(t.value for t in m.filetypes) if m.filetypes else "any"
    return f"- `{m.path}` — {m.type} ({rw}). Filetypes: {types}"


def _render_posix(p: PosixCapabilities) -> list[str]:
    out: list[str] = []
    bool_ops = ("readdir", "stat", "unlink", "mkdir", "rmdir", "rename",
                "glob")
    typed_ops = ("read", "write")

    for op in typed_ops:
        support = getattr(p, op)
        if support is False:
            continue
        if support is True:
            out.append(f"- `fs/{op}` — any filetype")
        else:
            assert isinstance(support, FileTypeFilter)
            types = ", ".join(t.value for t in support.filetypes) or "(none)"
            out.append(f"- `fs/{op}` — supports: {types}")

    for op in bool_ops:
        if getattr(p, op):
            out.append(f"- `fs/{op}`")

    if not out:
        out.append("- (none)")
    return out


def _render_commands(c: CommandCapabilities) -> list[str]:
    out: list[str] = []
    declared = c.model_dump(exclude_unset=False)
    for name, support in declared.items():
        if support is False or support is None:
            continue
        if support is True:
            out.append(f"- `{name}`")
            continue
        assert isinstance(support, dict)
        bits: list[str] = []
        types = support.get("filetypes")
        if types:
            bits.append("filetypes: " + ", ".join(
                t.value if isinstance(t, FileType) else str(t) for t in types))
        flags = support.get("flags")
        if flags:
            bits.extend(_render_flag_filter(flags))
        suffix = (" — " + "; ".join(bits)) if bits else ""
        out.append(f"- `{name}`{suffix}")
    if not out:
        out.append("- (none)")
    return out


def _render_flag_filter(flags: dict | None) -> list[str]:
    if not isinstance(flags, dict):
        return []
    bits: list[str] = []
    if flags.get("only"):
        bits.append("flags: " + ", ".join(flags["only"]))
        return bits
    if flags.get("include"):
        bits.append("extra flags: " + ", ".join(flags["include"]))
    if flags.get("exclude"):
        bits.append("missing flags: " + ", ".join(flags["exclude"]))
    return bits
