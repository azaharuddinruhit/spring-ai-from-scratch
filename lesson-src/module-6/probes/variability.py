"""Asks llama3.2:3b the same question five times with the support app's system prompt and Spring AI's RAG template
(temperature 0.8, Ollama's default), and records the replies for the Testing & Evals sandbox."""
import json, sys, urllib.request
port = sys.argv[1]
system = """You are the support assistant for Acme Cloud.
Answer questions about policies, prices and shipping only from the context you are given. If it
doesn't hold the answer, say you don't know and offer to pass the question to a support agent.
Use the tools for questions about the customer's own orders and refunds.
Answer in English."""
context = "# Refunds\n\nYou can ask for a refund within 30 days of purchase. We send the money back to the card you paid with.\n\nRefunds reach your card 5 to 7 business days after we approve them. Your bank may take a little longer to show the credit."
user_tpl = """Context information is below.

---------------------
{context}
---------------------

Given the context information and no prior knowledge, answer the query.

Follow these rules:

1. If the answer is not in the context, just say that you don't know.
2. Avoid statements like "Based on the context..." or "The provided information...".

Query: {question}

Answer:
"""
question = sys.argv[2]
user = user_tpl.replace("{context}", context).replace("{question}", question)
runs = []
for i in range(5):
    body = {"model": "llama3.2:3b", "stream": False, "options": {"temperature": 0.8},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    req = urllib.request.Request(f"http://127.0.0.1:{port}/api/chat", json.dumps(body).encode(), {"Content-Type": "application/json"})
    runs.append(json.load(urllib.request.urlopen(req, timeout=300))["message"]["content"])
    print(i + 1, repr(runs[-1]))
json.dump(runs, open("variability-" + sys.argv[3] + ".json", "w", encoding="utf8"), indent=2)
