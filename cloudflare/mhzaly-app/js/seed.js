import { makeArt, makeAvatarArt, generateMeshId } from './utils.js';

const now = Date.now();
const m = (mins) => now - mins * 60e3;
const h = (hours) => now - hours * 3600e3;
const d = (days) => now - days * 864e5;

const wave = (seed = 3, n = 30, min = 5, max = 26) =>
  Array.from({ length: n }, (_, i) => {
    const v = Math.abs(Math.sin((i + 1) * seed * 0.7) * Math.cos(i * 0.4 + seed));
    return Math.round(min + v * (max - min));
  });

const msg = (id, chatId, senderId, createdAt, extra = {}) => ({
  id,
  chatId,
  senderId,
  createdAt,
  kind: 'text',
  text: '',
  reactions: {},
  starredBy: [],
  deletedFor: [],
  deletedForEveryone: false,
  forwarded: false,
  status: senderId === 'u_me' ? 'read' : 'read',
  ...extra,
});

export const demoProfile = {
  id: 'u_me',
  name: 'Ali Hassan',
  meshId: generateMeshId(),
  about: 'Building in public ⚡',
  avatar: '',
  online: true,
  lastSeen: now,
};

export function seedState() {
  const contacts = [
    { id: 'u_ayesha', name: 'Ayesha Khan', meshId: generateMeshId(), about: 'Designing calm interfaces ✨', avatar: makeAvatarArt('AK', '#a855f7', '#ec4899'), online: true, lastSeen: now },
    { id: 'u_hamza', name: 'Hamza Ali', meshId: generateMeshId(), about: 'Shipping pixels at 2am', avatar: '', online: false, lastSeen: m(12) },
    { id: 'u_sara', name: 'Sara Ahmed', meshId: generateMeshId(), about: 'Chasing light 📷', avatar: makeAvatarArt('SA', '#fb923c', '#db2777'), online: true, lastSeen: now },
    { id: 'u_bilal', name: 'Bilal Raza', meshId: generateMeshId(), about: 'Roadmaps, chai, repeat.', avatar: '', online: false, lastSeen: h(2) },
    { id: 'u_zainab', name: 'Zainab Fatima', meshId: generateMeshId(), about: 'Words are my playground.', avatar: makeAvatarArt('ZF', '#0ea5e9', '#14b8a6'), online: false, lastSeen: h(1) },
    { id: 'u_daniyal', name: 'Daniyal Ahmed', meshId: generateMeshId(), about: 'Probably on a hike 🏔️', avatar: '', online: true, lastSeen: now },
  ];

  const chats = [
    {
      id: 'c_ayesha', type: 'dm', peerId: 'u_ayesha', name: '', avatar: '', pinned: true, muted: false,
      archived: false, unread: 2, lastAt: m(3), lastMessage: 'Also… I made a purple version. You\'re going to love it 💜',
      lastSenderId: 'u_ayesha', adminIds: [], memberIds: [],
    },
    {
      id: 'c_hamza', type: 'dm', peerId: 'u_hamza', name: '', avatar: '', pinned: false, muted: false,
      archived: false, unread: 0, lastAt: m(22), lastMessage: 'Deploy is green ✅ — shipped the media pipeline.',
      lastSenderId: 'u_hamza', adminIds: [], memberIds: [],
    },
    {
      id: 'c_crew', type: 'group', peerId: '', name: 'Product Crew', avatar: '', emoji: '🚀', pinned: false, muted: false,
      archived: false, unread: 4, lastAt: m(38), lastMessage: 'Standup at 11? I\'ll bring chai ☕',
      lastSenderId: 'u_bilal', adminIds: ['u_me', 'u_ayesha'], memberIds: ['u_me', 'u_ayesha', 'u_hamza', 'u_bilal'],
      about: 'Shipping the next chapter. Purple everything.',
    },
    {
      id: 'c_sara', type: 'dm', peerId: 'u_sara', name: '', avatar: '', pinned: true, muted: false,
      archived: false, unread: 1, lastAt: h(2), lastMessage: '📷 Photo',
      lastSenderId: 'u_sara', adminIds: [], memberIds: [],
    },
    {
      id: 'c_zainab', type: 'dm', peerId: 'u_zainab', name: '', avatar: '', pinned: false, muted: true,
      archived: false, unread: 0, lastAt: h(25), lastMessage: '🎤 Voice message (0:24)',
      lastSenderId: 'u_zainab', adminIds: [], memberIds: [],
    },
    {
      id: 'c_hikers', type: 'group', peerId: '', name: 'Weekend Hikers', avatar: '', emoji: '🏔️', pinned: false, muted: false,
      archived: false, unread: 0, lastAt: d(1), lastMessage: '📄 trail-map.gpx',
      lastSenderId: 'u_sara', adminIds: ['u_me'], memberIds: ['u_me', 'u_sara', 'u_zainab', 'u_daniyal'],
      about: 'Trail 5, Saturday 6am. Bring water.',
    },
    {
      id: 'c_bilal', type: 'dm', peerId: 'u_bilal', name: '', avatar: '', pinned: false, muted: false,
      archived: false, unread: 0, lastAt: d(5), lastMessage: 'You\'re the best.',
      lastSenderId: 'u_bilal', adminIds: [], memberIds: [],
    },
    {
      id: 'c_daniyal', type: 'dm', peerId: 'u_daniyal', name: '', avatar: '', pinned: false, muted: false,
      archived: true, unread: 0, lastAt: d(3), lastMessage: 'Bro that meme tho 💀',
      lastSenderId: 'u_daniyal', adminIds: [], memberIds: [],
    },
  ];

  const artPurple = makeArt('Purple, but softer', 'v4 · palette exploration', '#4c1d95', '#c026d3', '#e9d5ff');
  const artBoard = makeArt('Standup board', 'Sprint 14 · on track', '#312e81', '#7c3aed', '#c4b5fd');
  const artGolden = makeArt('Golden hour', 'Karachi · 6:42 pm', '#c2410c', '#db2777', '#fde68a');
  const artRoof = makeArt('Roof series', 'Light studies, no filter', '#0f766e', '#6d28d9', '#99f6e4');
  const artDesk = makeArt('Behind the scenes', 'Design desk · 4:12 pm', '#7c2d12', '#a21caf', '#fed7aa');

  const messages = [
    // Ayesha
    msg('m_ay1', 'c_ayesha', 'u_me', m(58), { text: 'Morning! Did you see the new mockups?', status: 'read' }),
    msg('m_ay2', 'c_ayesha', 'u_ayesha', m(54), { text: 'Just opened them. The spacing feels so much calmer now.' }),
    msg('m_ay3', 'c_ayesha', 'u_ayesha', m(52), {
      kind: 'image', text: 'Purple, but softer — v4 palette',
      media: { src: artPurple, name: 'palette-v4.svg', mime: 'image/svg+xml', width: 900, height: 1100 },
      reactions: { '❤️': ['u_me'] },
    }),
    msg('m_ay4', 'c_ayesha', 'u_me', m(50), { text: 'Exactly the direction I wanted. Can we ship the DM list today?', status: 'read' }),
    msg('m_ay5', 'c_ayesha', 'u_ayesha', m(48), {
      text: 'Yes — I\'ll finish the empty states and hand off by 4.',
      replyTo: 'm_ay3', reactions: { '🔥': ['u_me'] },
    }),
    msg('m_ay6', 'c_ayesha', 'u_me', m(45), { text: 'You\'re a legend. Sending the build to the team.', status: 'read' }),
    msg('m_ay7', 'c_ayesha', 'u_ayesha', m(44), {
      kind: 'voice', media: { duration: 18, waveform: wave(2), src: '' },
    }),
    msg('m_ay8', 'c_ayesha', 'u_ayesha', m(3), { text: 'Also… I made a purple version. You\'re going to love it 💜' }),

    // Hamza
    msg('m_ha1', 'c_hamza', 'u_hamza', m(44), { text: 'Pushed the websocket relay. One room per chat, events stay tiny.' }),
    msg('m_ha2', 'c_hamza', 'u_me', m(40), { text: 'Nice. Reconnect and offline queue handled?', status: 'read' }),
    msg('m_ha3', 'c_hamza', 'u_hamza', m(35), {
      text: 'Yep — exponential backoff and a 30s buffer. Docs here: https://mesh.link/docs/realtime',
      link: { url: 'https://mesh.link/docs/realtime', domain: 'mesh.link', title: 'Realtime architecture', desc: 'Rooms, event envelopes, reconnect strategy and delivery guarantees.' },
    }),
    msg('m_ha4', 'c_hamza', 'u_hamza', m(22), { text: 'Deploy is green ✅ — shipped the media pipeline.', reactions: { '👍': ['u_me'] } }),

    // Product Crew
    msg('m_cr1', 'c_crew', 'u_ayesha', m(62), { text: 'Morning crew ☀️ standup in 20?' }),
    msg('m_cr2', 'c_crew', 'u_bilal', m(58), { text: 'I\'ll bring the chai ☕', reactions: { '😂': ['u_me', 'u_ayesha'] } }),
    msg('m_cr3', 'c_crew', 'u_me', m(55), { text: 'Roadmap doc is updated — check the pinned tab.', status: 'read' }),
    msg('m_cr4', 'c_crew', 'u_ayesha', m(50), { text: 'The purple palette is in Figma now. Thoughts?' }),
    msg('m_cr5', 'c_crew', 'u_hamza', m(48), { text: 'Looks premium. Ship it.' }),
    msg('m_cr6', 'c_crew', 'u_me', m(42), {
      kind: 'image', text: 'Sprint 14 board',
      media: { src: artBoard, name: 'standup-board.svg', mime: 'image/svg+xml', width: 900, height: 1100 },
      reactions: { '🔥': ['u_ayesha', 'u_bilal'] }, status: 'read',
    }),
    msg('m_cr7', 'c_crew', 'u_bilal', m(38), { text: 'Standup at 11? I\'ll bring chai ☕' }),

    // Sara
    msg('m_sa1', 'c_sara', 'u_sara', h(2), {
      kind: 'image', text: 'Golden hour from the roof',
      media: { src: artGolden, name: 'golden-hour.svg', mime: 'image/svg+xml', width: 900, height: 1100 },
      reactions: { '😍': ['u_me'] },
    }),

    // Zainab
    msg('m_za1', 'c_zainab', 'u_me', h(26), { text: 'Did you finish the launch copy?', status: 'read' }),
    msg('m_za2', 'c_zainab', 'u_zainab', h(25), { text: 'Just recorded a voice note instead — faster 😅' }),
    msg('m_za3', 'c_zainab', 'u_zainab', h(25), { kind: 'voice', media: { duration: 24, waveform: wave(5), src: '' } }),
    msg('m_za4', 'c_zainab', 'u_me', h(24), { text: 'Perfect, transcribing now.', status: 'read' }),

    // Hikers
    msg('m_hi1', 'c_hikers', 'u_sara', d(2), { text: 'Saturday, 6am, Trail 5. No excuses.' }),
    msg('m_hi2', 'c_hikers', 'u_daniyal', d(2), { text: 'I\'m in. Bringing the speaker.' }),
    msg('m_hi3', 'c_hikers', 'u_me', d(2), { text: 'Weather looks clear. I\'ll pack extra water.', status: 'read' }),
    msg('m_hi4', 'c_hikers', 'u_sara', d(1), {
      kind: 'doc', media: { name: 'trail-map.gpx', size: 86000, mime: 'application/gpx+xml', src: '' },
      text: 'Trail map for Saturday ⛰️',
    }),

    // Bilal
    msg('m_bi1', 'c_bilal', 'u_bilal', d(5), { text: 'The investor deck needs one more slide.' }),
    msg('m_bi2', 'c_bilal', 'u_me', d(5), { text: 'On it. Sending tonight.', status: 'read' }),
    msg('m_bi3', 'c_bilal', 'u_bilal', d(5), { text: 'You\'re the best.', reactions: { '🙏': ['u_me'] } }),

    // Daniyal (archived)
    msg('m_da1', 'c_daniyal', 'u_daniyal', d(3), { text: 'Bro that meme tho 💀', reactions: { '😂': ['u_me'] } }),
    msg('m_da2', 'c_daniyal', 'u_me', d(3), { text: 'I can\'t breathe 😂', status: 'read' }),
  ];

  // Star a few messages for the Starred page.
  const starred = new Set(['m_ay3', 'm_ha3', 'm_hi4']);
  messages.forEach((mm) => { if (starred.has(mm.id)) mm.starredBy = ['u_me']; });

  const statuses = [
    {
      id: 's_ayesha', userId: 'u_ayesha', createdAt: h(2), seen: false,
      items: [
        { id: 'si1', kind: 'text', text: 'Purple is not a colour. It\'s a feeling. 💜', bg: 'linear-gradient(145deg,#6d28d9,#c026d3)', createdAt: h(2) },
        { id: 'si2', kind: 'image', text: 'Behind the scenes', media: { src: artDesk }, createdAt: h(2) },
      ],
      viewers: ['u_hamza', 'u_sara'],
    },
    {
      id: 's_sara', userId: 'u_sara', createdAt: h(3), seen: false,
      items: [
        { id: 'si3', kind: 'image', text: 'Roof series', media: { src: artRoof }, createdAt: h(3) },
      ],
      viewers: ['u_ayesha'],
    },
    {
      id: 's_zainab', userId: 'u_zainab', createdAt: h(8), seen: false,
      items: [
        { id: 'si4', kind: 'text', text: 'Write the thing you are afraid to write.', bg: 'linear-gradient(145deg,#0f766e,#0e7490)', createdAt: h(8) },
      ],
      viewers: [],
    },
    {
      id: 's_hamza', userId: 'u_hamza', createdAt: h(10), seen: true,
      items: [
        { id: 'si5', kind: 'text', text: 'Ship small. Ship often. 🚀', bg: 'linear-gradient(145deg,#1e1b4b,#7c3aed)', createdAt: h(10) },
      ],
      viewers: ['u_me', 'u_bilal'],
    },
  ];

  const calls = [
    { id: 'call1', peerId: 'u_ayesha', type: 'video', direction: 'incoming', status: 'answered', duration: 8 * 60 + 42, at: m(12) },
    { id: 'call2', peerId: 'u_hamza', type: 'voice', direction: 'outgoing', status: 'answered', duration: 4 * 60 + 18, at: h(2) },
    { id: 'call3', peerId: 'u_sara', type: 'voice', direction: 'incoming', status: 'missed', duration: 0, at: h(5) },
    { id: 'call4', peerId: 'u_bilal', type: 'voice', direction: 'outgoing', status: 'answered', duration: 12 * 60 + 4, at: d(1) },
    { id: 'call5', peerId: 'u_daniyal', type: 'video', direction: 'incoming', status: 'missed', duration: 0, at: d(1) + 3600e3 },
    { id: 'call6', peerId: 'u_ayesha', type: 'voice', direction: 'outgoing', status: 'answered', duration: 2 * 60 + 51, at: d(2) },
  ];

  return {
    version: 1,
    auth: {
      stage: 'login', meshId: generateMeshId(), remember: true, locked: false,
      verified: false, verifiedEmail: '', verifyEmail: '', verifyDemo: false,
    },
    user: null,
    contacts,
    chats,
    messages,
    statuses,
    calls,
    settings: {
      theme: 'dark',
      wallpaper: 'aurora',
      networkMode: 'auto',
      notifications: true,
      sound: true,
      demoReplies: true,
      readReceipts: true,
      lastSeenVisible: true,
      enterToSend: true,
    },
    blocked: [],
    ui: {
      view: 'chats',
      activeChatId: null,
      filter: 'all',
      search: '',
      chatSearch: '',
      replyTo: null,
      editingId: null,
      forwardId: null,
      typing: {},
      callFilter: 'all',
    },
  };
}
