// Statuses, Kraken outcome, screens and the demo tools panel
/* ===================== MPAN / MPRN checks ===================== */
function lookupOf(id,p){ return state.answers[K(id,p)+'#lookup']; }
function mpxnOK(c,id){
  const a = c.a(id); const l = lookupOf(id,c.p);
  return a?.v==='yes' && l?.found && l.status==='new_connection' && l.postcodeMatch;
}
async function runLookup(node, p, value){
  const key = K(node.id,p)+'#lookup';
  if(value.v!=='yes'){ delete state.answers[key]; return; }
  const mpxn = value.x.replace(/\s/g,'');
  const rows = await sbGet('meter_points', `mpxn=eq.${enc(mpxn)}&fuel=eq.${node.lookup}&select=*`);
  const pc = normPC(pv('C2',p));
  const r = rows[0];
  state.answers[key] = r ? {
    found:true, mpxn, status:r.status, supplier:r.supplier, kraken_owner:r.kraken_owner,
    address:{line1:r.line1, line2:r.line2, town:r.town, postcode:normPC(r.postcode)},
    postcodeMatch: normPC(r.postcode)===pc
  } : {found:false, mpxn};
}
// confirmed address for a fuel at a property
function fuelAddress(p, fuel){
  if(fuel==='electricity'){
    if(pv('C4',p)==='yes') return lookupOf('C3',p).address;
    return pa('C5',p);
  }
  if(pv('C16',p)==='yes') return lookupOf('C15',p).address;
  const a = pa('C17',p);
  if(a?.source==='same') return fuelAddress(p,'electricity');
  return a;
}
function verified(p, fuel){
  const [qid,cid] = fuel==='electricity' ? ['C3','C4'] : ['C15','C16'];
  const l = lookupOf(qid,p);
  return pv(qid,p)==='yes' && l?.found && l.status==='new_connection' && l.postcodeMatch && pv(cid,p)==='yes';
}

/* ===================== Per-fuel status ===================== */
const WAIT_RULES = {
  new_connection:{electricity:p=>pv('C6',p)==='not_contacted', gas:p=>pv('C18',p)==='not_contacted'},
  meter_move:{electricity:()=>['contacted','not_yet'].includes(pv('D4')), gas:()=>['contacted','not_yet'].includes(pv('D10'))},
  upgrade:{electricity:()=>['contacted','not_yet'].includes(pv('E8')), gas:()=>false},
  downgrade:{electricity:()=>['contacted','not_yet'].includes(pv('F3')), gas:()=>false}
};
function flagsFor(p, fuel){
  const out = [];
  for(const e of state.path){
    const n = N[e.id];
    if(e.p!==p || n.fuel!==fuel || !n.flagOn) continue;
    const v = pv(e.id,e.p);
    if(n.flagOn.includes(v)) out.push(`${e.id}: ${n.options.find(o=>o.v===v)?.label}`);
  }
  return out;
}
function upgradeType(){
  const e2 = pv('E2'), fuse = pv('E2a'), meter = state.selectedAccount?.elec_meter || '';
  if(['network_said','unsure'].includes(e2) || fuse==='unknown') return 'Unclear – specialist review';
  const over = fuse==='over100';
  if(/^Single phase/.test(meter)) return over ? 'Single → three phase (CT)' : 'Single → three phase (whole current)';
  if(/^Three phase whole current/.test(meter) && over) return 'Three phase whole current → CT';
  return 'Unclear – specialist review';
}

// Works out everything the Kraken Flow would do after submission
function outcome(){
  const res = {route:null, items:[]};
  const w = work(); if(!w) return res;
  const loggedIn = !!state.user;
  const emailMatch = state.emailMatch;   // customer row matched by the B5 email (not logged in)
  if(w==='new_connection'){
    if(loggedIn){
      const many = state.user.portfolio_users > 1;
      res.route = many ? {code:'S2', text:'Create a new portfolio with just the new account, linked to this user.'}
                       : {code:'S1', text:'Create a new account in their existing portfolio.'};
    } else if(pv('B5')){
      if(!emailMatch) res.route = {code:'S3', text:'Create a new user, portfolio and account.'};
      else if(emailMatch.portfolio_users > 1) res.route = {code:'S5', reason:'EMAIL_MATCHED', text:'Create a new portfolio with just the new account, linked to this user.'};
      else res.route = {code:'S4', reason:'EMAIL_MATCHED', text:"Create a new account in their existing portfolio. Don't create a second user."};
    }
  } else if(state.selectedAccount){
    res.route = {code:'Attach', text:`Attach to account ${state.selectedAccount.account_number}; store answers, files and per-fuel status; trigger the ${WORK[w]} Kraken Flow.`};
  }
  const props = w==='new_connection' ? propsOnPath() : [null];
  for(const p of props){
    for(const fuel of chosenFuels(p)){
      const it = {p, fuel, flags:flagsFor(p,fuel), waiting:WAIT_RULES[w][fuel](p)};
      if(w==='new_connection'){
        const qid = fuel==='electricity' ? 'C3' : 'C15';
        const l = lookupOf(qid,p);
        it.address = fuelAddress(p,fuel);
        if(settings.partialFailure){ it.s='S10'; it.reason='PARTIAL_FAILURE'; it.kraken='Something failed part way. Use the account already created as the shell.'; it.hold=true; }
        else if(l?.found && pv(qid,p)==='yes' && l.kraken_owner==='other_customer'){ it.s='S7'; it.reason='MPXN_OTHER_CUSTOMER'; it.kraken="Create a shell account with the request info. Don't touch the other customer's account."; it.hold=true; }
        else if(l?.found && pv(qid,p)==='yes' && l.supplier){ it.s='S8'; it.reason='MPXN_OTHER_SUPPLIER'; it.kraken=`Create a shell account. ECOES/Xoserve shows ${l.supplier} registered.`; it.hold=true; }
        else if(!verified(p,fuel)){ it.s='S9'; it.reason='MPXN_NOT_VERIFIED'; it.kraken='Create a shell account with the request info. Team finds the MPAN/MPRN as today.'; }
        else if(!loggedIn && emailMatch){ it.s='S11'; it.reason='EMAIL_MATCHED'; it.kraken='Email matched but not logged in: never auto-enrol, treat as a shell.'; }
        else { it.s='S6'; it.kraken=`Create the account with the property and enrol ${fuel==='electricity'?'MPAN':'MPRN'} ${l.mpxn}.`; }
      } else {
        it.address = state.selectedAccount && {line1:state.selectedAccount.line1, town:state.selectedAccount.town, postcode:state.selectedAccount.postcode};
        if(w==='upgrade' && fuel==='electricity') it.upgradeType = upgradeType();
        if(it.upgradeType==='Unclear – specialist review' && !it.flags.length) it.flags.push('Upgrade type unclear from current meter');
      }
      // Customer-facing status. Waiting comes first because the customer has something to do.
      it.status = it.waiting ? 'waiting' : (it.flags.length || it.hold) ? 'specialist' : 'ready';
      res.items.push(it);
    }
  }
  return res;
}
const STATUS = {
  ready:{label:'Ready for review', text:"We've received your request. Our team will check it and contact you to book. Nothing is booked yet."},
  waiting:{label:'Waiting for network operator', text:null},
  specialist:{label:'Needs specialist review', text:"We've received your details, but need to check a few things before we can confirm. We'll be in touch."}
};

/* ===================== Network operators ===================== */
function currentPostcode(p){
  if(isNC()) return pv('C2', p ?? 0);
  return state.selectedAccount?.postcode;
}
async function networkOperator(pc){
  const area = (normPC(pc).match(/^[A-Z]+/)||[''])[0];
  if(!area) return null;
  const k = 'no:'+area;
  if(!(k in cache)) cache[k] = (await sbGet('network_operators', `postcode_area=eq.${enc(area)}&select=*`))[0] || null;
  return cache[k];
}
function waitingText(no, fuel){
  const name = fuel==='electricity' ? (no?.dno_name || 'your electricity network operator') : (no?.gdn_name || 'your gas network operator');
  const url = fuel==='electricity' ? no?.dno_url : no?.gdn_url;
  const what = {
    new_connection: fuel==='electricity' ? 'the incoming cable and cut-out' : 'the incoming pipework and emergency control valve',
    meter_move: `the work needed to move your ${fuel} meter`,
    upgrade: 'the supply upgrade',
    downgrade: 'the supply downgrade'}[work()];
  return `Contact ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(name)}</a>` : esc(name)} to arrange ${esc(what)}. We'll email you in 2 weeks.`;
}

/* ===================== Rendering ===================== */
const app = document.getElementById('app');
function ctxFor(e){
  return {p:e.p, a:id=>state.answers[K(id, scopeOf(id,e.p))], v:id=>{ const x = state.answers[K(id, scopeOf(id,e.p))]; return x && typeof x==='object' && 'v' in x ? x.v : x; }};
}
// A, B, D, E, F, G1 and G8–G10 are asked once; C and G2–G7 are asked per property for new connections
function scopeOf(id,p){
  if(/^C/.test(id) || (isNC() && /^G[2-7]$/.test(id))) return p;
  return null;
}
function titleOf(n, c){ return typeof n.title==='function' ? n.title(c) : n.title; }
function qid(id){ return settings.showIds ? `<span class="qid">${esc(id)}</span>` : ''; }

async function render(){
  const e = cur(), n = N[e.id], c = ctxFor(e);
  renderProgress(n, e);
  if(n.load){ app.innerHTML = '<div class="spinner"></div>'; }
  let data = null;
  try { data = n.load ? await n.load(c) : null; }
  catch(err){ app.innerHTML = `<div class="warnbox"><strong>Couldn't load demo data</strong><p>${esc(err.message)}. Check your connection and try again.</p></div><div class="actions"><button class="btn" onclick="render()">Try again</button></div>`; return; }
  if(cur()!==e) return;
  const html = (TYPES[n.type].html)(n, c, data);
  app.innerHTML = html;
  TYPES[n.type].mount?.(n, c, data);
  wireCommon(n, c, data);
  renderDemo();
  window.scrollTo({top:0});
  const first = app.querySelector('h1,h2'); if(first){ first.setAttribute('tabindex','-1'); first.focus({preventScroll:true}); }
}

function renderProgress(n, e){
  const el = document.getElementById('progress');
  if(n.id==='A1' || n.type==='end'){ el.innerHTML=''; return; }
  const stages = stagesFor();
  const idx = stages.indexOf(n.stage);
  const p = e.p ?? propsOnPath().slice(-1)[0] ?? 0;
  const both = chosenFuels(p).length===2;
  const items = stages.map((s,i)=>{
    let chip = '';
    if(both && (s==='electricity'||s==='gas')){
      const waiting = WAIT_RULES[work()]?.[s](isNC()?p:null);
      chip = waiting ? '<br><span class="chip waiting">Waiting for network operator</span>'
           : i<idx ? '<br><span class="chip complete">Complete</span>'
           : '<br><span class="chip needs">Needs information</span>';
    }
    return `<li class="${i<idx?'done':i===idx?'current':''}">${STAGE_LABEL[s]}${chip}</li>`;
  }).join('');
  const propLabel = isNC() && e.p!=null && n.stage!=='work' && n.stage!=='details' ? `<div class="prop-label">Property ${e.p+1}${+pv('A4') > e.p ? ' of '+pv('A4') : ''}</div>` : '';
  el.innerHTML = `${propLabel}<ol class="steps">${items}</ol><div class="step-mobile">Step ${idx+1} of ${stages.length}: ${STAGE_LABEL[n.stage]}</div>`;
}

function shell(n, c, body, opts={}){
  const lead = typeof n.lead==='function' ? n.lead(c) : n.lead;
  const flash = state.flash ? `<div class="infobox">${esc(state.flash)}</div>` : '';
  state.flash = null;
  return `${flash}<h1>${esc(titleOf(n,c))}${qid(n.id)}</h1>
    ${lead ? `<p class="lead">${esc(lead)}</p>` : ''}
    ${n.help ? `<details class="help"><summary>Help with this question</summary><div class="help-body">${n.help}</div></details>` : ''}
    <form id="qform" novalidate>${body}
      <div class="errnote hidden" id="formerr" role="alert"></div>
      <div class="actions">
        ${opts.noContinue ? '' : `<button class="btn" type="submit" id="continue">${opts.cta||'Continue'}</button>`}
        ${opts.extra||''}
        ${state.path.length>1 ? '<button class="linkbtn back" type="button" id="back">Back</button>' : ''}
        ${opts.noSave ? '' : '<button class="linkbtn back" type="button" id="save">Save and come back later</button>'}
      </div>
    </form>`;
}
function fieldErr(name){ return `<div class="errmsg hidden" data-err="${esc(name)}"></div>`; }
function showErrors(errs){
  app.querySelectorAll('[data-err]').forEach(d=>{ d.classList.add('hidden'); d.textContent=''; });
  app.querySelectorAll('.err-input').forEach(i=>i.classList.remove('err-input'));
  let firstEl = null;
  for(const [name,msg] of Object.entries(errs)){
    const d = app.querySelector(`[data-err="${CSS.escape(name)}"]`);
    if(d){ d.textContent = msg; d.classList.remove('hidden'); }
    const inp = app.querySelector(`[name="${CSS.escape(name)}"]`);
    if(inp && inp.type!=='radio' && inp.type!=='checkbox'){ inp.classList.add('err-input'); }
    firstEl = firstEl || inp || d;
  }
  firstEl?.focus?.();
}

function wireCommon(n, c, data){
  const form = document.getElementById('qform');
  document.getElementById('back')?.addEventListener('click', goBack);
  document.getElementById('save')?.addEventListener('click', openSave);
  if(!form) return;
  form.addEventListener('submit', async ev=>{
    ev.preventDefault();
    const btn = document.getElementById('continue');
    const t = TYPES[n.type];
    const res = t.collect ? t.collect(n, c, data) : {value:true};
    if(res.errors && Object.keys(res.errors).length){ showErrors(res.errors); return; }
    if(btn){ btn.disabled = true; btn.textContent = 'Checking…'; }
    try { await advance(n, c, res.value); }
    catch(err){ const fe = document.getElementById('formerr'); fe.textContent = err.message; fe.classList.remove('hidden'); if(btn){ btn.disabled=false; btn.textContent='Continue'; } }
  });
}

async function advance(n, c, value){
  const e = cur();
  const key = K(n.id, e.p);
  if(value!==undefined) state.answers[key] = value;
  if(n.lookup) await runLookup(n, e.p, value);
  if(n.onSave) await n.onSave(c, value);
  pushNext(n, c);
  if(state.returnToSummary) fastForward();
  persist();
  render();
}
function pushNext(n, c){
  const e = cur();
  let nx = n.next(c);
  if(typeof nx==='string') nx = {id:nx, p:e.p};
  if(nx.p===undefined) nx.p = e.p;
  state.path.push(nx);
}
// After "Change" on the summary: walk forward through questions that still have answers, back to the summary
function fastForward(){
  for(let guard=0; guard<200; guard++){
    const e = cur(), n = N[e.id];
    if(e.id==='G9'){ state.returnToSummary=false; return; }
    const ans = state.answers[K(e.id,e.p)];
    if(n.type==='end' || ans===undefined || ['login','accounts','summary','terms'].includes(n.type)) return;
    pushNext(n, ctxFor(e));
  }
}
function goBack(){
  if(state.path.length>1){ state.path.pop(); persist(); render(); }
}

/* ===================== Question types ===================== */
const TYPES = {};

TYPES.welcome = {
  html:(n)=>{
    const saved = store.get('cx-demo-save');
    return `
    ${saved ? `<div class="infobox">You have a saved request from ${esc(new Date(saved.at).toLocaleString('en-GB'))}. <button class="linkbtn" id="resume">Pick up where you left off</button></div>` : ''}
    <h1>Request meter work${qid('A1')}</h1>
    <p class="lead" style="text-align:center">Use this form to ask for a new gas or electricity meter, to move a meter, or to upgrade or downgrade your supply.</p>
    <div class="goodtoknow"><div class="gh">Good to know</div><div class="gb">
      <p>Simple jobs usually take <strong>4 to 6 weeks</strong> from when we have everything we need. More complex metering can take longer.</p>
      <p>Some work needs your network operator first. If it does, we'll tell you who to contact.</p>
      <p>Sending this form doesn't book an appointment. We'll check your request and contact you to book.</p></div></div>
    <div class="box"><h3>What happens</h3><ol class="stages">
      <li>About the work</li><li>Your details</li><li>Your property and supply</li><li>About the visit</li><li>Check and send</li></ol></div>
    <form id="qform"><div class="actions"><button class="btn" type="submit" id="continue">Continue</button></div></form>`;
  },
  mount:()=>{
    document.getElementById('resume')?.addEventListener('click', ()=>{
      const s = store.get('cx-demo-save'); if(!s) return;
      state = s.state; render();
    });
  },
  collect:()=>({value:true})
};

TYPES.radio = {
  html:(n,c)=>{
    const a = c.a(n.id) || {};
    let body;
    if(n.seg){
      body = `<div class="seg" role="radiogroup">${n.options.map(o=>`<label><input type="radio" name="opt" value="${esc(o.v)}" ${a.v===o.v?'checked':''}><span>${esc(o.label)}</span></label>`).join('')}</div>`;
    } else {
      body = `<div class="opts" role="radiogroup">${n.options.map(o=>`
        <label class="opt"><input type="radio" name="opt" value="${esc(o.v)}" ${a.v===o.v?'checked':''}>
          <span><span class="ot">${esc(o.label)}</span>${o.hint?`<span class="oh">${esc(o.hint)}</span>`:''}</span></label>
        ${o.input ? `<div class="reveal ${a.v===o.v?'':'hidden'}" data-for="${esc(o.v)}"><div class="field">
            <div style="display:flex;gap:8px;align-items:center"><input type="text" name="x_${esc(o.v)}" class="short" placeholder="${esc(o.input.placeholder)}" inputmode="${o.input.inputmode||'text'}" value="${a.v===o.v?esc(a.x):''}">${o.input.suffix?`<span class="small">${esc(o.input.suffix)}</span>`:''}</div>
            ${fieldErr('x_'+o.v)}</div></div>` : ''}
        ${o.file ? `<div class="reveal ${a.v===o.v?'':'hidden'}" data-for="${esc(o.v)}">${uploadBox('f_'+o.v, o.file, a.v===o.v?a.file:null, K(n.id,c.p))}</div>` : ''}
      `).join('')}</div>`;
    }
    return shell(n, c, body + fieldErr('opt'));
  },
  mount:(n,c)=>{
    app.querySelectorAll('input[name=opt]').forEach(r=>r.addEventListener('change',()=>{
      app.querySelectorAll('.reveal').forEach(d=>d.classList.toggle('hidden', d.dataset.for!==r.value));
    }));
    mountUploads(K(n.id,c.p));
  },
  collect:(n,c)=>{
    const sel = app.querySelector('input[name=opt]:checked');
    if(!sel) return {errors:{opt:'Please choose an option'}};
    const o = n.options.find(x=>x.v===sel.value);
    const value = {v:o.v};
    if(o.input){
      const x = app.querySelector(`[name="x_${o.v}"]`).value.trim();
      const err = x ? o.input.validate(x) : 'This is required';
      if(err) return {errors:{['x_'+o.v]:err}};
      value.x = x;
    }
    if(o.file){
      const f = readUpload('f_'+o.v, K(n.id,c.p), c.a(n.id)?.file);
      if(!f) return {errors:{['f_'+o.v]:'Please choose a file to upload'}};
      value.file = f;
    }
    return {value};
  }
};

TYPES.checks = {
  html:(n,c)=>{
    const a = c.a(n.id) || [];
    const body = `<div class="opts">${n.options.map(o=>`<label class="opt"><input type="checkbox" name="chk" value="${esc(o.v)}" ${a.includes(o.v)?'checked':''}><span class="ot">${esc(o.label)}</span></label>`).join('')}
      <label class="opt"><input type="checkbox" name="none" value="none" ${Array.isArray(a)&&a.length===0&&c.a(n.id)?'checked':''}><span class="ot">${esc(n.none)}</span></label></div>${fieldErr('chk')}`;
    return shell(n, c, body);
  },
  mount:()=>{
    const none = app.querySelector('[name=none]');
    none.addEventListener('change',()=>{ if(none.checked) app.querySelectorAll('[name=chk]').forEach(x=>x.checked=false); });
    app.querySelectorAll('[name=chk]').forEach(x=>x.addEventListener('change',()=>{ if(x.checked) none.checked=false; }));
  },
  collect:()=>{
    const vals = [...app.querySelectorAll('[name=chk]:checked')].map(x=>x.value);
    if(!vals.length && !app.querySelector('[name=none]').checked) return {errors:{chk:"Choose at least one, or 'No, nobody needs extra support'"}};
    return {value:vals};
  }
};

function inputHTML(f, val){
  const max = f.type==='date' && f.name==='dob' ? `max="${todayISO()}"` : '';
  return `<div class="field"><label for="f_${f.name}">${esc(f.label)}</label>${f.sub?`<span class="sub">${esc(f.sub)}</span>`:''}
    <input id="f_${f.name}" name="${f.name}" type="${f.type}" ${f.autocomplete?`autocomplete="${f.autocomplete}"`:''} ${max} value="${esc(val||'')}" class="${f.type==='date'?'short':''}">
    ${fieldErr(f.name)}</div>`;
}
TYPES.fields = {
  load:null,
  html:(n,c)=>{
    const a = c.a(n.id) || {};
    let body = n.fields.map(f=>inputHTML(f, a[f.name])).join('');
    if(n.address) body += `<div class="field"><span class="flabel">${esc(n.address.label)}</span>${addressBlock({search:true, value:a.address})}</div>`;
    return shell(n, c, body);
  },
  mount:(n,c)=>{ if(n.address) mountAddress({search:true, value:(c.a(n.id)||{}).address}); },
  collect:(n)=>{
    const value = {}, errors = {};
    for(const f of n.fields){
      const v = app.querySelector(`[name="${f.name}"]`).value.trim();
      value[f.name] = v;
      const err = !v ? 'This is required' : f.validate ? f.validate(v) : '';
      if(err) errors[f.name] = err;
    }
    if(n.address){
      const ar = collectAddress();
      if(ar.errors) Object.assign(errors, ar.errors); else value.address = ar.value;
    }
    return Object.keys(errors).length ? {errors} : {value};
  }
};
N.B5.onSave = async (c, value)=>{
  // Kraken matching by email happens after submission; the demo checks the fake customer table now so the panel can show S3/S4/S5
  const rows = await sbGet('customers', `email=eq.${enc(value.email.toLowerCase())}&select=*`);
  state.emailMatch = rows[0] || null;
};

TYPES.date = {
  html:(n,c)=>{
    const a = c.a(n.id);
    const min = n.min==='today' ? todayISO() : addDays(1);
    return shell(n, c, `<div class="field"><input type="date" name="date" class="short" min="${min}" value="${esc(a||'')}" aria-label="${esc(titleOf(n,c))}">${fieldErr('date')}
      <span class="sub" style="margin-top:6px">${n.min==='today' ? 'Today or a future date' : 'A date in the future'}</span></div>`);
  },
  collect:(n)=>{
    const v = app.querySelector('[name=date]').value;
    if(!v) return {errors:{date:'Please enter a date'}};
    if(n.min==='today' ? v < todayISO() : v <= todayISO()) return {errors:{date: n.min==='today' ? 'The date must be today or in the future' : 'The date must be in the future'}};
    return {value:v};
  }
};

TYPES.postcode = {
  html:(n,c)=> shell(n, c, `<div class="field"><input type="text" name="pc" class="short" placeholder="Postcode" autocomplete="postal-code" value="${esc(c.a(n.id)||'')}">${fieldErr('pc')}</div>`),
  collect:()=>{
    const v = app.querySelector('[name=pc]').value.trim();
    if(!PC_RE.test(v.replace(/\s+/g,' '))) return {errors:{pc:'Enter a valid UK postcode, like EH23 4DJ'}};
    return {value:normPC(v)};
  }
};

TYPES.textarea = {
  html:(n,c)=> shell(n, c, `<div class="field"><textarea name="t" maxlength="2000" aria-label="${esc(n.title)}">${esc(c.a(n.id)||'')}</textarea></div>`),
  collect:()=>({value:app.querySelector('[name=t]').value.trim()})
};

TYPES.tick = {
  html:(n,c)=> shell(n, c, `<div class="warnbox"><strong>Your supply will be reduced</strong><p>${esc(n.text)}</p></div>
    <label class="opt"><input type="checkbox" name="tick" ${c.a(n.id)?'checked':''}><span class="ot">I understand and want to go ahead</span></label>${fieldErr('tick')}`),
  collect:()=> app.querySelector('[name=tick]').checked ? {value:true} : {errors:{tick:'Please confirm to continue'}}
};

/* ----- uploads ----- */
function uploadBox(name, accept, prev, key){
  const f = files[key+'|'+name];
  const preview = prev ? `<div class="preview" id="pv_${name}">${f && f.type.startsWith('image/') ? `<img alt="" src="${URL.createObjectURL(f)}">` : ''}<span>✅ ${esc(prev.name)}</span></div>` : `<div class="preview" id="pv_${name}"></div>`;
  return `<div class="field"><div class="drop"><div>${accept===IMG ? 'Choose a photo (JPG, PNG or HEIC)' : 'Choose a photo or PDF'}</div>
    <input type="file" name="${name}" accept="${accept}" ${accept===IMG?'capture="environment"':''}>${preview}
    <div class="small" style="margin-top:8px">Demo: the file stays in your browser and isn't uploaded.</div></div>${fieldErr(name)}</div>`;
}
function mountUploads(key){
  app.querySelectorAll('input[type=file]').forEach(inp=>inp.addEventListener('change',()=>{
    const f = inp.files[0]; const pv = document.getElementById('pv_'+inp.name);
    if(!f){ pv.innerHTML=''; return; }
    if(f.size > 20*1024*1024){ showErrors({[inp.name]:'The file must be smaller than 20MB'}); inp.value=''; return; }
    files[key+'|'+inp.name] = f;
    pv.innerHTML = `${f.type.startsWith('image/')?`<img alt="" src="${URL.createObjectURL(f)}">`:''}<span>✅ ${esc(f.name)}</span>`;
  }));
}
function readUpload(name, key, prev){
  const f = files[key+'|'+name];
  if(f) return {name:f.name, type:f.type, size:f.size};
  return prev || null;
}
TYPES.upload = {
  html:(n,c)=>{
    const a = c.a(n.id);
    return shell(n, c, uploadBox('file', n.accept, a && a.name ? a : null, K(n.id,c.p)),
      n.optional ? {extra:'<button class="linkbtn" type="button" id="skip">Skip this step</button>'} : {});
  },
  mount:(n,c)=>{
    mountUploads(K(n.id,c.p));
    document.getElementById('skip')?.addEventListener('click', ()=> advance(n, c, {skipped:true}));
  },
  collect:(n,c)=>{
    const prev = c.a(n.id);
    const f = readUpload('file', K(n.id,c.p), prev && prev.name ? prev : null);
    if(!f) return {errors:{file: n.accept===IMG ? 'Please choose a photo' : 'Please choose a file, or skip this step'}};
    return {value:f};
  }
};

/* ----- address finder ----- */
let addrState = null;
function addressBlock(o){
  return `<div id="addr">
    ${o.search ? `<div class="field" style="display:flex;gap:8px;flex-wrap:wrap"><input type="text" name="a_pc" class="short" placeholder="Postcode" value="${esc(o.value?.postcode||'')}"><button class="btn secondary" type="button" id="a_find" style="width:auto">Find address</button></div>${fieldErr('a_pc')}` : ''}
    <div id="a_listwrap"></div>
    <div id="a_manual" class="hidden">
      ${['line1','line2','town','postcode'].map(f=>`<div class="field"><label for="am_${f}">${({line1:'First line',line2:'Second line (optional)',town:'Town',postcode:'Postcode'})[f]}</label><input type="text" id="am_${f}" name="am_${f}" ${f==='postcode'?'class="short"':''}>${fieldErr('am_'+f)}</div>`).join('')}
    </div>
    <p><button class="linkbtn" type="button" id="a_toggle">Can't find your address?</button></p>
  </div>`;
}
function mountAddress(o){
  addrState = {list:o.list||null, manual:false, opts:o};
  const wrap = document.getElementById('a_listwrap');
  const setManual = (on, prefill)=>{
    addrState.manual = on;
    document.getElementById('a_manual').classList.toggle('hidden', !on);
    document.getElementById('a_toggle').textContent = on ? 'Choose from the list instead' : "Can't find your address?";
    if(prefill) for(const f of ['line1','line2','town','postcode']) document.getElementById('am_'+f).value = prefill[f]||'';
  };
  const drawList = (list, pc, selected)=>{
    addrState.list = list;
    const none = !list.length;
    wrap.innerHTML = `<div class="field">
      <select name="a_sel" class="${none?'err-input':''}" aria-label="Select address">
        <option value="">Select address</option>
        ${o.same ? `<option value="same" ${selected==='same'?'selected':''}>Same as electricity: ${esc(addrText(o.same))}</option>` : ''}
        ${list.map((a,i)=>`<option value="${i}" ${selected===i?'selected':''}>${esc(addrText(a))}</option>`).join('')}
      </select>${fieldErr('a_sel')}
      ${none ? `<div class="errmsg">Please select your address</div><p class="errnote">We couldn't find an address for your postcode, is the postcode correct? If you're having problems please use the manual address form below.</p>` : ''}
    </div>`;
  };
  const v = o.value;
  if(o.list){
    let sel = null;
    if(v?.source==='same') sel = 'same';
    else if(v && v.source!=='manual') sel = o.list.findIndex(a=>a.line1===v.line1 && a.postcode===v.postcode);
    else if(!v && o.prefill) sel = o.list.findIndex(a=>a.line1===o.prefill.line1 && a.postcode===o.prefill.postcode);
    drawList(o.list, o.postcode, sel===-1?null:sel);
    if(v?.source==='manual') setManual(true, v);
    else if(!v && o.prefill && sel===-1) setManual(true, o.prefill);
    else if(!o.list.length && !o.same) setManual(true, {postcode:o.postcode});
  }
  if(o.search){
    const find = async ()=>{
      const pc = app.querySelector('[name=a_pc]').value.trim();
      if(!PC_RE.test(pc)){ showErrors({a_pc:'Enter a valid UK postcode'}); return; }
      showErrors({});
      wrap.innerHTML = '<p class="small">Looking up addresses…</p>';
      try { drawList(await sbGet('addresses', `postcode=eq.${enc(normPC(pc))}&select=line1,line2,town,postcode&order=id`), normPC(pc), null); }
      catch(err){ wrap.innerHTML = `<p class="errnote">${esc(err.message)}</p>`; }
    };
    document.getElementById('a_find').addEventListener('click', find);
    if(v){ if(v.source==='manual'){ setManual(true, v); } else { app.querySelector('[name=a_pc]').value = v.postcode; find().then(()=>{ const i = addrState.list?.findIndex(a=>a.line1===v.line1); if(i>=0) app.querySelector('[name=a_sel]').value = i; }); } }
  }
  document.getElementById('a_toggle').addEventListener('click', ()=> setManual(!addrState.manual, addrState.manual ? null : {postcode:o.postcode||''}));
}
function collectAddress(){
  if(addrState.manual){
    const v = {source:'manual'}; const errors = {};
    for(const f of ['line1','line2','town','postcode']) v[f] = document.getElementById('am_'+f).value.trim();
    if(!v.line1) errors.am_line1 = 'Enter the first line of the address';
    if(!v.town) errors.am_town = 'Enter the town';
    if(!PC_RE.test(v.postcode)) errors.am_postcode = 'Enter a valid UK postcode';
    else v.postcode = normPC(v.postcode);
    return Object.keys(errors).length ? {errors} : {value:v};
  }
  const sel = app.querySelector('[name=a_sel]');
  if(!sel || sel.value==='') return {errors:{a_sel: addrState.opts.search && !sel ? 'Enter a postcode and choose Find address' : 'Please select your address'}};
  if(sel.value==='same') return {value:{source:'same'}};
  return {value:{source:'list', ...addrState.list[+sel.value]}};
}
TYPES.address = {
  html:(n,c)=> shell(n, c, `<p class="lead">Addresses for <strong>${esc(c.v('C2'))}</strong></p>${addressBlock({})}`),
  mount:(n,c,data)=>{
    const l = lookupOf(n.from, c.p);
    const same = n.sameAsElec && c.v('C1')==='both' ? fuelAddress(c.p,'electricity') : null;
    mountAddress({list:data, postcode:c.v('C2'), value:c.a(n.id), prefill:l?.found ? l.address : null, same});
  },
  collect:()=> collectAddress()
};
TYPES.address.load = async (c)=> sbGet('addresses', `postcode=eq.${enc(c.v('C2'))}&select=line1,line2,town,postcode&order=id`);
N.C5.load = N.C17.load = TYPES.address.load;

TYPES.confirmAddress = {
  html:(n,c)=>{
    const l = lookupOf(n.from, c.p);
    const a = c.a(n.id) || {};
    return shell(n, c, `<p class="lead">We found this address for ${n.from==='C3'?'MPAN':'MPRN'} <strong>${esc(l.mpxn)}</strong>:</p>
      <div class="addr-card">${esc(l.address.line1)}<br>${l.address.line2?esc(l.address.line2)+'<br>':''}${esc(l.address.town)}<br>${esc(l.address.postcode)}</div>
      <div class="seg" role="radiogroup">${YN.map(o=>`<label><input type="radio" name="opt" value="${o.v}" ${a.v===o.v?'checked':''}><span>${o.label}</span></label>`).join('')}</div>${fieldErr('opt')}`);
  },
  collect:()=>{ const s = app.querySelector('[name=opt]:checked'); return s ? {value:{v:s.value}} : {errors:{opt:'Please choose yes or no'}}; }
};

/* ----- login (B2) ----- */
const OCTO_SVG = `<svg width="130" height="120" viewBox="0 0 130 120" aria-hidden="true">
  <path d="M65 8c30 0 50 22 50 52v60H15V60C15 30 35 8 65 8z" fill="#f050f8"/>
  <circle cx="47" cy="58" r="11" fill="#fff"/><circle cx="83" cy="58" r="11" fill="#fff"/>
  <circle cx="49" cy="61" r="6" fill="#100030"/><circle cx="85" cy="61" r="6" fill="#100030"/>
  <path d="M57 80q8 6 16 0" stroke="#100030" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M40 40q5-4 9-1M81 39q4-3 9 1" stroke="#100030" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`;
TYPES.login = {
  html:()=>`
    <div class="login">
      <div class="avatar">${OCTO_SVG}</div>
      <h1>Sign in to your account${qid('B2')}</h1>
      <form id="qform" novalidate>
        <div class="field"><input type="email" name="email" placeholder="Email address" autocomplete="username" aria-label="Email address" value="${esc(state.user?.email||'')}">${fieldErr('email')}</div>
        <div class="field pw"><input type="password" name="password" placeholder="Password" autocomplete="current-password" aria-label="Password">
          <button type="button" id="eye" aria-label="Show password"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/></svg></button></div>
        ${fieldErr('password')}
        <div class="errnote hidden" id="formerr" role="alert"></div>
        <button class="btn" type="submit" id="continue">Log in</button>
        <div class="login-cards">
          <div><p>Not a customer?</p><button class="linkbtn" type="button" id="notCustomer">Start your switch now</button></div>
          <div><p>Don't have a password?</p><button class="linkbtn" type="button" id="noPw">Click to receive email</button></div>
        </div>
        <div class="actions"><button class="linkbtn back" type="button" id="back">Back</button></div>
      </form>
    </div>`,
  mount:(n,c)=>{
    document.getElementById('eye').addEventListener('click',()=>{ const p = app.querySelector('[name=password]'); p.type = p.type==='password'?'text':'password'; });
    document.getElementById('noPw').addEventListener('click',()=> toast('Demo: any password works for the test logins in Demo tools → Test data.'));
    document.getElementById('notCustomer').addEventListener('click',()=>{
      // New connections carry on as a new customer; moves, upgrades and downgrades need an account first
      state.path.push({id: isNC() ? 'B3' : 'B-END-1', p:null}); persist(); render();
    });
  },
  collect:()=>{
    const email = app.querySelector('[name=email]').value.trim().toLowerCase();
    const pw = app.querySelector('[name=password]').value;
    const errors = {};
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address';
    if(!pw) errors.password = 'Enter your password';
    return Object.keys(errors).length ? {errors} : {value:{email}};
  }
};
N.B2.onSave = async (c, value)=>{
  const rows = await sbGet('customers', `email=eq.${enc(value.email)}&select=*`);
  if(!rows[0] || !rows[0].can_log_in){ delete state.answers.B2; throw new Error("We couldn't sign you in with those details. (Demo: try a login from Demo tools → Test data.)"); }
  state.user = rows[0];
  state.emailMatch = null;
  state.accounts = await sbGet('accounts', `email=eq.${enc(value.email)}&select=*&order=account_number`);
};

/* ----- accounts (B6) ----- */
TYPES.accounts = {
  html:(n,c)=>{
    const a = c.a(n.id) || {};
    if(!state.accounts.length) return shell(n, c, `<div class="warnbox"><strong>No properties on this login</strong><p>There aren't any supply addresses on this account yet. Once your account is live, you can come back and request this work.</p></div>`, {noContinue:true});
    return shell(n, c, `<p class="lead">Signed in as ${esc(state.user.first_name)} ${esc(state.user.last_name)}</p><div class="opts">${state.accounts.map(ac=>`
      <label class="opt"><input type="radio" name="opt" value="${esc(ac.account_number)}" ${a.v===ac.account_number?'checked':''}>
      <span><span class="ot">${esc(ac.line1)}, ${esc(ac.town)} ${esc(ac.postcode)}</span>
      <span class="oh">Account ${esc(ac.account_number)} · Electricity: ${esc(ac.elec_meter||'none')}${ac.elec_fuse_amps?` (${ac.elec_fuse_amps}A)`:''} · Gas: ${esc(ac.gas_meter||'none')}</span></span></label>`).join('')}</div>${fieldErr('opt')}`);
  },
  collect:()=>{ const s = app.querySelector('[name=opt]:checked'); return s ? {value:{v:s.value}} : {errors:{opt:'Please choose a property'}}; }
};
N.B6.onSave = async (c, value)=>{ state.selectedAccount = state.accounts.find(a=>a.account_number===value.v); };

/* ----- tariffs (E6) ----- */
TYPES.tariffs = {
  html:(n,c,data)=>{
    const a = c.a(n.id) || {};
    const avail = data.filter(t=>t.available && t.half_hourly);
    return shell(n, c, `<div class="goodtoknow"><div class="gh">Good to know</div><div class="gb">
      <p>CT meters are billed on half-hourly readings, so you'll need a smart tariff that uses them.</p>
      <p>We're working on half-hourly versions of our Flexible and Fixed tariffs.</p></div></div>
      <p class="lead">These are the tariffs available for account ${esc(state.selectedAccount?.account_number||'')} right now:</p>
      <div class="opts">${avail.map(t=>`<label class="opt"><input type="radio" name="opt" value="${esc(t.name)}" ${a.v===t.name?'checked':''}><span><span class="ot">${esc(t.name)}</span><span class="oh">${esc(t.blurb||'')}</span></span></label>`).join('')}</div>${fieldErr('opt')}`);
  },
  collect:()=>{ const s = app.querySelector('[name=opt]:checked'); return s ? {value:{v:s.value}} : {errors:{opt:'Please choose a tariff'}}; }
};
N.E6.load = async ()=> cache.tariffs || (cache.tariffs = await sbGet('tariffs','select=*&order=sort'));

/* ----- summary (G9) ----- */
function fmtAnswer(n, a, p){
  if(a===undefined || a===null) return '';
  switch(n.type){
    case 'radio': case 'confirmAddress': {
      if(n.type==='confirmAddress') return a.v==='yes'?'Yes':'No';
      const o = n.options.find(x=>x.v===a.v); let s = o?.label || a.v;
      if(a.x) s += `: ${a.x}${o?.input?.suffix?' '+o.input.suffix:''}`;
      if(a.file) s += `: ${a.file.name}`;
      return s;
    }
    case 'accounts': { const ac = state.accounts.find(x=>x.account_number===a.v); return ac ? `${ac.line1}, ${ac.town} ${ac.postcode} (${ac.account_number})` : a.v; }
    case 'tariffs': return a.v;
    case 'checks': return a.length ? a.join('\n') : 'No, nobody needs extra support';
    case 'date': return fmtDate(a);
    case 'postcode': return a;
    case 'textarea': return a || 'Nothing added';
    case 'tick': return 'Confirmed';
    case 'upload': return a.skipped ? 'Skipped' : a.name;
    case 'address': return a.source==='same' ? 'Same as electricity' : addrText(a);
    case 'login': return `Signed in as ${a.email}`;
    case 'fields': {
      const parts = n.fields.map(f=> f.type==='date' ? `${f.label}: ${fmtDate(a[f.name])}` : a[f.name]);
      if(a.address) parts.push(addrText(a.address));
      return parts.join('\n');
    }
  }
  return String(a);
}
function summaryGroups(){
  const groups = [];
  const add = (title, entries, status)=> entries.length && groups.push({title, entries, status});
  const answered = state.path.filter(e=>{ const n = N[e.id]; return !['welcome','summary','terms','end'].includes(n.type) && state.answers[K(e.id,e.p)]!==undefined; });
  const by = (fn)=> answered.filter(fn);
  const out = outcome();
  const statusOf = (p,fuel)=> out.items.find(i=>i.p===p && i.fuel===fuel)?.status;
  add('About the work', by(e=>N[e.id].stage==='work'));
  add('Your details', by(e=>N[e.id].stage==='details'));
  if(isNC()){
    for(const p of propsOnPath()){
      const label = propsOnPath().length>1 ? ` – property ${p+1}` : '';
      add('Property'+label, by(e=>e.p===p && N[e.id].stage==='property'));
      for(const fuel of chosenFuels(p)) add((fuel==='electricity'?'Electricity supply':'Gas supply')+label, by(e=>e.p===p && N[e.id].stage===fuel), statusOf(p,fuel));
      add('About the visit'+label, by(e=>e.p===p && N[e.id].stage==='visit'));
    }
  } else {
    for(const fuel of chosenFuels(null)) add(fuel==='electricity'?'Electricity':'Gas', by(e=>N[e.id].stage===fuel), statusOf(null,fuel));
    add('About the visit', by(e=>N[e.id].stage==='visit'));
  }
  add('Anything else', by(e=>e.id==='G8'));
  return groups;
}
TYPES.summary = {
  html:(n,c)=>{
    const body = summaryGroups().map(g=>`<section class="sum-group"><h3><span>${esc(g.title)}</span>${g.status?`<span class="chip ${g.status==='waiting'?'waiting':g.status==='ready'?'complete':'review'}">${STATUS[g.status].label}</span>`:''}</h3>
      ${g.entries.map(e=>{ const q = N[e.id]; const changeable = !['login'].includes(q.type) && e.id!=='A2';
        return `<div class="sum-row"><div class="sq">${esc(titleOf(q, ctxFor(e)) || q.id)}${qid(e.id)}</div><div class="sa">${esc(fmtAnswer(q, state.answers[K(e.id,e.p)], e.p))}</div>
        <div>${changeable?`<button class="linkbtn" type="button" data-change="${state.path.indexOf(e)}">Change</button>`:''}</div></div>`; }).join('')}</section>`).join('');
    return shell(n, c, body, {cta:'Continue to terms'});
  },
  mount:()=>{
    app.querySelectorAll('[data-change]').forEach(b=>b.addEventListener('click',()=>{
      state.path = state.path.slice(0, +b.dataset.change + 1);
      state.returnToSummary = true; persist(); render();
    }));
  },
  collect:()=>({value:true})
};
N.B2.title = 'Sign in to your account';
N.A1.title = 'Welcome';

/* ----- terms (G10) ----- */
TYPES.terms = {
  html:(n,c)=> shell(n, c, `<div class="box" style="max-height:260px;overflow:auto">
      <h3>Meter work terms (demo text)</h3>
      <p>By sending this request you confirm the information you've given is correct to the best of your knowledge.</p>
      <p>Sending this request does not book an appointment. We'll check your request and contact you to agree a date.</p>
      <p>Some work needs your network operator to do work first. We can't book our visit until that work is finished.</p>
      <p>If we find on the day that the work can't go ahead safely, we may need to rebook.</p>
      <p>We'll use your details to process this request and manage your account, as set out in our privacy notice.</p>
    </div>`, {noContinue:true, noSave:true, extra:`<button class="btn" type="button" id="agree">Agree and send request</button><button class="linkbtn" type="button" id="decline">I don't agree</button>`}),
  mount:(n,c)=>{
    document.getElementById('agree').addEventListener('click', ()=> advance(n, c, {v:'agree'}));
    document.getElementById('decline').addEventListener('click', ()=> advance(n, c, {v:'decline'}));
  }
};

/* ----- end screens ----- */
function refFor(){ const pre = {new_connection:'NC', meter_move:'MM', upgrade:'UP', downgrade:'DG'}[work()] || 'RQ'; return pre + '-' + Math.random().toString(36).slice(2,8).toUpperCase(); }
async function saveSubmission(kind){
  if(state.submitted) return state.submitted;
  const ref = refFor();
  const answers = {};
  for(const e of state.path){ const k = K(e.id,e.p); if(state.answers[k]!==undefined) answers[k] = state.answers[k]; if(state.answers[k+'#lookup']) answers[k+'#lookup'] = state.answers[k+'#lookup']; }
  const out = outcome();
  try {
    await sbInsert('submissions', {reference:ref, work_type:work()+(kind?':'+kind:''), answers, outcome:{...out, account:state.selectedAccount?.account_number||null, user:state.user?.email||pv('B5')?.email||null, settings}});
    state.submitted = {ref, saved:true};
  } catch(err){ state.submitted = {ref, saved:false, err:err.message}; }
  store.del('cx-demo-save');
  return state.submitted;
}
const END = {
  'A-END-1': ()=>`<h1>We're not able to help with this request${qid('A-END-1')}</h1>
    <div class="warnbox"><strong>Service not available</strong><p>We don't currently offer new connections for businesses, community spaces or other non-domestic sites.</p></div>
    <div class="box"><h3>What you can do</h3><p>Octopus Energy for Business may be able to help with non-domestic supplies.</p><p><a href="https://octopus.energy/business/" target="_blank" rel="noopener">Go to Octopus Energy for Business</a></p></div>`,
  'A-END-2': ()=>`<h1>Please use our bulk new connections form${qid('A-END-2')}</h1>
    <div class="goodtoknow"><div class="gh">Good to know</div><div class="gb"><p>Requests for 4 or more properties have their own form, so our bulk team can handle them together.</p><p>You'll move to a separate form. Nothing you've entered so far has been sent.</p></div></div>
    <div class="actions"><a class="btn" href="https://octopus.typeform.com/bulk-new-conn" target="_blank" rel="noopener">Continue to the bulk form</a></div>`,
  'B-END-1': ()=>`<h1>You'll need to sign up to Octopus Energy first${qid('B-END-1')}</h1>
    <div class="warnbox"><strong>Service not available</strong><p>We can only ${{meter_move:'move a meter',upgrade:'upgrade a supply',downgrade:'downgrade a supply'}[work()]||'do this work'} for Octopus Energy customers.</p></div>
    <div class="box"><h3>What to do next</h3><p>Get a quote and switch to us. Once your account is live, come back to this form and sign in.</p></div>
    <div class="actions"><a class="btn" href="https://octopus.energy/quote" target="_blank" rel="noopener">Get a quote</a></div>`
};
TYPES.end = {
  load: async (c)=>{
    const id = cur().id;
    if(['C-END-1','D-END-1','E-END-1','F-END-1','G-END-1'].includes(id)){
      const kind = id==='G-END-1' ? null : 'waiting';
      const pcs = isNC() ? propsOnPath().map(p=>pv('C2',p)) : [currentPostcode()];
      const nos = await Promise.all(pcs.map(pc=>networkOperator(pc).catch(()=>null)));
      // A later property waiting on its network operator is held within the main request, not sent on its own
      if(!(isNC() && id==='C-END-1' && cur().p>0)) await saveSubmission(kind);
      return {nos};
    }
    return null;
  },
  html:(n,c,data)=>{
    const id = n.id;
    const tail = `<div class="actions"><button class="linkbtn back" type="button" id="back">Back</button><a href="?" class="linkbtn back">Start again</a></div>`;
    if(END[id]) return END[id]() + tail;
    if(id==='G-END-2') return `<h1>You need to accept the terms to send your request${qid('G-END-2')}</h1>
      <div class="box"><p>We can't send your request unless you agree to the terms. Your answers are still here.</p></div>
      <div class="actions"><button class="btn" type="button" id="toTerms">Go back to the terms</button></div>`;
    const sub = state.submitted;
    const saveNote = sub && !sub.saved ? `<p class="small">Demo: couldn't save to Supabase (${esc(sub.err)}).</p>` : '';
    const out = outcome();
    const noFor = p => data?.nos?.[isNC() ? propsOnPath().indexOf(p) : 0];
    if(id==='G-END-1'){
      const cards = out.items.map(it=>{
        const label = `${isNC() && propsOnPath().length>1 ? `Property ${it.p+1} – ` : ''}${it.fuel==='electricity'?'Electricity':'Gas'}`;
        const text = it.status==='waiting' ? waitingText(noFor(it.p), it.fuel) : esc(STATUS[it.status].text);
        return `<div class="status ${it.status}"><h3>${esc(label)}: ${STATUS[it.status].label}</h3>${it.address?`<p class="small">${esc(addrText(it.address))}</p>`:''}<p>${text}</p></div>`;
      }).join('');
      return `<h1>Request sent</h1>
        <div class="box" style="text-align:center"><p>Your reference number</p><div class="ref">${esc(sub?.ref||'')}</div><p class="small">We've emailed you a copy. (Demo: no email is sent.)</p>${saveNote}</div>
        <h2>Where things are up to</h2>${cards}
        <div class="box"><h3>What happens next</h3>
          <p>Our team checks each request. If something needs your network operator, it's over to you to contact them – we'll email you in 2 weeks to see how it's going.</p>
          <p><strong>Nothing is booked yet.</strong> We'll contact you to agree a date for the visit.</p></div>
        <div class="actions"><a href="?" class="linkbtn back">Start a new request</a></div>`;
    }
    // Waiting for network operator end screens (C-END-1, D-END-1, E-END-1, F-END-1)
    const p = cur().p;
    const fuels = isNC() ? chosenFuels(p) : out.items.filter(i=>i.waiting).map(i=>i.fuel);
    const no = noFor(isNC()?p:null);
    const list = fuels.map(f=>`<li>${waitingText(no, f).replace(" We'll email you in 2 weeks.","")}</li>`).join('');
    const more = isNC() && p>0;
    return `<h1>You'll need to arrange this with your network operator first${qid(id)}</h1>
      <div class="warnbox"><strong>Waiting for network operator</strong><p>Nothing has been booked. Your network operator needs to do their part before we can fit or change your meter.</p></div>
      <div class="box"><h3>Who to contact</h3><ul>${list}</ul>${no?'':'<p class="small">We couldn\'t match your postcode to a network operator. You can find yours at <a href="https://www.energynetworks.org/customers/find-my-network-operator" target="_blank" rel="noopener">energynetworks.org</a>.</p>'}</div>
      <div class="box"><h3>What happens next</h3><p>${more ? "We'll hold this property as waiting and send it with the rest of your request. We'll email you in 2 weeks to ask if you're ready to carry on." : `We've saved your answers${sub?` (reference <strong>${esc(sub.ref)}</strong>)`:''}. We'll email you in 2 weeks to ask if you're ready to carry on – you won't need to start again.`}</p>${saveNote}</div>
      ${more ? `<div class="actions"><button class="btn" type="button" id="moreProps">Carry on with the rest of your request</button></div>` : ''}
      ${tail}`;
  },
  mount:(n,c)=>{
    document.getElementById('toTerms')?.addEventListener('click', ()=>{ state.path.pop(); render(); });
    document.getElementById('moreProps')?.addEventListener('click', ()=>{
      // Later properties: this one is held as waiting, the rest of the request carries on
      state.submitted = null;
      state.path.push(c.p<2 ? {id:'G7', p:c.p} : {id:'G8', p:null}); persist(); render();
    });
  }
};
N['C-END-1'].load = N['D-END-1'].load = N['E-END-1'].load = N['F-END-1'].load = N['G-END-1'].load = TYPES.end.load;
// Going back from an end screen allows a fresh submission
const _goBack = goBack;
goBack = function(){ if(N[cur().id].type==='end') state.submitted = null; _goBack(); };

/* ===================== Save and return ===================== */
function persist(){ /* keeps the session in this tab only; explicit save goes to localStorage */ }
function openSave(){
  const bg = document.createElement('div'); bg.className='modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mh">
    <h2 id="mh">Save and come back later</h2>
    <p>We'll email you a link so you can pick up where you left off.</p>
    <div class="field"><input type="email" id="sv_email" placeholder="Email address" aria-label="Email address"></div>
    <button class="btn" id="sv_go">Yes, please</button><br>
    <button class="linkbtn" id="sv_no">No thanks – take me back to my request</button>
    <p class="small" style="color:#4a3f6b">Demo: no email is sent. Your progress is saved in this browser.</p></div>`;
  document.body.appendChild(bg);
  bg.querySelector('#sv_email').focus();
  bg.querySelector('#sv_no').onclick = ()=> bg.remove();
  bg.querySelector('#sv_go').onclick = ()=>{
    store.set('cx-demo-save', {at:Date.now(), state});
    bg.remove(); toast('Saved. Open this page again to pick up where you left off.');
  };
}

/* ===================== Demo panel ===================== */
let demoTab = 'kraken';
const demo = document.getElementById('demo');
document.getElementById('demoBtn').onclick = ()=>{ demo.classList.add('open'); renderDemo(); };
document.getElementById('demoClose').onclick = ()=> demo.classList.remove('open');
demo.querySelectorAll('.tabs button').forEach(b=> b.onclick = ()=>{ demoTab = b.dataset.tab; demo.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on', x===b)); renderDemo(); });
let testData = null;
async function renderDemo(){
  if(!demo.classList.contains('open')) return;
  const body = document.getElementById('demoBody');
  if(demoTab==='settings'){
    body.innerHTML = `
      <label class="switch"><span>Show question IDs</span><input type="checkbox" data-set="showIds" ${settings.showIds?'checked':''}></label>
      <label class="switch"><span>Non-domestic toggle<br><span class="small">Off at launch. On lets non-domestic new connections carry on.</span></span><input type="checkbox" data-set="nonDomestic" ${settings.nonDomestic?'checked':''}></label>
      <label class="switch"><span>Simulate a partial failure (S10)<br><span class="small">Every new connection supply becomes PARTIAL_FAILURE.</span></span><input type="checkbox" data-set="partialFailure" ${settings.partialFailure?'checked':''}></label>
      <h4>Start a journey</h4>
      <p>Links pre-select the work type, as if the customer came from that page:</p>
      <p>${Object.entries(WORK).map(([k,v])=>`<a href="?type=${k}">${v}</a>`).join(' · ')}</p>
      <h4>Where requests go</h4>
      <p class="small">Each sent request (and each 'waiting' end) is saved to the <strong>submissions</strong> table in the Supabase project "Connections Demo".</p>`;
    body.querySelectorAll('[data-set]').forEach(i=> i.onchange = ()=>{ settings[i.dataset.set] = i.checked; store.set('cx-demo-settings', settings); render(); });
    return;
  }
  if(demoTab==='data'){
    if(!testData){
      body.innerHTML = '<div class="spinner"></div>';
      try {
        const [mp, cu] = await Promise.all([sbGet('meter_points','select=mpxn,fuel,test_note&order=mpxn'), sbGet('customers','select=email,test_note&order=email')]);
        testData = {mp, cu};
      } catch(err){ body.innerHTML = `<p class="errnote">${esc(err.message)}</p>`; return; }
    }
    const row = (k,v)=>`<tr><td><code data-copy="${esc(k)}" title="Click to copy">${esc(k)}</code></td><td>${esc(v||'')}</td></tr>`;
    body.innerHTML = `
      <p class="small">Click a value to copy it. Edit these in the Supabase table editor – no code changes needed.</p>
      <h4>Logins (any password)</h4><table>${testData.cu.map(c=>row(c.email,c.test_note)).join('')}</table>
      <p class="small">Any other email at 'Your details' = not on Kraken (S3).</p>
      <h4>MPANs (electricity)</h4><table>${testData.mp.filter(m=>m.fuel==='electricity').map(m=>row(m.mpxn,m.test_note)).join('')}</table>
      <h4>MPRNs (gas)</h4><table>${testData.mp.filter(m=>m.fuel==='gas').map(m=>row(m.mpxn,m.test_note)).join('')}</table>
      <p class="small">Any other number = not found on ECOES/Xoserve (S9).</p>
      <h4>Postcodes</h4><table>
        ${row('EH23 4DJ','Matches most test MPANs/MPRNs; 6 addresses')}
        ${row('EH23 3DJ',"No addresses – shows the 'couldn't find an address' error")}
        ${row('M1 1AA','3 flats; matches the …902 / …452 numbers')}
        ${row('LS1 4AP','2 addresses')}${row('CF10 1AA','2 plots')}</table>`;
    body.querySelectorAll('[data-copy]').forEach(c=> c.onclick = ()=>{ navigator.clipboard?.writeText(c.dataset.copy).then(()=>toast('Copied '+c.dataset.copy), ()=>{}); });
    return;
  }
  // Kraken view
  const out = outcome();
  const who = state.user ? `Logged in: ${state.user.email} (${state.user.portfolio_users}-user portfolio)` : pv('B5') ? `Not logged in: ${pv('B5').email}${state.emailMatch?` – email on Kraken (${state.emailMatch.portfolio_users}-user portfolio)`:' – email not on Kraken'}` : '–';
  body.innerHTML = `
    <p class="small">What the Kraken Flow would do with the answers so far. Updates as you go.</p>
    <div class="kv"><div>Work type</div><div>${esc(WORK[work()]||'–')}</div><div>Customer</div><div>${esc(who)}</div>
      ${state.selectedAccount?`<div>Account</div><div>${esc(state.selectedAccount.account_number)} – ${esc(state.selectedAccount.elec_meter||'')}${state.selectedAccount.gas_meter?', gas '+esc(state.selectedAccount.gas_meter):''}</div>`:''}</div>
    <h4>Part 1 – where the account goes</h4>
    ${out.route ? `<div class="kcard"><strong>${esc(out.route.code)}</strong>${out.route.reason?` · <span class="reason">${out.route.reason}</span>`:''}<br>${esc(out.route.text)}</div>` : '<p class="small">Not decided yet.</p>'}
    <h4>Part 2 – each supply</h4>
    ${out.items.length ? out.items.map(it=>`<div class="kcard">
      <strong>${isNC()?`Property ${it.p+1} – `:''}${it.fuel==='electricity'?'Electricity':'Gas'}</strong><br>
      ${it.s?`<strong>${it.s}</strong>${it.reason?` · <span class="reason">${it.reason}</span>`:''}<br>${esc(it.kraken)}<br>`:''}
      ${it.upgradeType?`Upgrade type: ${esc(it.upgradeType)}<br>`:''}
      Customer sees: <strong>${STATUS[it.status].label}</strong>${it.waiting?' · 2-week follow-up email':''}
      ${it.flags.length?`<br><span class="small">Specialist review flags: ${esc(it.flags.join('; '))}</span>`:''}
      ${it.waiting && (it.flags.length||it.hold)?'<br><span class="small">Also held for specialist review.</span>':''}
    </div>`).join('') : '<p class="small">No supplies chosen yet.</p>'}
    ${state.submitted?`<h4>Saved</h4><p>Reference <strong>${esc(state.submitted.ref)}</strong> – ${state.submitted.saved?'saved to Supabase submissions':'not saved: '+esc(state.submitted.err)}</p>`:''}
    <h4>Route so far</h4><p class="small">${state.path.map(e=>e.p!=null&&isNC()&&/^C|^G[2-7]$/.test(e.id)?`${e.id}(P${e.p+1})`:e.id).join(' → ')}</p>
    <p><a href="?">Restart</a></p>`;
}

/* ===================== Start ===================== */
(function init(){
  const t = new URLSearchParams(location.search).get('type');
  if(t && WORK[t]) state.answers.A2 = {v:t};   // pre-selected from the page the customer came from
  render();
})();
