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

import { Precision, ProvisionResult } from './types.ts'

export function rollupPipe(children: ProvisionResult[]): ProvisionResult {
  let unknownSeen = false
  for (const child of children) {
    if (unknownSeen) {
      child.precision = Precision.UNKNOWN
    } else if (child.precision === Precision.UNKNOWN) {
      unknownSeen = true
    }
  }
  const hasUnknown = children.some((c) => c.precision === Precision.UNKNOWN)
  const hasRange = children.some((c) => c.precision === Precision.RANGE)
  const precision = hasUnknown ? Precision.UNKNOWN : hasRange ? Precision.RANGE : Precision.EXACT

  const allCosts = children.map((c) => c.estimatedCostUsd).filter((c): c is number => c !== null)
  const cost =
    allCosts.length === children.length && children.length > 0
      ? allCosts.reduce((a, b) => a + b, 0)
      : null

  return new ProvisionResult({
    op: '|',
    children,
    networkReadLow: sum(children, (c) => c.networkReadLow),
    networkReadHigh: sum(children, (c) => c.networkReadHigh),
    cacheReadLow: sum(children, (c) => c.cacheReadLow),
    cacheReadHigh: sum(children, (c) => c.cacheReadHigh),
    networkWriteLow: sum(children, (c) => c.networkWriteLow),
    networkWriteHigh: sum(children, (c) => c.networkWriteHigh),
    cacheWriteLow: sum(children, (c) => c.cacheWriteLow),
    cacheWriteHigh: sum(children, (c) => c.cacheWriteHigh),
    readOps: sum(children, (c) => c.readOps),
    cacheHits: sum(children, (c) => c.cacheHits),
    precision,
    estimatedCostUsd: cost,
  })
}

export function rollupList(op: string, children: ProvisionResult[]): ProvisionResult {
  const hasUnknown = children.some((c) => c.precision === Precision.UNKNOWN)
  const hasRange = children.some((c) => c.precision === Precision.RANGE)
  const basePrecision = hasUnknown
    ? Precision.UNKNOWN
    : hasRange
      ? Precision.RANGE
      : Precision.EXACT

  const allCosts = children.map((c) => c.estimatedCostUsd).filter((c): c is number => c !== null)
  let cost: number | null =
    allCosts.length === children.length && children.length > 0
      ? allCosts.reduce((a, b) => a + b, 0)
      : null

  if (op === '||') {
    cost = allCosts.length > 0 ? Math.min(...allCosts) : null
    return new ProvisionResult({
      op,
      children,
      networkReadLow: min(children, (c) => c.networkReadLow),
      networkReadHigh: max(children, (c) => c.networkReadHigh),
      cacheReadLow: min(children, (c) => c.cacheReadLow),
      cacheReadHigh: max(children, (c) => c.cacheReadHigh),
      networkWriteLow: min(children, (c) => c.networkWriteLow),
      networkWriteHigh: max(children, (c) => c.networkWriteHigh),
      cacheWriteLow: min(children, (c) => c.cacheWriteLow),
      cacheWriteHigh: max(children, (c) => c.cacheWriteHigh),
      readOps: min(children, (c) => c.readOps),
      cacheHits: min(children, (c) => c.cacheHits),
      precision: basePrecision !== Precision.UNKNOWN ? Precision.RANGE : Precision.UNKNOWN,
      estimatedCostUsd: cost,
    })
  }

  return new ProvisionResult({
    op,
    children,
    networkReadLow: sum(children, (c) => c.networkReadLow),
    networkReadHigh: sum(children, (c) => c.networkReadHigh),
    cacheReadLow: sum(children, (c) => c.cacheReadLow),
    cacheReadHigh: sum(children, (c) => c.cacheReadHigh),
    networkWriteLow: sum(children, (c) => c.networkWriteLow),
    networkWriteHigh: sum(children, (c) => c.networkWriteHigh),
    cacheWriteLow: sum(children, (c) => c.cacheWriteLow),
    cacheWriteHigh: sum(children, (c) => c.cacheWriteHigh),
    readOps: sum(children, (c) => c.readOps),
    cacheHits: sum(children, (c) => c.cacheHits),
    precision: basePrecision,
    estimatedCostUsd: cost,
  })
}

function sum<T>(items: readonly T[], pick: (t: T) => number): number {
  return items.reduce((acc, t) => acc + pick(t), 0)
}
function min<T>(items: readonly T[], pick: (t: T) => number): number {
  return items.length === 0 ? 0 : Math.min(...items.map(pick))
}
function max<T>(items: readonly T[], pick: (t: T) => number): number {
  return items.length === 0 ? 0 : Math.max(...items.map(pick))
}
