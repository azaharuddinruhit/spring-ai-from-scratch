"""Turns the Lesson 5.4 recordings (ToolSearchRecordingProbe) into src/data/recorded-tool-search.json for ToolSearchLab.

Usage: python lesson-src/preview-2.1/probes/tool-search-to-sandbox.py
Reads probes/tool-search-recording.json (each index, and no search) and probes/tool-search-max3.json (Lucene with
max-results 3), and the tool descriptions from the lesson's SupportTools.java, so neither can drift.
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
SITE = HERE.parents[2]
TOOLS = HERE.parent / "code/tool-search/main/com/example/support/tools/SupportTools.java"
ORDER = ["regex", "lucene", "lucene3", "vector", "decision", "none"]


def tools():
    source = TOOLS.read_text(encoding="utf8")
    found = re.findall(r'@Tool\(description = "([^"]+)"\)\s+public \S+ (\w+)\(', source)
    return [{"name": name, "description": description} for description, name in found]


def r(x):
    return round(x, 4)


def run(recorded):
    searches = []
    for s in recorded["searches"]:
        search = {
            "query": s["query"],
            "maxResults": s["maxResults"],
            "results": [{"tool": x["tool"], "score": None if x["score"] == -1 else r(x["score"])} for x in s["results"]],
        }
        if "anyToolApplies" in s:
            search["anyToolApplies"] = r(s["anyToolApplies"])
            search["bestTool"] = sorted(([k, r(v)] for k, v in s["bestTool"].items()), key=lambda kv: -kv[1])
        searches.append(search)
    calls = [{
        "toolsSent": c["toolsSent"],
        "toolCalls": [{"name": t["name"], "arguments": t["arguments"]} for t in c["toolCalls"]],
        "promptTokens": c["promptTokens"],
        "completionTokens": c["completionTokens"],
        "millis": c["millis"],
    } for c in recorded["calls"]]
    # The sandbox shows answers as plain text, so markdown bold markers go.
    return {"answer": recorded["answer"].replace("**", "").strip(), "millis": recorded["millis"], "calls": calls, "searches": searches}


recording = json.loads((HERE / "tool-search-recording.json").read_text(encoding="utf8"))
bounded = json.loads((HERE / "tool-search-max3.json").read_text(encoding="utf8"))
requests = {}
for recorded in recording:
    requests.setdefault(recorded["request"], {})[recorded["index"]] = run(recorded)
for recorded in bounded:
    requests[recorded["request"]]["lucene3"] = run(recorded)

out = {
    "tools": tools(),
    "requests": [{"request": request, "runs": {k: runs[k] for k in ORDER}} for request, runs in requests.items()],
}
assert len(out["tools"]) == 10 and all(len(x["runs"]) == len(ORDER) for x in out["requests"])
target = SITE / "src" / "data" / "recorded-tool-search.json"
target.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf8", newline="\n")
print(f"{len(out['requests'])} requests -> {target}")
