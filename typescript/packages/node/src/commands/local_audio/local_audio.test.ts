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

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MountMode, RAMResource } from '@struktoai/mirage-core'
import { DiskResource } from '../../resource/disk/disk.ts'
import { Workspace } from '../../workspace.ts'
import { DISK_LOCAL_AUDIO_COMMANDS } from './disk/index.ts'
import { RAM_LOCAL_AUDIO_COMMANDS } from './ram/index.ts'
import { formatDuration, formatMetadata, metadata, type LocalAudioMetadata } from './utils.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '../../../../../../data')
const DEC = new TextDecoder()

const WAV_BYTES = new Uint8Array(readFileSync(path.join(DATA_DIR, 'example.wav')))
const MP3_BYTES = new Uint8Array(readFileSync(path.join(DATA_DIR, 'example.mp3')))
const OGG_BYTES = new Uint8Array(readFileSync(path.join(DATA_DIR, 'example.ogg')))

describe('audio/utils metadata()', () => {
  it.each([
    ['wav', WAV_BYTES],
    ['mp3', MP3_BYTES],
    ['ogg', OGG_BYTES],
  ])('%s: returns duration within expected range', async (_name, raw) => {
    const meta = await metadata(raw)
    expect(meta.duration).not.toBeNull()
    expect(meta.duration ?? 0).toBeGreaterThan(5)
    expect(meta.duration ?? 0).toBeLessThan(10)
  })

  it.each([
    ['wav', WAV_BYTES],
    ['mp3', MP3_BYTES],
    ['ogg', OGG_BYTES],
  ])('%s: returns 1 channel (mono)', async (_name, raw) => {
    const meta = await metadata(raw)
    expect(meta.channels).toBe(1)
  })

  it.each([
    ['wav', WAV_BYTES],
    ['mp3', MP3_BYTES],
    ['ogg', OGG_BYTES],
  ])('%s: returns 16kHz sample rate', async (_name, raw) => {
    const meta = await metadata(raw)
    expect(meta.sampleRate).toBe(16000)
  })

  it.each([
    ['wav', WAV_BYTES],
    ['mp3', MP3_BYTES],
    ['ogg', OGG_BYTES],
  ])('%s: returns positive bitrate', async (_name, raw) => {
    const meta = await metadata(raw)
    expect(meta.bitrate).not.toBeNull()
    expect(meta.bitrate ?? 0).toBeGreaterThan(0)
  })
})

describe('audio/utils formatDuration()', () => {
  it('seconds only', () => {
    expect(formatDuration(5.0)).toBe('0:05')
  })
  it('minutes and seconds', () => {
    expect(formatDuration(65.0)).toBe('1:05')
  })
  it('exact minute', () => {
    expect(formatDuration(120.0)).toBe('2:00')
  })
  it('hours', () => {
    expect(formatDuration(3661.0)).toBe('1:01:01')
  })
  it('zero', () => {
    expect(formatDuration(0.0)).toBe('0:00')
  })
  it('fractional truncates', () => {
    expect(formatDuration(59.9)).toBe('0:59')
  })
  it('large hours', () => {
    expect(formatDuration(36000.0)).toBe('10:00:00')
  })
})

describe('audio/utils formatMetadata()', () => {
  it('basic format', () => {
    const meta: LocalAudioMetadata = {
      duration: 120.5,
      sampleRate: 16000,
      channels: 1,
      bitrate: 128.0,
    }
    const result = formatMetadata(meta, '/test.wav', 2_000_000)
    expect(result).toContain('/test.wav:')
    expect(result).toContain('Duration: 2:00')
    expect(result).toContain('16000 Hz')
    expect(result).toContain('mono')
    expect(result).toContain('128.0 kbps')
    expect(result).toContain('1.9 MB')
  })

  it('stereo channels', () => {
    const meta: LocalAudioMetadata = {
      duration: 60.0,
      sampleRate: 44100,
      channels: 2,
      bitrate: 320.0,
    }
    expect(formatMetadata(meta, '/music.mp3')).toContain('stereo')
  })

  it('unknown duration', () => {
    const meta: LocalAudioMetadata = {
      duration: null,
      sampleRate: 8000,
      channels: 1,
      bitrate: null,
    }
    expect(formatMetadata(meta, '/broken.wav')).toContain('unknown')
  })

  it('small file size in KB', () => {
    const meta: LocalAudioMetadata = { duration: 1.0, sampleRate: 8000, channels: 1, bitrate: 64.0 }
    expect(formatMetadata(meta, '/tiny.wav', 5120)).toContain('5.0 KB')
  })

  it('file size in bytes', () => {
    const meta: LocalAudioMetadata = { duration: 0.1, sampleRate: 8000, channels: 1, bitrate: 64.0 }
    expect(formatMetadata(meta, '/micro.wav', 500)).toContain('500 B')
  })

  it('omits file size when not provided', () => {
    const meta: LocalAudioMetadata = {
      duration: 10.0,
      sampleRate: 8000,
      channels: 1,
      bitrate: 64.0,
    }
    expect(formatMetadata(meta, '/test.wav')).not.toContain('File size')
  })

  it('multi-channel', () => {
    const meta: LocalAudioMetadata = {
      duration: 10.0,
      sampleRate: 48000,
      channels: 6,
      bitrate: 640.0,
    }
    expect(formatMetadata(meta, '/surround.wav')).toContain('6 channels')
  })
})

describe('audio RAM stat commands', () => {
  function makeWorkspace(filename: string, bytes: Uint8Array): Workspace {
    const mem = new RAMResource()
    mem.store.files.set(`/${filename}`, bytes)
    const ws = new Workspace({ '/': mem }, { mode: MountMode.READ })
    ws.mount('/')?.registerFns(RAM_LOCAL_AUDIO_COMMANDS)
    return ws
  }

  it('stat /test.wav in RAM', async () => {
    const ws = makeWorkspace('test.wav', WAV_BYTES)
    const result = await ws.execute('stat /test.wav')
    const text = DEC.decode(result.stdout)
    expect(text).toContain('Duration:')
    expect(text).toContain('Sample rate:')
    await ws.close()
  })

  it('stat /test.mp3 in RAM', async () => {
    const ws = makeWorkspace('test.mp3', MP3_BYTES)
    const result = await ws.execute('stat /test.mp3')
    const text = DEC.decode(result.stdout)
    expect(text).toContain('Duration:')
    expect(text).toContain('Sample rate:')
    await ws.close()
  })

  it('stat /test.ogg in RAM', async () => {
    const ws = makeWorkspace('test.ogg', OGG_BYTES)
    const result = await ws.execute('stat /test.ogg')
    const text = DEC.decode(result.stdout)
    expect(text).toContain('Duration:')
    expect(text).toContain('Sample rate:')
    await ws.close()
  })
})

describe('audio disk stat commands', () => {
  function makeWorkspace(): Workspace {
    const backend = new DiskResource({ root: DATA_DIR })
    const ws = new Workspace({ '/': backend }, { mode: MountMode.READ })
    ws.mount('/')?.registerFns(DISK_LOCAL_AUDIO_COMMANDS)
    return ws
  }

  it('stat /example.wav', async () => {
    const ws = makeWorkspace()
    const result = await ws.execute('stat /example.wav')
    const text = DEC.decode(result.stdout)
    expect(text).toContain('Duration:')
    expect(text).toContain('Sample rate:')
    await ws.close()
  })

  it('stat /example.mp3', async () => {
    const ws = makeWorkspace()
    const result = await ws.execute('stat /example.mp3')
    const text = DEC.decode(result.stdout)
    expect(text).toContain('Duration:')
    expect(text).toContain('Sample rate:')
    await ws.close()
  })

  it('stat /example.ogg', async () => {
    const ws = makeWorkspace()
    const result = await ws.execute('stat /example.ogg')
    const text = DEC.decode(result.stdout)
    expect(text).toContain('Duration:')
    expect(text).toContain('Sample rate:')
    await ws.close()
  })

  it('stat /example.wav has Channels', async () => {
    const ws = makeWorkspace()
    const result = await ws.execute('stat /example.wav')
    expect(DEC.decode(result.stdout)).toContain('Channels:')
    await ws.close()
  })

  it('stat /example.wav has File size', async () => {
    const ws = makeWorkspace()
    const result = await ws.execute('stat /example.wav')
    expect(DEC.decode(result.stdout)).toContain('File size:')
    await ws.close()
  })

  it('stat /example.wav has Bitrate', async () => {
    const ws = makeWorkspace()
    const result = await ws.execute('stat /example.wav')
    expect(DEC.decode(result.stdout)).toContain('Bitrate:')
    await ws.close()
  })
})

describe.skip('audio transcription (skipped: no recognizer plugged in)', () => {
  it('cat/head/tail/grep require configure({ recognizer })', () => {
    // Transcription is pluggable. Register a recognizer via
    // `configure({ recognizer: (raw, startSec?, endSec?) => AsyncIterable<Uint8Array> })`
    // to enable these tests. The TS port does not ship with a built-in Whisper model.
  })
})

describe('audio stat after cache promotion (cacheMount registration)', () => {
  it('second stat keeps audio metadata when RAM_LOCAL_AUDIO_COMMANDS is on cacheMount', async () => {
    const backend = new DiskResource({ root: DATA_DIR })
    const ws = new Workspace({ '/': backend }, { mode: MountMode.READ })
    ws.mount('/')?.registerFns(DISK_LOCAL_AUDIO_COMMANDS)
    ws.cacheMount.registerFns(RAM_LOCAL_AUDIO_COMMANDS)

    const first = await ws.execute('stat /example.wav')
    const second = await ws.execute('stat /example.wav')
    expect(DEC.decode(first.stdout)).toContain('Sample rate:')
    expect(DEC.decode(second.stdout)).toContain('Sample rate:')
    await ws.close()
  })

  it('regression guard: without cacheMount registration, second stat falls through to built-in', async () => {
    const backend = new DiskResource({ root: DATA_DIR })
    const ws = new Workspace({ '/': backend }, { mode: MountMode.READ })
    ws.mount('/')?.registerFns(DISK_LOCAL_AUDIO_COMMANDS)
    // Intentionally NOT calling ws.cacheMount.registerFns(...)

    await ws.execute('stat /example.wav')
    const second = await ws.execute('stat /example.wav')
    expect(DEC.decode(second.stdout)).not.toContain('Sample rate:')
    await ws.close()
  })
})
