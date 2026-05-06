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

import re
import tempfile

import h5py
import pandas as pd

_MAX_PREVIEW_ROWS = 20


def _read_df(raw: bytes) -> pd.DataFrame:
    with tempfile.NamedTemporaryFile(suffix=".h5", delete=False) as f:
        f.write(raw)
        tmp = f.name
    try:
        store = pd.HDFStore(tmp, mode="r")
        try:
            keys = store.keys()
            if not keys:
                raise ValueError("no datasets found in HDF5 file")
            return store[keys[0]]
        finally:
            store.close()
    except Exception:
        with h5py.File(tmp, "r") as hf:
            keys = list(hf.keys())
            if not keys:
                raise ValueError("no datasets found in HDF5 file")
            dset = hf[keys[0]]
            if hasattr(dset, "shape") and len(dset.shape) == 2:
                return pd.DataFrame(dset[:])
            if hasattr(dset, "dtype") and dset.dtype.names:
                return pd.DataFrame(dset[:])
            raise ValueError("unsupported HDF5 dataset structure")


def _render_schema(df: pd.DataFrame) -> list[str]:
    lines = ["## Schema"]
    for col in df.columns:
        lines.append(f"  {col}: {df[col].dtype}")
    return lines


def _render_df(df: pd.DataFrame, label: str, count: int) -> list[str]:
    lines = [f"## {label} ({count} rows)", ""]
    lines.append(df.to_string(index=False))
    lines.append("")
    return lines


def cat(raw: bytes, max_rows: int = _MAX_PREVIEW_ROWS) -> bytes:
    df = _read_df(raw)
    num_rows = len(df)
    preview_count = min(num_rows, max_rows)
    lines = [f"# Rows: {num_rows}, Columns: {len(df.columns)}", ""]
    lines.extend(_render_schema(df))
    lines.append("")
    lines.extend(_render_df(df.head(max_rows), "Preview", preview_count))
    return "\n".join(lines).encode()


def head(raw: bytes, n: int = 10) -> bytes:
    df = _read_df(raw)
    num_rows = len(df)
    rows_needed = min(n, num_rows)
    lines = [f"# Rows: {num_rows}, Columns: {len(df.columns)}", ""]
    lines.extend(_render_schema(df))
    lines.append("")
    lines.extend(
        _render_df(df.head(rows_needed), f"First {rows_needed}", rows_needed))
    return "\n".join(lines).encode()


def tail(raw: bytes, n: int = 10) -> bytes:
    df = _read_df(raw)
    num_rows = len(df)
    rows_needed = min(n, num_rows)
    lines = [f"# Rows: {num_rows}, Columns: {len(df.columns)}", ""]
    lines.extend(_render_schema(df))
    lines.append("")
    lines.extend(
        _render_df(df.tail(rows_needed), f"Last {rows_needed}", rows_needed))
    return "\n".join(lines).encode()


def wc(raw: bytes) -> int:
    return len(_read_df(raw))


def stat(raw: bytes) -> bytes:
    df = _read_df(raw)
    lines = [
        "# HDF5 file",
        f"rows: {len(df)}",
        f"columns: {len(df.columns)}",
        "",
    ]
    lines.extend(_render_schema(df))
    lines.append("")
    return "\n".join(lines).encode()


def grep(raw: bytes, pattern: str, ignore_case: bool = False) -> bytes:
    flags = re.IGNORECASE if ignore_case else 0
    regex = re.compile(pattern, flags)
    df = _read_df(raw)
    str_cols = df.select_dtypes(include=["object", "string"]).columns
    if len(str_cols) == 0:
        return df.head(0).to_csv(index=False).encode()
    row_mask = pd.Series(False, index=df.index)
    for col_name in str_cols:
        row_mask = row_mask | df[col_name].astype(str).str.contains(regex,
                                                                    na=False)
    return df[row_mask].to_csv(index=False).encode()


def cut(raw: bytes, columns: list[str]) -> bytes:
    df = _read_df(raw)
    for col in columns:
        if col not in df.columns:
            raise ValueError(f"column not found: {col}")
    return df[columns].to_csv(index=False).encode()
