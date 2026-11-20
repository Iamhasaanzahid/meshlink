import { seedState, demoProfile } from './seed.js';
import { uid, previewOf, linkPreviewFor, extractUrl, fmtDuration, generateMeshId } from './utils.js';
import { sendRemote } from './realtime.js';
import { sendBridge, sendBridgeSelf } from './bridge.js?v=11';
import { netState, setNetMode, onNetChange } from './transport/connectivity.js';
import { encryptState, decryptState, isLocked, hasPin, setPin, verifyPin, clearPin, clearSessionPassphrase, setSessionPassphrase, devicePassphrase } from './security.js';

export const KEY = 'meshlink-web-v1';

let state = null;
const listeners = new Set();
let saveTimer = null;
let incomingSeq = 0;
let persistSeq = 0;

export async function initStore() {
  let loaded = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) loaded = migrate(await decryptState(raw));
  } catch (err) {
    console.warn('MeshLink: encrypted vault could not be opened', err);
  }
  state = loaded || seedState();
  state.auth = { ...state.auth, meshId: state.auth?.meshId || generateMeshId() };
  if (state.user && !state.user.meshId) state.user.meshId = state.auth.meshId;
  delete state.user?.phone;
  delete state.user?.email;
  state.auth.locked = isLocked();
  delete state.auth.otp;
  delete state.auth.phone;
  delete state.auth.pendingPhone;
  if (!state.settings) state.settings = seedState().settings;
  if (!state.ui) state.ui = seedState().ui;
  if (!state.ai) state.ai = { model: 'meshlink-mini', messages: [], endpoint: '' };
  setNetMode(state.settings.networkMode || 'auto');
  onNetChange(() => {
    commit({ silent: true });
    if (netState().online) act.flushOutbox();
  });
  if (!state.auth.locked) await persist();
  return state;
}

function migrate(s) {
  const base = seedState();
  s.settings = { ...base.settings, ...(s.settings || {}) };
  s.ui = { ...base.ui, ...(s.ui || {}) };
  s.blocked = s.blocked || [];
  s.statuses = s.statuses || [];
  s.calls = s.calls || [];
  s.auth = { ...base.auth, ...(s.auth || {}) };
  s.auth.meshId = s.auth.meshId || generateMeshId();
  delete s.auth.otp;
  delete s.auth.phone;
  delete s.auth.pendingPhone;
  if (s.auth.stage === 'otp' && !s.auth.verifyEmail) s.auth.stage = 'login';
  s.ui.chatSearchOpen = !!s.ui.chatSearchOpen;
  s.ai = { model: 'meshlink-mini', messages: [], endpoint: '', ...(s.ai || {}) };
  s.contacts = s.contacts || [];
  s.chats = s.chats || [];
  s.messages = s.messages || [];
  return s;
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => {
    try { fn(state); } catch (err) { console.error('render failed', err); }
  });
}

function commit({ silent = false } = {}) {
  if (!silent) notify();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 140);
}

export async function persistNow() {
  if (state?.auth?.locked) return;
  const seq = ++persistSeq;
  try {
    const raw = await encryptState(state);
    if (seq !== persistSeq) return;
    localStorage.setItem(KEY, raw);
  } catch (err) {
    console.warn('MeshLink: could not encrypt local vault', err);
  }
}

function persist() { persistNow(); }

// Cross-tab sync: another tab saved new state.
window.addEventListener('storage', async (e) => {
  if (e.key !== KEY || !e.newValue) return;
  try {
    const incoming = migrate(await decryptState(e.newValue));
    if (incoming.auth?.locked) return;
    state = incoming;
    notify();
  } catch { /* ignore malformed or foreign writes */ }
});

// ---------------------------------------------------------------- selectors
export const contactById = (id) => {
  if (id === 'u_me') return state.user || demoProfile;
  return state.contacts.find((c) => c.id === id) || null;
};

export const userOf = (id) => contactById(id) || { id, name: 'Unknown', online: false };

export const chatById = (id) => state.chats.find((c) => c.id === id) || null;

export const peerOf = (chat) => {
  if (!chat) return null;
  return chat.type === 'group' ? null : contactById(chat.peerId);
};

export const chatTitle = (chat) => {
  if (!chat) return '';
  return chat.type === 'group' ? chat.name : (chat.peerId ? (contactById(chat.peerId)?.name || 'Unknown') : chat.name);
};

export const chatAvatarUser = (chat) => {
  if (!chat) return {};
  if (chat.type === 'group') return { name: chat.name, emoji: chat.emoji || '👥', avatar: chat.avatar };
  return peerOf(chat) || { name: 'Unknown' };
};

export const messagesFor = (chatId) =>
  state.messages.filter((m) => m.chatId === chatId && !(m.deletedFor || []).includes('u_me'));

export const lastMessageFor = (chatId) => {
  const list = messagesFor(chatId);
  return list.length ? list[list.length - 1] : null;
};

export const visibleChats = ({ archived = false } = {}) =>
  state.chats.filter((c) => !!c.archived === archived);

export const sortedChats = ({ archived = false } = {}) =>
  visibleChats({ archived }).slice().sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return (b.lastAt || 0) - (a.lastAt || 0);
  });

export const unreadTotal = () =>
  state.chats.filter((c) => !c.archived).reduce((sum, c) => sum + (c.unread || 0), 0);

export const isBlocked = (userOrId) => {
  const id = typeof userOrId === 'string' ? userOrId : userOrId?.id;
  return state.blocked.includes(id);
};

export const typingFor = (chatId) => {
  const t = state.ui.typing[chatId];
  if (!t) return null;
  if (t.until && t.until < Date.now()) return null;
  return t;
};

export const starredMessages = () =>
  state.messages
    .filter((m) => (m.starredBy || []).includes('u_me') && !m.deletedForEveryone && !(m.deletedFor || []).includes('u_me'))
    .sort((a, b) => b.createdAt - a.createdAt);

export const activeChat = () => chatById(state.ui.activeChatId);

// ---------------------------------------------------------------- ui actions
const touch = () => { state = { ...state }; };

export const act = {
  setTheme(theme) {
    state.settings.theme = theme;
    document.documentElement.dataset.theme = theme;
    commit();
  },
  toggleTheme() {
    act.setTheme(state.settings.theme === 'dark' ? 'light' : 'dark');
  },
  setWallpaper(wallpaper) {
    state.settings.wallpaper = wallpaper;
    commit();
  },
  setSetting(key, value) {
    state.settings[key] = value;
    commit();
  },
  setView(view) {
    state.ui.view = view;
    if (view !== 'chats') state.ui.activeChatId = null;
    commit();
  },
  openChat(chatId) {
    state.ui.view = 'chats';
    state.ui.activeChatId = chatId;
    state.ui.replyTo = null;
    state.ui.editingId = null;
    state.ui.chatSearch = '';
    const chat = chatById(chatId);
    if (chat) { chat.unread = 0; }
    commit();
    sendRemote({ type: 'chat:read', chatId });
  },
  startDm(userId) {
    if (!userId) return null;
    let chat = state.chats.find((c) => c.type === 'dm' && c.peerId === userId);
    if (!chat) {
      chat = {
        id: uid('c'), type: 'dm', peerId: userId, name: '', avatar: '', pinned: false,
        muted: false, archived: false, unread: 0, lastAt: Date.now(),
        lastMessage: 'Say hello 👋', lastSenderId: '', adminIds: [], memberIds: [],
      };
      state.chats.unshift(chat);
    }
    act.openChat(chat.id);
    return chat;
  },
  highlight(messageId) {
    state.ui.highlightId = messageId;
    commit();
    setTimeout(() => {
      if (state.ui.highlightId === messageId) {
        state.ui.highlightId = null;
        commit();
      }
    }, 1800);
  },
  closeChat() {
    state.ui.activeChatId = null;
    commit();
  },
  setFilter(filter) { state.ui.filter = filter; commit(); },
  setSearch(search) { state.ui.search = search; commit({ silent: true }); },
  setChatSearch(search) { state.ui.chatSearch = search; commit(); },
  setChatMenu(open) { state.ui.chatMenuOpen = open; commit(); },
  setReply(messageId) { state.ui.replyTo = messageId; state.ui.editingId = null; commit(); },
  setEditing(messageId) { state.ui.editingId = messageId; state.ui.replyTo = null; commit(); },
  cancelCompose() { state.ui.replyTo = null; state.ui.editingId = null; commit(); },
  setTyping(chatId, userId, name, ms = 2800) {
    const token = Date.now();
    state.ui.typing[chatId] = { userId, name, until: token + ms };
    commit({ silent: true });
    setTimeout(() => {
      const cur = state.ui.typing[chatId];
      if (cur && cur.until <= Date.now()) {
        delete state.ui.typing[chatId];
        commit();
      }
    }, ms + 80);
  },
  clearTyping(chatId) {
    if (state.ui.typing[chatId]) {
      delete state.ui.typing[chatId];
      commit();
    }
  },

  // --------------------------------------------------------------- auth
  setStage(stage) {
    state.auth.stage = stage;
    commit();
  },
  linkFromPhone(peer = {}) {
    const meshId = String(peer.meshId || '').replace(/\D/g, '').slice(0, 10) ||
      state.auth.meshId || generateMeshId();
    state.user = {
      ...(state.user || demoProfile),
      name: String(peer.name || '').trim() || 'MeshLink phone',
      about: String(peer.about || '').trim() || 'Linked from MeshLink mobile',
      meshId,
      online: true,
      lastSeen: Date.now(),
    };
    delete state.user.phone;
    delete state.user.email;
    state.auth.meshId = meshId;
    state.auth.stage = 'ready';
    state.auth.verified = true;
    state.auth.verifiedEmail = '';
    state.auth.verifyEmail = '';
    state.auth.verifyDemo = false;
    commit();
    sendRemote({ type: 'profile:update', user: state.user });
  },
  /** Ask the server for a 6-digit code. Email is verification only, not login. */
  async requestEmailVerification(email) {
    const clean = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      return { ok: false, error: 'Enter a valid email address' };
    }
    state.auth.meshId = state.auth.meshId || generateMeshId();
    state.auth.verifyEmail = clean;
    commit({ silent: true });
    let res, data;
    try {
      res = await fetch('/api/verify/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: clean, meshId: state.auth.meshId }),
      });
      data = await res.json().catch(() => ({}));
    } catch {
      return { ok: false, error: 'Verification service unavailable' };
    }
    if (!res.ok) return { ok: false, error: data.error || 'Could not send verification code' };
    state.auth.verifyEmail = clean;
    state.auth.verifyDemo = !!data.demo;
    state.auth.stage = 'otp';
    commit();
    return { ok: true, demo: !!data.demo };
  },
  resendEmailVerification() {
    return act.requestEmailVerification(state.auth.verifyEmail || state.auth.verifiedEmail);
  },
  async verifyEmailCode(code) {
    const value = String(code || '').trim().replace(/\D/g, '').slice(0, 6);
    if (!/^\d{6}$/.test(value)) return { ok: false, error: 'Enter the 6-digit code' };
    let res, data;
    try {
      res = await fetch('/api/verify/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: state.auth.verifyEmail, meshId: state.auth.meshId, code: value,
        }),
      });
      data = await res.json().catch(() => ({}));
    } catch {
      return { ok: false, error: 'Verification service unavailable' };
    }
    if (!res.ok) return { ok: false, error: data.error || 'Invalid code' };
    state.auth.verified = true;
    state.auth.verifiedEmail = data.email || state.auth.verifyEmail;
    state.auth.verifyEmail = state.auth.verifiedEmail;
    state.auth.stage = state.user ? 'ready' : 'profile';
    commit();
    return { ok: true, email: state.auth.verifiedEmail };
  },
  completeProfile({ name, about = '', avatar = '' }) {
    const existing = state.user || demoProfile;
    state.user = {
      ...existing,
      name: String(name || '').trim() || 'MeshLink user',
      about: String(about || '').trim() || 'Hey there! I am using MeshLink.',
      avatar: avatar || '',
      meshId: existing.meshId || state.auth.meshId || generateMeshId(),
      online: true,
      lastSeen: Date.now(),
    };
    delete state.user.phone;
    delete state.user.email;
    state.auth.meshId = state.user.meshId;
    state.auth.stage = 'ready';
    commit();
    sendRemote({ type: 'profile:update', user: state.user });
  },
  updateProfile(patch) {
    if (!state.user) return;
    const clean = { ...patch };
    delete clean.phone;
    delete clean.email;
    if (clean.meshId) clean.meshId = state.user.meshId;
    state.user = { ...state.user, ...clean };
    commit();
    sendRemote({ type: 'profile:update', user: state.user });
  },
  loginDemo() {
    state.user = { ...demoProfile, meshId: state.auth.meshId || demoProfile.meshId, lastSeen: Date.now() };
    state.auth.stage = 'ready';
    state.auth.verified = true;
    state.auth.verifiedEmail = '';
    state.auth.verifyEmail = '';
    state.auth.verifyDemo = false;
    commit();
  },
  logout() {
    state.user = null;
    state.auth.stage = 'login';
    state.auth.verified = false;
    state.ui.activeChatId = null;
    commit();
  },
  async resetDemo() {
    localStorage.removeItem(KEY);
    state = seedState();
    state.auth.meshId = generateMeshId();
    state.auth.locked = false;
    await persistNow();
    notify();
  },

  // ------------------------------------------------------------- security
  async unlockApp(pin) {
    const ok = await verifyPin(pin);
    if (!ok) return false;
    setSessionPassphrase(String(pin));
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) state = migrate(await decryptState(raw, String(pin)));
      else await persistNow();
    } catch { return false; }
    state.auth.locked = false;
    notify();
    return true;
  },
  lockApp() {
    clearSessionPassphrase();
    state.auth.locked = true;
    notify();
  },
  async enablePin(pin) {
    await setPin(String(pin));
    state.auth.locked = false;
    await persistNow();
    notify();
    return true;
  },
  async disablePin() {
    clearPin();
    clearSessionPassphrase();
    await persistNow();
    notify();
  },

  // -------------------------------------------------------------------- AI
  addAiMessage(message) {
    const item = { id: uid('ai'), at: Date.now(), ...message };
    state.ai.messages.push(item);
    if (state.ai.messages.length > 120) state.ai.messages = state.ai.messages.slice(-120);
    commit();
    return item.id;
  },
  updateAiMessage(id, patch) {
    const m = state.ai.messages.find((x) => x.id === id);
    if (!m) return;
    Object.assign(m, patch);
    commit();
  },
  clearAiMessages() {
    state.ai.messages = [];
    commit();
  },
  setAiModel(model) {
    state.ai.model = model;
    commit();
  },
  setAiEndpoint(endpoint) {
    state.ai.endpoint = String(endpoint || '').trim();
    commit();
  },
  backToLogin() {
    state.auth.stage = 'login';
    state.auth.verified = false;
    state.auth.verifyEmail = '';
    state.auth.verifyDemo = false;
    commit();
  },

  // ----------------------------------------------------------- messaging
  sendMessage({ chatId, text = '', kind = 'text', media = null, replyTo = null, forwarded = false }) {
    const chat = chatById(chatId);
    if (!chat) return null;
    const value = String(text || '').trim();
    if (kind === 'text' && !value) return null;
    const at = Date.now();
    const url = value ? extractUrl(value) : '';
    const net = netState();
    const status = net.online ? 'sent' : net.local ? 'mesh' : 'queued';
    const message = {
      id: uid('m'),
      chatId,
      senderId: 'u_me',
      createdAt: at,
      kind,
      text: value,
      media: media || null,
      link: url ? linkPreviewFor(url) : null,
      replyTo: replyTo || null,
      reactions: {},
      starredBy: [],
      deletedFor: [],
      deletedForEveryone: false,
      forwarded: !!forwarded,
      status,
      transport: net.online ? 'global' : net.local ? 'mesh' : 'outbox',
      queuedAt: status === 'queued' ? at : null,
      expiresAt: status === 'queued' ? at + 864e5 : null,
    };
    state.messages.push(message);
    chat.lastAt = at;
    chat.lastSenderId = 'u_me';
    chat.lastMessage = previewOf(message, state.user?.name, 'u_me');
    if (state.ui.activeChatId === chatId) chat.unread = 0;
    state.ui.replyTo = null;
    state.ui.editingId = null;
    commit();
    sendRemote({ type: 'message:new', message });
    if (chat.type === 'dm' && /^\d{10}$/.test(chat.peerId) && kind === 'text') {
      const bridgeMessage = {
        id: message.id,
        body: value,
        name: state.user?.name || 'MeshLink user',
      };
      sendBridge(chat.peerId, bridgeMessage);
      // Other linked devices (the phone that paired this browser) need a copy
      // of messages sent from the web, otherwise web chats live only here.
      sendBridgeSelf(chat.peerId, bridgeMessage);
    }
    if (status === 'sent') scheduleTicks(message.id);
    if (status === 'queued') {
      window.dispatchEvent(new CustomEvent('meshlink:queued', { detail: { message } }));
    }
    if (state.settings.demoReplies && !(chat.type === 'dm' && isBlocked(chat.peerId)) && net.key !== 'offline') scheduleDemoReply(chat, message);
    return message;
  },
  flushOutbox() {
    if (!netState().online) return 0;
    const queued = state.messages.filter((m) => m.senderId === 'u_me' && m.status === 'queued' && !m.expired);
    queued.forEach((m) => {
      m.status = 'sent';
      m.transport = 'global';
      m.syncedAt = Date.now();
      sendRemote({ type: 'message:update', id: m.id, patch: { status: 'sent', transport: 'global' } });
      scheduleTicks(m.id);
    });
    if (queued.length) {
      commit();
      window.dispatchEvent(new CustomEvent('meshlink:synced', { detail: { count: queued.length } }));
    }
    return queued.length;
  },
  setNetworkMode(mode) {
    state.settings.networkMode = mode;
    setNetMode(mode);
    commit();
    if (netState().online) act.flushOutbox();
  },
  setChatSearchOpen(open) {
    state.ui.chatSearchOpen = !!open;
    if (!open) state.ui.chatSearch = '';
    commit();
    if (open) setTimeout(() => document.getElementById('msg-search')?.focus(), 60);
  },
  receiveMessage(message, { remote = false, own = false } = {}) {
    if (!message || !message.id) return;
    if (state.messages.some((m) => m.id === message.id)) return;
    const chat = chatById(message.chatId);
    if (!chat) return;
    state.messages.push(message);
    chat.lastAt = message.createdAt || Date.now();
    chat.lastSenderId = message.senderId;
    chat.lastMessage = previewOf(message, userOf(message.senderId).name, 'u_me');
    const blocked = chat.type !== 'group' && isBlocked(chat.peerId);
    if (own) {
      chat.unread = 0;
    } else if (state.ui.activeChatId === chat.id && !blocked) {
      chat.unread = 0;
    } else {
      chat.unread = (chat.unread || 0) + 1;
    }
    commit();
    if (!remote) sendRemote({ type: 'message:new', message });
    if (!blocked && !own) {
      window.dispatchEvent(new CustomEvent('meshlink:incoming', {
        detail: {
          chatId: chat.id,
          chatTitle: chatTitle(chat),
          sender: userOf(message.senderId),
          body: previewOf(message, userOf(message.senderId).name, 'u_me'),
          isActive: state.ui.activeChatId === chat.id,
        },
      }));
    }
  },
  editMessage(messageId, text) {
    const message = state.messages.find((m) => m.id === messageId);
    if (!message || message.senderId !== 'u_me') return;
    const value = String(text || '').trim();
    if (!value) return;
    message.text = value;
    message.editedAt = Date.now();
    message.link = extractUrl(value) ? linkPreviewFor(extractUrl(value)) : null;
    const chat = chatById(message.chatId);
    if (chat && chat.lastSenderId === 'u_me') chat.lastMessage = previewOf(message, state.user?.name, 'u_me');
    state.ui.editingId = null;
    commit();
    sendRemote({ type: 'message:update', id: messageId, patch: { text: message.text, editedAt: message.editedAt, link: message.link } });
  },
  deleteMessage(messageId, everyone = false) {
    const message = state.messages.find((m) => m.id === messageId);
    if (!message) return;
    if (everyone && message.senderId === 'u_me') {
      message.deletedForEveryone = true;
      message.text = '';
      message.media = null;
      message.kind = 'text';
      message.link = null;
      message.reactions = {};
      sendRemote({ type: 'message:update', id: messageId, patch: { deletedForEveryone: true, text: '', media: null, kind: 'text', link: null, reactions: {} } });
    } else {
      message.deletedFor = Array.from(new Set([...(message.deletedFor || []), 'u_me']));
    }
    const chat = chatById(message.chatId);
    const last = lastMessageFor(message.chatId);
    if (chat && last) chat.lastMessage = previewOf(last, userOf(last.senderId).name, 'u_me');
    commit();
  },
  clearChat(chatId) {
    const chat = chatById(chatId);
    if (!chat) return;
    state.messages = state.messages.filter((m) => m.chatId !== chatId);
    chat.unread = 0;
    chat.lastMessage = 'Chat cleared';
    chat.lastAt = Date.now();
    chat.lastSenderId = '';
    commit();
  },
  revertRemote(messageId, patch) {
    const message = state.messages.find((m) => m.id === messageId);
    if (!message) return;
    Object.assign(message, patch || {});
    commit();
  },
  markChatRead(chatId) {
    const chat = chatById(chatId);
    if (chat) chat.unread = 0;
    commit();
  },
  setMessageStatus(messageId, status) {
    const message = state.messages.find((m) => m.id === messageId);
    if (!message || message.senderId !== 'u_me') return;
    const order = { queued: 0, mesh: 1, sent: 2, delivered: 3, read: 4 };
    if ((order[status] ?? 0) < (order[message.status] ?? 0)) return;
    message.status = status;
    commit({ silent: true });
  },
  toggleReaction(messageId, emoji = '❤️') {
    const message = state.messages.find((m) => m.id === messageId);
    if (!message) return;
    const current = message.reactions?.[emoji] || [];
    const mine = current.includes('u_me');
    if (!message.reactions) message.reactions = {};
    Object.keys(message.reactions).forEach((key) => {
      message.reactions[key] = (message.reactions[key] || []).filter((id) => id !== 'u_me');
      if (!message.reactions[key].length) delete message.reactions[key];
    });
    if (!mine) message.reactions[emoji] = [...(message.reactions[emoji] || []), 'u_me'];
    commit();
    sendRemote({ type: 'message:update', id: messageId, patch: { reactions: message.reactions } });
  },
  starMessage(messageId) {
    const message = state.messages.find((m) => m.id === messageId);
    if (!message) return;
    const set = new Set(message.starredBy || []);
    if (set.has('u_me')) set.delete('u_me'); else set.add('u_me');
    message.starredBy = Array.from(set);
    commit();
  },
  forwardMessage(messageId, chatIds = []) {
    const source = state.messages.find((m) => m.id === messageId);
    if (!source || !chatIds.length) return;
    const at = Date.now();
    chatIds.forEach((chatId) => {
      const chat = chatById(chatId);
      if (!chat) return;
      const copy = {
        ...JSON.parse(JSON.stringify(source)),
        id: uid('m'),
        chatId,
        senderId: 'u_me',
        createdAt: at + Math.floor(Math.random() * 4),
        reactions: {},
        starredBy: [],
        deletedFor: [],
        deletedForEveryone: false,
        forwarded: true,
        status: 'sent',
      };
      state.messages.push(copy);
      chat.lastAt = copy.createdAt;
      chat.lastMessage = previewOf(copy, state.user?.name, 'u_me');
      chat.lastSenderId = 'u_me';
      sendRemote({ type: 'message:new', message: copy });
      scheduleTicks(copy.id);
    });
    commit();
  },
  deleteConversation(chatId) {
    state.messages = state.messages.filter((m) => m.chatId !== chatId);
    state.chats = state.chats.filter((c) => c.id !== chatId);
    if (state.ui.activeChatId === chatId) state.ui.activeChatId = null;
    commit();
  },

  // --------------------------------------------------------------- chats
  togglePin(chatId) {
    const chat = chatById(chatId);
    if (chat) chat.pinned = !chat.pinned;
    commit();
  },
  toggleMute(chatId) {
    const chat = chatById(chatId);
    if (chat) chat.muted = !chat.muted;
    commit();
  },
  toggleArchive(chatId) {
    const chat = chatById(chatId);
    if (!chat) return;
    chat.archived = !chat.archived;
    commit();
    return chat.archived;
  },
  blockPeer(userId) {
    if (!userId) return;
    if (!state.blocked.includes(userId)) state.blocked.push(userId);
    commit();
  },
  unblockPeer(userId) {
    state.blocked = state.blocked.filter((id) => id !== userId);
    commit();
  },

  // --------------------------------------------------------------- groups
  createGroup({ name, memberIds = [], emoji = '✨', about = '', avatar = '' }) {
    const clean = String(name || '').trim();
    if (!clean) return null;
    const id = uid('g');
    const members = Array.from(new Set(['u_me', ...memberIds]));
    const chat = {
      id, type: 'group', peerId: '', name: clean, emoji: emoji || '✨', avatar,
      about: about || 'A new MeshLink group.',
      pinned: false, muted: false, archived: false, unread: 0, lastAt: Date.now(),
      lastMessage: 'Group created', lastSenderId: 'u_me',
      memberIds: members, adminIds: ['u_me'],
    };
    state.chats.unshift(chat);
    state.ui.view = 'chats';
    state.ui.activeChatId = id;
    commit();
    return chat;
  },
  addGroupMember(chatId, userId) {
    const chat = chatById(chatId);
    if (!chat || chat.type !== 'group' || !userId) return;
    if (!chat.memberIds.includes(userId)) chat.memberIds.push(userId);
    commit();
  },
  removeGroupMember(chatId, userId) {
    const chat = chatById(chatId);
    if (!chat || chat.type !== 'group') return;
    chat.memberIds = chat.memberIds.filter((id) => id !== userId);
    chat.adminIds = (chat.adminIds || []).filter((id) => id !== userId);
    commit();
  },
  toggleGroupAdmin(chatId, userId) {
    const chat = chatById(chatId);
    if (!chat || chat.type !== 'group') return;
    const set = new Set(chat.adminIds || []);
    if (set.has(userId)) set.delete(userId); else set.add(userId);
    chat.adminIds = Array.from(set);
    commit();
  },
  updateGroup(chatId, patch) {
    const chat = chatById(chatId);
    if (!chat || chat.type !== 'group') return;
    Object.assign(chat, patch);
    commit();
  },

  // --------------------------------------------------------------- status
  addStatus({ items = [] } = {}) {
    if (!items.length) return;
    const mine = state.statuses.find((s) => s.userId === 'u_me');
    if (mine) {
      mine.items.unshift(...items.map((it) => ({ ...it, id: uid('si'), createdAt: Date.now() })));
      mine.createdAt = Date.now();
      mine.seen = true;
      mine.viewers = [];
    } else {
      state.statuses.unshift({
        id: uid('s'),
        userId: 'u_me',
        createdAt: Date.now(),
        seen: true,
        items: items.map((it) => ({ ...it, id: uid('si'), createdAt: Date.now() })),
        viewers: [],
      });
    }
    commit();
  },
  viewStatus(statusId) {
    const status = state.statuses.find((s) => s.id === statusId);
    if (!status) return;
    status.seen = true;
    if (!status.viewers.includes('u_me')) status.viewers.push('u_me');
    commit();
  },
  deleteStatus(statusId) {
    state.statuses = state.statuses.filter((s) => s.id !== statusId);
    commit();
  },
  expireStatuses() {
    const cutoff = Date.now() - 24 * 3600e3;
    const before = state.statuses.length;
    state.statuses = state.statuses.filter((s) => s.createdAt > cutoff);
    if (state.statuses.length !== before) commit();
  },

  // ---------------------------------------------------------------- calls
  logCall(call) {
    state.calls.unshift({ id: uid('call'), at: Date.now(), ...call });
    commit();
  },
  setCallFilter(filter) { state.ui.callFilter = filter; commit(); },
  clearCalls() { state.calls = []; commit(); },

  // ---------------------------------------------------------------- utils
  markNotificationsRead() {
    state.chats.forEach((c) => { if (!c.archived) c.unread = 0; });
    commit();
  },
  exportData() {
    return {
      app: 'MeshLink Web',
      exportedAt: new Date().toISOString(),
      user: state.user,
      contacts: state.contacts,
      chats: state.chats,
      messages: state.messages,
      statuses: state.statuses,
      calls: state.calls,
    };
  },
};

// --------------------------------------------------------- demo simulation
let replyIndex = 0;
const REPLIES = {
  greeting: ['Hey! 👋', 'Morning! How are you?', 'Hello hello ✨', 'Hey, good timing.'],
  thanks: ['Anytime 💜', 'Of course!', 'Happy to help 🙌', 'No worries at all.'],
  question: ['Good question — let me check.', 'I think so, yes.', 'Give me 5 minutes and I\'ll confirm.', 'Already on it ✅'],
  work: ['Just pushed it. Take a look when you can.', 'The build is green ✅', 'I left comments in the doc.', 'Design is ready for review.'],
  media: ['This one is going straight to the archive 🔥', 'The colours are unreal.', 'Okay that looks premium.', 'Saving this one.'],
  plan: ['Works for me. 11 it is ☕', 'I\'m in. Should we invite the crew?', 'Booked it. See you there.', 'Perfect, adding it to the calendar.'],
  laugh: ['😂😂😂', 'I can\'t 😭', 'Stop it 💀', 'Okay that got me.'],
  default: [
    'Got it 👍', 'Makes sense.', 'Love that.', 'Sounds good to me.', 'Nice — let\'s do it.', 'On it!',
    'Perfect timing, I was just thinking about this.', 'That works. I\'ll wrap it up and send it over.', '😂 fair enough',
    'Okay, noted. Anything else before I jump back in?', 'This is why we ship on Fridays 😅',
  ],
};

function pickReply(text = '', kind = 'text') {
  if (kind !== 'text') return REPLIES.media[replyIndex++ % REPLIES.media.length];
  const t = text.toLowerCase();
  if (/^(hi|hey|hello|morning|salam|asalam)/.test(t)) return REPLIES.greeting[replyIndex++ % REPLIES.greeting.length];
  if (/(thank|thanks|shukriya|great|awesome|nice work)/.test(t)) return REPLIES.thanks[replyIndex++ % REPLIES.thanks.length];
  if (/(lol|haha|😂|meme|funny)/.test(t)) return REPLIES.laugh[replyIndex++ % REPLIES.laugh.length];
  if (/(ship|build|deploy|design|figma|mockup|code|pr|review|push)/.test(t)) return REPLIES.work[replyIndex++ % REPLIES.work.length];
  if (/(call|meet|standup|tomorrow|today|plan|trip|sat|time)/.test(t)) return REPLIES.plan[replyIndex++ % REPLIES.plan.length];
  if (t.includes('?')) return REPLIES.question[replyIndex++ % REPLIES.question.length];
  return REPLIES.default[replyIndex++ % REPLIES.default.length];
}

function scheduleTicks(messageId) {
  setTimeout(() => act.setMessageStatus(messageId, 'delivered'), 900);
  setTimeout(() => {
    if (state.settings.readReceipts && !isBlocked('u_me')) act.setMessageStatus(messageId, 'read');
  }, 2800);
}

function scheduleDemoReply(chat, sourceMessage) {
  if (!state.user) return;
  if (chat.type === 'dm' && isBlocked(chat.peerId)) return;
  const members = chat.type === 'group'
    ? chat.memberIds.filter((id) => id !== 'u_me')
    : [chat.peerId];
  if (!members.length) return;
  const senderId = members[Math.floor(Math.random() * members.length)];
  const sender = userOf(senderId);
  const delay = 1500 + Math.random() * 1400;
  const typingUntil = Date.now() + delay + 1800;
  setTimeout(() => {
    if (!state.user || !chatById(chat.id)) return;
    state.ui.typing[chat.id] = { userId: senderId, name: sender.name, until: typingUntil };
    commit({ silent: true });
  }, 700);
  setTimeout(() => {
    if (!state.user || !chatById(chat.id)) return;
    delete state.ui.typing[chat.id];
    const reply = pickReply(sourceMessage.text, sourceMessage.kind);
    act.receiveMessage({
      id: uid('m'),
      chatId: chat.id,
      senderId,
      createdAt: Date.now(),
      kind: 'text',
      text: reply,
      reactions: {},
      starredBy: [],
      deletedFor: [],
      deletedForEveryone: false,
      forwarded: false,
      status: 'read',
    });
    incomingSeq++;
  }, delay + 1900);
}
