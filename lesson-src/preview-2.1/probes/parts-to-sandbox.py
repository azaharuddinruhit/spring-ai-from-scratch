"""Turns the Lesson 1.5 recording (PartsRecordingProbe) into src/data/recorded-parts.json for MessagePartsLab.

Usage: python lesson-src/preview-2.1/probes/parts-to-sandbox.py
Reads probes/parts-recording.json (the parts Spring AI built for every model call) and probes/parts-rec-log.jsonl (the
logging proxy's request and response bodies, git-ignored because they name the server's model). The model name, ids and
the proxy's own fields are dropped; tool definitions are left out of the requests.
"""
import json
import os
import re
from pathlib import Path

HERE = Path(__file__).parent
SITE = HERE.parents[2]
DROP = {"provider_specific_fields", "refusal", "audio", "function_call", "annotations"}


def part(p):
    kind = {"ReasoningPart": "reasoning", "TextPart": "text", "ToolCallPart": "toolCall", "ToolResultPart": "toolResult"}[p["class"]]
    out = {"kind": kind}
    if kind in ("reasoning", "text"):
        out["text"] = p["text"]
    elif kind == "toolCall":
        out |= {"name": p["name"], "arguments": p["arguments"]}
    else:
        out |= {"name": p["name"], "text": "".join(c.get("text", "") for c in p["content"])}
    return out


def clean(message):
    return {k: v for k, v in message.items() if v is not None and k not in DROP}


def wire_request(request):
    messages = []
    for m in request["messages"]:
        m = clean(m)
        if m["role"] == "system":
            m["content"] = "You are the support assistant of an online shop. …"
        messages.append(m)
    extra = {k: v for k, v in request.items() if k not in ("messages", "tools", "model", "stream_options")}
    return {"messages": messages, **extra}


def wire_reply(response, streamed):
    if not streamed:
        choice = json.loads(response)["choices"][0]
        return clean(choice["message"])
    deltas = []
    for event in response.split("\n\n"):
        event = event.strip()
        if not event.startswith("data:") or event == "data: [DONE]":
            continue
        chunk = json.loads(event[5:])
        if chunk.get("choices"):
            delta = clean(chunk["choices"][0]["delta"])
            delta.pop("role", None)
            if delta and delta != {"content": ""}:
                deltas.append(delta)
    return deltas


steps = json.loads((HERE / "parts-recording.json").read_text(encoding="utf8"))
wire = [json.loads(line) for line in (HERE / "parts-rec-log.jsonl").read_text(encoding="utf8").splitlines()]
out = []
for step in steps:
    calls = []
    for i, call in enumerate(step["calls"]):
        w = wire[step["wire"][0] + i]
        streamed = bool(w["request"].get("stream"))
        recorded = {
            "request": wire_request(w["request"]),
            "reply": wire_reply(w["response"], streamed),
            "promptTokens": call["promptTokens"],
            "completionTokens": call["completionTokens"],
            "millis": call["millis"],
        }
        if streamed:
            chunks = [x["parts"][0] for x in call["chunks"] if x["parts"] and (x["parts"][0].get("text") or x["parts"][0]["class"] != "TextPart")]
            recorded["chunks"] = [part(c) | {"partIndex": int(c["attributes"]["partIndex"]), "partial": c["partial"]}
                                  for c in chunks if "attributes" in c]
            # The parts the aggregated message ended up with are what the next call's request carries.
            following = step["calls"][i + 1]["request"] if i + 1 < len(step["calls"]) else None
            recorded["parts"] = [part(p) for p in following[2]["parts"]] if following else None
        else:
            recorded["parts"] = [part(p) for p in call["reply"]]
        calls.append(recorded)
    result = step["result"]
    out.append({
        "key": step["label"],
        "answer": (result["answer"] if isinstance(result, dict) else result).strip(),
        "reasoning": result.get("reasoning", "").strip() if isinstance(result, dict) else None,
        "calls": calls,
    })

text = json.dumps(out, ensure_ascii=False, indent=1) + "\n"
# Each step has at most one tool call, so the server's generated ids become one plain id.
text = re.sub(r"chatcmpl-tool-[0-9a-f]+", "call-1", text)
for secret in filter(None, (os.environ.get("QWEN_MODEL"), os.environ.get("QWEN_API_KEY"))):
    assert secret not in text, "a server value leaked into the sandbox data"
assert '"model"' not in text and "chatcmpl" not in text
target = SITE / "src" / "data" / "recorded-parts.json"
target.write_text(text, encoding="utf8", newline="\n")
print(f"{len(out)} steps -> {target}")
