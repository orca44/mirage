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

from contextvars import ContextVar, Token

from mirage.workspace.session.session import Session

_current_session: ContextVar[Session | None] = ContextVar(
    "mirage_current_session",
    default=None,
)


def set_current_session(session: Session | None) -> Token:
    """Bind ``session`` to the current async context."""
    return _current_session.set(session)


def reset_current_session(token: Token) -> None:
    """Restore the previous session binding."""
    _current_session.reset(token)


def get_current_session() -> Session | None:
    """Return the session bound to the current async context, if any."""
    return _current_session.get()


def assert_mount_allowed(mount_prefix: str) -> None:
    """Raise PermissionError if the current session may not touch this mount.

    No-op when no session is bound or the session is unrestricted
    (``allowed_mounts is None``). The session's ``allowed_mounts`` is
    expected to already include any infrastructure prefixes (observer,
    ``/dev``) added at session-creation time.

    Args:
        mount_prefix (str): the mount's prefix, e.g. ``/s3`` or ``/`` for the
            cache root.

    Raises:
        PermissionError: the mount lies outside the session's allowlist.
    """
    sess = get_current_session()
    if sess is None or sess.allowed_mounts is None:
        return
    norm = "/" + mount_prefix.strip("/") if mount_prefix.strip("/") else "/"
    if norm == "/" or norm in sess.allowed_mounts:
        return
    raise PermissionError(
        f"session {sess.session_id!r} not allowed to access "
        f"mount {norm!r}")
