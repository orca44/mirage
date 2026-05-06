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
  SSCholarAuthorPapersOptions,
  SSCholarAuthorPapersResult,
  SSCholarAuthorProfile,
  SSCholarAuthorSearchResult,
} from './author_driver.ts'

const DEFAULT_PROFILE_FIELDS: readonly string[] = [
  'authorId',
  'name',
  'url',
  'affiliations',
  'homepage',
  'paperCount',
  'citationCount',
  'hIndex',
  'externalIds',
]

const DEFAULT_PAPER_FIELDS: readonly string[] = ['paperId', 'title', 'year', 'fieldsOfStudy']

export async function getAuthor(
  accessor: SSCholarAccessor,
  authorId: string,
  fields: readonly string[] = DEFAULT_PROFILE_FIELDS,
): Promise<SSCholarAuthorProfile> {
  return accessor.driver.getAuthor(authorId, fields)
}

export async function getAuthorPapers(
  accessor: SSCholarAccessor,
  authorId: string,
  limit?: number,
): Promise<SSCholarAuthorPapersResult> {
  const opts: SSCholarAuthorPapersOptions = {
    fields: DEFAULT_PAPER_FIELDS,
    limit: limit ?? accessor.config.defaultListLimit,
  }
  return accessor.driver.getAuthorPapers(authorId, opts)
}

export async function searchAuthors(
  accessor: SSCholarAccessor,
  query: string,
  limit?: number,
): Promise<SSCholarAuthorSearchResult> {
  const max = limit ?? accessor.config.defaultSearchLimit
  return accessor.driver.searchAuthors(query, max, DEFAULT_PROFILE_FIELDS)
}
