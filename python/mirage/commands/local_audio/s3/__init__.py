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

from mirage.commands.local_audio.s3.cat_mp3 import cat_mp3
from mirage.commands.local_audio.s3.cat_ogg import cat_ogg
from mirage.commands.local_audio.s3.cat_wav import cat_wav
from mirage.commands.local_audio.s3.grep_mp3 import grep_mp3
from mirage.commands.local_audio.s3.grep_ogg import grep_ogg
from mirage.commands.local_audio.s3.grep_wav import grep_wav
from mirage.commands.local_audio.s3.head_mp3 import head_mp3
from mirage.commands.local_audio.s3.head_ogg import head_ogg
from mirage.commands.local_audio.s3.head_wav import head_wav
from mirage.commands.local_audio.s3.stat_mp3 import stat_mp3
from mirage.commands.local_audio.s3.stat_ogg import stat_ogg
from mirage.commands.local_audio.s3.stat_wav import stat_wav
from mirage.commands.local_audio.s3.tail_mp3 import tail_mp3
from mirage.commands.local_audio.s3.tail_ogg import tail_ogg
from mirage.commands.local_audio.s3.tail_wav import tail_wav

COMMANDS = [
    cat_wav,
    cat_mp3,
    cat_ogg,
    head_wav,
    head_mp3,
    head_ogg,
    tail_wav,
    tail_mp3,
    tail_ogg,
    grep_wav,
    grep_mp3,
    grep_ogg,
    stat_wav,
    stat_mp3,
    stat_ogg,
]
