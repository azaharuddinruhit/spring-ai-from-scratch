"""Turns the AttackRecordingProbe run (attacks.json) into the AttackLab sandbox data.

python lesson-src/module-6/probes/attacks-to-sandbox.py

Keeps, per attack: the answer, the retrieved sources, each model call (the user message it received, without the RAG
template around it, and the tool calls it asked for), each tool run (arguments and result), the memory rows afterwards,
the refunds and the number of payment calls.
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', '..', 'src', 'data', 'recorded-attacks.json')
LABEL = 'qwen-27b'  # the 27B Qwen 3 reasoning model the recordings ran on

def redacted(text):
    """The recording ran on a private server: its model alias becomes a neutral label, and no server value may remain."""
    model = os.environ.get('QWEN_MODEL')
    if model:
        assert model != LABEL
        text = text.replace(model, LABEL)
    host = re.sub(r'^[a-z]+://|[:/].*$', '', os.environ.get('QWEN_BASE_URL', ''))
    for secret in filter(None, (model, os.environ.get('QWEN_API_KEY'), host)):
        assert secret not in text, 'a server value leaked into the sandbox data'
    return text



def received(sent):
    """The last user message as the model got it: the question part of the RAG template, if there is one."""
    user = [s[len('USER: '):] for s in sent if s.startswith('USER: ')][-1].replace('\r', '')
    m = re.search(r'\nQuery: (.*?)\n\nAnswer:', user, re.S)
    return m.group(1) if m else user


def stored(row):
    """A memory row without carriage returns or the blank lines before the reply text."""
    role, _, text = row.replace('\r', '').partition(': ')
    return f'{role}: {text.strip()}'


attacks = []
for r in json.load(open(os.path.join(HERE, 'attacks.json'), encoding='utf8')):
    steps = []
    for e in r['events']:
        if 'tool' in e:
            steps.append({'tool': e['tool'], 'arguments': e['arguments'], 'result': e['result'] or e['error']})
        else:
            steps.append({'model': e['model'], 'received': received(e['sent']), 'toolCalls': e['toolCalls']})
    attacks.append({
        'attack': r['attack'],
        'answer': r['answer'].strip(),  # the reasoning model starts its text with blank lines
        'sources': r['sources'],
        'steps': steps,
        'memory': [stored(m) for m in r['memory']],
        'refunds': r['refunds'],
        'paymentCalls': r['paymentCalls'],
    })
open(OUT, 'w', encoding='utf8', newline='\n').write(redacted(json.dumps(attacks, ensure_ascii=False, separators=(',', ':'))))
print('wrote', os.path.normpath(OUT), os.path.getsize(OUT), 'bytes,', [len(a['steps']) for a in attacks], 'steps')
