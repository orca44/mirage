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

import { createRequire } from 'node:module'
import { join } from 'node:path'
import { parseBuffer } from 'music-metadata'

export interface LocalAudioMetadata {
  duration: number | null
  sampleRate: number | null
  channels: number | null
  bitrate: number | null
}

export type LocalAudioTranscriber = (
  raw: Uint8Array,
  startSec?: number,
  endSec?: number,
) => AsyncIterable<Uint8Array | string>

export interface LocalAudioConfig {
  modelDir?: string
  recognizer?: LocalAudioTranscriber
}

interface SherpaOfflineRecognizer {
  createStream(): {
    acceptWaveform(w: { sampleRate: number; samples: Float32Array }): void
  }
  decodeAsync(stream: object): Promise<{ text: string }>
}

interface SherpaModule {
  OfflineRecognizer: new (cfg: unknown) => SherpaOfflineRecognizer
}

interface WaveFileModule {
  WaveFile: new (bytes?: Uint8Array) => {
    toSampleRate(rate: number): void
    toBitDepth(depth: string): void
    getSamples(interleaved: boolean, type: Float32ArrayConstructor): Float32Array
  }
}

const _config: LocalAudioConfig = {}
const ENC = new TextEncoder()
const DEC = new TextDecoder()

let _sherpa: SherpaModule | null = null
let _wavefile: WaveFileModule | null = null
let _recognizer: SherpaOfflineRecognizer | null = null
let _loadedModelDir: string | null = null

const require = createRequire(import.meta.url)

function loadSherpa(): SherpaModule {
  if (_sherpa !== null) return _sherpa
  try {
    _sherpa = require('sherpa-onnx-node') as SherpaModule
    return _sherpa
  } catch {
    throw new Error(
      "Audio transcription requires 'sherpa-onnx-node'. Install with: " +
        'npm i sherpa-onnx-node  (or pnpm/yarn add).',
    )
  }
}

function loadWavefile(): WaveFileModule {
  if (_wavefile !== null) return _wavefile
  try {
    _wavefile = require('wavefile') as WaveFileModule
    return _wavefile
  } catch {
    throw new Error(
      "Built-in WAV decoding requires 'wavefile'. Install with: npm i wavefile  " +
        '(or pass a custom recognizer via configure({ recognizer }) to skip it).',
    )
  }
}

function getRecognizer(modelDir: string): SherpaOfflineRecognizer {
  if (_recognizer !== null && _loadedModelDir === modelDir) return _recognizer
  const sherpa = loadSherpa()
  _recognizer = new sherpa.OfflineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      whisper: {
        encoder: join(modelDir, 'base-encoder.int8.onnx'),
        decoder: join(modelDir, 'base-decoder.int8.onnx'),
      },
      tokens: join(modelDir, 'base-tokens.txt'),
      numThreads: 2,
      provider: 'cpu',
    },
  })
  _loadedModelDir = modelDir
  return _recognizer
}

export function configure(opts: LocalAudioConfig): void {
  if (opts.modelDir !== undefined) _config.modelDir = opts.modelDir
  if (opts.recognizer !== undefined) _config.recognizer = opts.recognizer
  if (opts.modelDir !== undefined && opts.modelDir !== _loadedModelDir) {
    _recognizer = null
    _loadedModelDir = null
  }
}

export function getConfig(): Readonly<LocalAudioConfig> {
  return _config
}

export async function* transcribe(
  raw: Uint8Array,
  startSec?: number,
  endSec?: number,
): AsyncIterable<Uint8Array> {
  // User-supplied recognizer: full override (strings auto-encoded for convenience).
  if (_config.recognizer !== undefined) {
    for await (const chunk of _config.recognizer(raw, startSec, endSec)) {
      yield typeof chunk === 'string' ? ENC.encode(chunk) : chunk
    }
    return
  }

  // Built-in pipeline: sherpa-onnx (Whisper) + wavefile. Mirrors Python's
  // mirage.commands.audio.utils.transcribe() which uses sherpa-onnx + PyAV.
  if (_config.modelDir !== undefined) {
    const isWav = raw.byteLength >= 12 && DEC.decode(raw.subarray(0, 4)) === 'RIFF'
    if (!isWav) {
      throw new Error(
        'Built-in transcriber handles WAV only. For MP3/OGG/other, pass a custom ' +
          'transcriber via configure({ recognizer: (raw, startSec?, endSec?) => ' +
          'AsyncIterable<string | Uint8Array> }).',
      )
    }
    const { WaveFile } = loadWavefile()
    const w = new WaveFile(raw)
    w.toSampleRate(16000)
    w.toBitDepth('32f')
    let samples = w.getSamples(true, Float32Array)
    if (startSec !== undefined || endSec !== undefined) {
      const s = Math.max(0, Math.floor((startSec ?? 0) * 16000))
      const e =
        endSec !== undefined ? Math.min(samples.length, Math.floor(endSec * 16000)) : samples.length
      samples = samples.subarray(s, e)
    }
    const recognizer = getRecognizer(_config.modelDir)
    const stream = recognizer.createStream()
    stream.acceptWaveform({ sampleRate: 16000, samples })
    const result = await recognizer.decodeAsync(stream)
    const text = result.text.trim()
    if (text !== '') yield ENC.encode(`${text}\n`)
    return
  }

  throw new Error(
    'Audio transcription not configured. Call configure({ modelDir }) to use the ' +
      'built-in sherpa-onnx+wavefile pipeline, or configure({ recognizer }) to plug ' +
      'your own.',
  )
}

export async function metadata(raw: Uint8Array): Promise<LocalAudioMetadata> {
  const parsed = await parseBuffer(raw, undefined, { duration: true })
  const f = parsed.format
  return {
    duration: f.duration ?? null,
    sampleRate: f.sampleRate ?? null,
    channels: f.numberOfChannels ?? null,
    bitrate: f.bitrate !== undefined ? f.bitrate / 1000 : null,
  }
}

export function estimateByteRange(
  meta: LocalAudioMetadata,
  fileSize: number,
  startSec?: number,
  endSec?: number,
): [number, number] {
  const duration = meta.duration ?? 0
  if (duration <= 0) return [0, fileSize]
  const start = startSec ?? 0
  const end = endSec ?? duration
  const ratioStart = Math.max(0, start / duration)
  const ratioEnd = Math.min(1, end / duration)
  return [Math.floor(ratioStart * fileSize), Math.floor(ratioEnd * fileSize)]
}

export function formatDuration(duration: number): string {
  const total = Math.floor(duration)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  if (hours > 0) return `${String(hours)}:${mm}:${ss}`
  return `${String(minutes)}:${ss}`
}

export function formatMetadata(
  meta: LocalAudioMetadata,
  path: string,
  fileSize?: number | null,
): string {
  const lines: string[] = [`${path}:`]
  const { duration, sampleRate, channels, bitrate } = meta

  if (duration !== null) lines.push(`  Duration: ${formatDuration(duration)}`)
  else lines.push('  Duration: unknown')

  if (sampleRate !== null) lines.push(`  Sample rate: ${String(Math.floor(sampleRate))} Hz`)

  if (channels !== null) {
    const ch = Math.floor(channels)
    const label = ch === 1 ? 'mono' : ch === 2 ? 'stereo' : `${String(ch)} channels`
    lines.push(`  Channels: ${String(ch)} (${label})`)
  }

  if (bitrate !== null) lines.push(`  Bitrate: ${bitrate.toFixed(1)} kbps`)

  if (fileSize !== undefined && fileSize !== null) {
    if (fileSize >= 1_048_576) lines.push(`  File size: ${(fileSize / 1_048_576).toFixed(1)} MB`)
    else if (fileSize >= 1024) lines.push(`  File size: ${(fileSize / 1024).toFixed(1)} KB`)
    else lines.push(`  File size: ${String(fileSize)} B`)
  }

  return lines.join('\n')
}
