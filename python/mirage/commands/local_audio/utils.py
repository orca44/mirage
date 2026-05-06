# ========= Copyright 2026 @ Strukto.AI All Rights Reserved. =========
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# ========= Copyright 2026 @ Strukto.AI All Rights Reserved. =========

import io
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import av
import numpy as np
from tinytag import TinyTag

from mirage.io.sync_bridge import sync_to_async_iter

_METADATA_RANGE = 131072

_config: dict[str, str] = {}
_recognizer = None


def configure(model_dir: str) -> None:
    """Configure audio transcription settings.

    Args:
        model_dir (str): Path to sherpa-onnx whisper model directory
            containing encoder, decoder, and tokens files.
    """
    global _recognizer
    _config["model_dir"] = model_dir
    _recognizer = None


def _get_recognizer():
    """Return a singleton sherpa-onnx offline recognizer (lazy import).

    Returns:
        sherpa_onnx.OfflineRecognizer: The recognizer instance.
    """
    global _recognizer
    if _recognizer is None:
        import sherpa_onnx

        model_dir = _config.get("model_dir", "")
        if not model_dir:
            raise RuntimeError("Audio not configured. Call "
                               "mirage.commands.local_audio.utils.configure("
                               "model_dir='path/to/model') first.")
        d = Path(model_dir)
        encoder = str(d / "base-encoder.onnx")
        decoder = str(d / "base-decoder.onnx")
        tokens = str(d / "base-tokens.txt")
        _recognizer = sherpa_onnx.OfflineRecognizer.from_whisper(
            encoder=encoder,
            decoder=decoder,
            tokens=tokens,
        )
    return _recognizer


def _decode_frames(
    raw: bytes,
    start_sec: float | None = None,
    end_sec: float | None = None,
) -> Iterator[np.ndarray]:
    """Decode audio bytes to 16kHz mono s16 PCM frames using PyAV.

    Args:
        raw (bytes): Raw audio file bytes.
        start_sec (float | None): Seek to this position before decoding.
        end_sec (float | None): Stop decoding after this timestamp.

    Yields:
        np.ndarray: Flattened int16 PCM arrays, one per resampled frame.
    """
    container = av.open(io.BytesIO(raw))
    stream = container.streams.audio[0]
    resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
    if start_sec is not None:
        offset = int(start_sec / stream.time_base)
        container.seek(offset, stream=stream)
    for frame in container.decode(stream):
        ts = float(frame.pts * stream.time_base)
        if end_sec is not None and ts >= end_sec:
            break
        for resampled in resampler.resample(frame):
            yield resampled.to_ndarray().flatten()
    container.close()


def _transcribe_worker(
    queue: object,
    raw: bytes,
    start_sec: float | None = None,
    end_sec: float | None = None,
) -> None:
    """Decode and transcribe audio, pushing result text to queue.

    Args:
        queue (object): An asyncio.Queue; receives encoded text then None.
        raw (bytes): Raw audio file bytes.
        start_sec (float | None): Start position in seconds.
        end_sec (float | None): End position in seconds.
    """
    recognizer = _get_recognizer()
    s = recognizer.create_stream()
    for pcm in _decode_frames(raw, start_sec, end_sec):
        s.accept_waveform(16000, pcm.astype(np.float32) / 32768.0)
    recognizer.decode_stream(s)
    text = s.result.text.strip()
    if text:
        queue.put_nowait(text.encode())
    queue.put_nowait(None)


async def transcribe(
    raw: bytes,
    start_sec: float | None = None,
    end_sec: float | None = None,
) -> AsyncIterator[bytes]:
    """Transcribe audio bytes, yielding text chunks asynchronously.

    Args:
        raw (bytes): Raw audio file bytes.
        start_sec (float | None): Start position in seconds.
        end_sec (float | None): End position in seconds.

    Yields:
        bytes: Encoded transcription text chunks.
    """
    async for chunk in sync_to_async_iter(_transcribe_worker, raw, start_sec,
                                          end_sec):
        yield chunk


def metadata(raw: bytes) -> dict:
    """Parse audio metadata from bytes (128KB is enough for headers).

    Args:
        raw (bytes): Raw audio file bytes (full or partial).

    Returns:
        dict: Keys: duration, sample_rate, channels, bitrate.
    """
    tag = TinyTag.get(file_obj=io.BytesIO(raw))
    return {
        "duration": tag.duration,
        "sample_rate": tag.samplerate,
        "channels": tag.channels,
        "bitrate": tag.bitrate,
    }


def estimate_byte_range(
    meta: dict,
    file_size: int,
    start_sec: float | None = None,
    end_sec: float | None = None,
) -> tuple[int, int]:
    """Estimate byte range for a time range in an audio file.

    Args:
        meta (dict): Metadata dict from metadata().
        file_size (int): Total file size in bytes.
        start_sec (float | None): Start time in seconds.
        end_sec (float | None): End time in seconds.

    Returns:
        tuple[int, int]: Estimated (start_byte, end_byte).
    """
    duration = meta.get("duration") or 0
    if duration <= 0:
        return 0, file_size
    start = start_sec or 0
    end = end_sec if end_sec is not None else duration
    ratio_start = max(0, start / duration)
    ratio_end = min(1, end / duration)
    return int(ratio_start * file_size), int(ratio_end * file_size)


def format_metadata(meta: dict,
                    path: str,
                    file_size: int | None = None) -> str:
    """Format audio metadata as human-readable text.

    Args:
        meta (dict): Metadata dict from metadata().
        path (str): File path for the header line.
        file_size (int | None): File size in bytes.

    Returns:
        str: Formatted metadata string.
    """
    lines = [f"{path}:"]
    duration = meta.get("duration")
    sample_rate = meta.get("sample_rate")
    channels = meta.get("channels")
    bitrate = meta.get("bitrate")

    if duration is not None:
        lines.append(f"  Duration: {format_duration(duration)}")
    else:
        lines.append("  Duration: unknown")

    if sample_rate is not None:
        lines.append(f"  Sample rate: {int(sample_rate)} Hz")

    if channels is not None:
        ch = int(channels)
        if ch == 1:
            label = "mono"
        elif ch == 2:
            label = "stereo"
        else:
            label = f"{ch} channels"
        lines.append(f"  Channels: {ch} ({label})")

    if bitrate is not None:
        lines.append(f"  Bitrate: {bitrate:.1f} kbps")

    if file_size is not None:
        if file_size >= 1_048_576:
            lines.append(f"  File size: {file_size / 1_048_576:.1f} MB")
        elif file_size >= 1024:
            lines.append(f"  File size: {file_size / 1024:.1f} KB")
        else:
            lines.append(f"  File size: {file_size} B")

    return "\n".join(lines)


def format_duration(duration: float) -> str:
    """Format seconds as M:SS or H:MM:SS string.

    Args:
        duration (float): Duration in seconds.

    Returns:
        str: Formatted duration string.
    """
    total = int(duration)
    hours = total // 3600
    minutes = (total % 3600) // 60
    seconds = total % 60
    if hours > 0:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"
