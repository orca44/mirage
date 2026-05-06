// ========= Copyright 2026 @ Strukto.AI All Rights Reserved. =========
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ========= Copyright 2026 @ Strukto.AI All Rights Reserved. =========

export const SSCHOLAR_PAPER_PROMPT = `{prefix}
  <field-slug>/                e.g. computer-science, medicine, biology (23 fields)
    <year>/                    2000..now
      <paperId>/
        meta.json              title, year, venue, citations, openAccessPdf
        abstract.txt           full abstract
        tldr.txt               one-sentence AI summary
        authors.json           [{authorId, name}, ...]
  Listings show top 100 most recent papers in <field>/<year>/.
  Use 'search "<query>"' to query papers by topic. Use 'grep "<query>"' to find passages.`
