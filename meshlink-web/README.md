# MeshLink Web

Hybrid messenger + 3-tier calling demo. Works like a normal chat app while online, then falls back to a local hotspot/LAN mesh, and finally to a store-and-forward outbox when nothing is reachable.

Built as vanilla ES modules + Flask. No build step, no npm.

## Run

```bash
cd meshlink-web
pip install flask websockets
python3 server.py
```

- App: http://localhost:8000
- WebSocket relay: `ws://localhost:8765`

Open the app in two tabs (or two devices on the same LAN) to see the relay mirror messages. Use the demo account button, then OTP `123456`.

### Offline AI (optional)

Install [Ollama](https://ollama.com) and pull any local model (for example `ollama pull qwen3:1.7b`). The server detects it automatically at `http://127.0.0.1:11434`. MeshLink maps its model tiers to available local models:

- `MESHLINK_AI_FAST` (default `qwen3:1.7b`)
- `MESHLINK_AI_BALANCED` (default `qwen3:4b`)
- `MESHLINK_AI_DEEP` (default `qwen3:4b`)
- `MESHLINK_AI_URL` to point at another local engine

If no engine is running, MeshLink AI switches to its built-in offline responder. The product name is always **MeshLink AI**; the Ollama adapter lives only in `server.py` and `js/views/ai.js`.

## What is included

- **Identity** — the app generates a private 10-digit MeshLink ID. No phone number or email is ever requested or stored.
- **Security** — AES-256-GCM encrypted local vault, PBKDF2-SHA256 key derivation, optional 6-digit app PIN, 5-minute auto-lock, lock screen, encrypted cross-tab sync.
- **MeshLink AI** — free offline assistant branded as MeshLink AI. Uses a local Ollama engine when present, with a built-in offline responder as fallback.
- **Chats** — search, pinned chats, unread badges, previews, groups, dark/light themes, wallpaper, message replies, reactions, stars, forwarding, deletion, attachments, image/video/audio/doc media, emoji/sticker/GIF pickers.
- **Delivery states** — `queued` → `mesh` → `sent` → `delivered` → `read`, derived from the active transport.
- **Groups** — create, member list, admin labels, group info panel.
- **Calls** — global WebRTC audio/video with mute, camera, speaker and timer; local hotspot P2P call tier; offline voice-note fallback.
- **Walkie-talkie / PTT** — hold-to-talk clips over the local mesh.
- **Nearby peers** — discovery panel, chat/call/PTT actions and an offline QR/SDP handshake demo.
- **Status / Updates** — 24h text and photo statuses, viewer tracking, private replies.
- **Offline outbox** — unique IDs, 24h TTL, dedupe on sync, auto-flush when connectivity returns.
- **Network mode simulator** — Auto, Global Online, Offline Hotspot/LAN Only, Completely Offline.
- **Settings** — profile editor, theme, wallpaper, notifications, read receipts, last seen, blocked contacts, export backup, demo reset.

## Architecture

```
index.html
assets/            favicon
styles.css         purple design system, dark/light themes
js/
  main.js          auth flow, app shell, navigation, event wiring
  store.js         state, persistence, actions, demo replies
  seed.js          demo users/chats/messages/statuses/calls
  chats.js         sidebar, chat list, conversation UI, composer
  ui.js            icons, avatars, modals, menus, toasts, lightbox
  utils.js         formatting, media helpers, notifications, sound, MeshLink ID
  security.js      AES-GCM vault, PBKDF2, PIN lock, session handling
  realtime.js      WebSocket + BroadcastChannel relay
  transport/
    connectivity.js  network mode + connectivity pill state
    globalTransport.js
    localTransport.js
    offlineQueue.js  TTL + dedupe outbox helpers
  media/call.js    WebRTC call overlay, tiers, PTT, offline fallback
  views/
    status.js      status page + story viewer
    calls.js       call history + new call
    nearby.js      nearby peers + simulator
    settings.js    settings page + editors
    ai.js          MeshLink AI chat + local engine adapter
    collections.js starred + archived
server.py          static server, demo WS relay, local AI proxy
schema.sql         reference schema for optional server persistence
```

### Transport selection

| Mode | Chat | Calls |
| --- | --- | --- |
| Online | WebSocket relay (`sent`/`delivered`/`read`) | Global WebRTC |
| Local only | BroadcastChannel / LAN mesh (`mesh`) | Local P2P / PTT |
| Offline | Outbox, 24h TTL (`queued`) | Voice note fallback |

The demo intentionally keeps the local mesh in-browser (`BroadcastChannel`) so it runs anywhere. For a real deployment, swap `localTransport.js` for WebRTC data channels + mDNS/QR SDP exchange and keep the same event contract.

## Notes

- Data is stored in an AES-256-GCM encrypted local vault under `meshlink-web-v1`. The device key lives in `meshlink-device-key`; when an app PIN is enabled, the vault key is derived from that PIN instead.
- Media is stored as data URLs so it survives reloads; very large files may exceed browser storage quotas.
- WebRTC calls use local media only in this demo; signaling events are relayed through the same WebSocket for demonstration.
- The relay is unauthenticated and for local demos only. The AI proxy talks only to the local engine address.
