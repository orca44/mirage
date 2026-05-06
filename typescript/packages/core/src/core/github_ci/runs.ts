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

import type { CITransport } from './_client.ts'

export interface CIRun {
  id: number
  name?: string
  status?: string
  conclusion?: string
  event?: string
  head_branch?: string
  updated_at?: string
  [k: string]: unknown
}

export interface CIJob {
  id: number
  name?: string
  status?: string
  conclusion?: string
  completed_at?: string
  steps?: unknown[]
  [k: string]: unknown
}

function isoDateNDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000)
  return d.toISOString().slice(0, 10)
}

export async function listRuns(
  transport: CITransport,
  owner: string,
  repo: string,
  days = 30,
  maxRuns = 300,
): Promise<CIRun[]> {
  const since = isoDateNDaysAgo(days)
  const items = await transport.getPaginated(
    `/repos/${owner}/${repo}/actions/runs`,
    'workflow_runs',
    { created: `>=${since}` },
    maxRuns,
  )
  return items as CIRun[]
}

export async function getRun(
  transport: CITransport,
  owner: string,
  repo: string,
  runId: string,
): Promise<CIRun> {
  const data = await transport.get(`/repos/${owner}/${repo}/actions/runs/${runId}`)
  return data as CIRun
}

export async function listJobsForRun(
  transport: CITransport,
  owner: string,
  repo: string,
  runId: string,
): Promise<CIJob[]> {
  const items = await transport.getPaginated(
    `/repos/${owner}/${repo}/actions/runs/${runId}/jobs`,
    'jobs',
  )
  return items as CIJob[]
}

export async function getJob(
  transport: CITransport,
  owner: string,
  repo: string,
  jobId: string,
): Promise<CIJob> {
  const data = await transport.get(`/repos/${owner}/${repo}/actions/jobs/${jobId}`)
  return data as CIJob
}

export async function downloadJobLog(
  transport: CITransport,
  owner: string,
  repo: string,
  jobId: string,
): Promise<Uint8Array> {
  return transport.getBytes(`/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`)
}
