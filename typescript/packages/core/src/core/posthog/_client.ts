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

import type { PostHogAccessor } from '../../accessor/posthog.ts'
import type { PostHogPaged, PostHogProject, PostHogUser } from './_driver.ts'

export async function getUser(accessor: PostHogAccessor): Promise<PostHogUser> {
  return accessor.driver.getUser()
}

export async function listProjects(accessor: PostHogAccessor): Promise<PostHogProject[]> {
  return accessor.driver.listProjects()
}

export async function getProject(
  accessor: PostHogAccessor,
  projectId: number | string,
): Promise<PostHogProject> {
  return accessor.driver.getProject(projectId)
}

export async function listFeatureFlags(
  accessor: PostHogAccessor,
  projectId: number | string,
): Promise<PostHogPaged<unknown>> {
  return accessor.driver.listFeatureFlags(projectId, accessor.config.defaultListLimit)
}

export async function listCohorts(
  accessor: PostHogAccessor,
  projectId: number | string,
): Promise<PostHogPaged<unknown>> {
  return accessor.driver.listCohorts(projectId, accessor.config.defaultListLimit)
}

export async function listDashboards(
  accessor: PostHogAccessor,
  projectId: number | string,
): Promise<PostHogPaged<unknown>> {
  return accessor.driver.listDashboards(projectId, accessor.config.defaultListLimit)
}

export async function listInsights(
  accessor: PostHogAccessor,
  projectId: number | string,
): Promise<PostHogPaged<unknown>> {
  return accessor.driver.listInsights(projectId, accessor.config.defaultListLimit)
}

export async function listPersons(
  accessor: PostHogAccessor,
  projectId: number | string,
): Promise<PostHogPaged<unknown>> {
  return accessor.driver.listPersons(projectId, accessor.config.defaultListLimit)
}
