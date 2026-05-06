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

import json

from mirage.core.slack.scope import SlackScope
from mirage.core.slack.search import format_grep_results


def test_format_grep_results_path_uses_chat_jsonl():
    raw_payload = {
        "messages": {
            "matches": [
                {
                    "channel": {
                        "id": "C001",
                        "name": "general"
                    },
                    "user": "U1",
                    "ts": "1712707200.0",
                    "text": "hello",
                },
            ],
        },
    }
    raw = json.dumps(raw_payload).encode()
    scope = SlackScope(
        use_native=True,
        container="channels",
        channel_name="general",
        channel_id="C001",
        target="messages",
    )
    lines = format_grep_results(raw, scope, "/slack")
    assert len(lines) == 1
    line = lines[0]
    assert line.startswith(
        "/slack/channels/general__C001/2024-04-10/chat.jsonl:"), line
