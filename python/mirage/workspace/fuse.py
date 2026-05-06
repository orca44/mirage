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

import sys
from threading import Thread


class FuseManager:

    def __init__(self) -> None:
        self._mountpoint: str | None = None
        self._thread: Thread | None = None
        self._auto: bool = False

    @property
    def mountpoint(self) -> str | None:
        return self._mountpoint

    @mountpoint.setter
    def mountpoint(self, path: str | None) -> None:
        self._mountpoint = path

    def setup(self, ws: object) -> None:
        import tempfile

        from mirage.fuse.mount import mount_background
        self._mountpoint = tempfile.mkdtemp(prefix="mirage-")
        self._thread = mount_background(ws, self._mountpoint)
        self._auto = True

    def unmount(self) -> None:
        if not self._mountpoint:
            return
        import subprocess as _sp
        if sys.platform == "darwin":
            _sp.run(["diskutil", "unmount", "force", self._mountpoint],
                    capture_output=True)
        else:
            _sp.run(["fusermount", "-u", self._mountpoint],
                    capture_output=True)
        try:
            import os as _os
            _os.rmdir(self._mountpoint)
        except OSError:
            pass
        self._mountpoint = None

    def close(self) -> None:
        if self._mountpoint and self._auto:
            self.unmount()
