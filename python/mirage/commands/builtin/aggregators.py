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


async def concat_aggregate(results: list[tuple[str, bytes]]) -> bytes:
    return b"".join(data for _, data in results)


async def header_aggregate(results: list[tuple[str, bytes]]) -> bytes:
    chunks: list[bytes] = []
    for i, (path, data) in enumerate(results):
        if len(results) > 1:
            header = f"==> {path} <==\n"
            if i > 0:
                header = "\n" + header
            chunks.append(header.encode())
        chunks.append(data)
    return b"".join(chunks)


async def prefix_aggregate(results: list[tuple[str, bytes]]) -> bytes:
    lines: list[str] = []
    for path, data in results:
        if not data:
            continue
        for line in data.decode(errors="replace").rstrip("\n").split("\n"):
            if len(results) > 1:
                lines.append(f"{path}:{line}")
            else:
                lines.append(line)
    if not lines:
        return b""
    return ("\n".join(lines) + "\n").encode()


async def wc_aggregate(results: list[tuple[str, bytes]]) -> bytes:
    lines: list[str] = []
    totals: list[int] = []
    for path, data in results:
        text = data.decode(errors="replace").strip()
        if not text:
            continue
        parts = text.split("\t")
        counts = parts[:-1] if len(parts) > 1 else parts
        lines.append(text.rsplit("\t", 1)[0] + f"\t{path}")
        if not totals:
            totals = [0] * len(counts)
        for idx, c in enumerate(counts):
            try:
                totals[idx] += int(c.strip())
            except ValueError:
                pass
    if len(results) > 1 and totals:
        total_str = "\t".join(str(t) for t in totals) + "\ttotal"
        lines.append(total_str)
    if not lines:
        return b""
    return ("\n".join(lines) + "\n").encode()
