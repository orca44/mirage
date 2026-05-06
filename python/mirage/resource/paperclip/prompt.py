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

PROMPT = """\
{prefix}
  biorxiv/
    <year>/<month>/
      <paper-id>/
        meta.json
        content.lines
        sections/
          introduction.lines, methods.lines, results.lines, ...
        figures/
          fig1.tif, fig2.gif, ...
        supplements/
          table_s1.csv, ...
  Also: medrxiv/, pmc/ with same structure.
  Use cat on .lines files for text content, meta.json for metadata."""
