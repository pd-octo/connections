// Demo data connection, helpers, state and shared option lists
/* ===================== Supabase (demo data) ===================== */
const SB_URL = 'https://ewclbvhbixbhyrvkqiyc.supabase.co';
const SB_KEY = 'sb_publishable_tYpg2mmyBcksjbU8CcZRew_elYK3Sir';
async function sbGet(table, query){
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {headers:{apikey:SB_KEY, Authorization:`Bearer ${SB_KEY}`}});
  if(!r.ok) throw new Error(`Demo data error (${r.status})`);
  return r.json();
}
async function sbInsert(table, row){
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, {method:'POST', headers:{apikey:SB_KEY, Authorization:`Bearer ${SB_KEY}`, 'Content-Type':'application/json', Prefer:'return=minimal'}, body:JSON.stringify(row)});
  if(!r.ok) throw new Error(`Couldn't save (${r.status})`);
}
const enc = encodeURIComponent;

/* ===================== Helpers ===================== */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normPC = s => String(s||'').toUpperCase().replace(/\s+/g,'').replace(/^(.+)(\d[A-Z]{2})$/,'$1 $2');
const PC_RE = /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i;
const todayISO = () => new Date().toISOString().slice(0,10);
const addDays = n => { const d = new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
const fmtDate = iso => iso ? new Date(iso+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}) : '';
const addrText = a => a ? [a.line1,a.line2,a.town,a.postcode].filter(Boolean).join(', ') : '';
const store = {
  get(k){ try{ return JSON.parse(localStorage.getItem(k)); }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} }
};
function toast(msg){ const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),3200); }

/* ===================== State ===================== */
const WORK = {new_connection:'New connection', meter_move:'Meter move', upgrade:'Supply upgrade', downgrade:'Supply downgrade'};
const settings = Object.assign({showIds:false, nonDomestic:false, partialFailure:false}, store.get('cx-demo-settings')||{});
let state = freshState();
const cache = {};           // async look up results for the current screen
const files = {};           // uploaded File objects by answer key (for previews only)
function freshState(){ return {path:[{id:'A1', p:null}], answers:{}, user:null, accounts:[], returnToSummary:false, flash:null, submitted:null}; }
const K = (id,p) => p==null ? id : `P${p}.${id}`;
const cur = () => state.path[state.path.length-1];
const onPath = (id,p) => state.path.some(e => e.id===id && e.p===p);
// answer for a question only if it is on the current route (branching clears answers that no longer apply)
const pa = (id,p=null) => onPath(id,p) ? state.answers[K(id,p)] : undefined;
const pv = (id,p=null) => { const a = pa(id,p); return a && typeof a==='object' && 'v' in a ? a.v : a; };
const work = () => pv('A2');
const isNC = () => work()==='new_connection';
const fuelsOf = v => v==='both' ? ['electricity','gas'] : v ? [v] : [];
function chosenFuels(p){
  if(isNC()) return fuelsOf(pv('C1',p));
  return fuelsOf(pv({meter_move:'D1',upgrade:'E1',downgrade:'F1'}[work()]));
}
const propsOnPath = () => [...new Set(state.path.filter(e=>e.p!=null).map(e=>e.p))];

/* ===================== Shared option lists ===================== */
const FUEL_OPTS = [{v:'electricity',label:'Electricity'},{v:'gas',label:'Gas'},{v:'both',label:'Both'}];
const YN = [{v:'yes',label:'Yes'},{v:'no',label:'No'}];
const YNU = [{v:'yes',label:'Yes'},{v:'no',label:'No'},{v:'unsure',label:"I'm not sure"}];
const DNO_ARRANGED = [
  {v:'date',label:"Yes, they've given me a date"},
  {v:'contacted',label:"I've contacted them, but don't have a date yet"},
  {v:'not_yet',label:'No, not yet'}];
const LOCATION = [{v:'outside',label:'In a box outside'},{v:'inside',label:'On a wall or floor inside'}];
const DISTANCE = [{v:'under1',label:'Under 1 metre on the same wall'},{v:'over1',label:'Over 1 metre or a different wall'},{v:'through',label:'To the other side of a wall'}];
const FUSE = [{v:'60',label:'60 amp'},{v:'80',label:'80 amp'},{v:'100',label:'100 amp'},{v:'over100',label:'Over 100 amp'},{v:'unknown',label:"I don't know"}];
const validCT = s => /^\d{2,5}\s*\/\s*\d{1,2}$/.test(s) ? '' : 'Enter the CT ratio like 200/5';
const validNum = (min,max,unit) => s => (/^\d+(\.\d+)?$/.test(s) && +s>=min && +s<=max) ? '' : `Enter a number between ${min} and ${max}${unit?' '+unit:''}`;
const validWhole = (min,max,unit) => s => (/^\d+$/.test(s) && +s>=min && +s<=max) ? '' : `Enter a whole number between ${min} and ${max} ${unit}`;
const IMG = 'image/*', DOC = 'image/*,application/pdf';
const example = txt => `<div class="example">📷 ${esc(txt)}<br><span class="small">(example image goes here)</span></div>`;

/* ===================== Stages ===================== */
const STAGE_LABEL = {work:'About the work', details:'Your details', property:'Property', electricity:'Electricity supply', gas:'Gas supply', visit:'About the visit', review:'Review'};
function stagesFor(){
  const p = cur().p ?? propsOnPath().slice(-1)[0] ?? 0;
  const f = chosenFuels(p);
  const fuelStages = (f.length ? f : ['electricity','gas']);
  if(!work() || isNC()) return ['work','details','property', ...fuelStages, 'visit','review'];
  return ['work','details', ...fuelStages, 'visit','review'];
}
