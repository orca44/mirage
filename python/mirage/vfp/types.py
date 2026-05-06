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

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class FileType(str, Enum):
    DIRECTORY = "directory"
    TEXT = "text"
    BINARY = "binary"
    JSON = "json"
    CSV = "csv"
    MARKDOWN = "markdown"
    IMAGE_PNG = "image/png"
    IMAGE_JPEG = "image/jpeg"
    IMAGE_GIF = "image/gif"
    PDF = "application/pdf"
    ZIP = "application/zip"
    GZIP = "application/gzip"
    GDOC = "application/vnd.google-apps.document"
    PARQUET = "parquet"
    ORC = "orc"
    FEATHER = "feather"
    HDF5 = "hdf5"


class ErrorCode(str, Enum):
    NOT_FOUND = "NotFound"
    DENIED = "Denied"
    CONFLICT = "Conflict"
    IS_A_DIRECTORY = "IsADirectory"
    NOT_A_DIRECTORY = "NotADirectory"
    UNSUPPORTED_FILE_TYPE = "UnsupportedFileType"
    INVALID_PATH = "InvalidPath"
    NOT_IMPLEMENTED = "NotImplemented"
    RATE_LIMITED = "RateLimited"
    NETWORK = "Network"


class MountType(str, Enum):
    FILESYSTEM = "filesystem"
    OBJECT_STORE = "object-store"
    MESSAGING = "messaging"
    EMAIL = "email"
    DOCUMENTS = "documents"
    ISSUE_TRACKER = "issue-tracker"
    DATABASE = "database"
    CACHE = "cache"
    OBSERVABILITY = "observability"


class Entry(BaseModel):
    model_config = ConfigDict(frozen=True, populate_by_name=True)

    name: str
    type: FileType
    size: int | None = None
    modified: datetime | None = None
    meta: dict[str, Any] = Field(default_factory=dict, alias="_meta")


class FileStat(BaseModel):
    model_config = ConfigDict(frozen=True, populate_by_name=True)

    name: str
    type: FileType
    size: int | None = None
    modified: datetime | None = None
    fingerprint: str | None = None
    extra: dict[str, Any] = Field(default_factory=dict)
    meta: dict[str, Any] = Field(default_factory=dict, alias="_meta")


class Mount(BaseModel):
    model_config = ConfigDict(frozen=True, populate_by_name=True)

    path: str
    type: MountType | str
    writable: bool = False
    filetypes: list[FileType] = Field(default_factory=list)
    meta: dict[str, Any] = Field(default_factory=dict, alias="_meta")


class Implementation(BaseModel):
    model_config = ConfigDict(frozen=True, populate_by_name=True)

    name: str
    language: str
    version: str
    meta: dict[str, Any] = Field(default_factory=dict, alias="_meta")


class SnapshotInfo(BaseModel):
    model_config = ConfigDict(frozen=True, populate_by_name=True)

    id: str
    name: str | None = None
    description: str | None = None
    parent_id: str | None = None
    created: datetime
    size: int | None = None
    meta: dict[str, Any] = Field(default_factory=dict, alias="_meta")
