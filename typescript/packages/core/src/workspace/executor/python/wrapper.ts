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

export const PYTHON_REPL_WRAPPER = `
import codeop, sys, io, traceback

try:
    _repl_session_globals
except NameError:
    _repl_session_globals = {}

_sid = _repl_session_id
if _sid not in _repl_session_globals:
    _repl_session_globals[_sid] = {
        '__name__': '__main__',
        '__doc__': None,
        '__package__': None,
        '__loader__': None,
        '__spec__': None,
        '__annotations__': {},
        '__builtins__': __builtins__,
    }
_repl_globals = _repl_session_globals[_sid]

_out_bytes = io.BytesIO()
_err_bytes = io.BytesIO()
_out_text  = io.TextIOWrapper(_out_bytes, encoding='utf-8', errors='replace',
                              write_through=True, line_buffering=True)
_err_text  = io.TextIOWrapper(_err_bytes, encoding='utf-8', errors='replace',
                              write_through=True, line_buffering=True)

_status = 'complete'
_exit_code = 0
_codeobj = None

try:
    _codeobj = codeop.compile_command(_user_code, '<repl>', 'single')
except (SyntaxError, ValueError, OverflowError):
    traceback.print_exc(file=_err_text)
    _exit_code = 1
    _codeobj = False

if _codeobj is None:
    _status = 'incomplete'
elif _codeobj is not False:
    _saved_stdout = sys.stdout
    _saved_stderr = sys.stderr
    _saved_stdin = sys.stdin
    sys.stdout = _out_text
    sys.stderr = _err_text
    sys.stdin = io.TextIOWrapper(io.BytesIO(b''), encoding='utf-8', errors='replace')
    try:
        exec(_codeobj, _repl_globals)
    except SystemExit as _e:
        _code = _e.code
        if _code is None:
            _exit_code = 0
        elif isinstance(_code, bool):
            _exit_code = int(_code)
        elif isinstance(_code, int):
            _exit_code = _code
        else:
            _err_text.write(str(_code) + '\\n')
            _exit_code = 1
        _status = 'exit'
    except BaseException:
        traceback.print_exc(file=_err_text)
        _exit_code = 1
    finally:
        _out_text.flush()
        _err_text.flush()
        sys.stdout = _saved_stdout
        sys.stderr = _saved_stderr
        sys.stdin = _saved_stdin

_repl_result = (_out_bytes.getvalue(), _err_bytes.getvalue(), _exit_code, _status)
`

export const PYTHON_WRAPPER = `
import os, sys, io, traceback

_saved_env    = dict(os.environ)
_saved_path   = list(sys.path)
_saved_stdin  = sys.stdin
_saved_stdout = sys.stdout
_saved_stderr = sys.stderr
_saved_argv   = sys.argv

_out_bytes = io.BytesIO()
_err_bytes = io.BytesIO()
_out_text  = io.TextIOWrapper(_out_bytes, encoding='utf-8', errors='replace',
                              write_through=True, line_buffering=True)
_err_text  = io.TextIOWrapper(_err_bytes, encoding='utf-8', errors='replace',
                              write_through=True, line_buffering=True)

_stdin_buf  = io.BytesIO(bytes(_stdin_bytes) if _stdin_bytes is not None else b'')
_stdin_text = io.TextIOWrapper(_stdin_buf, encoding='utf-8', errors='replace')

_exit_code = 0
try:
    os.environ.clear()
    os.environ.update(dict(_merged_env))
    sys.stdin  = _stdin_text
    sys.stdout = _out_text
    sys.stderr = _err_text
    sys.argv   = list(_argv)
    try:
        exec(compile(_user_code, '<string>', 'exec'), dict(_user_globals))
    except SystemExit as _e:
        _code = _e.code
        if _code is None:
            _exit_code = 0
        elif isinstance(_code, bool):
            _exit_code = int(_code)
        elif isinstance(_code, int):
            _exit_code = _code
        else:
            _err_text.write(str(_code) + '\\n')
            _exit_code = 1
    except BaseException:
        traceback.print_exc(file=_err_text)
        _exit_code = 1
finally:
    _out_text.flush()
    _err_text.flush()
    os.environ.clear()
    os.environ.update(_saved_env)
    sys.path[:]  = _saved_path
    sys.stdin    = _saved_stdin
    sys.stdout   = _saved_stdout
    sys.stderr   = _saved_stderr
    sys.argv     = _saved_argv

_result = (_out_bytes.getvalue(), _err_bytes.getvalue(), _exit_code)
`
