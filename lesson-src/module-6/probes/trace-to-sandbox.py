"""Turns the two TraceRecordingProbe runs into the TraceLab sandbox data.

python lesson-src/module-6/probes/trace-to-sandbox.py

trace-before.json: the Module 5 RAG config (rewrite on every question, same model), content switches off.
trace-after.json + trace-run-after.log: this lesson's config (rewrite only follow-ups, on the smaller model), with
log-prompt, log-completion and tools include-content on. Prompt and completion log lines carry the span id, which is
how they are matched to their span here.
"""
import json, re, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', '..', 'src', 'data', 'recorded-traces.json')
CONTENT_KEYS = {'spring.ai.tool.call.arguments', 'spring.ai.tool.call.result'}
DROP_KEYS = {'spring.ai.tool.definition.schema'}


def kind(span):
    return {'spring.ai.chat.client': 'client', 'spring.ai.advisor': 'advisor', 'spring.ai.tool': 'tool',
            'db.vector.client.operation': 'vector'}.get(span['name']) or (
        'embedding' if span['low'].get('gen_ai.operation.name') == 'embedding' else 'model')


def logged_content(log_path):
    """spanId -> {'prompt': ..., 'completion': ...} from the content log lines."""
    if not log_path:
        return {}
    lines = open(log_path, encoding='utf8').read().split('\n')
    found = {}
    stamp = re.compile(r'^\d{4}-\d{2}-\d{2}T')
    for i, line in enumerate(lines):
        m = re.search(r'\[([0-9a-f]{32})-([0-9a-f]{16})\] .*(Prompt Content|Completion):\s*$', line)
        if not m:
            continue
        body = []
        for nxt in lines[i + 1:]:
            if stamp.match(nxt):
                break
            body.append(nxt)
        found.setdefault(m.group(2), {})['prompt' if 'Prompt' in m.group(3) else 'completion'] = '\n'.join(body).strip()
    return found


def turn_data(turn, content):
    spans = [s for s in turn['spans'] if s['name'] != 'http.client.requests']
    ids = {s['spanId'] for s in spans}
    root = min(spans, key=lambda s: s['startNanos'])
    out = []
    for s in sorted(spans, key=lambda s: (s['startNanos'], -s['endNanos'])):
        attrs = [[k, v] for k, v in list(s['low'].items()) + list(s['high'].items())
                 if k not in DROP_KEYS and k not in CONTENT_KEYS]
        span = {
            'id': s['spanId'],
            'parent': s['parentId'] if s['parentId'] in ids else None,
            'name': s['contextualName'].strip(),
            'kind': kind(s),
            'start': round((s['startNanos'] - root['startNanos']) / 1e6),
            'dur': max(1, round((s['endNanos'] - s['startNanos']) / 1e6)),
            'attrs': attrs,
        }
        recorded = [[k, s['high'][k]] for k in sorted(CONTENT_KEYS) if k in s['high']]
        logged = content.get(s['spanId'], {})
        if recorded:
            span['content'] = recorded
        if logged:
            span['logged'] = logged
        out.append(span)
    return {'question': turn['question'], 'answer': turn['answer'], 'traceId': root['traceId'], 'spans': out}


runs = {}
for name, log in [('before', None), ('after', os.path.join(HERE, 'trace-run-after.log'))]:
    content = logged_content(log)
    runs[name] = [turn_data(t, content) for t in json.load(open(os.path.join(HERE, f'trace-{name}.json'), encoding='utf8'))]
    matched = sum(1 for t in runs[name] for s in t['spans'] if 'logged' in s)
    print(name, [len(t['spans']) for t in runs[name]], 'spans per turn;', matched, 'spans with logged content')
open(OUT, 'w', encoding='utf8', newline='\n').write(json.dumps(runs, ensure_ascii=False, separators=(',', ':')))
print('wrote', os.path.normpath(OUT), os.path.getsize(OUT), 'bytes')
