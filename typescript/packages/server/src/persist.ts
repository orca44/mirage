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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Workspace } from '@struktoai/mirage-node'
import type { WorkspaceRegistry } from './registry.ts'

const INDEX_FILENAME = 'index.json'

interface IndexEntry {
  tar: string
  savedAt: number
}

interface IndexFile {
  workspaces: Record<string, IndexEntry>
}

function indexPath(dir: string): string {
  return join(dir, INDEX_FILENAME)
}

function tarPath(dir: string, id: string): string {
  return join(dir, `${id}.tar`)
}

export async function snapshotAll(
  registry: WorkspaceRegistry,
  persistDir: string,
): Promise<number> {
  mkdirSync(persistDir, { recursive: true })
  const index: IndexFile = { workspaces: {} }
  let saved = 0
  for (const entry of registry.list()) {
    try {
      const target = tarPath(persistDir, entry.id)
      await entry.runner.ws.snapshot(target)
      index.workspaces[entry.id] = { tar: `${entry.id}.tar`, savedAt: Date.now() / 1000 }
      saved++
    } catch (err) {
      console.warn(`failed to snapshot workspace ${entry.id}; skipping:`, err)
    }
  }
  writeFileSync(indexPath(persistDir), JSON.stringify(index, null, 2))
  return saved
}

export async function restoreAll(
  registry: WorkspaceRegistry,
  persistDir: string,
): Promise<[number, number]> {
  const ip = indexPath(persistDir)
  if (!existsSync(ip)) return [0, 0]
  const index = JSON.parse(readFileSync(ip, 'utf-8')) as IndexFile
  let restored = 0
  let skipped = 0
  for (const [id, info] of Object.entries(index.workspaces)) {
    try {
      const tar = join(persistDir, info.tar)
      const ws = await Workspace.load(tar)
      registry.add(ws, id)
      restored++
    } catch (err) {
      console.warn(`failed to restore workspace ${id}; skipping:`, err)
      skipped++
    }
  }
  return [restored, skipped]
}
