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

import type { SSCholarAccessor } from '../../accessor/sscholar.ts'
import type {
  SSCholarPaper,
  SSCholarSearchOptions,
  SSCholarSearchResult,
  SSCholarSnippetSearchResult,
} from './_driver.ts'

const DEFAULT_PAPER_FIELDS: readonly string[] = [
  'paperId',
  'externalIds',
  'title',
  'abstract',
  'year',
  'venue',
  'publicationDate',
  'authors',
  'tldr',
  'fieldsOfStudy',
  'citationCount',
  'referenceCount',
  'influentialCitationCount',
  'openAccessPdf',
]

export async function getPaper(
  accessor: SSCholarAccessor,
  paperId: string,
  fields: readonly string[] = DEFAULT_PAPER_FIELDS,
): Promise<SSCholarPaper> {
  return accessor.driver.getPaper(paperId, fields)
}

export async function searchPapersByField(
  accessor: SSCholarAccessor,
  field: string,
  year: string | null,
  limit: number,
  offset = 0,
): Promise<SSCholarSearchResult> {
  const opts: SSCholarSearchOptions = {
    fieldsOfStudy: field,
    limit,
    offset,
    sort: 'publicationDate:desc',
    fields: ['paperId', 'title', 'year', 'publicationDate', 'fieldsOfStudy'],
  }
  if (year !== null) opts.year = year
  return accessor.driver.searchPapers(opts)
}

export async function searchPapers(
  accessor: SSCholarAccessor,
  query: string,
  field: string | null,
  year: string | null,
  limit: number,
): Promise<SSCholarSearchResult> {
  const opts: SSCholarSearchOptions = {
    query,
    limit,
    fields: ['paperId', 'title', 'year', 'publicationDate', 'fieldsOfStudy'],
  }
  if (field !== null) opts.fieldsOfStudy = field
  if (year !== null) opts.year = year
  return accessor.driver.searchPapers(opts)
}

export async function searchSnippets(
  accessor: SSCholarAccessor,
  query: string,
  limit: number,
): Promise<SSCholarSnippetSearchResult> {
  return accessor.driver.searchSnippets(query, limit)
}
