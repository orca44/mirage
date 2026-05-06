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

# isort: skip_file
from mirage.resource.disk import DiskResource
from mirage.resource.ram import RAMResource
from mirage.commands.registry import command
from mirage.types import FileStat, MountMode
from mirage.workspace import (ExecutionHistory, ExecutionNode, ExecutionRecord,
                              Workspace, WorkspaceRunner)
from mirage.types import ConsistencyPolicy

__all__ = [
    "Workspace",
    "WorkspaceRunner",
    "RAMResource",
    "DiskResource",
    "ConsistencyPolicy",
    "ExecutionHistory",
    "ExecutionNode",
    "ExecutionRecord",
    "FileStat",
    "MountMode",
    "command",
]

__version__ = "0.0.1alpha"
