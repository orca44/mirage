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

from pathlib import Path

import numpy as np
import pytest

from mirage.commands.local_audio.utils import (_decode_frames, format_duration,
                                               format_metadata, metadata)

DATA_DIR = Path(__file__).resolve().parents[4] / "data"
WAV_BYTES = (DATA_DIR / "example.wav").read_bytes()
MP3_BYTES = (DATA_DIR / "example.mp3").read_bytes()
OGG_BYTES = (DATA_DIR / "example.ogg").read_bytes()


class TestDecodeFrames:

    @pytest.mark.parametrize("raw", [WAV_BYTES, MP3_BYTES, OGG_BYTES],
                             ids=["wav", "mp3", "ogg"])
    def test_returns_pcm_arrays(self, raw: bytes):
        frames = list(_decode_frames(raw))
        assert len(frames) > 0
        for arr in frames:
            assert isinstance(arr, np.ndarray)
            assert arr.dtype == np.int16

    @pytest.mark.parametrize("raw", [WAV_BYTES, MP3_BYTES, OGG_BYTES],
                             ids=["wav", "mp3", "ogg"])
    def test_total_duration_reasonable(self, raw: bytes):
        frames = list(_decode_frames(raw))
        total_samples = sum(len(f) for f in frames)
        duration = total_samples / 16000
        assert 5 < duration < 10

    def test_end_sec_limits_output(self):
        frames_full = list(_decode_frames(WAV_BYTES))
        frames_short = list(_decode_frames(WAV_BYTES, end_sec=2.0))
        full_samples = sum(len(f) for f in frames_full)
        short_samples = sum(len(f) for f in frames_short)
        assert short_samples < full_samples

    def test_start_sec_seeks(self):
        frames_full = list(_decode_frames(WAV_BYTES))
        frames_from_3 = list(_decode_frames(WAV_BYTES, start_sec=3.0))
        full_samples = sum(len(f) for f in frames_full)
        seek_samples = sum(len(f) for f in frames_from_3)
        assert seek_samples < full_samples

    def test_start_and_end_sec(self):
        frames = list(_decode_frames(WAV_BYTES, start_sec=1.0, end_sec=4.0))
        total_samples = sum(len(f) for f in frames)
        duration = total_samples / 16000
        assert 1.0 < duration < 5.0


class TestMetadata:

    @pytest.mark.parametrize(
        "raw,expected_sr",
        [(WAV_BYTES, 16000), (MP3_BYTES, 16000), (OGG_BYTES, 16000)],
        ids=["wav", "mp3", "ogg"],
    )
    def test_sample_rate(self, raw: bytes, expected_sr: int):
        meta = metadata(raw)
        assert meta["sample_rate"] == expected_sr

    @pytest.mark.parametrize("raw", [WAV_BYTES, MP3_BYTES, OGG_BYTES],
                             ids=["wav", "mp3", "ogg"])
    def test_channels(self, raw: bytes):
        meta = metadata(raw)
        assert meta["channels"] == 1

    @pytest.mark.parametrize("raw", [WAV_BYTES, MP3_BYTES, OGG_BYTES],
                             ids=["wav", "mp3", "ogg"])
    def test_duration(self, raw: bytes):
        meta = metadata(raw)
        assert meta["duration"] is not None
        assert 5 < meta["duration"] < 10

    @pytest.mark.parametrize("raw", [WAV_BYTES, MP3_BYTES, OGG_BYTES],
                             ids=["wav", "mp3", "ogg"])
    def test_bitrate(self, raw: bytes):
        meta = metadata(raw)
        assert meta["bitrate"] is not None
        assert meta["bitrate"] > 0

    def test_partial_bytes_wav(self):
        partial = WAV_BYTES[:131072]
        meta = metadata(partial)
        assert meta["sample_rate"] == 16000
        assert meta["channels"] == 1
        assert meta["duration"] is not None

    def test_partial_bytes_mp3(self):
        partial = MP3_BYTES[:131072]
        meta = metadata(partial)
        assert meta["sample_rate"] == 16000

    def test_partial_bytes_ogg(self):
        partial = OGG_BYTES[:131072]
        meta = metadata(partial)
        assert meta["sample_rate"] == 16000


class TestFormatMetadata:

    def test_basic_format(self):
        meta = {
            "duration": 120.5,
            "sample_rate": 16000,
            "channels": 1,
            "bitrate": 128.0
        }
        result = format_metadata(meta, "/test.wav", file_size=2_000_000)
        assert "/test.wav:" in result
        assert "Duration: 2:00" in result
        assert "16000 Hz" in result
        assert "mono" in result
        assert "128.0 kbps" in result
        assert "1.9 MB" in result

    def test_stereo_channels(self):
        meta = {
            "duration": 60.0,
            "sample_rate": 44100,
            "channels": 2,
            "bitrate": 320.0
        }
        result = format_metadata(meta, "/music.mp3")
        assert "stereo" in result

    def test_unknown_duration(self):
        meta = {
            "duration": None,
            "sample_rate": 8000,
            "channels": 1,
            "bitrate": None
        }
        result = format_metadata(meta, "/broken.wav")
        assert "unknown" in result

    def test_small_file_size_kb(self):
        meta = {
            "duration": 1.0,
            "sample_rate": 8000,
            "channels": 1,
            "bitrate": 64.0
        }
        result = format_metadata(meta, "/tiny.wav", file_size=5120)
        assert "5.0 KB" in result

    def test_file_size_bytes(self):
        meta = {
            "duration": 0.1,
            "sample_rate": 8000,
            "channels": 1,
            "bitrate": 64.0
        }
        result = format_metadata(meta, "/micro.wav", file_size=500)
        assert "500 B" in result

    def test_no_file_size(self):
        meta = {
            "duration": 10.0,
            "sample_rate": 8000,
            "channels": 1,
            "bitrate": 64.0
        }
        result = format_metadata(meta, "/test.wav")
        assert "File size" not in result

    def test_multi_channel(self):
        meta = {
            "duration": 10.0,
            "sample_rate": 48000,
            "channels": 6,
            "bitrate": 640.0
        }
        result = format_metadata(meta, "/surround.wav")
        assert "6 channels" in result


class TestFormatDuration:

    def test_seconds_only(self):
        assert format_duration(5.0) == "0:05"

    def test_minutes_and_seconds(self):
        assert format_duration(65.0) == "1:05"

    def test_exact_minute(self):
        assert format_duration(120.0) == "2:00"

    def test_hours(self):
        assert format_duration(3661.0) == "1:01:01"

    def test_zero(self):
        assert format_duration(0.0) == "0:00"

    def test_fractional_truncates(self):
        assert format_duration(59.9) == "0:59"

    def test_large_hours(self):
        assert format_duration(36000.0) == "10:00:00"
