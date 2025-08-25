/* =========================================================================
   FSTM — Fireside Tier Maker (Full JS)
   Changelog for this build (addresses your 9 points):
   1) PNG capture: renders a clean, full-width/height clone of the board that
      looks identical on Desktop/iPad/Android/iPhone; title only included if set.
   2) Tier labels: keep the label box fixed, auto-shrink text as characters grow;
      never expands the rounded color box.
   3) Clarify editability and add a nested × delete for each row (Undo supported).
   4) Title omitted from PNG if empty.
   5) Tier label boxes are made more colorful via JS inline styles.
   6) Tools at top are removed; only the bottom toolbar is active.
   7) Help panel is always open and device-specific.
   8) Mobile radial picker: smaller, higher contrast, opens on every circle tap,
      closes on outside tap, works from storage or rows.
   9) Pre-rendered storage circles seeded once with unique colors for your names.
   ========================================================================= */

(() => {
  const QS = (s, el = document) => el.querySelector(s);
  const QSA = (s, el = document) => [...el.querySelectorAll(s)];

  // DOM references
  const boardEl = QS('#tier-board');
  const storageGrid = QS('#storage-grid');
  const titleEl = QS('#board-title');
  const titleEditBtn = QS('#title-edit');
  const addTierBtn = QS('#btn-add-tier-2');
  const undoBtn = QS('#btn-undo-2');
  const saveBtn = QS('#btn-save-2');
  const clearBtn = QS('#btn-clear-2');
  const themeBtn = QS('#btn-theme-2');
  const confirmClearDlg = QS('#confirm-clear');
  const hardResetBtn = QS('#btn-hard-reset');
  const radial = QS('#radial');

  const creatorForm = QS('#circle-creator');
  const ccText = QS('#cc-text');
  const ccColor = QS('#cc-color');
  const fileInput = QS('#file-input');
  const captureArea = QS('#capture-area');

  // Remove the header tool strip — buttons should only exist under the board
  QS('.quick-actions')?.remove();

  // Constants
  const STORE_KEY = 'FSTM_STATE_v2';
  const THEME_KEY = 'FSTM_THEME_v1';

  // Default tier letters
  const DEFAULT_LABELS = ['S', 'A', 'B', 'C', 'D'];

  // Bright label colors (more colorful than CSS defaults)
  const LABEL_COLORS = {
    S: '#E64E4E', // red
    A: '#F0922A', // orange
    B: '#F4D13A', // yellow
    C: '#58C39A', // green
    D: '#7C9EFF'  // blue
  };

  // Pre-seeded names with unique colors
  const SEEDED_NAMES = [
    'Anette','Authority','B7','Cindy','Clamy','Clay','Cody','Denver','Devon','Dexy','Domo',
    'Gavin','Jay','Jeremy','Katie','Keyon','Kiev','Kikki','Kyle','Lewis','Meegan','Munch',
    'Paper','Ray','Safoof','Temz','TomTom','V','Versse','Wobbles','Xavier'
  ];

  // State & Undo
  let state = null;
  let undoStack = [];

  // Helpers
  const isMobile = () => matchMedia('(max-width: 720px)').matches;
  const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 10)}`;
  const debounced = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const saveLocal = debounced(() => localStorage.setItem(STORE_KEY, JSON.stringify(state)), 250);
  const loadLocal = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch { return null; } };
  const pushUndo = () => { undoStack.push(JSON.stringify(state)); if (undoStack.length > 60) undoStack.shift(); setUndoEnabled(true); };
  const setUndoEnabled = on => { undoBtn.disabled = !on; };

  const applyTheme = t => { document.documentElement.setAttribute('data-theme', t); localStorage.setItem(THEME_KEY, t); };

  // ---------- Model ----------
  // state = {
  //   title: "",
  //   tiers: [{id, label, items:[itemId,...]}],
  //   items: {itemId: {id,type:'text'|'image',text?,color?,dataUrl?}},
  //   storage: [itemId,...]
  // }

  const newDefaultState = () => ({ title: "", tiers: DEFAULT_LABELS.map(l => ({ id: uid('tier'), label: l, items: [] })), items: {}, storage: [] });

  function seedNamesIfEmpty() {
    if (state.storage.length || Object.keys(state.items).length) return;
    const n = SEEDED_NAMES.length;
    const golden = 137.508; // golden angle for pleasing spread
    for (let i = 0; i < n; i++) {
      const h = (i * golden) % 360;
      const s = 68;
      const l = 52;
      const color = `hsl(${Math.round(h)} ${s}% ${l}%)`;
      const id = uid('item');
      state.items[id] = { id, type: 'text', text: SEEDED_NAMES[i], color };
      state.storage.push(id);
    }
  }

  // ---------- Render ----------
  function renderAll() {
    renderTitle();
    renderBoard();
    renderStorage();
    initSortables();
    saveLocal();
  }

  function renderTitle() {
    titleEl.textContent = state.title || '';
  }

  function renderBoard() {
    boardEl.innerHTML = '';
    state.tiers.forEach((tier) => {
      const row = document.createElement('div');
      row.className = 'tier-row';
      row.dataset.tierId = tier.id;
      row.dataset.label = tier.label;

      // Label (fixed width) + edit + delete ×
      const label = document.createElement('div');
      label.className = 'tier-label';
      // make boxes more colorful
      const vivid = LABEL_COLORS[(tier.label || '').trim().toUpperCase()] || '#8A8FAA';
      label.style.background = vivid;

      const letter = document.createElement('div');
      letter.className = 'tier-letter';
      letter.contentEditable = 'true';
      letter.setAttribute('role', 'textbox');
      letter.setAttribute('aria-label', 'Tier label (editable)');
      letter.title = 'Tap to edit label. Click × to delete this row.';
      letter.textContent = tier.label;

      // Prevent expanding the rounded label box
      letter.style.whiteSpace = 'nowrap';
      letter.style.overflow = 'hidden';
      letter.style.textOverflow = 'ellipsis';

      autoFitTierLabel(letter);

      letter.addEventListener('input', () => {
        const newVal = (letter.textContent || '').replace(/\s+/g, '').slice(0, 12);
        letter.textContent = newVal || '?';
        autoFitTierLabel(letter);
        pushUndo();
        tier.label = letter.textContent;
        row.dataset.label = tier.label;
        // Repaint vivid color when label changes
        const vivid2 = LABEL_COLORS[(tier.label || '').trim().toUpperCase()] || vivid;
        label.style.background = vivid2;
        // Update radial (if open)
        if (radial.classList.contains('open')) buildRadialButtons();
        saveLocal();
      });

      // Nested delete ×
      const del = document.createElement('button');
      del.type = 'button';
      del.setAttribute('aria-label', 'Delete this tier row');
      del.title = 'Delete row';
      del.textContent = '×';
      Object.assign(del.style, {
        position: 'absolute', right: '6px', top: '6px', width: '22px', height: '22px',
        borderRadius: '999px', border: '1px solid rgba(0,0,0,.25)', background: 'rgba(255,255,255,.15)',
        color: '#fff', fontWeight: '900', cursor: 'pointer', display: 'grid', placeItems: 'center',
      });
      del.addEventListener('click', () => {
        pushUndo();
        // Move items back to storage to avoid data loss
        tier.items.forEach(id => state.storage.push(id));
        state.tiers = state.tiers.filter(t => t.id !== tier.id);
        renderAll();
      });

      label.appendChild(letter);
      label.appendChild(del);
      row.appendChild(label);

      // Items area
      const itemsWrap = document.createElement('div');
      itemsWrap.className = 'tier-items droplist';
      itemsWrap.dataset.tierId = tier.id;

      tier.items.forEach(id => itemsWrap.appendChild(renderCircle(state.items[id])));

      row.appendChild(itemsWrap);
      boardEl.appendChild(row);
    });
  }

  function renderStorage() {
    storageGrid.innerHTML = '';
    state.storage.forEach(id => storageGrid.appendChild(renderCircle(state.items[id])));
  }

  function renderCircle(item) {
    const el = document.createElement('div');
    el.className = 'circle';
    el.dataset.itemId = item.id;
    el.setAttribute('role', 'listitem');

    if (item.type === 'text') {
      el.style.background = item.color || 'var(--panel)';
      const t = document.createElement('div');
      t.className = 'circle-text';
      t.textContent = item.text;
      fitTextInCircle(t);
      el.appendChild(t);
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'circle-img';
      const img = document.createElement('img');
      img.alt = 'Uploaded circle image';
      img.src = item.dataUrl;
      wrap.appendChild(img);
      el.appendChild(wrap);
    }

    // Mobile radial picker: open on tap/click anywhere (storage or rows)
    el.addEventListener('click', (ev) => {
      if (!isMobile()) return;
      ev.stopPropagation();
      openRadialForCircle(ev, el);
    });

    return el;
  }

  function autoFitTierLabel(letterEl) {
    const txt = letterEl.textContent || '';
    const len = txt.length || 1;
    // Big single letter; shrink progressively as characters grow
    const px = len === 1 ? 72 : len <= 2 ? 56 : len <= 3 ? 48 : len <= 5 ? 38 : len <= 8 ? 30 : 24;
    letterEl.style.setProperty('--fit', `${px}px`);
    letterEl.style.fontSize = `${px}px`;
  }

  function fitTextInCircle(textEl) {
    const txt = (textEl.textContent || '').trim();
    let size = 18;
    if (txt.length <= 2) size = 28;
    else if (txt.length <= 5) size = 24;
    else if (txt.length <= 10) size = 20;
    else if (txt.length <= 16) size = 18;
    else size = 16;
    textEl.style.fontSize = `${size}px`;
  }

  // ---------- Sortable (drag) ----------
  let sortables = [];
  function initSortables() {
    sortables.forEach(s => s.destroy());
    sortables = [];

    const options = {
      group: 'fstm',
      animation: 120,
      ghostClass: 'dragging',
      dragClass: 'dragging',
      forceFallback: true,
      fallbackOnBody: true,
      touchStartThreshold: 4,
      delayOnTouchOnly: true,
      delay: 0,
      onEnd: handleSortEnd
    };

    QSA('.tier-items').forEach(el => sortables.push(new Sortable(el, options)));
    sortables.push(new Sortable(storageGrid, options));
  }

  function handleSortEnd() {
    pushUndo();
    rebuildStateFromDOM();
    saveLocal();
  }

  function rebuildStateFromDOM() {
    const newTiers = state.tiers.map(t => ({ id: t.id, label: t.label, items: [] }));
    const idx = Object.fromEntries(state.tiers.map((t, i) => [t.id, i]));
    QSA('.tier-items').forEach(wrap => {
      const tid = wrap.dataset.tierId;
      newTiers[idx[tid]].items = QSA('.circle', wrap).map(c => c.dataset.itemId);
    });
    state.tiers = newTiers;
    state.storage = QSA('.circle', storageGrid).map(c => c.dataset.itemId);
  }

  // ---------- Title editing ----------
  titleEditBtn.addEventListener('click', () => toggleTitleEdit());
  titleEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); toggleTitleEdit(false); }
  });
  titleEl.addEventListener('blur', () => {
    if (titleEl.getAttribute('contenteditable') === 'true') toggleTitleEdit(false);
  });

  function toggleTitleEdit(forceOff) {
    const editing = titleEl.getAttribute('contenteditable') === 'true';
    if (!editing && forceOff !== false) {
      titleEl.setAttribute('contenteditable', 'true');
      titleEl.focus();
      placeCaretAtEnd(titleEl);
    } else {
      titleEl.setAttribute('contenteditable', 'false');
      pushUndo();
      state.title = (titleEl.textContent || '').trim();
      saveLocal();
    }
  }

  function placeCaretAtEnd(el) {
    const range = document.createRange();
    range.selectNodeContents(el); range.collapse(false);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  }

  // ---------- Creator & Upload ----------
  creatorForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = ccText.value.trim();
    if (!text) return;
    pushUndo();
    const id = uid('item');
    state.items[id] = { id, type: 'text', text, color: ccColor.value };
    state.storage.unshift(id);
    ccText.value = '';
    renderStorage(); initSortables(); saveLocal();
  });

  fileInput.addEventListener('change', async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    pushUndo();
    for (const f of files) {
      const dataUrl = await fileToDataURL(f);
      const id = uid('item');
      state.items[id] = { id, type: 'image', dataUrl };
      state.storage.push(id);
    }
    renderStorage(); initSortables(); saveLocal(); fileInput.value = '';
  });

  function fileToDataURL(file) {
    return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
  }

  // ---------- Toolbar ----------
  addTierBtn.addEventListener('click', () => {
    pushUndo();
    const label = suggestNextTierLabel();
    state.tiers.push({ id: uid('tier'), label, items: [] });
    renderAll();
  });

  undoBtn.addEventListener('click', () => {
    const prev = undoStack.pop();
    if (!prev) return;
    state = JSON.parse(prev);
    setUndoEnabled(undoStack.length > 0);
    renderAll();
  });

  clearBtn.addEventListener('click', () => confirmClearDlg.showModal());

  // dialog buttons (Clear vs Hard Reset)
  confirmClearDlg.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = e.submitter?.value;
    if (v === 'clear') {
      pushUndo();
      state.tiers.forEach(t => t.items = []);
      state.storage = [];
      renderAll();
      confirmClearDlg.close();
    } // 'hard' handled below
  });

  hardResetBtn.addEventListener('click', () => {
    localStorage.removeItem(STORE_KEY);
    undoStack = [];
    state = newDefaultState();
    seedNamesIfEmpty();
    renderAll();
  });

  // theme toggle (kept)
  themeBtn.addEventListener('click', () => {
    const t = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(t === 'dark' ? 'light' : 'dark');
  });

  // ---------- PNG SAVE (pixel-perfect & full board) ----------
  saveBtn.addEventListener('click', savePNG);

  async function savePNG() {
    // Build a clean, full-size clone of the capture area (title + board).
    const clone = captureArea.cloneNode(true);

    // Omit title if empty
    const cloneTitle = QS('#board-title', clone);
    const hasTitle = (titleEl.textContent || '').trim().length > 0;
    if (!hasTitle) QS('.title-wrap', clone)?.remove();

    // Remove any scrollbars and ensure full width/height render
    clone.style.position = 'fixed';
    clone.style.left = '-99999px';
    clone.style.top = '0';
    clone.style.opacity = '0';
    clone.style.pointerEvents = 'none';
    clone.style.maxWidth = 'none';
    clone.style.width = `${captureArea.scrollWidth}px`;

    // Make each items row expand to its scroll width (no clipping)
    QSA('.tier-items', clone).forEach(w => {
      w.style.overflow = 'visible';
      w.style.whiteSpace = 'normal';
      // measure original row width
      const orig = QS(`.tier-items[data-tier-id="${w.dataset.tierId}"]`, captureArea);
      if (orig) w.style.width = `${orig.scrollWidth}px`;
    });

    document.body.appendChild(clone);

    // Use a stable pixel ratio for similar look across devices
    const pixelRatio = 2;

    try {
      const dataUrl = await window.htmlToImage.toPng(clone, {
        pixelRatio,
        cacheBust: true,
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg')?.trim() || '#111',
        style: { transform: 'none' }
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `FSTM_${Date.now()}.png`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (err) {
      console.error(err);
      alert('PNG save failed. Try again after placing at least one item.');
    } finally {
      clone.remove();
    }
  }

  // ---------- Mobile Half-Radial Picker (smaller, higher contrast) ----------
  let radialTargetItemId = null;

  function openRadialForCircle(pointerEvent, circleEl) {
    radialTargetItemId = circleEl.dataset.itemId;
    buildRadialButtons();
    // size smaller than before
    const W = 180, H = 90, radius = 72;
    radial.style.width = `${W}px`;
    radial.style.height = `${H}px`;
    radial.style.setProperty('--radial-w', `${W}px`);
    radial.style.setProperty('--radial-h', `${H}px`);

    // position above tap, clamped to viewport
    let x = pointerEvent.clientX, y = pointerEvent.clientY;
    let left = Math.max(8, Math.min(x - W / 2, window.innerWidth - W - 8));
    let top = Math.max(8, Math.min(y - (H + 12), window.innerHeight - H - 8));
    radial.style.transform = `translate(${left}px, ${top}px)`;
    radial.classList.add('open');
    radial.setAttribute('aria-hidden', 'false');

    // Outside click closes it
    const onDoc = (ev) => { if (!radial.contains(ev.target)) closeRadial(); };
    // close on scroll as well
    const onScroll = () => closeRadial();
    setTimeout(() => {
      document.addEventListener('click', onDoc, { once: true, capture: true });
      document.addEventListener('scroll', onScroll, { once: true, capture: true });
    }, 0);
  }

  function buildRadialButtons() {
    radial.innerHTML = '';
    const tiers = state.tiers.slice(); // preserve order S..A..B..C..D..
    const W = parseInt(radial.style.width || 180, 10);
    const H = parseInt(radial.style.height || 90, 10);
    const radius = Math.min(W * 0.4, 72);
    const cx = W / 2, cy = H; // hinge at bottom center

    const n = Math.max(1, tiers.length);
    tiers.forEach((t, i) => {
      const angle = Math.PI - (i * (Math.PI / (n - 1 || 1)));
      const x = cx + radius * Math.cos(angle);
      const y = cy - radius * Math.sin(angle);
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = (t.label || '?').slice(0, 2).toUpperCase();
      Object.assign(b.style, {
        left: `${x}px`, top: `${y}px`,
        background: 'rgba(255,255,255,.12)',
        borderColor: 'rgba(255,255,255,.35)',
        color: '#fff',
      });
      b.addEventListener('click', () => {
        placeRadialTargetIntoTier(t.id);
      });
      radial.appendChild(b);
    });
  }

  function closeRadial() {
    radialTargetItemId = null;
    radial.classList.remove('open');
    radial.setAttribute('aria-hidden', 'true');
    radial.style.transform = 'translate(-9999px, -9999px)';
  }

  function placeRadialTargetIntoTier(tierId) {
    if (!radialTargetItemId) return;
    pushUndo();

    // Remove from storage or any tier it may already be in
    state.storage = state.storage.filter(id => id !== radialTargetItemId);
    state.tiers.forEach(t => t.items = t.items.filter(id => id !== radialTargetItemId));

    // Insert at end of chosen tier
    const tier = state.tiers.find(t => t.id === tierId);
    if (tier) tier.items.push(radialTargetItemId);

    closeRadial();
    renderBoard(); renderStorage(); initSortables(); saveLocal();
  }

  // ---------- Help panel: always open & device-specific ----------
  function updateHelpForDevice() {
    const det = QS('.help details');
    if (det) det.open = true;
    const list = QS('.help ul');
    if (!list) return;

    const mobileTips = [
      '<strong>Tap any circle</strong> to open the half-radial picker. Tap a letter to place it. Tap outside to dismiss.',
      '<strong>Drag to reorder</strong> within a row. You can also drag between rows or back to Storage.',
      '<strong>Labels are editable</strong>: tap the big S/A/B/C/D. Use the × to delete a row (Undo supported).',
      '<strong>PNG</strong> captures the full board (and title if set).',
      '<strong>Autosave</strong>: your work is stored locally. Use Clear → Hard Reset to wipe it.'
    ];

    const desktopTips = [
      '<strong>Drag and drop</strong> between rows and Storage. Reorder inside a row easily.',
      '<strong>On phones</strong>, a half-radial picker appears for quick placement. (You can still drag.)',
      '<strong>Edit labels</strong> by clicking S/A/B/C/D; × deletes the row (Undo supported).',
      '<strong>PNG</strong> captures the full board (and title if set).',
      '<strong>Autosave</strong> persists your work until you Hard Reset.'
    ];

    list.innerHTML = (isMobile() ? mobileTips : desktopTips).map(li => `<li>${li}</li>`).join('');
  }

  // ---------- Utilities ----------
  function suggestNextTierLabel() {
    const labels = state.tiers.map(t => t.label.toUpperCase());
    for (let code = 69; code <= 90; code++) { // E..Z
      const ch = String.fromCharCode(code);
      if (!labels.includes(ch)) return ch;
    }
    return 'NEW';
  }

  // Prevent page scroll while dragging
  document.addEventListener('touchmove', (e) => {
    const dragging = document.querySelector('.dragging');
    if (dragging) e.preventDefault();
  }, { passive: false });

  // ---------- Init ----------
  function init() {
    // Theme
    applyTheme(localStorage.getItem(THEME_KEY) || 'dark');

    // Load state, seed if empty
    state = loadLocal() || newDefaultState();
    if (!loadLocal()) seedNamesIfEmpty();

    // Make help device-specific & always open
    updateHelpForDevice();
    window.addEventListener('resize', debounced(updateHelpForDevice, 150));

    renderAll();

    // Undo availability
    setUndoEnabled(false);
  }

  init();
})();