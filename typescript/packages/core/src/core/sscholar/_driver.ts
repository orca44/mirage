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

export interface SSCholarAuthor {
  authorId: string | null
  name: string
}

export interface SSCholarTLDR {
  model: string
  text: string
}

export interface SSCholarPaper {
  paperId: string
  externalIds?: Record<string, string> | null
  title?: string | null
  abstract?: string | null
  year?: number | null
  venue?: string | null
  publicationDate?: string | null
  authors?: SSCholarAuthor[] | null
  tldr?: SSCholarTLDR | null
  fieldsOfStudy?: string[] | null
  citationCount?: number | null
  referenceCount?: number | null
  influentialCitationCount?: number | null
  openAccessPdf?: { url?: string | null } | null
}

export interface SSCholarSearchOptions {
  query?: string
  fieldsOfStudy?: string
  year?: string | number
  limit?: number
  offset?: number
  sort?: string
  fields?: readonly string[]
}

export interface SSCholarSearchResult {
  total: number
  offset: number
  next?: number | null
  data: SSCholarPaper[]
}

export interface SSCholarSnippet {
  text: string
  snippetKind?: string | null
  section?: string | null
  snippetOffset?: { start: number; end: number } | null
  paper: { corpusId?: number | null; openAccessInfo?: { license?: string | null } | null }
}

export interface SSCholarSnippetMatch {
  snippet: SSCholarSnippet
  paper: SSCholarPaper
  score?: number | null
}

export interface SSCholarSnippetSearchResult {
  retrievalVersion?: string | null
  next?: number | null
  data: SSCholarSnippetMatch[]
}

import type {
  SSCholarAuthorPapersOptions,
  SSCholarAuthorPapersResult,
  SSCholarAuthorProfile,
  SSCholarAuthorSearchResult,
} from './author_driver.ts'

export interface SSCholarDriver {
  getPaper(paperId: string, fields?: readonly string[]): Promise<SSCholarPaper>
  searchPapers(options: SSCholarSearchOptions): Promise<SSCholarSearchResult>
  searchSnippets(query: string, limit?: number): Promise<SSCholarSnippetSearchResult>
  getAuthor(authorId: string, fields?: readonly string[]): Promise<SSCholarAuthorProfile>
  getAuthorPapers(
    authorId: string,
    options?: SSCholarAuthorPapersOptions,
  ): Promise<SSCholarAuthorPapersResult>
  searchAuthors(
    query: string,
    limit?: number,
    fields?: readonly string[],
  ): Promise<SSCholarAuthorSearchResult>
  close(): Promise<void>
}
