#!/usr/bin/env python3
"""MeshLink Web demo server.

- Flask serves the static app on http://localhost:8000
- A tiny WebSocket relay (port 8765) mirrors events between browser tabs/devices
  for the "global relay" transport. No auth, demo only.
"""
from __future__ import annotations

import json
import hmac
import os
import secrets
import threading
import time
import urllib.request
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from websockets.sync.server import serve

ROOT = Path(__file__).resolve().parent
WS_PORT = 8765
HTTP_PORT = 8000
OLLAMA_URL = os.getenv('MESHLINK_AI_URL', 'http://127.0.0.1:11434')
AI_MODELS = {
    'meshlink-mini': os.getenv('MESHLINK_AI_FAST', 'qwen3:1.7b'),
    'meshlink-plus': os.getenv('MESHLINK_AI_BALANCED', 'qwen3:4b'),
    'meshlink-pro': os.getenv('MESHLINK_AI_DEEP', 'qwen3:4b'),
}

app = Flask(__name__, static_folder=str(ROOT), static_url_path="")

# Short-lived QR pairing sessions. Tokens rotate every 30 seconds and are
# accepted only once, from the phone that scanned the currently shown code.
PAIR_TTL = 30
_pair_lock = threading.Lock()
_pair_sessions: dict[str, dict] = {}
_pair_attempts: dict[str, list[float]] = {}


def _clean_pairs():
    now = time.time()
    for key in [k for k, v in _pair_sessions.items() if v["expires"] < now - 60]:
        _pair_sessions.pop(key, None)
    for key in [k for k, times in _pair_attempts.items() if not times or max(times) < now - 60]:
        _pair_attempts.pop(key, None)


def _rate_ok(ip: str) -> bool:
    now = time.time()
    times = [t for t in _pair_attempts.get(ip, []) if t > now - 10]
    _pair_attempts[ip] = times
    if len(times) >= 8:
        return False
    times.append(now)
    return True


def available_models():
    try:
        with urllib.request.urlopen(f'{OLLAMA_URL}/api/tags', timeout=2) as res:
            data = json.loads(res.read().decode('utf-8'))
        return [m.get('name', '') for m in data.get('models', []) if m.get('name')]
    except Exception:
        return []


def pick_model(requested):
    avail = available_models()
    target = AI_MODELS.get(str(requested), requested)
    if target in avail:
        return target
    return avail[0] if avail else (target or AI_MODELS['meshlink-mini'])



@app.after_request
def no_cache(resp):
    if resp.mimetype in ("text/html", "text/css", "application/javascript") or \
            request.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["X-Permitted-Cross-Domain-Policies"] = "none"
    resp.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    resp.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    resp.headers["Permissions-Policy"] = "geolocation=(), microphone=(self), camera=(self)"
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; "
        "media-src 'self' data: blob:; "
        "connect-src 'self' ws: wss:; "
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    )
    return resp


@app.get("/health")
def health():
    return {"ok": True, "service": "meshlink-web"}


@app.post("/api/ai/chat")
def ai_chat():
    """Proxy to a free local Ollama engine. The UI calls this MeshLink AI."""
    from flask import request, jsonify
    payload = request.get_json(silent=True) or {}
    model = pick_model(payload.get('model'))
    body = json.dumps({
        'model': model,
        'messages': payload.get('messages', []),
        'stream': False,
        'options': {'temperature': 0.6, 'num_predict': 320},
    }).encode('utf-8')
    req = urllib.request.Request(
        f'{OLLAMA_URL}/api/chat', data=body,
        headers={'Content-Type': 'application/json'}, method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            data = json.loads(res.read().decode('utf-8'))
        return jsonify({'message': data.get('message', {}), 'model': model, 'engine': 'local'})
    except Exception as exc:
        return jsonify({'error': 'local engine unavailable', 'detail': str(exc), 'model': model}), 503


@app.get("/api/ai/status")
def ai_status():
    from flask import jsonify
    try:
        with urllib.request.urlopen(f'{OLLAMA_URL}/api/tags', timeout=1.5) as res:
            data = json.loads(res.read().decode('utf-8'))
        models = [m.get('name', '') for m in data.get('models', [])]
        return jsonify({'online': True, 'models': models, 'engine': 'local'})
    except Exception:
        return jsonify({'online': False, 'models': [], 'engine': 'built-in'})


# ------------------------------------------------------------- QR link login
@app.post("/api/pair/session")
def pair_session():
    """Open a 30-second pairing window for the browser showing the QR code."""
    if not _rate_ok(request.remote_addr or "unknown"):
        return jsonify({"error": "too many attempts"}), 429
    _clean_pairs()
    sid = secrets.token_urlsafe(18)
    token = secrets.token_hex(16)
    expires = time.time() + PAIR_TTL
    with _pair_lock:
        _pair_sessions[sid] = {
            "token": token,
            "expires": expires,
            "status": "pending",
            "peer": None,
        }
    return jsonify({"session": sid, "token": token, "expires": expires})


@app.get("/api/pair/status")
def pair_status():
    sid = request.args.get("session", "")
    with _pair_lock:
        session = _pair_sessions.get(sid)
    if not session:
        return jsonify({"error": "expired"}), 410
    if session["status"] == "pending" and session["expires"] < time.time():
        return jsonify({"status": "expired"}), 410
    return jsonify({
        "status": session["status"],
        "peer": session["peer"],
        "expires": session["expires"],
    })


@app.post("/api/pair/approve")
def pair_approve():
    """Called by the MeshLink phone after scanning a valid QR code."""
    if not _rate_ok(request.remote_addr or "unknown"):
        return jsonify({"error": "too many attempts"}), 429
    payload = request.get_json(silent=True) or {}
    sid = str(payload.get("session", ""))
    token = str(payload.get("token", ""))
    mesh_id = "".join(ch for ch in str(payload.get("meshId", "")) if ch.isdigit())[:10]
    name = str(payload.get("name", "")).strip()[:48]
    with _pair_lock:
        session = _pair_sessions.get(sid)
        if not session:
            return jsonify({"error": "expired"}), 410
        if session["expires"] < time.time():
            return jsonify({"error": "expired"}), 410
        if not hmac.compare_digest(session["token"], token):
            return jsonify({"error": "invalid token"}), 403
        if session["status"] == "approved":
            return jsonify({"status": "approved"})
        session["status"] = "approved"
        session["peer"] = {
            "meshId": mesh_id,
            "name": name or "MeshLink phone",
            "about": "Linked from MeshLink mobile",
        }
    return jsonify({"status": "approved"})


@app.get("/")
def index():
    return send_from_directory(ROOT, "index.html")


@app.get("/<path:path>")
def static_files(path: str):
    return send_from_directory(ROOT, path)


# ------------------------------------------------------------------ WS relay
_clients = set()
_lock = threading.Lock()


def ws_handler(ws):
    with _lock:
        _clients.add(ws)
    try:
        for raw in ws:
            try:
                event = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if not isinstance(event, dict) or "type" not in event:
                continue
            payload = json.dumps(event)
            with _lock:
                targets = list(_clients)
            for client in targets:
                if client is ws:
                    continue
                try:
                    client.send(payload)
                except Exception:
                    pass
    finally:
        with _lock:
            _clients.discard(ws)


def start_relay():
    with serve(ws_handler, "0.0.0.0", WS_PORT) as server:
        server.serve_forever()


if __name__ == "__main__":
    threading.Thread(target=start_relay, daemon=True).start()
    print(f"MeshLink app     : http://localhost:{HTTP_PORT}")
    print(f"MeshLink relay   : ws://localhost:{WS_PORT}")
    app.run(host="0.0.0.0", port=HTTP_PORT, debug=False)
