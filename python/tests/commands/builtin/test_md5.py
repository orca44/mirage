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

import hashlib
import os

import pytest

from mirage.commands.builtin.md5_helper import md5 as _md5_impl
from mirage.resource.disk.disk import DiskResource


def _norm(path):
    return "/" + path.strip("/")


@pytest.fixture
def local_backend(tmp_path):
    return DiskResource(str(tmp_path))


def _write(backend, path, data):
    if isinstance(backend, DiskResource):
        root = str(backend.accessor.root)
        full = os.path.join(root, path.lstrip("/"))
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "wb") as f:
            f.write(data)
    else:
        backend.accessor.store.files[_norm(path)] = data


def _rb(backend):
    if isinstance(backend, DiskResource):
        root = str(backend.accessor.root)

        def _read(path):
            full = os.path.join(root, path.lstrip("/"))
            with open(full, "rb") as f:
                return f.read()

        return _read
    store = backend.accessor.store
    return lambda path: store.files[_norm(path)]


def md5(backend, path):
    return _md5_impl(_rb(backend), path)


def test_md5_matches_hashlib(backend):
    data = b"hello"
    _write(backend, "/tmp/f.txt", data)
    assert md5(backend, "/tmp/f.txt") == hashlib.md5(data).hexdigest()


def test_md5_empty_file(backend):
    _write(backend, "/tmp/empty.txt", b"")
    assert md5(backend, "/tmp/empty.txt") == hashlib.md5(b"").hexdigest()


def test_md5_local_backend(local_backend):
    data = b"disk content"
    _write(local_backend, "/f.txt", data)
    assert md5(local_backend, "/f.txt") == hashlib.md5(data).hexdigest()
