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

from mirage.commands.builtin.gdrive.cut.cut import cut
from mirage.commands.optional import try_load_command

_logger = logging.getLogger(__name__)

cut_feather = try_load_command(
    "mirage.commands.builtin.gdrive.cut.cut_feather", "cut_feather", "parquet")
cut_hdf5 = try_load_command("mirage.commands.builtin.gdrive.cut.cut_hdf5",
                            "cut_hdf5", "hdf5")
cut_orc = try_load_command("mirage.commands.builtin.gdrive.cut.cut_orc",
                           "cut_orc", "parquet")
cut_parquet = try_load_command(
    "mirage.commands.builtin.gdrive.cut.cut_parquet", "cut_parquet", "parquet")

COMMANDS = [
    c for c in (cut, cut_parquet, cut_orc, cut_feather, cut_hdf5)
    if c is not None
]
