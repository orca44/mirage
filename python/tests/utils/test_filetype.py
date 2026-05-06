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
from mirage.utils.filetype import filetype_from_mimetype, guess_type


def test_jpg_extension_maps_to_jpeg():
    assert guess_type("photo.jpg") == FileType.IMAGE_JPEG


def test_jpeg_extension_maps_to_jpeg():
    assert guess_type("photo.jpeg") == FileType.IMAGE_JPEG


def test_png_extension():
    assert guess_type("logo.png") == FileType.IMAGE_PNG


def test_pdf_extension():
    assert guess_type("doc.pdf") == FileType.PDF


def test_filetype_from_mimetype_image():
    assert filetype_from_mimetype("image/png") == FileType.IMAGE_PNG
    assert filetype_from_mimetype("image/jpeg") == FileType.IMAGE_JPEG
    assert filetype_from_mimetype("image/gif") == FileType.IMAGE_GIF


def test_filetype_from_mimetype_pdf():
    assert filetype_from_mimetype("application/pdf") == FileType.PDF


def test_filetype_from_mimetype_text_fallback():
    assert filetype_from_mimetype("text/markdown") == FileType.TEXT


def test_filetype_from_mimetype_empty():
    assert filetype_from_mimetype("") == FileType.BINARY


def test_filetype_from_mimetype_unknown():
    assert filetype_from_mimetype(
        "application/octet-stream") == FileType.BINARY
