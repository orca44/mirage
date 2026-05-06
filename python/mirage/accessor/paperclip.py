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
import time
from pathlib import Path
from typing import Any

import aiohttp

from mirage.accessor.base import Accessor
from mirage.resource.paperclip.config import PaperclipConfig


class PaperclipAccessor(Accessor):

    def __init__(self, config: PaperclipConfig) -> None:
        self.config = config
        self._credentials: dict[str, Any] = {}
        self._id_token: str = ""
        self._id_token_expires_at: float = 0.0
        self._load_credentials()

    def _load_credentials(self) -> None:
        path = Path(self.config.credentials_path).expanduser()
        if not path.exists():
            raise FileNotFoundError(
                f"Paperclip credentials not found at {path}. "
                "Run 'paperclip login' first.")
        with open(path) as f:
            self._credentials = json.load(f)
        self._id_token = self._credentials.get("id_token", "")
        self._id_token_expires_at = float(
            self._credentials.get("id_token_expires_at", 0))

    async def _refresh_id_token(self) -> str:
        url = f"{self.config.base_url}/api/oauth/token"
        payload = {
            "grant_type": "refresh_token",
            "refresh_token": self._credentials["refresh_token"],
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as resp:
                if resp.status != 200:
                    raise PermissionError("Failed to refresh Paperclip token")
                data = await resp.json()
        self._id_token = data["id_token"]
        self._id_token_expires_at = time.time() + int(
            data.get("expires_in", 3600))
        if data.get("refresh_token"):
            self._credentials["refresh_token"] = data["refresh_token"]
        return self._id_token

    async def _get_id_token(self) -> str:
        margin = 300
        if self._id_token and time.time() < self._id_token_expires_at - margin:
            return self._id_token
        return await self._refresh_id_token()

    async def _get_headers(self) -> dict[str, str]:
        token = await self._get_id_token()
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        }

    async def execute(self, command: str, raw: str = "") -> dict:
        """Execute a Paperclip CLI command via the API.

        Args:
            command (str): The command to execute.
            raw (str): Optional raw input for the command.

        Returns:
            dict: Response containing output, elapsed_ms, and result_id.
        """
        url = f"{self.config.base_url}/api/cli/execute"
        headers = await self._get_headers()
        payload = {"command": command, "raw": raw}
        timeout = aiohttp.ClientTimeout(total=120)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, json=payload,
                                    headers=headers) as resp:
                if resp.status in (401, 403):
                    raise PermissionError(
                        f"Paperclip auth failed (HTTP {resp.status})")
                if resp.status == 429:
                    raise RuntimeError("Rate limited by Paperclip API")
                resp.raise_for_status()
                return await resp.json()
