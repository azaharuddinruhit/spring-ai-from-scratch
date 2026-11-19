"""Forwards OpenAI-compatible requests to QWEN_BASE_URL and appends each request and response body to a JSON-lines file, so a
probe can show exactly what Spring AI sent (for example whether reasoning was replayed).

    python logging-proxy.py <port> <log.jsonl>

The upstream address and key come from the environment (QWEN_BASE_URL, e.g. http://host:4000/v1); nothing is stored here.
"""
import json
import os
import sys
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT, LOG = int(sys.argv[1]), sys.argv[2]
UPSTREAM = os.environ['QWEN_BASE_URL'].rstrip('/')
UPSTREAM_ROOT = UPSTREAM[: -len('/v1')] if UPSTREAM.endswith('/v1') else UPSTREAM


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        headers = {k: v for k, v in self.headers.items() if k.lower() in ('authorization', 'content-type', 'accept')}
        request = urllib.request.Request(UPSTREAM_ROOT + self.path, data=body, headers=headers, method='POST')
        try:
            upstream = urllib.request.urlopen(request, timeout=600)
            status, data, ctype = upstream.status, upstream.read(), upstream.headers.get('Content-Type', 'application/json')
        except urllib.error.HTTPError as e:
            status, data, ctype = e.code, e.read(), e.headers.get('Content-Type', 'application/json')
        with open(LOG, 'a', encoding='utf8') as log:
            try:
                req = json.loads(body)
            except ValueError:
                req = body.decode('utf8', 'replace')
            log.write(json.dumps({'path': self.path, 'status': status, 'request': req,
                                  'response': data.decode('utf8', 'replace')}) + '\n')
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
