/* ============================================================
   Document Stitcher - Pure Vanilla JS  v7.7
   Features:  
   1. Multi-tool image editor (crop+rotate+flip+compress+convert at once)
   2. PDF input support with auto-detect + output options (pdf/jpg/png)
   3. Signature keyboard joystick placement (arrow keys)
   4. One-sided document cards with signature option
   5. Download format chooser (PDF/PNG/JPG) for every download
   6. Hardcoded password lock with 3-attempt video
   7. Multi-person A4 passport layout (up to 4 persons)
============================================================ */

/* ============================================================
   LOCK SYSTEM
   Fixed password: 1234. No JSONBin, server, or admin panel.
============================================================ */
const Lock = (() => {
  const STORAGE_KEY   = 'ds_session_ok';
  const ATTEMPTS_KEY  = 'ds_attempts';
  const INACTIVITY_MS = 3 * 60 * 1000; // 3 minutes
  const MAX_ATTEMPTS  = 3;

  // SHA-256 of the hardcoded password "1234"
  const PASSWORD_HASH = 'd3326ae777b0cf8b2f15145b4f68f5095e893762e2db7128bad3dbef8aabbb9a';

  let inactivityTimer = null;

  /* ---- Simple SHA-256 via SubtleCrypto ---- */
  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  function getBinId() {
    const fromUrl = new URLSearchParams(location.search).get('bin');
    if (fromUrl) {
      localStorage.setItem('ds_jsonbin_id', fromUrl.trim());
      return fromUrl.trim();
    }
    return localStorage.getItem('ds_jsonbin_id') || '';
  }

  /* ---- Fetch stored hash from JSONBin.io (public read for every device) ---- */
  async function fetchHashFromJsonBin() {
    const binId  = getBinId();
    const apiKey = localStorage.getItem('ds_jsonbin_key');
    if (!binId) return null;
    try {
      const r = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
        headers: apiKey ? { 'X-Master-Key': apiKey } : {},
        cache: 'no-store'
      });
      if (!r.ok) return null;
      const data = await r.json();
      return data.record && data.record.hash ? data.record.hash : null;
    } catch { return null; }
  }

  /* ---- Save hash to JSONBin.io ---- */
  async function saveHashToJsonBin(hash) {
    const binId  = localStorage.getItem('ds_jsonbin_id');
    const apiKey = localStorage.getItem('ds_jsonbin_key');
    if (!binId || !apiKey) return false;
    try {
      const r = await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': apiKey },
        body: JSON.stringify({ hash })
      });
      return r.ok;
    } catch { return false; }
  }

  /* ---- Fixed local password; no network request is made ---- */
  async function getValidHash() {
    return PASSWORD_HASH;
  }

  /* ---- Show lock screen ---- */
  function showLock() {
    sessionStorage.removeItem(STORAGE_KEY);
    const ls = document.getElementById('lockScreen');
    if (ls) { ls.style.display = 'flex'; }
    const inp = document.getElementById('lockInput');
    if (inp) { inp.value = ''; inp.focus(); }
    const errEl = document.getElementById('lockError');
    if (errEl) errEl.textContent = '';
    // Never show attempt count to users
    const attemptEl = document.getElementById('lockAttemptMsg');
    if (attemptEl) attemptEl.textContent = '';
  }

  /* ---- Unlock: verify password ---- */
  async function submit() {
    const inp = document.getElementById('lockInput');
    const val = inp ? inp.value : '';
    if (!val) { showError('Please enter the password.'); return; }

    const attempts = parseInt(sessionStorage.getItem(ATTEMPTS_KEY) || '0');
    const hash = await sha256(val);
    const valid = await getValidHash();

    if (hash === valid) {
      sessionStorage.setItem(STORAGE_KEY, '1');
      sessionStorage.removeItem(ATTEMPTS_KEY);
      document.getElementById('lockScreen').style.display = 'none';
      resetInactivity();
    } else {
      const newAttempts = attempts + 1;
      sessionStorage.setItem(ATTEMPTS_KEY, String(newAttempts));
      if (newAttempts >= MAX_ATTEMPTS) {
        sessionStorage.removeItem(ATTEMPTS_KEY);
        triggerFunnyVideo();
      } else {
        showError('Wrong password. Please try again.');
      }
      inp.value = '';
    }
  }

  function showError(msg) {
    const el = document.getElementById('lockError');
    if (el) el.textContent = msg;
  }

  /* ---- Funny video after 3 wrong attempts ---- */
  function triggerFunnyVideo() {
    const overlay = document.getElementById('rickrollOverlay');
    const vid     = document.getElementById('funnyVideo');
    if (!overlay || !vid) { showLock(); return; }

    // Clear any error message
    const errEl = document.getElementById('lockError');
    if (errEl) errEl.textContent = '';

    overlay.style.display = 'flex';
    vid.currentTime = 0;
    vid.play().catch(() => {});

    // When video ends naturally → go back to lock
    vid.onended = () => {
      overlay.style.display = 'none';
      vid.pause();
      showLock();
    };

    // Safety fallback: max 10 minutes, then back to lock regardless
    const fallbackTimer = setTimeout(() => {
      overlay.style.display = 'none';
      vid.pause();
      showLock();
    }, 10 * 60 * 1000);

    // Clear fallback timer if video ends naturally before timeout
    vid.onended = () => {
      clearTimeout(fallbackTimer);
      overlay.style.display = 'none';
      vid.pause();
      showLock();
    };
  }

  /* ---- Inactivity timer ---- */
  function resetInactivity() {
    clearTimeout(inactivityTimer);
    if (sessionStorage.getItem(STORAGE_KEY) !== '1') return;
    inactivityTimer = setTimeout(() => { showLock(); }, INACTIVITY_MS);
  }

  function bindActivity() {
    ['mousemove','mousedown','keydown','touchstart','scroll','click'].forEach(ev => {
      document.addEventListener(ev, resetInactivity, {passive:true});
    });
  }

  /* ---- Init ---- */
  async function init() {
    bindActivity();
    const unlocked = sessionStorage.getItem(STORAGE_KEY) === '1';
    if (!unlocked) {
      showLock();
    } else {
      resetInactivity();
    }
  }

  return { init, submit, showLock, resetInactivity, saveHashToJsonBin, sha256, getValidHash, getBinId };
})();

/* ============================================================
   ADMIN PANEL  (only visible to someone who already knows the password)
   Regular users have no access to this panel.
============================================================ */
const Admin = (() => {
  function init() {
    const params = new URLSearchParams(location.search);
    if (params.get('admin') === 'setup') {
      localStorage.setItem('ds_admin_setup', '1');
      params.delete('admin');
      const query = params.toString();
      history.replaceState(null, '', location.pathname + (query ? `?${query}` : '') + location.hash);
    }
    updateVisibility();
  }

  function updateVisibility() {
    const btn = document.getElementById('adminBtn');
    if (!btn) return;
    const isAdminDevice = !!localStorage.getItem('ds_jsonbin_key') || localStorage.getItem('ds_admin_setup') === '1';
    btn.style.display = isAdminDevice ? '' : 'none';
  }

  function open() {
    if (sessionStorage.getItem('ds_session_ok') !== '1') {
      alert('Please unlock the app first.');
      return;
    }
    const isAdminDevice = !!localStorage.getItem('ds_jsonbin_key') || localStorage.getItem('ds_admin_setup') === '1';
    if (!isAdminDevice) return;
    const panel = document.getElementById('adminPanel');
    if (!panel) return;
    panel.style.display = 'flex';
    // Pre-fill saved JSONBin settings (only visible in admin's browser)
    const bi = document.getElementById('adminBinId');
    const bk = document.getElementById('adminBinKey');
    if (bi) bi.value = localStorage.getItem('ds_jsonbin_id') || '';
    if (bk) bk.value = localStorage.getItem('ds_jsonbin_key') || '';
    document.getElementById('adminMsg').textContent = '';
  }

  function close() {
    const panel = document.getElementById('adminPanel');
    if (panel) panel.style.display = 'none';
  }

  async function save() {
    const cur     = document.getElementById('adminCurrentPw').value;
    const newPw   = document.getElementById('adminNewPw').value;
    const confirm = document.getElementById('adminConfirmPw').value;
    const binId   = document.getElementById('adminBinId').value.trim();
    const binKey  = document.getElementById('adminBinKey').value.trim();
    const msgEl   = document.getElementById('adminMsg');

    if (!cur || !newPw || !confirm) { setMsg('All fields required.', '#ff6b6b'); return; }
    if (newPw.length < 4) { setMsg('Password must be ≥ 4 characters.', '#ff6b6b'); return; }
    if (newPw !== confirm) { setMsg('New passwords do not match.', '#ff6b6b'); return; }

    // Verify current password
    const curHash = await Lock.sha256(cur);
    const valid   = await Lock.getValidHash();
    if (curHash !== valid) { setMsg('Current password is wrong.', '#ff6b6b'); return; }

    // Save JSONBin settings (only in admin's own browser)
    if (binId)  localStorage.setItem('ds_jsonbin_id', binId);
    if (binKey) localStorage.setItem('ds_jsonbin_key', binKey);

    const newHash = await Lock.sha256(newPw);
    // Try JSONBin first, fall back to localStorage
    const saved = await Lock.saveHashToJsonBin(newHash);
    localStorage.setItem('ds_pw_hash', newHash); // always save locally as backup too

    if (saved) {
      setMsg('✓ Password saved to JSONBin! All users will need the new password.', '#18a87a');
      localStorage.removeItem('ds_admin_setup');
      updateVisibility();
    } else {
      setMsg('✓ Password saved locally only (JSONBin update failed — check Bin ID & Master Key).', '#f0a830');
    }

    // Clear sensitive fields
    document.getElementById('adminCurrentPw').value = '';
    document.getElementById('adminNewPw').value = '';
    document.getElementById('adminConfirmPw').value = '';
  }

  function setMsg(msg, color) {
    const el = document.getElementById('adminMsg');
    if (el) { el.textContent = msg; el.style.color = color; }
  }

  return { init, open, close, save };
})();



const A4_MM = {
  portrait:  [210, 297],
  landscape: [297, 210],
};

const SLOT_META = {
  front: { label: Lang.t('slotFront'), badge: Lang.t('slotBadgeFront') },
  back:  { label: Lang.t('slotBack'),  badge: Lang.t('slotBadgeBack')  },
  sign:  { label: Lang.t('slotSign'),  badge: ''       },
};

const state = {
  docs: [],
  nextDocNumber: 1,
};

/* ============================================================
   UTILITY
============================================================ */
function fmtBytes(b) {
  if (!Number.isFinite(b)) return '-';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(2) + ' MB';
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function cleanFilename(name) {
  return (String(name||'document').trim().replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' '))||'document';
}
function toast(msg, type='success', containerId='toastWrap') {
  const w = document.getElementById(containerId);
  if (!w) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  w.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
function updateSliderGradient(el) {
  const pct = ((el.value - el.min) / (el.max - el.min) * 100).toFixed(1) + '%';
  el.style.setProperty('--pct', pct);
}
function waitFrame() { return new Promise(r => requestAnimationFrame(r)); }
function triggerFileInput(id) { const el = document.getElementById(id); if (el) el.click(); }
function getDoc(docId) { return state.docs.find(d => d.id === Number(docId)); }
function isDocReady(doc) { return !!(doc && doc.files.front && (doc.oneSided || doc.files.back)); }
function hasAnyFile(doc) { return !!(doc.files.front || doc.files.back || doc.files.sign); }
function toggleHelp() {
  const p = document.getElementById('helpPanel');
  if (p) p.style.display = p.style.display==='none' ? 'block' : 'none';
}

/* ============================================================
   DOWNLOAD FORMAT PICKER MODAL
============================================================ */
let _dlResolve = null;

function showDownloadPicker(title) {
  return new Promise(resolve => {
    _dlResolve = resolve;
    document.getElementById('dlPickerTitle').textContent = title || Lang.t('dlPickerTitle');
    const m = document.getElementById('dlPickerModal');
    m.style.cssText = 'display:flex !important;position:fixed;inset:0;z-index:200000;background:rgba(30,44,64,0.55);align-items:center;justify-content:center;backdrop-filter:blur(3px)';
  });
}
function pickDownloadFormat(fmt) {
  document.getElementById('dlPickerModal').style.display = 'none';
  if (_dlResolve) { _dlResolve(fmt); _dlResolve = null; }
}
function cancelDownloadPicker() {
  document.getElementById('dlPickerModal').style.display = 'none';
  if (_dlResolve) { _dlResolve(null); _dlResolve = null; }
}

/* ============================================================
   DOCUMENT MANAGEMENT
============================================================ */
function addDocument(oneSided = false) {
  const number = state.nextDocNumber++;
  state.docs.push({
    id: Date.now() + number,
    number,
    name: `${Lang.current() === 'bn' ? 'ডকুমেন্ট' : 'document'} ${number}`,
    orientation: 'portrait',
    quality: 80,
    oneSided,
    files: { front: null, back: null, sign: null },
    signatureEnabled: false,
    signScale: 1.0,
    signOffsetX: 0,  // mm offset from centre
    signOffsetY: 0,
    estimate: null,
    estimateStatus: 'waiting',
    estimateTimer: null,
    estimateToken: 0,
    pdfBlob: null,
    pdfUrl: null,
  });
  renderDocuments();
  refreshAllEstimates();
}

function removeDocument(docId) {
  if (state.docs.length <= 1) { toast(Lang.t('toastKeepOne'), 'error'); return; }
  const doc = getDoc(docId);
  if (doc && doc.pdfUrl) URL.revokeObjectURL(doc.pdfUrl);
  state.docs = state.docs.filter(d => d.id !== Number(docId));
  renderDocuments();
  updateBatchActions();
}

function renderDocuments() {
  const list = document.getElementById('documentsList');
  if (!list) return;
  list.innerHTML = state.docs.map(renderDocumentCard).join('');
  state.docs.forEach(doc => {
    const slider = document.getElementById(`quality-${doc.id}`);
    if (slider) updateSliderGradient(slider);
    schedulePreviewDraw(doc);
  });
  updateBatchActions();
}

function renderDocumentCard(doc) {
  const ready = isDocReady(doc);
  const estimateText = doc.estimate
    ? fmtBytes(doc.estimate)
    : ready
      ? (doc.estimateStatus==='working' ? Lang.t('estimateCalculating') : Lang.t('estimatePending'))
      : (doc.oneSided ? Lang.t('estimateAddFront') : Lang.t('estimateAddBoth'));
  const typeLabel = doc.oneSided ? Lang.t('typeLabelOneSided') : Lang.t('typeLabelTwoSided');

  return `
    <section class="card document-card" data-doc-id="${doc.id}">
      <div class="document-card-head">
        <div>
          <div class="document-kicker">${typeLabel}</div>
          <input class="doc-name-input" value="${escapeHtml(doc.name)}" aria-label="${Lang.t('docNameAria')}" oninput="updateDocName(${doc.id}, this.value)">
        </div>
        <button class="btn-ghost icon-btn" title="${Lang.t('removeTitle')}" onclick="removeDocument(${doc.id})">×</button>
      </div>

      <div class="document-settings">
        <div class="ctrl-group">
          <label class="ctrl-label" for="orientation-${doc.id}">${Lang.t('labelOrientation')}</label>
          <select class="ctrl-select" id="orientation-${doc.id}" onchange="updateDocOrientation(${doc.id}, this.value)">
            <option value="portrait"${doc.orientation==='portrait'?' selected':''}>${Lang.t('optPortrait')}</option>
            <option value="landscape"${doc.orientation==='landscape'?' selected':''}>${Lang.t('optLandscape')}</option>
          </select>
        </div>
        <div class="ctrl-group quality-control">
          <label class="ctrl-label" for="quality-${doc.id}">${Lang.t('labelQuality')} <span id="qualityLabel-${doc.id}">${doc.quality}%</span></label>
          <div class="slider-wrap">
            <input type="range" id="quality-${doc.id}" min="10" max="100" value="${doc.quality}" oninput="updateDocQuality(${doc.id}, this)" style="--pct:${doc.quality}%">
          </div>
          <div class="target-size-wrap" style="margin-top:8px">
            <input type="number" class="target-size-input" id="targetKb-${doc.id}" min="20" max="10240" placeholder="${Lang.t('targetSizePlaceholder')}" oninput="updateTargetKbLabel(${doc.id}, this)">
            <span class="ctrl-label" style="white-space:nowrap;align-self:center">KB</span>
            <button class="target-size-btn" onclick="applyTargetKb(${doc.id})">${Lang.t('btnSet')}</button>
          </div>
        </div>
        <div class="estimate-pill ${ready ? 'ready' : ''}">
          <span>${Lang.t('labelDownloadSize')}</span>
          <strong id="estimate-${doc.id}">${estimateText}</strong>
        </div>
      </div>

      <div class="doc-layout-preview ${doc.orientation}">
        <div class="paper-mini paper-mini-canvas" title="${ready ? Lang.t('previewAltReady') : Lang.t('previewAltWait')}" onclick="openPreviewLightbox(${doc.id})">
          <canvas class="preview-canvas" id="preview-canvas-${doc.id}"></canvas>
          ${ready ? '<div class="preview-canvas-hint">'+Lang.t('previewClickHint')+'</div>' : ''}
        </div>
      </div>

      <label class="signature-toggle">
        <input type="checkbox" ${doc.signatureEnabled ? 'checked' : ''} onchange="toggleSignature(${doc.id}, this.checked)">
        <span>${Lang.t('sigToggle')}</span>
      </label>
      ${doc.signatureEnabled ? renderSignControls(doc) : ''}

      <div class="doc-slot-grid ${doc.oneSided ? 'one-sided' : ''} ${doc.signatureEnabled ? 'with-signature' : ''}">
        ${renderSlot(doc, 'front')}
        ${!doc.oneSided ? renderSlot(doc, 'back') : ''}
        ${doc.signatureEnabled ? renderSlot(doc, 'sign') : ''}
      </div>

      <div class="document-actions">
        <button class="btn-primary" onclick="downloadDocument(${doc.id})" ${ready ? '' : 'disabled'}>${Lang.t('btnDownload')}</button>
        ${ready ? `<button class="btn-secondary" onclick="openPreviewLightbox(${doc.id})">${Lang.t('btnPreview')}</button>` : ''}
        <button class="btn-secondary" onclick="clearDocument(${doc.id})" ${hasAnyFile(doc) ? '' : 'disabled'}>${Lang.t('btnClearImages')}</button>
        ${doc.signatureEnabled && doc.files.sign ? `<button class="btn-secondary" onclick="openSignaturePlacer(${doc.id})">🎯 ${Lang.t('btnPlaceSign').replace('🎯 ','')}</button>` : ''}
      </div>
    </section>
  `;
}

function renderSignControls(doc) {
  const pct = ((doc.signScale * 100 - 30) / (300 - 30) * 100).toFixed(1) + '%';
  const label = Math.round(doc.signScale * 100) + '%';
  return `
    <div class="sign-scale-wrap">
      <label class="ctrl-label">${Lang.t('labelSigSize')} &nbsp;<span id="signScaleLabel-${doc.id}">${label}</span></label>
      <div class="slider-wrap" style="gap:8px">
        <span class="ctrl-label" style="font-size:10px">30%</span>
        <input type="range" id="signScale-${doc.id}" min="30" max="300" step="5" value="${Math.round(doc.signScale*100)}"
          oninput="updateSignScale(${doc.id}, this)" style="--pct:${pct}">
        <span class="ctrl-label" style="font-size:10px">300%</span>
      </div>
      <div class="sign-scale-presets">
        <button class="sign-preset-btn" onclick="setSignScale(${doc.id}, 0.5)">${Lang.t('signPresetSmall')}</button>
        <button class="sign-preset-btn" onclick="setSignScale(${doc.id}, 1.0)">${Lang.t('signPresetNormal')}</button>
        <button class="sign-preset-btn" onclick="setSignScale(${doc.id}, 1.5)">${Lang.t('signPresetLarge')}</button>
        <button class="sign-preset-btn" onclick="setSignScale(${doc.id}, 2.0)">${Lang.t('signPresetXL')}</button>
      </div>
      <div class="sign-offset-info" id="signOffset-${doc.id}" style="font-size:11px;color:var(--text-muted);margin-top:4px">
        ${Lang.t('signOffsetLabel')} X=${doc.signOffsetX.toFixed(1)}mm Y=${doc.signOffsetY.toFixed(1)}mm
        <button class="btn-ghost" style="font-size:10px;padding:2px 8px;margin-left:6px" onclick="resetSignOffset(${doc.id})">${Lang.t('btnResetOffset')}</button>
      </div>
    </div>
  `;
}

function renderSlot(doc, slot) {
  const fileObj = doc.files[slot];
  const meta = SLOT_META[slot];
  const optional = slot === 'sign';
  const inputId = `file-${doc.id}-${slot}`;
  const dropId  = `drop-${doc.id}-${slot}`;
  const accept  = slot === 'sign'
    ? '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'
    : '.jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf';

  return `
    <div class="doc-slot ${fileObj ? 'has-image' : ''}">
      <div class="slot-heading">
        <span>${meta.label}</span>
        <small>${meta.badge}</small>
      </div>
      <div class="drop-zone compact-drop" id="${dropId}"
           onclick="triggerFileInput('${inputId}')"
           ondragover="dzDrag(event,'${dropId}')"
           ondragleave="dzLeave('${dropId}')"
           ondrop="dzDrop(event,'${dropId}',${doc.id},'${slot}')">
        <input type="file" id="${inputId}" accept="${accept}" onchange="handleFile(this.files[0],${doc.id},'${slot}')">
        ${fileObj ? `
          <img class="drop-preview slot-img-clickable" src="${fileObj.dataUrl}" alt="${escapeHtml(meta.label)}" onclick="viewFull(${doc.id},'${slot}',event)" title="Click to enlarge">
          <div class="drop-overlay">
            <button class="btn-ghost" onclick="clearSlot(${doc.id},'${slot}',event)">${Lang.t('btnRemoveSlot')}</button>
            <button class="btn-ghost" onclick="viewFull(${doc.id},'${slot}',event)">${Lang.t('btnViewSlot')}</button>
          </div>
        ` : `
          <div class="drop-placeholder">
            <div class="drop-icon">${optional ? 'Sign' : slot==='front' ? Lang.t('slotBadgeFront') : Lang.t('slotBadgeBack')}</div>
            <div class="drop-label">${optional ? Lang.t('dropOptional') : Lang.t('dropClickOrDrag')}</div>
            <div class="drop-hint">${slot==='sign' ? Lang.t('hintImageOnly') : Lang.t('hintImagePdf')}</div>
          </div>
        `}
      </div>
      <div class="slot-info ${fileObj ? '' : 'empty'}">
        <span class="slot-fname">${fileObj ? escapeHtml(fileObj.file.name) : (optional ? Lang.t('noSignature') : Lang.t('slotRequired'))}</span>
        <span class="slot-size">${fileObj ? fmtBytes(fileObj.file.size) : ''}</span>
      </div>
    </div>
  `;
}

/* ============================================================
   DOC STATE UPDATES
============================================================ */
function updateDocName(docId, value) { const d = getDoc(docId); if (d) d.name = value; }
function updateDocOrientation(docId, value) {
  const d = getDoc(docId); if (!d) return;
  d.orientation = value === 'landscape' ? 'landscape' : 'portrait';
  invalidateDoc(d); renderDocuments(); scheduleDocEstimate(d);
}
function updateDocQuality(docId, el) {
  const d = getDoc(docId); if (!d) return;
  d.quality = Number(el.value); updateSliderGradient(el);
  const lbl = document.getElementById(`qualityLabel-${docId}`);
  if (lbl) lbl.textContent = d.quality + '%';
  const kbInput = document.getElementById(`targetKb-${docId}`);
  if (kbInput) { kbInput.value = ''; kbInput.classList.remove('ts-error','ts-ok'); }
  invalidateDoc(d); scheduleDocEstimate(d);
}
function updateTargetKbLabel(docId, el) {
  const v = parseInt(el.value);
  el.classList.remove('ts-error','ts-ok');
  if (!el.value) return;
  el.classList.add((isNaN(v)||v<20||v>10240) ? 'ts-error' : 'ts-ok');
}
async function applyTargetKb(docId) {
  const doc = getDoc(docId); if (!doc) return;
  const kbInput = document.getElementById(`targetKb-${docId}`);
  if (!kbInput) return;
  const targetKb = parseInt(kbInput.value);
  if (isNaN(targetKb)||targetKb<20||targetKb>10240) { kbInput.classList.add('ts-error'); toast(Lang.t('toastRangeKb'),'error'); return; }
  if (!isDocReady(doc)) { toast(Lang.t('toastUploadImgFirst'),'error'); return; }
  const targetBytes = targetKb * 1024;
  let lo=10,hi=100,bestQ=doc.quality,bestBlob=null;
  for (let i=0;i<8;i++) {
    const mid = Math.round((lo+hi)/2);
    const testDoc = Object.assign({},doc,{quality:mid});
    const blob = await buildDocPdfBlob(testDoc);
    if (blob.size <= targetBytes) { bestQ=mid; bestBlob=blob; lo=mid+1; } else { hi=mid-1; }
    if (lo>hi) break;
  }
  doc.quality = bestQ;
  if (bestBlob) { doc.pdfBlob=bestBlob; doc.estimate=bestBlob.size; doc.estimateStatus='ready'; }
  const slider = document.getElementById(`quality-${docId}`);
  if (slider) { slider.value=bestQ; updateSliderGradient(slider); }
  const lbl = document.getElementById(`qualityLabel-${docId}`);
  if (lbl) lbl.textContent = bestQ + '%';
  kbInput.classList.remove('ts-error'); kbInput.classList.add('ts-ok');
  updateEstimateText(doc); updateBatchActions();
  toast(Lang.t('toastQualitySet')+bestQ+'% (~'+fmtBytes(doc.estimate||0)+')');
}
function toggleSignature(docId, enabled) {
  const doc = getDoc(docId); if (!doc) return;
  doc.signatureEnabled = !!enabled;
  if (!doc.signatureEnabled) { doc.files.sign=null; doc.signOffsetX=0; doc.signOffsetY=0; }
  invalidateDoc(doc); renderDocuments(); scheduleDocEstimate(doc);
}
function updateSignScale(docId, el) {
  const doc = getDoc(docId); if (!doc) return;
  doc.signScale = Number(el.value)/100; updateSliderGradient(el);
  const lbl = document.getElementById('signScaleLabel-'+docId);
  if (lbl) lbl.textContent = Math.round(doc.signScale*100)+'%';
  invalidateDoc(doc); scheduleDocEstimate(doc); schedulePreviewDraw(doc);
}
function setSignScale(docId, scale) {
  const doc = getDoc(docId); if (!doc) return;
  doc.signScale = scale;
  const slider = document.getElementById('signScale-'+docId);
  if (slider) { slider.value=Math.round(scale*100); updateSliderGradient(slider); }
  const lbl = document.getElementById('signScaleLabel-'+docId);
  if (lbl) lbl.textContent = Math.round(scale*100)+'%';
  invalidateDoc(doc); scheduleDocEstimate(doc); schedulePreviewDraw(doc);
}
function resetSignOffset(docId) {
  const doc = getDoc(docId); if (!doc) return;
  doc.signOffsetX=0; doc.signOffsetY=0;
  updateSignOffsetDisplay(doc); invalidateDoc(doc); scheduleDocEstimate(doc); schedulePreviewDraw(doc);
}
function updateSignOffsetDisplay(doc) {
  const el = document.getElementById('signOffset-'+doc.id);
  if (el) el.innerHTML = `Position: X=${doc.signOffsetX.toFixed(1)}mm Y=${doc.signOffsetY.toFixed(1)}mm
    <button class="btn-ghost" style="font-size:10px;padding:2px 8px;margin-left:6px" onclick="resetSignOffset(${doc.id})">Reset</button>`;
}
function clearDocument(docId) {
  const doc = getDoc(docId); if (!doc) return;
  doc.files={front:null,back:null,sign:null}; doc.signatureEnabled=false; doc.signOffsetX=0; doc.signOffsetY=0;
  invalidateDoc(doc); renderDocuments();
}

/* ============================================================
   SIGNATURE KEYBOARD PLACER MODAL
============================================================ */
let _sigPlacerDocId = null;
let _sigPlacerAnimFrame = null;

function openSignaturePlacer(docId) {
  const doc = getDoc(docId);
  if (!doc || !doc.files.sign) { toast('Upload a signature image first.', 'error'); return; }
  _sigPlacerDocId = docId;
  const modal = document.getElementById('sigPlacerModal');
  modal.style.cssText = 'display:flex !important;position:fixed;inset:0;z-index:200001;background:rgba(18,26,40,0.88);flex-direction:column;align-items:center;justify-content:center;gap:16px;backdrop-filter:blur(4px);padding:20px';
  renderSigPlacer(doc);
  modal.focus();
}

function renderSigPlacer(doc) {
  const canvas = document.getElementById('sigPlacerCanvas');
  const ctx = canvas.getContext('2d');
  const isPort = doc.orientation === 'portrait';
  const [pw, ph] = isPort ? [210, 297] : [297, 210];

  // Canvas size for display
  const maxW = Math.min(window.innerWidth - 48, 480);
  const maxH = Math.min(window.innerHeight - 200, 600);
  let cW, cH;
  if (isPort) {
    cH = Math.min(maxH, maxW * 297/210);
    cW = cH * 210/297;
  } else {
    cW = Math.min(maxW, maxH * 297/210);
    cH = cW * 210/297;
  }
  canvas.width  = Math.round(cW);
  canvas.height = Math.round(cH);
  canvas.style.width  = Math.round(cW) + 'px';
  canvas.style.height = Math.round(cH) + 'px';

  drawSigPlacerCanvas(doc, canvas, ctx, pw, ph, cW, cH);
}

function drawSigPlacerCanvas(doc, canvas, ctx, pw, ph, cW, cH) {
  const scX = cW/pw, scY = cH/ph;

  // White background
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cW, cH);

  // Draw front image (or placeholder)
  const isPort = doc.orientation === 'portrait';
  const pad = 12, gap = 8;
  const hasSign = doc.signatureEnabled && doc.files.sign;
  const SIGN_BAND_H = 40;
  const imgAreaBot = hasSign ? ph - pad - SIGN_BAND_H : ph - pad;
  const imgAreaH = imgAreaBot - pad;
  const imgAreaW = pw - pad*2;

  function drawImg(imgEl, xMm, yMm, bW, bH) {
    if (!imgEl || !imgEl.complete || !imgEl.naturalWidth) {
      ctx.fillStyle = 'rgba(249,107,63,0.08)';
      ctx.fillRect(xMm*scX, yMm*scY, bW*scX, bH*scY);
      return;
    }
    const r = imgEl.naturalWidth/imgEl.naturalHeight;
    let w=bW, h=w/r; if(h>bH){h=bH;w=h*r;}
    ctx.drawImage(imgEl, (xMm+(bW-w)/2)*scX, yMm*scY, w*scX, h*scY);
  }

  if (isPort) {
    const halfH = (imgAreaH-gap)/2;
    drawImg(doc.files.front?.img, pad, pad, imgAreaW, halfH);
    if (!doc.oneSided) drawImg(doc.files.back?.img, pad, pad+halfH+gap, imgAreaW, halfH);
  } else {
    const halfW = (imgAreaW-gap)/2;
    drawImg(doc.files.front?.img, pad, pad, halfW, imgAreaH);
    if (!doc.oneSided) drawImg(doc.files.back?.img, pad+halfW+gap, pad, halfW, imgAreaH);
  }

  // Draw signature at current offset
  if (hasSign && doc.files.sign && doc.files.sign.img.complete && doc.files.sign.img.naturalWidth) {
    const signScale = doc.signScale || 1.0;
    const MAX_W = Math.min(63.5*signScale, pw-pad*2);
    const MAX_H = Math.min(40*signScale, 40);
    const sImg = doc.files.sign.img;
    const ratio = sImg.naturalWidth/sImg.naturalHeight;
    let sw=MAX_W, sh=sw/ratio; if(sh>MAX_H){sh=MAX_H;sw=sh*ratio;}

    const bandTop = imgAreaBot;
    const bandH   = ph - pad - bandTop;
    const baseX = (pw-sw)/2 + doc.signOffsetX;
    const baseY = bandTop + (bandH-sh)/2 + doc.signOffsetY;

    // Glow effect to show it's the active element
    ctx.save();
    ctx.shadowColor = 'rgba(249,107,63,0.6)';
    ctx.shadowBlur = 10;
    ctx.drawImage(sImg, baseX*scX, baseY*scY, sw*scX, sh*scY);
    ctx.restore();

    // Dashed border around signature
    ctx.setLineDash([3,3]);
    ctx.strokeStyle = 'rgba(249,107,63,0.7)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(baseX*scX-1, baseY*scY-1, sw*scX+2, sh*scY+2);
    ctx.setLineDash([]);
  }

  // Page border
  ctx.strokeStyle = 'rgba(30,44,64,0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, cW-1, cH-1);
}

function closeSigPlacer() {
  const m = document.getElementById('sigPlacerModal');
  m.style.display = 'none';
  _sigPlacerDocId = null;
  if (_sigPlacerAnimFrame) { cancelAnimationFrame(_sigPlacerAnimFrame); _sigPlacerAnimFrame = null; }
  renderDocuments();
}

function confirmSigPlacement() {
  if (_sigPlacerDocId !== null) {
    const doc = getDoc(_sigPlacerDocId);
    if (doc) { invalidateDoc(doc); scheduleDocEstimate(doc); schedulePreviewDraw(doc); }
    toast(Lang.t('toastSignSaved'));
  }
  closeSigPlacer();
}

// Keyboard joystick for signature placement
document.addEventListener('keydown', function(e) {
  if (_sigPlacerDocId === null) return;
  const modal = document.getElementById('sigPlacerModal');
  if (modal.style.display === 'none') return;

  const doc = getDoc(_sigPlacerDocId);
  if (!doc) return;

  const step = e.shiftKey ? 5 : 1; // Shift = bigger steps
  let changed = false;
  if (e.key === 'ArrowLeft')  { doc.signOffsetX -= step; changed = true; e.preventDefault(); }
  if (e.key === 'ArrowRight') { doc.signOffsetX += step; changed = true; e.preventDefault(); }
  if (e.key === 'ArrowUp')    { doc.signOffsetY -= step; changed = true; e.preventDefault(); }
  if (e.key === 'ArrowDown')  { doc.signOffsetY += step; changed = true; e.preventDefault(); }
  if (e.key === 'Enter')      { confirmSigPlacement(); return; }
  if (e.key === 'Escape')     { closeSigPlacer(); return; }

  if (changed) {
    // Clamp within reasonable bounds (±80mm)
    doc.signOffsetX = Math.max(-80, Math.min(80, doc.signOffsetX));
    doc.signOffsetY = Math.max(-80, Math.min(80, doc.signOffsetY));
    // Redraw
    const canvas = document.getElementById('sigPlacerCanvas');
    const ctx = canvas.getContext('2d');
    const isPort = doc.orientation === 'portrait';
    const [pw, ph] = isPort ? [210,297] : [297,210];
    drawSigPlacerCanvas(doc, canvas, ctx, pw, ph, canvas.width, canvas.height);
    // Update position display
    const posEl = document.getElementById('sigPlacerPos');
    if (posEl) posEl.textContent = `X: ${doc.signOffsetX.toFixed(1)}mm  Y: ${doc.signOffsetY.toFixed(1)}mm`;
  }
});

/* ============================================================
   FILE HANDLING (images + PDF)
============================================================ */
function dzDrag(e, id) { e.preventDefault(); const d=document.getElementById(id); if(d) d.classList.add('drag-over'); }
function dzLeave(id) { const d=document.getElementById(id); if(d) d.classList.remove('drag-over'); }
function dzDrop(e, dropId, docId, slot) {
  e.preventDefault(); dzLeave(dropId);
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file, docId, slot);
}

function handleFile(file, docId, slot) {
  if (!file) return;
  const doc = getDoc(docId); if (!doc || !SLOT_META[slot]) return;

  const isPDF  = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isImg  = file.type.startsWith('image/');

  if (slot === 'sign' && isPDF) { toast(Lang.t('toastSignOnlyImg'),'error'); return; }
  if (!isPDF && !isImg) { toast(Lang.t('toastSelectImg'),'error'); return; }

  if (isPDF) {
    loadPdfAsImage(file, docId, slot);
  } else {
    loadImageFile(file, docId, slot);
  }
}

function loadImageFile(file, docId, slot) {
  const doc = getDoc(docId);
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      doc.files[slot] = { file, dataUrl: e.target.result, img, sourceType: 'image' };
      invalidateDoc(doc); renderDocuments(); scheduleDocEstimate(doc); schedulePreviewDraw(doc);
    };
    img.onerror = () => toast(Lang.t('toastImageError'),'error');
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function loadPdfAsImage(file, docId, slot) {
  const doc = getDoc(docId);
  toast(Lang.t('toastPdfConverting'), 'success');

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      // Use PDF.js via CDN if available, else use canvas fallback
      if (window.pdfjsLib) {
        const pdf = await window.pdfjsLib.getDocument({ data: e.target.result }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.5 }); // high-res
        const canvas = document.createElement('canvas');
        canvas.width  = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        // Use PNG for lossless intermediate to avoid quality loss when re-encoding
        const dataUrl = canvas.toDataURL('image/png');
        const img = new Image();
        img.onload = () => {
          doc.files[slot] = { file, dataUrl, img, sourceType: 'pdf' };
          invalidateDoc(doc); renderDocuments(); scheduleDocEstimate(doc); schedulePreviewDraw(doc);
          toast(Lang.t('toastPdfConverted'));
        };
        img.src = dataUrl;
      } else {
        // PDF.js not loaded — try dynamic load
        if (!document.getElementById('pdfjs-script')) {
          const s = document.createElement('script');
          s.id = 'pdfjs-script';
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
          s.onload = () => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
              'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            loadPdfAsImage(file, docId, slot);
          };
          document.head.appendChild(s);
        }
        return;
      }
    } catch(err) {
      console.error(err);
      toast(Lang.t('toastPdfError'), 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function clearSlot(docId, slot, e) {
  if (e) e.stopPropagation();
  const doc = getDoc(docId); if (!doc) return;
  doc.files[slot]=null;
  if (slot==='sign') { doc.signOffsetX=0; doc.signOffsetY=0; }
  invalidateDoc(doc); renderDocuments(); scheduleDocEstimate(doc);
}
function viewFull(docId, slot, e) {
  if (e) e.stopPropagation();
  const doc=getDoc(docId); const f=doc&&doc.files[slot]; if(!f) return;
  document.getElementById('lightboxImg').src=f.dataUrl;
  document.getElementById('lightbox').style.display='flex';
}
function closeLightbox(e) {
  if (e && e.target===document.getElementById('lightboxImg')) return;
  document.getElementById('lightbox').style.display='none';
}

/* ============================================================
   CANVAS PREVIEW
============================================================ */
function drawPreviewCanvas(doc, canvas) {
  const isPort = doc.orientation === 'portrait';
  const [pw, ph] = isPort ? [210,297] : [297,210];
  const BASE = isPort ? 420 : 594;
  const cW = isPort ? Math.round(BASE*210/297) : BASE;
  const cH = isPort ? BASE : Math.round(BASE*210/297);
  canvas.width=cW; canvas.height=cH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,cW,cH);
  const scaleX=cW/pw, scaleY=cH/ph;
  const pagePad=12, gap=8;
  const hasSign = doc.signatureEnabled && doc.files.sign;
  const SIGN_BAND_H=40;
  const imgAreaTop=pagePad;
  const imgAreaBot = hasSign ? ph-pagePad-SIGN_BAND_H : ph-pagePad;
  const imgAreaH=imgAreaBot-imgAreaTop, imgAreaW=pw-pagePad*2;

  function drawImgInBox(imgEl, xMm, yMm, bW, bH) {
    if (!imgEl||!imgEl.complete||!imgEl.naturalWidth) return;
    const r=imgEl.naturalWidth/imgEl.naturalHeight;
    let w=bW,h=w/r; if(h>bH){h=bH;w=h*r;}
    ctx.drawImage(imgEl,(xMm+(bW-w)/2)*scaleX,yMm*scaleY,w*scaleX,h*scaleY);
  }
  function placeholder(xMm, yMm, bW, bH, label, clr1, clr2) {
    ctx.fillStyle=clr1; ctx.fillRect(xMm*scaleX,yMm*scaleY,bW*scaleX,bH*scaleY);
    ctx.fillStyle=clr2; ctx.font=`bold ${Math.round(10*scaleY)}px sans-serif`;
    ctx.textAlign='center';
    ctx.fillText(label,(xMm+bW/2)*scaleX,(yMm+bH/2)*scaleY);
  }

  if (isPort) {
    // One-sided: use full imgAreaH. Two-sided: split into halves
    const useH = doc.oneSided ? imgAreaH : (imgAreaH-gap)/2;
    const startY = imgAreaTop;
    if (doc.files.front?.img?.complete && doc.files.front.img.naturalWidth)
      drawImgInBox(doc.files.front.img, pagePad, startY, imgAreaW, useH);
    else placeholder(pagePad, startY, imgAreaW, useH, 'FRONT','rgba(249,107,63,0.10)','rgba(249,107,63,0.35)');

    if (!doc.oneSided) {
      if (doc.files.back?.img?.complete && doc.files.back.img.naturalWidth)
        drawImgInBox(doc.files.back.img, pagePad, startY+useH+gap, imgAreaW, useH);
      else placeholder(pagePad, startY+useH+gap, imgAreaW, useH, 'BACK','rgba(110,216,196,0.10)','rgba(24,168,122,0.35)');
    }
  } else {
    // Landscape: one-sided fills full width, two-sided splits
    const useW = doc.oneSided ? imgAreaW : (imgAreaW-gap)/2;
    if (doc.files.front?.img?.complete && doc.files.front.img.naturalWidth)
      drawImgInBox(doc.files.front.img, pagePad, imgAreaTop, useW, imgAreaH);
    else placeholder(pagePad, imgAreaTop, useW, imgAreaH, 'FRONT','rgba(249,107,63,0.10)','rgba(249,107,63,0.35)');

    if (!doc.oneSided) {
      if (doc.files.back?.img?.complete && doc.files.back.img.naturalWidth)
        drawImgInBox(doc.files.back.img, pagePad+useW+gap, imgAreaTop, useW, imgAreaH);
      else placeholder(pagePad+useW+gap, imgAreaTop, useW, imgAreaH, 'BACK','rgba(110,216,196,0.10)','rgba(24,168,122,0.35)');
    }
  }

  if (hasSign) {
    const bandTop=imgAreaBot, bandH=ph-pagePad-bandTop;
    if (doc.files.sign?.img?.complete && doc.files.sign.img.naturalWidth) {
      const signScale=doc.signScale||1.0;
      const MAX_W=Math.min(63.5*signScale,pw-pagePad*2), MAX_H=Math.min(40*signScale,40);
      const sImg=doc.files.sign.img; const ratio=sImg.naturalWidth/sImg.naturalHeight;
      let sw=MAX_W,sh=sw/ratio; if(sh>MAX_H){sh=MAX_H;sw=sh*ratio;}
      const sx=(pw-sw)/2+doc.signOffsetX, sy=bandTop+(bandH-sh)/2+doc.signOffsetY;
      ctx.drawImage(sImg, sx*scaleX, sy*scaleY, sw*scaleX, sh*scaleY);
    } else {
      ctx.fillStyle='rgba(24,168,122,0.08)';
      ctx.fillRect(pagePad*scaleX,bandTop*scaleY,imgAreaW*scaleX,bandH*scaleY);
      ctx.fillStyle='rgba(24,168,122,0.4)';
      ctx.font=`bold ${Math.round(8*scaleY)}px sans-serif`; ctx.textAlign='center';
      ctx.fillText('SIGNATURE',(pw/2)*scaleX,(bandTop+bandH/2)*scaleY);
    }
  }
  ctx.strokeStyle='rgba(30,44,64,0.12)'; ctx.lineWidth=1;
  ctx.strokeRect(0.5,0.5,cW-1,cH-1);
}

const _previewTimers = {};
function schedulePreviewDraw(doc) {
  if (_previewTimers[doc.id]) cancelAnimationFrame(_previewTimers[doc.id]);
  _previewTimers[doc.id] = requestAnimationFrame(() => {
    delete _previewTimers[doc.id];
    const canvas = document.getElementById('preview-canvas-'+doc.id);
    if (canvas) drawPreviewCanvas(doc, canvas);
  });
}
function openPreviewLightbox(docId) {
  const doc = getDoc(docId); if (!doc) return;
  const off = document.createElement('canvas');
  const isPort = doc.orientation==='portrait';
  const BASE = isPort ? 1400 : 1980;
  off.width  = isPort ? Math.round(BASE*210/297) : BASE;
  off.height = isPort ? BASE : Math.round(BASE*210/297);
  drawPreviewCanvas(doc, off);
  document.getElementById('lightboxImg').src = off.toDataURL('image/jpeg', 0.96);
  document.getElementById('lightbox').style.display='flex';
}

/* ============================================================
   PDF BUILD
============================================================ */
function invalidateDoc(doc) {
  doc.estimate=null; doc.estimateStatus=isDocReady(doc)?'pending':'waiting';
  doc.estimateToken+=1;
  if(doc.estimateTimer){clearTimeout(doc.estimateTimer);doc.estimateTimer=null;}
  if(doc.pdfUrl)URL.revokeObjectURL(doc.pdfUrl);
  doc.pdfUrl=null; doc.pdfBlob=null;
  updateEstimateText(doc); updateBatchActions();
}
function refreshAllEstimates() { state.docs.forEach(scheduleDocEstimate); }
function scheduleDocEstimate(doc) {
  if(!doc||!isDocReady(doc)){updateEstimateText(doc);updateBatchActions();return;}
  const token=++doc.estimateToken;
  doc.estimateStatus='working'; updateEstimateText(doc);
  if(doc.estimateTimer) clearTimeout(doc.estimateTimer);
  doc.estimateTimer=setTimeout(async()=>{
    try {
      await waitFrame();
      const blob=await buildDocPdfBlob(doc);
      if(token!==doc.estimateToken)return;
      doc.pdfBlob=blob; doc.estimate=blob.size; doc.estimateStatus='ready';
      updateEstimateText(doc); updateBatchActions();
    } catch(err){
      console.error(err);
      if(token===doc.estimateToken){doc.estimateStatus='error';updateEstimateText(doc,'Could not estimate');}
    }
  },220);
}
function updateEstimateText(doc, fallback) {
  if(!doc)return;
  const el=document.getElementById(`estimate-${doc.id}`); if(!el)return;
  if(fallback) el.textContent=fallback;
  else if(!isDocReady(doc)) el.textContent=doc.oneSided?Lang.t('estimateAddFront'):Lang.t('estimateAddBoth');
  else if(doc.estimate) el.textContent=fmtBytes(doc.estimate);
  else el.textContent=doc.estimateStatus==='working'?Lang.t('estimateCalculating'):Lang.t('estimatePending');
}

async function buildDocPdfBlob(doc) {
  if(!window.jspdf||!window.jspdf.jsPDF) throw new Error('PDF library not loaded.');
  if(!isDocReady(doc)) throw new Error('Front image required.');
  const {jsPDF}=window.jspdf;
  const [pw,ph]=A4_MM[doc.orientation];
  const quality=Math.max(0.1,Math.min(1,doc.quality/100));
  const pdf=new jsPDF({orientation:doc.orientation,unit:'mm',format:'a4',compress:true});

  const frontData=await imageToJpeg(doc.files.front.img,quality,3200);
  await waitFrame();
  let backData=null;
  if(!doc.oneSided&&doc.files.back) { backData=await imageToJpeg(doc.files.back.img,quality,3200); }

  const pagePad=12,gap=8;
  const hasSign=doc.signatureEnabled&&doc.files.sign;
  const SIGN_IMG_MAX=40, SIGN_BAND_H=40;
  const imgAreaTop=pagePad;
  const imgAreaBot=hasSign?ph-pagePad-SIGN_BAND_H:ph-pagePad;
  const imgAreaH=imgAreaBot-imgAreaTop, imgAreaW=pw-pagePad*2;

  if(doc.orientation==='portrait') {
    const useH=doc.oneSided?imgAreaH:(imgAreaH-gap)/2;
    addImageFit(pdf,frontData,doc.files.front.img,pagePad,imgAreaTop,imgAreaW,useH);
    if(!doc.oneSided&&backData) addImageFit(pdf,backData,doc.files.back.img,pagePad,imgAreaTop+useH+gap,imgAreaW,useH);
  } else {
    const useW=doc.oneSided?imgAreaW:(imgAreaW-gap)/2;
    addImageFit(pdf,frontData,doc.files.front.img,pagePad,imgAreaTop,useW,imgAreaH);
    if(!doc.oneSided&&backData) addImageFit(pdf,backData,doc.files.back.img,pagePad+useW+gap,imgAreaTop,useW,imgAreaH);
  }

  if(hasSign) {
    await waitFrame();
    const signData=await imageToJpeg(doc.files.sign.img,quality,2000);
    const bandTop=imgAreaBot;
    const bandH=ph-pagePad-bandTop;
    addSignatureWithOffset(pdf,signData,doc.files.sign.img,pw,bandTop,bandH,SIGN_IMG_MAX,pagePad,doc.signScale||1.0,doc.signOffsetX||0,doc.signOffsetY||0);
  }
  return pdf.output('blob');
}

function imageToJpeg(imgEl,quality,maxDim) {
  return new Promise(resolve=>{
    const naturalW=imgEl.naturalWidth,naturalH=imgEl.naturalHeight;
    // Use full resolution if image fits, only scale down if exceeds maxDim
    const scale=Math.min(1,maxDim/Math.max(naturalW,naturalH));
    const w=Math.max(1,Math.round(naturalW*scale)),h=Math.max(1,Math.round(naturalH*scale));
    const c=document.createElement('canvas'); c.width=w; c.height=h;
    const ctx=c.getContext('2d',{alpha:false,willReadFrequently:false});
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h);
    ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
    ctx.drawImage(imgEl,0,0,w,h);
    resolve(c.toDataURL('image/jpeg',quality));
  });
}
function addImageFit(pdf,dataUrl,imgEl,x,y,maxW,maxH) {
  const ratio=imgEl.naturalWidth/imgEl.naturalHeight;
  let w=maxW,h=w/ratio; if(h>maxH){h=maxH;w=h*ratio;}
  const cx=x+(maxW-w)/2, cy=y;
  pdf.addImage(dataUrl,'JPEG',cx,cy,w,h,undefined,'FAST');
}
function addSignatureWithOffset(pdf,dataUrl,imgEl,pageW,bandTop,bandH,maxImgH,pagePad,signScale,offsetX,offsetY) {
  signScale=signScale||1.0;
  const MAX_W=Math.min(63.5*signScale,pageW-pagePad*2);
  const MAX_H=Math.min(maxImgH*signScale,maxImgH);
  const ratio=imgEl.naturalWidth/imgEl.naturalHeight;
  let w=MAX_W,h=w/ratio; if(h>MAX_H){h=MAX_H;w=h*ratio;}
  const x=(pageW-w)/2+(offsetX||0);
  const y=bandTop+(bandH-h)/2+(offsetY||0);
  pdf.addImage(dataUrl,'JPEG',x,y,w,h,undefined,'FAST');
}

/* ============================================================
   DOWNLOAD WITH FORMAT CHOICE
============================================================ */
async function ensurePdf(doc) {
  if(doc.pdfBlob) return doc.pdfBlob;
  doc.estimateStatus='working'; updateEstimateText(doc);
  const blob=await buildDocPdfBlob(doc);
  doc.pdfBlob=blob; doc.estimate=blob.size; doc.estimateStatus='ready';
  updateEstimateText(doc); updateBatchActions();
  return blob;
}

async function downloadDocument(docId) {
  const doc = getDoc(docId);
  if (!isDocReady(doc)) { toast(Lang.t('toastUploadFirst'),'error'); return; }

  const fmt = await showDownloadPicker(Lang.t('dlPickerTitle'));
  if (!fmt) return;

  const btn = document.querySelector(`[data-doc-id="${doc.id}"] .btn-primary`);
  if (btn) btn.disabled=true;
  try {
    if (fmt === 'pdf') {
      const blob = await ensurePdf(doc);
      saveBlob(blob, cleanFilename(doc.name)+'.pdf');
    } else {
      // Render to canvas then export as image — use high-res canvas for quality
      const off = document.createElement('canvas');
      const isPort = doc.orientation==='portrait';
      // A4 at 300 DPI: portrait = 2480×3508, landscape = 3508×2480
      const BASE = isPort ? 3508 : 4961;
      off.width  = isPort ? Math.round(BASE*210/297) : BASE;
      off.height = isPort ? BASE : Math.round(BASE*210/297);
      drawPreviewCanvas(doc, off);
      const mime = fmt==='png' ? 'image/png' : 'image/jpeg';
      const quality = fmt==='png' ? 1.0 : Math.max(0.1, Math.min(1, doc.quality / 100));
      const dataUrl = off.toDataURL(mime, quality);
      const a=document.createElement('a');
      a.href=dataUrl; a.download=cleanFilename(doc.name)+'.'+(fmt==='png'?'png':'jpg');
      document.body.appendChild(a); a.click(); a.remove();
    }
    toast(Lang.t('toastDownloading')+cleanFilename(doc.name)+'.'+fmt);
  } catch(err) {
    console.error(err); toast(Lang.t('toastDownloadFail')+err.message,'error');
  } finally {
    if(btn) btn.disabled=false;
  }
}

async function downloadAllDocuments() {
  const readyDocs=state.docs.filter(isDocReady);
  if(!readyDocs.length){toast(Lang.t('toastNoReady'),'error');return;}
  const fmt=await showDownloadPicker(Lang.t('dlPickerAllTitle'));
  if(!fmt)return;
  const btn=document.getElementById('downloadAllBtn');
  if(btn)btn.disabled=true;
  try {
    for(const doc of readyDocs) {
      if(fmt==='pdf'){
        const blob=await ensurePdf(doc);
        saveBlob(blob,cleanFilename(doc.name)+'.pdf');
      } else {
        const off=document.createElement('canvas');
        const isPort=doc.orientation==='portrait';
        // A4 at 300 DPI for high quality
        const BASE=isPort?3508:4961;
        off.width=isPort?Math.round(BASE*210/297):BASE;
        off.height=isPort?BASE:Math.round(BASE*210/297);
        drawPreviewCanvas(doc,off);
        const mime=fmt==='png'?'image/png':'image/jpeg';
        const quality=fmt==='png'?1.0:Math.max(0.1,Math.min(1,doc.quality/100));
        const dataUrl=off.toDataURL(mime,quality);
        const a=document.createElement('a');
        a.href=dataUrl; a.download=cleanFilename(doc.name)+'.'+(fmt==='png'?'png':'jpg');
        document.body.appendChild(a);a.click();a.remove();
      }
      await new Promise(r=>setTimeout(r,350));
    }
    toast(Lang.t('toastStarted')+readyDocs.length+Lang.t('toastDownloads'));
  } catch(err){
    console.error(err); toast(Lang.t('toastDownloadError')+err.message,'error');
  } finally {
    if(btn)btn.disabled=false;
  }
}

function saveBlob(blob,filename) {
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
}
function updateBatchActions() {
  const rc=state.docs.filter(isDocReady).length;
  const el=document.getElementById('readyCount'); const btn=document.getElementById('downloadAllBtn');
  if(el)el.textContent=rc+Lang.t('toastReadyCount');
  if(btn)btn.disabled=rc===0;
}

/* ============================================================
   SDT NAVIGATION
============================================================ */
function sdtOpen() {
  document.getElementById('app-main').style.display='none';
  document.getElementById('sdt-fab').style.display='none';
  document.getElementById('sdt-page').style.display='block';
}
function sdtClose() {
  document.getElementById('sdt-page').style.display='none';
  document.getElementById('app-main').style.display='block';
  document.getElementById('sdt-fab').style.display='flex';
}

let _pendingSendImg=null;
function sdtSendToApp(imgElId,filenameBase) {
  const img=document.getElementById(imgElId);
  if(!img||!img.src||img.src.startsWith('data:,')) {sdt.toast(Lang.t('toastGenerateFirst'),'error');return;}
  _pendingSendImg={src:img.src,name:filenameBase};
  renderSlotPicker();
  document.getElementById('slotPicker').style.display='flex';
}
function renderSlotPicker() {
  const body=document.getElementById('slotPickerBody'); if(!body)return;
  body.innerHTML=state.docs.map(doc=>{
    const fo=!!doc.files.front,bo=!!doc.files.back,so=!!doc.files.sign;
    const frontBtn=fo?`<button class="btn-primary slot-occupied" disabled title="Occupied"><span class="slot-occ-icon">✓</span> Front</button>`:`<button class="btn-primary" onclick="doSendToSlot(${doc.id},'front')">${Lang.t('slotBtnFront')}</button>`;
    const backBtn=doc.oneSided?`<button class="btn-secondary" style="opacity:0.3" disabled title="One-sided">—</button>`
      :(bo?`<button class="btn-primary slot-occupied" disabled><span class="slot-occ-icon">✓</span> Back</button>`:`<button class="btn-primary" onclick="doSendToSlot(${doc.id},'back')">${Lang.t('slotBtnBack')}</button>`);
    const signBtn=so?`<button class="btn-secondary slot-occupied" disabled><span class="slot-occ-icon">✓</span> Sign</button>`:`<button class="btn-secondary" onclick="doSendToSlot(${doc.id},'sign')">${Lang.t('slotBtnSign')}</button>`;
    return `<div class="slot-picker-doc">
      <div class="slot-picker-doc-name">${escapeHtml(doc.name||'document '+doc.number)}${doc.oneSided?' <small>('+Lang.t('typeLabelOneSided')+')</small>':''}</div>
      <div class="slot-picker-actions">${frontBtn}${backBtn}${signBtn}</div>
    </div>`;
  }).join('')+`
    <button class="btn-secondary" style="width:100%;justify-content:center" onclick="sendToNewDocument()">${Lang.t('slotPickerAddNew')}</button>
    <button class="btn-ghost" style="width:100%;justify-content:center;margin-top:8px" onclick="closeSlotPicker()">Cancel</button>
  `;
}
function closeSlotPicker(e) {
  if(e&&e.target!==document.getElementById('slotPicker'))return;
  document.getElementById('slotPicker').style.display='none';
  _pendingSendImg=null;
}
function pendingSendFile() {
  if(!_pendingSendImg)return null;
  const arr=_pendingSendImg.src.split(',');
  const mime=(arr[0].match(/:(.*?);/)||[])[1]||'image/jpeg';
  const ext=mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';
  const bstr=atob(arr[1]); let n=bstr.length; const u8=new Uint8Array(n);
  while(n--)u8[n]=bstr.charCodeAt(n);
  return new File([u8],`${_pendingSendImg.name}.${ext}`,{type:mime});
}
function doSendToSlot(docId,slot) {
  const doc=getDoc(docId); if(!doc)return;
  if(doc.files[slot]){toast(Lang.t('slot'+slot.charAt(0).toUpperCase()+slot.slice(1))+Lang.t('toastOccupied'),'error');return;}
  const file=pendingSendFile(); if(!file)return;
  document.getElementById('slotPicker').style.display='none';
  _pendingSendImg=null;
  handleFile(file,docId,slot); sdtClose();
  toast(Lang.t('toastSentTo')+Lang.t('slot'+slot.charAt(0).toUpperCase()+slot.slice(1)).toLowerCase()+'.');
}
function sendToNewDocument() {
  const file=pendingSendFile(); if(!file)return;
  addDocument();
  const doc=state.docs[state.docs.length-1];
  document.getElementById('slotPicker').style.display='none';
  _pendingSendImg=null;
  handleFile(file,doc.id,'front'); sdtClose();
  toast(Lang.t('toastNewDocCreated'));
}

/* Refine the AI mask for still portraits: remove disconnected false positives,
   keep fine hair detail, and remove the old background colour from soft edges. */
function createPrecisePersonCutout(source, segmentationMask) {
  const width = source.width;
  const height = source.height;
  const count = width * height;
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext('2d', {willReadFrequently:true});
  maskCtx.drawImage(segmentationMask, 0, 0, width, height);
  const raw = maskCtx.getImageData(0, 0, width, height).data;
  const confidence = new Uint8Array(count);

  // A compact Gaussian pass reduces the blocky low-resolution model boundary.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let total = 0, weight = 0;
      for (let oy = -1; oy <= 1; oy++) {
        const yy = Math.max(0, Math.min(height - 1, y + oy));
        for (let ox = -1; ox <= 1; ox++) {
          const xx = Math.max(0, Math.min(width - 1, x + ox));
          const w = (ox === 0 ? 2 : 1) * (oy === 0 ? 2 : 1);
          total += raw[(yy * width + xx) * 4] * w;
          weight += w;
        }
      }
      confidence[y * width + x] = Math.round(total / weight);
    }
  }

  // Label confident connected regions and retain only the main portrait.
  const labels = new Int32Array(count);
  const queue = new Int32Array(count);
  let label = 0, largestLabel = 0, largestSize = 0;
  for (let start = 0; start < count; start++) {
    if (labels[start] || confidence[start] < 108) continue;
    label++;
    let head = 0, tail = 0;
    queue[tail++] = start;
    labels[start] = label;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const candidates = [index - width, index + width, index - 1, index + 1];
      for (let n = 0; n < 4; n++) {
        const next = candidates[n];
        if (next < 0 || next >= count || labels[next] || confidence[next] < 108) continue;
        if ((n === 2 && x === 0) || (n === 3 && x === width - 1)) continue;
        labels[next] = label;
        queue[tail++] = next;
      }
    }
    if (tail > largestSize) { largestSize = tail; largestLabel = label; }
  }
  if (!largestLabel || largestSize < count * 0.004) {
    throw new Error('No clear main person was detected. Try a sharper, well-lit photo.');
  }

  // Dilate the retained component slightly so wispy hair beside the core survives.
  const keep = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    if (labels[i] !== largestLabel) continue;
    const x = i % width, y = Math.floor(i / width);
    for (let oy = -3; oy <= 3; oy++) {
      const yy = y + oy;
      if (yy < 0 || yy >= height) continue;
      for (let ox = -3; ox <= 3; ox++) {
        const xx = x + ox;
        if (xx >= 0 && xx < width && ox * ox + oy * oy <= 9) keep[yy * width + xx] = 1;
      }
    }
  }

  const sourceCtx = source.getContext('2d', {willReadFrequently:true});
  const output = sourceCtx.getImageData(0, 0, width, height);
  const pixels = output.data;
  const smoothstep = value => {
    const t = Math.max(0, Math.min(1, (value - 0.16) / 0.68));
    return t * t * (3 - 2 * t);
  };

  for (let i = 0; i < count; i++) {
    const p = i * 4;
    if (!keep[i]) { pixels[p + 3] = 0; continue; }
    let alpha = smoothstep(confidence[i] / 255);
    if (alpha <= 0.01) { pixels[p + 3] = 0; continue; }

    // Find clean pixels just outside and inside the silhouette.
    const x = i % width, y = Math.floor(i / width);
    let bgIndex = -1, innerIndex = -1, edgeDepth = 7;
    for (let radius = 1; radius <= 6; radius++) {
      for (let oy = -radius; oy <= radius; oy++) {
        const yy = y + oy;
        if (yy < 0 || yy >= height) continue;
        for (let ox = -radius; ox <= radius; ox++) {
          if (Math.abs(ox) !== radius && Math.abs(oy) !== radius) continue;
          const xx = x + ox;
          if (xx < 0 || xx >= width) continue;
          const candidate = yy * width + xx;
          if (confidence[candidate] < 55) {
            if (bgIndex < 0) bgIndex = candidate * 4;
            edgeDepth = Math.min(edgeDepth, radius);
          }
          if (innerIndex < 0 && confidence[candidate] > 242) innerIndex = candidate * 4;
        }
      }
    }

    // Contract only the outer rim. This removes the dark/green one-pixel outline.
    const edgeAlpha = [1, 0.30, 0.66, 0.88, 0.96, 1, 1];
    alpha *= edgeAlpha[Math.min(edgeDepth, 6)];
    if (alpha <= 0.015) { pixels[p + 3] = 0; continue; }

    // Pull edge RGB toward a clean interior sample before alpha compositing.
    if (edgeDepth <= 4 && innerIndex >= 0) {
      const interiorMix = [0, 0.72, 0.48, 0.26, 0.10];
      const mix = interiorMix[edgeDepth];
      for (let channel = 0; channel < 3; channel++) {
        pixels[p + channel] = Math.round(pixels[p + channel] * (1 - mix) + pixels[innerIndex + channel] * mix);
      }
    }

    // Unmix any old background colour still stored in translucent hair pixels.
    if (bgIndex >= 0 && alpha < 0.98) {
      const safeAlpha = Math.max(alpha, 0.28);
      for (let channel = 0; channel < 3; channel++) {
        const foreground = (pixels[p + channel] - (1 - safeAlpha) * pixels[bgIndex + channel]) / safeAlpha;
        pixels[p + channel] = Math.max(0, Math.min(255, Math.round(foreground)));
      }
    }
    pixels[p + 3] = Math.round(alpha * 255);
  }

  const cutout = document.createElement('canvas');
  cutout.width = width;
  cutout.height = height;
  cutout.getContext('2d').putImageData(output, 0, 0);
  return cutout;
}

/* ============================================================
   SINGLE-DOC TOOLS MODULE — MULTI-TOOL (all-at-once)
============================================================ */
window.sdt = (() => {
  function toast(msg, type='success') {
    const w=document.getElementById('sdtToastWrap');
    const t=document.createElement('div'); t.className=`toast ${type}`; t.textContent=msg;
    w.appendChild(t); setTimeout(()=>t.remove(),3200);
  }
  function fmtBytes(b){if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';return(b/1048576).toFixed(2)+' MB';}
  function upSlider(el){const pct=((el.value-el.min)/(el.max-el.min)*100).toFixed(1)+'%';el.style.setProperty('--pct',pct);}
  function switchTab(name,btn){
    document.querySelectorAll('.tool-section').forEach(s=>s.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.getElementById('tab-'+name).classList.add('active');
    btn.classList.add('active');
  }
  function dzDrag(e,id){e.preventDefault();document.getElementById(id).classList.add('drag-over');}
  function dzLeave(id){document.getElementById(id).classList.remove('drag-over');}
  function dzDrop(e,id,loader){e.preventDefault();document.getElementById(id).classList.remove('drag-over');const f=e.dataTransfer.files[0];if(f)loader(f);}

  /* -------- MULTI-TOOL state -------- */
  let mtOrigFile=null, mtOrigImg=null;
  let mtState = {
    rotateDeg: 0,
    flipH: false,
    flipV: false,
    cropRect: null,     // {x,y,w,h} in original px
    quality: 85,
    format: 'jpeg',
    maxW: 0,
    hasCrop: false,
    brightness: 0,
  };
  let mtCropDragging=false, mtCropStartX=0, mtCropStartY=0;
  let mtDisplayScale=1, mtCropDisplayRect=null;
  let mtResultCanvas = document.createElement('canvas');
  const REMOVE_BG_API_URL = 'https://api.remove.bg/v1.0/removebg';
  const REMOVE_BG_API_KEY = 'tK4gdNqmJF55TqK3rVRyczzE';

  function cloneMtState(state = mtState) {
    return {
      rotateDeg: state.rotateDeg,
      flipH: state.flipH,
      flipV: state.flipV,
      cropRect: state.cropRect ? {...state.cropRect} : null,
      quality: state.quality,
      format: state.format,
      maxW: state.maxW,
      hasCrop: state.hasCrop,
      brightness: state.brightness || 0,
    };
  }

  function buildMtEditedSourceCanvas(image = mtOrigImg, state = mtState) {
    if (!image) return null;
    const rotC = makeTransformedCanvas(image, state);

    if (!state.hasCrop || !state.cropRect) return rotC;

    const cr = state.cropRect;
    const sx = Math.max(0, Math.min(cr.x, rotC.width - 1));
    const sy = Math.max(0, Math.min(cr.y, rotC.height - 1));
    const sw = Math.max(1, Math.min(cr.w, rotC.width - sx));
    const sh = Math.max(1, Math.min(cr.h, rotC.height - sy));
    const cropC = document.createElement('canvas');
    cropC.width = sw;
    cropC.height = sh;
    cropC.getContext('2d').drawImage(rotC, sx, sy, sw, sh, 0, 0, sw, sh);
    return cropC;
  }

  function canvasToBlob(canvas, type = 'image/png', quality = 0.95) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not prepare the image for background removal.')), type, quality);
    });
  }

  function canvasToLoadedImage(canvas) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not prepare the edited image.'));
      img.src = canvas.toDataURL('image/png');
    });
  }

  function blobToCanvas(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        resolve(canvas);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('The background-removal result could not be read.'));
      };
      img.src = url;
    });
  }

  function loadMultiToolFile(file) {
    if(!file||(file.type&&!file.type.startsWith('image/')&&file.type!=='application/pdf'&&!file.name.endsWith('.pdf'))){
      toast(Lang.t('toastSelectImgSdt'),'error'); return;
    }
    // If PDF: convert first
    if(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf')) {
      toast(Lang.t('toastPdfConvertFirst'),'success');
      const reader=new FileReader();
      reader.onload=async(e)=>{
        try {
          if(!window.pdfjsLib) {
            if(!document.getElementById('pdfjs-script')) {
              const s=document.createElement('script');
              s.id='pdfjs-script';
              s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
              s.onload=()=>{
                window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                loadMultiToolFile(file);
              };
              document.head.appendChild(s);
            }
            return;
          }
          const pdf=await window.pdfjsLib.getDocument({data:e.target.result}).promise;
          const page=await pdf.getPage(1);
          const viewport=page.getViewport({scale:2.5});
          const c=document.createElement('canvas');
          c.width=viewport.width; c.height=viewport.height;
          await page.render({canvasContext:c.getContext('2d'),viewport}).promise;
          const dataUrl=c.toDataURL('image/jpeg',0.92);
          const img=new Image();
          img.onload=()=>initMultiTool(img,file);
          img.src=dataUrl;
        } catch(err){toast(Lang.t('toastPdfConvertError'),'error');}
      };
      reader.readAsArrayBuffer(file);
      return;
    }
    const reader=new FileReader();
    reader.onload=e=>{
      const img=new Image();
      img.onload=()=>initMultiTool(img,file);
      img.onerror=()=>toast('Could not read image.','error');
      img.src=e.target.result;
    };
    reader.readAsDataURL(file);
  }


  function applyBrightnessFilter(ctx, w, h, level) {
    // level: -100 to +100. Positive = enhance brightness/contrast/vibrance
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const bAdj = level * 1.5;  // brightness offset
    const contrast = 1 + level * 0.008;
    const saturation = 1 + Math.max(0, level) * 0.012;
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i], g = data[i+1], b = data[i+2];
      // Contrast
      r = (r - 128) * contrast + 128;
      g = (g - 128) * contrast + 128;
      b = (b - 128) * contrast + 128;
      // Brightness
      r += bAdj; g += bAdj; b += bAdj;
      // Saturation (only for positive enhancement)
      if (level > 0) {
        const lum = 0.299*r + 0.587*g + 0.114*b;
        r = lum + (r - lum) * saturation;
        g = lum + (g - lum) * saturation;
        b = lum + (b - lum) * saturation;
      }
      data[i]   = Math.max(0, Math.min(255, Math.round(r)));
      data[i+1] = Math.max(0, Math.min(255, Math.round(g)));
      data[i+2] = Math.max(0, Math.min(255, Math.round(b)));
    }
    ctx.putImageData(imgData, 0, 0);
  }

  function mtSetBrightness(val) {
    mtState.brightness = parseInt(val);
    const lbl = document.getElementById('mtBrightnessLabel');
    if (lbl) lbl.textContent = (val >= 0 ? '+' : '') + val;
    const sl = document.getElementById('mtBrightness');
    if (sl) upSlider(sl);
    if (mtOrigImg) renderMultiTool();
  }

  function makeTransformedCanvas(image, state) {
    const deg = Number(state.rotateDeg || 0);
    const rad = deg * Math.PI / 180;
    const srcW = image.naturalWidth || image.width;
    const srcH = image.naturalHeight || image.height;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const outW = Math.max(1, Math.ceil(srcW * cos + srcH * sin));
    const outH = Math.max(1, Math.ceil(srcW * sin + srcH * cos));
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.translate(outW / 2, outH / 2);
    ctx.rotate(rad);
    ctx.scale(state.flipH ? -1 : 1, state.flipV ? -1 : 1);
    ctx.drawImage(image, -srcW / 2, -srcH / 2);
    ctx.restore();
    return canvas;
  }

  function clampCanvasPos(pos, canvas) {
    return {
      x: Math.max(0, Math.min(canvas.width, pos.x)),
      y: Math.max(0, Math.min(canvas.height, pos.y)),
    };
  }

  function clampCropRect(rect, canvas) {
    const x = Math.max(0, Math.min(rect.x, canvas.width));
    const y = Math.max(0, Math.min(rect.y, canvas.height));
    const w = Math.max(0, Math.min(rect.w, canvas.width - x));
    const h = Math.max(0, Math.min(rect.h, canvas.height - y));
    return {x, y, w, h};
  }

  function initMultiTool(img, file) {
    mtOrigFile=file; mtOrigImg=img;
    mtState={rotateDeg:0,flipH:false,flipV:false,cropRect:null,quality:85,format:'jpeg',maxW:0,hasCrop:false,brightness:0};
    mtSyncRotationControl();
    const bSlider=document.getElementById('mtBrightness');
    if(bSlider){bSlider.value=0;upSlider(bSlider);
      const bLbl=document.getElementById('mtBrightnessLabel');
      if(bLbl) bLbl.textContent='0';}
    document.getElementById('mtPlaceholder').style.display='none';
    document.getElementById('mtDrop').style.display='none';
    document.getElementById('mtEditor').style.display='block';
    document.getElementById('mtOrigSize').textContent=fmtBytes(file.size);
    document.getElementById('mtOrigDims').textContent=img.naturalWidth+'×'+img.naturalHeight;
    renderMultiTool();
  }

  function renderMultiTool() {
    // Apply rotate then crop to get current working image
    // Step 1: Rotate / flip. The output canvas grows for small tilt angles so nothing is clipped.
    const rotC=makeTransformedCanvas(mtOrigImg, mtState);

    // Step 2: Crop
    let cropSrc=rotC;
    if(mtState.hasCrop&&mtState.cropRect) {
      const cr=mtState.cropRect;
      const cOut=document.createElement('canvas');
      cOut.width=Math.max(1,cr.w); cOut.height=Math.max(1,cr.h);
      cOut.getContext('2d').drawImage(rotC,cr.x,cr.y,cr.w,cr.h,0,0,cr.w,cr.h);
      cropSrc=cOut;
    }

    // Step 3: Resize
    let finalW=cropSrc.width, finalH=cropSrc.height;
    if(mtState.maxW>0&&finalW>mtState.maxW) {finalH=Math.round(finalH*mtState.maxW/finalW);finalW=mtState.maxW;}
    const finalC=document.createElement('canvas'); finalC.width=Math.max(1,finalW); finalC.height=Math.max(1,finalH);
    const fCtx=finalC.getContext('2d');
    if(mtState.format!=='png'){fCtx.fillStyle='#fff';fCtx.fillRect(0,0,finalW,finalH);}
    fCtx.drawImage(cropSrc,0,0,finalW,finalH);
    // Step 4: Brightness/Enhancement
    if(mtState.brightness && mtState.brightness !== 0) {
      applyBrightnessFilter(fCtx, finalW, finalH, mtState.brightness);
    }
    mtResultCanvas=finalC;

    // Preview
    const mime=mtState.format==='png'?'image/png':mtState.format==='webp'?'image/webp':'image/jpeg';
    const qual=mtState.quality/100;
    const dataUrl=finalC.toDataURL(mime,mtState.format!=='png'?qual:undefined);
    document.getElementById('mtPreview').src=dataUrl;
    document.getElementById('mtNewSize').textContent=fmtBytes(Math.round(dataUrl.split(',')[1].length*0.75));
    document.getElementById('mtNewDims').textContent=finalW+'×'+finalH;

    // Draw crop UI on the display canvas
    drawMtCropCanvas(rotC);
    // Auto-refresh A4 preview
    setTimeout(()=>{ try{a4Preview();}catch(e){} },30);
  }

  function drawMtCropCanvas(rotated) {
    const wrap=document.getElementById('mtCropWrap');
    const maxW=Math.max((wrap.clientWidth||680) - 8, 320);
    // Always fill the wrap width so image appears big
    mtDisplayScale=maxW/rotated.width;
    // Cap to avoid absurdly huge display but allow up to 2x
    if(mtDisplayScale>2) mtDisplayScale=2;
    const dW=Math.round(rotated.width*mtDisplayScale);
    const dH=Math.round(rotated.height*mtDisplayScale);
    const cv=document.getElementById('mtCropCanvas');
    cv.width=dW; cv.height=dH;
    cv.style.width=dW+'px'; cv.style.height=dH+'px'; cv.style.maxWidth='none';
    const ctx=cv.getContext('2d');
    ctx.drawImage(rotated,0,0,dW,dH);

    // Draw crop rect if any
    if(mtCropDisplayRect) {
      ctx.strokeStyle='rgba(249,107,63,0.9)'; ctx.lineWidth=2; ctx.setLineDash([4,4]);
      ctx.strokeRect(mtCropDisplayRect.x,mtCropDisplayRect.y,mtCropDisplayRect.w,mtCropDisplayRect.h);
      ctx.setLineDash([]);
      ctx.fillStyle='rgba(249,107,63,0.08)';
      ctx.fillRect(mtCropDisplayRect.x,mtCropDisplayRect.y,mtCropDisplayRect.w,mtCropDisplayRect.h);

      // Show crop size info
      const imgW=Math.round(mtCropDisplayRect.w/mtDisplayScale);
      const imgH=Math.round(mtCropDisplayRect.h/mtDisplayScale);
      const infoEl=document.getElementById('mtCropInfo');
      if(infoEl) infoEl.textContent=`Selection: ${imgW}×${imgH}px  ≈  ${(imgW*0.0264583).toFixed(1)}×${(imgH*0.0264583).toFixed(1)} cm  |  ${(imgW*0.264583).toFixed(0)}×${(imgH*0.264583).toFixed(0)} mm`;
    } else {
      const infoEl=document.getElementById('mtCropInfo');
      if(infoEl&&!mtState.hasCrop) infoEl.textContent='';
    }
  }

  // Bind crop canvas events
  // KEY FIX: canvas is CSS-scaled (style.width != canvas.width), so we MUST use
  // getBoundingClientRect() for ALL events and scale the coords to canvas-pixel space.
  function getCropCanvasPos(clientX, clientY) {
    const cv = document.getElementById('mtCropCanvas');
    if (!cv) return {x:0,y:0};
    const rect = cv.getBoundingClientRect();
    // CSS display size vs actual canvas pixel size ratio
    const scaleX = cv.width  / rect.width;
    const scaleY = cv.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top)  * scaleY,
    };
  }

  function redrawCropOverlay() {
    const cv2 = document.getElementById('mtCropCanvas');
    if (!cv2) return;
    const ctx = cv2.getContext('2d');
    if (mtOrigImg) {
      const rotC=makeTransformedCanvas(mtOrigImg, mtState);
      ctx.drawImage(rotC, 0, 0, cv2.width, cv2.height);
    }
    if (mtCropDisplayRect) {
      const {x,y,w,h} = mtCropDisplayRect;
      // Darken outside selection
      ctx.fillStyle='rgba(0,0,0,0.35)';
      ctx.fillRect(0,0,cv2.width,y);            // top
      ctx.fillRect(0,y+h,cv2.width,cv2.height); // bottom
      ctx.fillRect(0,y,x,h);                    // left
      ctx.fillRect(x+w,y,cv2.width-x-w,h);     // right
      // Selection border
      ctx.strokeStyle='rgba(249,107,63,1)'; ctx.lineWidth=2; ctx.setLineDash([5,4]);
      ctx.strokeRect(x+0.5,y+0.5,w-1,h-1); ctx.setLineDash([]);
      // Corner handles
      const hs=7;
      ctx.fillStyle='rgba(249,107,63,0.9)';
      [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].forEach(([cx,cy])=>{
        ctx.fillRect(cx-hs/2, cy-hs/2, hs, hs);
      });
      // Live size info
      const iW=Math.round(w/mtDisplayScale), iH=Math.round(h/mtDisplayScale);
      const infoEl=document.getElementById('mtCropInfo');
      if(infoEl) infoEl.textContent=`Selection: ${iW}×${iH}px  ≈  ${(iW*0.0264583).toFixed(1)}×${(iH*0.0264583).toFixed(1)} cm  |  ${(iW*0.264583).toFixed(0)}×${(iH*0.264583).toFixed(0)} mm`;
    }
  }

  function bindMtCropEvents() {
    const cv=document.getElementById('mtCropCanvas'); if(!cv)return;

    // Remove old listeners by replacing with fresh ones via onX
    cv.onmousedown = e => {
      e.preventDefault();
      const pos = clampCanvasPos(getCropCanvasPos(e.clientX, e.clientY), cv);
      mtCropDragging=true;
      mtCropStartX=pos.x; mtCropStartY=pos.y;
      mtCropDisplayRect=null;
      redrawCropOverlay();
    };

    cv.onmousemove = e => {
      if(!mtCropDragging) return;
      const pos = clampCanvasPos(getCropCanvasPos(e.clientX, e.clientY), cv);
      const x=Math.min(mtCropStartX, pos.x), y=Math.min(mtCropStartY, pos.y);
      const w=Math.abs(pos.x - mtCropStartX),   h=Math.abs(pos.y - mtCropStartY);
      mtCropDisplayRect=clampCropRect({x,y,w,h}, cv);
      redrawCropOverlay();
    };

    cv.onmouseup = e => {
      if(!mtCropDragging) return;
      mtCropDragging=false;
      if(mtCropDisplayRect && mtCropDisplayRect.w>4 && mtCropDisplayRect.h>4){
        // Convert canvas-pixel coords → original image coords
        mtState.cropRect={
          x: Math.round(mtCropDisplayRect.x / mtDisplayScale),
          y: Math.round(mtCropDisplayRect.y / mtDisplayScale),
          w: Math.round(mtCropDisplayRect.w / mtDisplayScale),
          h: Math.round(mtCropDisplayRect.h / mtDisplayScale),
        };
        mtState.hasCrop=true;
        document.getElementById('mtApplyCropBtn').classList.add('active-state');
      }
    };

    cv.onmouseleave = e => {
      if(mtCropDragging) { mtCropDragging=false; }
    };

    // Touch support — same getBoundingClientRect approach
    cv.ontouchstart = e => {
      e.preventDefault();
      const t=e.touches[0];
      const pos=clampCanvasPos(getCropCanvasPos(t.clientX, t.clientY), cv);
      mtCropDragging=true; mtCropStartX=pos.x; mtCropStartY=pos.y;
      mtCropDisplayRect=null; redrawCropOverlay();
    };
    cv.ontouchmove = e => {
      e.preventDefault();
      if(!mtCropDragging) return;
      const t=e.touches[0];
      const pos=clampCanvasPos(getCropCanvasPos(t.clientX, t.clientY), cv);
      const x=Math.min(mtCropStartX,pos.x), y=Math.min(mtCropStartY,pos.y);
      const w=Math.abs(pos.x-mtCropStartX),  h=Math.abs(pos.y-mtCropStartY);
      mtCropDisplayRect=clampCropRect({x,y,w,h}, cv);
      redrawCropOverlay();
    };
    cv.ontouchend = e => {
      if(!mtCropDragging) return;
      mtCropDragging=false;
      if(mtCropDisplayRect && mtCropDisplayRect.w>4 && mtCropDisplayRect.h>4){
        mtState.cropRect={
          x: Math.round(mtCropDisplayRect.x / mtDisplayScale),
          y: Math.round(mtCropDisplayRect.y / mtDisplayScale),
          w: Math.round(mtCropDisplayRect.w / mtDisplayScale),
          h: Math.round(mtCropDisplayRect.h / mtDisplayScale),
        };
        mtState.hasCrop=true;
        document.getElementById('mtApplyCropBtn').classList.add('active-state');
      }
    };
  }

  function mtSyncRotationControl(){
    const input=document.getElementById('mtRotateFine');
    const label=document.getElementById('mtRotateFineLabel');
    const val=Math.round((Number(mtState.rotateDeg)||0)*10)/10;
    if(input) input.value=val;
    if(label) label.textContent=val+' deg';
  }
  function mtRotate(deg){mtState.rotateDeg=(Number(mtState.rotateDeg)||0)+Number(deg||0);mtCropDisplayRect=null;mtState.cropRect=null;mtState.hasCrop=false;mtSyncRotationControl();renderMultiTool();setTimeout(bindMtCropEvents,50);}
  function mtSetRotation(deg){mtState.rotateDeg=Number(deg)||0;mtCropDisplayRect=null;mtState.cropRect=null;mtState.hasCrop=false;mtSyncRotationControl();renderMultiTool();setTimeout(bindMtCropEvents,50);}
  function mtFlip(dir){if(dir==='h')mtState.flipH=!mtState.flipH;else mtState.flipV=!mtState.flipV;renderMultiTool();setTimeout(bindMtCropEvents,50);}
  function mtApplyCrop(){renderMultiTool();toast(Lang.t('toastCropApplied'));document.getElementById('mtApplyCropBtn').classList.add('active-state');}
  function mtClearCrop(){mtState.cropRect=null;mtState.hasCrop=false;mtCropDisplayRect=null;renderMultiTool();setTimeout(bindMtCropEvents,50);document.getElementById('mtApplyCropBtn').classList.remove('active-state');}
  function mtSetQuality(val){mtState.quality=Number(val);document.getElementById('mtQualLabel').textContent=val+'%';upSlider(document.getElementById('mtQual'));renderMultiTool();}
  function mtSetFormat(val){mtState.format=val;renderMultiTool();}
  function mtSetMaxW(val){mtState.maxW=Number(val);document.getElementById('mtMaxWLabel').textContent=Number(val)===0?'Original':val+'px';upSlider(document.getElementById('mtMaxW'));renderMultiTool();}
  function mtReset(){
    _mtBgMask=null;_mtBgRestoreSnapshot=null;_mtBgColor='transparent';
    const cr=document.getElementById('mtBgColorRow');if(cr)cr.style.display='none';
    const rb=document.getElementById('mtRestoreBgBtn');if(rb)rb.style.display='none';
    const st=document.getElementById('mtBgStatus');if(st)st.textContent='';
    mtState={rotateDeg:0,flipH:false,flipV:false,cropRect:null,quality:85,format:'jpeg',maxW:0,hasCrop:false,brightness:0};mtCropDisplayRect=null;
    document.getElementById('mtQual').value=85;document.getElementById('mtQualLabel').textContent='85%';
    document.getElementById('mtMaxW').value=0;document.getElementById('mtMaxWLabel').textContent='Original';
    document.getElementById('mtFmt').value='jpeg';
    mtSyncRotationControl();
    mtClearSize();
    renderMultiTool();setTimeout(bindMtCropEvents,50);
    toast(Lang.t('toastReset'));
  }

  /* ---- SIZE INPUT helpers ---- */
  function toMM(val, unit){
    if(unit==='mm') return val;
    if(unit==='cm') return val*10;
    if(unit==='in') return val*25.4;
    if(unit==='px') return val*0.264583; // at 96dpi
    return val;
  }
  function fromMM(mm, unit){
    if(unit==='mm') return mm;
    if(unit==='cm') return mm/10;
    if(unit==='in') return mm/25.4;
    if(unit==='px') return mm/0.264583;
    return mm;
  }
  function mtSizeChanged(){
    const wVal=parseFloat(document.getElementById('mtSizeW').value);
    const hVal=parseFloat(document.getElementById('mtSizeH').value);
    const uW=document.getElementById('mtSizeUnitW').value;
    const uH=document.getElementById('mtSizeUnitH').value;
    const infoEl=document.getElementById('mtSizeInfo');
    if(!isNaN(wVal)&&!isNaN(hVal)&&wVal>0&&hVal>0){
      const wMM=toMM(wVal,uW), hMM=toMM(hVal,uH);
      infoEl.textContent=`→ ${wMM.toFixed(1)}×${hMM.toFixed(1)} mm  |  ${(wMM/10).toFixed(2)}×${(hMM/10).toFixed(2)} cm  |  ${(wMM/25.4).toFixed(2)}×${(hMM/25.4).toFixed(2)} in`;
    } else { infoEl.textContent=''; }
    a4Preview();
  }
  function mtSizeUnitChanged(axis){
    // Sync both units to same (convenience)
    const wU=document.getElementById('mtSizeUnitW');
    const hU=document.getElementById('mtSizeUnitH');
    if(axis==='w') hU.value=wU.value;
    else wU.value=hU.value;
    mtSizeChanged();
  }
  function mtApplySizePreset(w,h,unit){
    document.getElementById('mtSizeW').value=w;
    document.getElementById('mtSizeH').value=h;
    document.getElementById('mtSizeUnitW').value=unit;
    document.getElementById('mtSizeUnitH').value=unit;
    mtSizeChanged();
  }
  function mtClearSize(){
    const sw=document.getElementById('mtSizeW');
    const sh=document.getElementById('mtSizeH');
    if(sw) sw.value='';
    if(sh) sh.value='';
    const infoEl=document.getElementById('mtSizeInfo');
    if(infoEl) infoEl.textContent='';
  }

  /* ---- A4 LAYOUT ---- */
  // Paper sizes: [widthMM, heightMM]
  const PAPER_SIZES = {
    'a4':    [210, 297],
    '4x6':   [101.6, 152.4],
    'custom': null, // user-defined
  };

  let a4State={orient:'landscape', count:4, margin:3, corner:'tl', imgDir:'row', gap:2,
               paperSize:'4x6', customPW:210, customPH:297};

  function getA4PageDims(){
    const s = a4State.paperSize;
    let bW, bH;
    if(s === 'custom'){
      bW = a4State.customPW || 210;
      bH = a4State.customPH || 297;
    } else {
      const base = PAPER_SIZES[s] || PAPER_SIZES['a4'];
      bW = base[0]; bH = base[1];
    }
    // Apply orientation
    if(a4State.orient === 'landscape'){
      return {pW: Math.max(bW,bH), pH: Math.min(bW,bH)};
    } else {
      return {pW: Math.min(bW,bH), pH: Math.max(bW,bH)};
    }
  }

  function setA4PaperSize(sz){
    a4State.paperSize = sz;
    const customRow = document.getElementById('a4CustomSizeRow');
    if(customRow) customRow.style.display = (sz==='custom') ? 'flex' : 'none';
    ['a4','4x6','custom'].forEach(k=>{
      const el=document.getElementById('a4Paper_'+k);
      if(el) el.classList.toggle('active', k===sz);
    });
    a4Preview();
  }

  function setA4CustomDim(){
    const wEl=document.getElementById('a4CustomPW');
    const hEl=document.getElementById('a4CustomPH');
    if(wEl) a4State.customPW = parseFloat(wEl.value)||210;
    if(hEl) a4State.customPH = parseFloat(hEl.value)||297;
    a4Preview();
  }

  function setA4Orient(o){
    a4State.orient=o;
    document.getElementById('a4OrientPortrait').classList.toggle('active',o==='portrait');
    document.getElementById('a4OrientLandscape').classList.toggle('active',o==='landscape');
    a4Preview();
  }
  function setA4Corner(c){
    a4State.corner=c;
    ['tl','tr','bl','br'].forEach(k=>{
      const el=document.getElementById('a4Corner_'+k);
      if(el) el.classList.toggle('active',k===c);
    });
    a4Preview();
  }
  function setA4ImgDir(d){
    a4State.imgDir=d;
    const rowBtn = document.getElementById('a4DirRow');
    const colBtn = document.getElementById('a4DirCol');
    if(rowBtn){ rowBtn.classList.remove('active'); if(d==='row') rowBtn.classList.add('active'); }
    if(colBtn){ colBtn.classList.remove('active'); if(d==='col') colBtn.classList.add('active'); }
    a4Preview();
  }
  function a4CountDelta(d){
    a4State.count=Math.max(1,Math.min(30,a4State.count+d));
    document.getElementById('a4CountLabel').textContent=a4State.count;
    a4Preview();
  }

  function getSizeMM(){
    const wVal=parseFloat(document.getElementById('mtSizeW')?.value);
    const hVal=parseFloat(document.getElementById('mtSizeH')?.value);
    const uW=document.getElementById('mtSizeUnitW')?.value||'cm';
    const uH=document.getElementById('mtSizeUnitH')?.value||'cm';
    if(!isNaN(wVal)&&!isNaN(hVal)&&wVal>0&&hVal>0){
      return {w:toMM(wVal,uW), h:toMM(hVal,uH)};
    }
    return null;
  }

  // Compute grid layout.
  // sizedExact=true  → placedW/H are FIXED at imgWmm×imgHmm (user set a real-world size).
  //                    Grid just figures out how many cols/rows fit without stretching.
  // sizedExact=false → auto-fit: stretch images to fill available space as large as possible.
  function computeA4Grid(pW, pH, imgWmm, imgHmm, marginMM, gapMM, count, sizedExact){
    const areaW = pW - marginMM*2;
    const areaH = pH - marginMM*2;

    if(sizedExact){
      // How many columns and rows fit at the EXACT specified size?
      const maxCols = Math.max(1, Math.floor((areaW + gapMM) / (imgWmm + gapMM)));
      const maxRows = Math.max(1, Math.floor((areaH + gapMM) / (imgHmm + gapMM)));
      // We need enough cells for `count` images
      const cols = Math.min(maxCols, count);
      const rows = Math.min(maxRows, Math.ceil(count / cols));
      // If user asks for more than fits, we still place as many as fit and warn
      const fits = cols * rows;
      return {
        cols, rows,
        placedW: imgWmm,   // EXACT — no scaling
        placedH: imgHmm,
        cellW:   imgWmm,
        cellH:   imgHmm,
        fitsOnPage: fits,
        overflow: count > fits,
      };
    }

    // Auto-fit: find the grid layout that makes images as large as possible
    let bestCols=1, bestRows=1, bestScale=0;
    for(let cols=1; cols<=count; cols++){
      const rows = Math.ceil(count/cols);
      if(cols*rows > count + cols) continue;
      const cellW = (areaW - Math.max(0,cols-1)*gapMM) / cols;
      const cellH = (areaH - Math.max(0,rows-1)*gapMM) / rows;
      if(cellW<=0 || cellH<=0) continue;
      const scale = Math.min(cellW/imgWmm, cellH/imgHmm);
      if(scale > bestScale){ bestScale=scale; bestCols=cols; bestRows=rows; }
    }
    const cellW = (areaW - Math.max(0,bestCols-1)*gapMM) / bestCols;
    const cellH = (areaH - Math.max(0,bestRows-1)*gapMM) / bestRows;
    const fitScale = Math.min(cellW/imgWmm, cellH/imgHmm);
    return {
      cols: bestCols, rows: bestRows,
      placedW: imgWmm*fitScale, placedH: imgHmm*fitScale,
      cellW, cellH,
      fitsOnPage: bestCols*bestRows,
      overflow: false,
    };
  }

  // Get position of image i in mm.
  // image 0 always lands in the chosen corner cell.
  function getImgPos(i, g, marginMM, gapMM){
    const {cols, rows, placedW, placedH, cellW, cellH} = g;
    const corner = a4State.corner;   // tl tr bl br
    const dir    = a4State.imgDir;   // row | col

    // 1. Natural (top-left) col,row for slot i
    let col, row;
    if(dir === 'row'){
      col = i % cols;
      row = Math.floor(i / cols);
    } else {
      // Column-by-column: fill down first, then next column
      col = Math.floor(i / rows);
      row = i % rows;
    }

    // 2. Mirror so image 0 is in the chosen corner.
    const flipH = (corner === 'tr' || corner === 'br');
    const flipV = (corner === 'bl' || corner === 'br');
    if(flipH) col = (cols - 1) - col;
    if(flipV) row = (rows - 1) - row;

    // 3. mm position using cell pitch so cells don't overlap.
    let xMM = marginMM + col*(cellW + gapMM) + (cellW - placedW)/2;
    let yMM = marginMM + row*(cellH + gapMM) + (cellH - placedH)/2;

    // 4. For bottom corners, anchor the whole grid block to the bottom.
    const _pageDims = getA4PageDims();
    if(flipV){
      const areaH = _pageDims.pH - marginMM*2;
      const blockH = rows*(cellH + gapMM) - gapMM;
      const shiftDown = areaH - blockH;
      yMM += shiftDown;
    }
    // Same logic for right-anchored columns.
    if(flipH){
      const areaW = _pageDims.pW - marginMM*2;
      const blockW = cols*(cellW + gapMM) - gapMM;
      const shiftRight = areaW - blockW;
      xMM += shiftRight;
    }

    return {xMM, yMM};
  }

  function a4Preview(){
    if(!mtResultCanvas||!mtResultCanvas.width) return;
    const marginMM = parseFloat(document.getElementById('a4Margin')?.value)||3;
    const gapRaw   = parseFloat(document.getElementById('a4Gap')?.value);
    const gapMM    = isNaN(gapRaw) ? 2 : Math.max(0, gapRaw);
    a4State.margin = marginMM;
    a4State.gap    = gapMM;
    const {pW, pH} = getA4PageDims();

    let imgWmm, imgHmm, sizedExact=false;
    const sized=getSizeMM();
    if(sized){
      imgWmm=sized.w; imgHmm=sized.h;
      sizedExact=true;   // ← user specified real-world dimensions → honour them exactly
    } else {
      const r=mtResultCanvas.width/mtResultCanvas.height;
      imgWmm=Math.min(80,(pW-marginMM*2));
      imgHmm=imgWmm/r;
    }

    const count = a4State.count;
    const g     = computeA4Grid(pW,pH,imgWmm,imgHmm,marginMM,gapMM,count,sizedExact);
    const placeable = Math.min(count, g.fitsOnPage);

    const PX_PER_MM=2.2;
    const cW=Math.round(pW*PX_PER_MM), cH=Math.round(pH*PX_PER_MM);
    const cv=document.getElementById('a4PreviewCanvas');
    cv.width=cW; cv.height=cH;
    cv.style.maxWidth=Math.min(cW,420)+'px';
    const ctx=cv.getContext('2d');
    ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,cW,cH);

    for(let i=0;i<placeable;i++){
      const {xMM,yMM}=getImgPos(i,g,marginMM,gapMM,pW,pH);
      const px=Math.round(xMM*PX_PER_MM), py=Math.round(yMM*PX_PER_MM);
      const pw2=Math.round(g.placedW*PX_PER_MM), ph2=Math.round(g.placedH*PX_PER_MM);
      if(pw2<1||ph2<1) continue;
      ctx.drawImage(mtResultCanvas, px, py, pw2, ph2);
      ctx.strokeStyle='rgba(160,160,185,0.6)'; ctx.lineWidth=0.6;
      ctx.strokeRect(px+0.5, py+0.5, pw2-1, ph2-1);
      // number label
      const fs=Math.max(7, Math.round(Math.min(pw2,ph2)*0.13));
      ctx.fillStyle='rgba(108,99,255,0.8)';
      ctx.font=`bold ${fs}px sans-serif`;
      ctx.textAlign='left'; ctx.textBaseline='top';
      ctx.fillText(i+1, px+2, py+2);
    }

    // Page border
    ctx.strokeStyle='rgba(108,99,255,0.4)'; ctx.lineWidth=1.5;
    ctx.strokeRect(0.5,0.5,cW-1,cH-1);
    // Margin guide
    const mPx=Math.round(marginMM*PX_PER_MM);
    ctx.strokeStyle='rgba(108,99,255,0.18)'; ctx.lineWidth=0.7; ctx.setLineDash([4,4]);
    ctx.strokeRect(mPx,mPx,cW-mPx*2,cH-mPx*2); ctx.setLineDash([]);

    const infoEl=document.getElementById('a4LayoutInfo');
    if(infoEl){
      let msg = `${g.cols} col × ${g.rows} row · each photo ${g.placedW.toFixed(1)}×${g.placedH.toFixed(1)} mm`;
      if(sizedExact) msg += ` (exact size)`;
      if(gapMM>0) msg += ` · gap ${gapMM}mm`;
      if(g.overflow) msg += ` ⚠ Only ${g.fitsOnPage} fit on this page at this size (asked for ${count})`;
      infoEl.textContent = msg;
      infoEl.style.color = g.overflow ? '#e04' : 'var(--text-muted)';
    }
  }

  async function downloadA4PDF(){
    if(!mtResultCanvas||!mtResultCanvas.width){toast('Upload and edit an image first.','error');return;}
    if(!window.jspdf||!window.jspdf.jsPDF){toast('PDF library not loaded.','error');return;}
    const {jsPDF}=window.jspdf;
    const marginMM = parseFloat(document.getElementById('a4Margin')?.value)||3;
    const gapRaw   = parseFloat(document.getElementById('a4Gap')?.value);
    const gapMM    = isNaN(gapRaw)?2:Math.max(0,gapRaw);
    const {pW, pH} = getA4PageDims();

    let imgWmm,imgHmm,sizedExact=false;
    const sized=getSizeMM();
    if(sized){imgWmm=sized.w;imgHmm=sized.h;sizedExact=true;}
    else{const r=mtResultCanvas.width/mtResultCanvas.height;imgWmm=Math.min(80,(pW-marginMM*2));imgHmm=imgWmm/r;}

    const count=a4State.count;
    const g=computeA4Grid(pW,pH,imgWmm,imgHmm,marginMM,gapMM,count,sizedExact);
    const placeable=Math.min(count,g.fitsOnPage);

    const paperFmt = a4State.paperSize==='a4' ? 'a4' : [Math.min(pW,pH), Math.max(pW,pH)];
    const pdf=new jsPDF({orientation:a4State.orient,unit:'mm',format:paperFmt,compress:true});
    const qual=mtState.quality/100;
    const dataUrl=mtResultCanvas.toDataURL('image/jpeg',qual);

    for(let i=0;i<placeable;i++){
      const {xMM,yMM}=getImgPos(i,g,marginMM,gapMM,pW,pH);
      pdf.addImage(dataUrl,'JPEG',xMM,yMM,g.placedW,g.placedH,undefined,'FAST');
    }
    saveBlob(pdf.output('blob'),'passport_photos_a4.pdf');
    if(g.overflow) toast(`PDF saved — only ${placeable} of ${count} fit at this size.`,'info');
    else toast('A4 PDF downloaded!');
  }

  /* ================================================================
     BULK PDF BUILDER
     Pages are stored as {id, name, dataUrl, canvas} objects.
     Drag-to-reorder is done with native HTML5 drag-and-drop on the
     thumbnail grid.  Full-page lightbox for preview / reorder / delete.
  ================================================================ */
  let bpPages   = [];   // [{id, name, dataUrl}]
  let bpDragIdx = null;
  let bpLbIdx   = 0;

  function bpId(){ return Date.now()+Math.random(); }

  // ---- File ingestion ----
  async function bpAddFiles(files){
    if(!files||!files.length) return;
    const arr = Array.from(files);
    document.getElementById('bpProgress').style.display='block';
    document.getElementById('bpToolbar').style.display='none';

    for(let i=0;i<arr.length;i++){
      const f=arr[i];
      document.getElementById('bpProgressLabel').textContent=`Loading ${i+1} of ${arr.length}: ${f.name}`;
      document.getElementById('bpProgressBar').style.width=((i/arr.length)*100)+'%';
      try {
        if(f.type==='application/pdf' || f.name.toLowerCase().endsWith('.pdf')){
          // Render each PDF page via jsPDF / pdf.js fallback
          const pages = await bpLoadPDF(f);
          pages.forEach(p => bpPages.push(p));
        } else {
          const dataUrl = await bpReadImg(f);
          bpPages.push({id:bpId(), name:f.name, dataUrl});
        }
      } catch(e){ toast(`Failed: ${f.name}`,'error'); }
    }

    document.getElementById('bpProgress').style.display='none';
    document.getElementById('bpProgressBar').style.width='0%';
    document.getElementById('bpToolbar').style.display='block';
    bpRender();
  }

  function bpReadImg(file){
    return new Promise((res,rej)=>{
      const r=new FileReader();
      r.onload=e=>res(e.target.result);
      r.onerror=rej;
      r.readAsDataURL(file);
    });
  }

  async function bpLoadPDF(file){
    // Use pdfjsLib if available (loaded lazily), else render via canvas hack
    if(!window.pdfjsLib){
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const arrayBuf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({data:arrayBuf}).promise;
    const pages = [];
    for(let p=1;p<=pdf.numPages;p++){
      document.getElementById('bpProgressLabel').textContent=`Reading PDF: ${file.name} — page ${p}/${pdf.numPages}`;
      const page = await pdf.getPage(p);
      const vp   = page.getViewport({scale:1.8});
      const cv   = document.createElement('canvas');
      cv.width=vp.width; cv.height=vp.height;
      await page.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
      pages.push({id:bpId(), name:`${file.name} p${p}`, dataUrl:cv.toDataURL('image/jpeg',0.92)});
    }
    return pages;
  }

  function loadScript(src){
    return new Promise((res,rej)=>{
      if(document.querySelector(`script[src="${src}"]`)){res();return;}
      const s=document.createElement('script'); s.src=src;
      s.onload=res; s.onerror=rej;
      document.head.appendChild(s);
    });
  }

  // ---- Render thumbnail grid ----
  function bpRender(){
    const grid=document.getElementById('bpGrid');
    const countEl=document.getElementById('bpCount');
    if(!grid) return;
    countEl.textContent=`${bpPages.length} page${bpPages.length!==1?'s':''}`;
    grid.innerHTML='';
    bpPages.forEach((pg,idx)=>{
      const card=document.createElement('div');
      card.className='bp-thumb-card';
      card.draggable=true;
      card.dataset.idx=idx;

      card.innerHTML=`
        <div class="bp-thumb-num">${idx+1}</div>
        <img class="bp-thumb-img" src="${pg.dataUrl}" alt="${pg.name}" loading="lazy">
        <div class="bp-thumb-name">${pg.name.length>22?pg.name.slice(0,19)+'…':pg.name}</div>
        <button class="bp-thumb-del" onclick="sdt.bpDelete(${idx})" title="Remove">✕</button>
        <div class="bp-thumb-move-row">
          <button class="bp-thumb-mv" onclick="sdt.bpMove(${idx},-1)" ${idx===0?'disabled':''}>◀</button>
          <button class="bp-thumb-mv" onclick="sdt.bpLbOpen(${idx})">🔍</button>
          <button class="bp-thumb-mv" onclick="sdt.bpMove(${idx},1)" ${idx===bpPages.length-1?'disabled':''}>▶</button>
        </div>`;

      // Click image to open lightbox
      card.querySelector('.bp-thumb-img').addEventListener('click',()=>bpLbOpen(idx));

      // Drag-and-drop reorder
      card.addEventListener('dragstart',e=>{
        bpDragIdx=idx;
        card.classList.add('bp-dragging');
        e.dataTransfer.effectAllowed='move';
      });
      card.addEventListener('dragend',()=>card.classList.remove('bp-dragging'));
      card.addEventListener('dragover',e=>{
        e.preventDefault();
        e.dataTransfer.dropEffect='move';
        document.querySelectorAll('.bp-thumb-card').forEach(c=>c.classList.remove('bp-drag-over'));
        card.classList.add('bp-drag-over');
      });
      card.addEventListener('dragleave',()=>card.classList.remove('bp-drag-over'));
      card.addEventListener('drop',e=>{
        e.preventDefault();
        card.classList.remove('bp-drag-over');
        if(bpDragIdx===null||bpDragIdx===idx) return;
        const moved=bpPages.splice(bpDragIdx,1)[0];
        bpPages.splice(idx,0,moved);
        bpDragIdx=null;
        bpRender();
      });

      grid.appendChild(card);
    });
  }

  function bpDelete(idx){
    bpPages.splice(idx,1);
    bpRender();
    if(!bpPages.length) document.getElementById('bpToolbar').style.display='none';
  }

  function bpMove(idx,dir){
    const to=idx+dir;
    if(to<0||to>=bpPages.length) return;
    [bpPages[idx],bpPages[to]]=[bpPages[to],bpPages[idx]];
    bpRender();
  }

  function bpSortByName(){
    bpPages.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}));
    bpRender();
    toast('Sorted by name');
  }

  function bpReverseOrder(){
    bpPages.reverse();
    bpRender();
    toast('Order reversed');
  }

  function bpClearAll(){
    if(!bpPages.length) return;
    if(!confirm(`Remove all ${bpPages.length} pages?`)) return;
    bpPages=[];
    document.getElementById('bpToolbar').style.display='none';
    document.getElementById('bpGrid').innerHTML='';
    toast('Cleared');
  }

  function bpDzDrop(e){
    e.preventDefault();
    document.getElementById('bpDrop').classList.remove('dz-over');
    bpAddFiles(e.dataTransfer.files);
  }

  // ---- Lightbox ----
  function bpLbOpen(idx){
    if(!bpPages.length) return;
    bpLbIdx=Math.max(0,Math.min(idx,bpPages.length-1));
    const lb=document.getElementById('bpLightbox');
    lb.style.display='flex';
    bpLbShow();
    // keyboard nav
    document.addEventListener('keydown',bpLbKey);
  }

  function bpLbShow(){
    const pg=bpPages[bpLbIdx];
    document.getElementById('bpLbImg').src=pg.dataUrl;
    document.getElementById('bpLbCounter').textContent=`${bpLbIdx+1} / ${bpPages.length}`;
    document.getElementById('bpLbName').textContent=pg.name;
    document.getElementById('bpLbPrev').disabled=bpLbIdx===0;
    document.getElementById('bpLbNext').disabled=bpLbIdx===bpPages.length-1;
    document.getElementById('bpLbMoveL').disabled=bpLbIdx===0;
    document.getElementById('bpLbMoveR').disabled=bpLbIdx===bpPages.length-1;
  }

  function bpLbNav(dir){
    bpLbIdx=Math.max(0,Math.min(bpLbIdx+dir,bpPages.length-1));
    bpLbShow();
  }

  function bpLbMove(dir){
    const to=bpLbIdx+dir;
    if(to<0||to>=bpPages.length) return;
    [bpPages[bpLbIdx],bpPages[to]]=[bpPages[to],bpPages[bpLbIdx]];
    bpLbIdx=to;
    bpLbShow();
    bpRender();
    toast(`Moved to position ${to+1}`);
  }

  function bpLbDelete(){
    if(!confirm('Remove this page?')) return;
    bpPages.splice(bpLbIdx,1);
    if(!bpPages.length){ bpLbClose(); return; }
    bpLbIdx=Math.min(bpLbIdx,bpPages.length-1);
    bpLbShow();
    bpRender();
  }

  function bpLbClose(){
    document.getElementById('bpLightbox').style.display='none';
    document.removeEventListener('keydown',bpLbKey);
  }

  function bpLbKey(e){
    if(e.key==='ArrowLeft')  { e.preventDefault(); bpLbNav(-1); }
    if(e.key==='ArrowRight') { e.preventDefault(); bpLbNav(1);  }
    if(e.key==='Escape')     { e.preventDefault(); bpLbClose(); }
  }

  // ---- PDF Download ----
  function bpPageFit(dim, marginMM) {
    const portrait = {orient:'portrait', pW:210, pH:297};
    const landscape = {orient:'landscape', pW:297, pH:210};
    const score = page => {
      const innerW = page.pW - marginMM * 2;
      const innerH = page.pH - marginMM * 2;
      const scale = Math.min(innerW / dim.w, innerH / dim.h);
      return {page, scale, area: dim.w * scale * dim.h * scale};
    };
    const p = score(portrait);
    const l = score(landscape);
    const best = l.area > p.area ? l : p;
    const innerW = best.page.pW - marginMM * 2;
    const innerH = best.page.pH - marginMM * 2;
    const iW = dim.w * best.scale;
    const iH = dim.h * best.scale;
    return {
      orient: best.page.orient,
      x: marginMM + (innerW - iW) / 2,
      y: marginMM + (innerH - iH) / 2,
      iW,
      iH,
    };
  }

  async function bpDownloadPDF(){
    if(!bpPages.length){ toast('No pages to export','error'); return; }
    if(!window.jspdf||!window.jspdf.jsPDF){ toast('PDF library not loaded','error'); return; }
    const {jsPDF}=window.jspdf;
    const pageMarginMM = 5;

    document.getElementById('bpProgress').style.display='block';
    document.getElementById('bpProgressLabel').textContent='Building PDF…';
    const bar=document.getElementById('bpProgressBar');

    const firstImg=await bpImgDimensions(bpPages[0].dataUrl);
    const firstFit=bpPageFit(firstImg, pageMarginMM);
    const pdf=new jsPDF({orientation:firstFit.orient,unit:'mm',format:'a4',compress:true});

    for(let i=0;i<bpPages.length;i++){
      const pg=bpPages[i];
      bar.style.width=((i/bpPages.length)*100)+'%';
      document.getElementById('bpProgressLabel').textContent=`Adding page ${i+1} of ${bpPages.length}…`;

      const dim=await bpImgDimensions(pg.dataUrl);
      const fit=bpPageFit(dim, pageMarginMM);
      if(i>0) pdf.addPage('a4', fit.orient);

      const fmt=pg.dataUrl.startsWith('data:image/png')?'PNG':'JPEG';
      pdf.addImage(pg.dataUrl,fmt,fit.x,fit.y,fit.iW,fit.iH,undefined,'FAST');

      // Yield to keep UI responsive
      await new Promise(r=>setTimeout(r,0));
    }

    bar.style.width='100%';
    document.getElementById('bpProgressLabel').textContent='Saving…';
    saveBlob(pdf.output('blob'),'bulk_document.pdf');
    setTimeout(()=>{
      document.getElementById('bpProgress').style.display='none';
      bar.style.width='0%';
    },800);
    toast(`PDF saved — ${bpPages.length} pages`);
  }

  function bpImgDimensions(dataUrl){
    return new Promise(res=>{
      const img=new Image();
      img.onload=()=>res({w:img.naturalWidth,h:img.naturalHeight});
      img.src=dataUrl;
    });
  }

  async function mtDownload() {
    const mime=mtState.format==='png'?'image/png':mtState.format==='webp'?'image/webp':'image/jpeg';
    const qual=mtState.quality/100;

    // Show format picker
    const fmt=await showDownloadPicker(Lang.t('dlPickerTitle'));
    if(!fmt)return;

    if(fmt==='pdf'){
      if(!window.jspdf||!window.jspdf.jsPDF){toast(Lang.t('toastPdfLibNotLoaded'),'error');return;}
      const {jsPDF}=window.jspdf;
      const w=mtResultCanvas.width,h=mtResultCanvas.height;
      const mmW=w*0.2646,mmH=h*0.2646; // px to mm at 96dpi
      const isPort=mmH>=mmW;
      const pdf=new jsPDF({orientation:isPort?'portrait':'landscape',unit:'mm',format:[Math.min(mmW,mmH),Math.max(mmW,mmH)],compress:true});
      const dataUrl=mtResultCanvas.toDataURL('image/jpeg',qual);
      pdf.addImage(dataUrl,'JPEG',0,0,pdf.internal.pageSize.getWidth(),pdf.internal.pageSize.getHeight(),undefined,'FAST');
      saveBlob(pdf.output('blob'),'edited_doc.pdf');
    } else {
      const outMime=fmt==='png'?'image/png':'image/jpeg';
      const outUrl=mtResultCanvas.toDataURL(outMime,qual);
      const a=document.createElement('a');a.href=outUrl;a.download='edited_doc.'+(fmt==='png'?'png':'jpg');
      document.body.appendChild(a);a.click();a.remove();
    }
    toast(Lang.t('toastDownloaded'));
  }

  function mtSendToApp() {
    const dataUrl=document.getElementById('mtPreview').src;
    if(!dataUrl||dataUrl.startsWith('data:,')){toast('Generate output first.','error');return;}
    _pendingSendImg={src:dataUrl,name:'edited_doc'};
    renderSlotPicker();
    document.getElementById('slotPicker').style.display='flex';
  }

  /* =====================================================================
     BACKGROUND REMOVAL — MediaPipe Selfie Segmentation (100% local)
     ===================================================================== */
  let _mtBgMask = null;       // transparent cut-out canvas
  let _mtBgRestoreSnapshot = null; // exact image + edit state before BG removal
  let _mtBgColor = 'transparent'; // current fill colour
  let _mtBgMode = 'local';

  function mtSetBgMode(mode) {
    _mtBgMode = mode === 'local' ? 'local' : 'api';
    const status = document.getElementById('mtBgStatus');
    if (status) status.textContent = _mtBgMode === 'api'
      ? 'remove.bg API selected. If it is unavailable, the built-in local remover will run.'
      : 'Built-in local remover selected.';
  }

  async function removeBgWithApi(sourceCanvas) {
    const blob = await canvasToBlob(sourceCanvas, 'image/png');
    const form = new FormData();
    form.append('image_file', blob, 'docstitcher-current.png');
    form.append('size', 'auto');
    form.append('format', 'png');

    const response = await fetch(REMOVE_BG_API_URL, {
      method: 'POST',
      headers: {'X-Api-Key': REMOVE_BG_API_KEY},
      body: form,
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      const error = new Error(`remove.bg API failed (${response.status}). ${details}`.trim());
      error.status = response.status;
      throw error;
    }

    return blobToCanvas(await response.blob());
  }

  async function removeBgWithLocal(sourceCanvas, onStatus) {
    if (onStatus) onStatus('Loading the built-in AI person detector...');
    return PersonBackground.remove(sourceCanvas, onStatus);
  }

  function bakeBackgroundResult() {
    const keepQuality = mtState.quality;
    const keepFormat = mtState.format;
    const keepMaxW = mtState.maxW;
    mtState = {rotateDeg:0,flipH:false,flipV:false,cropRect:null,quality:keepQuality,format:keepFormat,maxW:keepMaxW,hasCrop:false};
    mtCropDisplayRect = null;
    const cropBtn = document.getElementById('mtApplyCropBtn');
    if (cropBtn) cropBtn.classList.remove('active-state');
  }

  function _loadMediaPipe(cb) {
    if (window._mpSegmenter) { cb(window._mpSegmenter); return; }
    const status = document.getElementById('mtBgStatus');
    status.textContent = '⏳ Loading AI model (first time ~3 MB)…';

    // Load the MediaPipe selfie-segmentation solution
    function tryLoad() {
      if (typeof SelfieSegmentation !== 'undefined') {
        const seg = new SelfieSegmentation({locateFile: f =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1/${f}`
        });
        seg.setOptions({ modelSelection: 0 }); // Higher-detail model; works well for portraits and full body.
        seg.onResults(r => {
          if (window._mpSegCallback) window._mpSegCallback(r);
        });
        seg.initialize().then(() => {
          window._mpSegmenter = seg;
          status.textContent = '✅ AI model ready!';
          cb(seg);
        }).catch(e => {
          status.textContent = '❌ Model load failed: ' + e.message;
          const btn = document.getElementById('mtRemoveBgBtn');
          if (btn) { btn.disabled = false; btn.textContent = '✨ Remove Background'; }
        });
        return;
      }
      // Load script then retry
      if (!document.getElementById('mp-ss-script')) {
        const s = document.createElement('script');
        s.id = 'mp-ss-script';
        s.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1/selfie_segmentation.js';
        s.crossOrigin = 'anonymous';
        s.onload = () => tryLoad();
        s.onerror = () => {
          status.textContent = '❌ Failed to load AI files. Check your internet and try again.';
          const btn = document.getElementById('mtRemoveBgBtn');
          if (btn) { btn.disabled = false; btn.textContent = '✨ Remove Background'; }
        };
        document.head.appendChild(s);
      }
    }
    tryLoad();
  }

  async function mtRemoveBg() {
    if (!mtOrigImg) { toast('Upload an image first.', 'error'); return; }
    const btn = document.getElementById('mtRemoveBgBtn');
    const status = document.getElementById('mtBgStatus');
    btn.disabled = true;
    btn.textContent = '⏳ Processing…';

    _loadMediaPipe(async (seg) => {
      try {
        status.textContent = '🔍 Detecting person & segmenting…';

        // Draw source to an offscreen canvas
        const segmentationSource = _mtOrigImgBackup || mtOrigImg;
        const src = document.createElement('canvas');
        src.width = segmentationSource.naturalWidth;
        src.height = segmentationSource.naturalHeight;
        const sCtx = src.getContext('2d');
        sCtx.drawImage(segmentationSource, 0, 0);

        // Run segmentation — MediaPipe needs an HTMLImageElement or canvas
        await new Promise((resolve, reject) => {
          window._mpSegCallback = (results) => {
            window._mpSegCallback = null;
            try {
              // results.segmentationMask is a canvas with the mask
              status.textContent = '✨ Refining hair, clothing and edge detail…';
              _mtBgMask = createPrecisePersonCutout(src, results.segmentationMask);
              resolve();
            } catch(e) { reject(e); }
          };
          Promise.resolve(seg.send({image: src})).catch(reject);
        });

        // Backup original image
        if (!_mtOrigImgBackup) _mtOrigImgBackup = mtOrigImg;

        // Apply current fill colour and update mtOrigImg
        _applyBgFill(_mtBgColor);

        // Show UI
        document.getElementById('mtBgColorRow').style.display = 'block';
        document.getElementById('mtRestoreBgBtn').style.display = 'inline-flex';
        status.textContent = '✅ Background removed! Pick a fill colour below, or keep transparent.';
        btn.textContent = '✨ Re-run Removal';
      } catch(e) {
        status.textContent = '❌ Error: ' + e.message;
        console.error(e);
      } finally {
        btn.disabled = false;
      }
    });
  }

  async function mtRemoveBg() {
    if (!mtOrigImg) { toast('Upload an image first.', 'error'); return; }
    const btn = document.getElementById('mtRemoveBgBtn');
    const status = document.getElementById('mtBgStatus');
    btn.disabled = true;
    btn.textContent = 'Processing...';

    try {
      const baseImage = _mtBgRestoreSnapshot ? _mtBgRestoreSnapshot.img : mtOrigImg;
      const baseState = _mtBgRestoreSnapshot ? _mtBgRestoreSnapshot.state : mtState;
      const sourceCanvas = buildMtEditedSourceCanvas(baseImage, baseState);
      if (!sourceCanvas) throw new Error('Could not prepare the current image.');

      if (!_mtBgRestoreSnapshot) {
        _mtBgRestoreSnapshot = {
          img: mtOrigImg,
          state: cloneMtState(mtState),
          cropDisplayRect: mtCropDisplayRect ? {...mtCropDisplayRect} : null,
        };
      }

      const mode = document.getElementById('mtBgMode')?.value || _mtBgMode;
      if (mode === 'api') {
        status.textContent = 'Uploading the current edited image to remove.bg...';
        try {
          _mtBgMask = await removeBgWithApi(sourceCanvas);
        } catch (apiError) {
          console.warn(apiError);
          status.textContent = 'remove.bg API is unavailable or over limit. Switching to the built-in local remover...';
          _mtBgMask = await removeBgWithLocal(sourceCanvas, message => { status.textContent = message; });
        }
      } else {
        _mtBgMask = await removeBgWithLocal(sourceCanvas, message => { status.textContent = message; });
      }

      _mtBgColor = 'transparent';
      bakeBackgroundResult();
      _applyBgFill(_mtBgColor);

      document.getElementById('mtBgColorRow').style.display = 'block';
      document.getElementById('mtRestoreBgBtn').style.display = 'inline-flex';
      status.textContent = 'Background removed from the current edited image. Pick a fill colour below, or keep transparent.';
      btn.textContent = 'Re-run Removal';
    } catch(e) {
      status.textContent = 'Error: ' + e.message;
      console.error(e);
    } finally {
      btn.disabled = false;
    }
  }

  function _applyBgFill(color) {
    if (!_mtBgMask) return;
    const W = _mtBgMask.width, H = _mtBgMask.height;
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const ctx = out.getContext('2d');

    if (color !== 'transparent') {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, W, H);
    }

    // Draw the cut-out (person with alpha) on top
    if (_mtBgMask instanceof HTMLCanvasElement) {
      ctx.drawImage(_mtBgMask, 0, 0);
    } else {
      const tmp = document.createElement('canvas');
      tmp.width = W; tmp.height = H;
      tmp.getContext('2d').putImageData(_mtBgMask, 0, 0);
      ctx.drawImage(tmp, 0, 0);
    }

    // Replace mtOrigImg with result
    const dataUrl = out.toDataURL('image/png');
    const newImg = new Image();
    newImg.onload = () => {
      mtOrigImg = newImg;
      // Force PNG format so transparency is preserved when colour = transparent
      if (color === 'transparent') {
        document.getElementById('mtFmt').value = 'png';
        mtState.format = 'png';
      }
      document.getElementById('mtOrigDims').textContent = newImg.naturalWidth + 'x' + newImg.naturalHeight;
      renderMultiTool();
      setTimeout(bindMtCropEvents, 50);
    };
    newImg.src = dataUrl;
  }

  function mtFillBg(color, btn) {
    _mtBgColor = color;
    // Update active state on colour buttons
    document.querySelectorAll('.bg-fill-btn').forEach(b => b.style.border = '2px solid var(--border)');
    if (btn) btn.style.border = '2px solid var(--accent)';
    _applyBgFill(color);
  }

  function mtFillBgCustom(color) {
    _mtBgColor = color;
    document.querySelectorAll('.bg-fill-btn').forEach(b => b.style.border = '2px solid var(--border)');
    _applyBgFill(color);
  }

  function mtRestoreBg() {
    if (!_mtBgRestoreSnapshot) return;
    mtOrigImg = _mtBgRestoreSnapshot.img;
    mtState = cloneMtState(_mtBgRestoreSnapshot.state);
    mtCropDisplayRect = _mtBgRestoreSnapshot.cropDisplayRect ? {..._mtBgRestoreSnapshot.cropDisplayRect} : null;
    _mtBgRestoreSnapshot = null;
    _mtBgMask = null;
    _mtBgColor = 'transparent';
    document.getElementById('mtBgColorRow').style.display = 'none';
    document.getElementById('mtRestoreBgBtn').style.display = 'none';
    document.getElementById('mtBgStatus').textContent = '';
    document.getElementById('mtFmt').value = mtState.format;
    document.getElementById('mtQual').value = mtState.quality;
    document.getElementById('mtQualLabel').textContent = mtState.quality + '%';
    document.getElementById('mtMaxW').value = mtState.maxW;
    document.getElementById('mtMaxWLabel').textContent = mtState.maxW === 0 ? 'Original' : mtState.maxW + 'px';
    document.getElementById('mtOrigDims').textContent = (mtOrigImg.naturalWidth || mtOrigImg.width) + 'x' + (mtOrigImg.naturalHeight || mtOrigImg.height);
    renderMultiTool();
    setTimeout(bindMtCropEvents, 50);
    toast('Original image restored.');
  }
  /* ===== END BACKGROUND REMOVAL ===== */

  function clearMultiTool() {
    mtOrigFile=null;mtOrigImg=null;mtCropDisplayRect=null;
    _mtBgMask=null;_mtBgRestoreSnapshot=null;_mtBgColor='transparent';
    mtState={rotateDeg:0,flipH:false,flipV:false,cropRect:null,quality:85,format:'jpeg',maxW:0,hasCrop:false};
    document.getElementById('mtPlaceholder').style.display='flex';
    document.getElementById('mtDrop').style.display='flex';
    document.getElementById('mtEditor').style.display='none';
    document.getElementById('mtInput').value='';
    const cr=document.getElementById('mtBgColorRow'); if(cr) cr.style.display='none';
    const rb=document.getElementById('mtRestoreBgBtn'); if(rb) rb.style.display='none';
    const st=document.getElementById('mtBgStatus'); if(st) st.textContent='';
  }

  /* ---- WATERMARK (keep existing) ---- */
  let wmImg=null;
  function loadWmImg(file){
    if(!file||!file.type.startsWith('image/')){toast(Lang.t('toastSelectImgWm'),'error');return;}
    const r=new FileReader();
    r.onload=e=>{wmImg=new Image();wmImg.onload=()=>{
      document.getElementById('wmPlaceholder').style.display='none';
      document.getElementById('wmDrop').style.display='none';
      document.getElementById('wmEditor').style.display='block';
      updateWmPreview();
    };wmImg.src=e.target.result;};
    r.readAsDataURL(file);
  }
  function updateWmSizeLabel(){const v=document.getElementById('wmSize').value;document.getElementById('wmSizeLabel').textContent=v+'px';upSlider(document.getElementById('wmSize'));}
  function updateWmOpLabel(){const v=document.getElementById('wmOp').value;document.getElementById('wmOpLabel').textContent=v+'%';upSlider(document.getElementById('wmOp'));}
  function updateWmRotLabel(){const v=document.getElementById('wmRot').value;document.getElementById('wmRotLabel').textContent=v+' deg';upSlider(document.getElementById('wmRot'));}
  function updateWmPreview(){
    if(!wmImg)return;
    const text=document.getElementById('wmText').value||'WATERMARK';
    const pos=document.getElementById('wmPos').value;
    const size=parseInt(document.getElementById('wmSize').value);
    const op=parseInt(document.getElementById('wmOp').value)/100;
    const rot=parseInt(document.getElementById('wmRot').value)*Math.PI/180;
    const color=document.getElementById('wmColor').value;
    const c=document.createElement('canvas');
    c.width=wmImg.naturalWidth;c.height=wmImg.naturalHeight;
    const ctx=c.getContext('2d');
    ctx.drawImage(wmImg,0,0);
    ctx.globalAlpha=op;ctx.font=`bold ${size}px sans-serif`;ctx.fillStyle=color;
    ctx.textAlign='center';ctx.textBaseline='middle';
    const drawText=(x,y)=>{ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.fillText(text,0,0);ctx.restore();};
    const w=c.width,h=c.height;
    if(pos==='center') drawText(w/2,h/2);
    else if(pos==='tile'){const stepX=Math.max(200,ctx.measureText(text).width+size*2),stepY=size*3;for(let y=0;y<h+stepY;y+=stepY)for(let x=0;x<w+stepX;x+=stepX)drawText(x,y);}
    else{const pad=size;const pos2={topleft:[pad,pad],topright:[w-pad,pad],bottomleft:[pad,h-pad],bottomright:[w-pad,h-pad]};drawText(...pos2[pos]);}
    ctx.globalAlpha=1;
    document.getElementById('wmOutImg').src=c.toDataURL('image/jpeg',0.92);
  }
  async function downloadWatermarked(){
    const fmt=await showDownloadPicker(Lang.t('dlPickerTitle'));
    if(!fmt)return;
    const src=document.getElementById('wmOutImg').src;if(!src)return;
    if(fmt==='pdf'){
      if(!window.jspdf||!window.jspdf.jsPDF){toast(Lang.t('toastPdfLibNotLoaded'),'error');return;}
      const img=document.getElementById('wmOutImg');
      const mmW=img.naturalWidth*0.2646,mmH=img.naturalHeight*0.2646;
      const {jsPDF}=window.jspdf;
      const isPort=mmH>=mmW;
      const pdf=new jsPDF({orientation:isPort?'portrait':'landscape',unit:'mm',format:[Math.min(mmW,mmH),Math.max(mmW,mmH)],compress:true});
      pdf.addImage(src,'JPEG',0,0,pdf.internal.pageSize.getWidth(),pdf.internal.pageSize.getHeight(),undefined,'FAST');
      saveBlob(pdf.output('blob'),'watermarked.pdf');
    } else {
      const outMime=fmt==='png'?'image/png':'image/jpeg';
      const c=document.createElement('canvas');c.width=wmImg.naturalWidth;c.height=wmImg.naturalHeight;
      c.getContext('2d').drawImage(document.getElementById('wmOutImg'),0,0);
      const a=document.createElement('a');a.href=c.toDataURL(outMime,0.92);a.download='watermarked.'+(fmt==='png'?'png':'jpg');
      document.body.appendChild(a);a.click();a.remove();
    }
    toast('Downloaded!');
  }
  function clearWatermark(){
    wmImg=null;
    document.getElementById('wmPlaceholder').style.display='flex';
    document.getElementById('wmDrop').style.display='flex';
    document.getElementById('wmEditor').style.display='none';
    document.getElementById('wmInput').value='';
  }

  // Init after DOM loaded
  document.addEventListener('DOMContentLoaded', ()=>{
    setTimeout(()=>{
      const cv=document.getElementById('mtCropCanvas');
      if(cv) bindMtCropEvents();
    }, 500);
  });

  return {
    toast,fmtBytes,switchTab,dzDrag,dzLeave,dzDrop,
    loadMultiToolFile,mtRotate,mtSetRotation,mtFlip,mtApplyCrop,mtClearCrop,
    mtSetQuality,mtSetFormat,mtSetMaxW,mtReset,mtDownload,mtSendToApp,clearMultiTool,
    loadWmImg,updateWmSizeLabel,updateWmOpLabel,updateWmRotLabel,updateWmPreview,downloadWatermarked,clearWatermark,
    bindMtCropEvents,
    mtSizeChanged,mtSizeUnitChanged,mtApplySizePreset,mtClearSize,
    setA4Orient,setA4Corner,setA4ImgDir,a4CountDelta,a4Preview,downloadA4PDF,
    setA4PaperSize,setA4CustomDim,getA4PageDims,
    mtSetBrightness,
    mtRemoveBg,mtSetBgMode,mtFillBg,mtFillBgCustom,mtRestoreBg,
    // Bulk PDF Builder
    bpAddFiles,bpDzDrop,bpDelete,bpMove,bpSortByName,bpReverseOrder,bpClearAll,
    bpLbOpen,bpLbNav,bpLbMove,bpLbDelete,bpLbClose,
    bpDownloadPDF,
    loadCompressImg:(f)=>loadMultiToolFile(f),
    loadCropImg:(f)=>loadMultiToolFile(f),
    loadRotateImg:(f)=>loadMultiToolFile(f),
    loadConvertImg:(f)=>loadMultiToolFile(f),
  };
})();

/* ============================================================
   SERVICE WORKER
============================================================ */
if('serviceWorker'in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{});
  });
}

/* Shared automatic person cut-out service for the Multi-Person editor. */
const PersonBackground = (() => {
  let loadPromise = null;
  let queue = Promise.resolve();

  function load() {
    if (window._mpSegmenter) return Promise.resolve(window._mpSegmenter);
    if (loadPromise) return loadPromise;
    loadPromise = new Promise((resolve, reject) => {
      const start = () => {
        try {
          const segmenter = new SelfieSegmentation({locateFile: file =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1/${file}`
          });
          segmenter.setOptions({modelSelection:0});
          segmenter.onResults(results => {
            if (window._mpSegCallback) window._mpSegCallback(results);
          });
          segmenter.initialize().then(() => {
            window._mpSegmenter = segmenter;
            resolve(segmenter);
          }, reject);
        } catch (error) { reject(error); }
      };
      if (typeof SelfieSegmentation !== 'undefined') { start(); return; }
      let script = document.getElementById('mp-ss-script');
      if (!script) {
        script = document.createElement('script');
        script.id = 'mp-ss-script';
        script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1/selfie_segmentation.js';
        script.crossOrigin = 'anonymous';
        document.head.appendChild(script);
      }
      script.addEventListener('load', start, {once:true});
      script.addEventListener('error', () => reject(new Error('AI files could not be loaded. Check your internet connection.')), {once:true});
    }).catch(error => { loadPromise = null; throw error; });
    return loadPromise;
  }

  function removeNow(image, onStatus) {
    return load().then(segmenter => new Promise((resolve, reject) => {
      if (onStatus) onStatus('Detecting person and body…');
      const source = document.createElement('canvas');
      source.width = image.naturalWidth || image.width;
      source.height = image.naturalHeight || image.height;
      source.getContext('2d').drawImage(image, 0, 0, source.width, source.height);
      const timer = setTimeout(() => {
        window._mpSegCallback = null;
        reject(new Error('Person detection timed out. Please try again.'));
      }, 30000);
      window._mpSegCallback = results => {
        clearTimeout(timer);
        window._mpSegCallback = null;
        try {
          if (onStatus) onStatus('Refining hair, clothing and edge detail…');
          const cutout = createPrecisePersonCutout(source, results.segmentationMask);
          resolve(cutout);
        } catch (error) { reject(error); }
      };
      Promise.resolve(segmenter.send({image:source})).catch(error => {
        clearTimeout(timer);
        window._mpSegCallback = null;
        reject(error);
      });
    }));
  }

  function remove(image, onStatus) {
    const task = queue.then(() => removeNow(image, onStatus));
    queue = task.catch(() => {});
    return task;
  }

  function fill(cutout, color) {
    const canvas = document.createElement('canvas');
    canvas.width = cutout.width; canvas.height = cutout.height;
    const ctx = canvas.getContext('2d');
    if (color !== 'transparent') {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(cutout, 0, 0);
    return canvas;
  }
  return {remove, fill};
})();

/* ============================================================
   MULTI-PERSON A4 MODULE
   Up to 4 persons, each with own image + crop/rotate/flip/resize.
   All placed together on one A4 sheet.
============================================================ */
const mp = (() => {
  let personCount = 1;
  let orient = 'landscape';
  let mpPaperSize = '4x6';   // 'a4' | '4x6' | 'custom'
  let mpCustomPW = 210, mpCustomPH = 297;
  let mpImgDir = 'row';   // 'row' | 'col'
  let mpCorner = 'tl';    // 'tl' | 'tr' | 'bl' | 'br'
  let persons = []; // [{img, canvas, state, cropRect, cropDisplayRect, displayScale, dragging, startX, startY}]

  const MP_PAPER_SIZES = {'a4':[210,297],'4x6':[101.6,152.4],'custom':null};

  function getMpPageDims(){
    let bW, bH;
    if(mpPaperSize==='custom'){bW=mpCustomPW||210;bH=mpCustomPH||297;}
    else{const b=MP_PAPER_SIZES[mpPaperSize]||[210,297];bW=b[0];bH=b[1];}
    if(orient==='landscape') return {pW:Math.max(bW,bH),pH:Math.min(bW,bH)};
    return {pW:Math.min(bW,bH),pH:Math.max(bW,bH)};
  }

  function setMpPaperSize(sz){
    mpPaperSize=sz;
    const cr=document.getElementById('mpCustomSizeRow');
    if(cr) cr.style.display=(sz==='custom')?'flex':'none';
    ['a4','4x6','custom'].forEach(k=>{
      const el=document.getElementById('mpPaper_'+k);
      if(el) el.classList.toggle('active',k===sz);
    });
    refreshPreview();
  }

  function makePersonTransformedCanvas(image, state) {
    const deg = Number(state.rotateDeg || 0);
    const rad = deg * Math.PI / 180;
    const srcW = image.naturalWidth || image.width;
    const srcH = image.naturalHeight || image.height;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const outW = Math.max(1, Math.ceil(srcW * cos + srcH * sin));
    const outH = Math.max(1, Math.ceil(srcW * sin + srcH * cos));
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.translate(outW / 2, outH / 2);
    ctx.rotate(rad);
    ctx.scale(state.flipH ? -1 : 1, state.flipV ? -1 : 1);
    ctx.drawImage(image, -srcW / 2, -srcH / 2);
    ctx.restore();
    return canvas;
  }

  function syncRotationControl(pi) {
    const p = persons[pi];
    if (!p) return;
    const val = Math.round((Number(p.state.rotateDeg)||0) * 10) / 10;
    const input = document.getElementById('mpRotFine' + pi);
    const label = document.getElementById('mpRotFineLabel' + pi);
    if (input) input.value = val;
    if (label) label.textContent = val + ' deg';
  }

  function setMpCustomDim(){
    const wEl=document.getElementById('mpCustomPW'),hEl=document.getElementById('mpCustomPH');
    if(wEl) mpCustomPW=parseFloat(wEl.value)||210;
    if(hEl) mpCustomPH=parseFloat(hEl.value)||297;
    refreshPreview();
  }

  function setMpImgDir(d){
    mpImgDir=d;
    const rBtn=document.getElementById('mpDirRow');
    const cBtn=document.getElementById('mpDirCol');
    if(rBtn){ rBtn.classList.remove('active'); if(d==='row') rBtn.classList.add('active'); }
    if(cBtn){ cBtn.classList.remove('active'); if(d==='col') cBtn.classList.add('active'); }
    refreshPreview();
  }

  function setMpCorner(c){
    mpCorner=c;
    ['tl','tr','bl','br'].forEach(k=>{
      const el=document.getElementById('mpCorner_'+k);
      if(el) el.classList.toggle('active',k===c);
    });
    refreshPreview();
  }

  function init() {
    // Build persons array
    persons = Array.from({length:4}, () => ({
      img: null, originalImg: null, canvas: null, resultCanvas: null,
      bgCutout: null, bgColor: 'transparent', bgStatus: '', bgBusy: false, bgMode: 'local',
      state: freshState(),
      cropDisplayRect: null, displayScale: 1,
      dragging: false, startX: 0, startY: 0,
      count: 4 // photos of this person on A4
    }));
    setPersonCount(1);
  }

  function freshState() {
    return {rotateDeg:0, flipH:false, flipV:false, cropRect:null, quality:85,
            hasCrop:false, sizeWmm:25, sizeHmm:30, photoCount:4, brightness:0};
  }

  function setPersonCount(n) {
    personCount = n;
    [1,2,3,4].forEach(i => {
      const btn = document.getElementById('mpCount'+i);
      if(btn) btn.classList.toggle('active', i===n);
    });
    renderPersonCards();
    refreshPreview();
  }

  function setOrient(o) {
    orient = o;
    document.getElementById('mpOrientPortrait').classList.toggle('active', o==='portrait');
    document.getElementById('mpOrientLandscape').classList.toggle('active', o==='landscape');
    refreshPreview();
  }

  function renderPersonCards() {
    const container = document.getElementById('mpPersonsContainer');
    if (!container) return;
    // Determine grid layout
    const cols = personCount <= 1 ? 1 : 2;
    container.style.gridTemplateColumns = cols > 1 ? '1fr 1fr' : '1fr';
    container.innerHTML = '';

    for (let pi = 0; pi < personCount; pi++) {
      const p = persons[pi];
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cssText = 'padding:18px;position:relative';
      card.innerHTML = `
        <div style="font-weight:700;font-size:13px;margin-bottom:12px;color:var(--accent)">
          👤 Person ${pi+1}
        </div>
        ${p.img ? `
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;justify-content:center">
            <button class="btn-secondary" style="font-size:11px;padding:5px 10px" onclick="mp.rotate(${pi},-90)">↺ 90°L</button>
            <button class="btn-secondary" style="font-size:11px;padding:5px 10px" onclick="mp.rotate(${pi},90)">↻ 90°R</button>
            <input type="number" id="mpRotFine${pi}" value="${Math.round((p.state.rotateDeg||0)*10)/10}" step="0.5" min="-45" max="45" style="width:62px;padding:5px 7px;border:1.5px solid var(--border);border-radius:7px;font-size:11px" oninput="mp.setRotation(${pi},this.value)">
            <span id="mpRotFineLabel${pi}" style="font-size:11px;color:var(--text-muted);min-width:40px">${Math.round((p.state.rotateDeg||0)*10)/10} deg</span>
            <button class="btn-ghost"     style="font-size:11px;padding:5px 10px;color:var(--danger)" onclick="mp.clearPerson(${pi})">✕ Clear</button>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;text-align:center">Step 1: Drag on image to crop</div>
          <canvas id="mpCropCanvas${pi}" style="display:block;margin:0 auto;max-width:100%;border-radius:8px;cursor:crosshair;border:1.5px solid var(--border)"></canvas>
          <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;justify-content:center">
            <button class="btn-secondary" style="font-size:11px;padding:5px 10px" onclick="mp.applyCrop(${pi})">✂ Apply Crop</button>
            <button class="btn-ghost"     style="font-size:11px;padding:5px 10px" onclick="mp.clearCrop(${pi})">Clear Crop</button>
          </div>
          <div class="mp-bg-tools">
            <div class="mp-bg-heading"><span>Step 2: ✂️ Remove Background (Optional)</span><span class="passport-optional-badge">Optional</span></div>
            <div class="mp-bg-method">
              <label class="ctrl-label" for="mpBgMode${pi}">Removal Method</label>
              <select class="ctrl-select" id="mpBgMode${pi}" ${p.bgBusy?'disabled':''} onchange="mp.setBgMode(${pi},this.value)">
                <option value="local" ${p.bgMode!=='api'?'selected':''}>Built-in local AI</option>
                <option value="api" ${p.bgMode==='api'?'selected':''}>remove.bg API</option>
              </select>
            </div>
            <div class="mp-bg-actions">
              <button class="btn-primary mp-remove-bg" ${p.bgBusy?'disabled':''} onclick="mp.removeBg(${pi})">${p.bgBusy?'⏳ Working…':'✨ Remove BG'}</button>
              ${p.originalImg ? `<button class="btn-ghost mp-restore-bg" onclick="mp.restoreBg(${pi})">↩ Restore</button>` : ''}
            </div>
            <div class="mp-bg-status ${p.bgStatus.startsWith('Error:')?'error':''}" id="mpBgStatus${pi}">${p.bgStatus}</div>
            ${p.bgCutout ? `<div class="mp-bg-palette" aria-label="Background colour">
              <button class="mp-bg-swatch checker ${p.bgColor==='transparent'?'active':''}" title="Transparent" onclick="mp.fillBg(${pi},'transparent')"></button>
              <button class="mp-bg-swatch ${p.bgColor==='#ffffff'?'active':''}" style="--swatch:#ffffff" title="White" onclick="mp.fillBg(${pi},'#ffffff')"></button>
              <button class="mp-bg-swatch ${p.bgColor==='#87CEEB'?'active':''}" style="--swatch:#87CEEB" title="Sky blue" onclick="mp.fillBg(${pi},'#87CEEB')"></button>
              <button class="mp-bg-swatch ${p.bgColor==='#b0d4f1'?'active':''}" style="--swatch:#b0d4f1" title="Light blue" onclick="mp.fillBg(${pi},'#b0d4f1')"></button>
              <button class="mp-bg-swatch ${p.bgColor==='#eeeeee'?'active':''}" style="--swatch:#eeeeee" title="Light grey" onclick="mp.fillBg(${pi},'#eeeeee')"></button>
              <label class="mp-bg-custom" title="Custom colour">🎨<input type="color" value="${p.bgColor==='transparent'?'#4a90d9':p.bgColor}" oninput="mp.fillBg(${pi},this.value)"></label>
            </div>` : ''}
          </div>
          <div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span style="font-size:11.5px;color:var(--text-muted);font-weight:700">Step 3 — Size:</span>
            <button class="btn-secondary size-preset-btn" onclick="mp.setSize(${pi},2.5,3,'cm')">2.5×3cm</button>
            <button class="btn-secondary size-preset-btn" onclick="mp.setSize(${pi},50.8,50.8,'mm')">2×2in</button>
            <input type="number" id="mpW${pi}" value="${(p.state.sizeWmm/10).toFixed(1)}" step="0.1" min="0.5" max="10" style="width:54px;padding:4px 6px;border:1.5px solid var(--border);border-radius:7px;font-size:12px" oninput="mp.setSizeRaw(${pi})">
            <span style="font-size:11px">×</span>
            <input type="number" id="mpH${pi}" value="${(p.state.sizeHmm/10).toFixed(1)}" step="0.1" min="0.5" max="12" style="width:54px;padding:4px 6px;border:1.5px solid var(--border);border-radius:7px;font-size:12px" oninput="mp.setSizeRaw(${pi})">
            <span style="font-size:11px;color:var(--text-muted)">cm</span>
          </div>
          <div style="margin-top:8px;display:flex;gap:6px;align-items:center">
            <span style="font-size:11.5px;color:var(--text-muted)">Photos on A4:</span>
            <button class="a4-count-btn" style="width:28px;height:28px;font-size:13px" onclick="mp.deltaCount(${pi},-1)">−</button>
            <span id="mpPhCount${pi}" style="font-weight:700;color:var(--accent);min-width:20px;text-align:center">${p.state.photoCount}</span>
            <button class="a4-count-btn" style="width:28px;height:28px;font-size:13px" onclick="mp.deltaCount(${pi},1)">+</button>
          </div>
          <div style="margin-top:10px">
            <div style="font-size:11.5px;color:var(--text-muted);margin-bottom:4px">☀️ Photo Enhancement</div>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="range" id="mpBrightness${pi}" min="-100" max="100" value="${p.state.brightness||0}" step="1"
                oninput="mp.mpSetBrightness(${pi},this.value)"
                style="flex:1;accent-color:var(--accent)">
              <span id="mpBrightnessLabel${pi}" style="font-size:11px;font-weight:600;min-width:28px;color:var(--accent)">${(p.state.brightness||0)>=0?'+'+( p.state.brightness||0):(p.state.brightness||0)}</span>
            </div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px">Darken ← 0 = Original → Enhance</div>
          </div>
          <div style="margin-top:8px">
            <img id="mpPreview${pi}" alt="Person ${pi+1} preview" style="max-width:100%;max-height:120px;border-radius:6px;border:1px solid var(--border);object-fit:contain">
          </div>
        ` : `
          <div class="drop-zone sdt-drop" style="min-height:140px" onclick="document.getElementById('mpFileInput${pi}').click()"
               ondragover="event.preventDefault()" ondrop="mp.onDrop(event,${pi})">
            <input type="file" id="mpFileInput${pi}" accept="image/*" style="display:none" onchange="mp.loadFile(${pi},this.files[0])">
            <div class="sdt-placeholder">
              <div class="drop-icon" style="font-size:28px">📷</div>
              <div class="drop-label" style="font-size:13px">Click or drag photo here</div>
              <div class="drop-hint">Person ${pi+1}</div>
            </div>
          </div>
        `}
      `;
      container.appendChild(card);

      if (p.img) {
        setTimeout(() => {
          renderPersonCanvas(pi);
          bindCropEvents(pi);
        }, 30);
      }
    }
  }

  function onDrop(event, pi) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) loadFile(pi, file);
  }

  function loadFile(pi, file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        persons[pi].img = img;
        persons[pi].originalImg = null;
        persons[pi].bgCutout = null;
        persons[pi].bgColor = 'transparent';
        persons[pi].bgStatus = '';
        persons[pi].bgBusy = false;
        persons[pi].bgMode = 'local';
        persons[pi].state = freshState();
        persons[pi].cropDisplayRect = null;
        renderPersonCards();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function clearPerson(pi) {
    persons[pi].img = null;
    persons[pi].originalImg = null;
    persons[pi].bgCutout = null;
    persons[pi].bgColor = 'transparent';
    persons[pi].bgStatus = '';
    persons[pi].bgBusy = false;
    persons[pi].bgMode = 'local';
    persons[pi].resultCanvas = null;
    persons[pi].state = freshState();
    persons[pi].cropDisplayRect = null;
    renderPersonCards();
    refreshPreview();
  }

  function canvasToImage(canvas) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not prepare the edited photo.'));
      image.src = canvas.toDataURL('image/png');
    });
  }

  function imageToCanvas(image) {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function setBgStatus(pi, message) {
    const p = persons[pi];
    if (!p) return;
    p.bgStatus = message;
    const status = document.getElementById('mpBgStatus' + pi);
    if (status) {
      status.textContent = message;
      status.classList.toggle('error', message.startsWith('Error:'));
    }
  }

  function setBgMode(pi, mode) {
    const p = persons[pi];
    if (!p || p.bgBusy) return;
    p.bgMode = mode === 'api' ? 'api' : 'local';
    setBgStatus(pi, p.bgMode === 'api'
      ? 'remove.bg API selected. If it is unavailable, the built-in local remover will run.'
      : 'Built-in local remover selected.');
  }

  async function removeBg(pi) {
    const p = persons[pi];
    if (!p || !p.img || p.bgBusy) return;
    p.bgBusy = true;
    p.bgStatus = p.bgMode === 'api' ? 'Uploading this photo to remove.bg...' : 'Loading the AI person detector…';
    renderPersonCards();
    try {
      // Use the cropped/rotated result canvas so BG removal applies to the edited image
      const sourceCanvas = p.resultCanvas || imageToCanvas(p.img);
      let cutout;
      if (p.bgMode === 'api') {
        try {
          cutout = await removeBgWithApi(sourceCanvas);
        } catch (apiError) {
          console.warn(apiError);
          setBgStatus(pi, 'remove.bg API is unavailable or over limit. Switching to the built-in local remover...');
          cutout = await PersonBackground.remove(sourceCanvas, message => setBgStatus(pi, message));
        }
      } else {
        cutout = await PersonBackground.remove(sourceCanvas, message => setBgStatus(pi, message));
      }
      // Backup original image + state for restore
      if (!p.originalImg) {
        p.originalImg = p.img;
        p._preRemoveBgState = { cropRect: p.state.cropRect ? {...p.state.cropRect} : null, hasCrop: p.state.hasCrop,
          rotateDeg: p.state.rotateDeg, flipH: p.state.flipH, flipV: p.state.flipV };
      }
      p.bgCutout = cutout;
      p.bgColor = 'transparent';
      // Load cutout as the new base image, clear crop/rotate so result canvas is correct
      const cutoutImg = await canvasToImage(PersonBackground.fill(cutout, p.bgColor));
      p.img = cutoutImg;
      p.state.cropRect = null; p.state.hasCrop = false;
      p.state.rotateDeg = 0; p.state.flipH = false; p.state.flipV = false;
      p.cropDisplayRect = null;
      p.bgStatus = 'Background removed from cropped image. Choose transparent or a solid colour.';
      toast(`Person ${pi + 1}: background removed.`);
    } catch (error) {
      p.bgStatus = 'Error: ' + error.message;
      toast(error.message, 'error');
    } finally {
      p.bgBusy = false;
      renderPersonCards();
      refreshPreview();
    }
  }

  async function fillBg(pi, color) {
    const p = persons[pi];
    if (!p || !p.bgCutout) return;
    p.bgColor = color;
    p.img = await canvasToImage(PersonBackground.fill(p.bgCutout, color));
    p.bgStatus = color === 'transparent' ? 'Transparent background selected.' : `Solid background ${color} selected.`;
    renderPersonCards();
    refreshPreview();
  }

  function restoreBg(pi) {
    const p = persons[pi];
    if (!p || !p.originalImg) return;
    p.img = p.originalImg;
    p.originalImg = null;
    p.bgCutout = null;
    p.bgColor = 'transparent';
    p.bgStatus = '';
    p.cropDisplayRect = null;
    p.state.cropRect = null;
    p.state.hasCrop = false;
    renderPersonCards();
    refreshPreview();
    toast(`Person ${pi + 1}: original background restored.`);
  }

  function rotate(pi, deg) {
    persons[pi].state.rotateDeg += deg;
    persons[pi].cropDisplayRect = null;
    persons[pi].state.cropRect = null;
    persons[pi].state.hasCrop = false;
    syncRotationControl(pi);
    renderPersonCanvas(pi);
    setTimeout(() => bindCropEvents(pi), 30);
  }

  function setRotation(pi, deg) {
    persons[pi].state.rotateDeg = Number(deg) || 0;
    persons[pi].cropDisplayRect = null;
    persons[pi].state.cropRect = null;
    persons[pi].state.hasCrop = false;
    syncRotationControl(pi);
    renderPersonCanvas(pi);
    setTimeout(() => bindCropEvents(pi), 30);
  }

  function flip(pi, dir) {
    if (dir === 'h') persons[pi].state.flipH = !persons[pi].state.flipH;
    else persons[pi].state.flipV = !persons[pi].state.flipV;
    renderPersonCanvas(pi);
    setTimeout(() => bindCropEvents(pi), 30);
  }

  function applyCrop(pi) { renderPersonCanvas(pi); }

  function clearCrop(pi) {
    persons[pi].state.cropRect = null;
    persons[pi].state.hasCrop = false;
    persons[pi].cropDisplayRect = null;
    renderPersonCanvas(pi);
    setTimeout(() => bindCropEvents(pi), 30);
  }

  function setSize(pi, w, h, unit) {
    const toMM = (v, u) => u==='mm'?v : u==='cm'?v*10 : u==='in'?v*25.4 : v*0.264583;
    persons[pi].state.sizeWmm = toMM(w, unit);
    persons[pi].state.sizeHmm = toMM(h, unit);
    const wEl = document.getElementById('mpW'+pi);
    const hEl = document.getElementById('mpH'+pi);
    if (wEl) wEl.value = (persons[pi].state.sizeWmm / 10).toFixed(1);
    if (hEl) hEl.value = (persons[pi].state.sizeHmm / 10).toFixed(1);
    refreshPreview();
  }

  function setSizeRaw(pi) {
    const w = parseFloat(document.getElementById('mpW'+pi)?.value);
    const h = parseFloat(document.getElementById('mpH'+pi)?.value);
    if (!isNaN(w) && w > 0) persons[pi].state.sizeWmm = w * 10;
    if (!isNaN(h) && h > 0) persons[pi].state.sizeHmm = h * 10;
    refreshPreview();
  }

  function deltaCount(pi, d) {
    persons[pi].state.photoCount = Math.max(1, Math.min(20, persons[pi].state.photoCount + d));
    const el = document.getElementById('mpPhCount'+pi);
    if (el) el.textContent = persons[pi].state.photoCount;
    refreshPreview();
  }

  function mpApplyBrightness(ctx, w, h, level) {
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const bAdj = level * 1.5;
    const contrast = 1 + level * 0.008;
    const saturation = 1 + Math.max(0, level) * 0.012;
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i], g = data[i+1], b = data[i+2];
      r = (r-128)*contrast+128; g = (g-128)*contrast+128; b = (b-128)*contrast+128;
      r += bAdj; g += bAdj; b += bAdj;
      if (level > 0) {
        const lum = 0.299*r + 0.587*g + 0.114*b;
        r = lum+(r-lum)*saturation; g = lum+(g-lum)*saturation; b = lum+(b-lum)*saturation;
      }
      data[i]=Math.max(0,Math.min(255,Math.round(r)));
      data[i+1]=Math.max(0,Math.min(255,Math.round(g)));
      data[i+2]=Math.max(0,Math.min(255,Math.round(b)));
    }
    ctx.putImageData(imgData, 0, 0);
  }

  function mpSetBrightness(pi, val) {
    const p = persons[pi];
    if (!p) return;
    p.state.brightness = parseInt(val);
    const lbl = document.getElementById('mpBrightnessLabel'+pi);
    if (lbl) lbl.textContent = (val >= 0 ? '+' : '') + val;
    renderPersonCanvas(pi);
  }

  function renderPersonCanvas(pi) {
    const p = persons[pi];
    if (!p.img) return;
    const rotC = makePersonTransformedCanvas(p.img, p.state);

    // Crop
    let cropSrc = rotC;
    if (p.state.hasCrop && p.state.cropRect) {
      const cr = p.state.cropRect;
      const cOut = document.createElement('canvas');
      cOut.width = Math.max(1, cr.w); cOut.height = Math.max(1, cr.h);
      cOut.getContext('2d').drawImage(rotC, cr.x, cr.y, cr.w, cr.h, 0, 0, cr.w, cr.h);
      cropSrc = cOut;
    }

    // Apply brightness enhancement if set
    if (p.state.brightness && p.state.brightness !== 0) {
      const bC = document.createElement('canvas');
      bC.width = cropSrc.width; bC.height = cropSrc.height;
      const bCtx = bC.getContext('2d');
      bCtx.drawImage(cropSrc, 0, 0);
      mpApplyBrightness(bCtx, bC.width, bC.height, p.state.brightness);
      cropSrc = bC;
    }
    p.resultCanvas = cropSrc;

    // Draw display canvas
    const cv = document.getElementById('mpCropCanvas'+pi);
    if (!cv) return;
    const maxW = Math.min(cv.parentElement?.offsetWidth || 400, 460);
    const scale = maxW / cropSrc.width;
    p.displayScale = scale;
    cv.width = Math.round(cropSrc.width * scale);
    cv.height = Math.round(cropSrc.height * scale);
    cv.style.width = cv.width + 'px'; cv.style.height = cv.height + 'px';
    const ctx = cv.getContext('2d');
    ctx.drawImage(cropSrc, 0, 0, cv.width, cv.height);

    // Draw crop overlay
    if (p.cropDisplayRect) {
      const {x,y,w,h} = p.cropDisplayRect;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0,0,cv.width,y); ctx.fillRect(0,y+h,cv.width,cv.height);
      ctx.fillRect(0,y,x,h); ctx.fillRect(x+w,y,cv.width-x-w,h);
      ctx.strokeStyle='rgba(249,107,63,1)'; ctx.lineWidth=2; ctx.setLineDash([5,4]);
      ctx.strokeRect(x+0.5,y+0.5,w-1,h-1); ctx.setLineDash([]);
    }

    // Update preview img
    const prevEl = document.getElementById('mpPreview'+pi);
    if (prevEl) prevEl.src = cropSrc.toDataURL(p.bgCutout && p.bgColor === 'transparent' ? 'image/png' : 'image/jpeg', 0.85);

    refreshPreview();
  }

  function bindCropEvents(pi) {
    const cv = document.getElementById('mpCropCanvas'+pi);
    if (!cv) return;
    const p = persons[pi];

    function getPos(clientX, clientY) {
      const rect = cv.getBoundingClientRect();
      const scaleX = cv.width / rect.width, scaleY = cv.height / rect.height;
      const x = (clientX-rect.left)*scaleX;
      const y = (clientY-rect.top)*scaleY;
      return {x:Math.max(0,Math.min(cv.width,x)), y:Math.max(0,Math.min(cv.height,y))};
    }

    cv.onmousedown = e => {
      e.preventDefault();
      const pos = getPos(e.clientX, e.clientY);
      p.dragging = true; p.startX = pos.x; p.startY = pos.y;
      p.cropDisplayRect = null;
    };
    cv.onmousemove = e => {
      if (!p.dragging) return;
      const pos = getPos(e.clientX, e.clientY);
      p.cropDisplayRect = {
        x: Math.min(p.startX, pos.x), y: Math.min(p.startY, pos.y),
        w: Math.abs(pos.x - p.startX), h: Math.abs(pos.y - p.startY)
      };
      renderPersonCanvas(pi);
    };
    cv.onmouseup = e => {
      if (!p.dragging) return; p.dragging = false;
      if (p.cropDisplayRect && p.cropDisplayRect.w > 4 && p.cropDisplayRect.h > 4) {
        p.state.cropRect = {
          x: Math.round(p.cropDisplayRect.x / p.displayScale),
          y: Math.round(p.cropDisplayRect.y / p.displayScale),
          w: Math.round(p.cropDisplayRect.w / p.displayScale),
          h: Math.round(p.cropDisplayRect.h / p.displayScale),
        };
        p.state.hasCrop = true;
      }
    };
    cv.onmouseleave = () => { p.dragging = false; };

    cv.ontouchstart = e => {
      e.preventDefault();
      const t = e.touches[0], pos = getPos(t.clientX, t.clientY);
      p.dragging = true; p.startX = pos.x; p.startY = pos.y;
      p.cropDisplayRect = null;
    };
    cv.ontouchmove = e => {
      e.preventDefault();
      if (!p.dragging) return;
      const t = e.touches[0], pos = getPos(t.clientX, t.clientY);
      p.cropDisplayRect = {
        x: Math.min(p.startX, pos.x), y: Math.min(p.startY, pos.y),
        w: Math.abs(pos.x - p.startX), h: Math.abs(pos.y - p.startY)
      };
      renderPersonCanvas(pi);
    };
    cv.ontouchend = () => {
      if (!p.dragging) return; p.dragging = false;
      if (p.cropDisplayRect && p.cropDisplayRect.w > 4 && p.cropDisplayRect.h > 4) {
        p.state.cropRect = {
          x: Math.round(p.cropDisplayRect.x / p.displayScale),
          y: Math.round(p.cropDisplayRect.y / p.displayScale),
          w: Math.round(p.cropDisplayRect.w / p.displayScale),
          h: Math.round(p.cropDisplayRect.h / p.displayScale),
        };
        p.state.hasCrop = true;
      }
    };
  }

  /* ---- A4 combined preview ---- */
  function refreshPreview() {
    const cv = document.getElementById('mpA4Canvas');
    if (!cv) return;
    const marginMM = parseFloat(document.getElementById('mpMargin')?.value) || 3;
    const gapMM    = parseFloat(document.getElementById('mpGap')?.value) || 2;
    const {pW, pH} = getMpPageDims();
    const PX = 2.2;
    const cW = Math.round(pW * PX), cH = Math.round(pH * PX);
    cv.width = cW; cv.height = cH;
    cv.style.maxWidth = Math.min(cW, 360) + 'px';
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,cW,cH);

    const areaW = pW - marginMM * 2;
    const areaH = pH - marginMM * 2;

    const activePeople = persons.slice(0, personCount).filter(p => p.resultCanvas);
    const placements = computeContinuousPlacements(activePeople, areaW, areaH, gapMM);
    const placedByPerson = new Map();

    for (const item of placements) {
      const px = Math.round((marginMM + item.x)*PX), py = Math.round((marginMM + item.y)*PX);
      const pw2 = Math.round(item.w*PX), ph2 = Math.round(item.h*PX);
      ctx.drawImage(item.person.resultCanvas, px, py, pw2, ph2);
      ctx.strokeStyle='rgba(160,160,185,0.55)'; ctx.lineWidth=0.6;
      ctx.strokeRect(px+0.5, py+0.5, pw2-1, ph2-1);
      placedByPerson.set(item.person, (placedByPerson.get(item.person) || 0) + 1);
    }

    // Page border + margin guide
    ctx.strokeStyle='rgba(108,99,255,0.4)'; ctx.lineWidth=1.5;
    ctx.strokeRect(0.5,0.5,cW-1,cH-1);
    const mPx = Math.round(marginMM*PX);
    ctx.strokeStyle='rgba(108,99,255,0.15)'; ctx.lineWidth=0.7; ctx.setLineDash([4,4]);
    ctx.strokeRect(mPx,mPx,cW-mPx*2,cH-mPx*2); ctx.setLineDash([]);

    const infoEl = document.getElementById('mpA4Info');
    if (!activePeople.length) {
      if (infoEl) infoEl.textContent = 'Upload photos for persons above to see preview.';
    } else {
      const labels = activePeople.map((p) => {
        const si = persons.indexOf(p);
        const placed = placedByPerson.get(p) || 0;
        return `P${si+1}: ${placed} photo${placed!==1?'s':''} @ ${((p.state.sizeWmm||25)/10).toFixed(1)}×${((p.state.sizeHmm||30)/10).toFixed(1)}cm`;
      });
      if (infoEl) infoEl.textContent = labels.join(' · ');
    }
  }

  /* Fill the sheet like a normal passport-photo layout.
     Supports row-by-row and column-by-column directions. */
  function computeContinuousPlacements(activePeople, areaW, areaH, gapMM) {
    if (mpImgDir === 'col') {
      return computeContinuousPlacementsCol(activePeople, areaW, areaH, gapMM);
    }
    // Row-by-row (default)
    const placements = [];
    let x = 0, y = 0, rowH = 0;
    outer: for (const person of activePeople) {
      const w = person.state.sizeWmm || 25;
      const h = person.state.sizeHmm || 30;
      const count = person.state.photoCount || 4;
      for (let i = 0; i < count; i++) {
        if (x > 0 && x + w > areaW + 0.01) {
          x = 0;
          y += rowH + gapMM;
          rowH = 0;
        }
        if (y + h > areaH + 0.01) break outer;
        placements.push({ person, x, y, w, h });
        x += w + gapMM;
        rowH = Math.max(rowH, h);
      }
    }
    return placements;
  }

  function computeContinuousPlacementsCol(activePeople, areaW, areaH, gapMM) {
    const placements = [];
    let x = 0, y = 0, colW = 0;
    outer: for (const person of activePeople) {
      const w = person.state.sizeWmm || 25;
      const h = person.state.sizeHmm || 30;
      const count = person.state.photoCount || 4;
      for (let i = 0; i < count; i++) {
        if (y > 0 && y + h > areaH + 0.01) {
          y = 0;
          x += colW + gapMM;
          colW = 0;
        }
        if (x + w > areaW + 0.01) break outer;
        placements.push({ person, x, y, w, h });
        y += h + gapMM;
        colW = Math.max(colW, w);
      }
    }
    return placements;
  }

  /* Place photos at their EXACT mm size. Find best cols/rows so they all fit.
     Returns {cols, rows, fitsInSection} */
  function computeExactGrid(secW, secH, imgWmm, imgHmm, gapMM, count) {
    let bestCols = 1, bestRows = 1, bestFits = 0;
    for (let cols = 1; cols <= count; cols++) {
      const rows = Math.ceil(count / cols);
      // Total space needed at exact size
      const neededW = cols * imgWmm + Math.max(0, cols-1) * gapMM;
      const neededH = rows * imgHmm + Math.max(0, rows-1) * gapMM;
      if (neededW <= secW + 0.01 && neededH <= secH + 0.01) {
        const fits = cols * rows;
        if (fits > bestFits) { bestFits = fits; bestCols = cols; bestRows = rows; }
      }
    }
    // If not even 1 fits at exact size, force 1 column and scale to fit
    if (bestFits === 0) { bestCols = 1; bestRows = 1; bestFits = 1; }
    return { cols: bestCols, rows: bestRows, fitsInSection: bestFits };
  }

  /* ---- Download ---- */
  async function downloadPDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) { toast('PDF library not loaded.', 'error'); return; }
    const activePeople = persons.slice(0, personCount);
    if (!activePeople.some(p => p.resultCanvas)) { toast('Upload at least one person\'s photo.', 'error'); return; }

    const {jsPDF} = window.jspdf;
    const marginMM = parseFloat(document.getElementById('mpMargin')?.value) || 3;
    const gapMM    = parseFloat(document.getElementById('mpGap')?.value) || 2;
    const {pW, pH} = getMpPageDims();
    const paperFmt = mpPaperSize==='a4' ? 'a4' : [Math.min(pW,pH), Math.max(pW,pH)];
    const pdf = new jsPDF({orientation:orient, unit:'mm', format:paperFmt, compress:true});

    const areaW = pW - marginMM * 2;
    const areaH = pH - marginMM * 2;
    const placements = computeContinuousPlacements(activePeople.filter(p => p.resultCanvas), areaW, areaH, gapMM);
    const imageCache = new Map();
    for (const item of placements) {
      if (!imageCache.has(item.person)) {
        const flattened = document.createElement('canvas');
        flattened.width = item.person.resultCanvas.width;
        flattened.height = item.person.resultCanvas.height;
        const flattenedCtx = flattened.getContext('2d');
        flattenedCtx.fillStyle = '#ffffff';
        flattenedCtx.fillRect(0, 0, flattened.width, flattened.height);
        flattenedCtx.drawImage(item.person.resultCanvas, 0, 0);
        imageCache.set(item.person, flattened.toDataURL('image/jpeg', 0.92));
      }
      pdf.addImage(imageCache.get(item.person), 'JPEG', marginMM + item.x, marginMM + item.y, item.w, item.h, undefined, 'FAST');
    }

    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='multiperson_a4.pdf';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 5000);
    toast('Multi-person A4 PDF downloaded!');
  }

  document.addEventListener('DOMContentLoaded', init);

  return {setPersonCount, setOrient, loadFile, onDrop, rotate, setRotation, flip, applyCrop, clearCrop,
          setSize, setSizeRaw, deltaCount, clearPerson, setBgMode, removeBg, fillBg, restoreBg,
          refreshPreview, downloadPDF,
          setMpPaperSize, setMpCustomDim, setMpImgDir, setMpCorner, mpSetBrightness};
})();

/* ============================================================
   INIT — show the local password lock before opening the app.
============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  Lock.init();
  addDocument(false);   // two-sided
  addDocument(false);   // two-sided
});
