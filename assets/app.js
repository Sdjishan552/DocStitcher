/* ============================================================
   Document Stitcher - Pure Vanilla JS
   No React, no build step.
============================================================ */

const A4_MM = {
  portrait: [210, 297],
  landscape: [297, 210],
};

const SLOT_META = {
  front: { label: 'Front side', badge: 'FRONT' },
  back: { label: 'Back side', badge: 'BACK' },
  sign: { label: 'Signature', badge: '' },
};

const state = {
  docs: [],
  nextDocNumber: 1,
};

function fmtBytes(b) {
  if (!Number.isFinite(b)) return '-';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(2) + ' MB';
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function cleanFilename(name) {
  const cleaned = String(name || 'document')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ');
  return cleaned || 'document';
}

function toast(msg, type = 'success', containerId = 'toastWrap') {
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

function waitFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

function triggerFileInput(id) {
  const input = document.getElementById(id);
  if (input) input.click();
}

function getDoc(docId) {
  return state.docs.find(doc => doc.id === Number(docId));
}

function isDocReady(doc) {
  return !!(doc && doc.files.front && doc.files.back);
}

function hasAnyFile(doc) {
  return !!(doc.files.front || doc.files.back || doc.files.sign);
}

function toggleHelp() {
  const p = document.getElementById('helpPanel');
  if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
}

function addDocument() {
  const number = state.nextDocNumber++;
  state.docs.push({
    id: Date.now() + number,
    number,
    name: `document ${number}`,
    orientation: 'portrait',
    quality: 80,
    files: { front: null, back: null, sign: null },
    signatureEnabled: false,
    signScale: 1.0,
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
  if (state.docs.length <= 1) {
    toast('Keep at least one document card.', 'error');
    return;
  }
  const doc = getDoc(docId);
  if (doc && doc.pdfUrl) URL.revokeObjectURL(doc.pdfUrl);
  state.docs = state.docs.filter(item => item.id !== Number(docId));
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
    // Draw live preview canvas after DOM settles
    schedulePreviewDraw(doc);
  });
  updateBatchActions();
}

function renderDocumentCard(doc) {
  const ready = isDocReady(doc);
  const estimateText = doc.estimate
    ? fmtBytes(doc.estimate)
    : ready
      ? (doc.estimateStatus === 'working' ? 'Calculating...' : 'Pending')
      : 'Add front and back';

  return `
    <section class="card document-card" data-doc-id="${doc.id}">
      <div class="document-card-head">
        <div>
          <div class="document-kicker">A4 PDF</div>
          <input class="doc-name-input" value="${escapeHtml(doc.name)}" aria-label="Document name" oninput="updateDocName(${doc.id}, this.value)">
        </div>
        <button class="btn-ghost icon-btn" title="Remove document" onclick="removeDocument(${doc.id})">x</button>
      </div>

      <div class="document-settings">
        <div class="ctrl-group">
          <label class="ctrl-label" for="orientation-${doc.id}">Orientation</label>
          <select class="ctrl-select" id="orientation-${doc.id}" onchange="updateDocOrientation(${doc.id}, this.value)">
            <option value="portrait"${doc.orientation === 'portrait' ? ' selected' : ''}>Portrait - stacked</option>
            <option value="landscape"${doc.orientation === 'landscape' ? ' selected' : ''}>Landscape - side by side</option>
          </select>
        </div>
        <div class="ctrl-group quality-control">
          <label class="ctrl-label" for="quality-${doc.id}">Quality <span id="qualityLabel-${doc.id}">${doc.quality}%</span></label>
          <div class="slider-wrap">
            <input type="range" id="quality-${doc.id}" min="10" max="100" value="${doc.quality}" oninput="updateDocQuality(${doc.id}, this)" style="--pct:${doc.quality}%">
          </div>
          <div class="target-size-wrap" style="margin-top:8px">
            <input type="number" class="target-size-input" id="targetKb-${doc.id}" min="20" max="10240" placeholder="Target KB (20–10240)" title="Enter target file size in KB (20 KB – 10 MB)" oninput="updateTargetKbLabel(${doc.id}, this)">
            <span class="ctrl-label" style="white-space:nowrap;align-self:center">KB</span>
            <button class="target-size-btn" onclick="applyTargetKb(${doc.id})" title="Apply target size">Set</button>
          </div>
        </div>
        <div class="estimate-pill ${ready ? 'ready' : ''}">
          <span>Download size</span>
          <strong id="estimate-${doc.id}">${estimateText}</strong>
        </div>
      </div>

      <div class="doc-layout-preview ${doc.orientation}">
        <div class="paper-mini paper-mini-canvas" title="${ready ? 'Click to preview full layout' : 'Upload front and back to preview'}" onclick="openPreviewLightbox(${doc.id})">
          <canvas class="preview-canvas" id="preview-canvas-${doc.id}"></canvas>
          ${ready ? '<div class=\'preview-canvas-hint\'>click to enlarge</div>' : ''}
        </div>
      </div>

      <label class="signature-toggle">
        <input type="checkbox" ${doc.signatureEnabled ? 'checked' : ''} onchange="toggleSignature(${doc.id}, this.checked)">
        <span>Add optional signature image</span>
      </label>
      ${doc.signatureEnabled ? renderSignScaleSlider(doc) : ''}

      <div class="doc-slot-grid ${doc.signatureEnabled ? 'with-signature' : ''}">
        ${renderSlot(doc, 'front')}
        ${renderSlot(doc, 'back')}
        ${doc.signatureEnabled ? renderSlot(doc, 'sign') : ''}
      </div>

      <div class="document-actions">
        <button class="btn-primary" onclick="downloadDocument(${doc.id})" ${ready ? '' : 'disabled'}>Download PDF</button>
        ${ready ? '<button class="btn-secondary" onclick="openPreviewLightbox(' + doc.id + ')">Preview</button>' : ''}
        <button class="btn-secondary" onclick="clearDocument(${doc.id})" ${hasAnyFile(doc) ? '' : 'disabled'}>Clear Images</button>
      </div>
    </section>
  `;
}

function renderSlot(doc, slot) {
  const fileObj = doc.files[slot];
  const meta = SLOT_META[slot];
  const optional = slot === 'sign';
  const inputId = `file-${doc.id}-${slot}`;
  const dropId = `drop-${doc.id}-${slot}`;

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
        <input type="file" id="${inputId}" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onchange="handleFile(this.files[0],${doc.id},'${slot}')">
        ${fileObj ? `
          <img class="drop-preview slot-img-clickable" src="${fileObj.dataUrl}" alt="${escapeHtml(meta.label)} preview" onclick="viewFull(${doc.id},'${slot}',event)" title="Click to enlarge">
          <div class="drop-overlay">
            <button class="btn-ghost" onclick="clearSlot(${doc.id},'${slot}',event)">Remove</button>
            <button class="btn-ghost" onclick="viewFull(${doc.id},'${slot}',event)">View</button>
          </div>
        ` : `
          <div class="drop-placeholder">
            <div class="drop-icon">${optional ? 'Sign' : slot === 'front' ? 'Front' : 'Back'}</div>
            <div class="drop-label">${optional ? 'Optional bottom signature' : 'Click or drag image here'}</div>
            <div class="drop-hint">JPG, PNG, WebP</div>
          </div>
        `}
      </div>
      <div class="slot-info ${fileObj ? '' : 'empty'}">
        <span class="slot-fname">${fileObj ? escapeHtml(fileObj.file.name) : (optional ? 'No signature image' : 'Required')}</span>
        <span class="slot-size">${fileObj ? fmtBytes(fileObj.file.size) : ''}</span>
      </div>
    </div>
  `;
}

function updateDocName(docId, value) {
  const doc = getDoc(docId);
  if (doc) doc.name = value;
}

function updateDocOrientation(docId, value) {
  const doc = getDoc(docId);
  if (!doc) return;
  doc.orientation = value === 'landscape' ? 'landscape' : 'portrait';
  invalidateDoc(doc);
  renderDocuments();
  scheduleDocEstimate(doc);
}

function updateDocQuality(docId, el) {
  const doc = getDoc(docId);
  if (!doc) return;
  doc.quality = Number(el.value);
  updateSliderGradient(el);
  const label = document.getElementById(`qualityLabel-${doc.id}`);
  if (label) label.textContent = doc.quality + '%';
  // Clear target KB input when slider moves manually
  const kbInput = document.getElementById(`targetKb-${doc.id}`);
  if (kbInput) { kbInput.value = ''; kbInput.classList.remove('ts-error','ts-ok'); }
  invalidateDoc(doc);
  scheduleDocEstimate(doc);
}

function updateTargetKbLabel(docId, el) {
  const v = parseInt(el.value);
  el.classList.remove('ts-error','ts-ok');
  if (!el.value) return;
  if (isNaN(v) || v < 20 || v > 10240) {
    el.classList.add('ts-error');
  } else {
    el.classList.add('ts-ok');
  }
}

async function applyTargetKb(docId) {
  const doc = getDoc(docId);
  if (!doc) return;
  const kbInput = document.getElementById(`targetKb-${docId}`);
  if (!kbInput) return;
  const targetKb = parseInt(kbInput.value);
  if (isNaN(targetKb) || targetKb < 20 || targetKb > 10240) {
    kbInput.classList.add('ts-error');
    toast('Enter a value between 20 and 10240 KB.', 'error');
    return;
  }
  if (!isDocReady(doc)) {
    toast('Upload front and back images first.', 'error');
    return;
  }
  const targetBytes = targetKb * 1024;
  // Binary search quality 10–100
  let lo = 10, hi = 100, bestQ = doc.quality, bestBlob = null;
  for (let i = 0; i < 8; i++) {
    const mid = Math.round((lo + hi) / 2);
    const testDoc = Object.assign({}, doc, { quality: mid });
    const blob = await buildDocPdfBlob(testDoc);
    if (blob.size <= targetBytes) { bestQ = mid; bestBlob = blob; lo = mid + 1; }
    else { hi = mid - 1; }
    if (lo > hi) break;
  }
  doc.quality = bestQ;
  if (bestBlob) { doc.pdfBlob = bestBlob; doc.estimate = bestBlob.size; doc.estimateStatus = 'ready'; }
  const slider = document.getElementById(`quality-${docId}`);
  if (slider) { slider.value = bestQ; updateSliderGradient(slider); }
  const label = document.getElementById(`qualityLabel-${docId}`);
  if (label) label.textContent = bestQ + '%';
  kbInput.classList.remove('ts-error'); kbInput.classList.add('ts-ok');
  updateEstimateText(doc);
  updateBatchActions();
  toast(`Quality set to ${bestQ}% (~${fmtBytes(doc.estimate || 0)})`);
}

function toggleSignature(docId, enabled) {
  const doc = getDoc(docId);
  if (!doc) return;
  doc.signatureEnabled = !!enabled;
  if (!doc.signatureEnabled) doc.files.sign = null;
  invalidateDoc(doc);
  renderDocuments();
  scheduleDocEstimate(doc);
}

function renderSignScaleSlider(doc) {
  const pct = ((doc.signScale * 100 - 30) / (300 - 30) * 100).toFixed(1) + '%';
  const label = Math.round(doc.signScale * 100) + '%';
  return [
    '<div class="sign-scale-wrap" id="sign-scale-wrap-' + doc.id + '">',
    '  <label class="ctrl-label" style="display:flex;align-items:center;gap:6px">',
    '    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/><path d="M11 8v6M8 11h6"/></svg>',
    '    Signature size &nbsp;<span id="signScaleLabel-' + doc.id + '">' + label + '</span>',
    '  </label>',
    '  <div class="slider-wrap" style="gap:8px">',
    '    <span class="ctrl-label" style="font-size:10px">30%</span>',
    '    <input type="range" id="signScale-' + doc.id + '" min="30" max="300" step="5" value="' + Math.round(doc.signScale * 100) + '"',
    '      oninput="updateSignScale(' + doc.id + ', this)"',
    '      style="--pct:' + pct + '">',
    '    <span class="ctrl-label" style="font-size:10px">300%</span>',
    '  </div>',
    '  <div class="sign-scale-presets">',
    '    <button class="sign-preset-btn" onclick="setSignScale(' + doc.id + ', 0.5)">Small</button>',
    '    <button class="sign-preset-btn" onclick="setSignScale(' + doc.id + ', 1.0)">Normal</button>',
    '    <button class="sign-preset-btn" onclick="setSignScale(' + doc.id + ', 1.5)">Large</button>',
    '    <button class="sign-preset-btn" onclick="setSignScale(' + doc.id + ', 2.0)">X-Large</button>',
    '  </div>',
    '</div>',
  ].join('\n');
}

function updateSignScale(docId, el) {
  const doc = getDoc(docId);
  if (!doc) return;
  doc.signScale = Number(el.value) / 100;
  updateSliderGradient(el);
  const label = document.getElementById('signScaleLabel-' + docId);
  if (label) label.textContent = Math.round(doc.signScale * 100) + '%';
  invalidateDoc(doc);
  scheduleDocEstimate(doc);
  schedulePreviewDraw(doc);
}

function setSignScale(docId, scale) {
  const doc = getDoc(docId);
  if (!doc) return;
  doc.signScale = scale;
  const slider = document.getElementById('signScale-' + docId);
  if (slider) {
    slider.value = Math.round(scale * 100);
    updateSliderGradient(slider);
  }
  const label = document.getElementById('signScaleLabel-' + docId);
  if (label) label.textContent = Math.round(scale * 100) + '%';
  invalidateDoc(doc);
  scheduleDocEstimate(doc);
  schedulePreviewDraw(doc);
}

function clearDocument(docId) {
  const doc = getDoc(docId);
  if (!doc) return;
  doc.files = { front: null, back: null, sign: null };
  doc.signatureEnabled = false;
  invalidateDoc(doc);
  renderDocuments();
}

function dzDrag(e, id) {
  e.preventDefault();
  const drop = document.getElementById(id);
  if (drop) drop.classList.add('drag-over');
}

function dzLeave(id) {
  const drop = document.getElementById(id);
  if (drop) drop.classList.remove('drag-over');
}

function dzDrop(e, dropId, docId, slot) {
  e.preventDefault();
  dzLeave(dropId);
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file, docId, slot);
}

function handleFile(file, docId, slot) {
  if (!file) return;
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    toast('Please select a JPG, PNG or WebP image.', 'error');
    return;
  }
  const doc = getDoc(docId);
  if (!doc || !SLOT_META[slot]) return;

  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      doc.files[slot] = { file, dataUrl: e.target.result, img };
      invalidateDoc(doc);
      renderDocuments();
      scheduleDocEstimate(doc);
      // Redraw preview after image is fully decoded (renderDocuments fires before img.onload)
      schedulePreviewDraw(doc);
    };
    img.onerror = () => toast('Could not read that image.', 'error');
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function clearSlot(docId, slot, e) {
  if (e) e.stopPropagation();
  const doc = getDoc(docId);
  if (!doc) return;
  doc.files[slot] = null;
  invalidateDoc(doc);
  renderDocuments();
  scheduleDocEstimate(doc);
}

function viewFull(docId, slot, e) {
  if (e) e.stopPropagation();
  const doc = getDoc(docId);
  const fileObj = doc && doc.files[slot];
  if (!fileObj) return;
  const lb = document.getElementById('lightbox');
  document.getElementById('lightboxImg').src = fileObj.dataUrl;
  lb.style.display = 'flex';
}

function closeLightbox(e) {
  if (e && e.target === document.getElementById('lightboxImg')) return;
  document.getElementById('lightbox').style.display = 'none';
}

// ── Canvas preview ────────────────────────────────────────────────────────

// Mirrors buildDocPdfBlob layout geometry exactly, but draws onto a <canvas>.
// A4 ratio: portrait 210:297, landscape 297:210
function drawPreviewCanvas(doc, canvas) {
  const isPort = doc.orientation === 'portrait';
  // A4 mm dims
  const [pw, ph] = isPort ? [210, 297] : [297, 210];

  // Canvas pixel size — keep it proportional, capped at a reasonable render size
  const BASE = isPort ? 420 : 594; // px for the longer side
  const cW = isPort ? Math.round(BASE * 210 / 297) : BASE;
  const cH = isPort ? BASE : Math.round(BASE * 210 / 297);

  canvas.width  = cW;
  canvas.height = cH;

  const ctx = canvas.getContext('2d');

  // White page background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cW, cH);

  // Scale factor: mm → px
  const scaleX = cW / pw;
  const scaleY = cH / ph;

  // ── Same constants as buildDocPdfBlob ──────────────────────────────────
  const pagePad     = 12;
  const gap         = 8;
  const hasSign     = doc.signatureEnabled && doc.files.sign;
  const signScale   = doc.signScale || 1.0;
  // FIXED band — always the same size regardless of signScale.
  // Sized for the maximum possible signature (300% = 40mm) so images NEVER move.
  const SIGN_IMG_MAX = 40;   // mm — absolute ceiling for signature image height
  const SIGN_BAND_H  = 42;   // mm — fixed: 40mm img + 6mm internal padding
  const SIGN_GAP     = 2;    // mm — gap between image area bottom and band top

  const imgAreaTop = pagePad;
  // imgAreaBot is CONSTANT — doesn't change when signScale changes
  const imgAreaBot = hasSign
    ? ph - pagePad - SIGN_BAND_H - SIGN_GAP
    : ph - pagePad;
  const imgAreaH = imgAreaBot - imgAreaTop;
  const imgAreaW = pw - pagePad * 2;

  // Helper: draw one image into a box (mirrors addImageFit, top-anchored)
  function drawImgInBox(imgEl, xMm, yMm, boxWmm, boxHmm) {
    const ratio = imgEl.naturalWidth / imgEl.naturalHeight;
    let wMm = boxWmm;
    let hMm = wMm / ratio;
    if (hMm > boxHmm) { hMm = boxHmm; wMm = hMm * ratio; }
    const cxMm = xMm + (boxWmm - wMm) / 2; // centre horizontally
    const cyMm = yMm;                        // top-anchored

    ctx.drawImage(
      imgEl,
      cxMm * scaleX, cyMm * scaleY,
      wMm  * scaleX, hMm  * scaleY
    );
  }

  // ── Draw front & back ──────────────────────────────────────────────────
  if (isPort) {
    const halfH = (imgAreaH - gap) / 2;

    // Tinted placeholder boxes if image not yet loaded
    if (doc.files.front && doc.files.front.img.complete && doc.files.front.img.naturalWidth) {
      drawImgInBox(doc.files.front.img, pagePad, imgAreaTop, imgAreaW, halfH);
    } else {
      ctx.fillStyle = 'rgba(249,107,63,0.10)';
      ctx.fillRect(pagePad*scaleX, imgAreaTop*scaleY, imgAreaW*scaleX, halfH*scaleY);
      ctx.fillStyle = 'rgba(249,107,63,0.35)';
      ctx.font = `bold ${Math.round(10*scaleY)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('FRONT', (pagePad + imgAreaW/2)*scaleX, (imgAreaTop + halfH/2)*scaleY);
    }

    if (doc.files.back && doc.files.back.img.complete && doc.files.back.img.naturalWidth) {
      drawImgInBox(doc.files.back.img, pagePad, imgAreaTop + halfH + gap, imgAreaW, halfH);
    } else {
      ctx.fillStyle = 'rgba(110,216,196,0.10)';
      ctx.fillRect(pagePad*scaleX, (imgAreaTop+halfH+gap)*scaleY, imgAreaW*scaleX, halfH*scaleY);
      ctx.fillStyle = 'rgba(24,168,122,0.35)';
      ctx.font = `bold ${Math.round(10*scaleY)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('BACK', (pagePad + imgAreaW/2)*scaleX, (imgAreaTop+halfH+gap + halfH/2)*scaleY);
    }
  } else {
    const halfW = (imgAreaW - gap) / 2;

    if (doc.files.front && doc.files.front.img.complete && doc.files.front.img.naturalWidth) {
      drawImgInBox(doc.files.front.img, pagePad, imgAreaTop, halfW, imgAreaH);
    } else {
      ctx.fillStyle = 'rgba(249,107,63,0.10)';
      ctx.fillRect(pagePad*scaleX, imgAreaTop*scaleY, halfW*scaleX, imgAreaH*scaleY);
      ctx.fillStyle = 'rgba(249,107,63,0.35)';
      ctx.font = `bold ${Math.round(10*scaleX)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('FRONT', (pagePad + halfW/2)*scaleX, (imgAreaTop + imgAreaH/2)*scaleY);
    }

    if (doc.files.back && doc.files.back.img.complete && doc.files.back.img.naturalWidth) {
      drawImgInBox(doc.files.back.img, pagePad + halfW + gap, imgAreaTop, halfW, imgAreaH);
    } else {
      ctx.fillStyle = 'rgba(110,216,196,0.10)';
      ctx.fillRect((pagePad+halfW+gap)*scaleX, imgAreaTop*scaleY, halfW*scaleX, imgAreaH*scaleY);
      ctx.fillStyle = 'rgba(24,168,122,0.35)';
      ctx.font = `bold ${Math.round(10*scaleX)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('BACK', (pagePad+halfW+gap + halfW/2)*scaleX, (imgAreaTop + imgAreaH/2)*scaleY);
    }
  }

  // ── Draw signature band ────────────────────────────────────────────────
  if (hasSign) {
    const bandTop = imgAreaBot + SIGN_GAP;
    const bandH   = ph - pagePad - bandTop;

    // Signature image
    if (doc.files.sign && doc.files.sign.img.complete && doc.files.sign.img.naturalWidth) {
      // Scale signature within fixed band — image grows/shrinks, band stays put
      const sigImgH = Math.min(SIGN_IMG_MAX * signScale, SIGN_IMG_MAX);
      const sigImgW = Math.min(63.5 * signScale, pw - pagePad * 2);
      const sigRatio = doc.files.sign.img.naturalWidth / doc.files.sign.img.naturalHeight;
      let sw = sigImgW, sh = sw / sigRatio;
      if (sh > sigImgH) { sh = sigImgH; sw = sh * sigRatio; }
      const sx = (pw - sw) / 2;
      const sy = bandTop + (bandH - sh) / 2;
      ctx.drawImage(doc.files.sign.img, sx*scaleX, sy*scaleY, sw*scaleX, sh*scaleY);
    } else {
      // Placeholder for signature band
      ctx.fillStyle = 'rgba(24,168,122,0.08)';
      ctx.fillRect(pagePad*scaleX, bandTop*scaleY, imgAreaW*scaleX, bandH*scaleY);
      ctx.fillStyle = 'rgba(24,168,122,0.4)';
      ctx.font = `bold ${Math.round(8*scaleY)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('SIGNATURE', (pw/2)*scaleX, (bandTop + bandH/2)*scaleY);
    }
  }

  // ── Page border ────────────────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(30,44,64,0.12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, cW - 1, cH - 1);
}

// Schedules a canvas redraw on the next animation frame (debounced)
const _previewTimers = {};
function schedulePreviewDraw(doc) {
  if (_previewTimers[doc.id]) cancelAnimationFrame(_previewTimers[doc.id]);
  _previewTimers[doc.id] = requestAnimationFrame(() => {
    delete _previewTimers[doc.id];
    const canvas = document.getElementById('preview-canvas-' + doc.id);
    if (canvas) drawPreviewCanvas(doc, canvas);
  });
}

// Opens the canvas preview full-screen in the existing lightbox,
// but renders it onto a larger off-screen canvas for sharpness.
function openPreviewLightbox(docId) {
  const doc = getDoc(docId);
  if (!doc) return;

  // Render at 2× resolution into an offscreen canvas, then show as image
  const offscreen = document.createElement('canvas');
  const isPort = doc.orientation === 'portrait';
  const [pw, ph] = isPort ? [210, 297] : [297, 210];
  const BASE = isPort ? 1400 : 1980;
  offscreen.width  = isPort ? Math.round(BASE * 210 / 297) : BASE;
  offscreen.height = isPort ? BASE : Math.round(BASE * 210 / 297);

  drawPreviewCanvas(doc, offscreen);

  const lb = document.getElementById('lightbox');
  document.getElementById('lightboxImg').src = offscreen.toDataURL('image/jpeg', 0.96);
  lb.style.display = 'flex';
}

function invalidateDoc(doc) {
  doc.estimate = null;
  doc.estimateStatus = isDocReady(doc) ? 'pending' : 'waiting';
  doc.estimateToken += 1;
  if (doc.estimateTimer) {
    clearTimeout(doc.estimateTimer);
    doc.estimateTimer = null;
  }
  if (doc.pdfUrl) URL.revokeObjectURL(doc.pdfUrl);
  doc.pdfUrl = null;
  doc.pdfBlob = null;
  updateEstimateText(doc);
  updateBatchActions();
}

function refreshAllEstimates() {
  state.docs.forEach(scheduleDocEstimate);
}

function scheduleDocEstimate(doc) {
  if (!doc || !isDocReady(doc)) {
    updateEstimateText(doc);
    updateBatchActions();
    return;
  }
  const token = ++doc.estimateToken;
  doc.estimateStatus = 'working';
  updateEstimateText(doc);
  if (doc.estimateTimer) clearTimeout(doc.estimateTimer);
  doc.estimateTimer = setTimeout(async () => {
    try {
      await waitFrame();
      const blob = await buildDocPdfBlob(doc);
      if (token !== doc.estimateToken) return;
      doc.pdfBlob = blob;
      doc.estimate = blob.size;
      doc.estimateStatus = 'ready';
      updateEstimateText(doc);
      updateBatchActions();
    } catch (err) {
      console.error(err);
      if (token === doc.estimateToken) {
        doc.estimateStatus = 'error';
        updateEstimateText(doc, 'Could not estimate');
      }
    }
  }, 220);
}

function updateEstimateText(doc, fallback) {
  if (!doc) return;
  const el = document.getElementById(`estimate-${doc.id}`);
  if (!el) return;
  if (fallback) {
    el.textContent = fallback;
  } else if (!isDocReady(doc)) {
    el.textContent = 'Add front and back';
  } else if (doc.estimate) {
    el.textContent = fmtBytes(doc.estimate);
  } else {
    el.textContent = doc.estimateStatus === 'working' ? 'Calculating...' : 'Pending';
  }
}

async function buildDocPdfBlob(doc) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    throw new Error('PDF library is not loaded.');
  }
  if (!isDocReady(doc)) {
    throw new Error('Front and back images are required.');
  }

  const { jsPDF } = window.jspdf;
  const [pw, ph] = A4_MM[doc.orientation];
  const quality = Math.max(0.1, Math.min(1, doc.quality / 100));
  const pdf = new jsPDF({ orientation: doc.orientation, unit: 'mm', format: 'a4', compress: true });

  const frontData = await imageToJpeg(doc.files.front.img, quality, 2400);
  await waitFrame();
  const backData = await imageToJpeg(doc.files.back.img, quality, 2400);

  // ── Layout constants ──────────────────────────────────────────────────────
  const pagePad = 12;   // outer margin on all sides (mm)
  const gap     = 8;    // gap between front and back images (mm)
  const hasSign = doc.signatureEnabled && doc.files.sign;

  // Signature band: a fixed-height strip at the bottom of the page.
  // This zone is ALWAYS fully reserved when a signature exists —
  // front/back images are hard-clipped to never enter it.
  const signScale    = doc.signScale || 1.0;
  // FIXED band — always the same size regardless of signScale.
  // Sized for maximum signature (300%) so images NEVER shrink when scale changes.
  const SIGN_IMG_MAX = 40;   // mm — absolute ceiling for signature image height
  const SIGN_BAND_H  = 42;   // mm — fixed: 40mm img + 6mm internal padding
  const SIGN_GAP     = 2;    // mm — gap between image area bottom and band top

  // The usable rectangle for front + back images — CONSTANT, never changes
  const imgAreaTop  = pagePad;
  const imgAreaBot  = hasSign
    ? ph - pagePad - SIGN_BAND_H - SIGN_GAP  // hard ceiling — images STOP here
    : ph - pagePad;
  const imgAreaH    = imgAreaBot - imgAreaTop;  // guaranteed free of signature
  const imgAreaW    = pw - pagePad * 2;

  // ── Draw front & back inside the strictly-bounded image area ─────────────
  if (doc.orientation === 'portrait') {
    const halfH = (imgAreaH - gap) / 2;
    addImageFit(pdf, frontData, doc.files.front.img,
      pagePad, imgAreaTop,
      imgAreaW, halfH);
    addImageFit(pdf, backData, doc.files.back.img,
      pagePad, imgAreaTop + halfH + gap,
      imgAreaW, halfH);
  } else {
    const halfW = (imgAreaW - gap) / 2;
    addImageFit(pdf, frontData, doc.files.front.img,
      pagePad, imgAreaTop,
      halfW, imgAreaH);
    addImageFit(pdf, backData, doc.files.back.img,
      pagePad + halfW + gap, imgAreaTop,
      halfW, imgAreaH);
  }

  // ── Draw signature inside its reserved band — never above imgAreaBot ─────
  if (hasSign) {
    await waitFrame();
    const signData = await imageToJpeg(doc.files.sign.img, quality, 1200);

    // Signature band spans from imgAreaBot + SIGN_GAP to ph - pagePad
    const bandTop = imgAreaBot + SIGN_GAP;
    const bandH   = ph - pagePad - bandTop;   // remaining space to bottom margin

    addSignature(pdf, signData, doc.files.sign.img,
      pw, bandTop, bandH, SIGN_IMG_MAX, pagePad, doc.signScale || 1.0);
  }

  return pdf.output('blob');
}

function imageToJpeg(imgEl, quality, maxDimension) {
  return new Promise(resolve => {
    const naturalW = imgEl.naturalWidth;
    const naturalH = imgEl.naturalHeight;
    const scale = Math.min(1, maxDimension / Math.max(naturalW, naturalH));
    const w = Math.max(1, Math.round(naturalW * scale));
    const h = Math.max(1, Math.round(naturalH * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { alpha: false });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imgEl, 0, 0, w, h);
    resolve(c.toDataURL('image/jpeg', quality));
  });
}

// Images are centered horizontally but anchored to the TOP of their slot
// so they never spill downward beyond maxH.
function addImageFit(pdf, dataUrl, imgEl, x, y, maxW, maxH) {
  const ratio = imgEl.naturalWidth / imgEl.naturalHeight;
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {        // too tall → constrain by height
    h = maxH;
    w = h * ratio;
  }
  const cx = x + (maxW - w) / 2;  // centre horizontally
  const cy = y;                    // anchor to the TOP — never bleeds below y + maxH
  pdf.addImage(dataUrl, 'JPEG', cx, cy, w, h, undefined, 'FAST');
}

// Signature is centred inside the reserved band.
// bandTop   – y coordinate where the band begins (guaranteed below all images)
// bandH     – total height of the band in mm
// maxImgH   – max pixel height the signature image may occupy
function addSignature(pdf, dataUrl, imgEl, pageW, bandTop, bandH, maxImgH, pagePad, signScale) {
  signScale = signScale || 1.0;
  // maxImgH is the FIXED ceiling (40mm). Scale controls how much of that ceiling is used.
  // Width: 63.5mm base × scale, capped to page content width.
  // Height: maxImgH × scale, capped to maxImgH (the fixed band limit).
  const MAX_W = Math.min(63.5 * signScale, pageW - pagePad * 2);
  const MAX_H = Math.min(maxImgH * signScale, maxImgH);

  const ratio = imgEl.naturalWidth / imgEl.naturalHeight;
  let w = MAX_W;
  let h = w / ratio;
  if (h > MAX_H) { h = MAX_H; w = h * ratio; }

  // Centre horizontally, centre vertically inside the band
  const x = (pageW - w) / 2;
  const y = bandTop + (bandH - h) / 2;
  pdf.addImage(dataUrl, 'JPEG', x, y, w, h, undefined, 'FAST');
}

async function ensurePdf(doc) {
  if (doc.pdfBlob) return doc.pdfBlob;
  doc.estimateStatus = 'working';
  updateEstimateText(doc);
  const blob = await buildDocPdfBlob(doc);
  doc.pdfBlob = blob;
  doc.estimate = blob.size;
  doc.estimateStatus = 'ready';
  updateEstimateText(doc);
  updateBatchActions();
  return blob;
}

async function downloadDocument(docId) {
  const doc = getDoc(docId);
  if (!isDocReady(doc)) {
    toast('Upload front and back before downloading.', 'error');
    return;
  }
  const btn = document.querySelector(`[data-doc-id="${doc.id}"] .btn-primary`);
  if (btn) btn.disabled = true;
  try {
    const blob = await ensurePdf(doc);
    saveBlob(blob, cleanFilename(doc.name) + '.pdf');
    toast('Downloading ' + cleanFilename(doc.name) + '.pdf');
  } catch (err) {
    console.error(err);
    toast('Could not create PDF: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function downloadAllDocuments() {
  const readyDocs = state.docs.filter(isDocReady);
  if (!readyDocs.length) {
    toast('No completed document cards to download.', 'error');
    return;
  }
  const btn = document.getElementById('downloadAllBtn');
  if (btn) btn.disabled = true;
  try {
    for (const doc of readyDocs) {
      const blob = await ensurePdf(doc);
      saveBlob(blob, cleanFilename(doc.name) + '.pdf');
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    toast('Started ' + readyDocs.length + ' downloads.');
  } catch (err) {
    console.error(err);
    toast('Stopped while creating PDFs: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function updateBatchActions() {
  const readyCount = state.docs.filter(isDocReady).length;
  const readyEl = document.getElementById('readyCount');
  const downloadAllBtn = document.getElementById('downloadAllBtn');
  if (readyEl) readyEl.textContent = readyCount + ' ready';
  if (downloadAllBtn) downloadAllBtn.disabled = readyCount === 0;
}

// ---- SDT (Single-Doc Tools) navigation ----
function sdtOpen() {
  document.getElementById('app-main').style.display = 'none';
  document.getElementById('sdt-fab').style.display = 'none';
  document.getElementById('sdt-page').style.display = 'block';
}
function sdtClose() {
  document.getElementById('sdt-page').style.display = 'none';
  document.getElementById('app-main').style.display = 'block';
  document.getElementById('sdt-fab').style.display = 'flex';
}

// ---- SDT Send to Stitcher ----
let _pendingSendImg = null;

function sdtSendToApp(imgElId, filenameBase) {
  const img = document.getElementById(imgElId);
  if (!img || !img.src || img.src.startsWith('data:,')) {
    sdt.toast('Nothing to send yet - generate an output first.', 'error');
    return;
  }
  _pendingSendImg = { src: img.src, name: filenameBase };
  renderSlotPicker();
  document.getElementById('slotPicker').style.display = 'flex';
}

function renderSlotPicker() {
  const body = document.getElementById('slotPickerBody');
  if (!body) return;
  body.innerHTML = state.docs.map(doc => {
    const frontOccupied = !!doc.files.front;
    const backOccupied  = !!doc.files.back;
    const signOccupied  = !!doc.files.sign;
    return `
    <div class="slot-picker-doc">
      <div class="slot-picker-doc-name">${escapeHtml(doc.name || ('document ' + doc.number))}</div>
      <div class="slot-picker-actions">
        <button class="btn-primary${frontOccupied ? ' slot-occupied' : ''}" onclick="doSendToSlot(${doc.id},'front')" ${frontOccupied ? 'disabled title="Front slot is already occupied"' : ''}>
          ${frontOccupied ? '<span class="slot-occ-icon">✓</span> Occupied' : 'Front'}
        </button>
        <button class="btn-primary${backOccupied ? ' slot-occupied' : ''}" onclick="doSendToSlot(${doc.id},'back')" ${backOccupied ? 'disabled title="Back slot is already occupied"' : ''}>
          ${backOccupied ? '<span class="slot-occ-icon">✓</span> Occupied' : 'Back'}
        </button>
        <button class="btn-secondary${signOccupied ? ' slot-occupied' : ''}" onclick="doSendToSlot(${doc.id},'sign')" ${signOccupied ? 'disabled title="Signature slot is already occupied"' : ''}>
          ${signOccupied ? '<span class="slot-occ-icon">✓</span> Occupied' : 'Signature'}
        </button>
      </div>
    </div>
  `}).join('') + `
    <button class="btn-secondary" style="width:100%;justify-content:center" onclick="sendToNewDocument()">Add new document</button>
    <button class="btn-ghost" style="width:100%;justify-content:center;margin-top:8px" onclick="closeSlotPicker()">Cancel</button>
  `;
}

function closeSlotPicker(e) {
  if (e && e.target !== document.getElementById('slotPicker')) return;
  document.getElementById('slotPicker').style.display = 'none';
  _pendingSendImg = null;
}

function pendingSendFile() {
  if (!_pendingSendImg) return null;
  const arr = _pendingSendImg.src.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8 = new Uint8Array(n);
  while (n--) u8[n] = bstr.charCodeAt(n);
  return new File([u8], `${_pendingSendImg.name}.${ext}`, { type: mime });
}

function doSendToSlot(docId, slot) {
  const doc = getDoc(docId);
  if (!doc) return;
  // Guard: refuse to overwrite an already-occupied slot
  if (doc.files[slot]) {
    toast(`${SLOT_META[slot].label} is already occupied. Remove the existing image first.`, 'error');
    return;
  }
  const file = pendingSendFile();
  if (!file) return;
  document.getElementById('slotPicker').style.display = 'none';
  _pendingSendImg = null;
  handleFile(file, docId, slot);
  sdtClose();
  toast('Sent to ' + SLOT_META[slot].label.toLowerCase() + '.');
}

function sendToNewDocument() {
  const file = pendingSendFile();
  if (!file) return;
  addDocument();
  const doc = state.docs[state.docs.length - 1];
  document.getElementById('slotPicker').style.display = 'none';
  _pendingSendImg = null;
  handleFile(file, doc.id, 'front');
  sdtClose();
  toast('Created a new document card.');
}

// ============================================================
//  SINGLE-DOC TOOLS MODULE
// ============================================================
window.sdt = (() => {
  function toast(msg, type = 'success') {
    const w = document.getElementById('sdtToastWrap');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    w.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }
  function fmtBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
    return (b/1048576).toFixed(2) + ' MB';
  }
  function updateSliderGradient(el) {
    const pct = ((el.value - el.min) / (el.max - el.min) * 100).toFixed(1) + '%';
    el.style.setProperty('--pct', pct);
  }

  // ---- Tab switching ----
  function switchTab(name, btn) {
    document.querySelectorAll('.tool-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    btn.classList.add('active');
  }

  // ---- DZ helpers ----
  function dzDrag(e, id) { e.preventDefault(); document.getElementById(id).classList.add('drag-over'); }
  function dzLeave(id) { document.getElementById(id).classList.remove('drag-over'); }
  function dzDrop(e, id, loader) {
    e.preventDefault();
    document.getElementById(id).classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) loader(f);
  }

  /* ---- COMPRESS ---- */
  let compressOrigFile = null, compressImg = null, compressOrigBlob = null;

  function loadCompressImg(file) {
    if (!file || !file.type.startsWith('image/')) { toast('Please select an image.', 'error'); return; }
    compressOrigFile = file;
    const r = new FileReader();
    r.onload = e => {
      compressImg = new Image();
      compressImg.onload = () => {
        document.getElementById('compPreview').src = e.target.result;
        document.getElementById('compPreview').style.display = 'block';
        document.getElementById('compPlaceholder').style.display = 'none';
        document.getElementById('compOverlay').style.display = 'flex';
        document.getElementById('compDrop').classList.add('has-image');
        document.getElementById('compControls').style.display = 'block';
        document.getElementById('compStats').style.display = 'flex';
        document.getElementById('compOutput').style.display = 'block';
        document.getElementById('statOrigSize').textContent = fmtBytes(file.size);
        document.getElementById('statDims').textContent = compressImg.naturalWidth + ' x ' + compressImg.naturalHeight;
        updateCompPreview();
      };
      compressImg.src = e.target.result;
    };
    r.readAsDataURL(file);
  }

  function updateQualLabel() {
    const v = document.getElementById('compQual').value;
    document.getElementById('compQualLabel').textContent = v + '%';
    updateSliderGradient(document.getElementById('compQual'));
  }
  function updateMaxWLabel() {
    const v = parseInt(document.getElementById('compMaxW').value);
    document.getElementById('compMaxWLabel').textContent = v === 0 ? 'Original' : v + 'px';
    updateSliderGradient(document.getElementById('compMaxW'));
  }

  function updateCompPreview() {
    if (!compressImg) return;
    const qual = parseInt(document.getElementById('compQual').value) / 100;
    const fmt  = document.getElementById('compFormat').value;
    const maxW = parseInt(document.getElementById('compMaxW').value);
    const c = document.createElement('canvas');
    let w = compressImg.naturalWidth, h = compressImg.naturalHeight;
    if (maxW > 0 && w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (fmt !== 'png') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(compressImg, 0, 0, w, h);
    const mime = fmt === 'jpeg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png';
    const dataURL = c.toDataURL(mime, fmt !== 'png' ? qual : undefined);
    document.getElementById('compOutImg').src = dataURL;
    const newBytes = Math.round(dataURL.split(',')[1].length * 0.75);
    const origBytes = compressOrigFile.size;
    const saved = Math.max(0, ((origBytes - newBytes) / origBytes * 100)).toFixed(1);
    document.getElementById('statNewSize').textContent = fmtBytes(newBytes);
    document.getElementById('statSaved').textContent = saved + '%';
    document.getElementById('statDims').textContent = w + ' x ' + h;
    compressOrigBlob = { dataURL, fmt };
  }

  function downloadCompressed() {
    if (!compressOrigBlob) return;
    const ext = compressOrigBlob.fmt === 'jpeg' ? 'jpg' : compressOrigBlob.fmt;
    const a = document.createElement('a');
    a.href = compressOrigBlob.dataURL; a.download = 'compressed_doc.' + ext; a.click();
    toast('Downloaded!');
  }

  /* ---- CROP ---- */
  let cropImgEl = null, cropOrigW = 0, cropOrigH = 0, cropDisplayScale = 1;
  let cropDragging = false, cropStartX = 0, cropStartY = 0, cropRect = null;

  function loadCropImg(file) {
    if (!file || !file.type.startsWith('image/')) { toast('Please select an image.', 'error'); return; }
    const r = new FileReader();
    r.onload = e => {
      cropImgEl = new Image();
      cropImgEl.onload = () => {
        const canvas = document.getElementById('cropCanvas');
        const wrap = document.getElementById('cropCanvasWrap');
        const maxW = wrap.offsetWidth || 680;
        cropOrigW = cropImgEl.naturalWidth; cropOrigH = cropImgEl.naturalHeight;
        cropDisplayScale = Math.min(1, maxW / cropOrigW);
        canvas.width  = Math.round(cropOrigW * cropDisplayScale);
        canvas.height = Math.round(cropOrigH * cropDisplayScale);
        canvas.getContext('2d').drawImage(cropImgEl, 0, 0, canvas.width, canvas.height);
        document.getElementById('cropPlaceholder').style.display = 'none';
        document.getElementById('cropDrop').style.display = 'none';
        document.getElementById('cropEditor').style.display = 'block';
        bindCropEvents();
      };
      cropImgEl.src = e.target.result;
    };
    r.readAsDataURL(file);
  }

  function bindCropEvents() {
    const canvas = document.getElementById('cropCanvas');
    canvas.onmousedown = cropDown;
    canvas.onmousemove = cropMove;
    canvas.onmouseup   = cropUp;
    canvas.addEventListener('touchstart', e => {
      const r = canvas.getBoundingClientRect();
      cropDown({ offsetX: e.touches[0].clientX - r.left, offsetY: e.touches[0].clientY - r.top });
    }, { passive: true });
    canvas.addEventListener('touchmove', e => {
      const r = canvas.getBoundingClientRect();
      cropMove({ offsetX: e.touches[0].clientX - r.left, offsetY: e.touches[0].clientY - r.top });
    }, { passive: true });
    canvas.addEventListener('touchend', cropUp, { passive: true });
  }

  function cropDown(e) {
    cropDragging = true; cropStartX = e.offsetX; cropStartY = e.offsetY;
    cropRect = null;
    document.getElementById('cropOverlay').style.display = 'none';
    document.getElementById('cropApplyBtn').disabled = true;
  }
  function cropMove(e) {
    if (!cropDragging) return;
    const x = Math.min(cropStartX, e.offsetX), y = Math.min(cropStartY, e.offsetY);
    const w = Math.abs(e.offsetX - cropStartX), h = Math.abs(e.offsetY - cropStartY);
    const ov = document.getElementById('cropOverlay');
    ov.style.display = 'block';
    ov.style.left = x+'px'; ov.style.top = y+'px';
    ov.style.width = w+'px'; ov.style.height = h+'px';
    cropRect = { x, y, w, h };
    document.getElementById('cropX').textContent = Math.round(x / cropDisplayScale) + 'px';
    document.getElementById('cropY').textContent = Math.round(y / cropDisplayScale) + 'px';
    document.getElementById('cropW').textContent = Math.round(w / cropDisplayScale) + 'px';
    document.getElementById('cropH').textContent = Math.round(h / cropDisplayScale) + 'px';
  }
  function cropUp() {
    cropDragging = false;
    if (cropRect && cropRect.w > 4 && cropRect.h > 4)
      document.getElementById('cropApplyBtn').disabled = false;
  }

  function resetCropSelection() {
    cropRect = null;
    document.getElementById('cropOverlay').style.display = 'none';
    document.getElementById('cropApplyBtn').disabled = true;
    document.getElementById('cropOutputSection').style.display = 'none';
    document.getElementById('cropDownloadBtn').style.display = 'none';
    document.getElementById('cropSendBtn').style.display = 'none';
    ['cropX','cropY','cropW','cropH'].forEach(id => document.getElementById(id).textContent = '-');
  }

  function applyCrop() {
    if (!cropRect || !cropImgEl) return;
    const sx = Math.round(cropRect.x / cropDisplayScale);
    const sy = Math.round(cropRect.y / cropDisplayScale);
    const sw = Math.round(cropRect.w / cropDisplayScale);
    const sh = Math.round(cropRect.h / cropDisplayScale);
    const out = document.createElement('canvas');
    out.width = sw; out.height = sh;
    out.getContext('2d').drawImage(cropImgEl, sx, sy, sw, sh, 0, 0, sw, sh);
    document.getElementById('cropOutImg').src = out.toDataURL('image/jpeg', 0.92);
    document.getElementById('cropOutputSection').style.display = 'block';
    document.getElementById('cropDownloadBtn').style.display = 'inline-flex';
    document.getElementById('cropSendBtn').style.display = 'inline-flex';
    toast('Crop applied!');
  }

  function downloadCropped() {
    const src = document.getElementById('cropOutImg').src;
    if (!src) return;
    const a = document.createElement('a'); a.href = src; a.download = 'cropped_doc.jpg'; a.click();
    toast('Downloaded!');
  }

  /* ---- ROTATE ---- */
  const rotCanvas = document.createElement('canvas');
  const rotCtx = rotCanvas.getContext('2d');
  let rotImg = null, rotateDeg = 0, rotFlipH = false, rotFlipV = false;

  function loadRotateImg(file) {
    if (!file || !file.type.startsWith('image/')) { toast('Please select an image.', 'error'); return; }
    const r = new FileReader();
    r.onload = e => {
      rotImg = new Image();
      rotImg.onload = () => {
        rotateDeg = 0; rotFlipH = false; rotFlipV = false;
        document.getElementById('rotatePlaceholder').style.display = 'none';
        document.getElementById('rotateDrop').style.display = 'none';
        document.getElementById('rotateEditor').style.display = 'block';
        renderRotate();
      };
      rotImg.src = e.target.result;
    };
    r.readAsDataURL(file);
  }

  function renderRotate() {
    if (!rotImg) return;
    const deg = ((rotateDeg % 360) + 360) % 360;
    const swap = deg === 90 || deg === 270;
    const w = swap ? rotImg.naturalHeight : rotImg.naturalWidth;
    const h = swap ? rotImg.naturalWidth  : rotImg.naturalHeight;
    rotCanvas.width = w; rotCanvas.height = h;
    rotCtx.clearRect(0, 0, w, h);
    rotCtx.save();
    rotCtx.translate(w/2, h/2);
    rotCtx.rotate(deg * Math.PI / 180);
    rotCtx.scale(rotFlipH ? -1 : 1, rotFlipV ? -1 : 1);
    rotCtx.drawImage(rotImg, -rotImg.naturalWidth/2, -rotImg.naturalHeight/2);
    rotCtx.restore();
    document.getElementById('rotatePreview').src = rotCanvas.toDataURL('image/jpeg', 0.92);
  }
  function applyRotate(deg) { rotateDeg += deg; renderRotate(); }
  function applyFlip(dir) { if (dir === 'h') rotFlipH = !rotFlipH; else rotFlipV = !rotFlipV; renderRotate(); }
  function downloadRotated() {
    const a = document.createElement('a');
    a.href = rotCanvas.toDataURL('image/jpeg', 0.92); a.download = 'rotated_doc.jpg'; a.click();
    toast('Downloaded!');
  }

  /* ---- CONVERT ---- */
  let convertImg = null, convertOrigFile = null;

  function loadConvertImg(file) {
    if (!file || !file.type.startsWith('image/')) { toast('Please select an image.', 'error'); return; }
    convertOrigFile = file;
    const r = new FileReader();
    r.onload = e => {
      convertImg = new Image();
      convertImg.onload = () => {
        document.getElementById('convOrigFmt').textContent = (file.name.split('.').pop()||'').toUpperCase() || file.type;
        document.getElementById('convOrigSize').textContent = fmtBytes(file.size);
        document.getElementById('convertPlaceholder').style.display = 'none';
        document.getElementById('convertDrop').style.display = 'none';
        document.getElementById('convertEditor').style.display = 'block';
        updateConvertPreview();
      };
      convertImg.src = e.target.result;
    };
    r.readAsDataURL(file);
  }

  function updateConvertQualLabel() {
    const v = document.getElementById('convertQual').value;
    document.getElementById('convertQualLabel').textContent = v + '%';
    updateSliderGradient(document.getElementById('convertQual'));
  }
  function updateConvertPreview() {
    if (!convertImg) return;
    const fmt  = document.getElementById('convertFmt').value;
    const qual = parseInt(document.getElementById('convertQual').value) / 100;
    const c = document.createElement('canvas');
    c.width = convertImg.naturalWidth; c.height = convertImg.naturalHeight;
    const ctx = c.getContext('2d');
    if (fmt === 'jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.drawImage(convertImg, 0, 0);
    const mime = fmt === 'jpeg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png';
    const dataURL = c.toDataURL(mime, fmt !== 'png' ? qual : undefined);
    document.getElementById('convertOutImg').src = dataURL;
    document.getElementById('convNewSize').textContent = fmtBytes(Math.round(dataURL.split(',')[1].length * 0.75));
  }
  function downloadConverted() {
    const fmt = document.getElementById('convertFmt').value;
    const ext = fmt === 'jpeg' ? 'jpg' : fmt;
    const a = document.createElement('a');
    a.href = document.getElementById('convertOutImg').src;
    a.download = 'converted_doc.' + ext; a.click();
    toast('Downloaded!');
  }

  /* ---- WATERMARK ---- */
  let wmImg = null;

  function loadWmImg(file) {
    if (!file || !file.type.startsWith('image/')) { toast('Please select an image.', 'error'); return; }
    const r = new FileReader();
    r.onload = e => {
      wmImg = new Image();
      wmImg.onload = () => {
        document.getElementById('wmPlaceholder').style.display = 'none';
        document.getElementById('wmDrop').style.display = 'none';
        document.getElementById('wmEditor').style.display = 'block';
        updateWmPreview();
      };
      wmImg.src = e.target.result;
    };
    r.readAsDataURL(file);
  }
  function updateWmSizeLabel() { const v = document.getElementById('wmSize').value; document.getElementById('wmSizeLabel').textContent = v+'px'; updateSliderGradient(document.getElementById('wmSize')); }
  function updateWmOpLabel()   { const v = document.getElementById('wmOp').value;   document.getElementById('wmOpLabel').textContent   = v+'%';  updateSliderGradient(document.getElementById('wmOp')); }
  function updateWmRotLabel()  { const v = document.getElementById('wmRot').value;  document.getElementById('wmRotLabel').textContent  = v + ' deg';  updateSliderGradient(document.getElementById('wmRot')); }

  function updateWmPreview() {
    if (!wmImg) return;
    const text  = document.getElementById('wmText').value || 'WATERMARK';
    const pos   = document.getElementById('wmPos').value;
    const size  = parseInt(document.getElementById('wmSize').value);
    const op    = parseInt(document.getElementById('wmOp').value) / 100;
    const rot   = parseInt(document.getElementById('wmRot').value) * Math.PI / 180;
    const color = document.getElementById('wmColor').value;
    const c = document.createElement('canvas');
    c.width = wmImg.naturalWidth; c.height = wmImg.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(wmImg, 0, 0);
    ctx.globalAlpha = op;
    ctx.font = `bold ${size}px "DM Sans", sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const drawText = (x, y) => { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillText(text, 0, 0); ctx.restore(); };
    const w = c.width, h = c.height;
    if (pos === 'center') { drawText(w/2, h/2); }
    else if (pos === 'tile') {
      const stepX = Math.max(200, ctx.measureText(text).width + size * 2);
      const stepY = size * 3;
      for (let y = 0; y < h + stepY; y += stepY)
        for (let x = 0; x < w + stepX; x += stepX)
          drawText(x, y);
    } else {
      const pad = size;
      const positions = { topleft:[pad,pad], topright:[w-pad,pad], bottomleft:[pad,h-pad], bottomright:[w-pad,h-pad] };
      drawText(...positions[pos]);
    }
    ctx.globalAlpha = 1;
    document.getElementById('wmOutImg').src = c.toDataURL('image/jpeg', 0.92);
  }
  function downloadWatermarked() {
    const a = document.createElement('a');
    a.href = document.getElementById('wmOutImg').src; a.download = 'watermarked_doc.jpg'; a.click();
    toast('Downloaded!');
  }

  /* ---- CLEAR ---- */
  function clearTool(tool, e) {
    if (e) e.stopPropagation();
    if (tool === 'compress') {
      compressOrigFile = null; compressImg = null; compressOrigBlob = null;
      document.getElementById('compPreview').style.display = 'none';
      document.getElementById('compPlaceholder').style.display = 'flex';
      document.getElementById('compOverlay').style.display = 'none';
      document.getElementById('compDrop').classList.remove('has-image');
      document.getElementById('compControls').style.display = 'none';
      document.getElementById('compStats').style.display = 'none';
      document.getElementById('compOutput').style.display = 'none';
      document.getElementById('compInput').value = '';
    }
    if (tool === 'crop') {
      cropImgEl = null;
      document.getElementById('cropPlaceholder').style.display = 'flex';
      document.getElementById('cropDrop').style.display = 'flex';
      document.getElementById('cropEditor').style.display = 'none';
      document.getElementById('cropInput').value = '';
    }
    if (tool === 'rotate') {
      rotImg = null; rotateDeg = 0;
      document.getElementById('rotatePlaceholder').style.display = 'flex';
      document.getElementById('rotateDrop').style.display = 'flex';
      document.getElementById('rotateEditor').style.display = 'none';
      document.getElementById('rotateInput').value = '';
    }
    if (tool === 'convert') {
      convertImg = null; convertOrigFile = null;
      document.getElementById('convertPlaceholder').style.display = 'flex';
      document.getElementById('convertDrop').style.display = 'flex';
      document.getElementById('convertEditor').style.display = 'none';
      document.getElementById('convertInput').value = '';
    }
    if (tool === 'watermark') {
      wmImg = null;
      document.getElementById('wmPlaceholder').style.display = 'flex';
      document.getElementById('wmDrop').style.display = 'flex';
      document.getElementById('wmEditor').style.display = 'none';
      document.getElementById('wmInput').value = '';
    }
  }

  return {
    toast, fmtBytes, switchTab,
    dzDrag, dzLeave, dzDrop,
    loadCompressImg, updateQualLabel, updateMaxWLabel, updateCompPreview, downloadCompressed,
    loadCropImg, bindCropEvents, cropDown, cropMove, cropUp, resetCropSelection, applyCrop, downloadCropped,
    loadRotateImg, renderRotate, applyRotate, applyFlip, downloadRotated,
    loadConvertImg, updateConvertQualLabel, updateConvertPreview, downloadConverted,
    loadWmImg, updateWmSizeLabel, updateWmOpLabel, updateWmRotLabel, updateWmPreview, downloadWatermarked,
    clearTool,
  };
})();

// ============================================================
//  Service Worker registration
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  });
}

// Init — start with 2 document cards
document.addEventListener('DOMContentLoaded', () => {
  addDocument();
  addDocument();
});
