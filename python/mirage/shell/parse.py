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

import tree_sitter
import tree_sitter_bash

BASH_LANGUAGE = tree_sitter.Language(tree_sitter_bash.language())
TS_PARSER = tree_sitter.Parser(BASH_LANGUAGE)


def parse(command: str) -> tree_sitter.Node:
    """Parse a shell command string into a tree-sitter AST.

    Returns the root tree-sitter node.
    """
    tree = TS_PARSER.parse(command.encode())
    return tree.root_node


_BASH_KEYWORDS = frozenset({
    "if", "then", "else", "elif", "fi",
    "for", "while", "until", "do", "done",
    "case", "esac", "in", "function", "select",
})

_STRUCTURAL_TOKENS = frozenset({
    "(", ")", "{", "}", "[", "]",
    '"', "'", "`",
})


def _is_structural_error(node: tree_sitter.Node) -> bool:
    """True if an ERROR node represents a real syntactic problem.

    Tree-sitter occasionally emits ERROR nodes for stray statement
    separators that bash itself accepts (notably ``& ;``). A real
    syntax error contains a bash keyword, a bracket / quote token,
    or a named subtree the parser tried to recover; stand-alone
    statement separators (``;``, ``&``, ``|``) are not enough.
    """
    for child in node.children:
        if child.is_named:
            return True
        if child.type in _BASH_KEYWORDS:
            return True
        if child.type in _STRUCTURAL_TOKENS:
            return True
    return False


def find_syntax_error(node: tree_sitter.Node) -> str | None:
    """Locate a top-level structural syntax error in a parsed AST.

    Args:
        node (tree_sitter.Node): root node from parse().

    Returns:
        str | None: text of the offending region, or None if the AST is clean.
    """
    if not node.has_error:
        return None
    for child in node.children:
        if child.is_missing:
            text = child.text
            return text.decode(errors="replace") if text else ""
        if child.type == "ERROR" and _is_structural_error(child):
            text = child.text
            return text.decode(errors="replace") if text else ""
    return None
