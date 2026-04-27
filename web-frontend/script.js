let leafletMap = null;
let qrBatchId  = null;

const API = () => {
  const el = document.getElementById('api-url');
  return (el ? el.value : CONFIG.API_BASE_URL).replace(/\/$/, '');
};

let authToken       = null;
let currentUserRole = null;
let currentUsername = '';

async function apiFetch(endpoint, options = {}) {
  if (!options.headers) options.headers = {};
  options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
  if (authToken) options.headers['Authorization'] = `Bearer ${authToken}`;
  return fetch(`${API()}${endpoint}`, options);
}

/* ── AUTO-HIDE SCANNER BUTTON ─────────────────────────── */
setInterval(() => {
  const scanBtn = document.getElementById('global-scan-btn');
  if (!scanBtn) return;
  
  // Find which panel is currently active on the screen
  const activePanel = document.querySelector('.panel.active')?.id || document.querySelector('.page.active')?.id;
  
  // Only show the button on these specific pages!
const allowedPanels = [
    'panel-transfer', 'panel-accept', 'panel-transfer-pharmacy', 
    'panel-pharmacy-accept', 'panel-sell'
  ];
  
  if (allowedPanels.includes(activePanel)) {
    scanBtn.style.display = 'block';
  } else {
    scanBtn.style.display = 'none';
  }
}, 300); // Checks 3 times a second

function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span style="font-size:.9rem;font-weight:700">${type === 'ok' ? '✓' : '✕'}</span><span>${msg}</span>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transform='translateX(10px)'; el.style.transition='all .4s'; }, 3500);
  setTimeout(() => el.remove(), 4000);
}

function showR(id, data, err = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `api-resp show ${err ? 'er' : 'ok'}`;
  el.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

function extractDetail(data) {
  if (!data?.detail) return 'An unknown error occurred.';
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.detail))
    return data.detail.map(e => `${e.loc?.[e.loc.length-1] ?? 'Field'}: ${e.msg}`).join(' | ');
  return JSON.stringify(data.detail);
}

function toggleTheme() {
  const h = document.documentElement;
  const dark = h.getAttribute('data-theme') === 'dark';
  h.setAttribute('data-theme', dark ? 'light' : 'dark');
  localStorage.setItem('rxbt', dark ? 'light' : 'dark');
}

/* ── Page nav ── */
function switchPage(p) {
  if (!authToken && p !== 'landing') {
    toast('Please log in first.', 'er');
    document.getElementById('auth-modal').classList.add('show');
    return;
  }
  if (p === 'admin' && currentUserRole === 'PATIENT') { toast('Enterprise access required.', 'er'); return; }
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.getElementById('page-' + p)?.classList.add('active');
}

function showPanel(id, btn) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(b => b.classList.remove('active'));
  
  // 🚀 THE FIX: Use the 'id' variable that was passed into the function!
  if (id === 'propose') loadPendingRequests();
  if (id === 'vote') loadActiveProposals();
  
  document.getElementById('panel-' + id)?.classList.add('active');
  btn?.classList.add('active');
}

/* FIX #9: scope by page id, not .closest('.hero') */
function switchVerify(t, btn) {
  document.querySelectorAll('#page-public .vtab').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('#page-public .vpanel').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('vp-' + t)?.classList.add('active');
}

/* ── Global menu ── */
function toggleGlobalMenu() {
  document.getElementById('global-menu').classList.toggle('show');
  document.getElementById('global-overlay').classList.toggle('show');
}
function closeGlobalMenu() {
  document.getElementById('global-menu').classList.remove('show');
  document.getElementById('global-overlay').classList.remove('show');
}
function goToProfile() {
  closeGlobalMenu();
  currentUserRole === 'PATIENT' ? switchPage('stats') : switchPage('admin');
}

/* ── Auth tab switcher ── */
function switchAuthTab(tab, btn) {
  document.getElementById('auth-patient').classList.remove('active');
  document.getElementById('auth-member').classList.remove('active');
  document.getElementById('auth-' + tab).classList.add('active');
  btn.closest('.verify-tabs')?.querySelectorAll('.vtab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

/* FIX #5: always restore tab bar when opening */
function openSpecificLogin(type) {
  const modal  = document.getElementById('auth-modal');
  const tabBar = modal.querySelector('.verify-tabs');
  if (tabBar) tabBar.style.display = '';
  modal.classList.add('show');
  document.getElementById(type === 'patient' ? 'tab-btn-patient' : 'tab-btn-member')?.click();
}

/* ── Patient auth ── */
async function handlePatientLogin() {
  const username = document.getElementById('pt-user').value.trim();
  const password = document.getElementById('pt-pass').value.trim();
  if (!username || !password) return toast('Enter username and password.', 'er');
  await performLogin(username, password);
}

async function handlePatientRegister() {
  const username = document.getElementById('pt-user').value.trim();
  const password = document.getElementById('pt-pass').value.trim();
  if (!username || !password) return toast('Fill in username and password.', 'er');
  try {
    const res = await fetch(`${API()}/auth/patient/signup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email: `${username}@placeholder.com`, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(extractDetail(data));
    toast('Account created! Logging in…');
    await performLogin(username, password);
  } catch (e) { toast(e.message, 'er'); }
}

/* ── Chain member auth ── */
/* FIX #4: don't close modal before API call */
async function handleMemberLogin() {
  const role     = document.getElementById('cm-role').value;
  const username = document.getElementById('cm-user').value.trim();
  const password = document.getElementById('cm-pass').value.trim();
  if (!role || !username || !password) return toast('All fields required.', 'er');
  await performLogin(username, password, role);
}

/* ── Chain member registration (DAO Waiting Room) ── */
/* ── UI Toggle for Enterprise Auth ── */
let signupMap    = null;
let signupMarker = null;

function toggleEnterpriseAuth(mode) {
  document.getElementById('cm-login-box').style.display    = mode === 'login'    ? 'block' : 'none';
  document.getElementById('cm-register-box').style.display = mode === 'register' ? 'block' : 'none';

  /* Init the location picker map the first time the register panel opens */
  if (mode === 'register' && !signupMap) {
    setTimeout(() => {
      signupMap = L.map('signup-map', { zoomControl: true }).setView([20.5937, 78.9629], 5);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(signupMap);

      signupMap.on('click', function(e) {
        const { lat, lng } = e.latlng;

        /* Move or place marker */
        if (signupMarker) {
          signupMarker.setLatLng([lat, lng]);
        } else {
          signupMarker = L.circleMarker([lat, lng], {
            radius: 10, fillColor: '#1478d4', color: '#fff', weight: 3, fillOpacity: 1,
          }).addTo(signupMap);
        }

        /* Store in hidden inputs */
        document.getElementById('reg-lat').value = lat.toFixed(6);
        document.getElementById('reg-lng').value = lng.toFixed(6);

        /* Update label */
        document.getElementById('signup-map-label').textContent =
          `📍 ${lat.toFixed(4)}, ${lng.toFixed(4)} — click again to reposition`;
      });
    }, 100); /* small delay so the container is visible before Leaflet measures it */
  }
}

/* ── Chain member registration (DAO Waiting Room) ── */
async function submitApplication() {
  const role    = document.getElementById('reg-role').value;
  const company = document.getElementById('reg-company').value.trim();
  const email   = document.getElementById('reg-email').value.trim();
  const wallet  = document.getElementById('reg-wallet').value.trim();
  const username= document.getElementById('reg-user').value.trim();
  const password= document.getElementById('reg-pass').value.trim();
  const pk      = document.getElementById('reg-pk').value.trim();
  const lat     = parseFloat(document.getElementById('reg-lat').value);
  const lng     = parseFloat(document.getElementById('reg-lng').value);

  if (!role || !company || !email || !wallet || !username || !password) {
    return toast('All fields are required to apply.', 'er');
  }
  if (!lat || !lng) {
    return toast('Please pin your facility location on the map.', 'er');
  }

  try {
    const res = await fetch(`${API()}/batch/request_access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
        email,
        req_role:     role,
        company_name: company,
        acc_address:  wallet,
        private_key:  pk,
        lat,
        lng,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(extractDetail(data));

    toast('Application submitted! Please wait for DAO Validator approval.', 'ok');
    toggleEnterpriseAuth('login');
    document.getElementById('auth-modal').classList.remove('show');

  } catch (e) {
    toast(e.message, 'er');
  }
}

async function performLogin(username, password, expectedRole = null) {
  try {
    // 🚀 THE FIX: Choose the correct endpoint based on the role
    const isPatient = !expectedRole || expectedRole === 'PATIENT';
    const loginEndpoint = isPatient ? '/auth/patient/login' : '/auth/member/login';

    const res = await fetch(`${API()}${loginEndpoint}`, {
      method: 'POST', 
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, password }),
    });
    
    if (!res.ok) { 
      const d = await res.json(); 
      throw new Error(extractDetail(d)); 
    }
    const data = await res.json();

    if (expectedRole && expectedRole !== 'PATIENT' && data.role !== expectedRole)
      throw new Error(`Role mismatch: you selected ${expectedRole} but the blockchain says you are ${data.role}.`);

    authToken = data.access_token;
    localStorage.setItem('rx_token', authToken);
    localStorage.setItem('rx_role',  data.role);
    localStorage.setItem('rx_user',  data.username);

    document.getElementById('auth-modal').classList.remove('show');
    toast('Login successful');
    executeLogin(data.role, data.username);
  } catch (err) { 
    toast(err.message, 'er'); 
  }
}

function executeLogin(role, username) {
  currentUserRole = role; currentUsername = username;
  document.getElementById('nav-hamburger').style.display      = 'flex';
  document.getElementById('nav-login-btn').style.display      = 'none';
  document.getElementById('nav-user-container').style.display = 'flex';
  document.getElementById('top-username').textContent         = username;

  document.querySelectorAll('.pt-only').forEach(el =>
    el.style.display = role === 'PATIENT' ? 'block' : 'none');

  const adminBtn = document.getElementById('gm-admin-btn');
  const adminDiv = document.getElementById('gm-admin-div');
  if (role !== 'PATIENT') { adminBtn.style.display='block'; adminDiv.style.display='block'; }
  else                    { adminBtn.style.display='none';  adminDiv.style.display='none'; }

  /* FIX #3: labels get block, buttons get flex */
  let firstVisible = null;
  document.querySelectorAll('[data-roles]').forEach(el => {
    const allowed = el.getAttribute('data-roles').split(',').map(r => r.trim());
    const show    = allowed.includes(role) || allowed.includes('all');
    el.style.display = show ? (el.classList.contains('sb-item') ? 'flex' : 'block') : 'none';
    if (show && el.classList.contains('sb-item') && !firstVisible) firstVisible = el;
  });

  if (role !== 'PATIENT') {
    document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
    document.getElementById('page-admin').classList.add('active');
    if (firstVisible) firstVisible.click();
  } else {
    document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
    document.getElementById('page-public').classList.add('active');
  }
}

function logoutUser() {
  authToken = null; currentUserRole = null; currentUsername = '';
  ['rx_token','rx_role','rx_user'].forEach(k => localStorage.removeItem(k));
  document.getElementById('nav-login-btn').style.display      = 'block';
  document.getElementById('nav-user-container').style.display = 'none';
  document.getElementById('nav-hamburger').style.display      = 'none';
  closeGlobalMenu();
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.getElementById('page-landing').classList.add('active');
  toast('Logged out successfully.');
}

/* ── Map ── */
/*
 * initRealMap(history)
 *
 * history = array of { status, location, lat, lng, timestamp }
 * from the /batch/batch-det or /batch/verify_drug endpoint.
 *
 * Falls back to hardcoded Indian city coords only when a step
 * has no lat/lng stored (e.g. old rows written before geocoding).
 */
const FALLBACK_COORDS = {
  CREATED:              [20.5937, 78.9629],   // India centre — manufacturer unknown
  IN_TRANSIT_TO_DIST:   [23.2599, 77.4126],   // midpoint India
  AT_DISTRIBUTOR:       [28.7041, 77.1025],   // Delhi area
  IN_TRANSIT_TO_PHARM:  [19.0760, 72.8777],   // Mumbai area
  AT_PHARMACY:          [13.0827, 80.2707],   // Chennai area
  SOLD:                 [13.0827, 80.2707],
};

const STATUS_LABELS = {
  CREATED:              '🏭 Manufacturer',
  IN_TRANSIT_TO_DIST:   '🚚 En Route to Distributor',
  AT_DISTRIBUTOR:       '📦 Distributor Hub',
  IN_TRANSIT_TO_PHARM:  '🚐 En Route to Pharmacy',
  AT_PHARMACY:          '🏥 Pharmacy',
  SOLD:                 '✅ Dispensed',
};

function initRealMap(history) {
  if (leafletMap) { leafletMap.remove(); leafletMap = null; }
  leafletMap = L.map('real-map', { zoomControl: false }).setView([20.5937, 78.9629], 5);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(leafletMap);

  /* Build steps — use real coords where available, fallback for nulls/zeros */
  let steps = (Array.isArray(history) ? history : []).map(step => {
    const fb  = FALLBACK_COORDS[step.status] || [20.5937, 78.9629];
    const lat = (step.lat && Math.abs(step.lat) > 0.001) ? step.lat : fb[0];
    const lng = (step.lng && Math.abs(step.lng) > 0.001) ? step.lng : fb[1];
    const isApprox = !(step.lat && Math.abs(step.lat) > 0.001);
    return { ...step, lat, lng, isApprox };
  });

  /* If history is completely empty (batch just created, no DB status rows yet)
     synthesise a single CREATED point so the map is never blank */
  if (!steps.length) {
    steps = [{
      status:   'CREATED',
      location: 'Manufacturer (location not yet registered)',
      lat:      20.5937,
      lng:      78.9629,
      isApprox: true,
    }];
  }

  const latLngs = steps.map(s => [s.lat, s.lng]);

  /* Polyline between all steps */
  if (latLngs.length > 1) {
    L.polyline(latLngs, { color: '#1478d4', weight: 4, opacity: 0.8, dashArray: '8, 6' }).addTo(leafletMap);
  }

  /* Markers */
  const markerLayer = L.featureGroup();
  steps.forEach((step, i) => {
    const isLast = i === steps.length - 1;
    const label  = STATUS_LABELS[step.status] || step.status;

    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width:${isLast ? 18 : 13}px; height:${isLast ? 18 : 13}px;
        background:${isLast ? '#1478d4' : '#64a8f5'};
        border: 3px solid #fff; border-radius:50%;
        box-shadow: 0 0 0 ${isLast ? '4px rgba(20,120,212,0.3)' : 'none'};
      "></div>`,
      iconSize:   [isLast ? 18 : 13, isLast ? 18 : 13],
      iconAnchor: [isLast ? 9  : 6,  isLast ? 9  : 6],
    });

    const tooltipHtml = `
      <div style="font-family:'IBM Plex Mono',monospace; font-size:0.7rem; min-width:160px;">
        <div style="font-weight:700; margin-bottom:3px;">${label}</div>
        <div style="opacity:.8">${step.location || '—'}</div>
        ${step.isApprox ? '<div style="color:#f59e0b;margin-top:3px;">⚠ approximate location</div>' : ''}
        ${step.timestamp ? `<div style="opacity:.6; margin-top:3px; font-size:0.65rem;">${new Date(step.timestamp).toLocaleString()}</div>` : ''}
      </div>`;

    L.marker([step.lat, step.lng], { icon })
      .addTo(markerLayer)
      .bindTooltip(tooltipHtml, { permanent: false, direction: 'top', className: 'map-tooltip' });
  });

  markerLayer.addTo(leafletMap);

  /* fitBounds only when we have more than one unique point */
  const bounds = markerLayer.getBounds();

  /* Force size recalculation — container may have been hidden when map was created */
  leafletMap.invalidateSize(false);

  if (bounds.isValid() && latLngs.length > 1) {
    leafletMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
  } else if (steps.length === 1) {
    leafletMap.setView([steps[0].lat, steps[0].lng], 7);
  }

  /* Redundant safety invalidations after CSS transitions settle */
  setTimeout(() => { leafletMap?.invalidateSize(true); }, 150);
  setTimeout(() => { leafletMap?.invalidateSize(true); }, 500);
}
function toggleMapExpansion() {
  const w = document.getElementById('map-wrapper');
  w.classList.toggle('expanded');
  document.getElementById('map-btn-text').textContent = w.classList.contains('expanded') ? 'Minimize' : 'Expand Route';
  setTimeout(() => leafletMap?.invalidateSize(true), 650);
}

/* ── Batch lookup ── */
const STO = ['CREATED','IN_DISTRIBUTION','AT_DISTRIBUTOR','AT_PHARMACY','SOLD'];
const MOCK_DB = {
  'TEST-001':  {
    bd:{ id:'TEST-001', status:'SOLD', is_authentic:true, mfgDate:'2025-01-10', expDate:'2027-01-10', current_owner:'0xcf1c29507ff3d3dfc630fafcffadf64a334e031f' },
    md:{ drug_name:'Amoxicillin 500mg', manufacturer:'PharmaCorp Ltd.', side_effects:['Nausea','Diarrhea'], allergies:['Penicillin'] },
    history:[
      { status:'CREATED',             location:'PharmaCorp Ltd., Mumbai',      lat:19.0760, lng:72.8777, timestamp:'2025-01-10T08:00:00' },
      { status:'IN_TRANSIT_TO_DIST',  location:'En route to Delhi Hub',        lat:23.2599, lng:77.4126, timestamp:'2025-01-12T10:00:00' },
      { status:'AT_DISTRIBUTOR',      location:'Global Pharma Distributors',   lat:28.7041, lng:77.1025, timestamp:'2025-01-14T09:30:00' },
      { status:'IN_TRANSIT_TO_PHARM', location:'En route to City Care',        lat:17.3850, lng:78.4867, timestamp:'2025-01-16T11:00:00' },
      { status:'AT_PHARMACY',         location:'City Care Pharmacy, Chennai',  lat:13.0827, lng:80.2707, timestamp:'2025-01-18T14:00:00' },
    ]
  },
  'TEST-002':  {
    bd:{ id:'TEST-002', status:'IN_DISTRIBUTION', is_authentic:true, mfgDate:'2025-03-01', expDate:'2026-03-01', current_owner:'0x2222333344445555' },
    md:{ drug_name:'Cetirizine 10mg', manufacturer:'Sun Pharma', side_effects:['Drowsiness','Dry Mouth'], allergies:['Antihistamines'] },
    history:[
      { status:'CREATED',            location:'Sun Pharma, Vadodara',          lat:22.3072, lng:73.1812, timestamp:'2025-03-01T08:00:00' },
      { status:'IN_TRANSIT_TO_DIST', location:'En route to Distributor',       lat:23.0225, lng:72.5714, timestamp:'2025-03-03T09:00:00' },
    ]
  },
  'TEST-FAKE': {
    bd:{ id:'TEST-FAKE', status:'UNKNOWN', is_authentic:false, mfgDate:'—', expDate:'—', current_owner:'—' },
    md: null, history: []
  },
  'TEST-DOLO': {
    bd:{ id:'TEST-DOLO', status:'AT_PHARMACY', is_authentic:true, mfgDate:'2025-02-15', expDate:'2028-02-15', current_owner:'0xcf1c2950' },
    md:{ drug_name:'Dolo 650', manufacturer:'Micro Labs', side_effects:['Nausea','Liver Warning'], allergies:['Paracetamol'] },
    history:[
      { status:'CREATED',             location:'Micro Labs, Bengaluru',         lat:12.9716, lng:77.5946, timestamp:'2025-02-15T08:00:00' },
      { status:'IN_TRANSIT_TO_DIST',  location:'En route to Hyderabad Hub',     lat:15.3173, lng:75.7139, timestamp:'2025-02-17T10:00:00' },
      { status:'AT_DISTRIBUTOR',      location:'Pharma Hub, Hyderabad',         lat:17.3850, lng:78.4867, timestamp:'2025-02-19T09:30:00' },
      { status:'AT_PHARMACY',         location:'City Care Pharmacy, Chennai',   lat:13.0827, lng:80.2707, timestamp:'2025-02-21T14:00:00' },
    ]
  },
};

const MOCK_DRUGS = {
  // 🟡 SCENARIO 1: Authentic, but sold a long time ago. 
  // If a patient scans this, it triggers your "Over 24 Hours / Potential Copy" Warning
  'TEST-001-D1': {
    drug_id: 'TEST-001-D1',
    batch_id: 'TEST-001',
    is_sold: true,
    sold_at: '2024-12-01T14:30:00' // Way more than 24 hours ago
  },

  // 🟢 SCENARIO 2: Authentic, sold JUST NOW.
  // Triggers your yellow "Recently Dispensed - perfectly safe" info box
  'TEST-001-D2': {
    drug_id: 'TEST-001-D2',
    batch_id: 'TEST-001',
    is_sold: true,
    // Dynamically sets the sold time to 30 minutes ago so it always passes the < 24h check
    sold_at: new Date(Date.now() - 1000 * 60 * 30).toISOString() 
  },

  // 🟢 SCENARIO 3: Authentic and completely UNSOLD.
  // Standard safe result.
  'TEST-002-D1': {
    drug_id: 'TEST-002-D1',
    batch_id: 'TEST-002',
    is_sold: false,
    sold_at: null
  },

  // 🟢 SCENARIO 4: Authentic and UNSOLD.
  'TEST-DOLO-D5': {
    drug_id: 'TEST-DOLO-D5',
    batch_id: 'TEST-DOLO',
    is_sold: false,
    sold_at: null
  },

  // 🔴 SCENARIO 5: Completely fake drug.
  // Triggers your red "🚨 Invalid Blockchain Seal / Bounty" alert
  'TEST-FAKE-D99': {
    drug_id: 'TEST-FAKE-D99',
    batch_id: 'TEST-FAKE',
    is_sold: false,
    sold_at: null
  }
};


async function lookupBatch() {
  let identifier = document.getElementById('pub-id').value.trim();
  if (!identifier) return toast('Please enter a Batch or Drug ID', 'er');

  // 🚀 FIX 1: Force uppercase to match the MOCK objects exactly
  identifier = identifier.toUpperCase();

  // Strip URLs if the user pasted/scanned the full string
  if (identifier.includes('DRUG_ID=')) identifier = identifier.split('DRUG_ID=')[1].split('&')[0];
  else if (identifier.includes('BATCH_ID=')) identifier = identifier.split('BATCH_ID=')[1].split('&')[0];
  
  document.getElementById('pub-id').value = identifier;
  
  // 1. Manually trigger the button loading state
  const btn = document.getElementById('pub-search-btn');
  if (btn) {
      btn.innerHTML = 'Verifying...';
      btn.disabled = true;
  }
  
  // 2. Show the wrapper and the spinner, but hide the old results
  const resultArea = document.getElementById('result-area');
  const pubLoader = document.getElementById('pub-loader');
  const resultCard = document.getElementById('result-card');

  resultArea?.classList.add('visible');
  if (pubLoader) pubLoader.style.display = 'flex';
  if (resultCard) resultCard.style.display = 'none';

  try {
    const isDrug = identifier.includes('-D');
    const savedRole = localStorage.getItem('rx_role');
    const isPublicUser = !savedRole; 

    if (isPublicUser && !isDrug) {
      throw new Error("Public access is restricted to individual Drug Units only (e.g. BATCH-01-D1).");
    }

    // Derive the batch_id for the batch-det call (drug IDs look like BATCH-001-D12)
    const batchIdForDet = isDrug ? identifier.replace(/-D\d+$/, '') : identifier;

    let data, detData;

    // 🚀 FIX 2: THE MOCK INTERCEPTOR
    if (isDrug && MOCK_DRUGS[identifier]) {
        console.log("Intercepted Mock Drug:", identifier);
        const mockDrug = MOCK_DRUGS[identifier];
        const mockBatch = MOCK_DB[mockDrug.batch_id];
        
        data = {
            is_authentic: mockBatch.bd.is_authentic,
            blockchain_status: mockBatch.bd.status,
            is_sold: mockDrug.is_sold,
            sold_at: mockDrug.sold_at,
            data: {
              drug_name: mockBatch.md ? mockBatch.md.drug_name : "Unknown",
              manufacturer: mockBatch.md ? mockBatch.md.manufacturer : "Unknown",
              mfd: mockBatch.bd.mfgDate,
              exp: mockBatch.bd.expDate
            },
            history: mockBatch.history
        };
        detData = { history: mockBatch.history, manu_name: mockBatch.md?.manufacturer };

    } else if (!isDrug && MOCK_DB[identifier]) {
        console.log("Intercepted Mock Batch:", identifier);
        const mockBatch = MOCK_DB[identifier];
        data = {
            is_authentic: mockBatch.bd.is_authentic,
            blockchain_status: mockBatch.bd.status,
            data: {
                drug_name: mockBatch.md ? mockBatch.md.drug_name : "Unknown",
                manufacturer: mockBatch.md ? mockBatch.md.manufacturer : "Unknown",
                mfd: mockBatch.bd.mfgDate,
                exp: mockBatch.bd.expDate,
            },
            history: mockBatch.history
        };
        detData = { history: mockBatch.history, manu_name: mockBatch.md?.manufacturer };

    } else {
        // 🌐 THE REAL API CALL (If not found in mock data)
        let endpoint = isDrug ? `/batch/verify_drug/${identifier}` : `/batch/verify/${identifier}`;
        let headers = {};
        const savedToken = localStorage.getItem('rx_token');
        if (savedToken) headers['Authorization'] = `Bearer ${savedToken}`;

        console.log("Fetching from API...");
        const [fetchRes, detRes] = await Promise.all([
          fetch(`${API()}${endpoint}`, { headers }),
          fetch(`${API()}/batch/batch-det/${batchIdForDet}`, { headers }),
        ]);
        
        data = await fetchRes.json();
        detData = detRes.ok ? await detRes.json() : null;
        if (!fetchRes.ok) throw new Error(data.detail || "Verification failed");
    }

    console.log("Verification Data:", data);

    // ONLY DECLARE ONCE
    const fakeAlert = document.getElementById('res-fake-alert');
    if (fakeAlert) fakeAlert.style.display = 'none';

    let recentAlert = document.getElementById('res-recent-alert');
    if (!recentAlert) {
      recentAlert = document.createElement('div');
      recentAlert.id = 'res-recent-alert';
      const splitBody = document.getElementById('res-split-body');
      if (splitBody) splitBody.parentNode.insertBefore(recentAlert, splitBody);
    }
    recentAlert.style.display = 'none';

    // 3. THE SMART 24-HOUR COUNTERFEIT CHECK
    if (!data.is_authentic) {
      // 🔴 COMPLETELY FAKE
      if (fakeAlert) {
        fakeAlert.style.display = 'flex';
        const h3 = fakeAlert.querySelector('h3');
        const p = fakeAlert.querySelector('p');
        if (h3) h3.innerHTML = '🚨 Invalid Blockchain Seal';
        if (p) p.innerHTML = 'This ID does not match the Polygon Blockchain seal. The data has been tampered with or the product is entirely unregistered.';
      }
      document.getElementById('res-status').textContent = '⚠️ INVALID DATA';
      document.getElementById('res-status').className = 'spill s-UNKNOWN'; 
      document.getElementById('res-aicon').textContent = '❌';
      document.getElementById('res-albl').textContent = 'Verification Failed';

    } else if (isDrug && data.is_sold) {
      // 🟡 CHECK THE TIME DIFFERENCE
      const soldDate = new Date(data.sold_at);
      const now = new Date();
      const hoursSinceSold = (now - soldDate) / (1000 * 60 * 60);

      if (hoursSinceSold > 24) {
        // 🔴 OVER 24 HOURS
        if (fakeAlert) {
          fakeAlert.style.display = 'flex';
          const h3 = fakeAlert.querySelector('h3');
          const p = fakeAlert.querySelector('p');
          if (h3) h3.innerHTML = '⚠️ Potential Counterfeit';
          if (p) p.innerHTML = `This specific drug unit was officially registered as <b>SOLD</b> over 24 hours ago (on ${soldDate.toLocaleDateString()}). If you just purchased this today, the QR code may be a photocopy. Please verify with your pharmacist.`;
        }
        document.getElementById('res-status').textContent = '⚠️ POTENTIAL COPY';
        document.getElementById('res-status').className = 'spill s-UNKNOWN'; 
        document.getElementById('res-aicon').textContent = '⚠️';
        document.getElementById('res-albl').textContent = 'Status Warning';

      } else {
        // 🟡 UNDER 24 HOURS
        recentAlert.style.display = 'flex';
        recentAlert.style.padding = '1rem 1.75rem';
        recentAlert.style.background = '#fff8e6';
        recentAlert.style.borderBottom = '1px solid var(--warn-bd)';
        recentAlert.style.alignItems = 'center';
        recentAlert.style.gap = '12px';
        recentAlert.style.marginBottom = '1.5rem';
        recentAlert.innerHTML = `
          <span style="font-size: 1.8rem;">ℹ️</span>
          <div>
            <div style="font-family:'IBM Plex Mono',monospace; font-size:0.7rem; letter-spacing:1px; text-transform:uppercase; font-weight:700; margin-bottom:3px; color: var(--warn);">Recently Dispensed</div>
            <div style="font-size: 0.85rem; font-weight: 500; color: var(--text);">This medicine was officially marked as sold at <b>${soldDate.toLocaleTimeString()}</b>. If you just picked this up from the pharmacy, your medicine is perfectly safe!</div>
          </div>
        `;
        
        document.getElementById('res-status').textContent = '✅ AUTHENTIC (SOLD)';
        document.getElementById('res-status').className = 'spill s-SOLD'; 
        document.getElementById('res-aicon').textContent = '✓';
        document.getElementById('res-albl').textContent = 'Blockchain Verified';
      }

    } else {
      // 🟢 AUTHENTIC AND UNSOLD
      document.getElementById('res-status').textContent = '✅ AUTHENTIC';
      document.getElementById('res-status').className = 'spill s-CREATED';
      document.getElementById('res-aicon').textContent = '✓';
      document.getElementById('res-albl').textContent = 'Blockchain Verified';
    }

    // 4. POPULATE THE LEFT SIDE
    // Mock interceptor uses data.data, API might use data directly based on the endpoint
    const info = data.data ? data.data : data; 
    document.getElementById('res-name').textContent = info.drug_name || info.drug || "Unknown Drug";
    document.getElementById('res-bid').textContent = info.batch_id || identifier;
    document.getElementById('res-mfr').textContent = info.manufacturer || "Unknown Manufacturer";
    document.getElementById('res-owner').textContent = info.manufacturer || "Unknown Owner"; 
    
    if (info.mfd || info.mfd_date) document.getElementById('res-mfg').textContent = new Date(info.mfd || info.mfd_date).toLocaleDateString();
    if (info.exp || info.exp_date) document.getElementById('res-exp').textContent = new Date(info.exp || info.exp_date).toLocaleDateString();

    // 5. POPULATE THE RIGHT SIDE
    // We try to pull these from the mock metadata if it exists, otherwise use defaults
    const mockBatchData = MOCK_DB[batchIdForDet];
    const mockSideEffects = mockBatchData?.md?.side_effects || ['Nausea', 'Dizziness', 'Drowsiness'];
    const mockAllergies = mockBatchData?.md?.allergies || ['Penicillin', 'Sulfa'];

    document.getElementById('res-se').innerHTML = mockSideEffects.map(se => `<span class="tchip tchip-w">${se}</span>`).join('');
    document.getElementById('res-al').innerHTML = mockAllergies.map(al => `<span class="tchip tchip-d">${al}</span>`).join('');

    // 6. SMART ALLERGY CLASH CHECK
    const userAllergies = localStorage.getItem('rx_allergies') || '';
    const hasClash = mockAllergies.some(al => userAllergies.toLowerCase().includes(al.toLowerCase()));
    
    const allergyAlert = document.getElementById('res-allergy-alert');
    if (allergyAlert) {
      allergyAlert.style.display = hasClash ? 'flex' : 'none';
    }

    // 7. TIMELINE
    const statuses = ['CREATED', 'IN_DISTRIBUTION', 'AT_DISTRIBUTOR', 'AT_PHARMACY', 'SOLD'];
    statuses.forEach(s => {
      const dot = document.getElementById('tl-' + s);
      if (dot) {
        dot.style.background = 'transparent';
        dot.style.borderColor = 'var(--border)';
        dot.textContent = ''; 
      }
    });
    if (data.history && Array.isArray(data.history)) {
      data.history.forEach(step => {
        const dot = document.getElementById('tl-' + step.status);
        if (dot) {
          dot.style.background = 'var(--accent)';
          dot.style.borderColor = 'var(--accent)';
          dot.style.color = 'white';
          dot.textContent = '✓';
        }
      });
    }

    // 8. MAP — use real coords from batch-det history
    let mapHistory = detData?.history || data.history || null;
    if (!mapHistory || !mapHistory.length) {
      const currentStatus = data.status || data.blockchain_status || 'CREATED';
      const stageOrder = ['CREATED','IN_TRANSIT_TO_DIST','AT_DISTRIBUTOR','IN_TRANSIT_TO_PHARM','AT_PHARMACY','SOLD'];
      const currentIdx = stageOrder.indexOf(currentStatus);
      mapHistory = stageOrder
        .slice(0, currentIdx >= 0 ? currentIdx + 1 : 1)
        .map(s => ({ status: s, location: STATUS_LABELS[s] || s, lat: null, lng: null, timestamp: null }));
    }
    console.log('Map history:', mapHistory);

    const splitBody = document.getElementById('res-split-body');
    if (splitBody) splitBody.style.display = 'grid';

    /* Show the card BEFORE initialising the map so Leaflet can measure the container */
    resultArea?.classList.add('visible');
    if (resultCard) {
      resultCard.classList.add('show');
      resultCard.style.display = 'block';
    }
    if (pubLoader) pubLoader.style.display = 'none';

    /* Small rAF delay so the browser paints the visible container before Leaflet measures */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        initRealMap(mapHistory);
        setTimeout(() => {
          leafletMap?.invalidateSize(true);
          resultCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 200);
      });
    });

  } catch (err) {
    console.error("Lookup Error:", err);
    toast(err.message, 'er');
    if (pubLoader) pubLoader.style.display = 'none';
    resultArea?.classList.remove('visible');
  } finally {
    if (btn) {
        btn.innerHTML = 'Verify →';
        btn.disabled = false;
    }
  }
}

function renderResult(id, b, m) {
  document.getElementById('res-name').textContent = m?.drug_name || id;
  document.getElementById('res-bid').textContent  = `Batch ID: ${id}`;
  document.getElementById('res-mfr').textContent  = m?.manufacturer || '';
  const sp = document.getElementById('res-status');
  sp.textContent = (b.status||'UNKNOWN').replace(/_/g,' '); sp.className = `spill s-${b.status||'UNKNOWN'}`;
  const auth = b.is_authentic;
  document.getElementById('res-aicon').textContent = auth ? '🛡️' : '⚠️';
  const albl = document.getElementById('res-albl');
  albl.textContent = auth ? 'Verified authentic — on-chain record matches' : 'Authenticity check failed';
  albl.className = `auth-lbl ${auth ? 'safe' : 'danger'}`;
  document.getElementById('res-mfg').textContent = b.mfgDate || '—';
  document.getElementById('res-exp').textContent = b.expDate  || '—';

  if (!auth) {
    document.getElementById('res-fake-alert').style.display  = 'flex';
    document.getElementById('res-split-body').style.display  = 'none';
    document.getElementById('res-allergy-alert').style.display = 'none';
    document.getElementById('result-card').style.border      = '2px solid var(--danger)';
    document.getElementById('result-card').classList.add('show');
    return;
  }
  document.getElementById('res-fake-alert').style.display = 'none';
  document.getElementById('res-split-body').style.display = 'grid';
  /* Show card before map init so Leaflet can measure the container */
  document.getElementById('result-card').classList.add('show');
  document.getElementById('result-area')?.classList.add('visible');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    initRealMap(null); /* renderResult used by mock data only — no real history */
    setTimeout(() => leafletMap?.invalidateSize(true), 200);
  }));

  const KNOWN = { '0xcf1c29507ff3d3dfc630fafcffadf64a334e031f':'City Care Pharmacy', '0x2222333344445555666677778888999900001111':'Global Pharma Distributors' };
  let owner = b.current_owner || '—';
  if (owner !== '—' && KNOWN[owner.toLowerCase()]) owner = KNOWN[owner.toLowerCase()] + ' ✓';
  document.getElementById('res-owner').textContent = owner;

  const si = STO.indexOf(b.status);
  STO.forEach((s,i) => {
    const d = document.getElementById('tl-'+s); const l = document.getElementById('tll-'+s);
    if (!d) return;
    d.classList.remove('done','current'); l.classList.remove('on');
    if (i < si) { d.classList.add('done'); l.classList.add('on'); }
    else if (i === si) { d.classList.add('current'); l.classList.add('on'); }
  });

  let finalSE = m?.side_effects || []; let finalAL = m?.allergies || [];
  if ((m?.drug_name||'').toLowerCase().includes('dolo')) { finalSE=['Nausea','Stomach Upset','Liver Warning']; finalAL=['Paracetamol','NSAIDs']; }

  const hasInfo = finalSE.length || finalAL.length;
  document.getElementById('res-info').style.display = hasInfo ? '' : 'none';
  if (hasInfo) {
    document.getElementById('res-se').innerHTML = finalSE.length ? finalSE.map(s=>`<span class="tag tw">${s}</span>`).join('') : '<span class="tag tn">None listed</span>';
    const myAl = (localStorage.getItem('userAllergies')||'').toLowerCase();
    let clash = false;
    document.getElementById('res-al').innerHTML = finalAL.length
      ? finalAL.map(a => { if (myAl.includes(a.toLowerCase())) clash=true; return `<span class="tag td">${a}</span>`; }).join('')
      : '<span class="tag tn">None listed</span>';
    document.getElementById('res-allergy-alert').style.display = clash ? 'flex' : 'none';
    document.getElementById('result-card').style.border = clash ? '2px solid var(--danger)' : '1px solid var(--border)';
  } else {
    document.getElementById('result-card').style.border = '1px solid var(--border)';
    const ab = document.getElementById('res-allergy-alert'); if (ab) ab.style.display = 'none';
  }
  document.getElementById('result-card').classList.add('show');
}

function setupReminders() { toast(`Syncing with Calendar…`); setTimeout(()=>toast('✅ Reminders set for 9:00 AM.'),1500); }
function submitBountyClaim() { toast('Uploading to Validator Network…'); setTimeout(()=>{ document.getElementById('bounty-modal').classList.remove('show'); toast('✅ 5 MATIC transferred!'); },2000); }
function saveAllergiesFromPage() { localStorage.setItem('userAllergies', document.getElementById('page-allergies').value.toLowerCase()); toast('Profile saved.'); }


/* ── QR ── */
function clearQR() {
  document.getElementById('qr-preview').classList.remove('show');
  document.getElementById('qr-decoded').textContent='—'; document.getElementById('qr-decoded').style.color='';
  qrBatchId=null; document.getElementById('public-inner').classList.remove('results-active'); document.getElementById('result-area')?.classList.remove('visible'); document.getElementById('result-card').classList.remove('show');
}
function handleQRFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.getElementById('qr-canvas');
      canvas.width=img.width; canvas.height=img.height;
      canvas.getContext('2d').drawImage(img,0,0);
      const d = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
      if (typeof jsQR==='undefined') { toast('QR library loading, retry.','er'); return; }
      const code = jsQR(d.data,d.width,d.height);
      if (code) {
        qrBatchId=code.data;
        const m=qrBatchId.match(/[?&]batch_id=([^&]+)/); if(m) qrBatchId=decodeURIComponent(m[1]);
        document.getElementById('qr-decoded').textContent=qrBatchId; document.getElementById('qr-decoded').style.color='var(--safe)';
        document.getElementById('qr-thumb').src=e.target.result; document.getElementById('qr-preview').classList.add('show');
        toast('QR decoded!');
      } else toast('No QR found. Try a clearer photo.','er');
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}
function handleQRDrop(event) {
  event.preventDefault(); document.getElementById('drop-zone').classList.remove('drag-over');
  const file=event.dataTransfer.files[0]; if(file?.type.startsWith('image/')) handleQRFile(file); else toast('Drop an image.','er');
}
function lookupFromQR() { if(!qrBatchId) return toast('No QR decoded yet.','er'); document.getElementById('pub-id').value=qrBatchId; lookupBatch(); }

/* FIX #4 for QR button: wrap in named function instead of inline template literal */
function openQrImage() {
  const id=document.getElementById('qr-lookup-id')?.value.trim();
  if (!id) return toast('Enter a Batch or Drug ID.','er');
  window.open(`${API()}/batch/get-qr/${encodeURIComponent(id)}`,'_blank');
}

function withLoading(btnId, label, fn) {
  const btn=document.getElementById(btnId);
  if(btn){btn.disabled=true;btn.textContent='⏳ Please wait…';}
  fn().finally(()=>{if(btn){btn.disabled=false;btn.textContent=label;}});
}

/* Admin calls — all use apiFetch (JWT injected automatically) */

async function createBatch() {
  // 🚀 FIX 1: Cleaned up the declarations so the JavaScript parser doesn't crash
  const batchId  = document.getElementById('cb-batch-id')?.value.trim();
  const drugName = document.getElementById('cb-drug-name')?.value.trim();
  const manuName = document.getElementById('cb-manu-name')?.value.trim();
  const mfd      = document.getElementById('cb-mfd')?.value;
  const exp      = document.getElementById('cb-exp')?.value;
  const qty      = parseInt(document.getElementById('cb-qty')?.value);
  const pk       = document.getElementById('mfg-pk')?.value.trim();
  const imgFile  = document.getElementById('cb-img')?.files[0];
        
  // 🚀 FIX 2: Added !pk to the validation check so the UI catches it if it's empty
  if(!batchId || !drugName || !manuName || !mfd || !exp || !qty || !pk) {
    return toast('All fields (including Private Key) are required.','er');
  }
  
  if(!imgFile) return toast('Select a license image.','er');
  if(new Date(exp) <= new Date(mfd)) return toast('Expiry must be after manufacturing date.','er');
  
  withLoading('cb-submit-btn','Create & Generate QR', async() => {
    try {
      const base64 = await new Promise((res,rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target.result.split(',')[1]);
        r.onerror = rej;
        r.readAsDataURL(imgFile);
      });
      
      const fetchRes = await apiFetch('/batch/create-drugs-t1', {
        method:'POST',
        body: JSON.stringify({
          batch_id: batchId,
          drug_name: drugName,
          manufacturer_name: manuName,
          mfd: mfd,
          exp: exp,
          batch_quantity: qty,
          private_key: pk, // This will now successfully send to Python!
          image: base64
        })
      });
      
      // 1. Read the new JSON response!
      const data = await fetchRes.json();
      if(!fetchRes.ok) throw new Error(extractDetail(data));
      
      // 2. Fetch the Batch QR from our new Python endpoint
      document.getElementById('cb-qr-img').src = `${API()}/batch/qr/${data.batch_id}`;
      document.getElementById('cb-qr-wrap').classList.add('show');
      
      // 3. Read the TX and Hash from the JSON data
      document.getElementById('cb-tx-hash').textContent = `TX: ${data.transaction || '—'}`;
      document.getElementById('cb-chain-hash').textContent = `Seal: ${(data.blockchain_hash || '—').substring(0,24)}…`;
      toast(`✅ Batch ${batchId} registered!`);

      // 🚀 4. Add the Print PDF button right below the QR code!
      const wrap = document.getElementById('cb-qr-wrap'); 
      
      // Clean up the old button if they click submit twice
      const oldBtn = document.getElementById('print-qr-btn'); 
      if (oldBtn) oldBtn.remove();

      const printBtn = document.createElement('button');
      printBtn.id = 'print-qr-btn';
      printBtn.className = 'btn btn-g'; 
      printBtn.style.marginTop = '15px';
      printBtn.style.width = '100%';
      printBtn.innerHTML = '🖨️ Download Unit QRs (PDF)';
      
      // Trigger the PDF generation function
      printBtn.onclick = () => printUnitQRs(batchId, qty); 
      
      wrap.appendChild(printBtn);

    } catch(err){
      toast(err.message,'er');
    }
  });
}

/* ── PRINT UNIT QRS TO PDF ────────────────────────────── */
function printUnitQRs(batchId, quantity) {
  // 1. Open a new blank tab
  const printWindow = window.open('', '_blank');
  
  // 2. Build the HTML and CSS for a clean, printable grid
  let html = `
    <html>
      <head>
        <title>Print QRs - ${batchId}</title>
        <style>
          body { font-family: 'IBM Plex Mono', monospace; text-align: center; padding: 20px; }
          h2 { margin-bottom: 30px; }
          .grid { display: flex; flex-wrap: wrap; gap: 20px; justify-content: center; }
          .qr-card { 
            border: 1px dashed #aaa; 
            padding: 15px; 
            width: 140px; 
            page-break-inside: avoid; /* Prevents a QR from being cut in half across PDF pages */
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .qr-card img { width: 120px; height: 120px; margin-bottom: 10px; }
          .qr-card span { font-size: 0.75rem; font-weight: bold; }
        </style>
      </head>
      <body>
        <h2>Unit QRs: ${batchId}</h2>
        <p>Print this sheet and apply these codes to individual drug units.</p>
        <div class="grid">
  `;

  // 3. Loop through the quantity and generate a card for D1, D2, D3...
  for(let i = 1; i <= quantity; i++) {
    let drugId = `${batchId}-D${i}`;
    html += `
      <div class="qr-card">
        <img src="${API()}/batch/qr/${drugId}" alt="${drugId}" crossorigin="anonymous" />
        <span>${drugId}</span>
      </div>
    `;
  }

  // 4. Close the HTML and trigger the print dialog after a 1-second delay 
  // (to give the images time to load from the Python backend)
  html += `
        </div>
        <script>
          setTimeout(() => { window.print(); }, 1000);
        </script>
      </body>
    </html>
  `;

  // 5. Write it to the new tab!
  printWindow.document.write(html);
  printWindow.document.close();
}

/* FIX #6: removed curr_owner_id */
async function splitBatch() {
  const batch_id=document.getElementById('sp-batch-id')?.value.trim(),
        no_of_batches=parseInt(document.getElementById('sp-count')?.value),
        quantity_per_batch=parseInt(document.getElementById('sp-qty')?.value);
  if(!batch_id||!no_of_batches||!quantity_per_batch) return toast('All fields required.','er');
  withLoading('sp-submit-btn','Split Batch', async()=>{
    try {
      const res=await apiFetch('/batch/split-batch',{method:'POST',body:JSON.stringify({batch_id,no_of_batches,quantity_per_batch})});
      const data=await res.json(); if(!res.ok) throw new Error(extractDetail(data));
      showR('sp-resp',data); toast(`✂️ Split into ${no_of_batches} sub-batches!`);
    } catch(err){showR('sp-resp',err.message,true);toast(err.message,'er');}
  });
}

/* FIX #7: uses sd-new-name as recipient_username */
async function shipToDist() {
  const batch_id=document.getElementById('sd-batch-id')?.value.trim(),
        recipient_username=document.getElementById('sd-new-name')?.value.trim();
  if(!batch_id||!recipient_username) return toast('All fields required.','er');
  withLoading('sd-submit-btn','Initiate Shipment', async()=>{
    try {
      const res=await apiFetch('/batch/ship-dist',{method:'POST',body:JSON.stringify({batch_id,recipient_username})});
      const data=await res.json(); if(!res.ok) throw new Error(extractDetail(data));
      showR('sd-resp',data); toast('📦 Shipment initiated!');
    } catch(err){showR('sd-resp',err.message,true);toast(err.message,'er');}
  });
}

async function acceptDelivery() {
  const batch_id=document.getElementById('ad-batch-id')?.value.trim();
  if(!batch_id) return toast('Batch ID required.','er');
  withLoading('ad-submit-btn','Confirm Receipt', async()=>{
    try {
      const res=await apiFetch('/batch/receive-dist',{method:'POST',body:JSON.stringify({batch_id})});
      const data=await res.json(); if(!res.ok) throw new Error(extractDetail(data));
      showR('ad-resp',data); toast('✅ Delivery accepted!');
    } catch(err){showR('ad-resp',err.message,true);toast(err.message,'er');}
  });
}

/* FIX #8: uses sp2-new-name as recipient_username */
async function shipToPharma() {
  const batch_id=document.getElementById('sp2-batch-id')?.value.trim(),
        recipient_username=document.getElementById('sp2-new-name')?.value.trim();
  if(!batch_id||!recipient_username) return toast('All fields required.','er');
  withLoading('sp2-submit-btn','Ship to Pharmacy', async()=>{
    try {
      const res=await apiFetch('/batch/ship-pharma',{method:'POST',body:JSON.stringify({batch_id,recipient_username})});
      const data=await res.json(); if(!res.ok) throw new Error(extractDetail(data));
      showR('sp2-resp',data); toast('🏥 Shipped to pharmacy!');
    } catch(err){showR('sp2-resp',err.message,true);toast(err.message,'er');}
  });
}

async function acceptPharma() {
  const batch_id=document.getElementById('ap-batch-id')?.value.trim();
  if(!batch_id) return toast('Batch ID required.','er');
  withLoading('ap-submit-btn','Confirm Receipt', async()=>{
    try {
      const res=await apiFetch('/batch/receive-pharma',{method:'POST',body:JSON.stringify({batch_id})});
      const data=await res.json(); if(!res.ok) throw new Error(extractDetail(data));
      showR('ap-resp',data); toast('✅ Received at pharmacy!');
    } catch(err){showR('ap-resp',err.message,true);toast(err.message,'er');}
  });
}

async function sellDrug() {
  const batch_id=document.getElementById('sl-batch-id')?.value.trim(), drug_id=document.getElementById('sl-drug-id')?.value.trim();
  if(!batch_id||!drug_id) return toast('Both IDs required.','er');
  withLoading('sl-submit-btn','Mark as Sold', async()=>{
    try {
      const res=await apiFetch('/batch/drug-status',{method:'POST',body:JSON.stringify({batch_id,drug_id})});
      const data=await res.json(); if(!res.ok) throw new Error(extractDetail(data));
      showR('sl-resp',data); toast(`💊 ${drug_id} sold!`);
    } catch(err){showR('sl-resp',err.message,true);toast(err.message,'er');}
  });
}

async function assignRole() {
  const target_username=document.getElementById('ar-username')?.value.trim(), role_index=parseInt(document.getElementById('ar-role-index')?.value);
  if(!target_username||!role_index) return toast('All fields required.','er');
  withLoading('ar-submit-btn','Assign Role', async()=>{
    try {
      const res=await apiFetch('/batch/assign-role',{method:'POST',body:JSON.stringify({target_username,role_index})});
      const data=await res.json(); if(!res.ok) throw new Error(extractDetail(data));
      showR('ar-resp',data); toast(`✅ Role assigned to ${target_username}!`);
    } catch(err){showR('ar-resp',err.message,true);toast(err.message,'er');}
  });
}

async function dashboardLookup() {
  const id=document.getElementById('db-batch-id')?.value.trim();
  if(!id) return toast('Enter a Batch ID.','er');
  withLoading('db-submit-btn','Lookup', async()=>{
    try {
      const [detRes,verRes]=await Promise.allSettled([apiFetch(`/batch/batch-det/${encodeURIComponent(id)}`),apiFetch(`/batch/verify/${encodeURIComponent(id)}`)]);
      if(detRes.status==='rejected'||!detRes.value.ok){const e=detRes.status==='fulfilled'?await detRes.value.json():{};throw new Error(extractDetail(e)||'Not found');}
      const det=await detRes.value.json();
      const ver=(verRes.status==='fulfilled'&&verRes.value.ok)?await verRes.value.json():null;
      showR('db-resp',{...det,blockchain_status:ver?.status||'UNKNOWN',blockchain_message:ver?.message||''});
      toast(ver?.status==='VERIFIED'?'🛡️ Verified on-chain':'⚠️ Verification inconclusive');
    } catch(err){showR('db-resp',err.message,true);toast(err.message,'er');}
  });
}

async function checkRole() {
  const address=document.getElementById('rl-address')?.value.trim();
  if(!address) return toast('Enter a wallet address.','er');
  withLoading('rl-submit-btn','Check Role', async()=>{
    try {
      const res=await apiFetch(`/batch/role/${encodeURIComponent(address)}`);
      const data=await res.json(); if(!res.ok) throw new Error(extractDetail(data));
      showR('rl-resp',data);
    } catch(err){showR('rl-resp',err.message,true);toast(err.message,'er');}
  });
}


/* =========================================================
   QR FILE UPLOAD SCANNER (NO CAMERA)
   ========================================================= */
let html5QrCode = null;

function handleQRUpload(event) {
  if (event.target.files.length === 0) return;
  const file = event.target.files[0];

  // 1. Initialize the library on our hidden off-screen div
  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode("hidden-qr-reader");
  }

  toast("Scanning image...", "i");

  // 2. Scan the file in memory (false = don't render to UI)
  html5QrCode.scanFile(file, false)
    .then(decodedText => {
      console.log("SUCCESS! QR Decoded:", decodedText);
      processScannedQR(decodedText);
      event.target.value = ''; // Reset input for next time
    })
    .catch(err => {
      console.error("QR Scan Error:", err);
      toast("No QR code found in that image. Try a clearer screenshot.", "er");
      event.target.value = ''; // Reset input for next time
    });
}

/* ════════════════════════════════════════════════════════
   GOVERNANCE: PANEL 9 (PENDING PROPOSALS)
   ════════════════════════════════════════════════════════ */

async function loadPendingRequests() {
  const listDiv = document.getElementById('pr-pending-list');
  if (!listDiv) return;
  listDiv.innerHTML = '<span style="font-size:0.85rem; color:var(--muted);">Fetching pending applications...</span>';

  try {
    const res = await fetch(`${API()}/batch/pending_requests`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('rx_token')}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to load');

    const users = data.pending_users || [];
    if (users.length === 0) {
      listDiv.innerHTML = '<div style="padding: 1rem; background: var(--bg); border-radius: 6px; text-align: center; font-size: 0.85rem; color: var(--muted);">No pending applications right now.</div>';
      return;
    }

    // Map string roles to the Integer your Smart Contract expects
    const roleToIndex = { "MANUFACTURER": 1, "DISTRIBUTOR": 2, "PHARMACY": 3 };

    listDiv.innerHTML = users.map(u => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
        <div>
          <div style="font-weight: 600; font-size: 0.9rem; color: var(--text);">${u.company_name} <span style="font-size: 0.75rem; color: var(--muted);">(@${u.username})</span></div>
          <div style="font-size: 0.75rem; color: var(--muted); margin-top: 4px;">Wallet: <span style="font-family: monospace;">${u.wallet_address.substring(0,6)}...${u.wallet_address.substring(u.wallet_address.length-4)}</span></div>
          <div style="font-size: 0.75rem; margin-top: 2px;">Requested Role: <b style="color: var(--accent);">${u.role_requested}</b></div>
        </div>
        <button class="btn" style="background: var(--accent); color: white; padding: 6px 12px; font-size: 0.8rem;" 
                onclick="proposeCompany('${u.username}', ${roleToIndex[u.role_requested] || 0})">
          Propose To Chain
        </button>
      </div>
    `).join('');
  } catch (err) {
    listDiv.innerHTML = `<span style="color:var(--danger); font-size:0.8rem;">Error: ${err.message}</span>`;
  }
}

async function proposeCompany(targetUsername, roleIndex) {
  if (!confirm(`Propose @${targetUsername} to the DAO?`)) return;

  try {
    const res = await fetch(`${API()}/batch/propose_company`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('rx_token')}`
      },
      body: JSON.stringify({ target_username: targetUsername, role_index: roleIndex })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Proposal failed');

    showR('pr-resp', data);
    toast(`Successfully proposed @${targetUsername}!`);
    loadPendingRequests(); // Instantly refresh the table
  } catch (err) {
    showR('pr-resp', { error: err.message }, true);
    toast(err.message, 'er');
  }
}

/* ════════════════════════════════════════════════════════
   GOVERNANCE: PANEL 10 (DAO VOTING)
   ════════════════════════════════════════════════════════ */

async function loadActiveProposals() {
  const listDiv = document.getElementById('vt-active-list');
  if (!listDiv) return;
  listDiv.innerHTML = '<span style="font-size:0.85rem; color:var(--muted);">Fetching active proposals from blockchain...</span>';

  try {
    const res = await fetch(`${API()}/batch/active_proposals`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('rx_token')}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to load');

    const props = data.active_proposals || [];
    if (props.length === 0) {
      listDiv.innerHTML = '<div style="padding: 1rem; background: var(--bg); border-radius: 6px; text-align: center; font-size: 0.85rem; color: var(--muted);">No active proposals to vote on.</div>';
      return;
    }

    listDiv.innerHTML = props.map(p => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--bg); border: 1px solid var(--warn-bd); border-radius: 6px;">
        <div>
          <div style="font-weight: 600; font-size: 0.9rem; color: var(--text);">Proposal #${p.proposal_id}: ${p.company_name}</div>
          <div style="font-size: 0.75rem; color: var(--muted); margin-top: 4px;">Role: <b style="color: var(--accent);">${p.role_requested}</b></div>
          <div style="font-size: 0.75rem; margin-top: 2px;">Votes: <b style="font-size: 0.9rem; color: var(--warn);">${p.vote_count} / 4</b></div>
        </div>
        <button class="btn" style="background: var(--warn); color: var(--bg-card); padding: 6px 12px; font-size: 0.8rem;" 
                onclick="castVote(${p.proposal_id})">
          Cast Vote
        </button>
      </div>
    `).join('');
  } catch (err) {
    listDiv.innerHTML = `<span style="color:var(--danger); font-size:0.8rem;">Error: ${err.message}</span>`;
  }
}

async function castVote(proposalId) {
  if (!confirm(`Cast your cryptographic vote for Proposal #${proposalId}?`)) return;

  try {
    const res = await fetch(`${API()}/batch/vote`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('rx_token')}`
      },
      body: JSON.stringify({ proposal_id: proposalId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Voting failed');

    showR('vt-resp', data);
    toast(`Vote cast successfully!`);
    loadActiveProposals(); // Instantly refresh the table
  } catch (err) {
    showR('vt-resp', { error: err.message }, true);
    toast(err.message, 'er');
  }
}



/* ── THE TRAFFIC COP (ROUTING LOGIC) ──────────────────── */
function processScannedQR(decodedText) {
  try {
    let decodedStr = decodedText.toString().trim();
    let batchId = "";
    let drugId = "";

    // Safely extract from URL structure or raw text
    if (decodedStr.includes('batch_id=')) {
      batchId = decodedStr.split('batch_id=')[1].split('&')[0];
    } else if (decodedStr.includes('drug_id=')) {
      drugId = decodedStr.split('drug_id=')[1].split('&')[0];
      batchId = drugId.split('-D')[0]; // Extract parent batch from drug ID
    } else {
      // Fallback if they scanned a raw text QR
      if (decodedStr.includes('-D')) {
        drugId = decodedStr;
        batchId = drugId.split('-D')[0];
      } else {
        batchId = decodedStr;
      }
    }

    if (!batchId) throw new Error("Invalid QR Format");

    const activePanel = document.querySelector('.panel.active')?.id || document.querySelector('.page.active')?.id;

    // Route the data based on the active screen
    if (activePanel === 'page-landing' || activePanel === 'page-public') {
      document.getElementById('pub-id').value = drugId || batchId;
      lookupBatch(); 
    } 
    else if (activePanel === 'panel-transfer') {
      document.getElementById('sd-batch-id').value = batchId;
      document.getElementById('sd-new-name').focus();
      toast('Batch scanned. Enter Distributor Username.');
    } 
    else if (activePanel === 'panel-accept') {
      document.getElementById('ad-batch-id').value = batchId;
      acceptDelivery(); 
    } 
    else if (activePanel === 'panel-transfer-pharmacy') {
      document.getElementById('sp2-batch-id').value = batchId;
      document.getElementById('sp2-new-name').focus();
      toast('Batch scanned. Enter Pharmacy Username.');
    } 
    else if (activePanel === 'panel-pharmacy-accept') {
      document.getElementById('ap-batch-id').value = batchId;
      acceptPharma(); 
    } 
    else if (activePanel === 'panel-sell') {
      if (!drugId) return toast('Please scan an individual Drug Unit QR, not a Batch Box.', 'er');
      document.getElementById('sl-batch-id').value = batchId;
      document.getElementById('sl-drug-id').value = drugId;
      sellDrug(); 
    }

  } catch(e) {
    console.error("Traffic Cop Error:", e);
    toast("Could not read Rx-Block data from this QR", "er");
  }
}




/* ── Init ── */
window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.setAttribute('data-theme', localStorage.getItem('rxbt') || 'light');
  const saved = localStorage.getItem('userAllergies');
  if (saved) { const el=document.getElementById('page-allergies'); if(el) el.value=saved; }

  /* FIX #1: restore authToken before calling executeLogin */
  const savedToken = localStorage.getItem('rx_token');
  const savedRole  = localStorage.getItem('rx_role');
  const savedUser  = localStorage.getItem('rx_user');

  if (savedToken && savedRole && savedUser) {
    authToken = savedToken;   /* ← was missing: caused silent 401s on every refresh */
    executeLogin(savedRole, savedUser);
  } else {
    /* FIX #2: land on landing page, not verify page */
    document.getElementById('page-landing').classList.add('active');
  }

  const bid = new URLSearchParams(window.location.search).get('batch_id');
  if (bid && authToken) { document.getElementById('pub-id').value=bid; lookupBatch(); }

  /* Reflect stored API key in the badge immediately */
  _refreshKeyBadge();
});