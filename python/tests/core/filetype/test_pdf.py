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

from pathlib import Path

import pytest

from mirage.core.filetype.pdf import cat, pages_to_images

_EXAMPLE_PDF = Path(__file__).resolve().parents[4] / "data" / "example.pdf"


@pytest.fixture
def pdf_bytes():
    with open(_EXAMPLE_PDF, "rb") as f:
        return f.read()


def test_pages_to_images_returns_pngs(pdf_bytes):
    images = pages_to_images(pdf_bytes, max_pages=3)
    assert len(images) == 3
    for page_num, png_bytes in images:
        assert isinstance(page_num, int)
        assert png_bytes[:8] == b"\x89PNG\r\n\x1a\n"


def test_pages_to_images_page_numbers(pdf_bytes):
    images = pages_to_images(pdf_bytes, max_pages=2)
    assert images[0][0] == 1
    assert images[1][0] == 2


def test_pages_to_images_max_pages(pdf_bytes):
    images = pages_to_images(pdf_bytes, max_pages=2)
    assert len(images) == 2


def test_cat_returns_text(pdf_bytes):
    result = cat(pdf_bytes, max_pages=2)
    assert isinstance(result, bytes)
    text = result.decode()
    assert "# PDF: 15 pages" in text
    assert "## Page 1" in text
    assert "## Page 2" in text


def test_cat_includes_text_content(pdf_bytes):
    result = cat(pdf_bytes, max_pages=1)
    text = result.decode()
    assert "SEAR" in text or "Schema" in text
