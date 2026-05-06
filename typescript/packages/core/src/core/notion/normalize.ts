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

import { formatSegment, stripDashes } from './pathing.ts'

type Json = Record<string, unknown>

const ID_PATTERN = /^[0-9a-f]{32}$/

function pickStringOrNull(record: Json, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' ? value : null
}

function pickBoolOrNull(record: Json, key: string): boolean | null {
  const value = record[key]
  return typeof value === 'boolean' ? value : null
}

function asObject(value: unknown): Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function joinTitleFragments(fragments: unknown[]): string {
  let out = ''
  for (const fragment of fragments) {
    const obj = asObject(fragment)
    const text = pickStringOrNull(obj, 'plain_text')
    if (text !== null) out += text
  }
  return out
}

export function extractTitle(page: Json): string {
  const properties = asObject(page.properties)
  const titleProp = asObject(properties.title)
  const titleFragments = asArray(titleProp.title)
  if (titleFragments.length > 0) {
    const joined = joinTitleFragments(titleFragments)
    if (joined !== '') return joined
  }
  const nameProp = asObject(properties.Name)
  const nameFragments = asArray(nameProp.title)
  if (nameFragments.length > 0) {
    const joined = joinTitleFragments(nameFragments)
    if (joined !== '') return joined
  }
  return 'untitled'
}

export function extractIdNoDashes(page: Json): string {
  const id = pickStringOrNull(page, 'id')
  if (id === null) {
    throw new Error('notion page missing id')
  }
  const stripped = stripDashes(id).toLowerCase()
  if (!ID_PATTERN.test(stripped)) {
    throw new Error('notion page missing id')
  }
  return stripped
}

export function pageSegmentName(page: Json): string {
  return formatSegment({ id: extractIdNoDashes(page), title: extractTitle(page) })
}

export interface NormalizedPage {
  id: string
  title: string
  url: string | null
  created_time: string | null
  last_edited_time: string | null
  archived: boolean | null
  parent: Json
  properties: Json
  blocks: Json[]
}

export function normalizePage(page: Json, blocks: readonly Json[]): NormalizedPage {
  return {
    id: extractIdNoDashes(page),
    title: extractTitle(page),
    url: pickStringOrNull(page, 'url'),
    created_time: pickStringOrNull(page, 'created_time'),
    last_edited_time: pickStringOrNull(page, 'last_edited_time'),
    archived: pickBoolOrNull(page, 'archived'),
    parent: asObject(page.parent),
    properties: asObject(page.properties),
    blocks: blocks as Json[],
  }
}

export function toJsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value, null, 2))
}
