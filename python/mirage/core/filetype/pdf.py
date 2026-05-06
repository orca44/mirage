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

import io

import pypdfium2 as pdfium

_DEFAULT_DPI = 150
_MAX_PAGES = 20


def pages_to_images(
    raw: bytes,
    max_pages: int = _MAX_PAGES,
    dpi: int = _DEFAULT_DPI,
) -> list[tuple[int, bytes]]:
    """Convert PDF pages to PNG images.

    Args:
        raw (bytes): Raw PDF bytes.
        max_pages (int): Maximum number of pages to render.
        dpi (int): Rendering resolution.

    Returns:
        list[tuple[int, bytes]]: List of (1-based page number, PNG bytes).
    """
    doc = pdfium.PdfDocument(raw)
    scale = dpi / 72
    results: list[tuple[int, bytes]] = []
    for i in range(min(len(doc), max_pages)):
        bitmap = doc[i].render(scale=scale)
        pil_img = bitmap.to_pil()
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG")
        results.append((i + 1, buf.getvalue()))
    doc.close()
    return results


def cat(raw: bytes, max_pages: int = _MAX_PAGES) -> bytes:
    """Extract text from PDF for text-mode reads.

    Args:
        raw (bytes): Raw PDF bytes.
        max_pages (int): Maximum pages to extract.

    Returns:
        bytes: UTF-8 encoded text extraction.
    """
    doc = pdfium.PdfDocument(raw)
    total = len(doc)
    pages_to_read = min(total, max_pages)
    lines = [f"# PDF: {total} pages"]
    for i in range(pages_to_read):
        text_page = doc[i].get_textpage()
        text = text_page.get_text_range().strip()
        lines.append(f"\n## Page {i + 1}\n")
        lines.append(text if text else "(no extractable text)")
    if total > max_pages:
        lines.append(f"\n... ({total - max_pages} more pages)")
    doc.close()
    return "\n".join(lines).encode()
