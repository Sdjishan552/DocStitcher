/* ============================================================
   Document Stitcher - Pure Vanilla JS  v7.0
   Features:
   1. Multi-tool image editor (crop+rotate+flip+compress+convert at once)
   2. PDF input support with auto-detect + output options (pdf/jpg/png)
   3. Signature keyboard joystick placement (arrow keys)
   4. One-sided document cards with signature option
   5. Download format chooser (PDF/PNG/JPG) for every download
============================================================ */

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
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
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
      const dataUrl = off.toDataURL(mime, 0.95);
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
        const dataUrl=off.toDataURL(mime,0.95);
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
  };
  let mtCropDragging=false, mtCropStartX=0, mtCropStartY=0;
  let mtDisplayScale=1, mtCropDisplayRect=null;
  let mtResultCanvas = document.createElement('canvas');

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

  function initMultiTool(img, file) {
    mtOrigFile=file; mtOrigImg=img;
    mtState={rotateDeg:0,flipH:false,flipV:false,cropRect:null,quality:85,format:'jpeg',maxW:0,hasCrop:false};
    document.getElementById('mtPlaceholder').style.display='none';
    document.getElementById('mtDrop').style.display='none';
    document.getElementById('mtEditor').style.display='block';
    document.getElementById('mtOrigSize').textContent=fmtBytes(file.size);
    document.getElementById('mtOrigDims').textContent=img.naturalWidth+'×'+img.naturalHeight;
    renderMultiTool();
  }

  function renderMultiTool() {
    // Apply rotate then crop to get current working image
    const deg=((mtState.rotateDeg%360)+360)%360;
    const swap=deg===90||deg===270;
    const srcW=mtOrigImg.naturalWidth, srcH=mtOrigImg.naturalHeight;
    const rW=swap?srcH:srcW, rH=swap?srcW:srcH;

    // Step 1: Rotate
    const rotC=document.createElement('canvas'); rotC.width=rW; rotC.height=rH;
    const rotCtx=rotC.getContext('2d');
    rotCtx.save(); rotCtx.translate(rW/2,rH/2); rotCtx.rotate(deg*Math.PI/180);
    rotCtx.scale(mtState.flipH?-1:1, mtState.flipV?-1:1);
    rotCtx.drawImage(mtOrigImg,-srcW/2,-srcH/2); rotCtx.restore();

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
    const maxW=Math.max(wrap.offsetWidth||680, 480);
    // Always fill the wrap width so image appears big
    mtDisplayScale=maxW/rotated.width;
    // Cap to avoid absurdly huge display but allow up to 2x
    if(mtDisplayScale>2) mtDisplayScale=2;
    const dW=Math.round(rotated.width*mtDisplayScale);
    const dH=Math.round(rotated.height*mtDisplayScale);
    const cv=document.getElementById('mtCropCanvas');
    cv.width=dW; cv.height=dH;
    cv.style.width=dW+'px'; cv.style.height=dH+'px';
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
      const deg=((mtState.rotateDeg%360)+360)%360, swap=deg===90||deg===270;
      const srcW=mtOrigImg.naturalWidth, srcH=mtOrigImg.naturalHeight;
      const rW=swap?srcH:srcW, rH=swap?srcW:srcH;
      const rotC=document.createElement('canvas'); rotC.width=rW; rotC.height=rH;
      const rCtx=rotC.getContext('2d');
      rCtx.save(); rCtx.translate(rW/2,rH/2); rCtx.rotate(deg*Math.PI/180);
      rCtx.scale(mtState.flipH?-1:1, mtState.flipV?-1:1);
      rCtx.drawImage(mtOrigImg,-srcW/2,-srcH/2); rCtx.restore();
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
      const pos = getCropCanvasPos(e.clientX, e.clientY);
      mtCropDragging=true;
      mtCropStartX=pos.x; mtCropStartY=pos.y;
      mtCropDisplayRect=null;
      redrawCropOverlay();
    };

    cv.onmousemove = e => {
      if(!mtCropDragging) return;
      const pos = getCropCanvasPos(e.clientX, e.clientY);
      const x=Math.min(mtCropStartX, pos.x), y=Math.min(mtCropStartY, pos.y);
      const w=Math.abs(pos.x - mtCropStartX),   h=Math.abs(pos.y - mtCropStartY);
      mtCropDisplayRect={x,y,w,h};
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
      const pos=getCropCanvasPos(t.clientX, t.clientY);
      mtCropDragging=true; mtCropStartX=pos.x; mtCropStartY=pos.y;
      mtCropDisplayRect=null; redrawCropOverlay();
    };
    cv.ontouchmove = e => {
      e.preventDefault();
      if(!mtCropDragging) return;
      const t=e.touches[0];
      const pos=getCropCanvasPos(t.clientX, t.clientY);
      const x=Math.min(mtCropStartX,pos.x), y=Math.min(mtCropStartY,pos.y);
      const w=Math.abs(pos.x-mtCropStartX),  h=Math.abs(pos.y-mtCropStartY);
      mtCropDisplayRect={x,y,w,h};
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

  function mtRotate(deg){mtState.rotateDeg+=deg;mtCropDisplayRect=null;mtState.cropRect=null;mtState.hasCrop=false;renderMultiTool();setTimeout(bindMtCropEvents,50);}
  function mtFlip(dir){if(dir==='h')mtState.flipH=!mtState.flipH;else mtState.flipV=!mtState.flipV;renderMultiTool();setTimeout(bindMtCropEvents,50);}
  function mtApplyCrop(){renderMultiTool();toast(Lang.t('toastCropApplied'));document.getElementById('mtApplyCropBtn').classList.add('active-state');}
  function mtClearCrop(){mtState.cropRect=null;mtState.hasCrop=false;mtCropDisplayRect=null;renderMultiTool();setTimeout(bindMtCropEvents,50);document.getElementById('mtApplyCropBtn').classList.remove('active-state');}
  function mtSetQuality(val){mtState.quality=Number(val);document.getElementById('mtQualLabel').textContent=val+'%';upSlider(document.getElementById('mtQual'));renderMultiTool();}
  function mtSetFormat(val){mtState.format=val;renderMultiTool();}
  function mtSetMaxW(val){mtState.maxW=Number(val);document.getElementById('mtMaxWLabel').textContent=Number(val)===0?'Original':val+'px';upSlider(document.getElementById('mtMaxW'));renderMultiTool();}
  function mtReset(){mtState={rotateDeg:0,flipH:false,flipV:false,cropRect:null,quality:85,format:'jpeg',maxW:0,hasCrop:false};mtCropDisplayRect=null;
    document.getElementById('mtQual').value=85;document.getElementById('mtQualLabel').textContent='85%';
    document.getElementById('mtMaxW').value=0;document.getElementById('mtMaxWLabel').textContent='Original';
    document.getElementById('mtFmt').value='jpeg';
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
  let a4State={orient:'portrait', count:4, margin:8, corner:'tl', imgDir:'row', gap:2};

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
    document.getElementById('a4DirRow').classList.toggle('active',d==='row');
    document.getElementById('a4DirCol').classList.toggle('active',d==='col');
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

  // Get position of image i in mm from top-left of printable area
  function getImgPos(i, g, marginMM, gapMM, pW, pH){
    const {cols, rows, placedW, placedH, cellW, cellH} = g;
    const corner = a4State.corner;  // tl tr bl br
    const dir    = a4State.imgDir;  // row or col

    let col, row;
    if(dir==='row'){
      col = i % cols;
      row = Math.floor(i / cols);
    } else {
      row = i % rows;
      col = Math.floor(i / rows);
    }

    // Flip axes based on corner
    const flipH = corner==='tr' || corner==='br';
    const flipV = corner==='bl' || corner==='br';
    if(flipH) col = cols - 1 - col;
    if(flipV) row = rows - 1 - row;

    // Cell top-left in mm (from page top-left)
    const xMM = marginMM + col*(cellW+gapMM) + (cellW-placedW)/2;
    const yMM = marginMM + row*(cellH+gapMM) + (cellH-placedH)/2;
    return {xMM, yMM};
  }

  function a4Preview(){
    if(!mtResultCanvas||!mtResultCanvas.width) return;
    const marginMM = parseFloat(document.getElementById('a4Margin')?.value)||8;
    const gapRaw   = parseFloat(document.getElementById('a4Gap')?.value);
    const gapMM    = isNaN(gapRaw) ? 2 : Math.max(0, gapRaw);
    a4State.margin = marginMM;
    a4State.gap    = gapMM;
    const pW = a4State.orient==='portrait'?210:297;
    const pH = a4State.orient==='portrait'?297:210;

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
    const marginMM = parseFloat(document.getElementById('a4Margin')?.value)||8;
    const gapRaw   = parseFloat(document.getElementById('a4Gap')?.value);
    const gapMM    = isNaN(gapRaw)?2:Math.max(0,gapRaw);
    const pW=a4State.orient==='portrait'?210:297;
    const pH=a4State.orient==='portrait'?297:210;

    let imgWmm,imgHmm,sizedExact=false;
    const sized=getSizeMM();
    if(sized){imgWmm=sized.w;imgHmm=sized.h;sizedExact=true;}
    else{const r=mtResultCanvas.width/mtResultCanvas.height;imgWmm=Math.min(80,(pW-marginMM*2));imgHmm=imgWmm/r;}

    const count=a4State.count;
    const g=computeA4Grid(pW,pH,imgWmm,imgHmm,marginMM,gapMM,count,sizedExact);
    const placeable=Math.min(count,g.fitsOnPage);

    const pdf=new jsPDF({orientation:a4State.orient,unit:'mm',format:'a4',compress:true});
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
  async function bpDownloadPDF(){
    if(!bpPages.length){ toast('No pages to export','error'); return; }
    if(!window.jspdf||!window.jspdf.jsPDF){ toast('PDF library not loaded','error'); return; }
    const {jsPDF}=window.jspdf;

    document.getElementById('bpProgress').style.display='block';
    document.getElementById('bpProgressLabel').textContent='Building PDF…';
    const bar=document.getElementById('bpProgressBar');

    // Determine page size from first image
    const firstImg=await bpImgDimensions(bpPages[0].dataUrl);
    const isLandscape=firstImg.w>firstImg.h;

    // We'll auto-detect per-page orientation
    const pdf=new jsPDF({orientation:isLandscape?'landscape':'portrait',unit:'mm',format:'a4',compress:true});
    const A4W_P=210, A4H_P=297;

    for(let i=0;i<bpPages.length;i++){
      const pg=bpPages[i];
      bar.style.width=((i/bpPages.length)*100)+'%';
      document.getElementById('bpProgressLabel').textContent=`Adding page ${i+1} of ${bpPages.length}…`;
      if(i>0) pdf.addPage('a4', 'portrait'); // reset; override below

      const dim=await bpImgDimensions(pg.dataUrl);
      const land=dim.w>dim.h;
      // Set page orientation per page
      const pgW=land?A4H_P:A4W_P, pgH=land?A4W_P:A4H_P;
      if(i>0){
        pdf.deletePage(pdf.internal.getNumberOfPages());
        pdf.addPage([pgW,pgH]);
      } else {
        // First page: re-init if needed
        pdf.internal.pageSize.width=pgW;
        pdf.internal.pageSize.height=pgH;
      }

      // Scale image to fill page preserving aspect ratio
      const ar=dim.w/dim.h;
      let iW=pgW, iH=pgW/ar;
      if(iH>pgH){ iH=pgH; iW=pgH*ar; }
      const x=(pgW-iW)/2, y=(pgH-iH)/2;

      const fmt=pg.dataUrl.startsWith('data:image/png')?'PNG':'JPEG';
      pdf.addImage(pg.dataUrl,fmt,x,y,iW,iH,undefined,'FAST');

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

  function clearMultiTool() {
    mtOrigFile=null;mtOrigImg=null;mtCropDisplayRect=null;
    mtState={rotateDeg:0,flipH:false,flipV:false,cropRect:null,quality:85,format:'jpeg',maxW:0,hasCrop:false};
    document.getElementById('mtPlaceholder').style.display='flex';
    document.getElementById('mtDrop').style.display='flex';
    document.getElementById('mtEditor').style.display='none';
    document.getElementById('mtInput').value='';
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
    loadMultiToolFile,mtRotate,mtFlip,mtApplyCrop,mtClearCrop,
    mtSetQuality,mtSetFormat,mtSetMaxW,mtReset,mtDownload,mtSendToApp,clearMultiTool,
    loadWmImg,updateWmSizeLabel,updateWmOpLabel,updateWmRotLabel,updateWmPreview,downloadWatermarked,clearWatermark,
    bindMtCropEvents,
    mtSizeChanged,mtSizeUnitChanged,mtApplySizePreset,mtClearSize,
    setA4Orient,setA4Corner,setA4ImgDir,a4CountDelta,a4Preview,downloadA4PDF,
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

/* ============================================================
   INIT
============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  addDocument(false);   // two-sided
  addDocument(false);   // two-sided
});
