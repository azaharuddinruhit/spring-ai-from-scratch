"""Replaces @@CODE <file> | <regex>; <regex>@@ lines in an MDX template with a fenced java block whose meta highlights
the lines matching each regex, so lesson code is exactly the code that compiled. Lines marked "// probe-only" are workarounds
for this machine (see findings.md) and are left out of the lesson."""
import re, sys
template, out, root = sys.argv[1], sys.argv[2], sys.argv[3]
def block(m):
    path, _, pats = m.group(1).partition('|')
    code = open(root + '/' + path.strip(), encoding='utf8').read().rstrip('\n')
    lines = [l for l in code.split('\n') if '// probe-only' not in l]
    code = '\n'.join(lines)
    hits = []
    for pat in [p.strip() for p in pats.split(';') if p.strip()]:
        found = [i + 1 for i, l in enumerate(lines) if re.search(pat, l)]
        assert found, (path, pat)
        hits += found
    meta = ' {' + ','.join(map(str, sorted(set(hits)))) + '}' if hits else ''
    lang = 'yaml' if path.strip().endswith(('.yaml', '.yml')) else 'java'
    return '```' + lang + meta + '\n' + code + '\n```'
s = open(template, encoding='utf8').read()
s = re.sub(r'^@@CODE (.+?)@@$', block, s, flags=re.M)
assert '@@CODE' not in s
open(out, 'w', encoding='utf8', newline='\n').write(s)
