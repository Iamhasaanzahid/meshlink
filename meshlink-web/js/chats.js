/* Chat UI: sidebar, conversation, composer, message actions. */
import {
  act, chatById, chatTitle, chatAvatarUser, peerOf, messagesFor, sortedChats,
  unreadTotal, isBlocked, typingFor, userOf, getState,
} from './store.js';
import { icon, avatar, openModal, confirmDialog, toast, openMenu, closeMenu, openLightbox } from './ui.js';
import {
  esc, fmtListTime, fmtTime, fmtDayDivider, fmtDuration, fmtSize, previewOf,
  lastSeenText, imageAsDataURL, readAsDataURL, safeUrl, linkify,
} from './utils.js';
import { netState } from './transport/connectivity.js';

const drafts = new Map();
let savedScroll = 0;
let savedChat = null;
let stickBottom = true;
let recSession = null;
const voiceTimers = new Map();

export function captureScroll() {
  const el = document.getElementById('chat-body');
  if (!el) return;
  savedChat = el.dataset.chatId;
  savedScroll = el.scrollTop;
  stickBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
}
export function restoreScroll() {
  const el = document.getElementById('chat-body');
  if (!el) return;
  if (el.dataset.chatId !== savedChat) stickBottom = true;
  el.scrollTop = stickBottom ? el.scrollHeight : savedScroll;
  el.addEventListener('scroll', () => {
    savedScroll = el.scrollTop; savedChat = el.dataset.chatId;
    stickBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, { passive: true });
}
export function forceBottom() { stickBottom = true; }

export function deliveryIcon(status) {
  if (status === 'queued') return `<span class="ticks queued" title="Queued offline">${icon('clock','xs')}</span>`;
  if (status === 'mesh') return `<span class="ticks mesh" title="Relayed via mesh">${icon('wifi','xs')}</span>`;
  if (status === 'sent') return `<span class="ticks" title="Sent">${icon('check','xs')}</span>`;
  if (status === 'delivered') return `<span class="ticks" title="Delivered">${icon('checkCheck','xs')}</span>`;
  if (status === 'read') return `<span class="ticks read" title="Read">${icon('checkCheck','xs')}</span>`;
  return '';
}
export function statusLabel(m) {
  return { queued: m.expired ? 'Expired (TTL)' : 'Queued offline', mesh: 'Relayed via Mesh', sent: 'Sent', delivered: 'Delivered', read: 'Read' }[m.status] || 'Sent';
}

function netPill() {
  const n = netState();
  return `<div class="side-search" style="padding-top:0;padding-bottom:8px"><div class="net-pill ${n.tone}" data-action="nav" data-view="settings"><span class="np-dot"></span><span class="np-text">${esc(n.label)}</span>${icon('chevronRight','xs')}</div></div>`;
}

export function renderSidebar(state) {
  const filter = state.ui.filter || 'all';
  const q = (state.ui.search || '').trim().toLowerCase();
  let chats = sortedChats();
  if (filter === 'unread') chats = chats.filter((c) => c.unread > 0);
  if (filter === 'groups') chats = chats.filter((c) => c.type === 'group');
  if (filter === 'muted') chats = chats.filter((c) => c.muted);
  if (q) chats = chats.filter((c) => chatTitle(c).toLowerCase().includes(q) || state.messages.some((m) => m.chatId === c.id && (m.text || '').toLowerCase().includes(q)));
  const unread = unreadTotal();
  return `
  <aside class="sidebar">
    <div class="side-head">
      <div class="side-title"><small>Mhzaly</small>Chats</div>
      <div class="side-actions">
        <button class="icon-btn" data-action="new-chat" title="New chat">${icon('plus')}</button>
        <button class="icon-btn" data-action="new-group" title="New group">${icon('users')}</button>
        <button class="icon-btn" data-action="nav" data-view="settings" title="Settings">${icon('moreV')}</button>
      </div>
    </div>
    ${netPill()}
    <div class="side-search"><div class="input-wrap">${icon('search')}<input id="chat-search" class="input" placeholder="Search chats or messages" value="${esc(state.ui.search || '')}" autocomplete="off"></div></div>
    <div class="filters">
      <button class="chip ${filter==='all'?'active':''}" data-action="filter" data-filter="all">All</button>
      <button class="chip ${filter==='unread'?'active':''}" data-action="filter" data-filter="unread">Unread${unread?`<span class="count">${unread}</span>`:''}</button>
      <button class="chip ${filter==='groups'?'active':''}" data-action="filter" data-filter="groups">Groups</button>
      <button class="chip ${filter==='muted'?'active':''}" data-action="filter" data-filter="muted">Muted</button>
    </div>
    <div class="chat-list">${chats.map((c) => chatRow(state, c)).join('') || `<div class="empty-list">${icon('search')}<div>${q?'No chats match your search.':'No conversations yet.'}</div></div>`}</div>
    <div class="side-foot"><span class="dot"></span> Encrypted on device · mesh-ready</div>
  </aside>`;
}

function chatRow(state, chat) {
  const last = messagesFor(chat.id).slice(-1)[0];
  const active = state.ui.activeChatId === chat.id;
  const online = chat.type === 'dm' ? !!peerOf(chat)?.online : null;
  const typing = typingFor(chat.id);
  return `
  <div class="chat-row ${active?'active':''} ${chat.unread?'unread':''}" data-action="open-chat" data-id="${chat.id}" tabindex="0">
    ${avatar(chatAvatarUser(chat), { online })}
    <div class="body">
      <div class="top"><span class="name">${esc(chatTitle(chat))}</span><span class="time">${fmtListTime(chat.lastAt)}</span></div>
      <div class="preview">
        ${typing?`<span class="txt" style="color:var(--accent-3)">${esc(typing.name)} is typing…</span>`:`<span class="txt">${esc(chat.lastMessage||'Say hello 👋')}</span>`}
        <span class="row-meta-ic">${chat.pinned?icon('pin'):''}${chat.muted?icon('bellOff'):''}${last&&last.senderId==='u_me'?deliveryIcon(last.status):''}</span>
        ${chat.unread?`<span class="row-badge">${chat.unread>99?'99+':chat.unread}</span>`:''}
      </div>
    </div>
  </div>`;
}

export function renderChatMain(state) {
  const chat = chatById(state.ui.activeChatId);
  if (!chat) return emptyChat();
  const peer = peerOf(chat);
  const typing = typingFor(chat.id);
  const q = (state.ui.chatSearch || '').trim();
  const all = messagesFor(chat.id);
  const list = q ? all.filter((m) => `${m.text||''} ${m.media?.name||''}`.toLowerCase().includes(q.toLowerCase())) : all;
  let statusLine;
  if (typing) statusLine = `<span class="typing">${esc(typing.name)} is typing…</span>`;
  else if (chat.type === 'group') statusLine = `${chat.memberIds.length} members · ${chat.memberIds.filter((id)=>userOf(id).online).length} online`;
  else if (!state.settings.lastSeenVisible) statusLine = 'last seen hidden';
  else statusLine = peer?.online ? '<span class="online">online</span>' : esc(lastSeenText(peer));

  let body = '<div class="day-divider"><span>🔒 Messages are encrypted on this device</span></div>';
  if (q) body += `<div class="day-divider"><span>${list.length} result${list.length===1?'':'s'} for “${esc(q)}”</span></div>`;
  let prevDay = '', prevSender = '', prevAt = 0;
  list.forEach((m) => {
    const day = new Date(m.createdAt).toDateString();
    if (day !== prevDay) { body += `<div class="day-divider"><span>${fmtDayDivider(m.createdAt)}</span></div>`; prevDay = day; prevSender = ''; }
    const grouped = prevSender === m.senderId && m.createdAt - prevAt < 180000;
    body += messageHTML(state, chat, m, grouped, q, all);
    prevSender = m.senderId; prevAt = m.createdAt;
  });
  if (!list.length) body += `<div class="empty-list" style="padding-top:50px">${icon('message')}<div>${q?'No messages found.':'No messages yet — say hello 👋'}</div></div>`;
  if (typing && !q) body += `<div class="typing-row"><div class="typing-bubble">${avatar({name:typing.name},{size:'xs'})}<span class="typing-dots"><i></i><i></i><i></i></span></div></div>`;

  return `<section class="chat">
    <header class="chat-head">
      <button class="icon-btn mobile-back" data-action="close-chat">${icon('back')}</button>
      ${avatar(chatAvatarUser(chat), { online: chat.type==='dm' ? !!peer?.online : null })}
      <div class="who" data-action="chat-info" data-id="${chat.id}">
        <div class="nm">${esc(chatTitle(chat))}${chat.type==='group'?'<span class="tag purple" style="margin-left:2px">Group</span>':''}</div>
        <div class="st">${statusLine}</div>
      </div>
      <div class="chat-actions">
        <span class="enc-chip hide-mobile">${icon('lock')} encrypted</span>
        <button class="icon-btn hide-mobile" data-action="chat-search" title="Search">${icon('search')}</button>
        <button class="icon-btn" data-action="call" data-id="${chat.id}" data-type="voice" title="Voice call">${icon('phone')}</button>
        <button class="icon-btn" data-action="call" data-id="${chat.id}" data-type="video" title="Video call">${icon('video')}</button>
        <button class="icon-btn" data-action="chat-menu" data-id="${chat.id}" title="More">${icon('moreV')}</button>
      </div>
    </header>
    ${state.ui.chatSearchOpen?`<div class="side-search" style="padding:8px 14px;border-bottom:1px solid var(--line)"><div class="input-wrap">${icon('search')}<input id="msg-search" class="input" placeholder="Search in conversation" value="${esc(state.ui.chatSearch||'')}"><button class="icon-btn sm" data-action="chat-search-close" style="position:absolute;right:4px">${icon('x')}</button></div></div>`:''}
    <div class="chat-body" id="chat-body" data-chat-id="${chat.id}" data-wallpaper="${esc(state.settings.wallpaper)}">
      <div class="chat-scroll-inner">${body}</div>
    </div>
    ${composerHTML(state, chat)}
    <input type="file" id="file-image" accept="image/*" hidden>
    <input type="file" id="file-camera" accept="image/*" capture="environment" hidden>
    <input type="file" id="file-video" accept="video/*" hidden>
    <input type="file" id="file-doc" hidden>
  </section>`;
}

function emptyChat() {
  return `<div class="chat-empty"><div class="glow"></div><div class="chat-empty-art">${icon('message')}</div><h2>Messages that move with you</h2><p>Pick a conversation to start chatting. If the internet drops, Mhzaly switches to the nearby mesh and keeps messages moving.</p><div class="tiny">${icon('shield')} Offline queue · 3-tier calling · mesh relay</div></div>`;
}

function messageHTML(state, chat, m, grouped, q, all) {
  const out = m.senderId === 'u_me';
  const showName = chat.type === 'group' && !out && !grouped;
  let content = '';
  if (m.deletedForEveryone) content = `<div class="deleted-text">${icon('trash')} This message was deleted</div>`;
  else {
    if (m.replyTo) {
      const src = all.find((x) => x.id === m.replyTo);
      content += `<div class="reply-quote" data-action="jump" data-id="${m.replyTo}"><span class="rq-name">${esc(src?userOf(src.senderId).name:'Message')}</span><span class="rq-text">${esc(src?(src.text||previewOf(src)):'Original message')}</span></div>`;
    }
    if (m.forwarded) content += `<div class="forwarded-label">${icon('forward')} Forwarded</div>`;
    content += mediaHTML(m, q && m.text ? highlight(m.text, q) : linkify(m.text || ''));
  }
  const reactions = Object.entries(m.reactions || {}).filter(([, ids]) => ids.length);
  const reacts = reactions.length ? `<div class="reactions">${reactions.map(([e, ids]) => `<button class="reaction-chip ${ids.includes('u_me')?'mine':''}" data-action="react" data-id="${m.id}" data-emoji="${esc(e)}">${esc(e)}${ids.length>1?`<span class="cnt">${ids.length}</span>`:''}</button>`).join('')}</div>` : '';
  return `<div class="msg-row ${out?'out':'in'} ${grouped?'grouped':''} ${m.kind==='sticker'?'sticker':''} ${state.ui.highlightId===m.id?'highlight':''}" id="msg-${m.id}">
    <div class="bubble-wrap">
      ${showName?`<div class="sender-name">${esc(userOf(m.senderId).name)}${chat.adminIds?.includes(m.senderId)?'<span>admin</span>':''}</div>`:''}
      <div class="bubble">${content}${m.deletedForEveryone?'':`<div class="msg-meta">${m.editedAt?'<span class="edited">edited</span>':''}<span>${fmtTime(m.createdAt)}</span>${out?deliveryIcon(m.status):''}</div>`}<button class="msg-actions-btn" data-action="message-menu" data-id="${m.id}">${icon('chevronDown')}</button></div>
      ${reacts}
    </div>
  </div>`;
}

function mediaHTML(m, text) {
  const md = m.media || {};
  if (m.kind === 'image') return `<div class="msg-image" data-action="open-media" data-id="${m.id}"><img src="${esc(safeUrl(md.src))}" alt="" loading="lazy">${text?`<div class="img-cap">${text}</div>`:''}</div>`;
  if (m.kind === 'video') return `<div class="msg-video"><video src="${esc(safeUrl(md.src))}" controls preload="metadata"></video></div>${text?`<div class="msg-text" style="margin-top:6px">${text}</div>`:''}`;
  if (m.kind === 'doc') return `<div class="file-card" data-action="download-doc" data-id="${m.id}"><div class="file-ic">${icon('file')}</div><div class="file-info"><div class="fn">${esc(md.name||'Document')}</div><div class="fs">${fmtSize(md.size||0)}</div></div>${icon('download','sm')}</div>${text?`<div class="msg-text" style="margin-top:6px">${text}</div>`:''}`;
  if (m.kind === 'voice') {
    const bars = (md.waveform||Array.from({length:26},()=>6+Math.random()*18)).map((h)=>`<span class="bar" style="height:${Math.max(4,Math.min(26,h))}px"></span>`).join('');
    return `<div class="voice-player" data-voice="${m.id}"><button class="voice-play" data-action="play-voice" data-id="${m.id}">${icon('play')}</button><div class="voice-wave">${bars}</div><span class="voice-time">${fmtDuration(md.duration||0)}</span></div>`;
  }
  if (m.kind === 'sticker') return `<div class="sticker-msg">${esc(m.text||'✨')}</div>`;
  if (m.kind === 'gif') return `<div class="msg-image"><div style="height:170px;min-width:230px;border-radius:11px;display:grid;place-items:center;font-weight:800;letter-spacing:.14em;font-size:11px;background:${esc(md.gradient||'linear-gradient(135deg,#6d28d9,#ec4899)')};color:#fff">${esc(m.text||'GIF')}</div></div>`;
  let out = text ? `<div class="msg-text">${text}</div>` : '';
  if (m.link) out += `<a class="link-card" href="${esc(m.link.url)}" target="_blank" rel="noopener"><div class="lc-top"></div><div class="lc-body"><div class="lc-domain">${esc(m.link.domain)}</div><div class="lc-title">${esc(m.link.title)}</div><div class="lc-desc">${esc(m.link.desc)}</div></div></a>`;
  return out;
}

function highlight(text, q) {
  const safe = esc(text);
  try { return safe.replace(new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),(h)=>`<mark style="background:var(--accent);color:#fff;border-radius:3px">${h}</mark>`); }
  catch { return safe; }
}
function composerHTML(state, chat) {
  if (chat.type === 'dm' && isBlocked(chat.peerId)) return `<div class="composer-wrap"><div class="composer"><div class="auth-note" style="justify-content:center">${icon('shield')} You blocked this contact. <button class="btn sm" data-action="unblock" data-id="${chat.peerId}">Unblock</button></div></div></div>`;
  const reply = state.ui.replyTo ? messagesFor(chat.id).find((m) => m.id === state.ui.replyTo) : null;
  const editing = state.ui.editingId ? messagesFor(chat.id).find((m) => m.id === state.ui.editingId) : null;
  const typing = typingFor(chat.id);
  return `<div class="composer-wrap"><div class="composer">
    ${typing?`<div class="typing-bar">${icon('message')}<span><b>${esc(typing.name)}</b> is typing…</span></div>`:''}
    ${reply?`<div class="reply-bar"><div class="rb-body"><div class="rb-label">Replying to ${esc(userOf(reply.senderId).name)}</div><div class="rb-text">${esc(reply.text||previewOf(reply))}</div></div><button class="icon-btn sm" data-action="compose-cancel">${icon('x')}</button></div>`:''}
    ${editing?`<div class="reply-bar"><div class="rb-body"><div class="rb-label">Editing message</div><div class="rb-text">${esc(editing.text||'')}</div></div><button class="icon-btn sm" data-action="compose-cancel">${icon('x')}</button></div>`:''}
    <div id="rec-slot"></div>
    <div class="composer-bar">
      <button class="icon-btn" data-action="compose-emoji" title="Emoji">${icon('smile')}</button>
      <button class="icon-btn" data-action="compose-attach" title="Attach">${icon('paperclip')}</button>
      <textarea id="composer-input" class="composer-input" rows="1" placeholder="Message" autocomplete="off"></textarea>
      <button class="send-btn mic" id="composer-main-btn" data-action="compose-main" title="Record voice note">${icon('mic')}</button>
    </div>
    <div class="composer-hint">Enter to send · Shift + Enter for a new line · voice notes fall back to mesh offline</div>
  </div></div>`;
}

export function mountChat(state) {
  restoreScroll();
  const chat = chatById(state.ui.activeChatId);
  if (!chat) return;
  const ta = document.getElementById('composer-input');
  if (ta) {
    ta.value = drafts.get(chat.id) ?? '';
    resizeTa(ta);
    syncBtn(ta.value);
  }
  const body = document.getElementById('chat-body');
  if (!body) return;
  body.addEventListener('pointerdown', (e) => {
    const bubble = e.target.closest('.bubble');
    if (!bubble || e.target.closest('button, a, video')) return;
    const row = bubble.closest('.msg-row');
    if (!row) return;
    clearTimeout(body._lp);
    body._lp = setTimeout(() => openMessageMenu(row.id.replace('msg-',''), e.clientX, e.clientY), 520);
    const cancel = () => { clearTimeout(body._lp); window.removeEventListener('pointerup', cancel); window.removeEventListener('pointermove', cancel); };
    window.addEventListener('pointerup', cancel); window.addEventListener('pointermove', cancel);
  });
  body.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.msg-row');
    if (!row || e.target.closest('a, video')) return;
    e.preventDefault(); openMessageMenu(row.id.replace('msg-',''), e.clientX, e.clientY);
  });
  body.addEventListener('dblclick', (e) => {
    const row = e.target.closest('.msg-row');
    if (row) act.toggleReaction(row.id.replace('msg-',''), '❤️');
  });
  body.addEventListener('dragover', (e) => { e.preventDefault(); body.classList.add('drag-over'); });
  body.addEventListener('dragleave', () => body.classList.remove('drag-over'));
  body.addEventListener('drop', (e) => { e.preventDefault(); body.classList.remove('drag-over'); if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files); });
}

function resizeTa(ta) { ta.style.height = 'auto'; ta.style.height = `${Math.min(148, ta.scrollHeight)}px`; }
function syncBtn(v) {
  const b = document.getElementById('composer-main-btn');
  if (!b) return;
  const has = String(v||'').trim().length > 0;
  b.classList.toggle('mic', !has);
  b.innerHTML = has ? icon('send') : icon('mic');
  b.title = has ? 'Send' : 'Record voice note';
}
export function onComposerInput(v) {
  const c = chatById(getState().ui.activeChatId);
  if (c) drafts.set(c.id, v);
  const ta = document.getElementById('composer-input');
  if (ta) resizeTa(ta);
  syncBtn(v);
}
export function sendCurrent() {
  const s = getState(), c = chatById(s.ui.activeChatId), ta = document.getElementById('composer-input');
  if (!c || !ta) return;
  const v = ta.value.trim();
  if (!v) return;
  if (s.ui.editingId) act.editMessage(s.ui.editingId, v);
  else act.sendMessage({ chatId: c.id, text: v, replyTo: s.ui.replyTo });
  drafts.delete(c.id); ta.value = ''; syncBtn(''); stickBottom = true;
}

export function openMessageMenu(id, x, y) {
  const m = getState().messages.find((x) => x.id === id);
  if (!m || m.deletedForEveryone) return;
  const mine = m.senderId === 'u_me';
  const starred = (m.starredBy||[]).includes('u_me');
  const menu = openMenu({ x, y, html: `
    <div class="quick-reactions">${['❤️','😂','👍','🔥','😮','🙏'].map((e)=>`<button data-react="${e}">${e}</button>`).join('')}</div>
    <button class="menu-item" data-act="reply">${icon('reply')} Reply</button>
    <button class="menu-item" data-act="copy">${icon('copy')} Copy text</button>
    <button class="menu-item" data-act="star">${icon('star')} ${starred?'Remove star':'Star message'}</button>
    <button class="menu-item" data-act="forward">${icon('forward')} Forward</button>
    ${mine?`<button class="menu-item" data-act="edit">${icon('edit')} Edit</button>`:''}
    <div class="menu-sep"></div>
    <button class="menu-item danger" data-act="delete">${icon('trash')} Delete for me</button>
    ${mine?`<button class="menu-item danger" data-act="delete-all">${icon('trash')} Delete for everyone</button>`:''}
    <button class="menu-item" data-act="info">${icon('info')} Message info</button>` });
  menu.addEventListener('click', async (e) => {
    const r = e.target.closest('[data-react]');
    if (r) { act.toggleReaction(id, r.dataset.react); closeMenu(); return; }
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const a = el.dataset.act; closeMenu();
    if (a === 'reply') { act.setReply(id); focusComposer(); }
    if (a === 'copy') { try { await navigator.clipboard.writeText(m.text||''); toast('Copied', 'success'); } catch { toast('Copy failed', 'error'); } }
    if (a === 'star') { act.starMessage(id); toast(starred?'Removed from starred':'Message starred','success'); }
    if (a === 'forward') openForwardDialog(id);
    if (a === 'edit') { const c = chatById(m.chatId); if (c) drafts.set(c.id, m.text||''); act.setEditing(id); focusComposer(); }
    if (a === 'delete') act.deleteMessage(id, false);
    if (a === 'delete-all' && await confirmDialog({ title:'Delete for everyone?', message:'This removes it for all participants in this demo.', confirmLabel:'Delete' })) act.deleteMessage(id, true);
    if (a === 'info') messageInfo(m);
  });
}

function messageInfo(m) {
  const c = chatById(m.chatId);
  openModal({ title: 'Message info', subtitle: c ? chatTitle(c) : '', body: `<div class="stack" style="gap:10px">
    <div class="set-row" style="padding:0"><div class="si-ic">${icon('send')}</div><div class="si-body"><div class="si-title">Delivery</div><div class="si-sub">${esc(statusLabel(m))}${m.transport?` · ${esc(m.transport)}`:''}</div></div></div>
    <div class="set-row" style="padding:0"><div class="si-ic">${icon('clock')}</div><div class="si-body"><div class="si-title">Created</div><div class="si-sub">${esc(new Date(m.createdAt).toLocaleString())}</div></div></div>
    ${m.status==='queued'?`<div class="auth-note">${icon('wifi')} In the offline outbox with a 24h TTL. It syncs automatically as soon as internet returns.</div>`:''}
  </div>` });
}
function focusComposer() { setTimeout(() => { const t = document.getElementById('composer-input'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, 60); }

export function openForwardDialog(id) {
  const chats = sortedChats();
  const { close } = openModal({ title: 'Forward message', subtitle: 'Pick one or more conversations', body: `<div style="max-height:340px;overflow:auto">${chats.map((c)=>`<label class="set-row" style="cursor:pointer;padding:8px 0"><input type="checkbox" value="${c.id}" style="accent-color:var(--accent);width:16px;height:16px">${avatar(chatAvatarUser(c),{size:'sm'})}<div class="si-body"><div class="si-title">${esc(chatTitle(c))}</div><div class="si-sub">${esc(c.lastMessage||'')}</div></div></label>`).join('')}</div>`, footer: `<button class="btn sm" data-close>Cancel</button><button class="btn sm primary" id="do-forward">Forward</button>`, onMount: (el) => { el.querySelector('#do-forward').onclick = () => { const ids = Array.from(el.querySelectorAll('input:checked')).map((i)=>i.value); if (!ids.length) return toast('Pick at least one chat','error'); act.forwardMessage(id, ids); close(); toast(`Forwarded to ${ids.length} chat${ids.length>1?'s':''}`,'success'); }; } });
}

export function openChatMenu(chatId, x, y) {
  const chat = chatById(chatId);
  if (!chat) return;
  const blocked = chat.type==='dm' && isBlocked(chat.peerId);
  const menu = openMenu({ x, y, html: `
    <button class="menu-item" data-act="info">${icon(chat.type==='group'?'users':'user')} ${chat.type==='group'?'Group info':'Contact info'}</button>
    <button class="menu-item" data-act="search">${icon('search')} Search conversation</button>
    <button class="menu-item" data-act="pin">${icon('pin')} ${chat.pinned?'Unpin':'Pin chat'}</button>
    <button class="menu-item" data-act="mute">${icon(chat.muted?'bell':'bellOff')} ${chat.muted?'Unmute':'Mute'}</button>
    <button class="menu-item" data-act="archive">${icon('archive')} ${chat.archived?'Unarchive':'Archive chat'}</button>
    ${chat.type==='dm'?`<button class="menu-item danger" data-act="block">${icon('shield')} ${blocked?'Unblock':'Block contact'}</button>`:''}
    <div class="menu-sep"></div><button class="menu-item danger" data-act="clear">${icon('trash')} Clear chat</button>` });
  menu.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const a = el.dataset.act; closeMenu();
    if (a==='info') openChatInfo(chatId);
    if (a==='search') act.setChatSearchOpen(true);
    if (a==='pin') act.togglePin(chatId);
    if (a==='mute') act.toggleMute(chatId);
    if (a==='archive') toast(act.toggleArchive(chatId)?'Chat archived':'Chat unarchived','success');
    if (a==='block') { if (blocked) { act.unblockPeer(chat.peerId); toast('Contact unblocked','success'); } else if (await confirmDialog({title:'Block contact?',message:'You will no longer receive messages from this contact.',confirmLabel:'Block'})) { act.blockPeer(chat.peerId); toast('Contact blocked','success'); } }
    if (a==='clear' && await confirmDialog({title:'Clear this chat?',message:'All messages will be removed from this device.',confirmLabel:'Clear chat'})) act.clearChat(chatId);
  });
}

export function openChatInfo(chatId) {
  const chat = chatById(chatId);
  if (!chat) return;
  chat.type === 'group' ? openGroupInfo(chatId) : openContactInfo(chatId);
}

function openContactInfo(chatId) {
  const chat = chatById(chatId), peer = peerOf(chat);
  if (!peer) return;
  const blocked = isBlocked(peer.id);
  const media = getState().messages.filter((m)=>m.chatId===chatId && ['image','video','doc'].includes(m.kind)).length;
  openModal({ title:'Contact info', body:`<div class="stack" style="align-items:center;text-align:center;gap:8px;padding-bottom:14px">${avatar(peer,{size:'xxl',online:!!peer.online})}<div style="font-size:20px;font-weight:750;margin-top:8px">${esc(peer.name)}</div><div class="muted small">${esc(peer.about||'')}</div><div class="tag mint">${peer.online?'online':esc(lastSeenText(peer))}</div></div>
    <div class="set-row" style="padding:9px 0"><div class="si-ic">${icon('phone')}</div><div class="si-body"><div class="si-title">${esc(peer.phone||'—')}</div><div class="si-sub">phone</div></div></div>
    <div class="set-row" style="padding:9px 0"><div class="si-ic">${icon('image')}</div><div class="si-body"><div class="si-title">${media} media files</div><div class="si-sub">shared in this chat</div></div></div>
    <div class="row" style="gap:8px;margin-top:12px"><button class="btn grow" data-call="voice">${icon('phone')} Voice</button><button class="btn grow" data-call="video">${icon('video')} Video</button></div>`,
    footer:`<button class="btn sm ${blocked?'':'danger'}" data-block>${blocked?'Unblock':'Block contact'}</button><button class="btn sm" data-close>Close</button>`,
    onMount:(el,close)=>{ el.querySelectorAll('[data-call]').forEach((b)=>{ b.onclick=()=>{ close(); window.dispatchEvent(new CustomEvent('meshlink:start-call',{detail:{peerId:peer.id,type:b.dataset.call}})); }; }); el.querySelector('[data-block]').onclick=()=>{ blocked?act.unblockPeer(peer.id):act.blockPeer(peer.id); close(); toast(blocked?'Contact unblocked':'Contact blocked','success'); }; } });
}
function groupBody(chat) {
  const rows = chat.memberIds.map((id)=>({u:userOf(id),admin:(chat.adminIds||[]).includes(id)}));
  const avail = getState().contacts.filter((c)=>!chat.memberIds.includes(c.id));
  return `<div class="stack" style="align-items:center;text-align:center;gap:6px;padding-bottom:12px">${avatar({name:chat.name,emoji:chat.emoji||'👥',avatar:chat.avatar},{size:'xxl'})}<input id="group-name" class="input" style="text-align:center;font-weight:700;font-size:17px;background:transparent;border-color:transparent;max-width:280px" value="${esc(chat.name)}"><div class="muted small">${esc(chat.about||'')}</div><div class="tag purple">${chat.memberIds.length} members</div></div>
    <div class="page-section" style="margin-bottom:12px"><h3 style="margin-bottom:6px">Members</h3>${rows.map(({u,admin})=>`<div class="set-row" style="padding:6px 0">${avatar(u,{size:'sm',online:!!u.online})}<div class="si-body"><div class="si-title">${esc(u.name)}${u.id==='u_me'?' (you)':''}</div><div class="si-sub">${admin?'Admin':esc(u.about||'')}</div></div>${u.id!=='u_me'?`<button class="icon-btn sm" data-admin="${u.id}" title="Toggle admin">${icon('key','sm')}</button><button class="icon-btn sm" data-remove="${u.id}" title="Remove">${icon('x','sm')}</button>`:''}</div>`).join('')}</div>
    ${avail.length?`<div class="row" style="gap:8px"><select class="select" id="group-add-select" style="flex:1">${avail.map((c)=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><button class="btn sm" id="group-add">${icon('plus','sm')} Add</button></div>`:''}
    <div class="row" style="gap:8px;margin-top:12px"><button class="btn sm grow" data-gact="mute">${icon(chat.muted?'bell':'bellOff','sm')} ${chat.muted?'Unmute':'Mute'}</button><button class="btn sm grow" data-gact="archive">${icon('archive','sm')} Archive</button><button class="btn sm grow danger" data-gact="leave">${icon('logout','sm')} Leave</button></div>`;
}

export function openGroupInfo(chatId) {
  openModal({ title:'Group info', subtitle:'Members, admins and group icon', wide:true, body:`<div id="group-info-body">${groupBody(chatById(chatId))}</div>`, footer:`<button class="btn sm" data-close>Close</button><button class="btn sm primary" id="group-save">${icon('check','sm')} Save name</button>`, onMount:(el,close)=>{
    const bind = () => { const c = chatById(chatId); if (!c) return close(); const body = el.querySelector('#group-info-body'); body.innerHTML = groupBody(c);
      body.querySelectorAll('[data-remove]').forEach((b)=>{ b.onclick=()=>{ act.removeGroupMember(chatId,b.dataset.remove); bind(); }; });
      body.querySelectorAll('[data-admin]').forEach((b)=>{ b.onclick=()=>{ act.toggleGroupAdmin(chatId,b.dataset.admin); bind(); }; });
      const add = body.querySelector('#group-add'); if (add) add.onclick=()=>{ act.addGroupMember(chatId, body.querySelector('#group-add-select').value); bind(); };
      body.querySelectorAll('[data-gact]').forEach((b)=>{ b.onclick=async()=>{ const a=b.dataset.gact; if (a==='mute') act.toggleMute(chatId); if (a==='archive') act.toggleArchive(chatId); if (a==='leave' && await confirmDialog({title:'Leave group?',message:'You will stop receiving messages from this group.',confirmLabel:'Leave'})) { act.deleteConversation(chatId); close(); } bind(); }; });
    };
    bind();
    el.querySelector('#group-save').onclick=()=>{ const n=el.querySelector('#group-name')?.value.trim(); if (n) act.updateGroup(chatId,{name:n}); toast('Group updated','success'); close(); };
  } });
}

export function openNewChat() {
  openModal({ title:'New conversation', subtitle:'Pick a contact', body:`<div style="padding-bottom:10px"><input class="input" id="nc-search" placeholder="Search contacts" autocomplete="off"></div><div id="nc-list" style="max-height:360px;overflow:auto">${getState().contacts.map((c)=>`<button class="chat-row" style="width:100%;text-align:left" data-contact="${c.id}">${avatar(c,{online:!!c.online})}<div class="body"><div class="top"><span class="name">${esc(c.name)}</span></div><div class="preview"><span class="txt">${esc(c.about||c.phone||'')}</span></div></div></button>`).join('')}</div>`, footer:`<button class="btn sm" data-close>Cancel</button>`, onMount:(el,close)=>{
    const s = el.querySelector('#nc-search'); s.oninput=()=>{ const q=s.value.toLowerCase(); el.querySelectorAll('[data-contact]').forEach((r)=>{ r.style.display = r.textContent.toLowerCase().includes(q)?'':'none'; }); };
    el.querySelectorAll('[data-contact]').forEach((r)=>{ r.onclick=()=>{ close(); act.startDm(r.dataset.contact); }; }); setTimeout(()=>s.focus(),80);
  } });
}

export function openNewGroup() {
  openModal({ title:'New group', subtitle:'Name, icon and members', wide:true, body:`<div class="field" style="margin-bottom:12px"><label>Group name</label><input class="input" id="ng-name" placeholder="e.g. Weekend Hikers"></div>
    <div class="field" style="margin-bottom:12px"><label>Group icon</label><div class="row" style="flex-wrap:wrap;gap:6px">${['🚀','🏔️','💜','🎧','📸','🍜','⚡','🌙','🎯','☕','🌊','✨'].map((e,i)=>`<button class="btn sm ${i===0?'primary':''}" data-emoji="${e}" style="font-size:18px;width:42px">${e}</button>`).join('')}</div></div>
    <div class="field"><label>Members</label><div style="max-height:240px;overflow:auto">${getState().contacts.map((c)=>`<label class="set-row" style="cursor:pointer;padding:7px 0"><input type="checkbox" value="${c.id}" style="accent-color:var(--accent);width:16px;height:16px">${avatar(c,{size:'sm'})}<div class="si-body"><div class="si-title">${esc(c.name)}</div><div class="si-sub">${esc(c.about||'')}</div></div></label>`).join('')}</div></div>`, footer:`<button class="btn sm" data-close>Cancel</button><button class="btn sm primary" id="ng-create">Create group</button>`, onMount:(el,close)=>{
      let emoji='🚀'; el.querySelectorAll('[data-emoji]').forEach((b)=>{ b.onclick=()=>{ emoji=b.dataset.emoji; el.querySelectorAll('[data-emoji]').forEach((x)=>x.classList.remove('primary')); b.classList.add('primary'); }; });
      el.querySelector('#ng-create').onclick=()=>{ const name=el.querySelector('#ng-name').value.trim(); if (!name) return toast('Group name is required','error'); const ids=Array.from(el.querySelectorAll('input:checked')).map((i)=>i.value); const chat=act.createGroup({name,memberIds:ids,emoji}); close(); if (chat) toast('Group created','success'); };
  } });
}

const EMOJIS = ['😀','😄','😂','🤣','😊','😍','🥰','😎','🥳','😭','😡','🤔','🤫','🙄','😴','👍','👎','👏','🙌','🙏','💪','✌️','🤝','❤️','🧡','💛','💚','💙','💜','🔥','✨','⭐','💯','🎉','🎊','🌿','🌸','🌙','☀️','🌈','🍕','🍔','☕','🍰','⚽','🎮','🎧','🚀','💡','📷'];
const STICKERS = ['💜','🚀','✨','🔥','🥳','😎','🌈','🍕','🏔️','🎧','👑','🐱'];
const GIFS = [['PURPLE WAVE','linear-gradient(135deg,#6d28d9,#c026d3)'],['MESH MODE','linear-gradient(135deg,#0f766e,#7c3aed)'],['SHIP IT','linear-gradient(135deg,#f59e0b,#db2777)'],['GOOD VIBES','linear-gradient(135deg,#10b981,#0ea5e9)'],['YES!','linear-gradient(135deg,#ef4444,#f97316)'],['LATE NIGHT','linear-gradient(135deg,#1e1b4b,#4338ca)']];

export function toggleEmojiPicker(anchor) {
  const c = anchor.closest('.composer'); if (!c) return;
  if (c.querySelector('.emoji-pop')) { c.querySelector('.emoji-pop').remove(); return; }
  c.querySelector('.composer-attach')?.remove();
  const pop = document.createElement('div'); pop.className='emoji-pop';
  pop.innerHTML = `<div class="emoji-head"><button class="emoji-tab active" data-tab="emoji">😀</button><button class="emoji-tab" data-tab="sticker">🏷️</button><button class="emoji-tab" data-tab="gif">GIF</button></div><div class="emoji-body"></div><div class="emoji-foot"><input class="input" id="emoji-search" placeholder="Search emoji"><button class="btn sm" data-close-pop>Close</button></div>`;
  c.appendChild(pop);
  const body = pop.querySelector('.emoji-body');
  const draw = (tab) => {
    if (tab==='sticker') body.innerHTML = `<div class="sticker-grid">${STICKERS.map((s)=>`<button data-sticker="${s}">${s}</button>`).join('')}</div>`;
    else if (tab==='gif') body.innerHTML = `<div class="gif-grid">${GIFS.map(([l,g])=>`<button class="gif-card" data-gif="${l}" data-g="${g}" style="background:${g}"><span>${l}</span></button>`).join('')}</div>`;
    else body.innerHTML = `<div class="emoji-grid">${EMOJIS.map((e)=>`<button data-emoji="${e}">${e}</button>`).join('')}</div>`;
  };
  draw('emoji');
  pop.querySelectorAll('[data-tab]').forEach((b)=>{ b.onclick=()=>{ pop.querySelectorAll('[data-tab]').forEach((x)=>x.classList.remove('active')); b.classList.add('active'); draw(b.dataset.tab); }; });
  pop.addEventListener('click',(e)=>{
    const em=e.target.closest('[data-emoji]'); if (em) return insertAtCursor(em.dataset.emoji);
    const st=e.target.closest('[data-sticker]'); if (st) { sendQuick('sticker',st.dataset.sticker); pop.remove(); return; }
    const gif=e.target.closest('[data-gif]'); if (gif) { sendQuick('gif',gif.dataset.gif,{gradient:gif.dataset.g}); pop.remove(); return; }
    if (e.target.closest('[data-close-pop]')) pop.remove();
  });
  const s = pop.querySelector('#emoji-search');
  s.oninput=()=>{ const q=s.value.trim(); if (!q) return draw('emoji'); const hit=EMOJIS.filter((e)=>e.includes(q)); body.innerHTML=`<div class="emoji-grid">${hit.map((e)=>`<button data-emoji="${e}">${e}</button>`).join('')||'<div class="gif-empty">No emoji found</div>'}</div>`; };
}
function insertAtCursor(t) { const ta=document.getElementById('composer-input'); if (!ta) return; const a=ta.selectionStart??ta.value.length,b=ta.selectionEnd??ta.value.length; ta.value=ta.value.slice(0,a)+t+ta.value.slice(b); ta.selectionStart=ta.selectionEnd=a+t.length; ta.focus(); onComposerInput(ta.value); }
function sendQuick(kind,text,media=null) { const s=getState(); if (!s.ui.activeChatId) return; act.sendMessage({chatId:s.ui.activeChatId,kind,text,media,replyTo:s.ui.replyTo}); forceBottom(); }

export function toggleAttachMenu(anchor) {
  const c = anchor.closest('.composer'); if (!c) return;
  if (c.querySelector('.composer-attach')) { c.querySelector('.composer-attach').remove(); return; }
  c.querySelector('.emoji-pop')?.remove();
  const pop=document.createElement('div'); pop.className='composer-attach';
  pop.innerHTML = `<button data-pick="file-image"><span class="att-ic" style="background:linear-gradient(135deg,#8b5cf6,#c026d3)">${icon('image')}</span>Photos</button><button data-pick="file-camera"><span class="att-ic" style="background:linear-gradient(135deg,#0ea5e9,#6366f1)">${icon('camera')}</span>Camera</button><button data-pick="file-video"><span class="att-ic" style="background:linear-gradient(135deg,#f59e0b,#ef4444)">${icon('film')}</span>Video</button><button data-pick="file-doc"><span class="att-ic" style="background:linear-gradient(135deg,#10b981,#0f766e)">${icon('file')}</span>Document</button>`;
  c.appendChild(pop);
  pop.addEventListener('click',(e)=>{ const b=e.target.closest('[data-pick]'); if (b) document.getElementById(b.dataset.pick)?.click(); pop.remove(); });
  setTimeout(()=>{ const out=(e)=>{ if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('pointerdown',out,true); } }; document.addEventListener('pointerdown',out,true); },0);
}

export async function handleFiles(files) {
  const s=getState(), c=chatById(s.ui.activeChatId); if (!c || !files?.length) return;
  for (const f of Array.from(files).slice(0,4)) {
    try {
      if ((f.type||'').startsWith('image/')) { const src=await imageAsDataURL(f,1440,0.84); act.sendMessage({chatId:c.id,kind:'image',media:{src,name:f.name,size:f.size,mime:f.type}}); }
      else if ((f.type||'').startsWith('video/')) { if (f.size>8*1024*1024) { toast('Video max 8 MB in demo','error'); continue; } act.sendMessage({chatId:c.id,kind:'video',media:{src:await readAsDataURL(f),name:f.name,size:f.size,mime:f.type}}); }
      else { if (f.size>2*1024*1024) { toast('Document max 2 MB in demo','error'); continue; } act.sendMessage({chatId:c.id,kind:'doc',media:{src:await readAsDataURL(f),name:f.name,size:f.size,mime:f.type}}); }
      forceBottom();
    } catch { toast(`Could not read ${f.name}`,'error'); }
  }
}
export async function startVoiceRecording() {
  if (recSession) return;
  const s=getState(), c=chatById(s.ui.activeChatId); if (!c) return;
  const slot=document.getElementById('rec-slot'); if (!slot) return;
  let stream=null;
  try { if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('unsupported'); stream=await navigator.mediaDevices.getUserMedia({audio:true}); }
  catch {
    if (await confirmDialog({title:'Microphone unavailable',message:'Mhzaly cannot access your mic. Add a short demo voice note using the same offline delivery pipeline?',confirmLabel:'Use demo clip'})) {
      act.sendMessage({chatId:c.id,kind:'voice',media:{duration:6,waveform:Array.from({length:26},(_,i)=>8+Math.abs(Math.sin(i))*16),src:''}});
      toast(netState().online?'Demo voice note sent':'Demo voice note queued offline','success');
    }
    return;
  }
  const rec=new MediaRecorder(stream), chunks=[], started=Date.now(), bars=[];
  rec.ondataavailable=(e)=>{ if (e.data.size) chunks.push(e.data); };
  rec.onstop=async()=>{
    stream.getTracks().forEach((t)=>t.stop());
    if (recSession?.cancelled) { recSession=null; slot.innerHTML=''; return; }
    const duration=Math.max(1,Math.round((Date.now()-started)/1000));
    let src=''; const blob=new Blob(chunks,{type:chunks[0]?.type||'audio/webm'});
    try { src=await readAsDataURL(blob); } catch { /* audio optional */ }
    act.sendMessage({chatId:c.id,kind:'voice',media:{duration,waveform:bars.length?bars:Array.from({length:26},()=>8+Math.random()*16),src,mime:blob.type}});
    recSession=null; slot.innerHTML=''; forceBottom();
    toast(netState().online?'Voice note sent':'Voice note queued for mesh sync','success');
  };
  rec.start(250);
  slot.innerHTML=`<div class="reply-bar"><div class="recorder"><span class="rec-dot"></span><span class="rec-time" id="rec-time">0:00</span><div class="rec-wave" id="rec-wave">${Array.from({length:22},()=>'<i style="height:6px"></i>').join('')}</div><button class="rec-btn stop" id="rec-stop">${icon('send')}</button><button class="rec-btn" id="rec-cancel">${icon('x')}</button></div></div>`;
  const timer=setInterval(()=>{ const sec=Math.floor((Date.now()-started)/1000); const el=document.getElementById('rec-time'); if (el) el.textContent=fmtDuration(sec); if (sec>=120) stopVoiceRecording(false); },250);
  const wav=setInterval(()=>{ const w=document.getElementById('rec-wave'); if (!w) return; const h=6+Math.random()*24; bars.push(Math.round(h)); const el=w.children[bars.length%w.children.length]; if (el) el.style.height=`${h}px`; },180);
  recSession={recorder:rec,stream,timer,wav,cancelled:false};
  document.getElementById('rec-stop').onclick=()=>stopVoiceRecording(false);
  document.getElementById('rec-cancel').onclick=()=>stopVoiceRecording(true);
}
export function stopVoiceRecording(cancel=false) {
  if (!recSession) return;
  const s=recSession; s.cancelled=cancel; clearInterval(s.timer); clearInterval(s.wav);
  try { if (s.recorder.state!=='inactive') s.recorder.stop(); } catch { /* noop */ }
  if (cancel) { s.stream.getTracks().forEach((t)=>t.stop()); recSession=null; const slot=document.getElementById('rec-slot'); if (slot) slot.innerHTML=''; }
}
export function playVoice(id, btn) {
  const m=getState().messages.find((x)=>x.id===id), player=btn.closest('.voice-player'); if (!m||!player) return;
  const old=voiceTimers.get(id);
  if (old) { clearInterval(old.interval); old.audio?.pause(); voiceTimers.delete(id); btn.innerHTML=icon('play'); player.querySelectorAll('.bar').forEach((b)=>b.classList.remove('on')); return; }
  const dur=m.media?.duration||6, bars=Array.from(player.querySelectorAll('.bar')), timeEl=player.querySelector('.voice-time');
  btn.innerHTML=icon('pause'); let elapsed=0, audio=null;
  if (m.media?.src) { try { audio=new Audio(m.media.src); audio.play().catch(()=>{}); } catch { audio=null; } }
  const interval=setInterval(()=>{ elapsed+=0.1; const p=Math.min(1,elapsed/dur); bars.forEach((b,i)=>b.classList.toggle('on', i/bars.length<=p)); if (timeEl) timeEl.textContent=fmtDuration(elapsed); if (elapsed>=dur) { clearInterval(interval); voiceTimers.delete(id); btn.innerHTML=icon('play'); if (timeEl) timeEl.textContent=fmtDuration(dur); audio?.pause(); } },100);
  voiceTimers.set(id,{interval,audio});
}
export function openMedia(id) { const m=getState().messages.find((x)=>x.id===id); if (m?.media?.src) openLightbox(m.media.src,{title:m.media.name||'Photo',subtitle:userOf(m.senderId).name}); }
export function downloadDoc(id) { const m=getState().messages.find((x)=>x.id===id); if (!m?.media?.src) return toast('Demo document has no stored bytes','error'); const a=document.createElement('a'); a.href=m.media.src; a.download=m.media.name||'file'; a.click(); }
export function jumpToMessage(id) { const el=document.getElementById(`msg-${id}`); if (!el) return; el.scrollIntoView({behavior:'smooth',block:'center'}); act.highlight(id); }

/* Central action router used by main.js for anything inside a chat. */
export function handleChatAction(action, el, event) {
  const id=el.dataset.id, chatId=el.dataset.chatId;
  switch(action) {
    case 'open-chat': act.openChat(id); return true;
    case 'close-chat': act.closeChat(); return true;
    case 'filter': act.setFilter(el.dataset.filter); return true;
    case 'chat-search': act.setChatSearchOpen(true); return true;
    case 'chat-search-close': act.setChatSearchOpen(false); return true;
    case 'unblock': act.unblockPeer(id); return true;
    case 'chat-menu': openChatMenu(id, event.clientX, event.clientY); return true;
    case 'chat-info': openChatInfo(id); return true;
    case 'message-menu': { const r=el.getBoundingClientRect(); openMessageMenu(id, r.left, r.bottom+4); return true; }
    case 'react': act.toggleReaction(id, el.dataset.emoji); return true;
    case 'jump': jumpToMessage(id); return true;
    case 'open-media': openMedia(id); return true;
    case 'play-voice': playVoice(id, el); return true;
    case 'download-doc': downloadDoc(id); return true;
    case 'new-chat': openNewChat(); return true;
    case 'new-group': openNewGroup(); return true;
    case 'compose-cancel': act.cancelCompose(); drafts.delete(getState().ui.activeChatId); return true;
    case 'compose-main': { const ta=document.getElementById('composer-input'); if (ta?.value.trim()) sendCurrent(); else startVoiceRecording(); return true; }
    case 'compose-emoji': toggleEmojiPicker(el); return true;
    case 'compose-attach': toggleAttachMenu(el); return true;
    case 'call': {
      const chat=chatById(id); const peer=chat?.type==='dm'?chat.peerId:null;
      if (peer) window.dispatchEvent(new CustomEvent('meshlink:start-call',{detail:{peerId:peer,type:el.dataset.type}}));
      else toast('Group calling is coming soon — call a member from group info','error');
      return true;
    }
    default: return false;
  }
}



