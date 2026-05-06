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

import pytest
from pydantic import ValidationError

from mirage.commands.types import (CommandResult, FilePayload,
                                   RemoteCommandOptions)
from mirage.types import FileStat


def test_filestat_defaults():
    fs = FileStat(name="foo.txt")
    assert fs.name == "foo.txt"
    assert fs.size is None
    assert fs.extra == {}


def test_filestat_immutable():
    fs = FileStat(name="foo.txt")
    with pytest.raises(ValidationError):
        fs.name = "bar.txt"


def test_command_result_defaults():
    r = CommandResult(stdout="hello")
    assert r.stdout == "hello"
    assert r.output_files == {}


def test_command_result_with_files():
    r = CommandResult(stdout="done", output_files={"/out.csv": b"a,b"})
    assert r.output_files["/out.csv"] == b"a,b"


def test_file_payload_with_data():
    p = FilePayload(checksum="abc123", data=b"hello")
    assert p.checksum == "abc123"
    assert p.data == b"hello"


def test_file_payload_checksum_only():
    p = FilePayload(checksum="abc123")
    assert p.data is None


def test_remote_command_options_defaults():
    opts = RemoteCommandOptions()
    assert opts.max_file_size == "100MB"
    assert opts.cache == "enabled"


def test_remote_command_options_custom():
    opts = RemoteCommandOptions(max_file_size="500MB", cache="disabled")
    assert opts.max_file_size == "500MB"
    assert opts.cache == "disabled"


def test_remote_command_options_only_two_fields():
    opts = RemoteCommandOptions()
    assert opts.max_file_size == "100MB"
    assert opts.cache == "enabled"
    assert set(RemoteCommandOptions.model_fields.keys()) == {
        "max_file_size", "cache"
    }
