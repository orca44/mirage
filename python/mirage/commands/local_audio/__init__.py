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

from mirage.commands.local_audio.disk import COMMANDS as DISK_COMMANDS
from mirage.commands.local_audio.ram import COMMANDS as RAM_COMMANDS
from mirage.commands.local_audio.s3 import COMMANDS as S3_COMMANDS

AUDIO_COMMANDS = {
    "disk": DISK_COMMANDS,
    "ram": RAM_COMMANDS,
    "s3": S3_COMMANDS,
}
