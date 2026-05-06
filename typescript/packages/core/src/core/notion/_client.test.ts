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

import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import { describe, expect, it } from 'vitest'
import { MCPNotionTransport, NotionMCPError } from './_client.ts'

interface CallToolParams {
  name: string
  arguments?: Record<string, unknown>
}

class FakeClient {
  connectCalls = 0
  invocations: { name: string; args: Record<string, unknown> }[] = []
  responses: unknown[] = []
  connect(): Promise<void> {
    this.connectCalls++
    return Promise.resolve()
  }
  callTool(params: CallToolParams): Promise<unknown> {
    this.invocations.push({ name: params.name, args: params.arguments ?? {} })
    if (this.responses.length === 0) return Promise.reject(new Error('no canned response'))
    return Promise.resolve(this.responses.shift())
  }
}

class TestTransport extends MCPNotionTransport {
  inject(c: unknown): void {
    ;(this as unknown as { client: unknown }).client = c
  }
}

const fakeAuthProvider: OAuthClientProvider = {
  get redirectUrl() {
    return 'http://localhost/cb'
  },
  get clientMetadata() {
    return { redirect_uris: ['http://localhost/cb'] }
  },
  clientInformation() {
    return undefined
  },
  tokens() {
    return undefined
  },
  saveTokens() {
    return undefined
  },
  redirectToAuthorization() {
    return undefined
  },
  saveCodeVerifier() {
    return undefined
  },
  codeVerifier() {
    return ''
  },
}

function makeTransport(): { transport: TestTransport; fake: FakeClient } {
  const transport = new TestTransport({ authProvider: fakeAuthProvider })
  const fake = new FakeClient()
  transport.inject(fake)
  return { transport, fake }
}

describe('MCPNotionTransport', () => {
  it('callTool invokes the underlying client and parses JSON text content', async () => {
    const { transport, fake } = makeTransport()
    fake.responses.push({ content: [{ type: 'text', text: '{"a":1}' }] })
    const result = await transport.callTool('API-post-search', { query: '' })
    expect(fake.invocations).toEqual([{ name: 'API-post-search', args: { query: '' } }])
    expect(result).toEqual({ a: 1 })
  })

  it('prefers structuredContent when both structuredContent and content are present', async () => {
    const { transport, fake } = makeTransport()
    fake.responses.push({
      structuredContent: { hello: 'world' },
      content: [{ type: 'text', text: '{"ignored":true}' }],
    })
    const result = await transport.callTool('API-get-self', {})
    expect(result).toEqual({ hello: 'world' })
  })

  it('throws NotionMCPError when isError=true, message includes the error text', async () => {
    const { transport, fake } = makeTransport()
    fake.responses.push({
      isError: true,
      content: [{ type: 'text', text: 'oops' }],
    })
    fake.responses.push({
      isError: true,
      content: [{ type: 'text', text: 'oops' }],
    })
    await expect(transport.callTool('API-post-search', {})).rejects.toBeInstanceOf(NotionMCPError)
    await expect(transport.callTool('API-post-search', {})).rejects.toThrow(/oops/)
  })

  it('throws NotionMCPError when text content is not valid JSON', async () => {
    const { transport, fake } = makeTransport()
    fake.responses.push({ content: [{ type: 'text', text: 'not json' }] })
    fake.responses.push({ content: [{ type: 'text', text: 'not json' }] })
    await expect(transport.callTool('API-post-search', {})).rejects.toBeInstanceOf(NotionMCPError)
    await expect(transport.callTool('API-post-search', {})).rejects.toThrow(
      /failed to parse tool result/,
    )
  })

  it('throws NotionMCPError("empty tool result") when content is empty and no structuredContent', async () => {
    const { transport, fake } = makeTransport()
    fake.responses.push({ content: [] })
    await expect(transport.callTool('API-post-search', {})).rejects.toThrow(/empty tool result/)
  })

  it('reuses a single connect() across two consecutive callTool calls', async () => {
    const { transport, fake } = makeTransport()
    fake.responses.push({ content: [{ type: 'text', text: '{"n":1}' }] })
    fake.responses.push({ content: [{ type: 'text', text: '{"n":2}' }] })
    await transport.callTool('A', {})
    await transport.callTool('B', {})
    expect(fake.connectCalls).toBe(1)
  })

  it('shares a single connect() across concurrent first callTool calls', async () => {
    const { transport, fake } = makeTransport()
    fake.responses.push({ content: [{ type: 'text', text: '{"n":1}' }] })
    fake.responses.push({ content: [{ type: 'text', text: '{"n":2}' }] })
    await Promise.all([transport.callTool('A', {}), transport.callTool('B', {})])
    expect(fake.connectCalls).toBe(1)
  })
})
