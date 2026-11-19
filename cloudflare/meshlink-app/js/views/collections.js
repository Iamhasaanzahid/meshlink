/* Starred messages and archived chats. */
import { act, getState, starredMessages, sortedChats, chatTitle, chatAvatarUser, chatById } from '../store.js';
import { icon, avatar, toast, confirmDialog } from '../ui.js';
import { esc, fmtTime, fmtListTime, previewOf } from '../utils.js';

export function renderStarredPage() {
  const list = starredMessages();
  return `<div class="page"><div class="page-inner">
    <div class="page-head"><div><div class="eyebrow">Saved for later</div><h1>Starred</h1><p>${list.length} saved message${list.length===1?'':'s'} across your chats.</p></div></div>
    ${list.length?`<div class="starred-list">${list.map((m)=>{ const c=chatById(m.chatId); return `<div class="card star-card" data-action="open-star" data-id="${m.id}"><div class="sc-meta"><span class="tag purple">${esc(c?chatTitle(c):'Chat')}</span><span class="sc-chat"></span><span class="sc-time">${fmtTime(m.createdAt)}</span><button class="icon-btn sm" data-action="unstar" data-id="${m.id}" title="Unstar">${icon('star','sm')}</button></div><div class="sc-msg">${esc(m.text||previewOf(m))}</div></div>`; }).join('')}</div>`:`<div class="empty-page">${icon('star')}<h3>No starred messages</h3><p>Long-press or right-click any message and choose “Star message”.</p></div>`}
  </div></div>`;
}

export function renderArchivedPage() {
  const list = sortedChats({ archived: true });
  return `<div class="page"><div class="page-inner">
    <div class="page-head"><div><div class="eyebrow">Out of the way</div><h1>Archived</h1><p>${list.length} archived conversation${list.length===1?'':'s'}.</p></div></div>
    ${list.length?`<div class="card" style="padding:8px">${list.map((c)=>`<div class="archive-row" data-action="open-archived" data-id="${c.id}">${avatar(chatAvatarUser(c),{size:'sm'})}<div class="ar-body"><div class="ar-name">${esc(chatTitle(c))}</div><div class="ar-preview">${esc(c.lastMessage||'')}</div></div><span class="muted small">${fmtListTime(c.lastAt)}</span><button class="btn sm" data-action="unarchive" data-id="${c.id}">${icon('archive','sm')} Unarchive</button></div>`).join('')}</div>`:`<div class="empty-page">${icon('archive')}<h3>Nothing archived</h3><p>Archive a chat from its menu to hide it from the main list.</p></div>`}
  </div></div>`;
}

export function handleCollectionsAction(action, el) {
  if (action==='open-star') { const m=getState().messages.find((x)=>x.id===el.dataset.id); if (m) { act.openChat(m.chatId); act.highlight(m.id); } return true; }
  if (action==='unstar') { act.starMessage(el.dataset.id); toast('Removed from starred','success'); return true; }
  if (action==='open-archived') { act.openChat(el.dataset.id); return true; }
  if (action==='unarchive') { act.toggleArchive(el.dataset.id); toast('Chat unarchived','success'); return true; }
  return false;
}
