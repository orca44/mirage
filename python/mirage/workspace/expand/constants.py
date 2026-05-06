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

import ast

# AST node types allowed in arithmetic expansion (e.g. $((1 + 2))).
# Used by _safe_eval to reject arbitrary code execution while
# permitting basic integer math: +, -, *, /, %, **, bitwise ops,
# and comparisons.
# Arithmetic operator tokens from tree-sitter that should be passed
# through as-is during arithmetic expansion.
ARITH_OPERATORS = frozenset({
    "+",
    "-",
    "*",
    "/",
    "%",
    "**",
    "==",
    "!=",
    "<",
    ">",
    "<=",
    ">=",
    "&&",
    "||",
    "!",
    "?",
    ":",
    "(",
    ")",
})

# Arithmetic delimiter tokens that mark the start/end of $((...)).
ARITH_DELIMITERS = frozenset({"$((", "))"})

SAFE_NODES = (
    ast.Expression,
    ast.BinOp,
    ast.UnaryOp,
    ast.Constant,
    ast.Add,
    ast.Sub,
    ast.Mult,
    ast.Div,
    ast.Mod,
    ast.Pow,
    ast.FloorDiv,
    ast.BitAnd,
    ast.BitOr,
    ast.BitXor,
    ast.LShift,
    ast.RShift,
    ast.Invert,
    ast.USub,
    ast.UAdd,
    ast.Compare,
    ast.Eq,
    ast.NotEq,
    ast.Lt,
    ast.Gt,
    ast.LtE,
    ast.GtE,
)
