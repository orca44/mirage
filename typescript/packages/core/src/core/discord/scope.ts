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

import type { PathSpec } from '../../types.ts'

export interface DiscordScope {
  level: 'root' | 'guild' | 'channel' | 'file'
  useNative: boolean
  guildName?: string
  guildId?: string
  channelName?: string
  channelId?: string
  memberName?: string
  memberId?: string
  container?: 'channels' | 'members'
  dateStr?: string
  resourcePath: string
}

function stripSlashes(s: string): string {
  return s.replace(/^\/+|\/+$/g, '')
}

function splitDirname(dirname: string): [string, string | undefined] {
  const idx = dirname.lastIndexOf('__')
  if (idx === -1) {
    return [dirname, undefined]
  }
  const name = dirname.slice(0, idx)
  const cid = dirname.slice(idx + 2)
  return [name, cid.length > 0 ? cid : undefined]
}

export function detectScope(path: PathSpec): DiscordScope {
  const prefix = path.prefix

  if (path.pattern?.endsWith('.jsonl')) {
    let dirKey = stripSlashes(path.directory)
    if (prefix) {
      const stripped = stripSlashes(prefix) + '/'
      if (dirKey.startsWith(stripped)) {
        dirKey = dirKey.slice(stripped.length)
      }
    }
    const dirParts = dirKey ? dirKey.split('/') : []
    const [dirGuild, dirContainer, dirChannel] = dirParts
    if (
      dirParts.length === 3 &&
      dirGuild !== undefined &&
      dirChannel !== undefined &&
      dirContainer === 'channels'
    ) {
      const [guildName, guildId] = splitDirname(dirGuild)
      const [channelName, channelId] = splitDirname(dirChannel)
      return {
        level: 'channel',
        useNative: true,
        guildName,
        ...(guildId !== undefined ? { guildId } : {}),
        channelName,
        ...(channelId !== undefined ? { channelId } : {}),
        container: 'channels',
        resourcePath: dirKey,
      }
    }
  }

  const key = path.key
  if (!key) {
    return { level: 'root', useNative: true, resourcePath: '/' }
  }

  const parts = key.split('/')
  const [first, second, third, fourth] = parts

  if (first === undefined) {
    return { level: 'guild', useNative: false, resourcePath: key }
  }

  if (parts.length === 1) {
    const [guildName, guildId] = splitDirname(first)
    return {
      level: 'guild',
      useNative: true,
      guildName,
      ...(guildId !== undefined ? { guildId } : {}),
      resourcePath: key,
    }
  }

  if (parts.length === 2 && second !== undefined) {
    const [guildName, guildId] = splitDirname(first)
    if (second === 'channels' || second === 'members') {
      return {
        level: 'guild',
        useNative: second === 'channels',
        guildName,
        ...(guildId !== undefined ? { guildId } : {}),
        container: second,
        resourcePath: key,
      }
    }
    return {
      level: 'guild',
      useNative: false,
      guildName,
      ...(guildId !== undefined ? { guildId } : {}),
      resourcePath: key,
    }
  }

  if (parts.length === 3 && second !== undefined && third !== undefined) {
    const [guildName, guildId] = splitDirname(first)
    if (second === 'channels') {
      const [channelName, channelId] = splitDirname(third)
      return {
        level: 'channel',
        useNative: true,
        guildName,
        ...(guildId !== undefined ? { guildId } : {}),
        channelName,
        ...(channelId !== undefined ? { channelId } : {}),
        container: 'channels',
        resourcePath: key,
      }
    }
    if (second === 'members') {
      const stem = third.endsWith('.json') ? third.slice(0, -5) : third
      const [memberName, memberId] = splitDirname(stem)
      return {
        level: 'file',
        useNative: false,
        guildName,
        ...(guildId !== undefined ? { guildId } : {}),
        memberName,
        ...(memberId !== undefined ? { memberId } : {}),
        container: 'members',
        resourcePath: key,
      }
    }
  }

  if (
    parts.length === 4 &&
    second === 'channels' &&
    third !== undefined &&
    fourth?.endsWith('.jsonl')
  ) {
    const [guildName, guildId] = splitDirname(first)
    const [channelName, channelId] = splitDirname(third)
    const dateStr = fourth.slice(0, -'.jsonl'.length)
    return {
      level: 'file',
      useNative: false,
      guildName,
      ...(guildId !== undefined ? { guildId } : {}),
      channelName,
      ...(channelId !== undefined ? { channelId } : {}),
      container: 'channels',
      dateStr,
      resourcePath: key,
    }
  }

  return { level: 'guild', useNative: false, resourcePath: key }
}
