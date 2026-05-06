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

from mirage.commands.resolve import get_extension


def test_get_extension_gdoc():
    assert get_extension("folder/My Doc.gdoc.json") == ".gdoc.json"


def test_get_extension_gsheet():
    assert get_extension("folder/My Sheet.gsheet.json") == ".gsheet.json"


def test_get_extension_gslide():
    assert get_extension("slides/My Slides.gslide.json") == ".gslide.json"


def test_get_extension_regular():
    assert get_extension("photo.png") == ".png"
    assert get_extension("data/file.parquet") == ".parquet"


def test_get_extension_no_ext():
    assert get_extension("Makefile") is None
    assert get_extension(None) is None
