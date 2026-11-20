/* Status / Updates: 24h expiring stories, viewer tracking, text + photo. */
import { act, getState, userOf } from '../store.js';
import { icon, avatar, openModal, confirmDialog, toast } from '../ui.js';
import { esc, fmtRelative, imageAsDataURL, uid } from '../utils.js';

const BGS = [
  'linear-gradient(145deg,#6d28d9,#c026d3)',
  'linear-gradient(145deg,#0f766e,#7c3aed)',
  'linear-gradient(145deg,#1e1b4b,#6d28d9)',
  'linear-gradient(145deg,#b45309,#db2777)',
  'linear-gradient(145deg,#0e7490,#4338ca)',
  'linear-gradient(145deg,#3f6212,#0f766e)',
];

export function renderStatusPage() {
  const state = getState();
  const mine = state.statuses.find((s) => s.userId === 'u_me');
  const others = state.statuses.filter((s) => s.userId !== 'u_me');
  return `<div class="page"><div class="page-inner">
    <div class="page-head"><div><div class="eyebrow">24 hours · auto-expiring</div><h1>Status</h1><p>Share a moment with your contacts. Viewers are tracked privately.</p></div><div class="head-actions"><button class="btn primary" data-action="add-status">${icon('plus')} Add status</button></div></div>
    <div class="card my-status-row" data-action="add-status">
      <div class="add-ring">${avatar(state.user||{name:'You'},{size:'lg'})}<span class="plus">${icon('plus')}</span></div>
      <div class="grow"><div style="font-weight:750">My status</div><div class="muted small">${mine?`${mine.items.length} update${mine.items.length>1?'s':''} · ${esc(fmtRelative(mine.createdAt))}`:'Tap to add a text or photo status'}</div></div>
      ${mine?`<button class="icon-btn" data-action="view-status" data-id="${mine.id}" title="View">${icon('eye')}</button>`:icon('chevronRight','sm')}
    </div>
    <div class="page-section"><h3>Recent updates</h3>
      ${others.length?`<div class="status-grid">${others.map((s)=>{
        const u=userOf(s.userId), first=s.items[0]||{};
        const bg=first.kind==='image'?`<div class="sc-bg"><img src="${esc(first.media?.src||'')}" alt=""></div>`:`<div class="sc-bg" style="background:${esc(first.bg||BGS[0])}"></div>`;
        return `<div class="status-card ${s.seen?'seen':''}" data-action="view-status" data-id="${s.id}">${bg}
          <div class="sc-top">${avatar(u,{size:'sm',ring:!s.seen})}<span class="nm">${esc(u.name.split(' ')[0])}</span><span class="tm">${esc(fmtRelative(s.createdAt))}</span></div>
          <div class="sc-bottom"><div class="sc-text">${esc(first.text||'Photo update')}</div>${s.seen?'':`<span class="sc-seen"></span>`}</div></div>`;
      }).join('')}</div>`:`<div class="status-empty">${icon('status')}<div>No recent updates. Your contacts' statuses appear here for 24 hours.</div></div>`}
    </div>
    <div class="page-section"><h3>About status</h3><div class="card set-card"><div class="set-row" style="padding:4px 0"><div class="si-ic">${icon('clock')}</div><div class="si-body"><div class="si-title">Expires automatically</div><div class="si-sub">Demo statuses expire after 24 hours and viewers are tracked per item.</div></div></div></div></div>
  </div></div>`;
}

export function openAddStatus() {
  let kind='text', bg=BGS[0], photo='';
  const modal = openModal({ title:'Add status', subtitle:'Expires in 24 hours', body:`
    <div class="auth-tabs" style="margin-bottom:14px"><button class="auth-tab active" data-kind="text">Text</button><button class="auth-tab" data-kind="image">Photo</button></div>
    <div id="st-text"><textarea class="textarea" id="status-caption" placeholder="What's on your mind?" style="min-height:110px"></textarea><div class="row" style="gap:6px;margin-top:10px">${BGS.map((g,i)=>`<button data-bg="${g}" style="width:34px;height:34px;border-radius:9px;background:${g};border:2px solid ${i===0?'#fff':'transparent'}"></button>`).join('')}</div></div>
    <div id="st-image" style="display:none"><div class="upload-zone" id="status-upload">${icon('upload')}<div>Choose a photo</div><input type="file" id="status-file" accept="image/*" hidden></div><img id="status-preview" class="preview-thumb" style="display:none;margin-top:10px" alt=""><textarea class="textarea" id="status-img-caption" placeholder="Add a caption…" style="min-height:64px;margin-top:10px"></textarea></div>`,
    footer:`<button class="btn sm" data-close>Cancel</button><button class="btn sm primary" id="status-publish">Publish</button>`,
    onMount:(el,close)=>{
      el.querySelectorAll('[data-kind]').forEach((b)=>{ b.onclick=()=>{ kind=b.dataset.kind; el.querySelectorAll('[data-kind]').forEach((x)=>x.classList.toggle('active',x===b)); el.querySelector('#st-text').style.display=kind==='text'?'':'none'; el.querySelector('#st-image').style.display=kind==='image'?'':'none'; }; });
      el.querySelectorAll('[data-bg]').forEach((b)=>{ b.onclick=()=>{ bg=b.dataset.bg; el.querySelectorAll('[data-bg]').forEach((x)=>x.style.borderColor='transparent'); b.style.borderColor='#fff'; }; });
      el.querySelector('#status-upload').onclick=()=>el.querySelector('#status-file').click();
      el.querySelector('#status-file').onchange=async(e)=>{ const f=e.target.files[0]; if (!f) return; photo=await imageAsDataURL(f,1200,0.82); const img=el.querySelector('#status-preview'); img.src=photo; img.style.display='block'; };
      el.querySelector('#status-publish').onclick=()=>{
        if (kind==='text') { const t=el.querySelector('#status-caption').value.trim(); if (!t) return toast('Write something first','error'); act.addStatus({items:[{kind:'text',text:t,bg}]}); }
        else { if (!photo) return toast('Choose a photo first','error'); act.addStatus({items:[{kind:'image',text:el.querySelector('#status-img-caption').value.trim(),media:{src:photo}}]}); }
        close(); toast('Status published','success');
      };
    } });
  void modal;
}

export function openStatusViewer(statusId) {
  const state=getState();
  const status=state.statuses.find((s)=>s.id===statusId);
  if (!status) return;
  act.viewStatus(statusId);
  const owner=userOf(status.userId);
  const mine=status.userId==='u_me';
  let index=0, timer=null;
  const wrap=document.createElement('div'); wrap.className='story-overlay';
  const root=document.getElementById('overlay-root'); root.appendChild(wrap);
  const close=()=>{ clearTimeout(timer); wrap.remove(); };
  const render=()=>{
    const item=status.items[index];
    if (!item) return close();
    wrap.innerHTML=`<div class="story-shell">
      <div class="story-progress">${status.items.map((_,i)=>`<div class="sp ${i<index?'done':''} ${i===index?'active':''}"><i></i></div>`).join('')}</div>
      <div class="story-head">${avatar(owner,{size:'sm'})}<div class="grow"><div class="nm">${esc(owner.name)}${mine?' (you)':''}</div><div class="tm">${esc(fmtRelative(item.createdAt||status.createdAt))}</div></div><button class="icon-btn" data-close style="color:#fff">${icon('x')}</button></div>
      <div class="story-canvas ${item.kind==='image'?'has-media':''}" style="background:${item.kind==='image'?'#05020c':esc(item.bg||BGS[0])}">
        ${item.kind==='image'?`<img src="${esc(item.media?.src||'')}" alt="">`:`<div class="story-text">${esc(item.text||'')}</div>`}
        <div class="story-nav"><button data-prev aria-label="Previous"></button><button data-next aria-label="Next"></button></div>
      </div>
      <div class="story-foot">${mine?`<div class="story-views">${icon('eye')} ${status.viewers.length} viewer${status.viewers.length===1?'':'s'}${status.viewers.length?` · ${esc(status.viewers.map((id)=>userOf(id).name.split(' ')[0]).join(', '))}`:''}</div><button class="btn sm" data-delete>${icon('trash','sm')} Delete</button>`:`<div class="story-views">${icon('eye')} ${status.viewers.includes('u_me')?'Seen':'Not seen'}</div><div class="story-reply"><input id="story-reply" placeholder="Reply privately…"><button class="send-btn" data-reply>${icon('send')}</button></div>`}</div>
    </div>`;
    clearTimeout(timer);
    timer=setTimeout(()=>{ if (index<status.items.length-1) { index++; render(); } else close(); },5000);
    wrap.querySelector('[data-close]').onclick=close;
    wrap.querySelector('[data-prev]').onclick=(e)=>{ e.stopPropagation(); if (index>0) { index--; render(); } };
    wrap.querySelector('[data-next]').onclick=(e)=>{ e.stopPropagation(); if (index<status.items.length-1) { index++; render(); } else close(); };
    if (mine) wrap.querySelector('[data-delete]').onclick=async()=>{ if (await confirmDialog({title:'Delete status?',message:'This will remove your status updates.',confirmLabel:'Delete'})) { act.deleteStatus(status.id); close(); } };
    else {
      const send=()=>{ const input=wrap.querySelector('#story-reply'); const t=input.value.trim(); if (!t) return; const chat=act.startDm(status.userId); if (chat) act.sendMessage({chatId:chat.id,text:`↩︎ Status: ${t}`}); close(); toast('Reply sent','success'); };
      wrap.querySelector('[data-reply]').onclick=send;
      wrap.querySelector('#story-reply').onkeydown=(e)=>{ if (e.key==='Enter') send(); };
    }
  };
  render();
}
