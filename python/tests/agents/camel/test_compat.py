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

import inspect

from camel.toolkits import BaseToolkit, FileToolkit, FunctionTool


def test_base_toolkit_has_get_tools():
    assert hasattr(BaseToolkit, "get_tools")


def test_file_toolkit_private_hooks_exist():
    expected = [
        "_resolve_filepath",
        "_resolve_existing_filepath",
        "_resolve_search_path",
        "_sanitize_filename",
        "_create_backup",
        "_write_text_file",
        "_write_simple_text_file",
        "_write_csv_file",
        "_write_json_file",
        "_write_docx_file",
        "_write_pdf_file",
        "_normalize_notebook_source",
        "_build_notebook_cell",
    ]
    missing = [name for name in expected if not hasattr(FileToolkit, name)]
    assert not missing, f"FileToolkit missing hooks: {missing}"


def test_file_toolkit_public_methods_signatures():
    public = [
        "write_to_file",
        "read_file",
        "edit_file",
        "search_files",
        "notebook_edit_cell",
        "glob_files",
        "grep_files",
    ]
    missing = [name for name in public if not hasattr(FileToolkit, name)]
    assert not missing, f"FileToolkit missing public methods: {missing}"
    for name in public:
        sig = inspect.signature(getattr(FileToolkit, name))
        assert "self" in sig.parameters


def test_function_tool_constructible():

    def sample() -> str:
        return "ok"

    tool = FunctionTool(sample)
    assert tool is not None
