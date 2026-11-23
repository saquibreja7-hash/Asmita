# Fake Asmita partner API for the tx-extension-asmita test suite.
#
# A real local HTTP server (http.server), not a monkeypatch: the plugin is
# exercised through urllib exactly as HMA exercises it. It implements the
# documented /signals contract (asmita/docs/product/partner-api.md):
# an opaque checkpoint, strict (createdAt, seq) record order, ADD records
# with the hash, and explicit deleted:true/hash:null tombstones.

import json
import threading
import typing as t
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

API_KEY = "ppk_test_0000000000000000000000"

# Deterministic synthetic PDQ-like hashes: 64 lowercase hex, no real image.
def fake_hash(seed: str) -> str:
    import hashlib

    return hashlib.sha256(seed.encode()).hexdigest()


class FakeAsmitaState:
    """The event log the fake serves, plus everything it records."""

    def __init__(self) -> None:
        # One event: (id, kind "image"|"video", type "ADD"|"WITHDRAW",
        # hash or None, updated_at unix seconds)
        self.events: t.List[t.Dict[str, t.Any]] = []
        self.requests: t.List[t.Dict[str, t.Any]] = []
        self.outcomes: t.List[t.Dict[str, t.Any]] = []
        self.auth_mode: str = "ok"  # ok | unauthorized | forbidden
        # When set, /signals answers with this object verbatim (malformed
        # page/record tests exercise the real response path).
        self.malformed: t.Optional[t.Any] = None
        self._seq = 0

    def add(self, fingerprint_id: str, kind: str = "image", hash_value: t.Optional[str] = None, updated_at: int = 1) -> None:
        self._seq += 1
        self.events.append(
            {
                "id": fingerprint_id,
                "signal_type": "vpdq" if kind == "video" else "pdq",
                "deleted": False,
                "hash": hash_value,
                "updated_at": updated_at,
                "tags": ["asmita", "ncii", "survivor_consented"],
                "seq": self._seq,
            }
        )

    def withdraw(self, fingerprint_id: str, kind: str = "image", updated_at: int = 2) -> None:
        self._seq += 1
        self.events.append(
            {
                "id": fingerprint_id,
                "signal_type": "vpdq" if kind == "video" else "pdq",
                "deleted": True,
                "hash": None,
                "updated_at": updated_at,
                "tags": ["asmita", "ncii", "survivor_consented"],
                "seq": self._seq,
            }
        )

    def signal_requests(self) -> int:
        return sum(1 for request in self.requests if request["path"] == "/signals")

    def page(self, after_seq: int, limit: int) -> t.Dict[str, t.Any]:
        records = [dict(event) for event in self.events if event["seq"] > after_seq]
        served = records[:limit]
        has_more = len(records) > limit
        last_seq = served[-1]["seq"] if served else after_seq
        for record in served:
            record.pop("seq")
        return {"checkpoint": f"cp{last_seq}", "has_more": has_more, "records": served}


class _Handler(BaseHTTPRequestHandler):
    state: FakeAsmitaState  # set by the fixture

    def log_message(self, format: str, *args: t.Any) -> None:  # noqa: A002
        pass  # keep the test output clean

    def _record_request(self, path: str, body: t.Optional[t.Dict[str, t.Any]] = None) -> None:
        self.state.requests.append(
            {
                "path": path,
                "query": dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(self.path).query)),
                "authorization": self.headers.get("Authorization"),
                "body": body,
            }
        )

    def _respond(self, status: int, payload: t.Dict[str, t.Any]) -> None:
        raw = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:
        split = urllib.parse.urlsplit(self.path)
        rel = split.path.rsplit("/api/partner/v1", 1)[-1]
        self._record_request(rel)
        if self.state.auth_mode == "unauthorized":
            return self._respond(401, {"error": "unauthorized"})
        if self.state.auth_mode == "forbidden":
            return self._respond(403, {"error": "insufficient_scope"})
        if rel != "/signals":
            return self._respond(404, {"error": "not_found"})
        if self.headers.get("Authorization") != f"Bearer {API_KEY}":
            return self._respond(401, {"error": "unauthorized"})
        if self.state.malformed is not None:
            return self._respond(200, self.state.malformed)
        query = dict(urllib.parse.parse_qsl(split.query))
        after = 0
        checkpoint = query.get("checkpoint", "")
        if checkpoint.startswith("cp"):
            after = int(checkpoint[2:] or 0)
        limit = min(int(query.get("page_size", "500")), 800)
        return self._respond(200, self.state.page(after, limit))

    def do_POST(self) -> None:
        split = urllib.parse.urlsplit(self.path)
        rel = split.path.rsplit("/api/partner/v1", 1)[-1]
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length) or b"null")
        self._record_request(rel, body)
        if self.state.auth_mode == "unauthorized":
            return self._respond(401, {"error": "unauthorized"})
        if self.state.auth_mode == "forbidden":
            return self._respond(403, {"error": "insufficient_scope"})
        if rel != "/outcomes":
            return self._respond(404, {"error": "not_found"})
        if self.headers.get("Authorization") != f"Bearer {API_KEY}":
            return self._respond(401, {"error": "unauthorized"})
        self.state.outcomes.append(body)
        return self._respond(200, {"ok": True})


def start_fake_asmita(state: FakeAsmitaState) -> tuple:
    handler = type("BoundHandler", (_Handler,), {"state": state})
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread
