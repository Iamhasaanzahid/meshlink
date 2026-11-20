/* Calls tab: history, tiers, missed filter, new call. */
import { act, getState, contactById } from '../store.js';
import { icon, avatar, openModal, confirmDialog, toast } from '../ui.js';
import { esc, fmtListTime, fmtDuration } from '../utils.js';
import { openCall, callTierFor } from '../media/call.js';

export function renderCallsPage() {
  const s = getState();
  const filter = s.ui.callFilter || 'all';
  const calls = s.calls.filter((c) => filter === 'missed' ? c.status === 'missed' : true);
  const tier = callTierFor();
  return `<div class="page"><div class="page-inner">
    <div class="page-head"><div><div class="eyebrow">Adaptive audio engine</div><h1>Calls</h1><p>Global WebRTC, local hotspot P2P, or offline voice-note fallback.</p></div><div class="head-actions"><button class="btn primary" data-action="new-call">${icon('phone')} New call</button></div></div>
    <div class="card set-card" style="margin-bottom:18px;display:flex;gap:12px;align-items:center">
      <div class="si-ic" style="width:42px;height:42px">${icon(tier.icon)}</div>
      <div class="grow"><div style="font-weight:700;font-size:13px">Current call tier: ${esc(tier.name)}</div><div class="muted small">${esc(tier.sub)} · automatically selected from your network mode</div></div>
      <button class="btn sm" data-action="nav" data-view="settings">Change</button>
    </div>
    <div class="call-tabs"><button class="chip ${filter==='all'?'active':''}" data-action="call-filter" data-filter="all">All calls</button><button class="chip ${filter==='missed'?'active':''}" data-action="call-filter" data-filter="missed">Missed</button><button class="btn sm ghost" data-action="clear-calls" style="height:30px">Clear</button></div>
    <div class="card" style="padding:8px">
      ${calls.length?calls.map((c)=>{
        const u=contactById(c.peerId)||{name:'Unknown'};
        const missed=c.status==='missed';
        return `<div class="call-row" data-action="call-back" data-id="${c.peerId}" data-type="${c.type}">
          ${avatar(u,{size:'lg',online:!!u.online})}
          <div class="cr-main"><div class="nm">${esc(u.name)}</div><div class="meta ${missed?'missed':''}">${icon(missed?'phoneMissed':c.direction==='incoming'?'phoneIn':'phoneOut')} ${missed?'Missed':c.direction==='incoming'?'Incoming':'Outgoing'}${c.duration?` · ${fmtDuration(c.duration)}`:''}${c.tier?` · ${esc(c.tier)}`:''}</div></div>
          <span class="time">${esc(fmtListTime(c.at))}</span>
          <span class="icon-btn samll call-back" style="pointer-events:none">${icon(c.type==='video'?'video':'phone')}</span>
        </div>`;
      }).join(''):`<div class="empty-page">${icon('phone')}<h3>No calls yet</h3><p>Start a call from a chat or the New call button.</p></div>`}
    </div>
    <div class="page-section" style="margin-top:20px"><h3>How calling falls back</h3><div class="settings-grid" style="grid-template-columns:1fr 1fr 1fr">
      ${[['globe','Global VoIP','Internet available. WebRTC audio/video with adaptive Opus.'],['wifi','Local hotspot','No internet needed. LAN/hotspot signaling and P2P media.'],['clock','Offline relay','No live link. One-tap voice note enters the outbox with TTL.']].map(([ic,t,d])=>`<div class="card set-card"><div class="si-ic" style="margin-bottom:8px">${icon(ic)}</div><div style="font-weight:700;font-size:13px">${t}</div><div class="muted small" style="margin-top:3px">${d}</div></div>`).join('')}
    </div></div>
  </div></div>`;
}

export function openNewCall() {
  const s = getState();
  openModal({ title:'Start a call', subtitle: callTierFor().name, body:`<div style="max-height:380px;overflow:auto">${s.contacts.map((c)=>`<div class="set-row" style="padding:9px 0">${avatar(c,{size:'sm',online:!!c.online})}<div class="si-body"><div class="si-title">${esc(c.name)}</div><div class="si-sub">${esc(c.about||'')}</div></div><button class="icon-btn sm" data-v="${c.id}" title="Video call">${icon('video','sm')}</button><button class="icon-btn sm" data-a="${c.id}" title="Voice call">${icon('phone','sm')}</button></div>`).join('')}</div>`, footer:`<button class="btn sm" data-close>Cancel</button>`, onMount:(el,close)=>{ el.querySelectorAll('[data-a]').forEach((b)=>{ b.onclick=()=>{ close(); openCall(b.dataset.a,'voice'); }; }); el.querySelectorAll('[data-v]').forEach((b)=>{ b.onclick=()=>{ close(); openCall(b.dataset.v,'video'); }; }); } });
}

export function handleCallsAction(action, el) {
  if (action==='new-call') { openNewCall(); return true; }
  if (action==='call-filter') { act.setCallFilter(el.dataset.filter); return true; }
  if (action==='clear-calls') { confirmDialog({title:'Clear call history?',message:'This removes all call logs on this device.',confirmLabel:'Clear'}).then((ok)=>{ if (ok) { act.clearCalls(); toast('Call history cleared','success'); } }); return true; }
  if (action==='call-back') { openCall(el.dataset.id, el.dataset.type||'voice'); return true; }
  return false;
}
