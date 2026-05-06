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

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from mirage.vfp.types import FileType, Implementation, Mount, MountType


class FlagFilter(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    exclude: list[str] = Field(default_factory=list)
    include: list[str] = Field(default_factory=list)
    only: list[str] | None = None


class CommandCapability(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    filetypes: list[FileType] | None = None
    flags: FlagFilter | None = None


class FileTypeFilter(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    filetypes: list[FileType]


PosixOpSupport = bool | FileTypeFilter
CommandSupport = bool | CommandCapability


class PosixCapabilities(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    read: PosixOpSupport = False
    readdir: bool = False
    stat: bool = False
    write: PosixOpSupport = False
    unlink: bool = False
    mkdir: bool = False
    rmdir: bool = False
    rename: bool = False
    glob: bool = False


class CommandCapabilities(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    ls: CommandSupport = False
    cat: CommandSupport = False
    head: CommandSupport = False
    tail: CommandSupport = False
    wc: CommandSupport = False
    grep: CommandSupport = False
    find: CommandSupport = False
    jq: CommandSupport = False
    sed: CommandSupport = False
    cp: CommandSupport = False
    mv: CommandSupport = False


class WorkspaceCapabilities(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    snapshot: bool = False
    load: bool = False
    list: bool = False
    delete: bool = False
    info: bool = False


class ServerCapabilities(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    posix: PosixCapabilities = Field(default_factory=PosixCapabilities)
    commands: CommandCapabilities = Field(default_factory=CommandCapabilities)
    workspace: WorkspaceCapabilities = Field(
        default_factory=WorkspaceCapabilities)
    mounts: list[Mount] = Field(default_factory=list)
    meta: dict[str, Any] = Field(default_factory=dict, alias="_meta")


class CapabilityDeclaration(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    protocol_version: int = 1
    implementation: Implementation
    capabilities: ServerCapabilities


class CapabilityBuilder:

    def __init__(
        self,
        mount_type: MountType | str = MountType.FILESYSTEM,
        writable: bool = False,
    ) -> None:
        self.mount_type = mount_type
        self.writable = writable
        self.posix = PosixCapabilities()
        self.commands = CommandCapabilities()
        self.workspace = WorkspaceCapabilities()

    def advertised_filetypes(self) -> list[FileType]:
        types: set[FileType] = set()
        for op in (self.posix.read, self.posix.write):
            if isinstance(op, FileTypeFilter):
                types.update(op.filetypes)
        for cmd_name in self.commands.model_fields:
            cmd = getattr(self.commands, cmd_name)
            if isinstance(cmd, CommandCapability) and cmd.filetypes:
                types.update(cmd.filetypes)
        return sorted(types, key=lambda t: t.value)

    def to_mount(self, path: str) -> Mount:
        return Mount(
            path=path,
            type=self.mount_type,
            writable=self.writable,
            filetypes=self.advertised_filetypes(),
        )


def merge_posix(into: PosixCapabilities,
                src: PosixCapabilities) -> PosixCapabilities:
    """Union per-op support across mounts.

    Args:
        into (PosixCapabilities): existing aggregated capabilities (mutated).
        src (PosixCapabilities): per-mount capabilities to merge in.

    Returns:
        PosixCapabilities: the merged ``into`` value.
    """
    for field in into.model_fields:
        existing = getattr(into, field)
        new = getattr(src, field)
        merged = _merge_op_support(existing, new)
        setattr(into, field, merged)
    return into


def _merge_op_support(a: PosixOpSupport, b: PosixOpSupport) -> PosixOpSupport:
    if a is True or b is True:
        return True
    if a is False:
        return b
    if b is False:
        return a
    types = sorted(set(a.filetypes) | set(b.filetypes), key=lambda t: t.value)
    return FileTypeFilter(filetypes=types)


def merge_commands(into: CommandCapabilities,
                   src: CommandCapabilities) -> CommandCapabilities:
    """Union per-command support across mounts."""
    keys = set(into.model_fields) | set(src.model_dump(by_alias=False).keys())
    for key in keys:
        existing = getattr(into, key, False)
        new = getattr(src, key, False)
        merged = _merge_command_support(existing, new)
        setattr(into, key, merged)
    return into


def _merge_command_support(a: CommandSupport,
                           b: CommandSupport) -> CommandSupport:
    if a is True or b is True:
        return True
    if a is False:
        return b
    if b is False:
        return a
    types_a = a.filetypes or []
    types_b = b.filetypes or []
    merged_types = sorted(set(types_a) | set(types_b), key=lambda t: t.value)
    return CommandCapability(filetypes=merged_types or None)
