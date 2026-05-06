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

export interface PostHogUser {
  uuid?: string | null
  distinct_id?: string | null
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  organization?: { id: string; name?: string } | null
}

export interface PostHogProject {
  id: number
  uuid?: string | null
  name: string
  api_token?: string | null
  organization?: string | null
  created_at?: string | null
  is_demo?: boolean | null
}

export interface PostHogPaged<T> {
  count?: number | null
  next?: string | null
  previous?: string | null
  results: T[]
}

export interface PostHogDriver {
  getUser(): Promise<PostHogUser>
  listProjects(): Promise<PostHogProject[]>
  getProject(projectId: number | string): Promise<PostHogProject>
  listFeatureFlags(projectId: number | string, limit?: number): Promise<PostHogPaged<unknown>>
  listCohorts(projectId: number | string, limit?: number): Promise<PostHogPaged<unknown>>
  listDashboards(projectId: number | string, limit?: number): Promise<PostHogPaged<unknown>>
  listInsights(projectId: number | string, limit?: number): Promise<PostHogPaged<unknown>>
  listPersons(projectId: number | string, limit?: number): Promise<PostHogPaged<unknown>>
  close(): Promise<void>
}
