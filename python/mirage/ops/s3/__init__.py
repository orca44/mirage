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

import logging

from mirage.commands.optional import try_load_command
from mirage.ops.s3.create import create
from mirage.ops.s3.mkdir import mkdir
from mirage.ops.s3.read.read import read
from mirage.ops.s3.readdir import readdir
from mirage.ops.s3.rename import rename
from mirage.ops.s3.rmdir import rmdir
from mirage.ops.s3.stat import stat
from mirage.ops.s3.truncate import truncate
from mirage.ops.s3.unlink import unlink
from mirage.ops.s3.write import write as write_bytes

_logger = logging.getLogger(__name__)

read_feather = try_load_command("mirage.ops.s3.read.read_feather",
                                "read_feather", "parquet")
read_hdf5 = try_load_command("mirage.ops.s3.read.read_hdf5", "read_hdf5",
                             "hdf5")
read_orc = try_load_command("mirage.ops.s3.read.read_orc", "read_orc",
                            "parquet")
read_parquet = try_load_command("mirage.ops.s3.read.read_parquet",
                                "read_parquet", "parquet")

OPS = [
    c for c in (create, mkdir, read, read_feather, read_hdf5, read_orc,
                read_parquet, readdir, rename, rmdir, stat, truncate, unlink,
                write_bytes) if c is not None
]
