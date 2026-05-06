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
import { DEFAULT_DAEMON_URL, loadDaemonSettings } from './settings.ts'

describe('loadDaemonSettings', () => {
  it('returns defaults when env unset and no file', () => {
    const s = loadDaemonSettings({ env: {}, configPath: '/nonexistent/config.toml' })
    expect(s.url).toBe(DEFAULT_DAEMON_URL)
    expect(s.authToken).toBe('')
  })

  it('MIRAGE_DAEMON_URL overrides default', () => {
    const s = loadDaemonSettings({
      env: { MIRAGE_DAEMON_URL: 'http://10.0.0.1:9000' },
      configPath: '/nonexistent/config.toml',
    })
    expect(s.url).toBe('http://10.0.0.1:9000')
  })

  it('MIRAGE_TOKEN populates authToken', () => {
    const s = loadDaemonSettings({
      env: { MIRAGE_TOKEN: 'secret' },
      configPath: '/nonexistent/config.toml',
    })
    expect(s.authToken).toBe('secret')
  })
})
