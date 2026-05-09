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

import asyncio
import builtins
import logging
import sys
import time
from collections.abc import AsyncIterator
from dataclasses import replace
from typing import Any

from mirage.cache.file import io as cache_io
from mirage.cache.file.config import CacheConfig, RedisCacheConfig
from mirage.cache.file.ram import RAMFileCacheStore
from mirage.commands.builtin.general import HISTORY_COMMANDS

try:
    from mirage.cache.file.redis import RedisFileCacheStore
except ImportError:
    RedisFileCacheStore = None  # type: ignore[misc, assignment]
from mirage.io import IOResult
from mirage.observe.context import start_recording, stop_recording
from mirage.observe.observer import Observer
from mirage.ops import Ops
from mirage.ops.open import make_open
from mirage.ops.os_patch import make_os_module
from mirage.provision import ProvisionResult
from mirage.resource.base import BaseResource
from mirage.resource.ram import RAMResource
from mirage.shell.barrier import BarrierPolicy, apply_barrier
from mirage.shell.job_table import JobTable
from mirage.shell.parse import find_syntax_error, parse
from mirage.types import (DEFAULT_AGENT_ID, DEFAULT_SESSION_ID,
                          ConsistencyPolicy, FileStat, MountMode, PathSpec)
from mirage.workspace.abort import MirageAbortError
from mirage.workspace.fuse import FuseManager
from mirage.workspace.history import ExecutionHistory
from mirage.workspace.mount import Mount, MountRegistry
from mirage.workspace.native import native_exec
from mirage.workspace.node import execute_node as _execute_node
from mirage.workspace.node import provision_node
from mirage.workspace.session import (Session, SessionManager,
                                      assert_mount_allowed,
                                      reset_current_session,
                                      set_current_session)
from mirage.workspace.snapshot import (apply_state_dict, build_mount_args,
                                       norm_mount_prefix, read_tar)
from mirage.workspace.snapshot import snapshot as _write_snapshot
from mirage.workspace.snapshot import to_state_dict
from mirage.workspace.types import ExecutionNode, ExecutionRecord

logger = logging.getLogger(__name__)

_DISPATCH_READ_OPS = frozenset({"read", "read_bytes"})
_DISPATCH_WRITE_OPS = frozenset(
    {"write", "write_bytes", "append", "unlink", "create", "truncate"})

_HELP_HINT = (
    "Tip: run `man` to list every available command grouped by resource, "
    "`man <cmd>` for a single entry, and `<cmd> --help` for flag details.")


class Workspace:
    """Unified virtual filesystem over heterogeneous resources.

    Manages mounts, caching, and command execution.
    All ops are forwarded directly to the resolved resource.
    """

    def __init__(
        self,
        resources: dict[str, BaseResource | tuple],
        cache_limit: str | int = "512MB",
        cache: CacheConfig | None = None,
        mode: MountMode = MountMode.READ,
        consistency: ConsistencyPolicy = ConsistencyPolicy.LAZY,
        history: int | None = 100,
        history_path: str | None = None,
        session_id: str = DEFAULT_SESSION_ID,
        agent_id: str = DEFAULT_AGENT_ID,
        fuse: bool = False,
        native: bool = False,
        observe: BaseResource | None = None,
        observe_prefix: str = "/.sessions",
    ) -> None:
        self._registry = MountRegistry()
        if isinstance(cache, RedisCacheConfig):
            if RedisFileCacheStore is None:
                raise ImportError(
                    "RedisCacheConfig requires the 'redis' extra. "
                    "Install with: pip install mirage-ai[redis]")
            self._cache = RedisFileCacheStore(
                cache_limit=cache.limit,
                url=cache.url,
                key_prefix=cache.key_prefix,
                max_drain_bytes=cache.max_drain_bytes,
            )
        else:
            limit = cache.limit if cache is not None else cache_limit
            max_drain = cache.max_drain_bytes if cache is not None else None
            self._cache = RAMFileCacheStore(cache_limit=limit,
                                            max_drain_bytes=max_drain)
        self._registry.set_default_mount(self._cache)
        self._locked_paths: set[str] = set()
        self._closed = False
        self.job_table = JobTable()
        self._current_agent_id: str = agent_id
        self._default_session_id = session_id
        self._default_agent_id = agent_id
        self._session_mgr = SessionManager(session_id)
        self._consistency = consistency
        self._registry.set_consistency(consistency)

        for prefix, value in resources.items():
            if isinstance(value, tuple) and len(value) >= 2:
                prov = value[0]
                mount_mode = value[1]
            else:
                prov = value
                mount_mode = mode
            self._registry.mount(prefix, prov, mount_mode)

        self._fuse = FuseManager()
        self._native = native
        self.history: ExecutionHistory | None = (ExecutionHistory(
            max_entries=history,
            persist_path=history_path,
        ) if history is not None else None)

        observe_resource = (observe if observe is not None else RAMResource())
        self.observer = Observer(resource=observe_resource,
                                 prefix=observe_prefix)
        self._registry.mount(observe_prefix, observe_resource, MountMode.READ)

        self._ops = Ops(self._registry.ops_mounts(),
                        on_write=self._invalidate_cache_if_remote,
                        observer=self.observer,
                        agent_id=agent_id,
                        session_id=session_id)

        if self.history is not None:
            for m in self._registry.mounts():
                for rc in HISTORY_COMMANDS:
                    m.register_general(rc)
            default = self._registry.default_mount
            if default is not None:
                for rc in HISTORY_COMMANDS:
                    default.register_general(rc)

        if fuse:
            self._fuse.setup(self)

    @property
    def ops(self) -> Ops:
        return self._ops

    @property
    def cache(self):
        return self._cache

    @property
    def cache_mount(self) -> Mount:
        m = self._registry.default_mount
        assert m is not None, "cache mount is initialized in __init__"
        return m

    @property
    def max_drain_bytes(self) -> int | None:
        return self._cache.max_drain_bytes

    @max_drain_bytes.setter
    def max_drain_bytes(self, value: int | None) -> None:
        self._cache.max_drain_bytes = value

    def mounts(self) -> list:
        return self._registry.mounts()

    def mount(self, prefix: str):
        return self._registry.mount_for(prefix)

    async def unmount(self, prefix: str) -> None:
        if self._closed:
            raise RuntimeError("Workspace is closed")
        stripped = prefix.strip("/")
        norm = ("/" + stripped + "/" if stripped else "/")
        if norm in ("/", "/_default/"):
            raise ValueError(f"cannot unmount cache root: {prefix!r}")
        if norm == "/dev/":
            raise ValueError("cannot unmount reserved prefix: '/dev/'")
        observer_norm = ("/" + self.observer.prefix.strip("/") +
                         "/" if self.observer.prefix.strip("/") else "/")
        if norm == observer_norm:
            raise ValueError(f"cannot unmount observer prefix: "
                             f"{self.observer.prefix!r}")
        removed = self._registry.unmount(prefix)
        self._ops.unmount(prefix)
        still_mounted = any(m.resource is removed.resource
                            for m in self._registry.mounts())
        if not still_mounted:
            self._ops._registry.unregister_resource(removed.resource.name)
            close = getattr(removed.resource, "close", None)
            if callable(close):
                result = close()
                if hasattr(result, "__await__"):
                    await result

    def set_fuse_mountpoint(self, path: str | None) -> None:
        self._fuse.mountpoint = path

    @property
    def fuse_mountpoint(self) -> str | None:
        return self._fuse.mountpoint

    @property
    def _cwd(self) -> str:
        return self._session_mgr.cwd

    @_cwd.setter
    def _cwd(self, value: str) -> None:
        self._session_mgr.cwd = value

    @property
    def env(self) -> dict[str, str]:
        return self._session_mgr.env

    @env.setter
    def env(self, value: dict[str, str]) -> None:
        self._session_mgr.env = value

    @property
    def file_prompt(self) -> str:
        parts: list[str] = [_HELP_HINT]
        for m in self._registry.mounts():
            prompt = m.resource.PROMPT
            if not prompt:
                continue
            prefix = m.prefix.rstrip("/") or "/"
            section = prompt.format(prefix=prefix)
            if m.mode != MountMode.READ and m.resource.WRITE_PROMPT:
                section += "\n" + m.resource.WRITE_PROMPT.replace(
                    "{prefix}", prefix)
            parts.append(section)
        return "\n\n".join(parts)

    # ── lifecycle ───────────────────────────────────────────────────────────

    def __enter__(self) -> "Workspace":
        self._original_open = builtins.open
        self._original_os = sys.modules["os"]
        builtins.open = make_open(self._ops)
        sys.modules["os"] = make_os_module(self._ops)
        return self

    def __exit__(self, *_: object) -> None:
        builtins.open = self._original_open
        sys.modules["os"] = self._original_os
        self._close_parts()

    def _close_parts(self) -> None:
        self._fuse.close()
        if self._closed:
            return
        self._closed = True
        for job in self.job_table.running_jobs():
            self.job_table.kill(job.id)
        for task in self._cache._drain_tasks.values():
            task.cancel()
        self._cache._drain_tasks.clear()

    async def close(self) -> None:
        drain_tasks = list(self._cache._drain_tasks.values())
        self._close_parts()
        for task in drain_tasks:
            try:
                await task
            except asyncio.CancelledError:
                pass
        await self._cache.clear()

    # ── snapshot / load / copy ─────────────────────────────────────────────

    def snapshot(self, target, *, compress: str | None = None) -> None:
        """Serialize this workspace to a tar.

        Args:
            target: filesystem path OR a writable file-like object.
            compress: None | "gz" | "bz2" | "xz".
        """
        _write_snapshot(self, target, compress=compress)

    @classmethod
    def load(cls, source, *, resources: dict | None = None) -> "Workspace":
        """Reconstruct a Workspace from a tar.

        Args:
            source: filesystem path OR a readable file-like object.
            resources: {prefix: Resource} overrides for mounts that
                were saved with redacted creds.
        """
        state = read_tar(source)
        return cls._from_state(state, resources=resources)

    def copy(self) -> "Workspace":
        # Reuse this process's resources so remote backends (S3, Redis,
        # GDrive) stay shared between original and copy. Local backends
        # (RAM, Disk) restore their content fresh into the new resources
        # — see snapshot.api.snapshot docstring for the rationale.
        # Only reuse resources whose state declares needs_override=True
        # (S3, Redis, GDrive...). Local content resources (RAM, Disk)
        # are reconstructed fresh so the copy's writes don't clobber
        # the original's in-process data.
        state = to_state_dict(self)
        auto_prefixes = {"/dev/"}
        if self.observer is not None:
            auto_prefixes.add(norm_mount_prefix(self.observer.prefix))
        prefix_to_resource = {
            m.prefix: m.resource
            for m in self._registry.mounts() if m.prefix not in auto_prefixes
        }
        resources = {
            m["prefix"]: prefix_to_resource[m["prefix"]]
            for m in state["mounts"]
            if m["resource_state"].get("needs_override")
            and m["prefix"] in prefix_to_resource
        }
        return type(self)._from_state(state, resources=resources)

    @classmethod
    def _from_state(cls,
                    state: dict,
                    *,
                    resources: dict | None = None) -> "Workspace":
        args = build_mount_args(state, resources)
        ws = cls(args.mount_args,
                 consistency=args.consistency,
                 session_id=args.default_session_id,
                 agent_id=args.default_agent_id)
        apply_state_dict(ws, state)
        return ws

    def __deepcopy__(self, memo) -> "Workspace":
        return self.copy()

    def __copy__(self) -> "Workspace":
        raise NotImplementedError("Workspace has no useful shallow copy — "
                                  "use ws.copy() or copy.deepcopy(ws).")

    # ── session lifecycle ──────────────────────────────────────────────────

    def create_session(
            self,
            session_id: str,
            allowed_mounts: frozenset[str] | None = None) -> Session:
        if allowed_mounts is not None:
            normalized = {("/" + m.strip("/")) for m in allowed_mounts}
            normalized.add("/dev")
            if self.observer is not None:
                normalized.add("/" + self.observer.prefix.strip("/"))
            allowed_mounts = frozenset(normalized)
        return self._session_mgr.create(session_id,
                                        allowed_mounts=allowed_mounts)

    def get_session(self, session_id: str) -> Session:
        return self._session_mgr.get(session_id)

    def list_sessions(self) -> list[Session]:
        return self._session_mgr.list()

    async def close_session(self, session_id: str) -> None:
        await self._session_mgr.close(session_id)

    async def close_all_sessions(self) -> None:
        await self._session_mgr.close_all()

    # ── mount management ────────────────────────────────────────────────────

    async def dispatch(self, op: str, path: PathSpec,
                       **kwargs: Any) -> tuple[Any, IOResult]:
        mount = self._registry.mount_for(path.original)
        assert_mount_allowed(mount.prefix)
        cacheable = mount.resource.is_remote is True

        if cacheable and op in _DISPATCH_READ_OPS:
            cached = await self._cache.get(path.original)
            if cached is not None:
                if self._consistency == ConsistencyPolicy.ALWAYS:
                    try:
                        remote_stat = await mount.execute_op(
                            "stat", path.original)
                    except FileNotFoundError:
                        await self._cache.remove(path.original)
                        raise
                    if (remote_stat is not None
                            and remote_stat.fingerprint is not None):
                        fresh = await self._cache.is_fresh(
                            path.original, remote_stat.fingerprint)
                        if not fresh:
                            await self._cache.remove(path.original)
                            cached = None
                if cached is not None:
                    return cached, IOResult(reads={path.original: cached})

        result = await mount.execute_op(op, path.original, **kwargs)
        if op in _DISPATCH_WRITE_OPS:
            await self._invalidate_after_write(mount, path.original)
        return result, IOResult()

    async def stat(self, path: str) -> FileStat:
        scope = PathSpec(original=path, directory=path, resolved=True)
        result, _ = await self.dispatch("stat", scope)
        return result

    async def readdir(self, path: str) -> list[str]:
        scope = PathSpec(original=path, directory=path, resolved=False)
        raw, _ = await self.dispatch("readdir", scope)
        return raw

    # ── execution ────────────────────────────────────────────────────────────

    async def apply_io(self, io: IOResult) -> None:
        await cache_io.apply_io(self._cache, io, self._is_cacheable_path)
        if io.writes:
            await self._invalidate_index_dirs(io)

    def _is_cacheable_path(self, path: str) -> bool:
        try:
            mount = self._registry.mount_for(path)
        except ValueError:
            return False
        return mount.resource.is_remote is True

    async def _invalidate_cache_if_remote(self, path: str) -> None:
        if self._is_cacheable_path(path):
            await self._cache.remove(path)

    async def _invalidate_after_write(self, mount: Mount, path: str) -> None:
        """Drop file-cache entry and stale parent index after a write.

        Closes the gap where dispatch-level writes (cross-mount cp,
        wget -O, curl -o, redirect) would update the file cache but
        leave readdir/stat returning the previously cached parent
        directory listing.
        """
        if mount.resource.is_remote is True:
            await self._cache.remove(path)
        idx = getattr(mount.resource, "index", None)
        if idx is not None:
            parent = path.rsplit("/", 1)[0] or "/"
            await idx.invalidate_dir(parent)
            await idx.invalidate_dir(parent + "/")

    async def _invalidate_index_dirs(self, io: IOResult) -> None:
        dirs_seen: set[str] = set()
        for path in io.writes:
            try:
                mount = self._registry.mount_for(path)
            except ValueError:
                continue
            parent = path.rsplit("/", 1)[0] or "/"
            if parent in dirs_seen:
                continue
            dirs_seen.add(parent)
            idx = mount.resource.index
            await idx.invalidate_dir(parent)
            await idx.invalidate_dir(parent + "/")

    async def _record_execution(
        self,
        command: str,
        io: IOResult,
        exec_node: ExecutionNode,
        agent_id: str,
        session_id: str,
        stdin: AsyncIterator[bytes] | bytes | None,
        provision: bool,
    ) -> None:
        try:
            session_cwd = self._session_mgr.get(session_id).cwd
        except KeyError:
            session_cwd = None
        if not provision and self.observer is not None and exec_node.records:
            for rec in exec_node.records:
                await self.observer.log_op(rec, agent_id, session_id,
                                           session_cwd)
        if self.history is not None and not provision:
            stdin_bytes = stdin if isinstance(stdin, bytes) else None
            exec_record = ExecutionRecord(
                agent=agent_id,
                command=command,
                stdout=await io.materialize_stdout(),
                stdin=stdin_bytes,
                exit_code=io.exit_code,
                tree=exec_node,
                timestamp=time.time(),
                session_id=session_id,
            )
            self.history.append(exec_record)
            if self.observer is not None:
                await self.observer.log_command(exec_record, session_cwd)

    async def execute(
        self,
        command: str,
        session_id: str = DEFAULT_SESSION_ID,
        stdin: AsyncIterator[bytes] | bytes | None = None,
        provision: bool = False,
        agent_id: str = DEFAULT_AGENT_ID,
        native: bool | None = None,
        cwd: str | None = None,
        env: dict[str, str] | None = None,
        cancel: asyncio.Event | None = None,
    ) -> IOResult | ProvisionResult:
        """Execute a shell command in the workspace.

        Args:
            command: The shell command string to execute.
            session_id: Session whose persistent state hosts the command.
            stdin: Optional stdin payload (bytes or async byte iterator).
            provision: If True, return a ProvisionResult instead of running.
            agent_id: Agent identifier for observability and history.
            native: Force native FUSE execution; defaults to workspace setting.
            cwd: Per-call working directory override. When provided, the
                command runs in an ephemeral session clone (bash subshell
                semantics): the persistent session's cwd is unchanged and
                any `cd` inside the command does not leak.
            env: Per-call environment overrides layered on top of the
                session's env. Like cwd, these apply only to an ephemeral
                clone, so `export` inside the command does not leak back
                to the persistent session.
            cancel: Optional asyncio.Event used to abort execution
                mid-flight. When set, the executor raises MirageAbortError
                at the next gate (entry to each node) and races inside
                blocking sleeps so cancellation is observed promptly.
        """
        if cancel is not None and cancel.is_set():
            raise MirageAbortError()
        use_native = native if native is not None else self._native
        if use_native:
            if not self._fuse.mountpoint:
                logger.warning(
                    "native=True requires FUSE. Install macFUSE (macOS) "
                    "or libfuse (Linux). Falling back to virtual mode.")
            else:
                stdout, stderr, code = await native_exec(
                    command, cwd=self._fuse.mountpoint)
                return IOResult(exit_code=code, stderr=stderr, stdout=stdout)

        session = self._session_mgr.get(session_id)
        use_override = cwd is not None or env is not None
        effective_session = (replace(
            session,
            cwd=cwd if cwd is not None else session.cwd,
            env={
                **session.env,
                **(env or {})
            },
            functions=dict(session.functions),
        ) if use_override else session)
        self._current_agent_id = agent_id
        io = IOResult()
        exec_node = ExecutionNode(command=command, exit_code=0)

        async def _exec_for_recursion(cmd: str, **opts: Any) -> Any:
            return await self.execute(cmd, cancel=cancel, **opts)

        session_token = set_current_session(effective_session)
        try:
            ast = parse(command)
            offending = find_syntax_error(ast)
            if offending is not None:
                snippet = offending.strip()[:40]
                err = (f"mirage: syntax error near {snippet!r}\n".encode()
                       if snippet else b"mirage: syntax error in command\n")
                io = IOResult(exit_code=2, stderr=err)
                exec_node = ExecutionNode(command=command,
                                          stderr=err,
                                          exit_code=2)
                return io
            if provision:
                return await provision_node(self._registry, self.dispatch,
                                            _exec_for_recursion, ast,
                                            effective_session)
            records = start_recording()
            stdout, io, exec_node = await _execute_node(
                self.dispatch,
                self._registry,
                self.job_table,
                _exec_for_recursion,
                self._current_agent_id,
                ast,
                effective_session,
                stdin,
                history=self.history,
                cancel=cancel,
            )
            stdout = await apply_barrier(stdout, io, BarrierPolicy.VALUE)
            session.last_exit_code = io.exit_code
            stop_recording()
            self._ops.records.extend(records)
            exec_node.records = records
            io.stdout = stdout
            await self.apply_io(io)
            return io
        except MirageAbortError:
            raise
        except Exception as exc:
            io = IOResult(exit_code=1, stderr=str(exc).encode())
            exec_node = ExecutionNode(command=command,
                                      stderr=str(exc).encode(),
                                      exit_code=1)
            return io
        finally:
            reset_current_session(session_token)
            await self._record_execution(command, io, exec_node, agent_id,
                                         session_id, stdin, provision)
