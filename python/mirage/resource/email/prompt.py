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
  <folder>/
    <yyyy-mm-dd>/
      <subject>__<uid>.email.json
      <subject>__<uid>/           # if attachments exist
        <attachment-filename>
  Folders include: INBOX, Sent, Drafts, etc. cat shows email as JSON.

  <subject> is sanitized — don't construct it; ls the date dir."""

WRITE_PROMPT = """\
  Write commands:
    email-send "to@email.com" "subject" "body"
    email-reply <email-path> "reply body"
    email-forward <email-path> "to@email.com" """
