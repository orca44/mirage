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


def test_sed_substitute(env):
    data = b"hello world\n"
    assert env.mirage("sed s/hello/bye/",
                      stdin=data) == env.native("sed s/hello/bye/", stdin=data)


def test_sed_global(env):
    data = b"foo boo\n"
    assert env.mirage("sed s/o/0/g", stdin=data) == env.native("sed s/o/0/g",
                                                               stdin=data)


def test_sed_first_only(env):
    data = b"foo boo\n"
    assert env.mirage("sed s/o/0/", stdin=data) == env.native("sed s/o/0/",
                                                              stdin=data)


def test_sed_delete_line(env):
    data = b"a\nb\nc\n"
    assert env.mirage("sed 2d", stdin=data) == env.native("sed 2d", stdin=data)


def test_sed_delete_regex(env):
    data = b"foo\nbar\nfoo2\n"
    assert env.mirage("sed /foo/d", stdin=data) == env.native("sed /foo/d",
                                                              stdin=data)


def test_sed_on_file(env):
    env.create_file("f.txt", b"hello world\n")
    assert env.mirage("sed s/hello/bye/ /data/f.txt") == env.native(
        "sed s/hello/bye/ f.txt")


def test_sed_n_suppress(env):
    data = b"a\nb\nc\n"
    assert env.mirage("sed -n p", stdin=data) == env.native("sed -n p",
                                                            stdin=data)


def test_sed_n_with_address(env):
    data = b"a\nb\nc\n"
    assert env.mirage("sed -n 2p", stdin=data) == env.native("sed -n 2p",
                                                             stdin=data)


def test_sed_n_range(env):
    data = b"a\nb\nc\nd\ne\n"
    assert env.mirage("sed -n 2,4p", stdin=data) == env.native("sed -n 2,4p",
                                                               stdin=data)


def test_sed_n_regex_address(env):
    data = b"hello\nworld\nhello again\n"
    assert env.mirage("sed -n /hello/p",
                      stdin=data) == env.native("sed -n /hello/p", stdin=data)


def test_sed_n_on_file(env):
    env.create_file("f.txt", b"a\nb\nc\nd\ne\n")
    assert env.mirage("sed -n 2,3p /data/f.txt") == env.native(
        "sed -n 2,3p f.txt")


def test_sed_E_extended(env):
    data = b"foo123bar\nhello\n"
    assert env.mirage("sed -E 's/[0-9]+/NUM/g'",
                      stdin=data) == env.native("sed -E 's/[0-9]+/NUM/g'",
                                                stdin=data)


def test_sed_E_groups(env):
    data = b"hello world\n"
    assert env.mirage(r"sed -E 's/(hello) (world)/\2 \1/'",
                      stdin=data) == env.native(
                          r"sed -E 's/(hello) (world)/\2 \1/'", stdin=data)


def test_sed_nE_combined(env):
    data = b"abc123\ndef\nghi456\n"
    assert env.mirage("sed -nE '/[0-9]+/p'",
                      stdin=data) == env.native("sed -nE '/[0-9]+/p'",
                                                stdin=data)


def test_sed_i(env):
    env.create_file("f.txt", b"hello world\n")
    env.mirage("sed -i s/hello/bye/ /data/f.txt")
    result = env.mirage("cat /data/f.txt")
    assert "bye" in result


def test_sed_e(env):
    data = b"hello world\n"
    result = env.mirage("sed -e s/hello/bye/", stdin=data)
    assert "bye" in result
