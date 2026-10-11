import re, pathlib

def strip_sql(text):
    """Blank out comments and dollar-quoted bodies so we only scan real DDL."""
    out = []
    i = 0
    in_block = 0
    while i < len(text):
        if in_block:
            if text.startswith("*/", i): in_block -= 1; out.append("  "); i += 2
            else: out.append("\n" if text[i] == "\n" else " "); i += 1
            continue
        if text.startswith("/*", i): in_block += 1; out.append("  "); i += 2; continue
        if text.startswith("--", i):
            j = text.find("\n", i)
            if j == -1: out.append(" " * (len(text) - i)); break
            out.append(" " * (j - i)); i = j; continue
        m = re.match(r"\$(\w*)\$", text[i:])
        if m:
            tag = m.group(0)
            end = text.find(tag, i + len(tag))
            if end == -1: end = len(text) - len(tag)
            body = text[i:end + len(tag)]
            out.append("".join("\n" if c == "\n" else " " for c in body))
            i = end + len(tag); continue
        out.append(text[i]); i += 1
    return "".join(out)

problems = []
for f in sorted(pathlib.Path("supabase/migrations").glob("*.sql")):
    raw = f.read_text(encoding="utf-8")
    clean = strip_sql(raw).split("\n")
    rawl = raw.split("\n")
    for i, ln in enumerate(clean):
        s = ln.strip().lower()
        if re.match(r"^create table (?!if not exists)", s): problems.append(f"{f.name}:{i+1} create table")
        if re.match(r"^create (unique )?index (?!if not exists)", s): problems.append(f"{f.name}:{i+1} create index")
        if re.match(r"^create type", s): problems.append(f"{f.name}:{i+1} create type outside a DO block")
        if re.match(r"^create policy", s):
            prev = [l.strip().lower() for l in clean[max(0,i-4):i] if l.strip()]
            if not any(p.startswith("drop policy if exists") for p in prev):
                problems.append(f"{f.name}:{i+1} create policy without drop")
        if re.match(r"^create trigger", s):
            prev = [l.strip().lower() for l in clean[max(0,i-4):i] if l.strip()]
            if not any(p.startswith("drop trigger if exists") for p in prev):
                problems.append(f"{f.name}:{i+1} create trigger without drop")
        if re.match(r"^alter table .*add constraint", s): problems.append(f"{f.name}:{i+1} alter add constraint")

print("Idempotency audit — supabase/migrations/")
print("─" * 46)
if problems:
    for p in problems: print("  x", p)
    print(f"\n  {len(problems)} problem(s)")
else:
    print("  clean — every type, table, index, trigger and policy is guarded")
