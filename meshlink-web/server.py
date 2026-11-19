#!/usr/bin/env python3
"""MeshLink Web demo server.

- Flask serves the static app on http://localhost:8000
- A tiny WebSocket relay (port 8765) mirrors events between browser tabs/devices
  for the "global relay" transport. No auth, demo only.
"""
from __future__ import annotations

import hashlib
import json
import hmac
import os
import re
import secrets
import smtplib
import ssl
import threading
import time
import urllib.request
from email.message import EmailMessage
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from websockets.sync.server import serve


def _load_local_env() -> None:
    """Load a local .env without overriding real environment variables."""
    for env_file in (Path(__file__).resolve().parent / '.env',
                     Path(__file__).resolve().parent.parent / '.env'):
        if not env_file.is_file():
            continue
        for raw in env_file.read_text(encoding='utf-8').splitlines():
            line = raw.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"\''))


_load_local_env()

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


# ------------------------------------------------------ email OTP verification
# The app-generated 10-digit MeshLink ID is the identity. Email only secures it:
# it is never a login name and never a phone number. Only HMAC hashes of codes
# are kept (never the plaintext), with a 5-minute expiry and 5 confirm attempts.
OTP_TTL = 300
OTP_COOLDOWN = 60
OTP_MAX_ATTEMPTS = 5
OTP_SECRET = os.getenv('OTP_SECRET', 'meshlink-dev-otp-secret')
VERIFY_FROM = os.getenv('VERIFY_FROM', 'onboarding@resend.dev')
RESEND_API_KEY = os.getenv('RESEND_API_KEY', '').strip()
SMTP_USER = os.getenv('SMTP_USER', '').strip()
SMTP_PASSWORD = os.getenv('SMTP_PASSWORD', '').strip()
SMTP_HOST = os.getenv('SMTP_HOST', 'smtp.gmail.com').strip()
SMTP_PORT = int(os.getenv('SMTP_PORT', '587'))
EMAIL_RE = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')

_verify_lock = threading.Lock()
_verify_pending: dict[str, dict] = {}
_verify_verified: dict[str, dict] = {}
_verify_cooldown: dict[str, float] = {}
_verify_rates: dict[str, list[float]] = {}


def _clean_verify():
    now = time.time()
    for key in [k for k, v in _verify_pending.items() if v['expires'] <= now]:
        _verify_pending.pop(key, None)
    for key in [k for k, times in _verify_rates.items() if not times or max(times) < now - 600]:
        _verify_rates.pop(key, None)
    for key in [k for k, until in _verify_cooldown.items() if until <= now]:
        _verify_cooldown.pop(key, None)


def _verify_rate_ok(key: str, limit: int) -> bool:
    now = time.time()
    times = [t for t in _verify_rates.get(key, []) if t > now - 600]
    _verify_rates[key] = times
    if len(times) >= limit:
        return False
    times.append(now)
    return True


def _otp_hash(mesh_id: str, email: str, code: str) -> str:
    message = f'{mesh_id}|{email}|{code}'
    return hmac.new(OTP_SECRET.encode(), message.encode(), hashlib.sha256).hexdigest()


def _send_verification_email(email: str, code: str) -> bool:
    """Send via Gmail SMTP when configured, else Resend, else demo mode."""
    subject = 'MeshLink verification code'
    text = (
        f'Your MeshLink verification code is {code}. It expires in 5 minutes.\n\n'
        'If you did not request this, you can ignore this email.'
    )

    if SMTP_USER and SMTP_PASSWORD:
        message = EmailMessage()
        message['Subject'] = subject
        message['From'] = f'MeshLink <{SMTP_USER}>'
        message['To'] = email
        message.set_content(text)
        try:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=12) as smtp:
                smtp.starttls(context=ssl.create_default_context())
                smtp.login(SMTP_USER, SMTP_PASSWORD)
                smtp.send_message(message)
            return True
        except Exception as exc:
            app.logger.warning('Gmail SMTP verification email failed: %s', exc)
            return False

    body = json.dumps({
        'from': VERIFY_FROM,
        'to': [email],
        'subject': subject,
        'text': text,
    }).encode('utf-8')
    req = urllib.request.Request(
        'https://api.resend.com/emails', data=body,
        headers={'Authorization': f'Bearer {RESEND_API_KEY}', 'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as res:
            return 200 <= res.status < 300
    except Exception as exc:
        app.logger.warning('Verification email failed: %s', exc)
        return False


@app.post("/api/verify/send")
def verify_send():
    payload = request.get_json(silent=True) or {}
    email = str(payload.get('email', '')).strip().lower()[:254]
    mesh_id = ''.join(ch for ch in str(payload.get('meshId', '')) if ch.isdigit())[:10]
    if not EMAIL_RE.match(email) or len(mesh_id) != 10:
        return jsonify({'error': 'A valid email and 10-digit MeshLink ID are required'}), 400

    with _verify_lock:
        _clean_verify()
        if _verify_cooldown.get(email, 0) > time.time():
            wait = int(_verify_cooldown[email] - time.time())
            return jsonify({'error': 'Please wait before requesting another code', 'retryAfter': wait}), 429
        if not _verify_rate_ok(f'email:{email}', 5) or not _verify_rate_ok(f'mesh:{mesh_id}', 10):
            return jsonify({'error': 'Too many verification requests. Try again later.'}), 429
        _verify_cooldown[email] = time.time() + OTP_COOLDOWN

    demo = not RESEND_API_KEY and not (SMTP_USER and SMTP_PASSWORD)
    # Without any email provider nothing is sent: only demo code 123456 is accepted.
    code = '123456' if demo else f'{secrets.randbelow(1000000):06d}'
    if not demo and not _send_verification_email(email, code):
        return jsonify({'error': 'Could not send verification email'}), 502
    with _verify_lock:
        _verify_pending[f'{mesh_id}|{email}'] = {
            'hash': _otp_hash(mesh_id, email, code),
            'expires': time.time() + OTP_TTL,
            'attempts': 0,
        }
    # Never return the code — only whether this is a demo (no email sent).
    return jsonify({'ok': True, 'demo': demo})


@app.post("/api/verify/confirm")
def verify_confirm():
    payload = request.get_json(silent=True) or {}
    email = str(payload.get('email', '')).strip().lower()[:254]
    mesh_id = ''.join(ch for ch in str(payload.get('meshId', '')) if ch.isdigit())[:10]
    code = ''.join(ch for ch in str(payload.get('code', '')) if ch.isdigit())[:6]
    if not EMAIL_RE.match(email) or len(mesh_id) != 10 or len(code) != 6:
        return jsonify({'error': 'A valid email, MeshLink ID and 6-digit code are required'}), 400

    key = f'{mesh_id}|{email}'
    with _verify_lock:
        _clean_verify()
        pending = _verify_pending.get(key)
        if not pending or pending['expires'] <= time.time():
            _verify_pending.pop(key, None)
            return jsonify({'error': 'Code expired — please request a new one'}), 410
        if (pending['attempts'] >= OTP_MAX_ATTEMPTS
                or not _verify_rate_ok(f'confirm:email:{email}', 20)
                or not _verify_rate_ok(f'confirm:mesh:{mesh_id}', 30)):
            _verify_pending.pop(key, None)
            return jsonify({'error': 'Too many attempts — please request a new code'}), 429
        pending['attempts'] += 1
        attempts_left = OTP_MAX_ATTEMPTS - pending['attempts']
        expected = pending['hash']

    if not hmac.compare_digest(_otp_hash(mesh_id, email, code), expected):
        exhausted = attempts_left <= 0
        if exhausted:
            with _verify_lock:
                _verify_pending.pop(key, None)
        return jsonify({
            'error': 'Too many attempts — please request a new code' if exhausted else 'Invalid code',
            'attemptsLeft': attempts_left,
        }), 429 if exhausted else 401

    with _verify_lock:
        _verify_pending.pop(key, None)
        _verify_verified[key] = {'verified': True, 'email': email, 'at': time.time()}
    return jsonify({'verified': True, 'email': email})


@app.get("/api/verify/status")
def verify_status():
    mesh_id = ''.join(ch for ch in str(request.args.get('meshId', '')) if ch.isdigit())[:10]
    if len(mesh_id) != 10:
        return jsonify({'verified': False})
    with _verify_lock:
        found = None
        for key, record in _verify_verified.items():
            if key.startswith(f'{mesh_id}|') and record.get('verified') and record.get('email'):
                if not found or record.get('at', 0) > found.get('at', 0):
                    found = record
    return jsonify({'verified': True, 'email': found['email']}) if found else jsonify({'verified': False})


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
