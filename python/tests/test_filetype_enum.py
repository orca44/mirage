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

from mirage.types import FileType
from mirage.utils.filetype import guess_type


def test_parquet_type():
    assert guess_type("data.parquet") == FileType.PARQUET


def test_orc_type():
    assert guess_type("data.orc") == FileType.ORC


def test_feather_type():
    assert guess_type("data.feather") == FileType.FEATHER


def test_feather_arrow_type():
    assert guess_type("data.arrow") == FileType.FEATHER


def test_feather_ipc_type():
    assert guess_type("data.ipc") == FileType.FEATHER


def test_hdf5_type():
    assert guess_type("data.h5") == FileType.HDF5


def test_hdf5_alt_type():
    assert guess_type("data.hdf5") == FileType.HDF5


def test_txt_unchanged():
    assert guess_type("notes.txt") == FileType.TEXT


def test_csv_unchanged():
    assert guess_type("data.csv") == FileType.CSV
