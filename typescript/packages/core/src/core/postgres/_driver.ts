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

export interface PgQueryResult<R = Record<string, unknown>> {
  rows: R[]
  rowCount: number
}

export interface PgDriver {
  query<R = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<PgQueryResult<R>>
  close(): Promise<void>
}
