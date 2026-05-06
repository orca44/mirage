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

import boto3
import pytest
from moto import mock_aws

from mirage.resource.disk import DiskResource
from mirage.resource.ram import RAMResource
from mirage.resource.s3.s3 import S3Config, S3Resource
from mirage.types import MountMode
from mirage.workspace.mount import MountRegistry


def _ram_write(p: RAMResource, path: str, data: bytes) -> None:
    """Write file to RAMResource store directly (sync, for test setup)."""
    key = "/" + path.strip("/")
    parts = key.strip("/").split("/")
    for i in range(len(parts) - 1):
        p._store.dirs.add("/" + "/".join(parts[:i + 1]))
    p._store.files[key] = data


@pytest.fixture
def ram_resource():
    """A RAMResource with test data."""
    p = RAMResource()
    _ram_write(p, "/hello.txt", b"hello world\n")
    _ram_write(p, "/nums.txt", b"3\n1\n2\n")
    _ram_write(p, "/sub/nested.txt", b"nested\n")
    return p


@pytest.fixture
def empty_resource():
    """An empty RAMResource."""
    return RAMResource()


@pytest.fixture
def disk_resource(tmp_path):
    """A DiskResource backed by a temporary directory."""
    data_dir = tmp_path / "disk_data"
    data_dir.mkdir()
    (data_dir / "readme.txt").write_bytes(b"disk file\n")
    sub = data_dir / "sub"
    sub.mkdir()
    (sub / "deep.txt").write_bytes(b"deep content\n")
    return DiskResource(root=str(data_dir))


@pytest.fixture
def s3_resource():
    """An S3Resource backed by moto mock."""
    with mock_aws():
        conn = boto3.client("s3", region_name="us-east-1")
        conn.create_bucket(Bucket="test-bucket")
        conn.put_object(Bucket="test-bucket",
                        Key="data/report.csv",
                        Body=b"col1,col2\n1,2\n")
        conn.put_object(Bucket="test-bucket",
                        Key="data/summary.txt",
                        Body=b"summary\n")

        config = S3Config(
            bucket="test-bucket",
            region="us-east-1",
            endpoint_url=None,
        )
        yield S3Resource(config)


@pytest.fixture
def registry(ram_resource):
    """MountRegistry with /data/ mounted to RAMResource."""
    reg = MountRegistry()
    reg.mount("/data/", ram_resource, MountMode.WRITE)
    return reg


@pytest.fixture
def multi_registry(s3_resource, disk_resource, ram_resource):
    """MountRegistry with S3, disk, and RAM mounts."""
    reg = MountRegistry()
    reg.mount("/s3/", s3_resource, MountMode.READ)
    reg.mount("/disk/", disk_resource, MountMode.WRITE)
    reg.mount("/ram/", ram_resource, MountMode.WRITE)
    return reg


@pytest.fixture
def nested_registry():
    """MountRegistry with nested prefixes."""
    p1 = RAMResource()
    p1._store.files["/file.txt"] = b"outer\n"
    p2 = RAMResource()
    p2._store.files["/deep.txt"] = b"inner\n"

    reg = MountRegistry()
    reg.mount("/data/", p1, MountMode.WRITE)
    reg.mount("/data/sub/", p2, MountMode.WRITE)
    return reg
