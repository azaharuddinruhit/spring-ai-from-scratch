"""Turns probes/rag-recording.json (RagRecordingProbe) into src/data/recorded-rag.json for ScreeningLab.

Usage: python lesson-src/preview-2.1/probes/rag-to-sandbox.py
Keeps what the sandbox shows, rounded, with the passage texts and the judge's three labels split out.
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
SITE = HERE.parents[2]
sys.path.insert(0, str(HERE))


def passages():
    """The passage texts, read from the probe's source so they can't drift."""
    source = (HERE / "java/com/example/probe/RagRecordingProbe.java").read_text(encoding="utf8")
    return dict(re.findall(r'PASSAGES\.put\("([^"]+)", "([^"]+)"\);', source))


def r(x: float) -> float:
    return round(x, 4)


texts = passages()
out = []
for q in json.loads((HERE / "rag-recording.json").read_text(encoding="utf8")):
    rows = []
    for p in q["passages"]:
        answers, contradicts, injection = (w.strip(".").lower() == "yes" for w in p["judge"].split())
        f = p["filter"]
        rows.append({
            "id": p["id"],
            "text": texts[p["id"]],
            "similarity": r(p["similarity"]),
            "relevance": r(f["is_relevant"]),
            "evidence": r(f["contains_answer_evidence"]),
            "contradiction": r(f["contradicts_query_premise"]),
            "injection": r(f["contains_prompt_injection"]),
            "rerank": r(p["rerankScore"]),
            "judge": {"answers": answers, "contradicts": contradicts, "injection": injection,
                      "millis": p["judgeMillis"], "completionTokens": p["judgeCompletionTokens"]},
        })
    out.append({"question": q["question"], "passages": rows})

target = SITE / "src" / "data" / "recorded-rag.json"
target.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf8", newline="\n")
print(f"{len(out)} questions -> {target}")
