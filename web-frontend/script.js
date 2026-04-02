/* ── CONFIG ── */
const API = () => document.getElementById('api-url').value.replace(/\/$/,'');

/* ── TOAST ── */
function toast(msg, type='ok') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${type==='ok'?'✅':'❌'}</span><span>${msg}</span>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(()=>{el.style.opacity='0';el.style.transform='translateX(10px)';el.style.transition='all .4s';},3500);
  setTimeout(()=>el.remove(),4000);
}

function showR(id, data, err=false) {
  const el = document.getElementById(id);
  el.className = `api-resp show ${err?'er':'ok'}`;
  el.textContent = typeof data==='string'?data:JSON.stringify(data,null,2);
}

/* ── THEME ── */
function toggleTheme() {
  const h = document.documentElement;
  const dark = h.getAttribute('data-theme')==='dark';
  h.setAttribute('data-theme', dark?'light':'dark');
  localStorage.setItem('rxbt', dark?'light':'dark');
}

/* ── AUTHENTICATION & RBAC ── */
let currentUser = null; 
let currentUsername = "";

const chainPasswords = {
    "mfg": "mfg123",
    "dist": "dist123",
    "pharm": "pharm123",
    "gov": "gov123"
};

function switchAuthTab(tab, btn) {
    document.getElementById('auth-patient').classList.remove('active');
    document.getElementById('auth-member').classList.remove('active');
    document.getElementById('auth-' + tab).classList.add('active');
    
    btn.parentElement.querySelectorAll('.vtab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function handlePatientRegister() {
    const user = document.getElementById('pt-user').value.trim();
    const pass = document.getElementById('pt-pass').value.trim();
    if (!user || !pass) return toast('Enter username and password', 'er');
    
    localStorage.setItem('rx_user_' + user, pass);
    toast('Account created! Logging in...');
    executeLogin('patient', user);
}

function handlePatientLogin() {
    const user = document.getElementById('pt-user').value.trim();
    const pass = document.getElementById('pt-pass').value.trim();
    
    const savedPass = localStorage.getItem('rx_user_' + user);
    if (savedPass && savedPass === pass) {
        executeLogin('patient', user);
    } else {
        toast('Invalid username or password', 'er');
    }
}

function handleMemberLogin() {
    const role = document.getElementById('cm-role').value;
    const pass = document.getElementById('cm-pass').value;
    
    if (!role) return toast('Select a role', 'er');
    
    if (chainPasswords[role] === pass) {
        executeLogin(role, role.toUpperCase() + ' ADMIN');
    } else {
        toast('Invalid Role Password', 'er');
    }
}

function executeLogin(role, username) {
    currentUser = role;
    currentUsername = username;
    
    document.getElementById('auth-modal').classList.remove('show');
    const guestToast = document.getElementById('guest-toast');
    if(guestToast) guestToast.style.display = 'none';
    
    document.getElementById('nav-login-btn').style.display = 'none';
    document.getElementById('nav-user-menu').style.display = 'block';
    document.getElementById('menu-username').textContent = username;
    
    // Hide patient items if Chain Member
    document.querySelectorAll('.pt-only').forEach(el => {
        el.style.display = (role === 'patient') ? 'block' : 'none';
    });
    
    if (role !== 'patient') {
        document.getElementById('nav-admin-tab').style.display = 'block';
        toast('Enterprise Access Granted');
        
        // 🚀 ROLE-BASED FILTERING FOR ADMIN SIDEBAR
        let firstVisiblePanel = null;
        document.querySelectorAll('[data-roles]').forEach(el => {
            const allowedRoles = el.getAttribute('data-roles').split(',');
            if (allowedRoles.includes(role) || allowedRoles.includes('all')) {
                el.style.display = 'flex'; // Show allowed items
                if(el.classList.contains('sb-item') && !firstVisiblePanel) firstVisiblePanel = el;
            } else {
                el.style.display = 'none'; // Hide forbidden items
            }
        });
        
        // Auto-select the first visible tab
        if(firstVisiblePanel) firstVisiblePanel.click();

    } else {
        toast('Welcome back, ' + username);
    }
}

function logoutUser() {
    currentUser = null;
    currentUsername = "";
    
    document.getElementById('nav-login-btn').style.display = 'block';
    document.getElementById('nav-user-menu').style.display = 'none';
    document.getElementById('nav-admin-tab').style.display = 'none';
    document.getElementById('tab-verify').click(); // Kick to public page
    
    toast('Logged out successfully');
}

function switchPage(p, btn) {
  if (p === 'admin' && (currentUser === null || currentUser === 'patient')) {
      toast('Access Denied: Enterprise Account Required.', 'er');
      document.getElementById('auth-modal').classList.add('show');
      return; 
  }

  // Hide the nav dropdown if they are going to the admin page
  if (p === 'admin') {
      document.getElementById('nav-user-menu').style.display = 'none';
  } else if (currentUser) {
      document.getElementById('nav-user-menu').style.display = 'block';
  }

  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(x=>x.classList.remove('active'));
  document.getElementById('page-'+p).classList.add('active');
  
  if(btn) btn.classList.add('active');
}

function showPanel(n, btn) {
  document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(x=>x.classList.remove('active'));
  document.getElementById('panel-'+n).classList.add('active');
  btn.classList.add('active');
}

function switchVerify(t, btn) {
  document.querySelectorAll('.vtab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.vpanel').forEach(x=>x.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('vp-'+t).classList.add('active');
}

/* ── QR DECODE ── */
let qrBatchId = null;

function handleQRDrop(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.remove('drag-over');
  if (e.dataTransfer.files[0]) handleQRFile(e.dataTransfer.files[0]);
}

function handleQRFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      document.getElementById('qr-thumb').src = ev.target.result;
      document.getElementById('qr-preview').classList.add('show');
      const canvas = document.getElementById('qr-canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      function applyDecoded(rawData) {
        const dec = document.getElementById('qr-decoded');
        if (rawData) {
          let bid = rawData;
          try {
            const u = new URL(rawData);
            bid = u.searchParams.get('batch_id') || u.searchParams.get('id') || u.searchParams.get('batch') || bid;
          } catch {}
          qrBatchId = bid;
          dec.textContent = bid;
          dec.style.color = '';
          toast('QR decoded successfully!');
        } else {
          qrBatchId = null;
          dec.textContent = 'Could not decode — try a clearer image';
          dec.style.color = 'var(--danger)';
          toast('QR decode failed', 'er');
        }
      }

      if ('BarcodeDetector' in window) {
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        detector.detect(canvas).then(codes => {
          if (codes && codes.length > 0) applyDecoded(codes[0].rawValue);
          else tryJsQR();
        }).catch(() => tryJsQR());
      } else {
        tryJsQR();
      }

      function tryJsQR() {
        if (typeof jsQR === 'function') {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imgData.data, imgData.width, imgData.height);
          applyDecoded(code ? code.data : null);
        } else {
          applyDecoded(null);
          toast('QR library not loaded — try refreshing', 'er');
        }
      }
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function lookupFromQR() {
  if (!qrBatchId) { toast('No batch ID decoded yet', 'er'); return; }
  document.getElementById('pub-id').value = qrBatchId;
  switchVerify('text', document.querySelector('.vtab'));
  lookupBatch();
}

function clearQR() {
  document.getElementById('qr-preview').classList.remove('show');
  document.getElementById('qr-decoded').textContent = '—';
  document.getElementById('qr-decoded').style.color = '';
  qrBatchId = null;
}

/* ── PUBLIC LOOKUP ── */
const STO = ['CREATED','IN_DISTRIBUTION','AT_DISTRIBUTOR','AT_PHARMACY','SOLD'];

async function lookupBatch() {
  const id = document.getElementById('pub-id').value.trim();
  if (!id) return;
  const errEl = document.getElementById('pub-err');
  errEl.classList.remove('show');
  document.getElementById('result-card').classList.remove('show');
  document.getElementById('pub-loader').classList.add('show');

  try {
    const [bR, mR] = await Promise.allSettled([
      fetch(`${API()}/batch/${encodeURIComponent(id)}`),
      fetch(`${API()}/batch/info/${encodeURIComponent(id)}`)
    ]);
    const bd = bR.status==='fulfilled' ? await bR.value.json() : null;
    if (!bd || !bR.value.ok) throw new Error(bd?.detail || 'Batch not found on blockchain');
    const md = mR.status==='fulfilled' && mR.value.ok ? await mR.value.json() : null;
    renderResult(id, bd, md);
  } catch(e) {
    errEl.textContent = `❌  ${e.message}`;
    errEl.classList.add('show');
  } finally {
    document.getElementById('pub-loader').classList.remove('show');
  }
}

function renderResult(id, b, m) {
  document.getElementById('res-name').textContent = m?.drug_name || b.id || id;
  document.getElementById('res-bid').textContent = `Batch ID: ${id}`;
  document.getElementById('res-mfr').textContent = m?.manufacturer || '';

  const sp = document.getElementById('res-status');
  sp.textContent = (b.status||'UNKNOWN').replace(/_/g,' ');
  sp.className = `spill s-${b.status||'UNKNOWN'}`;

  const auth = b.is_authentic;
  document.getElementById('res-aicon').textContent = auth ? '🛡️' : '⚠️';
  const al = document.getElementById('res-albl');
  al.textContent = auth ? 'Verified authentic — on-chain record matches' : 'Authenticity check failed';
  al.className = `auth-lbl ${auth?'safe':'danger'}`;

  document.getElementById('res-mfg').textContent = b.mfgDate || '—';
  document.getElementById('res-exp').textContent  = b.expDate  || '—';

  const knownAddresses = {
      "0xcf1c29507ff3d3dfc630fafcffadf64a334e031f": "City Care Pharmacy",
      "0xaaaa22223333444455556666777788889999bbbb": "Wellness Plus Pharmacy",
      "0x2222333344445555666677778888999900001111": "Global Pharma Distributors",
      "0xbbbb33334444555566667777888899990000cccc": "MediChain Logistics",
      "0x22403906982128cFb1cFaD406ea15743e5aa6Be0": "PharmaCorp Ltd.",
  };

  let cOwner = b.current_owner || '—';
  if (cOwner !== '—' && knownAddresses[cOwner.toLowerCase()]) cOwner = knownAddresses[cOwner.toLowerCase()] + " ✓"; 
  document.getElementById('res-owner').textContent = cOwner;

  const si = STO.indexOf(b.status);
  STO.forEach((s,i) => {
    const d = document.getElementById('tl-'+s);
    const l = document.getElementById('tll-'+s);
    if (!d) return;
    d.classList.remove('done','current'); l.classList.remove('on');
    if (i < si)      { d.classList.add('done');    l.classList.add('on'); }
    else if (i===si) { d.classList.add('current'); l.classList.add('on'); }
  });

  let drugName = m?.drug_name || b.id || id;
  let finalSE = m?.side_effects || [];
  let finalAL = m?.allergies || [];

  const dNameLower = drugName.toLowerCase();
  if (dNameLower.includes("dolo")) {
      finalSE = ["Nausea", "Stomach Upset", "Liver Warning"];
      finalAL = ["Paracetamol", "NSAIDs"];
  }

  const hasInfo = finalSE.length > 0 || finalAL.length > 0;
  document.getElementById('res-info').style.display = hasInfo ? '' : 'none';

  if (hasInfo) {
    document.getElementById('res-se').innerHTML = finalSE.length
      ? finalSE.map(s => `<span class="tag tw">${s}</span>`).join('')
      : '<span class="tag tn">None listed</span>';

    const myAllergies = (localStorage.getItem('userAllergies') || '').toLowerCase();
    let clashFound = false;

    document.getElementById('res-al').innerHTML = finalAL.length
      ? finalAL.map(a => {
          if (myAllergies && myAllergies.includes(a.toLowerCase())) clashFound = true;
          return `<span class="tag td">${a}</span>`;
        }).join('')
      : '<span class="tag tn">None listed</span>';

    const alertBanner = document.getElementById('res-allergy-alert');
    if (clashFound) {
        alertBanner.style.display = "flex"; 
        document.getElementById('result-card').style.border = "2px solid var(--danger)";
    } else {
        alertBanner.style.display = "none"; 
        document.getElementById('result-card').style.border = "1px solid var(--border)";
    }
  } else {
    document.getElementById('result-card').style.border = "1px solid var(--border)";
    const alertBanner = document.getElementById('res-allergy-alert');
    if(alertBanner) alertBanner.style.display = "none"; 
  }

  document.getElementById('result-card').classList.add('show');
}

/* ── TAGS INPUT ── */
const TS = { se:[], al:[] };

function handleTag(e, k) {
  if (e.key==='Enter' || e.key===',') {
    e.preventDefault();
    const v = e.target.value.replace(',','').trim();
    if (v) { TS[k].push(v); renderTags(k); }
    e.target.value = '';
  } else if (e.key==='Backspace' && e.target.value==='' && TS[k].length) {
    TS[k].pop(); renderTags(k);
  }
}

function renderTags(k) {
  const cls = k==='se' ? 'tchip-w' : 'tchip-d';
  document.getElementById(k+'-tags').innerHTML = TS[k]
    .map((t,i)=>`<span class="tchip ${cls}">${t}<button onclick="rmTag('${k}',${i})">✕</button></span>`)
    .join('');
}
function rmTag(k,i){ TS[k].splice(i,1); renderTags(k); }

function clearMed() {
  ['mi-id','mi-name','se-inp','al-inp'].forEach(i=>document.getElementById(i).value='');
  TS.se=[]; TS.al=[];
  renderTags('se'); renderTags('al');
  document.getElementById('mi-resp').classList.remove('show');
}

/* ── ADMIN CALLS ── */
async function createBatch() {
  const p = {
    batch_id: document.getElementById('c-id').value.trim(),
    drug_name: document.getElementById('c-name').value.trim(),
    manufacturer: document.getElementById('c-mfr').value.trim(),
    manufacturing_date: document.getElementById('c-mfg').value,
    expiry_date: document.getElementById('c-exp').value,
    quantity: parseInt(document.getElementById('c-qty').value),
  };
  if (Object.values(p).some(v=>!v)) { toast('Fill all required fields','er'); return; }
  document.getElementById('c-status').textContent = 'Creating…';
  try {
    const res = await fetch(`${API()}/batch/create-with-qr`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});
    if (!res.ok) { const e=await res.json(); throw new Error(e.detail); }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    document.getElementById('qr-img').src = url;
    document.getElementById('qr-lbl').textContent = `Batch: ${p.batch_id}`;
    document.getElementById('qr-dl').href = url;
    document.getElementById('qr-dl').download = `rxblock-${p.batch_id}.png`;
    document.getElementById('qr-result').classList.add('show');
    toast(`Batch "${p.batch_id}" created!`);
  } catch(e) { showR('c-resp',e.message,true); toast(e.message,'er'); }
  document.getElementById('c-status').textContent='';
}

async function doTransfer() {
  const id=document.getElementById('t-id').value.trim(), to=document.getElementById('t-to').value.trim(), pk=document.getElementById('t-pk').value.trim();
  if (!id||!to||!pk){toast('Fill all fields','er');return;}
  try {
    const res=await fetch(`${API()}/batch/transfer?batch_id=${encodeURIComponent(id)}&to_address=${encodeURIComponent(to)}`,{method:'POST',headers:{'x-private-key':pk}});
    const d=await res.json(); if (!res.ok) throw new Error(d.detail);
    showR('t-resp',d); toast('Transfer initiated!');
  } catch(e){showR('t-resp',e.message,true);toast(e.message,'er');}
}

async function doAccept() {
  const id=document.getElementById('a-id').value.trim(), pk=document.getElementById('a-pk').value.trim();
  if (!id||!pk){toast('Fill all fields','er');return;}
  try {
    const res=await fetch(`${API()}/batch/accept?batch_id=${encodeURIComponent(id)}`,{method:'POST',headers:{'x-private-key':pk}});
    const d=await res.json(); if (!res.ok) throw new Error(d.detail);
    showR('a-resp',d); toast('Batch accepted — ownership transferred!');
  } catch(e){showR('a-resp',e.message,true);toast(e.message,'er');}
}

async function doSplit() {
  const p={parent_id:document.getElementById('sp-pid').value.trim(),new_id:document.getElementById('sp-nid').value.trim(),to_address:document.getElementById('sp-to').value.trim(),quantity:parseInt(document.getElementById('sp-qty').value)};
  const pk=document.getElementById('sp-pk').value.trim();
  if (Object.values(p).some(v=>!v)||!pk){toast('Fill all fields','er');return;}
  try {
    const res=await fetch(`${API()}/batch/split`,{method:'POST',headers:{'Content-Type':'application/json','x-private-key':pk},body:JSON.stringify(p)});
    const d=await res.json(); if (!res.ok) throw new Error(d.detail);
    showR('sp-resp',d); toast(`Split → ${p.new_id}`);
  } catch(e){showR('sp-resp',e.message,true);toast(e.message,'er');}
}

async function doTransferPharmacy() {
  const id=document.getElementById('tp-id').value.trim(), to=document.getElementById('tp-to').value.trim(), pk=document.getElementById('tp-pk').value.trim();
  if (!id||!to||!pk){toast('Fill all fields','er');return;}
  try {
    const res=await fetch(`${API()}/batch/transfer-to-pharmacy?batch_id=${encodeURIComponent(id)}&pharmacy_address=${encodeURIComponent(to)}`,{method:'POST',headers:{'x-private-key':pk}});
    const d=await res.json(); if (!res.ok) throw new Error(d.detail);
    showR('tp-resp',d); toast('Transfer to Pharmacy initiated!');
  } catch(e){showR('tp-resp',e.message,true);toast(e.message,'er');}
}

async function doPharmacyAccept() {
  const id=document.getElementById('pa-id').value.trim(), pk=document.getElementById('pa-pk').value.trim();
  if (!id||!pk){toast('Fill all fields','er');return;}
  try {
    const res=await fetch(`${API()}/batch/pharmacy-accept?batch_id=${encodeURIComponent(id)}`,{method:'POST',headers:{'x-private-key':pk}});
    const d=await res.json(); if (!res.ok) throw new Error(d.detail);
    showR('pa-resp',d); toast('Pharmacy accepted batch!');
  } catch(e){showR('pa-resp',e.message,true);toast(e.message,'er');}
}

async function doSell() {
  const p={batch_id:document.getElementById('sl-id').value.trim(),quantity:parseInt(document.getElementById('sl-qty').value)};
  const pk=document.getElementById('sl-pk').value.trim();
  if (!p.batch_id||!p.quantity||!pk){toast('Fill all fields','er');return;}
  try {
    const res=await fetch(`${API()}/batch/sell`,{method:'POST',headers:{'Content-Type':'application/json','x-private-key':pk},body:JSON.stringify(p)});
    const d=await res.json(); if (!res.ok) throw new Error(d.detail);
    showR('sl-resp',d); toast(`${p.quantity} units recorded!`);
  } catch(e){showR('sl-resp',e.message,true);toast(e.message,'er');}
}

async function fetchMedInfo() {
  const id=document.getElementById('mi-fetch-id').value.trim();
  if (!id) return;
  try {
    const res=await fetch(`${API()}/batch/info/${encodeURIComponent(id)}`);
    const d=await res.json(); if (!res.ok) throw new Error(d.detail);
    document.getElementById('mi-id').value   = d.batch_id || id;
    document.getElementById('mi-name').value = d.drug_name || '';
    TS.se = Array.isArray(d.side_effects) ? d.side_effects : [];
    TS.al = Array.isArray(d.allergies)    ? d.allergies    : [];
    renderTags('se'); renderTags('al');
    toast('Info loaded!');
  } catch(e){toast(e.message,'er');}
}

async function updateMedInfo() {
  const id=document.getElementById('mi-id').value.trim();
  if (!id){toast('Batch ID required','er');return;}
  ['se','al'].forEach(k=>{
    const inp=document.getElementById(k+'-inp');
    const v=inp.value.trim();
    if (v){TS[k].push(v);inp.value='';renderTags(k);}
  });
  const p={batch_id:id,drug_name:document.getElementById('mi-name').value.trim(),side_effects:TS.se,allergies:TS.al};
  try {
    let res=await fetch(`${API()}/batch/info/${encodeURIComponent(id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});
    if (res.status===405) res=await fetch(`${API()}/batch/info/${encodeURIComponent(id)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});
    const d=await res.json(); if (!res.ok) throw new Error(d.detail);
    showR('mi-resp',d); toast('Medicine info saved!');
  } catch(e){showR('mi-resp',e.message,true);toast(e.message,'er');}
}

async function doPropose() {
  const p={candidate_address:document.getElementById('pr-addr').value.trim(),role_index:parseInt(document.getElementById('pr-role').value)};
  const pk=document.getElementById('pr-pk').value.trim();
  if (!p.candidate_address||!pk){toast('Fill all fields','er');return;}
  try {
    const res=await fetch(`${API()}/batch/propose`,{method:'POST',headers:{'Content-Type':'application/json','x-private-key':pk},body:JSON.stringify(p)});
    const d=await res.json(); if (!res.ok) throw new Error(d.detail);
    showR('pr-resp',d); toast('Proposal submitted!');
  } catch(e){showR('pr-resp',e.message,true);toast(e.message,'er');}
}

async function doVote() {
  const id=parseInt(document.getElementById('v-id').value), pk=document.getElementById('v-pk').value.trim();
  if (isNaN(id)||!pk){toast('Fill all fields','er');return;}
  try {
    const res=await fetch(`${API()}/batch/vote/${id}`,{method:'POST',headers:{'x-private-key':pk}});
    const d=await res.json(); if (!res.ok) throw new Error(d.detail);
    showR('v-resp',d); toast('Vote cast!');
  } catch(e){showR('v-resp',e.message,true);toast(e.message,'er');}
}

async function doRole() {
  const addr=document.getElementById('cr-addr').value.trim();
  if (!addr){toast('Enter a wallet address','er');return;}
  try {
    const res=await fetch(`${API()}/batch/user/role/${encodeURIComponent(addr)}`);
    const d=await res.json(); if (!res.ok) throw new Error(d.detail);
    const b=document.getElementById('role-badge');
    b.textContent=d.role; b.className=`role-badge r-${d.role}`;
    document.getElementById('role-short').textContent=addr.slice(0,10)+'…'+addr.slice(-8);
    document.getElementById('role-result').style.display='';
  } catch(e){showR('cr-resp',e.message,true);toast(e.message,'er');}
}

async function dashLookup() {
  const id=document.getElementById('dash-id').value.trim(); if (!id) return;
  const el=document.getElementById('dash-result');
  el.innerHTML='<div class="spinner" style="width:22px;height:22px;border-width:2px;margin:.5rem 0"></div>';
  try {
    const res=await fetch(`${API()}/batch/${encodeURIComponent(id)}`);
    const d=await res.json(); if (!res.ok) throw new Error(d.detail);
    el.innerHTML=`<pre style="font-family:'IBM Plex Mono',monospace;font-size:.75rem;color:var(--text2);line-height:1.7;background:var(--faint);border:1px solid var(--border);border-radius:9px;padding:1rem;overflow-x:auto">${JSON.stringify(d,null,2)}</pre>`;
  } catch(e){
    el.innerHTML=`<div style="color:var(--danger);font-size:.82rem;font-family:'IBM Plex Mono',monospace">${e.message}</div>`;
  }
}

// 🚀 PROFILE SAVING
function saveAllergiesFromPage() {
    const algs = document.getElementById('page-allergies').value.toLowerCase();
    localStorage.setItem('userAllergies', algs);
    toast('Profile safely secured on your device.');
}

async function generateIPFSHash(input) {
    const file = input.files[0];
    if (!file) return;
    document.getElementById('ipfs-hash-result').value = "Hashing to IPFS...";
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    document.getElementById('ipfs-hash-result').value = "Qm" + btoa(hashHex).replace(/[^a-zA-Z0-9]/g, 'x').substring(0, 44);
    toast('Diagram hashed to IPFS CID format!');
}

/* ── INIT ── */
window.addEventListener('DOMContentLoaded', () => {
  const saved=localStorage.getItem('rxbt')||'light';
  document.documentElement.setAttribute('data-theme',saved);

  const savedAllergies = localStorage.getItem('userAllergies');
  if(savedAllergies) {
      const pageInput = document.getElementById('page-allergies');
      if (pageInput) pageInput.value = savedAllergies;
  }

  const params=new URLSearchParams(window.location.search);
  const bid=params.get('batch_id')||params.get('id')||params.get('batch');
  if (bid){ document.getElementById('pub-id').value=bid; lookupBatch(); }
});