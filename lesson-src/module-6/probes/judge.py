"""Sends each recorded answer through the exact RelevancyEvaluator and FactCheckingEvaluator prompts (2.0.2 templates) to a
judge model, and records the raw verdicts."""
import json, sys, urllib.request
port, model, runs_file = sys.argv[1], sys.argv[2], sys.argv[3]
question = sys.argv[4]
context = "# Refunds\n\nYou can ask for a refund within 30 days of purchase. We send the money back to the card you paid with.\n\nRefunds reach your card 5 to 7 business days after we approve them. Your bank may take a little longer to show the credit."
relevancy = """Your task is to evaluate if the response for the query
is in line with the context information provided.

You have two options to answer. Either YES or NO.

Answer YES, if the response for the query
is in line with context information otherwise NO.

Query:
{query}

Response:
{response}

Context:
{context}

Answer:
"""
fact = """Evaluate whether or not the following claim is supported by the provided document.
Respond with "yes" if the claim is supported, or "no" if it is not.

Document:
{document}

Claim:
{claim}
"""
def ask(text):
    body = {"model": model, "stream": False, "options": {"temperature": 0}, "messages": [{"role": "user", "content": text}]}
    req = urllib.request.Request(f"http://127.0.0.1:{port}/api/chat", json.dumps(body).encode(), {"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=300))["message"]["content"]
out = []
for i, answer in enumerate(json.load(open(runs_file, encoding="utf8"))):
    r = ask(relevancy.replace("{query}", question).replace("{response}", answer).replace("{context}", context))
    f = ask(fact.replace("{document}", context).replace("{claim}", answer))
    out.append({"relevancy": r, "factChecking": f})
    print(i + 1, repr(r[:80]), repr(f[:80]))
json.dump(out, open(runs_file.replace(".json", f"-judge-{model.replace(':', '-')}.json"), "w", encoding="utf8"), indent=2)
