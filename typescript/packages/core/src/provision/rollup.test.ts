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

import { describe, expect, it } from 'vitest'
import { rollupList, rollupPipe } from './rollup.ts'
import { Precision, ProvisionResult } from './types.ts'

describe('rollupPipe', () => {
  it('sums exact children and labels op="|"', () => {
    const children = [
      new ProvisionResult({ networkReadLow: 100, networkReadHigh: 100, readOps: 1 }),
      new ProvisionResult({ networkReadLow: 200, networkReadHigh: 200, readOps: 2 }),
    ]
    const result = rollupPipe(children)
    expect(result.op).toBe('|')
    expect(result.networkReadLow).toBe(300)
    expect(result.readOps).toBe(3)
    expect(result.precision).toBe(Precision.EXACT)
  })

  it('cascades UNKNOWN precision to result and to other children', () => {
    const children = [
      new ProvisionResult({ precision: Precision.UNKNOWN }),
      new ProvisionResult({ precision: Precision.EXACT }),
    ]
    const result = rollupPipe(children)
    expect(result.precision).toBe(Precision.UNKNOWN)
    expect(children[1]?.precision).toBe(Precision.UNKNOWN)
  })
})

describe('rollupList', () => {
  it('"&&" sums network-read low bounds', () => {
    const children = [
      new ProvisionResult({ networkReadLow: 100, networkReadHigh: 100 }),
      new ProvisionResult({ networkReadLow: 200, networkReadHigh: 200 }),
    ]
    const result = rollupList('&&', children)
    expect(result.networkReadLow).toBe(300)
  })

  it('"||" widens to a range: low=min, high=max', () => {
    const children = [
      new ProvisionResult({ networkReadLow: 100, networkReadHigh: 100 }),
      new ProvisionResult({ networkReadLow: 200, networkReadHigh: 200 }),
    ]
    const result = rollupList('||', children)
    expect(result.networkReadLow).toBe(100)
    expect(result.networkReadHigh).toBe(200)
  })
})
