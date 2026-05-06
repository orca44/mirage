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
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const DEFAULT_SERVER_URL = 'https://mcp.notion.com/mcp'
const CLIENT_NAME = 'mirage-notion'
const CLIENT_VERSION = '0.0.0'

export interface NotionTransport {
  callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>
}

export class NotionMCPError extends Error {
  readonly code: string | null
  readonly raw: unknown
  constructor(message: string, opts?: { code?: string | null; raw?: unknown }) {
    super(message)
    this.name = 'NotionMCPError'
    this.code = opts?.code ?? null
    this.raw = opts?.raw
  }
}

export interface MCPNotionTransportOptions {
  authProvider: OAuthClientProvider
  serverUrl?: string
}

interface TextContent {
  type: 'text'
  text: string
}

interface ToolResult {
  content?: unknown
  isError?: boolean
  structuredContent?: unknown
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function firstTextContent(content: unknown): string | null {
  if (!Array.isArray(content) || content.length === 0) return null
  const first = asObject(content[0])
  if (first === null) return null
  if (first.type !== 'text') return null
  const text = first.text
  return typeof text === 'string' ? text : null
}

export class MCPNotionTransport implements NotionTransport {
  protected client: Client | null = null
  private connectPromise: Promise<void> | null = null
  private readonly authProvider: OAuthClientProvider
  private readonly serverUrl: string

  constructor(opts: MCPNotionTransportOptions) {
    this.authProvider = opts.authProvider
    this.serverUrl = opts.serverUrl ?? DEFAULT_SERVER_URL
  }

  private async ensureConnected(): Promise<Client> {
    if (this.connectPromise === null) {
      this.client ??= new Client({ name: CLIENT_NAME, version: CLIENT_VERSION })
      const client = this.client
      const transport = new StreamableHTTPClientTransport(new URL(this.serverUrl), {
        authProvider: this.authProvider,
      })
      this.connectPromise = (client as unknown as { connect(t: unknown): Promise<void> }).connect(
        transport,
      )
    }
    await this.connectPromise
    if (this.client === null) {
      throw new NotionMCPError('client was not initialized')
    }
    return this.client
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const client = await this.ensureConnected()
    const callable = client as unknown as {
      callTool(p: { name: string; arguments: Record<string, unknown> }): Promise<ToolResult>
    }
    const result = await callable.callTool({ name, arguments: args })
    if (result.isError === true) {
      const text = firstTextContent(result.content) ?? 'tool returned error'
      throw new NotionMCPError(`Notion MCP tool error: ${text}`, { raw: result })
    }
    const structured = asObject(result.structuredContent)
    if (structured !== null) return structured
    if (!Array.isArray(result.content) || result.content.length === 0) {
      throw new NotionMCPError('empty tool result', { raw: result })
    }
    const text = firstTextContent(result.content)
    if (text === null) {
      throw new NotionMCPError('empty tool result', { raw: result })
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new NotionMCPError('failed to parse tool result', { raw: text })
    }
    const obj = asObject(parsed)
    if (obj === null) {
      throw new NotionMCPError('failed to parse tool result', { raw: text })
    }
    return obj
  }
}

export type { TextContent }
