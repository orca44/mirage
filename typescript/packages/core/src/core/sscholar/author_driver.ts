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

export interface SSCholarAuthorProfile {
  authorId: string
  name: string
  url?: string | null
  affiliations?: string[] | null
  homepage?: string | null
  paperCount?: number | null
  citationCount?: number | null
  hIndex?: number | null
  externalIds?: Record<string, string[]> | null
}

export interface SSCholarAuthorPapersOptions {
  limit?: number
  offset?: number
  fields?: readonly string[]
}

export interface SSCholarAuthorPapersResult {
  offset: number
  next?: number | null
  data: {
    paperId: string
    title?: string | null
    year?: number | null
    fieldsOfStudy?: string[] | null
  }[]
}

export interface SSCholarAuthorSearchResult {
  total: number
  offset: number
  next?: number | null
  data: SSCholarAuthorProfile[]
}
