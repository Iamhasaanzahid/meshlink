/* MeshLink AI — offline local intelligence.
   Talks to a local Ollama engine through the MeshLink server (brand-facing name: MeshLink AI).
   When no local engine is installed, a built-in offline responder keeps the demo usable. */
import { act, getState, unreadTotal } from '../store.js';
import { icon, toast, confirmDialog } from '../ui.js';
import { esc, fmtTime } from '../utils.js';

const MODELS = [
  { id: 'meshlink-mini', label: 'MeshLink Mini', note: 'fast · local' },
  { id: 'meshlink-plus', label: 'MeshLink Plus', note: 'balanced · local' },
  { id: 'meshlink-pro', label: 'MeshLink Pro', note: 'deep · local' },
];

const PROMPTS = [
  'Summarize my chats',
  'How does offline mesh work?',
  'Explain my security',
  'Help me write a reply',
  'What happens when I am offline?',
  'Tell me about calls',
];

let engineStatus = 'checking';
let engineModels = [];

export function renderAiPage() {
  const ai = getState().ai || { messages: [], model: 'meshlink-mini' };
  return `<div class="page ai-page"><div class="page-inner ai-inner">
    <div class="page-head"><div><div class="eyebrow">Offline intelligence · on-device</div><h1>MeshLink AI</h1><p>Ask anything. Runs against a free local engine — no cloud, no account, no internet required.</p></div><div class="head-actions"><button class="btn" data-action="ai-clear">${icon('trash')} Clear</button></div></div>
    <div class="ai-layout">
      <aside class="card ai-side">
        <div class="ai-engine"><div class="ai-orb">${icon('sparkles','lg')}</div><div class="grow"><div style="font-weight:750;font-size:13px">Local engine</div><div class="muted small" id="ai-engine-state">${engineStatus === 'online' ? `Ready · ${engineModels.length} model${engineModels.length === 1 ? '' : 's'}` : engineStatus === 'checking' ? 'Checking local engine…' : 'Built-in offline responder'}</div></div><span class="engine-dot ${engineStatus}"></span></div>
        <div class="ai-section-label">Models</div>
        <div class="stack" style="gap:6px">${MODELS.map((m) => `<button class="model-row ${ai.model === m.id ? 'active' : ''}" data-action="ai-model" data-model="${m.id}">${icon(ai.model === m.id ? 'check' : 'sparkles','sm')}<div class="grow"><div class="si-title">${m.label}</div><div class="si-sub">${m.note}</div></div></button>`).join('')}</div>
        <div class="ai-section-label">Quick prompts</div>
        <div class="ai-prompts">${PROMPTS.map((p) => `<button class="chip" data-action="ai-prompt" data-text="${esc(p)}">${esc(p)}</button>`).join('')}</div>
        <div class="auth-note">${icon('shield')} MeshLink AI never needs your phone number, email or location. Prompts stay on this device.</div>
      </aside>
      <section class="card ai-chat">
        <div class="ai-chat-head"><div class="ai-avatar">${icon('sparkles')}</div><div class="grow"><div style="font-weight:750;font-size:13px">MeshLink AI</div><div class="muted small">Offline assistant · ${esc(MODELS.find((m) => m.id === ai.model)?.label || 'MeshLink Mini')}</div></div><span class="tag purple">LOCAL</span></div>
        <div class="ai-messages" id="ai-messages">
          ${ai.messages.length ? ai.messages.map((m) => aiBubble(m)).join('') : `<div class="ai-welcome"><div class="ai-orb big">${icon('sparkles','xl')}</div><h2>Ask MeshLink AI</h2><p>Summarize chats, draft replies, or learn how the offline mesh works. Answers are generated locally.</p><div class="ai-suggest">${PROMPTS.slice(0, 3).map((p) => `<button class="chip" data-action="ai-prompt" data-text="${esc(p)}">${esc(p)}</button>`).join('')}</div></div>`}
        </div>
        <form class="ai-composer" data-form="ai"><textarea class="textarea" id="ai-input" rows="1" placeholder="Message MeshLink AI…" style="resize:none"></textarea><button class="send-btn" id="ai-send" type="submit" title="Send">${icon('send')}</button></form>
      </section>
    </div>
  </div></div>`;
}

function aiBubble(m) {
  const mine = m.role === 'user';
  return `<div class="ai-msg ${mine ? 'mine' : 'theirs'}" id="ai-msg-${m.id}"><div class="ai-msg-head">${mine ? 'You' : icon('sparkles','xs') + ' MeshLink AI'} · ${fmtTime(m.at)}</div><div class="ai-bubble ${m.pending ? 'pending' : ''}">${m.pending ? '<span class="typing"><i></i><i></i><i></i></span>' : esc(m.text || '')}${!m.pending && !mine ? `<button class="ai-copy" data-action="ai-copy" data-id="${m.id}" title="Copy">${icon('copy','xs')}</button>` : ''}</div></div>`;
}

function localReply(q) {
  const s = getState();
  const text = String(q || '').trim();
  const low = text.toLowerCase();
  if (/^(hi|hello|salam|assalam|yo)\b/.test(low)) return 'Salam! Main MeshLink AI — your offline assistant. Ask me about your chats, security, calls, or mesh mode. 💜';
  if (/summar|recap|overview|khulasa/.test(low)) {
    const msgs = s.messages.length, chats = s.chats.length, unread = unreadTotal();
    return `Here's your MeshLink snapshot: ${chats} conversations, ${msgs} messages, ${unread} unread. ${s.statuses.length} active statuses and ${s.calls.length} calls are stored in your encrypted local vault.`;
  }
  if (/offline|mesh|hotspot|lan|relay/.test(low)) return 'MeshLink has 3 layers: 1) Global WebSocket relay when online, 2) local hotspot/LAN mesh when no internet is reachable, 3) a store-and-forward outbox with 24h TTL and dedupe when nothing is available. Messages move up a layer automatically when connectivity returns.';
  if (/secur|encrypt|pin|password|privacy|hack/.test(low)) return 'Your vault uses AES-256-GCM encryption with a PBKDF2-SHA256 key (150k iterations). A 6-digit app PIN adds a second layer and auto-locks after 5 minutes. MeshLink assigns a random 10-digit ID — it never asks for your real phone number or email.';
  if (/number|id|identity|phone/.test(low)) return 'Your identity is the 10-digit MeshLink ID generated on this device. It is not your phone number and cannot be changed. Share it only with people you want to chat with.';
  if (/call|voice|video|ptt|walkie/.test(low)) return 'Calls have 3 tiers: global WebRTC audio/video with adaptive Opus; local hotspot P2P with push-to-talk; and offline voice-note fallback that enters the outbox and syncs later.';
  if (/reply|draft|write|compose/.test(low)) return 'Try: "Bhai, message mil gaya — main 10 minute me reply karta hoon." Short, clear and warm. Want it more formal or more casual?';
  if (/status|story|update/.test(low)) return 'Status updates expire after 24 hours. You can post text or photos, and your own viewer list is private to you.';
  if (/who are you|what are you|model/.test(low)) return 'I am MeshLink AI, a free offline assistant running through a local engine. Inside the code the integration is called the local Ollama adapter, but the product name is always MeshLink AI.';
  return 'Main yahan hoon 💜. I can summarize your chats, draft a reply, explain the offline mesh, or walk you through security. Ask me in English or Roman Urdu.';
}

async function callLocalEngine(text) {
  const ai = getState().ai;
  const history = ai.messages.filter((m) => !m.pending).slice(-12).map((m) => ({ role: m.role, content: m.text }));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ai.model, messages: [...history, { role: 'user', content: text }] }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('engine unavailable');
    const data = await res.json();
    engineStatus = 'online';
    return String(data.message?.content || data.message || data.response || '').trim() || localReply(text);
  } catch {
    engineStatus = 'offline';
    return localReply(text);
  } finally {
    clearTimeout(timer);
  }
}

export async function refreshAiStatus() {
  try {
    const res = await fetch('/api/ai/status');
    const data = await res.json();
    engineModels = Array.isArray(data.models) ? data.models : [];
    engineStatus = data.online ? 'online' : 'offline';
  } catch { engineStatus = 'offline'; }
  const el = document.getElementById('ai-engine-state');
  if (el) el.textContent = engineStatus === 'online' ? `Ready · ${engineModels.length} local model${engineModels.length === 1 ? '' : 's'}` : 'Built-in offline responder';
  document.querySelector('.engine-dot')?.classList.toggle('online', engineStatus === 'online');
}

export async function askAi(raw) {
  const text = String(raw || '').trim();
  if (!text) return;
  const s = getState();
  const input = document.getElementById('ai-input');
  if (input) input.value = '';
  act.addAiMessage({ role: 'user', text });
  const pendingId = act.addAiMessage({ role: 'assistant', text: '', pending: true });
  const reply = await callLocalEngine(text);
  act.updateAiMessage(pendingId, { text: reply, pending: false });
  const box = document.getElementById('ai-messages');
  if (box) box.scrollTop = box.scrollHeight;
  void s;
}

export async function handleAiAction(action, el) {
  if (action === 'ai-prompt') { await askAi(el.dataset.text); return true; }
  if (action === 'ai-model') { act.setAiModel(el.dataset.model); toast(`${el.dataset.model} selected`, 'success'); return true; }
  if (action === 'ai-copy') {
    const m = getState().ai.messages.find((x) => x.id === el.dataset.id);
    if (m) navigator.clipboard?.writeText(m.text).then(() => toast('Answer copied','success')).catch(() => {});
    return true;
  }
  if (action === 'ai-clear') {
    const ok = await confirmDialog({ title:'Clear conversation?', message:'This removes your local MeshLink AI chat history.', confirmLabel:'Clear' });
    if (ok) { act.clearAiMessages(); toast('AI conversation cleared','success'); }
    return true;
  }
  return false;
}
