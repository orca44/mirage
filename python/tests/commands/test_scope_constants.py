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

from mirage.commands.builtin.constants import (SCOPE_ERROR, SCOPE_SUGGEST,
                                               SCOPE_WARN, PatternType)


def test_thresholds_ordered():
    assert SCOPE_WARN < SCOPE_SUGGEST < SCOPE_ERROR


def test_threshold_values():
    assert SCOPE_WARN == 100
    assert SCOPE_SUGGEST == 1000
    assert SCOPE_ERROR == 10000


def test_pattern_type_values():
    assert PatternType.EXACT.value == "exact"
    assert PatternType.SIMPLE.value == "simple"
    assert PatternType.REGEX.value == "regex"


def test_pattern_type_is_str():
    assert isinstance(PatternType.EXACT, str)
    assert PatternType.EXACT == "exact"
