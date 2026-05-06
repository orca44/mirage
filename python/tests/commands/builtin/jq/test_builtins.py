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

import pytest

from mirage.core.jq import JQ_EMPTY, jq_eval


class TestJqType:

    def test_type_object(self):
        assert jq_eval({"a": 1}, "type") == "object"

    def test_type_array(self):
        assert jq_eval([1, 2], "type") == "array"

    def test_type_string(self):
        assert jq_eval("hello", "type") == "string"

    def test_type_number_int(self):
        assert jq_eval(42, "type") == "number"

    def test_type_number_float(self):
        assert jq_eval(3.14, "type") == "number"

    def test_type_boolean(self):
        assert jq_eval(True, "type") == "boolean"

    def test_type_null(self):
        assert jq_eval(None, "type") == "null"


class TestJqFlatten:

    def test_flatten_nested(self):
        assert jq_eval([[1, 2], [3, 4]], "flatten") == [1, 2, 3, 4]

    def test_flatten_mixed(self):
        assert jq_eval([[1], 2, [3, 4]], "flatten") == [1, 2, 3, 4]

    def test_flatten_already_flat(self):
        assert jq_eval([1, 2, 3], "flatten") == [1, 2, 3]

    def test_flatten_empty(self):
        assert jq_eval([], "flatten") == []

    def test_flatten_non_list_raises(self):
        with pytest.raises(ValueError):
            jq_eval("hello", "flatten")


class TestJqUnique:

    def test_unique_with_duplicates(self):
        assert jq_eval([1, 2, 2, 3, 1], "unique") == [1, 2, 3]

    def test_unique_already_unique(self):
        assert jq_eval([1, 2, 3], "unique") == [1, 2, 3]

    def test_unique_empty(self):
        assert jq_eval([], "unique") == []

    def test_unique_strings(self):
        assert jq_eval(["a", "b", "a"], "unique") == ["a", "b"]

    def test_unique_non_list_raises(self):
        with pytest.raises(ValueError):
            jq_eval("hello", "unique")


class TestJqSort:

    def test_sort_numbers(self):
        assert jq_eval([3, 1, 2], "sort") == [1, 2, 3]

    def test_sort_strings(self):
        assert jq_eval(["c", "a", "b"], "sort") == ["a", "b", "c"]

    def test_sort_already_sorted(self):
        assert jq_eval([1, 2, 3], "sort") == [1, 2, 3]

    def test_sort_empty(self):
        assert jq_eval([], "sort") == []

    def test_sort_non_list_raises(self):
        with pytest.raises(ValueError):
            jq_eval("hello", "sort")


class TestJqReverse:

    def test_reverse_list(self):
        assert jq_eval([1, 2, 3], "reverse") == [3, 2, 1]

    def test_reverse_string_raises(self):
        with pytest.raises(ValueError):
            jq_eval("hello", "reverse")

    def test_reverse_empty_list(self):
        assert jq_eval([], "reverse") == []

    def test_reverse_single_element(self):
        assert jq_eval([42], "reverse") == [42]


class TestJqNot:

    def test_not_true(self):
        assert jq_eval(True, "not") is False

    def test_not_false(self):
        assert jq_eval(False, "not") is True

    def test_not_none(self):
        assert jq_eval(None, "not") is True

    def test_not_zero_is_false_in_jq(self):
        assert jq_eval(0, "not") is False

    def test_not_nonempty_list(self):
        assert jq_eval([1], "not") is False

    def test_not_empty_list_is_false_in_jq(self):
        assert jq_eval([], "not") is False


class TestJqLiterals:

    def test_null(self):
        assert jq_eval({"a": 1}, "null") is None

    def test_true(self):
        assert jq_eval({}, "true") is True

    def test_false(self):
        assert jq_eval({}, "false") is False

    def test_empty_returns_sentinel(self):
        assert jq_eval({}, "empty") is JQ_EMPTY


class TestJqAddMinMax:

    def test_add_sum_array(self):
        assert jq_eval([1, 2, 3], "add") == 6

    def test_add_concat_strings(self):
        assert jq_eval(["a", "b", "c"], "add") == "abc"

    def test_add_empty_array(self):
        assert jq_eval([], "add") is None

    def test_add_concat_arrays(self):
        assert jq_eval([[1, 2], [3, 4]], "add") == [1, 2, 3, 4]

    def test_min(self):
        assert jq_eval([3, 1, 2], "min") == 1

    def test_max(self):
        assert jq_eval([3, 1, 2], "max") == 3

    def test_min_strings(self):
        assert jq_eval(["b", "a", "c"], "min") == "a"

    def test_max_strings(self):
        assert jq_eval(["b", "a", "c"], "max") == "c"

    def test_min_empty(self):
        assert jq_eval([], "min") is None

    def test_max_empty(self):
        assert jq_eval([], "max") is None


class TestJqFirstLastAnyAll:

    def test_first(self):
        assert jq_eval([10, 20, 30], "first") == 10

    def test_last(self):
        assert jq_eval([10, 20, 30], "last") == 30

    def test_any_true(self):
        assert jq_eval([False, True, False], "any") is True

    def test_any_false(self):
        assert jq_eval([False, False], "any") is False

    def test_all_true(self):
        assert jq_eval([True, True], "all") is True

    def test_all_false(self):
        assert jq_eval([True, False], "all") is False

    def test_any_empty(self):
        assert jq_eval([], "any") is False

    def test_all_empty(self):
        assert jq_eval([], "all") is True


class TestJqConversions:

    def test_to_number(self):
        assert jq_eval("42", "tonumber") == 42

    def test_to_number_float(self):
        assert jq_eval("3.14", "tonumber") == 3.14

    def test_tostring(self):
        assert jq_eval(42, "tostring") == "42"

    def test_tostring_on_string(self):
        assert jq_eval("hello", "tostring") == "hello"


class TestJqCsvTsv:

    def test_csv(self):
        result = jq_eval(["a", "b", "c"], "@csv")
        assert result == '"a","b","c"'

    def test_tsv(self):
        result = jq_eval(["a", "b", "c"], "@tsv")
        assert result == "a\tb\tc"

    def test_csv_with_numbers(self):
        result = jq_eval([1, 2, 3], "@csv")
        assert result == "1,2,3"

    def test_tsv_with_numbers(self):
        result = jq_eval([1, 2, 3], "@tsv")
        assert result == "1\t2\t3"

    def test_csv_non_list_raises(self):
        with pytest.raises(ValueError):
            jq_eval("hello", "@csv")

    def test_tsv_non_list_raises(self):
        with pytest.raises(ValueError):
            jq_eval("hello", "@tsv")


class TestJqFlattenRecursive:

    def test_flatten_recursive(self):
        assert jq_eval([[[1, [2]], [3]], [4]], "flatten") == [1, 2, 3, 4]
