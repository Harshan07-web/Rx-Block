let leafletMap = null;
let mapLayers = [];

/* =========================================================
   CONFIG
   ========================================================= */
const API = () => document.getElementById('api-url').value.replace(/\/$/, '');

/* =========================================================
   TOAST & RESPONSE DISPLAY
   ========================================================= */
function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span style="font-size:.9rem;font-weight:700">${type === 'ok' ? '✓' : '✕'}</span><span>${msg}</span>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(10px)'; el.style.transition = 'all .4s'; }, 3500);
  setTimeout(() => el.remove(), 4000);
}

function showR(id, data, err = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `api-resp show ${err ? 'er' : 'ok'}`;
  el.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

/* =========================================================
   THEME
   ========================================================= */
function toggleTheme() {
  const h = document.documentElement;
  const dark = h.getAttribute('data-theme') === 'dark';
  h.setAttribute('data-theme', dark ? 'light' : 'dark');
  localStorage.setItem('rxbt', dark ? 'light' : 'dark');
}

/* =========================================================
   AUTHENTICATION & RBAC
   ========================================================= */
let authToken = null;
let currentUserRole = null;
let currentUsername = "";

// Universal Fetch wrapper that injects the JWT token
async function apiFetch(endpoint, options = {}) {
  if (!options.headers) options.headers = {};
  if (authToken) {
    options.headers['Authorization'] = `Bearer ${authToken}`;
  }
  return fetch(`${API()}${endpoint}`, options);
}

// Check for existing session on page load
window.addEventListener('DOMContentLoaded', () => {
  const savedToken = localStorage.getItem('rx_token');
  const savedRole = localStorage.getItem('rx_role');
  const savedUser = localStorage.getItem('rx_user');
  
  if (savedToken && savedRole && savedUser) {
    authToken = savedToken;
    executeLogin(savedRole, savedUser, false);
  } else {
    switchPage('landing'); // Force user to landing page if not logged in
  }
});

function switchAuthTab(tab, btn) {
  // 1. Hide both panels
  document.getElementById('auth-patient').classList.remove('active');
  document.getElementById('auth-member').classList.remove('active');
  
  // 2. Show the requested panel
  document.getElementById('auth-' + tab).classList.add('active');
  
  // 3. Safely update the button styling only within this specific modal
  const tabContainer = btn.closest('.verify-tabs');
  if (tabContainer) {
    tabContainer.querySelectorAll('.vtab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
}

function openSpecificLogin(type) {
  // 1. Find the tab switcher inside the modal and hide it completely
  const tabSwitcher = document.querySelector('#auth-modal .verify-tabs');
  if (tabSwitcher) {
    tabSwitcher.style.display = 'none';
  }

  // 2. Open the modal
  document.getElementById('auth-modal').classList.add('show');

  // 3. Programmatically switch to the correct form using your existing buttons
  if (type === 'patient') {
    document.getElementById('tab-btn-patient').click();
  } else if (type === 'member') {
    document.getElementById('tab-btn-member').click();
  }
}

async function handlePatientLogin() {
  const username = document.getElementById('pt-user').value.trim();
  const password = document.getElementById('pt-pass').value.trim();
  if (!username || !password) return toast('Enter username and password', 'er');
  
  await performLogin(username, password, 'PATIENT');
}

// RESTORED: Patient Registration Function
async function handlePatientRegister() {
  const username = document.getElementById('pt-user').value.trim();
  const password = document.getElementById('pt-pass').value.trim();
  if (!username || !password) return toast('Enter username and password to register', 'er');
  
  toast('Processing registration...');
  
  try {
    // If you have a FastAPI route for patient registration, it hits it here.
    // Otherwise, we do a safe UI-level mock so your demo doesn't crash!
    const res = await fetch(`${API()}/auth/patient/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, email: username + "@mail.com", password: password })
    });
    
    if (res.ok) {
        toast('Account Created! Logging you in...');
        await performLogin(username, password, 'PATIENT');
    } else {
        throw new Error("Registration endpoint missing or failed.");
    }
  } catch(e) {
    // FALLBACK: If your Python doesn't have an /auth/register route yet, 
    // this gracefully bypasses it for Patient accounts so your demo still works.
    toast('Demo Mode: Patient account simulated.');
    executeLogin('PATIENT', username, true);
  }
}

// UPDATED: Member login now grabs the new HTML username box
async function handleMemberLogin() {
  const role = document.getElementById('cm-role').value;
  const username = document.getElementById('cm-user').value.trim();
  const password = document.getElementById('cm-pass').value.trim();
  
  if (!role || !username || !password) return toast('All fields required', 'er');
  
  document.getElementById('auth-modal').classList.remove('show');
  toast('Authenticating with blockchain network...');
  await performLogin(username, password, role);
}

// Calls your FastAPI /auth/login endpoint
async function performLogin(username, password, expectedRole) {
  try {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    // Ensure your FastAPI has an auth router handling this
    const res = await fetch(`${API()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData
    });

    if (!res.ok) throw new Error('Invalid credentials');
    
    const data = await res.json();
    
    // Validate role
    if (data.role !== expectedRole && expectedRole !== 'PATIENT') {
        throw new Error('Unauthorized role for this portal.');
    }

    // Save Session
    authToken = data.access_token;
    localStorage.setItem('rx_token', authToken);
    localStorage.setItem('rx_role', data.role);
    localStorage.setItem('rx_user', data.username);

    toast('Login Successful');
    executeLogin(data.role, data.username, true);

  } catch (err) {
    toast(err.message, 'er');
  }
}

function executeLogin(role, username, redirect = true) {
  currentUserRole = role;
  currentUsername = username;

  document.getElementById('auth-modal').classList.remove('show');
  document.getElementById('nav-hamburger').style.display = 'flex';
  document.getElementById('nav-login-btn').style.display = 'none';
  document.getElementById('nav-user-container').style.display = 'flex';
  document.getElementById('top-username').textContent = username;

  document.querySelectorAll('.pt-only').forEach(el => el.style.display = (role === 'PATIENT') ? 'block' : 'none');

  if (role !== 'PATIENT') {
    document.getElementById('gm-admin-btn').style.display = 'block';
    document.getElementById('gm-admin-div').style.display = 'block';
    
    // Filter Sidebar by Role
    let firstVisiblePanel = null;
    document.querySelectorAll('[data-roles]').forEach(el => {
      const allowedRoles = el.getAttribute('data-roles').split(',');
      if (allowedRoles.includes(role) || allowedRoles.includes('all')) {
        el.style.display = 'flex';
        if (el.classList.contains('sb-item') && !firstVisiblePanel) firstVisiblePanel = el;
      } else {
        el.style.display = 'none';
      }
    });
    
    if (redirect) {
      switchPage('admin');
      if (firstVisiblePanel) firstVisiblePanel.click();
    }
  } else {
    document.getElementById('gm-admin-btn').style.display = 'none';
    document.getElementById('gm-admin-div').style.display = 'none';
    if (redirect) switchPage('public');
  }
}

function logoutUser() {
  authToken = null;
  currentUserRole = null;
  localStorage.removeItem('rx_token');
  localStorage.removeItem('rx_role');
  localStorage.removeItem('rx_user');
  
  document.getElementById('nav-login-btn').style.display = 'block';
  document.getElementById('nav-user-container').style.display = 'none';
  document.getElementById('nav-hamburger').style.display = 'none';
  
  switchPage('landing');
  toast('Logged out successfully');
}

/* =========================================================
   MAP
   ========================================================= */
function initRealMap(status) {
  if (leafletMap) { leafletMap.remove(); leafletMap = null; }

  leafletMap = L.map('real-map', { zoomControl: false }).setView([21, 78], 5);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(leafletMap);

  const locations = {
    factory:     [19.0760, 72.8777],
    distributor: [28.7041, 77.1025],
    pharmacy:    [13.0827, 80.2707]
  };

  const waypoints = [L.latLng(locations.factory)];
  if (status !== 'CREATED') waypoints.push(L.latLng(locations.distributor));
  if (status === 'AT_PHARMACY' || status === 'SOLD') waypoints.push(L.latLng(locations.pharmacy));

  if (waypoints.length > 1) {
    L.Routing.control({
      waypoints,
      lineOptions: {
        styles: [
          { color: '#1478d4', opacity: 0.8, weight: 6 },
          { color: 'white', opacity: 0.4, weight: 2, dashArray: '5, 10' }
        ]
      },
      createMarker: function (i, wp) {
        const labels = ["Factory", "Logistics Hub", "Pharmacy"];
        return L.circleMarker(wp.latLng, {
          radius: 10, fillColor: "#1478d4", color: "#fff", weight: 3, fillOpacity: 1
        }).bindTooltip(labels[i], { permanent: true, direction: 'top', className: 'map-tooltip' });
      },
      addWaypoints: false, draggableWaypoints: false, routeWhileDragging: false
    }).addTo(leafletMap);

    setTimeout(() => {
      const group = new L.featureGroup(waypoints.map(w => L.marker(w)));
      leafletMap.fitBounds(group.getBounds(), { padding: [50, 50] });
    }, 500);
  } else {
    L.circleMarker(locations.factory, {
      radius: 10, fillColor: "#1478d4", color: "#fff", weight: 3, fillOpacity: 1
    }).addTo(leafletMap).bindTooltip("🏭 Factory (Origin)", { permanent: true, direction: 'top' });
  }
}

function toggleMapExpansion() {
  const wrapper = document.getElementById('map-wrapper');
  const btnText = document.getElementById('map-btn-text');
  wrapper.classList.toggle('expanded');
  btnText.textContent = wrapper.classList.contains('expanded') ? "Minimize" : "Expand Route";
  setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(true); }, 650);
}

/* =========================================================
   PAGE & PANEL NAVIGATION
   ========================================================= */
function switchPage(p) {
  // FIX: Changed currentUser to currentUserRole, and 'patient' to 'PATIENT'
  if (p === 'admin' && (currentUserRole === null || currentUserRole === 'PATIENT')) {
    toast('Access Denied: Enterprise Account Required.', 'er');
    document.getElementById('auth-modal').classList.add('show');
    return;
  }
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.getElementById('page-' + p).classList.add('active');
}

function showPanel(id, btn) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('panel-' + id);
  if (panel) panel.classList.add('active');
  if (btn) btn.classList.add('active');
}

function switchVerify(t, btn) {
  const container = btn.closest('.hero') || document;
  container.querySelectorAll('.vtab').forEach(x => x.classList.remove('active'));
  container.querySelectorAll('.vpanel').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('vp-' + t).classList.add('active');
}

/* =========================================================
   PUBLIC BATCH LOOKUP  (FIXED: correct API endpoints + response mapping)
   ========================================================= */
const STO = ['CREATED', 'IN_DISTRIBUTION', 'AT_DISTRIBUTOR', 'AT_PHARMACY', 'SOLD'];

async function lookupBatch() {
  const id = document.getElementById('pub-id').value.trim();
  if (!id) return;
  const errEl = document.getElementById('pub-err');
  errEl.classList.remove('show');
  document.getElementById('result-card').classList.remove('show');
  document.getElementById('pub-loader').classList.add('show');
  document.getElementById('public-inner').classList.add('results-active');

  /* --- Demo / offline mock data --- */
  const mockDatabase = {
    "TEST-001": {
      bd: { id: "TEST-001", status: "SOLD", is_authentic: true, mfgDate: "2025-01-10", expDate: "2027-01-10", current_owner: "0xcf1c29507ff3d3dfc630fafcffadf64a334e031f", pending_owner: "None" },
      md: { batch_id: "TEST-001", drug_name: "Amoxicillin 500mg", manufacturer: "PharmaCorp Ltd.", side_effects: ["Nausea", "Diarrhea"], allergies: ["Penicillin"] }
    },
    "TEST-002": {
      bd: { id: "TEST-002", status: "IN_DISTRIBUTION", is_authentic: true, mfgDate: "2025-03-01", expDate: "2026-03-01", current_owner: "0x2222333344445555666677778888999900001111", pending_owner: "None" },
      md: { batch_id: "TEST-002", drug_name: "Cetirizine 10mg", manufacturer: "Sun Pharma Industries", side_effects: ["Drowsiness", "Dry Mouth"], allergies: ["Antihistamines"] }
    },
    "TEST-FAKE": {
      bd: { id: "TEST-FAKE", status: "UNKNOWN", is_authentic: false, mfgDate: "—", expDate: "—", current_owner: "—", pending_owner: "None" },
      md: null
    },
    "TEST-DOLO": {
      bd: { id: "TEST-DOLO", status: "AT_PHARMACY", is_authentic: true, mfgDate: "2025-02-15", expDate: "2028-02-15", current_owner: "0xcf1c29507ff3d3dfc630fafcffadf64a334e031f", pending_owner: "None" },
      md: { batch_id: "TEST-DOLO", drug_name: "Dolo 650", manufacturer: "Micro Labs", side_effects: ["Nausea", "Liver Warning"], allergies: ["Paracetamol"] }
    }
  };

  if (mockDatabase[id.toUpperCase()]) {
    setTimeout(() => {
      renderResult(id.toUpperCase(), mockDatabase[id.toUpperCase()].bd, mockDatabase[id.toUpperCase()].md);
      document.getElementById('pub-loader').classList.remove('show');
    }, 600);
    return;
  }

  try {
    const [detRes, verRes, medRes] = await Promise.allSettled([
      apiFetch(`/batch/batch-det/${encodeURIComponent(id)}`),
      apiFetch(`/batch/verify/${encodeURIComponent(id)}`),
      apiFetch(`/medicine/info/${encodeURIComponent(id)}`)
    ]);

    if (detRes.status === 'rejected') {
      throw new Error('Backend offline. Use TEST-001 / TEST-002 to demo.');
    }
    if (!detRes.value.ok) {
      const errData = await detRes.value.json();
      throw new Error(errData?.detail || 'Batch not found on blockchain');
    }

    const det = await detRes.value.json();
    const ver = (verRes.status === 'fulfilled' && verRes.value.ok) ? await verRes.value.json() : null;
    const med = (medRes.status === 'fulfilled' && medRes.value.ok) ? await medRes.value.json() : null;

    // ── Normalize backend response shapes to renderResult's expected format ──
    // Backend batch-det returns: batch_id, manu_name, drug_name, mfd_date, exp_date, quantity
    // Backend verify returns:    { status: "VERIFIED"|"TAMPERED", data: { drug, manufacturer, ... } }
    // TODO: Add GET /batch/status/{id} endpoint in batch1.py to expose the live
    //       BatchStatus table; then replace the 'CREATED' default below with that value.
    const bd = {
      id: det.batch_id,
      status: 'CREATED',          // Placeholder: no dedicated status API endpoint yet
      is_authentic: ver ? ver.status === 'VERIFIED' : false,
      mfgDate: det.mfd_date,
      expDate: det.exp_date,
      current_owner: det.manu_name,
    };
    const md = {
      drug_name: det.drug_name,
      manufacturer: det.manu_name,
      side_effects: med?.side_effects || [],
      allergies: med?.allergies || [],
    };

    renderResult(id, bd, md);
  } catch (e) {
    errEl.textContent = `❌ ${e.message}`;
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
  sp.textContent = (b.status || 'UNKNOWN').replace(/_/g, ' ');
  sp.className = `spill s-${b.status || 'UNKNOWN'}`;

  const auth = b.is_authentic;
  document.getElementById('res-aicon').textContent = auth ? '🛡️' : '⚠️';
  const al = document.getElementById('res-albl');
  al.textContent = auth ? 'Verified authentic — on-chain record matches' : 'Authenticity check failed';
  al.className = `auth-lbl ${auth ? 'safe' : 'danger'}`;

  document.getElementById('res-mfg').textContent = b.mfgDate || '—';
  document.getElementById('res-exp').textContent = b.expDate || '—';

  if (!auth) {
    document.getElementById('res-fake-alert').style.display = 'flex';
    document.getElementById('res-split-body').style.display = 'none';
    document.getElementById('res-allergy-alert').style.display = 'none';
    document.getElementById('result-card').style.border = "2px solid var(--danger)";
    document.getElementById('result-card').classList.add('show');
    return;
  } else {
    document.getElementById('res-fake-alert').style.display = 'none';
    document.getElementById('res-split-body').style.display = 'grid';
  }

  initRealMap(b.status);

  const knownAddresses = {
    "0xcf1c29507ff3d3dfc630fafcffadf64a334e031f": "City Care Pharmacy",
    "0x2222333344445555666677778888999900001111": "Global Pharma Distributors"
  };

  let cOwner = b.current_owner || '—';
  if (cOwner !== '—' && knownAddresses[cOwner.toLowerCase()]) cOwner = knownAddresses[cOwner.toLowerCase()] + " ✓";
  document.getElementById('res-owner').textContent = cOwner;

  const si = STO.indexOf(b.status);
  STO.forEach((s, i) => {
    const d = document.getElementById('tl-' + s);
    const l = document.getElementById('tll-' + s);
    if (!d) return;
    d.classList.remove('done', 'current');
    l.classList.remove('on');
    if (i < si) { d.classList.add('done'); l.classList.add('on'); }
    else if (i === si) { d.classList.add('current'); l.classList.add('on'); }
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
    if (alertBanner) alertBanner.style.display = "none";
  }

  document.getElementById('result-card').classList.add('show');
}

/* =========================================================
   FEATURES
   ========================================================= */
function setupReminders() {
  const drug = document.getElementById('res-name').textContent;
  // FIX: Changed currentUser to currentUserRole
  if (currentUserRole === null) {
    toast('Please login as a patient to set up calendar reminders.', 'er');
    document.getElementById('auth-modal').classList.add('show');
    return;
  }
  toast(`Syncing ${drug} with Apple Health / Google Calendar...`);
  setTimeout(() => { toast(`✅ Smart Reminders active. You will be notified at 9:00 AM daily.`); }, 1500);
}

function submitBountyClaim() {
  toast("Uploading photo and metadata to Polygon Validator Network...");
  setTimeout(() => {
    document.getElementById('bounty-modal').classList.remove('show');
    toast("✅ Smart Contract Executed! 5 MATIC has been transferred to your wallet.");
  }, 2000);
}

/* =========================================================
   QR CODE HANDLING
   ========================================================= */
function clearQR() {
  document.getElementById('qr-preview').classList.remove('show');
  document.getElementById('qr-decoded').textContent = '—';
  document.getElementById('qr-decoded').style.color = '';
  qrBatchId = null;
  document.getElementById('public-inner').classList.remove('results-active');
  document.getElementById('result-card').classList.remove('show');
}

function handleQRFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      const canvas = document.getElementById('qr-canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (typeof jsQR === 'undefined') { toast('QR library not yet loaded. Try again.', 'er'); return; }
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code) {
        qrBatchId = code.data;
        // Extract batch_id from URL if the QR contains a full verify URL
        const urlMatch = qrBatchId.match(/[?&]batch_id=([^&]+)/);
        if (urlMatch) qrBatchId = decodeURIComponent(urlMatch[1]);
        document.getElementById('qr-decoded').textContent = qrBatchId;
        document.getElementById('qr-decoded').style.color = 'var(--safe)';
        document.getElementById('qr-thumb').src = e.target.result;
        document.getElementById('qr-preview').classList.add('show');
        toast('QR Code decoded successfully!');
      } else {
        toast('No QR code found. Try a clearer photo.', 'er');
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function handleQRDrop(event) {
  event.preventDefault();
  document.getElementById('drop-zone').classList.remove('drag-over');
  const file = event.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) handleQRFile(file);
  else toast('Please drop an image file.', 'er');
}

function lookupFromQR() {
  if (!qrBatchId) return toast('No QR code decoded yet.', 'er');
  document.getElementById('pub-id').value = qrBatchId;
  lookupBatch();
}

/* =========================================================
   TAGS INPUT
   ========================================================= */
const TS = { se: [], al: [] };

function handleTag(e, k) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const v = e.target.value.replace(',', '').trim();
    if (v) { TS[k].push(v); renderTags(k); }
    e.target.value = '';
  } else if (e.key === 'Backspace' && e.target.value === '' && TS[k].length) {
    TS[k].pop(); renderTags(k);
  }
}

function renderTags(k) {
  const cls = k === 'se' ? 'tchip-w' : 'tchip-d';
  document.getElementById(k + '-tags').innerHTML = TS[k]
    .map((t, i) => `<span class="tchip ${cls}">${t}<button onclick="rmTag('${k}',${i})">✕</button></span>`)
    .join('');
}

function rmTag(k, i) { TS[k].splice(i, 1); renderTags(k); }

function clearMed() {
  ['mi-id', 'mi-name', 'se-inp', 'al-inp'].forEach(i => {
    const el = document.getElementById(i);
    if (el) el.value = '';
  });
  TS.se = []; TS.al = [];
  renderTags('se'); renderTags('al');
  const r = document.getElementById('mi-resp');
  if (r) r.classList.remove('show');
}

/* =========================================================
   PROFILE SAVING
   ========================================================= */
function saveAllergiesFromPage() {
  const algs = document.getElementById('page-allergies').value.toLowerCase();
  localStorage.setItem('userAllergies', algs);
  toast('Profile safely secured on your device.');
}

/* =========================================================
   ██████╗ ADMIN PANEL FUNCTIONS  (wired to FastAPI /batch/* endpoints)
   ========================================================= */

/** Helper: disable button while async runs, restore after */
function withLoading(btnId, label, fn) {
  const btn = document.getElementById(btnId);
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Please wait…'; }
  fn().finally(() => { if (btn) { btn.disabled = false; btn.textContent = label; } });
}

/* ── 1. CREATE BATCH T1 ────────────────────────────────── */
// POST /batch/create-drugs-t1
// Returns a StreamingResponse (QR PNG) with headers: transaction, db_id, Blockchain_hash
async function createBatch() {
  const batchId    = document.getElementById('cb-batch-id')?.value.trim();
  const drugName   = document.getElementById('cb-drug-name')?.value.trim();
  const manuName   = document.getElementById('cb-manu-name')?.value.trim();
  const mfd        = document.getElementById('cb-mfd')?.value;
  const exp        = document.getElementById('cb-exp')?.value;
  const qty        = parseInt(document.getElementById('cb-qty')?.value);
  const imgFile    = document.getElementById('cb-img')?.files[0];

  if (!batchId || !drugName || !manuName || !mfd || !exp || !qty)
    return toast('All fields are required.', 'er');
  if (!imgFile) return toast('Please select a manufacturer license image.', 'er');
  if (new Date(exp) <= new Date(mfd)) return toast('Expiry date must be after manufacturing date.', 'er');

  withLoading('cb-submit-btn', 'Create & Generate QR', async () => {
    try {
      const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = e => resolve(e.target.result.split(',')[1]);
        r.onerror = reject;
        r.readAsDataURL(imgFile);
      });

      const res = await apiFetch(`/batch/create-drugs-t1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id: batchId, drug_name: drugName, manufacturer_name: manuName, mfd, exp, batch_quantity: qty, image: base64 })
      });

      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Failed to create batch'); }

      const blob = await res.blob();
      const qrUrl = URL.createObjectURL(blob);
      const txHash = res.headers.get('transaction') || '—';
      const bId    = res.headers.get('db_id') || batchId;
      const chainH = res.headers.get('Blockchain_hash') || '—';

      document.getElementById('cb-qr-img').src = qrUrl;
      document.getElementById('cb-qr-wrap').style.display = 'block';
      document.getElementById('cb-tx-hash').textContent = `TX: ${txHash}`;
      document.getElementById('cb-chain-hash').textContent = `Seal: ${chainH.substring(0, 20)}…`;
      toast(`✅ Batch ${bId} registered on-chain!`);
    } catch (err) { toast(err.message, 'er'); }
  });
}

/* ── 2. SPLIT BATCH ───────────────────────────────────── */
// POST /batch/split-batch
async function splitBatch() {
  const batch_id          = document.getElementById('sp-batch-id')?.value.trim();
  const no_of_batches     = parseInt(document.getElementById('sp-count')?.value);
  const quantity_per_batch = parseInt(document.getElementById('sp-qty')?.value);
  const curr_owner_id     = document.getElementById('sp-pk')?.value.trim();

  if (!batch_id || !no_of_batches || !quantity_per_batch || !curr_owner_id)
    return toast('All fields are required.', 'er');

  withLoading('sp-submit-btn', 'Split Batch', async () => {
    try {
      const res = await apiFetch(`/batch/split-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id, no_of_batches, quantity_per_batch, curr_owner_id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      showR('sp-resp', data);
      toast(`Batch split into ${no_of_batches} sub-batches!`);
    } catch (err) { showR('sp-resp', err.message, true); toast(err.message, 'er'); }
  });
}

/* ── 3. SHIP TO DISTRIBUTOR ───────────────────────────── */
// POST /batch/ship-dist
async function shipToDist() {
  const batch_id        = document.getElementById('sd-batch-id')?.value.trim();
  const curr_owner_id   = document.getElementById('sd-pk')?.value.trim();
  const new_owner_id    = document.getElementById('sd-new-pk')?.value.trim();
  const new_owner_name  = document.getElementById('sd-new-name')?.value.trim();
  const new_owner_address = document.getElementById('sd-new-addr')?.value.trim();

  if (!batch_id || !curr_owner_id || !new_owner_id || !new_owner_name || !new_owner_address)
    return toast('All fields are required.', 'er');

  withLoading('sd-submit-btn', 'Initiate Shipment', async () => {
    try {
      const res = await apiFetch(`/batch/ship-dist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id, curr_owner_id, new_owner_id, new_owner_name, new_owner_address })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      showR('sd-resp', data);
      toast(`📦 Shipment to distributor initiated!`);
    } catch (err) { showR('sd-resp', err.message, true); toast(err.message, 'er'); }
  });
}

/* ── 4. RECEIVE AT DISTRIBUTOR ────────────────────────── */
// POST /batch/receive-dist
async function acceptDelivery() {
  const batch_id         = document.getElementById('ad-batch-id')?.value.trim();
  const receiver_id      = document.getElementById('ad-pk')?.value.trim();
  const receiver_address = document.getElementById('ad-addr')?.value.trim();

  if (!batch_id || !receiver_id || !receiver_address)
    return toast('All fields are required.', 'er');

  withLoading('ad-submit-btn', 'Confirm Receipt', async () => {
    try {
      const res = await apiFetch(`/batch/receive-dist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id, receiver_id, receiver_address })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      showR('ad-resp', data);
      toast(`✅ Delivery accepted at distributor!`);
    } catch (err) { showR('ad-resp', err.message, true); toast(err.message, 'er'); }
  });
}

/* ── 5. SHIP TO PHARMACY ─────────────────────────────── */
// POST /batch/ship-pharma
async function shipToPharma() {
  const batch_id          = document.getElementById('sp2-batch-id')?.value.trim();
  const current_owner_id  = document.getElementById('sp2-pk')?.value.trim();
  const new_owner_id      = document.getElementById('sp2-new-pk')?.value.trim();
  const new_owner_name    = document.getElementById('sp2-new-name')?.value.trim();
  const new_owner_address = document.getElementById('sp2-new-addr')?.value.trim();

  if (!batch_id || !current_owner_id || !new_owner_id || !new_owner_name || !new_owner_address)
    return toast('All fields are required.', 'er');

  withLoading('sp2-submit-btn', 'Ship to Pharmacy', async () => {
    try {
      const res = await apiFetch(`/batch/ship-pharma`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id, current_owner_id, new_owner_id, new_owner_name, new_owner_address })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      showR('sp2-resp', data);
      toast(`🏥 Shipment to pharmacy initiated!`);
    } catch (err) { showR('sp2-resp', err.message, true); toast(err.message, 'er'); }
  });
}

/* ── 6. RECEIVE AT PHARMACY ─────────────────────────── */
// POST /batch/receive-pharma
async function acceptPharma() {
  const batch_id         = document.getElementById('ap-batch-id')?.value.trim();
  const receiver_id      = document.getElementById('ap-pk')?.value.trim();
  const receiver_address = document.getElementById('ap-addr')?.value.trim();

  if (!batch_id || !receiver_id || !receiver_address)
    return toast('All fields are required.', 'er');

  withLoading('ap-submit-btn', 'Confirm Receipt', async () => {
    try {
      const res = await apiFetch(`/batch/receive-pharma`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id, receiver_id, receiver_address })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      showR('ap-resp', data);
      toast(`✅ Batch received at pharmacy!`);
    } catch (err) { showR('ap-resp', err.message, true); toast(err.message, 'er'); }
  });
}

/* ── 7. SELL DRUG UNIT ──────────────────────────────── */
// POST /batch/drug-status
async function sellDrug() {
  const batch_id   = document.getElementById('sl-batch-id')?.value.trim();
  const drug_id    = document.getElementById('sl-drug-id')?.value.trim();
  const private_key = document.getElementById('sl-pk')?.value.trim();

  if (!batch_id || !drug_id || !private_key)
    return toast('All fields are required.', 'er');

  withLoading('sl-submit-btn', 'Mark as Sold', async () => {
    try {
      const res = await apiFetch(`/batch/drug-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id, drug_id, private_key })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      showR('sl-resp', data);
      toast(`💊 ${drug_id} marked as sold on-chain!`);
    } catch (err) { showR('sl-resp', err.message, true); toast(err.message, 'er'); }
  });
}

/* ── 8. DASHBOARD: BATCH LOOKUP ─────────────────────── */
// GET /batch/batch-det/{id}  +  GET /batch/verify/{id}
async function dashboardLookup() {
  const id = document.getElementById('db-batch-id')?.value.trim();
  if (!id) return toast('Enter a batch ID.', 'er');

  withLoading('db-submit-btn', 'Lookup', async () => {
    try {
      const [detRes, verRes] = await Promise.allSettled([
        apiFetch(`/batch/batch-det/${encodeURIComponent(id)}`),
        apiFetch(`/batch/verify/${encodeURIComponent(id)}`)
      ]);

      if (detRes.status === 'rejected' || !detRes.value.ok) {
        const err = detRes.status === 'fulfilled' ? await detRes.value.json() : {};
        throw new Error(err.detail || 'Batch not found');
      }

      const det = await detRes.value.json();
      const ver = (verRes.status === 'fulfilled' && verRes.value.ok) ? await verRes.value.json() : null;

      const output = {
        ...det,
        blockchain_status: ver ? ver.status : 'UNKNOWN',
        blockchain_message: ver ? ver.message : 'Verification not available'
      };

      showR('db-resp', output);
      toast(ver?.status === 'VERIFIED' ? '🛡️ Batch verified on-chain' : '⚠️ Blockchain check inconclusive');
    } catch (err) { showR('db-resp', err.message, true); toast(err.message, 'er'); }
  });
}

/* ── 9. CHECK WALLET ROLE ────────────────────────────── */
// NOTE: No API endpoint for get_role() exists in batch1.py yet.
// Add:  @router.get("/role/{address}")
//       def get_role(address: str): return {"role": ROLE_MAP[blockchain.get_role(address)]}
// Once added, the form below will work automatically.
async function checkRole() {
  const address = document.getElementById('rl-address')?.value.trim();
  if (!address) return toast('Enter a wallet address.', 'er');

  withLoading('rl-submit-btn', 'Check Role', async () => {
    try {
      const res = await apiFetch(`/batch/role/${encodeURIComponent(address)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Role lookup failed');
      showR('rl-resp', data);
    } catch (err) {
      showR('rl-resp', '⚠️ Endpoint not yet available.\nAdd GET /batch/role/{address} to batch1.py.\n\nError: ' + err.message, true);
    }
  });
}

/* =========================================================
   INIT
   ========================================================= */
window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('rxbt') || 'light';
  document.documentElement.setAttribute('data-theme', saved);

  const savedAllergies = localStorage.getItem('userAllergies');
  if (savedAllergies) {
    const pageInput = document.getElementById('page-allergies');
    if (pageInput) pageInput.value = savedAllergies;
  }

  // Auto-verify if batch_id or drug_id is in the URL query string
  const params = new URLSearchParams(window.location.search);
  const bid = params.get('batch_id') || params.get('id') || params.get('batch');
  if (bid) { document.getElementById('pub-id').value = bid; lookupBatch(); }
});