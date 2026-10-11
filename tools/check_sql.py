"""Structural validation of the generated setup SQL.

There is no psql or Postgres available in this environment, so this cannot prove
the SQL is semantically correct. It does catch the realistic editing mistakes:
an unbalanced parenthesis or dollar-quote introduced while rewriting a function,
and a missing statement terminator at the end of a file.

The scanner below walks the file once, tracking single-quoted literals (with the
doubled-quote escape), line comments, nestable block comments and dollar-quoted
bodies. Only characters in actual code positions are counted, so an apostrophe
or a bracket inside a comment or a string cannot skew the result — which is
exactly what an earlier regex-based version of this check got wrong.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    ROOT / "supabase" / "migrations" / "0001_schema.sql",
    ROOT / "supabase" / "migrations" / "0002_rls.sql",
    ROOT / "supabase" / "migrations" / "0003_analytics.sql",
    ROOT / "supabase" / "migrations" / "0004_matchmaker.sql",
    ROOT / "supabase" / "seed.sql",
    ROOT / "supabase" / "setup-all.sql",
]

DOLLAR_TAG = re.compile(r"\$\$|\$[A-Za-z_][A-Za-z0-9_]*\$")


def scan_code(text: str):
    """Return (code_chars, dollar_opens, dollar_closes) with comments skipped."""
    code: list[tuple[int, str]] = []
    opens = 0
    closes = 0

    i = 0
    length = len(text)
    line = 1
    in_line_comment = False
    block_depth = 0
    open_tag: str | None = None

    while i < length:
        char = text[i]
        following = text[i + 1] if i + 1 < length else ""

        if char == "\n":
            line += 1
            in_line_comment = False
            i += 1
            continue

        if in_line_comment:
            i += 1
            continue

        if block_depth > 0:
            if char == "/" and following == "*":
                block_depth += 1
                i += 2
                continue
            if char == "*" and following == "/":
                block_depth -= 1
                i += 2
                continue
            i += 1
            continue

        if open_tag is not None:
            if text.startswith(open_tag, i):
                closes += 1
                i += len(open_tag)
                open_tag = None
                continue
            if char == "\n":
                line += 1
            i += 1
            continue

        # From here we are in code position.
        if char == "-" and following == "-":
            in_line_comment = True
            i += 2
            continue

        if char == "/" and following == "*":
            block_depth = 1
            i += 2
            continue

        if char == "'":
            i += 1
            while i < length:
                if text[i] == "'":
                    if i + 1 < length and text[i + 1] == "'":
                        i += 2
                        continue
                    i += 1
                    break
                if text[i] == "\n":
                    line += 1
                i += 1
            continue

        if char == "$":
            match = DOLLAR_TAG.match(text, i)
            if match:
                open_tag = match.group(0)
                opens += 1
                i = match.end()
                continue

        code.append((line, char))
        i += 1

    return code, opens, closes


failures: list[str] = []

for path in FILES:
    text = path.read_text(encoding="utf-8")
    code, dollar_opens, dollar_closes = scan_code(text)

    depth = 0
    min_depth = 0
    min_line = 0
    for line, char in code:
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth < min_depth:
                min_depth = depth
                min_line = line

    if dollar_opens != dollar_closes:
        failures.append(
            f"{path.name}: {dollar_opens} dollar-quote opener(s) but {dollar_closes} closer(s)"
        )
    if depth != 0:
        failures.append(f"{path.name}: parentheses unbalanced by {depth:+d}")
    if min_depth < 0:
        failures.append(f"{path.name}: extra ')' at line {min_line}")
    if not text.rstrip().endswith(";"):
        failures.append(f"{path.name}: does not end with a statement terminator")

    balance = "balanced" if depth == 0 else f"{depth:+d}"
    print(
        f"  {path.name:26} {len(text):>7} chars  "
        f"dollar={dollar_opens}/{dollar_closes}  parens={balance}"
    )

print()
if failures:
    for failure in failures:
        print(f"FAIL  {failure}")
    sys.exit(1)
print("All SQL files are structurally balanced.")
