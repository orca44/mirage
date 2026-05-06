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

import os
import subprocess
import sys
import threading
import time

import mfusepy as fuse

from mirage.fuse.fs import MirageFS
from mirage.workspace import Workspace


def _run_fuse(fs: MirageFS, mountpoint: str, foreground: bool) -> None:
    fuse.FUSE(fs,
              mountpoint,
              nothreads=True,
              foreground=foreground,
              direct_io=True)


def mount_background(ws: Workspace,
                     mountpoint: str,
                     agent_id: str | None = None) -> threading.Thread:
    fs = MirageFS(ws, agent_id=agent_id)
    t = threading.Thread(target=_run_fuse,
                         args=(fs, mountpoint, True),
                         daemon=True)
    t.start()
    time.sleep(0.3)
    return t


def mount(ws: Workspace | None = None,
          mountpoint: str = "",
          foreground: bool = True,
          agent_id: str | None = None,
          fs: MirageFS | None = None,
          daemon: bool = False,
          post_fork=None) -> None:
    if fs is None:
        fs = MirageFS(ws, agent_id=agent_id)
    if daemon:
        pid = os.fork()
        if pid > 0:
            os._exit(0)
        os.setsid()
        if post_fork:
            post_fork()
        _run_fuse(fs, mountpoint, foreground=True)
        return
    t = threading.Thread(
        target=_run_fuse,
        args=(fs, mountpoint, foreground),
        daemon=True,
    )
    if post_fork:
        post_fork()
    t.start()
    try:
        while t.is_alive():
            t.join(timeout=0.5)
    except KeyboardInterrupt:
        print("\nUnmounting...", flush=True)
        if sys.platform == "darwin":
            subprocess.run(
                ["diskutil", "unmount", "force", mountpoint],
                capture_output=True,
            )
        else:
            subprocess.run(["fusermount", "-u", mountpoint],
                           capture_output=True)
        t.join(timeout=5)
