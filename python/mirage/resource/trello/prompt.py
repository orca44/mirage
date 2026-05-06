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

PROMPT = """\
{prefix}
  workspaces/
    <workspace-name>__<workspace-id>/
      workspace.json
      boards/
        <board-name>__<board-id>/
          board.json
          lists/
            <list-name>__<list-id>/
              list.json
              cards/
                <card-name>__<card-id>/
                  card.json
                  comments.jsonl
  Always ls directories first to discover exact names."""

WRITE_PROMPT = """\
  Write commands:
    trello-card-create <list-path> "name" "description"
    trello-card-comment-add <card-path> "comment" """
