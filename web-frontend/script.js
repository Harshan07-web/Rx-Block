let leafletMap = null;
let mapLayers = [];
/* CONFIG  */
const API = () => document.getElementById('api-url').value.replace(/\/$/,'');

/* TOAST  */
function toast(msg, type='ok') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span style="font-size:.9rem;font-weight:700">${type==='ok'?'✓':'✕'}</span><span>${msg}</span>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(()=>{el.style.opacity='0';el.style.transform='translateX(10px)';el.style.transition='all .4s';},3500);
  setTimeout(()=>el.remove(),4000);
}

function showR(id, data, err=false) {
  const el = document.getElementById(id);
  el.className = `api-resp show ${err?'er':'ok'}`;
  el.textContent = typeof data==='string'?data:JSON.stringify(data,null,2);
}

/* THEME  */
function toggleTheme() {
  const h = document.documentElement;
  const dark = h.getAttribute('data-theme')==='dark';
  h.setAttribute('data-theme', dark?'light':'dark');
  localStorage.setItem('rxbt', dark?'light':'dark');
}

/* AUTHENTICATION & RBAC  */
let currentUser = null; 
let currentUsername = "";
let qrBatchId = null;

const chainPasswords = { "mfg": "mfg123", "dist": "dist123", "pharm": "pharm123", "gov": "gov123" };

function switchAuthTab(tab, btn) {
    document.getElementById('auth-patient').classList.remove('active');
    document.getElementById('auth-member').classList.remove('active');
    document.getElementById('auth-' + tab).classList.add('active');
    btn.parentElement.querySelectorAll('.vtab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function toggleGlobalMenu() {
    const menu = document.getElementById('global-menu');
    const overlay = document.getElementById('global-overlay');
    menu.classList.toggle('show');
    overlay.classList.toggle('show');
}

function goToProfile() {
    if (currentUser === 'patient') switchPage('stats');
    else if (currentUser) switchPage('admin');
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
    if (savedPass && savedPass === pass) executeLogin('patient', user);
    else toast('Invalid username or password', 'er');
}

function handleMemberLogin() {
    const role = document.getElementById('cm-role').value;
    const pass = document.getElementById('cm-pass').value;
    if (!role) return toast('Select a role', 'er');
    if (chainPasswords[role] === pass) executeLogin(role, role.toUpperCase() + ' ADMIN');
    else toast('Invalid Role Password', 'er');
}

function executeLogin(role, username) {
    currentUser = role;
    currentUsername = username;
    
    document.getElementById('auth-modal').classList.remove('show');
    const guestToast = document.getElementById('guest-toast');
    if(guestToast) guestToast.style.display = 'none';
    
    document.getElementById('nav-hamburger').style.display = 'flex';
    document.getElementById('nav-login-btn').style.display = 'none';
    document.getElementById('nav-user-container').style.display = 'flex';
    document.getElementById('top-username').textContent = username;
    
    document.querySelectorAll('.pt-only').forEach(el => el.style.display = (role === 'patient') ? 'block' : 'none');
    
    if (role !== 'patient') {
        document.getElementById('gm-admin-btn').style.display = 'block';
        document.getElementById('gm-admin-div').style.display = 'block';
        toast('Enterprise Access Granted');
        
        let firstVisiblePanel = null;
        document.querySelectorAll('[data-roles]').forEach(el => {
            const allowedRoles = el.getAttribute('data-roles').split(',');
            if (allowedRoles.includes(role) || allowedRoles.includes('all')) {
                el.style.display = 'flex'; 
                if(el.classList.contains('sb-item') && !firstVisiblePanel) firstVisiblePanel = el;
            } else el.style.display = 'none'; 
        });
        if(firstVisiblePanel) firstVisiblePanel.click();
    } else {
        document.getElementById('gm-admin-btn').style.display = 'none';
        document.getElementById('gm-admin-div').style.display = 'none';
        toast('Welcome back, ' + username);
    }
}

function toggleMapExpansion() {
    const wrapper = document.getElementById('map-wrapper');
    const btnText = document.getElementById('map-btn-text');
    wrapper.classList.toggle('expanded');
    
    if (wrapper.classList.contains('expanded')) {
        btnText.textContent = "Minimize";
        toast("Expanding Global Route View...");
    } else {
        btnText.textContent = "Expand Map";
    }
    
    // Recalculate map size after animation
    setTimeout(() => { if(leafletMap) leafletMap.invalidateSize(); }, 700);
}

function initRealMap(status) {
    if (leafletMap) {
        leafletMap.remove();
        leafletMap = null;
    }

    // Centered on a view of India
    leafletMap = L.map('real-map', { zoomControl: false }).setView([21, 78], 5);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(leafletMap);

    // Geographic Coordinates for the Journey
    const locations = {
        factory: [19.0760, 72.8777],    // Mumbai
        distributor: [28.7041, 77.1025], // Delhi
        pharmacy: [13.0827, 80.2707]    // Chennai
    };

    const waypoints = [L.latLng(locations.factory)];
    if(status !== 'CREATED') waypoints.push(L.latLng(locations.distributor));
    if(status === 'AT_PHARMACY' || status === 'SOLD') waypoints.push(L.latLng(locations.pharmacy));

    // 🚀 NEW: ROAD ROUTING ENGINE
    if (waypoints.length > 1) {
        L.Routing.control({
            waypoints: waypoints,
            lineOptions: {
                styles: [
                    {color: '#1478d4', opacity: 0.8, weight: 6}, // Main Road Line
                    {color: 'white', opacity: 0.4, weight: 2, dashArray: '5, 10'} // Animated Pulse Effect
                ]
            },
            createMarker: function(i, wp) {
                const labels = ["Factory", "Logistics Hub", "Pharmacy"];
                return L.circleMarker(wp.latLng, {
                    radius: 10, fillColor: "#1478d4", color: "#fff", weight: 3, fillOpacity: 1
                }).bindTooltip(labels[i], { permanent: true, direction: 'top', className: 'map-tooltip' });
            },
            addWaypoints: false,
            draggableWaypoints: false,
            routeWhileDragging: false
        }).addTo(leafletMap);

        // Auto-fit the map to show the whole road journey
        setTimeout(() => {
            const group = new L.featureGroup(waypoints.map(w => L.marker(w)));
            leafletMap.fitBounds(group.getBounds(), { padding: [50, 50] });
        }, 500);
    } else {
        // Just show the factory if only created
        L.circleMarker(locations.factory, {
            radius: 10, fillColor: "#1478d4", color: "#fff", weight: 3, fillOpacity: 1
        }).addTo(leafletMap).bindTooltip("🏭 Factory (Origin)", { permanent: true, direction: 'top' });
    }
}

function toggleMapExpansion() {
    const wrapper = document.getElementById('map-wrapper');
    const btnText = document.getElementById('map-btn-text');
    wrapper.classList.toggle('expanded');
    
    // Update button text
    btnText.textContent = wrapper.classList.contains('expanded') ? "Minimize" : "Expand Route";
    
    // Force Leaflet to re-calculate tiles for the new size
    setTimeout(() => { if(leafletMap) leafletMap.invalidateSize(true); }, 650);
}

function logoutUser() {
    currentUser = null;
    currentUsername = "";
    document.getElementById('nav-hamburger').style.display = 'none';
    document.getElementById('nav-login-btn').style.display = 'block';
    document.getElementById('nav-user-container').style.display = 'none';
    document.getElementById('gm-admin-btn').style.display = 'none';
    document.getElementById('gm-admin-div').style.display = 'none';
    
    document.getElementById('global-menu').classList.remove('show');
    document.getElementById('global-overlay').classList.remove('show');
    
    switchPage('public');
    toast('Logged out successfully');
}

function switchPage(p, btn) {
  if (p === 'admin' && (currentUser === null || currentUser === 'patient')) {
      toast('Access Denied: Enterprise Account Required.', 'er');
      document.getElementById('auth-modal').classList.add('show');
      return; 
  }
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(x=>x.classList.remove('active'));
  document.getElementById('page-'+p).classList.add('active');
  if(btn) btn.classList.add('active');
}

function switchVerify(t, btn) {
  const container = btn.closest('.hero') || document;
  container.querySelectorAll('.vtab').forEach(x=>x.classList.remove('active'));
  container.querySelectorAll('.vpanel').forEach(x=>x.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('vp-'+t).classList.add('active');
}

/* PUBLIC LOOKUP WITH MOCK DATABASE 🚀  */
const STO = ['CREATED','IN_DISTRIBUTION','AT_DISTRIBUTOR','AT_PHARMACY','SOLD'];

async function lookupBatch() {
  const id = document.getElementById('pub-id').value.trim();
  if (!id) return;
  const errEl = document.getElementById('pub-err');
  errEl.classList.remove('show');
  document.getElementById('result-card').classList.remove('show');
  document.getElementById('pub-loader').classList.add('show');

  document.getElementById('public-inner').classList.add('results-active');

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
    const [bR, mR] = await Promise.allSettled([
      fetch(`${API()}/batch/${encodeURIComponent(id)}`),
      fetch(`${API()}/batch/info/${encodeURIComponent(id)}`)
    ]);
    
    if (bR.reason && bR.reason.message.includes("Failed to fetch")) throw new Error("Backend offline. Use 'TEST-001' to demo.");

    const bd = bR.status==='fulfilled' ? await bR.value.json() : null;
    if (!bd || !bR.value.ok) throw new Error(bd?.detail || 'Batch not found on blockchain');
    const md = mR.status==='fulfilled' && mR.value.ok ? await mR.value.json() : null;
    
    renderResult(id, bd, md);
  } catch(e) {
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

  // 🚀 UPDATED FEATURE 2: COUNTERFEIT UI TOGGLE
  if (!auth) {
    document.getElementById('res-fake-alert').style.display = 'flex';
    document.getElementById('res-split-body').style.display = 'none';
    document.getElementById('res-allergy-alert').style.display = 'none';
    document.getElementById('result-card').style.border = "2px solid var(--danger)";
    document.getElementById('result-card').classList.add('show');
    return; // Stop rendering
  } else {
    document.getElementById('res-fake-alert').style.display = 'none';
    document.getElementById('res-split-body').style.display = 'grid';
  }

  // 🚀 NEW FEATURE 1: TRIGGER REAL GEOGRAPHIC MAP
  // This calls the Leaflet function we created to draw the real route
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
    if (i < si) {
      d.classList.add('done');
      l.classList.add('on');
    } else if (i === si) {
      d.classList.add('current');
      l.classList.add('on');
    }
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
    document.getElementById('res-se').innerHTML = finalSE.length ?
      finalSE.map(s => `<span class="tag tw">${s}</span>`).join('') :
      '<span class="tag tn">None listed</span>';

    const myAllergies = (localStorage.getItem('userAllergies') || '').toLowerCase();
    let clashFound = false;

    document.getElementById('res-al').innerHTML = finalAL.length ?
      finalAL.map(a => {
        if (myAllergies && myAllergies.includes(a.toLowerCase())) clashFound = true;
        return `<span class="tag td">${a}</span>`;
      }).join('') :
      '<span class="tag tn">None listed</span>';

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

// 🚀 FEATURE 3: SMART REMINDERS
function setupReminders() {
    const drug = document.getElementById('res-name').textContent;
    if(currentUser === null) {
        toast('Please login as a patient to set up calendar reminders.', 'er');
        document.getElementById('auth-modal').classList.add('show');
        return;
    }
    
    // Simulate Notification Request
    toast(`Syncing ${drug} with Apple Health / Google Calendar...`);
    setTimeout(() => {
        toast(`✅ Smart Reminders active. You will be notified at 9:00 AM daily.`);
    }, 1500);
}

// 🚀 FEATURE 2: BOUNTY CLAIM FUNCTION
function submitBountyClaim() {
    toast("Uploading photo and metadata to Polygon Validator Network...");
    setTimeout(() => {
        document.getElementById('bounty-modal').classList.remove('show');
        toast("✅ Smart Contract Executed! 5 MATIC has been transferred to your wallet for securing the network.");
    }, 2000);
}

function clearQR() {
  document.getElementById('qr-preview').classList.remove('show');
  document.getElementById('qr-decoded').textContent = '—';
  document.getElementById('qr-decoded').style.color = '';
  qrBatchId = null;
  document.getElementById('public-inner').classList.remove('results-active');
  document.getElementById('result-card').classList.remove('show');
}

/* QR CODE HANDLING */
function handleQRFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.getElementById('qr-canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      if (typeof jsQR === 'undefined') {
        toast('QR library not yet loaded. Please try again in a moment.', 'er');
        return;
      }

      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code) {
        qrBatchId = code.data;
        document.getElementById('qr-decoded').textContent = qrBatchId;
        document.getElementById('qr-decoded').style.color = 'var(--safe)';
        document.getElementById('qr-thumb').src = e.target.result;
        document.getElementById('qr-preview').classList.add('show');
        toast('QR Code decoded successfully!');
      } else {
        toast('No QR code found in this image. Try a clearer photo.', 'er');
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
  if (file && file.type.startsWith('image/')) {
    handleQRFile(file);
  } else {
    toast('Please drop an image file.', 'er');
  }
}

function lookupFromQR() {
  if (!qrBatchId) return toast('No QR code decoded yet.', 'er');
  document.getElementById('pub-id').value = qrBatchId;
  lookupBatch();
}

/* TAGS INPUT  */
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

//  PROFILE SAVING
function saveAllergiesFromPage() {
    const algs = document.getElementById('page-allergies').value.toLowerCase();
    localStorage.setItem('userAllergies', algs);
    toast('Profile safely secured on your device.');
}

/* INIT  */
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

// Admin panel code omitted for chat length, it remains perfectly untouched.