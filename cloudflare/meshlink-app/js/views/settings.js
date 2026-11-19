/* Settings: profile, appearance, network simulator, privacy, outbox, data. */
import { act, getState, contactById, starredMessages } from '../store.js';
import { icon, avatar, openModal, confirmDialog, toast } from '../ui.js';
import { esc, downloadJson, formatMeshId } from '../utils.js';
import { securitySummary } from '../security.js';
import { NET_MODES, getNetMode, netState } from '../transport/connectivity.js';
import { outboxOf, OUTBOX_TTL } from '../transport/offlineQueue.js';

export function renderSettingsPage() {
  const s = getState();
  const u = s.user || { name: 'Guest', about: '' };
  const outbox = outboxOf(s.messages);
  const prefs = s.settings;
  const sec = securitySummary();
  return `<div class="page"><div class="page-inner">
    <div class="page-head"><div><div class="eyebrow">Your MeshLink</div><h1>Settings</h1><p>Profile, appearance, network mode, privacy and data.</p></div><div class="head-actions"><button class="btn" data-action="logout">${icon('logout')} Log out</button></div></div>
    <div class="settings-grid"><div class="settings-col">
      <div class="card set-card"><h2>Profile</h2><p class="sub">This is how you appear to contacts.</p>
        <div class="profile-editor"><div class="pe-top">${avatar(u,{size:'lg',online:true})}<div class="grow"><div style="font-weight:750">${esc(u.name)}</div><div class="muted small">${esc(formatMeshId(u.meshId || s.auth.meshId))}</div></div><button class="btn sm" data-action="edit-profile">${icon('edit','sm')} Edit</button></div>
        <div class="auth-note">${icon('info')} ${esc(u.about||'Add an about line')}</div></div>
      </div>
      <div class="card set-card"><h2>Security & privacy</h2><p class="sub">Your vault is encrypted locally. No phone number, email or cloud account is required.</p>
        <div class="security-banner"><div class="sb-ic">${icon('shield','lg')}</div><div class="grow"><div style="font-weight:750;font-size:13px">${sec.pin?'PIN lock enabled':'Device key protection active'}</div><div class="muted small">${esc(sec.cipher)} · ${esc(sec.kdf)} · offline-first</div></div></div>
        <div class="set-row"><div class="si-ic">${icon('key')}</div><div class="si-body"><div class="si-title">MeshLink ID</div><div class="si-sub">Auto-generated 10-digit identity · never your real number</div></div><button class="btn sm" data-action="copy-mesh-id">${icon('copy','sm')} Copy</button></div>
        <div class="set-row"><div class="si-ic">${icon('lock')}</div><div class="si-body"><div class="si-title">App PIN</div><div class="si-sub">${sec.pin?'Unlock required in a new tab or after 5 minutes':'Add a 6-digit PIN for a second layer'}</div></div>${sec.pin?`<button class="btn sm" data-action="remove-pin">Remove</button>`:`<button class="btn sm" data-action="set-pin">Set PIN</button>`}</div>
        <div class="set-row"><div class="si-ic">${icon('eye')}</div><div class="si-body"><div class="si-title">App lock</div><div class="si-sub">Instantly hide chats and require your PIN.</div></div><button class="btn sm" data-action="lock-app">${icon('lock','sm')} Lock now</button></div>
      </div>
      <div class="card set-card"><h2>Appearance</h2><p class="sub">Theme and chat wallpaper are saved on this device.</p>
        <div class="theme-cards"><button class="theme-card ${prefs.theme==='dark'?'active':''}" data-action="set-theme" data-theme="dark"><div class="tc-preview"><div class="p1"></div><div class="p2"></div></div><div class="tc-name">${icon('moon')} Dark purple</div></button><button class="theme-card light ${prefs.theme==='light'?'active':''}" data-action="set-theme" data-theme="light"><div class="tc-preview"><div class="p1"></div><div class="p2"></div></div><div class="tc-name">${icon('sun')} Light lavender</div></button></div>
        <div class="wallpaper-grid" style="margin-top:12px">${[['aurora','Aurora'],['dune','Dune'],['grid','Grid'],['paper','Paper']].map(([id,l])=>`<button class="wp-swatch wp-${id} ${prefs.wallpaper===id?'active':''}" data-action="set-wallpaper" data-id="${id}"><span>${l}</span></button>`).join('')}</div>
      </div>
      <div class="card set-card"><h2>Notifications & sounds</h2>
        <div class="set-row"><div class="si-ic">${icon('bell')}</div><div class="si-body"><div class="si-title">Browser notifications</div><div class="si-sub">Only while the tab is in the background.</div></div><button class="btn sm" data-action="enable-notifications" id="notif-btn">${typeof Notification!=='undefined' && Notification.permission==='granted'?'Enabled':'Enable'}</button></div>
        <div class="set-row"><div class="si-ic">${icon('volume')}</div><div class="si-body"><div class="si-title">Message sounds</div><div class="si-sub">Subtle chime on incoming messages.</div></div><button class="switch ${prefs.sound?'':''}" role="switch" aria-checked="${!!prefs.sound}" data-action="toggle-setting" data-key="sound"></button></div>
        <div class="set-row"><div class="si-ic">${icon('sparkles')}</div><div class="si-body"><div class="si-title">Demo replies</div><div class="si-sub">Contacts reply automatically so you can test flows.</div></div><button class="switch" role="switch" aria-checked="${!!prefs.demoReplies}" data-action="toggle-setting" data-key="demoReplies"></button></div>
      </div>
    </div><div class="settings-col">
      <div class="card set-card"><h2>Network mode</h2><p class="sub">Simulate every fallback state. Current: <b style="color:var(--accent-3)">${esc(netState().short)}</b></p>
        <div class="stack" style="gap:7px">${NET_MODES.map((m)=>`<button class="set-row" data-action="set-net" data-mode="${m.id}" style="text-align:left;border:1px solid ${getNetMode()===m.id?'var(--accent)':'var(--line)'};border-radius:12px;padding:9px 10px"><div class="si-ic">${icon(m.id==='online'?'globe':m.id==='local'?'wifi':m.id==='offline'?'clock':'sparkles')}</div><div class="si-body"><div class="si-title">${esc(m.label)}</div><div class="si-sub">${esc(m.desc)}</div></div>${getNetMode()===m.id?icon('check','sm'):''}</button>`).join('')}</div>
      </div>
      <div class="card set-card"><h2>Offline outbox</h2><p class="sub">${outbox.length} queued message${outbox.length===1?'':'s'} · TTL ${OUTBOX_TTL/3600000}h</p>
        ${outbox.length?outbox.slice(0,4).map((m)=>`<div class="set-row" style="padding:7px 0"><div class="si-ic">${icon('clock')}</div><div class="si-body"><div class="si-title">${esc(m.lastMessage||m.text||'Queued message')}</div><div class="si-sub">expires ${new Date(m.expiresAt||Date.now()).toLocaleString()}</div></div></div>`).join(''):'<div class="muted small">Nothing queued. Send a message in “Completely offline” mode to test.</div>'}
        <div class="row" style="gap:8px;margin-top:10px"><button class="btn sm grow" data-action="flush-outbox">${icon('wifi','sm')} Sync now</button><button class="btn sm grow" data-action="set-net" data-mode="online">${icon('globe','sm')} Go online</button></div>
      </div>
      <div class="card set-card"><h2>Privacy</h2>
        <div class="set-row"><div class="si-ic">${icon('checkCheck')}</div><div class="si-body"><div class="si-title">Read receipts</div><div class="si-sub">Show blue ticks for messages you read.</div></div><button class="switch" role="switch" aria-checked="${!!prefs.readReceipts}" data-action="toggle-setting" data-key="readReceipts"></button></div>
        <div class="set-row"><div class="si-ic">${icon('eye')}</div><div class="si-body"><div class="si-title">Last seen</div><div class="si-sub">Hide your presence and others' last seen.</div></div><button class="switch" role="switch" aria-checked="${!!prefs.lastSeenVisible}" data-action="toggle-setting" data-key="lastSeenVisible"></button></div>
        <div class="set-row"><div class="si-ic">${icon('shield')}</div><div class="si-body"><div class="si-title">Blocked contacts</div><div class="si-sub">${s.blocked.length} blocked</div></div><button class="btn sm" data-action="manage-blocked">Manage</button></div>
      </div>
      <div class="card set-card"><h2>Data & storage</h2>
        <div class="set-row"><div class="si-ic">${icon('download')}</div><div class="si-body"><div class="si-title">Export backup</div><div class="si-sub">Chats, messages, statuses and calls as JSON.</div></div><button class="btn sm" data-action="export">Export</button></div>
        <div class="set-row"><div class="si-ic">${icon('trash')}</div><div class="si-body"><div class="si-title">Reset demo</div><div class="si-sub">Clears local storage and restores seeded data.</div></div><button class="btn sm danger" data-action="reset-demo">Reset</button></div>
      </div>
      <div class="card set-card"><h2>About</h2><div class="about-line">${icon('shield')} MeshLink Web · hybrid messenger + 3-tier calls</div><div class="about-line">${icon('wifi')} Global WebSocket relay · LAN mesh · offline outbox</div><div class="about-line">${icon('lock')} Data stays encrypted in this browser's local vault</div><div class="about-line">${icon('sparkles')} ${starredMessages().length} starred messages</div></div>
    </div></div>
  </div></div>`;
}

export function openProfileEditor() {
  const s = getState(), u = s.user || {};
  let photo = u.avatar || '';
  openModal({ title:'Edit profile', subtitle:'Name, photo and about', body:`<div class="stack" style="align-items:center;gap:10px;margin-bottom:14px"><div id="pe-av">${avatar({...u,avatar:photo},{size:'xl'})}</div><button class="btn sm" id="pe-photo">${icon('upload','sm')} Change photo</button><input type="file" id="pe-file" accept="image/*" hidden></div>
    <div class="field" style="margin-bottom:10px"><label>Name</label><input class="input" id="pe-name" value="${esc(u.name||'')}"></div>
    <div class="field" style="margin-bottom:10px"><label>About</label><input class="input" id="pe-about" value="${esc(u.about||'')}"></div>
    <div class="auth-note">${icon('key')} MeshLink ID <b style="color:var(--accent-3)">${esc(formatMeshId(u.meshId || getState().auth.meshId))}</b> is assigned by the app and cannot be changed.</div>`, footer:`<button class="btn sm" data-close>Cancel</button><button class="btn sm primary" id="pe-save">Save</button>`, onMount:(el,close)=>{
      el.querySelector('#pe-photo').onclick=()=>el.querySelector('#pe-file').click();
      el.querySelector('#pe-file').onchange=async(e)=>{ const f=e.target.files[0]; if (!f) return; const r=new FileReader(); r.onload=()=>{ photo=String(r.result); el.querySelector('#pe-av').innerHTML=avatar({...u,avatar:photo},{size:'xl'}); }; r.readAsDataURL(f); };
      el.querySelector('#pe-save').onclick=()=>{ act.updateProfile({name:el.querySelector('#pe-name').value.trim()||'MeshLink user',about:el.querySelector('#pe-about').value.trim(),avatar:photo}); close(); toast('Profile updated','success'); };
    } });
}

export function openBlockedManager() {
  const s = getState();
  openModal({ title:'Blocked contacts', subtitle:`${s.blocked.length} blocked`, body: s.blocked.length?s.blocked.map((id)=>{ const u=contactById(id)||{name:id}; return `<div class="blocked-row">${avatar(u,{size:'sm'})}<div class="nm">${esc(u.name)}</div><button class="btn sm" data-unblock="${id}">Unblock</button></div>`; }).join(''):'<div class="muted small">Nobody is blocked. Use a contact info panel to block them.</div>', footer:`<button class="btn sm" data-close>Close</button>`, onMount:(el)=>{ el.querySelectorAll('[data-unblock]').forEach((b)=>{ b.onclick=()=>{ act.unblockPeer(b.dataset.unblock); b.closest('.blocked-row').remove(); toast('Contact unblocked','success'); }; }); } });
}

function openPinSetup() {
  openModal({ title:'Create app PIN', subtitle:'6 digits · encrypts your local vault', body:`<div class="field"><label>New PIN</label><input class="input pin-input" id="new-pin" type="password" inputmode="numeric" maxlength="6" placeholder="••••••"></div><div class="field"><label>Confirm PIN</label><input class="input pin-input" id="confirm-pin" type="password" inputmode="numeric" maxlength="6" placeholder="••••••"></div><div class="auth-note">${icon('lock')} Store this PIN safely. If you forget it, you can reset this device with a new MeshLink ID.</div>`, footer:`<button class="btn sm" data-close>Cancel</button><button class="btn sm primary" id="save-pin">Enable PIN</button>`, onMount:(el,close)=>{
    el.querySelector('#save-pin').onclick=async()=>{
      const a=el.querySelector('#new-pin').value.trim(), b=el.querySelector('#confirm-pin').value.trim();
      if (!/^\d{6}$/.test(a)) return toast('PIN must be exactly 6 digits','error');
      if (a!==b) return toast('PINs do not match','error');
      await act.enablePin(a); close(); toast('App PIN enabled · vault re-encrypted','success');
    };
  }});
}

export function handleSettingsAction(action, el) {
  if (action==='set-theme') { act.setTheme(el.dataset.theme); return true; }
  if (action==='copy-mesh-id') { const id=String(getState().user?.meshId||getState().auth.meshId||''); navigator.clipboard?.writeText(id).then(()=>toast('MeshLink ID copied','success')).catch(()=>toast(id,'success')); return true; }
  if (action==='set-pin') { openPinSetup(); return true; }
  if (action==='remove-pin') { confirmDialog({title:'Remove app PIN?',message:'The vault will be protected by the device key only.',confirmLabel:'Remove PIN'}).then(async(ok)=>{ if(ok){ await act.disablePin(); toast('App PIN removed','success'); } }); return true; }
  if (action==='set-wallpaper') { act.setWallpaper(el.dataset.id); return true; }
  if (action==='toggle-setting') { const key=el.dataset.key; act.setSetting(key, !getState().settings[key]); return true; }
  if (action==='set-net') { act.setNetworkMode(el.dataset.mode); toast(`Network: ${el.dataset.mode}`,'success'); return true; }
  if (action==='flush-outbox') { const n=act.flushOutbox(); toast(n?`${n} message${n>1?'s':''} synced`:'Nothing to sync or still offline', n?'success':'error'); return true; }
  if (action==='edit-profile') { openProfileEditor(); return true; }
  if (action==='manage-blocked') { openBlockedManager(); return true; }
  if (action==='logout') { confirmDialog({title:'Log out?',message:'Your local data stays on this device. Use demo login to return.',confirmLabel:'Log out'}).then((ok)=>{ if (ok) act.logout(); }); return true; }
  if (action==='reset-demo') { confirmDialog({title:'Reset demo?',message:'All local chats, media and settings will be cleared.',confirmLabel:'Reset'}).then((ok)=>{ if (ok) { act.resetDemo(); toast('Demo reset','success'); } }); return true; }
  if (action==='export') { downloadJson(act.exportData(), 'meshlink-backup.json'); toast('Backup exported','success'); return true; }
  if (action==='enable-notifications') { if (!('Notification' in window)) return toast('Notifications unsupported','error'); Notification.requestPermission().then((p)=>{ toast(p==='granted'?'Notifications enabled':'Permission denied', p==='granted'?'success':'error'); if (el) el.textContent=p==='granted'?'Enabled':'Blocked'; }); return true; }
  return false;
}
