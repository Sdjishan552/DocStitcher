/* ============================================================
   DocStitcher i18n — English / Bengali
   v1.0  —  drop this file before app.js in index.html
============================================================ */

const I18N = {
  en: {
    /* ---- Brand / Header ---- */
    brandName:       'Document Stitcher 7.0',
    brandTagline:    'A4 PDF maker · PDF/JPG/PNG output · No uploads · 100% local',
    helpBtn:         'Help',
    langBtnLabel:    'বাংলা',

    /* ---- Help panel ---- */
    helpTitle:  'How to use',
    helpStep1:  'Add a two-sided or one-sided document card using the buttons below.',
    helpStep2:  'Upload front (and back for two-sided). PDFs are auto-converted to images.',
    helpStep3:  'Enable the signature checkbox to add a signature image. Use the 🎯 Place Signature button to position it precisely using arrow keys (hold Shift for bigger steps).',
    helpStep4:  'Click Download and choose PDF, JPG, or PNG output format.',
    helpStep5:  'Use Single-Doc Tools (bottom right) to crop, rotate, flip, compress and convert any image or PDF all at once before sending it here.',

    /* ---- Batch toolbar ---- */
    sectionDocuments: 'Documents',
    toolbarSub:       ' ready · A4 · PDF / JPG / PNG output',
    btnTwoSided:      '+ Two-Sided',
    btnOneSided:      '+ One-Sided',
    btnDownloadAll:   'Download All',

    /* ---- Document card ---- */
    typeLabelTwoSided: 'A4 PDF',
    typeLabelOneSided: 'ONE-SIDED PDF',
    docNameAria:       'Document name',
    removeTitle:       'Remove',
    labelOrientation:  'Orientation',
    optPortrait:       'Portrait',
    optLandscape:      'Landscape',
    labelQuality:      'Quality',
    targetSizePlaceholder: 'Target KB',
    btnSet:            'Set',
    labelDownloadSize: 'Download size',
    previewClickHint:  'click to enlarge',
    previewAltReady:   'Click to preview',
    previewAltWait:    'Upload images to preview',
    sigToggle:         'Add signature image (with keyboard placement)',
    btnDownload:       'Download',
    btnPreview:        'Preview',
    btnClearImages:    'Clear Images',
    btnPlaceSign:      '🎯 Place Signature',

    /* ---- Signature controls ---- */
    labelSigSize: 'Signature size',
    signPresetSmall:  'Small',
    signPresetNormal: 'Normal',
    signPresetLarge:  'Large',
    signPresetXL:     'X-Large',
    signOffsetLabel:  'Position:',
    btnResetOffset:   'Reset',

    /* ---- Slot labels ---- */
    slotFront:        'Front side',
    slotBack:         'Back side',
    slotSign:         'Signature',
    slotBadgeFront:   'FRONT',
    slotBadgeBack:    'BACK',
    dropClickOrDrag:  'Click or drag here',
    dropOptional:     'Optional signature',
    hintImagePdf:     'JPG, PNG, WebP or PDF',
    hintImageOnly:    'JPG, PNG, WebP',
    btnRemoveSlot:    'Remove',
    btnViewSlot:      'View',
    noSignature:      'No signature',
    slotRequired:     'Required',

    /* ---- Estimate texts ---- */
    estimateCalculating: 'Calculating...',
    estimatePending:     'Pending',
    estimateAddFront:    'Add front image',
    estimateAddBoth:     'Add front and back',

    /* ---- Download picker modal ---- */
    dlPickerTitle:  'Choose download format',
    dlPickerAllTitle: 'Choose format for all downloads',
    dlFmtPdfSub:    'A4 print-ready',
    dlFmtJpgSub:    'Smaller file size',
    dlFmtPngSub:    'Lossless quality',
    btnCancel:      'Cancel',

    /* ---- Signature placer modal ---- */
    sigPlacerTitle: '🎯 Place Signature with Arrow Keys',
    sigPlacerHint:  '← → ↑ ↓ to move · Shift + arrows = bigger steps · Enter to confirm · Esc to cancel',
    sigPlacerPos:   'Position:',
    btnConfirmPlacement: '✓ Confirm Placement',

    /* ---- SDT page ---- */
    btnBackToStitcher: 'Back to Stitcher',
    sdtBadge:          'Single-Doc Tools',
    sdtPageTitle:      'Single-Side Tools',
    sdtPageSub:        'Edit image or PDF: crop, rotate, flip, compress, convert — all at once. 100% local.',
    tabMultiTool:      '✨ Multi-Tool Editor',
    tabWatermark:      'Watermark',
    mtCardTitle:       'Multi-Tool Image / PDF Editor',
    mtCardSub:         'Upload one image or PDF and apply crop, rotate, flip, compress & convert — all in one place.',
    mtDropLabel:       'Click or drag image / PDF here',
    mtDropHint:        'JPG, PNG, WebP, PDF supported',
    labelRotateFlip:   'Rotate & Flip',
    btnRotateL:        '↺ 90° Left',
    btnRotateR:        '↻ 90° Right',
    btnRotate180:      '↕ 180°',
    btnFlipH:          '⇆ Flip H',
    btnFlipV:          '⇅ Flip V',
    labelCrop:         'Crop — drag on the image below to select area',
    btnApplyCrop:      '✂ Apply Crop',
    btnClearCrop:      'Clear Crop',
    labelCompressConvert: 'Compress & Convert',
    labelOutputFmt:    'Output Format',
    labelQualMt:       'Quality',
    labelMaxWidth:     'Max Width',
    labelPreviewOut:   'Output Preview',
    btnDownloadMt:     'Download',
    btnSendToStitcher: 'Send to Stitcher',
    btnClearMt:        'Clear',
    wmCardTitle:       'Text Watermark',
    wmDropLabel:       'Click or drag image here',
    wmDropHint:        'Add a custom text watermark',
    labelWmText:       'Watermark Text',
    labelWmPos:        'Position',
    wmPosCenter:       'Center',
    wmPosTile:         'Tiled',
    wmPosTopLeft:      'Top Left',
    wmPosTopRight:     'Top Right',
    wmPosBotLeft:      'Bottom Left',
    wmPosBotRight:     'Bottom Right',
    labelWmSize:       'Font Size',
    labelWmOp:         'Opacity',
    labelWmRot:        'Rotation',
    labelWmColor:      'Colour',
    wmColorPick:       'Pick colour',
    labelWmPreview:    'Preview',
    btnDownloadWm:     'Download',
    btnSendWmToStitcher: 'Send to Stitcher',
    btnClearWm:        'Clear',

    /* ---- Slot picker ---- */
    slotPickerTitle:   'Send to document card',
    slotPickerAddNew:  'Add new document',
    slotBtnFront:      'Front',
    slotBtnBack:       'Back',
    slotBtnSign:       'Sign',

    /* ---- Toast messages (JS) ---- */
    toastKeepOne:        'Keep at least one document card.',
    toastSignSaved:      'Signature position saved!',
    toastSignOnlyImg:    'Signature must be an image (JPG/PNG/WebP).',
    toastSelectImg:      'Please select JPG, PNG, WebP or PDF.',
    toastPdfConverting:  'Converting PDF page to image...',
    toastPdfConverted:   'PDF page converted!',
    toastPdfError:       'Could not read PDF. Try a JPG/PNG instead.',
    toastImageError:     'Could not read image.',
    toastUploadFirst:    'Upload required images first.',
    toastUploadImgFirst: 'Upload images first.',
    toastRangeKb:        'Enter 20–10240 KB.',
    toastDownloading:    'Downloading ',
    toastDownloadFail:   'Download failed: ',
    toastNoReady:        'No ready documents.',
    toastStarted:        'Started ',
    toastDownloads:      ' downloads.',
    toastDownloadError:  'Download error: ',
    toastSentTo:         'Sent to ',
    toastNewDocCreated:  'Created new document card.',
    toastSelectImgSdt:   'Select an image or PDF.',
    toastPdfConvertFirst: 'Converting PDF first...',
    toastPdfConvertError: 'Could not convert PDF.',
    toastCropApplied:    'Crop applied!',
    toastReset:          'Reset!',
    toastDownloaded:     'Downloaded!',
    toastSelectImgWm:    'Select an image.',
    toastPdfLibNotLoaded: 'PDF library not loaded',
    toastQualitySet:     'Quality set to ',
    toastOccupied:       ' is occupied.',
    toastGenerateFirst:  'Generate output first.',
    toastReadyCount:     ' ready',
  },

  bn: {
    /* ---- Brand / Header ---- */
    brandName:       'ডকুমেন্ট স্টিচার ৭.০',
    brandTagline:    'A4 PDF নির্মাতা · PDF/JPG/PNG আউটপুট · কোনো আপলোড নেই · ১০০% স্থানীয়',
    helpBtn:         'সহায়তা',
    langBtnLabel:    'English',

    /* ---- Help panel ---- */
    helpTitle:  'কীভাবে ব্যবহার করবেন',
    helpStep1:  'নিচের বোতাম দিয়ে দ্বি-পার্শ্বীয় বা এক-পার্শ্বীয় ডকুমেন্ট কার্ড যোগ করুন।',
    helpStep2:  'সামনের ছবি (এবং দ্বি-পার্শ্বীয়ের জন্য পিছনের ছবি) আপলোড করুন। PDF স্বয়ংক্রিয়ভাবে ছবিতে রূপান্তরিত হবে।',
    helpStep3:  'স্বাক্ষর ছবি যোগ করতে চেকবক্সটি চালু করুন। সঠিক অবস্থানের জন্য 🎯 স্বাক্ষর স্থাপন বোতাম ব্যবহার করুন (বড় পদক্ষেপের জন্য Shift চেপে ধরুন)।',
    helpStep4:  'ডাউনলোড বোতামে ক্লিক করুন এবং PDF, JPG, বা PNG ফরম্যাট বেছে নিন।',
    helpStep5:  'যেকোনো ছবি বা PDF ক্রপ, ঘোরানো, উল্টানো, সংকোচন ও রূপান্তর করতে একক-ডক টুলস (নিচে ডানে) ব্যবহার করুন।',

    /* ---- Batch toolbar ---- */
    sectionDocuments: 'ডকুমেন্টসমূহ',
    toolbarSub:       ' প্রস্তুত · A4 · PDF / JPG / PNG আউটপুট',
    btnTwoSided:      '+ দ্বি-পার্শ্বীয়',
    btnOneSided:      '+ এক-পার্শ্বীয়',
    btnDownloadAll:   'সব ডাউনলোড করুন',

    /* ---- Document card ---- */
    typeLabelTwoSided: 'A4 PDF',
    typeLabelOneSided: 'এক-পার্শ্বীয় PDF',
    docNameAria:       'ডকুমেন্টের নাম',
    removeTitle:       'মুছুন',
    labelOrientation:  'অভিমুখ',
    optPortrait:       'পোর্ট্রেট',
    optLandscape:      'ল্যান্ডস্কেপ',
    labelQuality:      'মান',
    targetSizePlaceholder: 'লক্ষ্য KB',
    btnSet:            'নির্ধারণ',
    labelDownloadSize: 'ডাউনলোড সাইজ',
    previewClickHint:  'বড় করতে ক্লিক করুন',
    previewAltReady:   'প্রিভিউ দেখতে ক্লিক করুন',
    previewAltWait:    'প্রিভিউ দেখতে ছবি আপলোড করুন',
    sigToggle:         'স্বাক্ষর ছবি যোগ করুন (কীবোর্ড দিয়ে স্থাপন সহ)',
    btnDownload:       'ডাউনলোড',
    btnPreview:        'প্রিভিউ',
    btnClearImages:    'ছবি মুছুন',
    btnPlaceSign:      '🎯 স্বাক্ষর স্থাপন',

    /* ---- Signature controls ---- */
    labelSigSize: 'স্বাক্ষরের আকার',
    signPresetSmall:  'ছোট',
    signPresetNormal: 'স্বাভাবিক',
    signPresetLarge:  'বড়',
    signPresetXL:     'অতি বড়',
    signOffsetLabel:  'অবস্থান:',
    btnResetOffset:   'পুনরায় সেট',

    /* ---- Slot labels ---- */
    slotFront:        'সামনের দিক',
    slotBack:         'পেছনের দিক',
    slotSign:         'স্বাক্ষর',
    slotBadgeFront:   'সামনে',
    slotBadgeBack:    'পেছনে',
    dropClickOrDrag:  'এখানে ক্লিক বা টেনে আনুন',
    dropOptional:     'ঐচ্ছিক স্বাক্ষর',
    hintImagePdf:     'JPG, PNG, WebP বা PDF',
    hintImageOnly:    'JPG, PNG, WebP',
    btnRemoveSlot:    'সরান',
    btnViewSlot:      'দেখুন',
    noSignature:      'কোনো স্বাক্ষর নেই',
    slotRequired:     'আবশ্যক',

    /* ---- Estimate texts ---- */
    estimateCalculating: 'গণনা হচ্ছে...',
    estimatePending:     'অপেক্ষারত',
    estimateAddFront:    'সামনের ছবি যোগ করুন',
    estimateAddBoth:     'সামনে ও পেছনের ছবি যোগ করুন',

    /* ---- Download picker modal ---- */
    dlPickerTitle:    'ডাউনলোড ফরম্যাট বেছে নিন',
    dlPickerAllTitle: 'সব ডাউনলোডের ফরম্যাট বেছে নিন',
    dlFmtPdfSub:      'A4 প্রিন্ট-রেডি',
    dlFmtJpgSub:      'ছোট ফাইল সাইজ',
    dlFmtPngSub:      'ক্ষতিহীন মান',
    btnCancel:        'বাতিল',

    /* ---- Signature placer modal ---- */
    sigPlacerTitle: '🎯 তীর কী দিয়ে স্বাক্ষর স্থাপন করুন',
    sigPlacerHint:  '← → ↑ ↓ সরাতে · Shift + তীর = বড় পদক্ষেপ · Enter নিশ্চিত করতে · Esc বাতিল করতে',
    sigPlacerPos:   'অবস্থান:',
    btnConfirmPlacement: '✓ স্থান নিশ্চিত করুন',

    /* ---- SDT page ---- */
    btnBackToStitcher: 'স্টিচারে ফিরুন',
    sdtBadge:          'একক-ডক টুলস',
    sdtPageTitle:      'একক-দিক টুলস',
    sdtPageSub:        'ছবি বা PDF সম্পাদনা করুন: ক্রপ, ঘোরান, উল্টান, সংকোচন, রূপান্তর — সব একসাথে। ১০০% স্থানীয়।',
    tabMultiTool:      '✨ মাল্টি-টুল এডিটর',
    tabWatermark:      'ওয়াটারমার্ক',
    mtCardTitle:       'মাল্টি-টুল ছবি / PDF এডিটর',
    mtCardSub:         'একটি ছবি বা PDF আপলোড করুন এবং ক্রপ, ঘোরানো, উল্টানো, সংকোচন ও রূপান্তর — সব একসাথে প্রয়োগ করুন।',
    mtDropLabel:       'ছবি / PDF এখানে ক্লিক বা টেনে আনুন',
    mtDropHint:        'JPG, PNG, WebP, PDF সমর্থিত',
    labelRotateFlip:   'ঘোরান ও উল্টান',
    btnRotateL:        '↺ ৯০° বামে',
    btnRotateR:        '↻ ৯০° ডানে',
    btnRotate180:      '↕ ১৮০°',
    btnFlipH:          '⇆ অনুভূমিক উল্টান',
    btnFlipV:          '⇅ উল্লম্ব উল্টান',
    labelCrop:         'ক্রপ — নিচের ছবিতে টেনে এলাকা নির্বাচন করুন',
    btnApplyCrop:      '✂ ক্রপ প্রয়োগ',
    btnClearCrop:      'ক্রপ মুছুন',
    labelCompressConvert: 'সংকোচন ও রূপান্তর',
    labelOutputFmt:    'আউটপুট ফরম্যাট',
    labelQualMt:       'মান',
    labelMaxWidth:     'সর্বোচ্চ প্রস্থ',
    labelPreviewOut:   'আউটপুট প্রিভিউ',
    btnDownloadMt:     'ডাউনলোড',
    btnSendToStitcher: 'স্টিচারে পাঠান',
    btnClearMt:        'মুছুন',
    wmCardTitle:       'টেক্সট ওয়াটারমার্ক',
    wmDropLabel:       'এখানে ছবি ক্লিক বা টেনে আনুন',
    wmDropHint:        'কাস্টম টেক্সট ওয়াটারমার্ক যোগ করুন',
    labelWmText:       'ওয়াটারমার্ক টেক্সট',
    labelWmPos:        'অবস্থান',
    wmPosCenter:       'কেন্দ্র',
    wmPosTile:         'টাইলড',
    wmPosTopLeft:      'উপরে বামে',
    wmPosTopRight:     'উপরে ডানে',
    wmPosBotLeft:      'নিচে বামে',
    wmPosBotRight:     'নিচে ডানে',
    labelWmSize:       'ফন্ট সাইজ',
    labelWmOp:         'অস্বচ্ছতা',
    labelWmRot:        'ঘূর্ণন',
    labelWmColor:      'রঙ',
    wmColorPick:       'রঙ বাছুন',
    labelWmPreview:    'প্রিভিউ',
    btnDownloadWm:     'ডাউনলোড',
    btnSendWmToStitcher: 'স্টিচারে পাঠান',
    btnClearWm:        'মুছুন',

    /* ---- Slot picker ---- */
    slotPickerTitle:   'ডকুমেন্ট কার্ডে পাঠান',
    slotPickerAddNew:  'নতুন ডকুমেন্ট যোগ করুন',
    slotBtnFront:      'সামনে',
    slotBtnBack:       'পেছনে',
    slotBtnSign:       'স্বাক্ষর',

    /* ---- Toast messages (JS) ---- */
    toastKeepOne:        'অন্তত একটি ডকুমেন্ট কার্ড রাখুন।',
    toastSignSaved:      'স্বাক্ষরের অবস্থান সংরক্ষিত!',
    toastSignOnlyImg:    'স্বাক্ষর অবশ্যই ছবি হতে হবে (JPG/PNG/WebP)।',
    toastSelectImg:      'অনুগ্রহ করে JPG, PNG, WebP বা PDF নির্বাচন করুন।',
    toastPdfConverting:  'PDF পৃষ্ঠা ছবিতে রূপান্তর করা হচ্ছে...',
    toastPdfConverted:   'PDF পৃষ্ঠা রূপান্তরিত!',
    toastPdfError:       'PDF পড়া যায়নি। JPG/PNG চেষ্টা করুন।',
    toastImageError:     'ছবি পড়া যায়নি।',
    toastUploadFirst:    'আগে প্রয়োজনীয় ছবি আপলোড করুন।',
    toastUploadImgFirst: 'আগে ছবি আপলোড করুন।',
    toastRangeKb:        '২০–১০২৪০ KB লিখুন।',
    toastDownloading:    'ডাউনলোড হচ্ছে ',
    toastDownloadFail:   'ডাউনলোড ব্যর্থ: ',
    toastNoReady:        'কোনো প্রস্তুত ডকুমেন্ট নেই।',
    toastStarted:        'শুরু হয়েছে ',
    toastDownloads:      'টি ডাউনলোড।',
    toastDownloadError:  'ডাউনলোড ত্রুটি: ',
    toastSentTo:         'পাঠানো হয়েছে ',
    toastNewDocCreated:  'নতুন ডকুমেন্ট কার্ড তৈরি হয়েছে।',
    toastSelectImgSdt:   'একটি ছবি বা PDF নির্বাচন করুন।',
    toastPdfConvertFirst: 'PDF রূপান্তর হচ্ছে...',
    toastPdfConvertError: 'PDF রূপান্তর করা যায়নি।',
    toastCropApplied:    'ক্রপ প্রয়োগ হয়েছে!',
    toastReset:          'পুনরায় সেট!',
    toastDownloaded:     'ডাউনলোড হয়েছে!',
    toastSelectImgWm:    'একটি ছবি নির্বাচন করুন।',
    toastPdfLibNotLoaded: 'PDF লাইব্রেরি লোড হয়নি',
    toastQualitySet:     'মান নির্ধারিত হয়েছে ',
    toastOccupied:       ' ইতিমধ্যে পূর্ণ।',
    toastGenerateFirst:  'আগে আউটপুট তৈরি করুন।',
    toastReadyCount:     ' প্রস্তুত',
  },
};

/* ============================================================
   Language switcher core
============================================================ */
const Lang = (() => {
  let _current = localStorage.getItem('ds-lang') || 'en';

  function t(key) {
    return (I18N[_current] && I18N[_current][key]) || (I18N['en'][key]) || key;
  }

  function applyToDOM() {
    document.documentElement.lang = _current === 'bn' ? 'bn' : 'en';

    /* ---------- static elements by data-i18n attribute ---------- */
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const attr = el.getAttribute('data-i18n-attr');
      if (attr) {
        el.setAttribute(attr, t(key));
      } else {
        el.textContent = t(key);
      }
    });

    /* ---------- placeholders ---------- */
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      el.placeholder = t(el.getAttribute('data-i18n-ph'));
    });

    /* ---------- update language toggle button label ---------- */
    const btn = document.getElementById('langToggleBtn');
    if (btn) btn.textContent = t('langBtnLabel');

    /* ---------- re-render dynamic doc cards (uses JS strings) ---------- */
    if (typeof renderDocuments === 'function') renderDocuments();

    /* ---------- re-render slot picker if open ---------- */
    const sp = document.getElementById('slotPicker');
    if (sp && sp.style.display !== 'none' && typeof renderSlotPicker === 'function') {
      renderSlotPicker();
    }

    /* ---------- toolbar ready count ---------- */
    if (typeof updateBatchActions === 'function') updateBatchActions();
  }

  function toggle() {
    _current = _current === 'en' ? 'bn' : 'en';
    localStorage.setItem('ds-lang', _current);
    applyToDOM();
  }

  function current() { return _current; }

  /* Run on DOM ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyToDOM);
  } else {
    applyToDOM();
  }

  return { t, toggle, current, applyToDOM };
})();

/* Make t() globally accessible so app.js can call Lang.t('key') */
window.Lang = Lang;
