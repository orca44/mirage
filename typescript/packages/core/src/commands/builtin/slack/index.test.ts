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
import { ResourceName } from '../../../types.ts'
import { SLACK_COMMANDS } from './index.ts'

describe('SLACK_COMMANDS', () => {
  it('contains all 20 commands (14 filesystem + 6 RPC)', () => {
    const names = new Set(SLACK_COMMANDS.map((c) => c.name))
    expect(names).toEqual(
      new Set([
        'ls',
        'tree',
        'cat',
        'head',
        'tail',
        'wc',
        'find',
        'grep',
        'rg',
        'stat',
        'jq',
        'basename',
        'dirname',
        'realpath',
        'slack-post-message',
        'slack-reply-to-thread',
        'slack-add-reaction',
        'slack-get-users',
        'slack-get-user-profile',
        'slack-search',
      ]),
    )
  })

  it('every command targets ResourceName.SLACK', () => {
    for (const cmd of SLACK_COMMANDS) {
      expect(cmd.resource).toBe(ResourceName.SLACK)
    }
  })

  it('command names are unique', () => {
    const names = SLACK_COMMANDS.map((c) => c.name)
    const unique = new Set(names)
    expect(names.length).toBe(unique.size)
  })
})
