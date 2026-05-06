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

from mirage.observe.context import (record, set_virtual_prefix,
                                    start_recording, stop_recording)


def test_record_no_context():
    record("read", "/a.txt", "s3", 100, 0)


def test_start_stop_recording():
    records = start_recording()
    record("read", "/a.txt", "s3", 100, 0)
    stop_recording()
    assert len(records) == 1
    assert records[0].op == "read"
    assert records[0].bytes == 100


def test_record_after_stop_is_noop():
    records = start_recording()
    record("read", "/a.txt", "s3", 100, 0)
    stop_recording()
    record("read", "/b.txt", "s3", 200, 0)
    assert len(records) == 1


def test_multiple_records():
    records = start_recording()
    record("read", "/a.txt", "s3", 100, 0)
    record("write", "/b.txt", "ram", 50, 0)
    stop_recording()
    assert len(records) == 2
    assert records[0].source == "s3"
    assert records[1].source == "ram"


def test_record_with_virtual_prefix():
    records = start_recording()
    set_virtual_prefix("/s3")
    record("read", "/data/file.json", "s3", 100, 0)
    set_virtual_prefix("")
    stop_recording()
    assert records[0].path == "/s3/data/file.json"


def test_record_without_prefix():
    records = start_recording()
    record("read", "/data/file.json", "s3", 100, 0)
    stop_recording()
    assert records[0].path == "/data/file.json"


def test_record_prefix_already_applied():
    records = start_recording()
    set_virtual_prefix("/s3")
    record("read", "/s3/data/file.json", "s3", 100, 0)
    set_virtual_prefix("")
    stop_recording()
    assert records[0].path == "/s3/data/file.json"
