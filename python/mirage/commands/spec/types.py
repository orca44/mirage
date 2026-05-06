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

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class OperandKind(str, Enum):
    NONE = "none"
    PATH = "path"
    TEXT = "text"


@dataclass(frozen=True)
class Option:
    short: str | None = None
    long: str | None = None
    value_kind: OperandKind = OperandKind.NONE
    numeric_shorthand: bool = False
    description: str | None = None


@dataclass(frozen=True)
class Operand:
    kind: OperandKind = OperandKind.PATH


@dataclass(frozen=True)
class CommandSpec:
    options: tuple[Option, ...] = ()
    positional: tuple[Operand, ...] = ()
    rest: Operand | None = None
    ignore_tokens: frozenset[str] = frozenset()
    description: str | None = None


@dataclass
class ParsedArgs:
    flags: dict[str, str | bool]
    args: list[tuple[str, OperandKind]]
    cache_paths: list[str] = field(default_factory=list)
    path_flag_values: list[str] = field(default_factory=list)

    def paths(self) -> list[str]:
        return [v for v, k in self.args if k == OperandKind.PATH]

    def routing_paths(self) -> list[str]:
        return self.paths() + self.path_flag_values

    def texts(self) -> list[str]:
        return [v for v, k in self.args if k == OperandKind.TEXT]

    def flag(self, name: str, default: Any = None) -> Any:
        return self.flags.get(name, default)
