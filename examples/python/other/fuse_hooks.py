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

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from mirage import MountMode, RAMResource, Workspace
from mirage.fuse.filetype.data.local.excel import HOOKS as EXCEL_HOOKS
from mirage.fuse.filetype.data.local.parquet import HOOKS as PARQUET_HOOKS

df = pd.DataFrame({
    "name": ["alice", "bob", "charlie", "diana"],
    "score": [95, 80, 70, 88],
    "grade": ["A", "B", "C", "B+"],
})

buf = io.BytesIO()
table = pa.Table.from_pandas(df)
pq.write_table(table, buf)
parquet_bytes = buf.getvalue()

buf = io.BytesIO()
df.to_excel(buf, index=False)
xlsx_bytes = buf.getvalue()

mem = RAMResource()
mem._store.files["/students.parquet"] = parquet_bytes
mem._store.files["/students.xlsx"] = xlsx_bytes
mem._store.files["/notes.txt"] = b"plain text file\n"

for hooks in [PARQUET_HOOKS, EXCEL_HOOKS]:
    for hook_name, fns in hooks.items():
        for fn in fns:
            RAMResource.register_fuse_hook(hook_name, fn)

ws = Workspace({"/": mem}, mode=MountMode.READ)

print("=== cat /students.parquet (raw) ===")
raw, _ = ws.dispatch("cat", "/students.parquet")
print(f"({len(raw)} bytes of binary data)\n")

print("=== fuse_read /students.parquet (hooked) ===")
print(ws.fuse_read("/students.parquet").decode())

print("=== fuse_read /students.xlsx (hooked) ===")
print(ws.fuse_read("/students.xlsx").decode())

print("=== fuse_read /notes.txt (no hook, passthrough) ===")
print(ws.fuse_read("/notes.txt").decode())

RAMResource._fuse_hooks = {}
