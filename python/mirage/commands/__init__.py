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

from typing import Callable

from mirage.commands.builtin.ram.cat import cat
from mirage.commands.builtin.ram.cp import cp
from mirage.commands.builtin.ram.cut import cut
from mirage.commands.builtin.ram.diff import diff
from mirage.commands.builtin.ram.du import du
from mirage.commands.builtin.ram.file import file
from mirage.commands.builtin.ram.find import find
from mirage.commands.builtin.ram.grep import grep
from mirage.commands.builtin.ram.head import head
from mirage.commands.builtin.ram.ls import ls
from mirage.commands.builtin.ram.md5 import md5
from mirage.commands.builtin.ram.mkdir import mkdir
from mirage.commands.builtin.ram.mv import mv
from mirage.commands.builtin.ram.nl import nl
from mirage.commands.builtin.ram.rg import rg
from mirage.commands.builtin.ram.rm import rm
from mirage.commands.builtin.ram.sed import sed
from mirage.commands.builtin.ram.sort import sort
from mirage.commands.builtin.ram.stat import stat
from mirage.commands.builtin.ram.tail import tail
from mirage.commands.builtin.ram.tee import tee
from mirage.commands.builtin.ram.touch import touch
from mirage.commands.builtin.ram.tr import tr
from mirage.commands.builtin.ram.tree import tree
from mirage.commands.builtin.ram.uniq import uniq
from mirage.commands.builtin.ram.wc import wc
from mirage.commands.spec import _resolve

COMMANDS: dict[str, Callable] = {
    "ls": ls,
    "stat": stat,
    "find": find,
    "tree": tree,
    "du": du,
    "cat": cat,
    "head": head,
    "tail": tail,
    "wc": wc,
    "md5": md5,
    "diff": diff,
    "file": file,
    "nl": nl,
    "grep": grep,
    "rg": rg,
    "sort": sort,
    "uniq": uniq,
    "cut": cut,
    "tr": tr,
    "mkdir": mkdir,
    "touch": touch,
    "cp": cp,
    "mv": mv,
    "rm": rm,
    "sed": sed,
    "tee": tee,
}

__all__ = ["COMMANDS", "_resolve"]
