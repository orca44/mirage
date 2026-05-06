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

from mirage.provision import ProvisionResult
from mirage.workspace.session import Session


async def handle_redirect_provision(
    provision_node_fn,
    command: Any,
    session: Session,
) -> ProvisionResult:
    """Plan a redirect: plan the command, add write cost."""
    return await provision_node_fn(command, session)
