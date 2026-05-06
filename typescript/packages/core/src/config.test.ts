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
import { loadConfigFromObject, mergeOverride } from './config.ts'
import { ConsistencyPolicy, MountMode } from './types.ts'

describe('loadConfigFromObject', () => {
  it('accepts a dict source', () => {
    const cfg = loadConfigFromObject({ mounts: { '/': { resource: 'ram' } } })
    expect(cfg.mounts).toHaveProperty('/')
    expect(cfg.mounts['/']?.resource).toBe('ram')
  })

  it('fills workspace-level defaults (mode/consistency/history)', () => {
    const cfg = loadConfigFromObject({ mounts: { '/': { resource: 'ram' } } })
    expect(cfg.mode).toBe(MountMode.WRITE)
    expect(cfg.consistency).toBe(ConsistencyPolicy.LAZY)
    expect(cfg.history).toBe(100)
    expect(cfg.cache).toBe(null)
  })

  it('interpolates ${VAR} references against the provided env', () => {
    const cfg = loadConfigFromObject(
      {
        mounts: {
          '/s3': {
            resource: 's3',
            config: {
              bucket: '${TEST_BUCKET}',
              aws_access_key_id: '${TEST_AWS_KEY}',
            },
          },
        },
      },
      {
        TEST_BUCKET: 'my-test-bucket',
        TEST_AWS_KEY: 'AKIAEXAMPLE',
      },
    )
    const mount = cfg.mounts['/s3']
    expect(mount?.config?.bucket).toBe('my-test-bucket')
    expect(mount?.config?.aws_access_key_id).toBe('AKIAEXAMPLE')
  })

  it('throws listing every missing env variable', () => {
    expect(() =>
      loadConfigFromObject(
        {
          mounts: {
            '/s3': {
              resource: 's3',
              config: {
                bucket: '${TEST_BUCKET}',
                aws_access_key_id: '${TEST_AWS_KEY}',
                aws_secret_access_key: '${TEST_AWS_SECRET}',
              },
            },
          },
        },
        {},
      ),
    ).toThrow(/missing environment variables.*TEST_AWS_KEY.*TEST_AWS_SECRET.*TEST_BUCKET/)
  })

  it('carries a redis cache block through validation (discriminated union)', () => {
    const cfg = loadConfigFromObject({
      cache: { type: 'redis', url: 'redis://localhost:6379/3', keyPrefix: 'test_cache:' },
      mounts: { '/': { resource: 'ram' } },
    })
    expect(cfg.cache).toMatchObject({
      type: 'redis',
      url: 'redis://localhost:6379/3',
      keyPrefix: 'test_cache:',
    })
  })

  it('rejects non-object mounts field', () => {
    expect(() => loadConfigFromObject({ mounts: [] })).toThrow(/mounts must be an object/)
  })
})

describe('mergeOverride', () => {
  const s3Base = loadConfigFromObject({
    mounts: {
      '/s3': {
        resource: 's3',
        config: {
          bucket: 'old',
          region: 'us-east-1',
          aws_access_key_id: 'k',
          aws_secret_access_key: 's',
        },
      },
    },
  })

  it('replaces one nested field and preserves siblings', () => {
    const merged = mergeOverride(s3Base, {
      mounts: { '/s3': { config: { bucket: 'new' } } },
    })
    expect(merged.mounts['/s3']?.config?.bucket).toBe('new')
    expect(merged.mounts['/s3']?.config?.region).toBe('us-east-1')
    expect(merged.mounts['/s3']?.config?.aws_access_key_id).toBe('k')
  })

  it('adds a new mount without disturbing existing mounts', () => {
    const base = loadConfigFromObject({ mounts: { '/': { resource: 'ram' } } })
    const merged = mergeOverride(base, {
      mounts: { '/disk': { resource: 'disk', config: { root: '/tmp/x' } } },
    })
    expect(merged.mounts).toHaveProperty('/')
    expect(merged.mounts).toHaveProperty('/disk')
  })

  it('preserves unrelated top-level fields (e.g. history)', () => {
    const base = loadConfigFromObject({
      history: 25,
      mounts: { '/': { resource: 'ram' } },
    })
    const merged = mergeOverride(base, { mounts: { '/disk': { resource: 'disk' } } })
    expect(merged.history).toBe(25)
  })

  it('interpolates env vars inside the override payload', () => {
    const merged = mergeOverride(
      s3Base,
      { mounts: { '/s3': { config: { bucket: '${NEW_BUCKET}' } } } },
      { NEW_BUCKET: 'fresh' },
    )
    expect(merged.mounts['/s3']?.config?.bucket).toBe('fresh')
  })
})
