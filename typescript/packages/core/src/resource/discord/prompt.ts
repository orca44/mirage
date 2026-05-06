// ========= Copyright 2026 @ Strukto.AI All Rights Reserved. =========
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ========= Copyright 2026 @ Strukto.AI All Rights Reserved. =========

export const DISCORD_PROMPT = `{prefix}
  <guild-name>__<id>/
    channels/
      <channel-name>__<id>/
        <yyyy-mm-dd>.jsonl       # messages for that date
    members/
      <username>__<id>.json      # member profile
  <guild-name> and <channel-name> are sanitized — don't construct them.
  Always ls directories first to discover exact names.
  Messages are JSONL — use jq to extract .content, .author.username.`

export const DISCORD_WRITE_PROMPT = `  Write commands:
    discord-send-message --channel_id=<id> --text="message"
    discord-add-reaction --channel_id=<id> --message_id=<id> --reaction="emoji"`
