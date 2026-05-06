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

from mirage.commands.builtin.s3.grep.grep import grep
from mirage.commands.optional import try_load_command

_logger = logging.getLogger(__name__)

grep_feather = try_load_command("mirage.commands.builtin.s3.grep.grep_feather",
                                "grep_feather", "parquet")
grep_hdf5 = try_load_command("mirage.commands.builtin.s3.grep.grep_hdf5",
                             "grep_hdf5", "hdf5")
grep_orc = try_load_command("mirage.commands.builtin.s3.grep.grep_orc",
                            "grep_orc", "parquet")
grep_parquet = try_load_command("mirage.commands.builtin.s3.grep.grep_parquet",
                                "grep_parquet", "parquet")

COMMANDS = [
    c for c in (grep, grep_parquet, grep_orc, grep_feather, grep_hdf5)
    if c is not None
]
