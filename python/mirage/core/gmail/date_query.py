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

from datetime import date, timedelta


def date_dir_to_gmail_query(name: str) -> str | None:
    parts = name.split("-")
    if len(parts) != 3:
        return None
    if not (len(parts[0]) == 4 and len(parts[1]) == 2 and len(parts[2]) == 2):
        return None
    try:
        d = date(int(parts[0]), int(parts[1]), int(parts[2]))
    except ValueError:
        return None
    nxt = d + timedelta(days=1)
    return (f"after:{d.year}/{d.month:02d}/{d.day:02d} "
            f"before:{nxt.year}/{nxt.month:02d}/{nxt.day:02d}")
