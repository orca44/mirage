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

from mirage.utils.sanitize import sanitize_name


def split_suffix_id(name: str, *, suffix: str = "") -> tuple[str, str]:
    if suffix and not name.endswith(suffix):
        raise FileNotFoundError(name)
    raw = name[:-len(suffix)] if suffix else name
    label, sep, object_id = raw.rpartition("__")
    if not sep or not object_id:
        raise FileNotFoundError(name)
    return label, object_id


def team_dirname(team: dict) -> str:
    parts: list[str] = []
    if team.get("key"):
        parts.append(sanitize_name(team["key"]))
    if team.get("name"):
        sanitized_name = sanitize_name(team["name"])
        if sanitized_name not in parts:
            parts.append(sanitized_name)
    if not parts:
        parts.append("team")
    return f"{'__'.join(parts)}__{team['id']}"


def member_filename(user: dict) -> str:
    label = sanitize_name(
        user.get("displayName") or user.get("name") or user.get("email")
        or "user")
    return f"{label}__{user['id']}.json"


def issue_dirname(issue: dict) -> str:
    key = issue.get("identifier") or issue.get("id") or "issue"
    return f"{sanitize_name(key)}__{issue['id']}"


def project_filename(project: dict) -> str:
    label = sanitize_name(project.get("name") or "project")
    return f"{label}__{project['id']}.json"


def cycle_filename(cycle: dict) -> str:
    label = sanitize_name(cycle.get("name") or "cycle")
    return f"{label}__{cycle['id']}.json"
