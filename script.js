/* FSTM — Fireside Tier Maker
   Features: responsive tiers, mobile half-radial, text/emoji circles with color,
   image uploads to circles, add tier, undo stack, clear, PNG save with title,
   dark/light theme, SVG icons, SortableJS drag without jitter, autosave via localStorage.
*/

(() => {
  const QS = (sel, el = document) => el.querySelector(sel);
  const QSA = (sel, el = document) => [...el.querySelectorAll(sel)];

  // Persistent storage key
  const STORE_KEY = 'FSTM_STATE_v1';
  const THEME_KEY = 'FSTM_THEME_v1';

  // DOM
  const boardEl = QS('#tier-board');
  const storageGrid = QS('#storage-grid');
  const titleEl = QS('#board-title');
  const titleEditBtn = QS('#title-edit');
  const addTierBtns = [QS('#btn-add-tier'), QS('#btn-add-tier-2')];
  const undoBtns = [QS('#btn-undo'), QS('#btn-undo-2')];
  const saveBtns = [QS('#btn-save'), QS('#btn-save-2')];
  const clearBtns = [QS('#btn-clear'), QS('#btn-clear-2')];
  const themeBtns = [QS('#btn-theme'), QS('#btn-theme-2')];
  const confirmClearDlg = QS('#confirm-clear');
  const hardResetBtn = QS('#btn-hard-reset');
  const radial = QS('#radial');

  const creatorForm = QS('#circle-creator');
  const ccText = QS('#cc-text');
  const ccColor = QS('#cc-color');

  const fileInput = QS('#file-input');
  const captureArea = QS('#capture-area');

  // Default tiers
  const DEFAULT_LABELS = ['S','A','B','C','D'];

  // State
  let state = null;
  let undoStack = [];

  const isMobile = () => matchMedia('(max-width: 720px)').matches;

  // Utilities
  const uid = (prefix='id') => `${prefix}_${Math.random().toString(36).slice(2,9)}`;

  const cloneState = s => JSON.parse(JSON.stringify(s));

  const pushUndo = () => {
    undoStack.push(JSON.stringify(state));
    if (undoStack.length > 50) undoStack.shift();
    setUndoEnabled(true);
  };

  const setUndoEnabled = (on) => {
    for (const b of undoBtns) b.disabled = !on;
  };

  const debounced = (fn, ms=300) => {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };

  const saveLocal = debounced(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }, 300);

  const loadLocal = () => {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  };

  const applyTheme = (t) => {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(THEME_KEY, t);
  };

  // Model shape:
  // state = {
  //   title: "",
  //   tiers: [{id, label, items:[itemId, ...]}],
  //   items: { itemId: { id, type:'text'|'image', text?, color?, dataUrl? } },
  //   storage: [itemId, ...]
  // }

  const newDefaultState = () => {
    const tiers = DEFAULT_LABELS.map(l => ({ id: uid('tier'), label: l, items: [] }));
    return { title: "", tiers, items: {}, storage: [] };
  };

  // Render
  function renderAll() {
    renderTitle();
    renderBoard();
    renderStorage();
    initAllSortables();
    saveLocal();
  }

  function renderTitle() {
    titleEl.textContent = state.title || '';
  }

  function renderBoard() {
    boardEl.innerHTML = '';
    state.tiers.forEach(tier => {
      const row = document.createElement('div');
      row.className = 'tier-row';
      row.dataset.tierId = tier.id;
      row.dataset.label = tier.label;

      const label = document.createElement('div');
      label.className = 'tier-label';

      const letter = document.createElement('div');
      letter.className = 'tier-letter';
      letter.contentEditable = 'true';
      letter.setAttribute('role','textbox');
      letter.setAttribute('aria-label', 'Tier label');
      letter.textContent = tier.label;
      autoFitTierLabel(letter);
      letter.addEventListener('input', () => {
        const newVal = letter.textContent.trim().slice(0, 12);
        letter.textContent = newVal;
        autoFitTierLabel(letter);
        pushUndo();
        tier.label = newVal || '?';
        row.dataset.label = tier.label;
        // Update radial menu if open
        if (radial.classList.contains('open')) buildRadialButtons();
        saveLocal();
      });

      label.appendChild(letter);
      row.appendChild(label);

      const itemsWrap = document.createElement('div');
      itemsWrap.className = 'tier-items droplist';
      itemsWrap.dataset.tierId = tier.id;

      tier.items.forEach(id => {
        const it = state.items[id];
        itemsWrap.appendChild(renderCircle(it));
      });

      row.appendChild(itemsWrap);
      boardEl.appendChild(row);
    });
  }

  function renderStorage() {
    storageGrid.innerHTML = '';
    state.storage.forEach(id => {
      const it = state.items[id];
      storageGrid.appendChild(renderCircle(it));
    });
  }

  function renderCircle(item) {
    const el = document.createElement('div');
    el.className = 'circle';
    el.dataset.itemId = item.id;
    el.setAttribute('role','listitem');
    el.setAttribute('aria-label', item.type === 'text' ? `Circle ${item.text}` : 'Circle image');

    if (item.type === 'text') {
      el.style.background = item.color || 'var(--panel)';
      const t = document.createElement('div');
      t.className = 'circle-text';
      t.textContent = item.text;
      fitTextInCircle(t, el);
      el.appendChild(t);
    } else if (item.type === 'image') {
      const wrap = document.createElement('div');
      wrap.className = 'circle-img';
      const img = document.createElement('img');
      img.alt = 'Uploaded circle image';
      img.src = item.dataUrl;
      wrap.appendChild(img);
      el.appendChild(wrap);
    }

    // Mobile: tap to open radial from storage only
    el.addEventListener('pointerdown', (ev) => {
      if (!isMobile()) return; // drag on desktop
      const parentIsStorage = el.parentElement === storageGrid;
      if (!parentIsStorage) return; // only from storage radial
      // Open radial
      openRadialForCircle(ev, el);
    });

    return el;
  }

  function autoFitTierLabel(letterEl) {
    const txt = letterEl.textContent || '';
    // Big single letter? Go big; otherwise shrink
    const len = txt.length || 1;
    const calc = Math.max(28, 88 - len * 6);
    letterEl.style.setProperty('--fit', `${calc}px`);
  }

  // Fit text in circle by scaling down font size based on content length
  function fitTextInCircle(textEl, circleEl) {
    const base = 18;
    const txt = textEl.textContent.trim();
    let size = base;
    if (txt.length <= 2) size = 28;
    else if (txt.length <= 5) size = 24;
    else if (txt.length <= 10) size = 20;
    else if (txt.length <= 16) size = 18;
    else size = 16;
    textEl.style.fontSize = `${size}px`;
  }

  // SortableJS init
  let sortables = [];
  function initAllSortables() {
    // Destroy existing
    sortables.forEach(s => s.destroy());
    sortables = [];

    const options = {
      group: 'fstm',
      animation: 120,
      ghostClass: 'dragging',
      dragClass: 'dragging',
      forceFallback: true,       // better on iPad/iPhone
      fallbackOnBody: true,
      touchStartThreshold: 4,
      delayOnTouchOnly: true,
      delay: 0,
      onEnd: handleSortEnd
    };

    // each row container
    QSA('.tier-items').forEach(el => sortables.push(new Sortable(el, options)));
    // storage
    sortables.push(new Sortable(storageGrid, options));
  }

  function handleSortEnd(evt) {
    // Build consistent state from DOM after any drag
    pushUndo();
    rebuildStateFromDOM();
    saveLocal();
  }

  function rebuildStateFromDOM() {
    // Read tiers and items order from DOM
    const newTiers = state.tiers.map(t => ({ id: t.id, label: t.label, items: [] }));
    const byId = Object.fromEntries(state.tiers.map((t,i)=>[t.id,i]));
    QSA('.tier-items').forEach(itemsWrap => {
      const tid = itemsWrap.dataset.tierId;
      const out = [];
      QSA('.circle', itemsWrap).forEach(c => out.push(c.dataset.itemId));
      newTiers[byId[tid]].items = out;
    });
    const storageItems = [];
    QSA('.circle', storageGrid).forEach(c => storageItems.push(c.dataset.itemId));

    state.tiers = newTiers;
    state.storage = storageItems;
  }

  // Title editing
  titleEditBtn.addEventListener('click', () => {
    const editing = titleEl.getAttribute('contenteditable') === 'true';
    titleEl.setAttribute('contenteditable', editing ? 'false' : 'true');
    if (!editing) {
      titleEl.focus();
      placeCaretAtEnd(titleEl);
    } else {
      // finish edit
      pushUndo();
      state.title = titleEl.textContent.trim();
      saveLocal();
    }
  });

  titleEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      titleEditBtn.click();
    }
  });

  function placeCaretAtEnd(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // Creator form
  creatorForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = ccText.value.trim();
    if (!text) return;
    pushUndo();

    const id = uid('item');
    state.items[id] = { id, type: 'text', text, color: ccColor.value };
    state.storage.unshift(id);
    ccText.value = '';
    renderStorage();
    initAllSortables();
    saveLocal();
  });

  // File upload
  fileInput.addEventListener('change', async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    pushUndo();

    for (const f of files) {
      const dataUrl = await readFileAsDataURL(f);
      const id = uid('item');
      state.items[id] = { id, type: 'image', dataUrl };
      state.storage.push(id);
    }
    renderStorage();
    initAllSortables();
    saveLocal();
    fileInput.value = '';
  });

  function readFileAsDataURL(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
  }

  // Add Tier
  function addTier() {
    pushUndo();
    const nextLabel = suggestNextTierLabel();
    state.tiers.push({ id: uid('tier'), label: nextLabel, items: [] });
    renderBoard();
    initAllSortables();
    saveLocal();
  }
  function suggestNextTierLabel() {
    // E, F, G... after D; fallback "New"
    const labels = state.tiers.map(t=>t.label.toUpperCase());
    for (let code=69; code<=90; code++) {
      const ch = String.fromCharCode(code);
      if (!labels.includes(ch)) return ch;
    }
    return 'New';
  }
  addTierBtns.forEach(b => b.addEventListener('click', addTier));

  // Undo
  function doUndo() {
    const prev = undoStack.pop();
    if (!prev) return;
    state = JSON.parse(prev);
    setUndoEnabled(undoStack.length > 0);
    renderAll();
  }
  undoBtns.forEach(b => b.addEventListener('click', doUndo));

  // Clear / Reset
  function openClearDialog() {
    confirmClearDlg.showModal();
  }
  function closeClearDialog() {
    confirmClearDlg.close();
  }
  clearBtns.forEach(b => b.addEventListener('click', openClearDialog));

  confirmClearDlg.addEventListener('close', () => {
    // If closed by backdrop or Cancel, nothing
  });
  confirmClearDlg.addEventListener('click', (e) => {
    // form method=dialog takes care of returns
    if (e.target.closest('[value="cancel"]')) closeClearDialog();
  });

  hardResetBtn.addEventListener('click', () => {
    // Wipe localstorage and reload fresh
    localStorage.removeItem(STORE_KEY);
    undoStack = [];
    state = newDefaultState();
    renderAll();
  });

  confirmClearDlg.addEventListener('close', (e) => {
    // No-op
  });

  // Allow keyboard submit of dialog buttons
  confirmClearDlg.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = e.submitter?.value;
    if (v === 'clear') {
      pushUndo();
      state.tiers.forEach(t => t.items = []);
      state.storage = [];
      renderAll();
    } else if (v === 'hard') {
      // already handled by click
    }
    closeClearDialog();
  });

  // Save PNG
  async function savePNG() {
    // Temporarily ensure scrollbars hidden
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    try {
      const dataUrl = await window.htmlToImage.toPng(captureArea, {
        pixelRatio: Math.min(2, window.devicePixelRatio || 1),
        cacheBust: true,
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg')?.trim() || '#111'
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `FSTM_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      alert('PNG save failed. Try again after placing at least one item.');
      console.error(err);
    } finally {
      document.body.style.overflow = oldOverflow;
    }
  }
  saveBtns.forEach(b => b.addEventListener('click', savePNG));

  // Theme toggle
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }
  themeBtns.forEach(b => b.addEventListener('click', toggleTheme));

  // Mobile half-radial picker
  let radialTargetItemId = null;
  function openRadialForCircle(pointerEvent, circleEl) {
    radialTargetItemId = circleEl.dataset.itemId;
    buildRadialButtons();
    positionRadial(pointerEvent.clientX, pointerEvent.clientY);
    radial.classList.add('open');
    radial.setAttribute('aria-hidden','false');

    // Close on outside tap
    const onDoc = (ev) => {
      if (!radial.contains(ev.target)) closeRadial();
    };
    setTimeout(() => document.addEventListener('pointerdown', onDoc, { once: true }), 0);
  }

  function buildRadialButtons() {
    radial.innerHTML = '';
    const tiersInOrder = state.tiers.slice(); // preserve order S..D..new
    const radius = 90;
    const centerX = 110, centerY = 110; // bottom center hinge
    // Always left->right the same perceived order
    const n = tiersInOrder.length;
    // Distribute across 180 degrees, starting from 180deg to 0deg
    tiersInOrder.forEach((t, idx) => {
      const angle = Math.PI - (idx * (Math.PI/(Math.max(1, n-1))));
      const x = centerX + radius * Math.cos(angle);
      const y = centerY - radius * Math.sin(angle);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = (t.label || '?').slice(0,2).toUpperCase();
      btn.style.left = `${x}px`;
      btn.style.top = `${y}px`;
      btn.addEventListener('click', () => {
        placeRadialTargetIntoTier(t.id);
      });
      radial.appendChild(btn);
    });
  }

  function positionRadial(x, y) {
    const w = 220, h = 120;
    let left = x - w/2;
    let top = y - (h + 16); // appear above the finger
    const maxL = window.innerWidth - w - 8;
    const maxT = window.innerHeight - h - 8;
    left = Math.max(8, Math.min(left, maxL));
    top = Math.max(8, Math.min(top, maxT));
    radial.style.transform = `translate(${left}px, ${top}px)`;
  }

  function closeRadial() {
    radialTargetItemId = null;
    radial.classList.remove('open');
    radial.setAttribute('aria-hidden','true');
    radial.style.transform = 'translate(-9999px, -9999px)';
  }

  function placeRadialTargetIntoTier(tierId) {
    if (!radialTargetItemId) return;
    pushUndo();

    // Remove from storage if present
    state.storage = state.storage.filter(id => id !== radialTargetItemId);
    // Insert at end of chosen tier
    const tier = state.tiers.find(t => t.id === tierId);
    if (tier) tier.items.push(radialTargetItemId);

    closeRadial();
    renderBoard();
    renderStorage();
    initAllSortables();
    saveLocal();
  }

  // Keyboard helpers: Enter to stop editing title
  titleEl.addEventListener('blur', () => {
    if (titleEl.getAttribute('contenteditable') === 'true') {
      titleEditBtn.click();
    }
  });

  // Initialize
  function init() {
    // Theme
    applyTheme(localStorage.getItem(THEME_KEY) || 'dark');

    // Load or create
    const loaded = loadLocal();
    state = loaded || newDefaultState();

    renderAll();

    // Wire duplicated buttons
    // (already wired above via arrays)

    // Accessibility: prevent page scroll on drag
    document.addEventListener('touchmove', (e) => {
      const isDragging = document.querySelector('.dragging');
      if (isDragging) e.preventDefault();
    }, { passive: false });

    // Keep undo disabled if no history
    setUndoEnabled(undoStack.length > 0);
  }

  init();

})();