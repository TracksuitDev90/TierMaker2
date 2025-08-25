/* =========================================================================
   FSTM — Fireside Tier Maker (Full JS, update for your 4 requests)
   - PNG save: captures the ENTIRE tier board (all rows, full width), and
     includes the title only when the user entered one.
   - Circle text: single line, auto-shrinks to fit the circle, always centered.
   - Mobile picker arc: compact, clean, non-overlapping, smooth open/close.
   - Action buttons: one row (CSS handles wrap on phones), soft unique colors,
     Theme button shows the target mode (Sun for Light mode / Moon for Dark mode).
   ========================================================================= */

(() => {
  const QS = (s, el = document) => el.querySelector(s);
  const QSA = (s, el = document) => [...el.querySelectorAll(s)];

  // DOM
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

  const creatorForm = QS('#circle-creator');
  const ccText = QS('#cc-text');
  const ccColor = QS('#cc-color');

  const fileInput = QS('#file-input');
  const captureArea = QS('#capture-area');

  const radial = QS('#radial');

  // Remove any top toolbars if present (tools only below the board)
  QS('.quick-actions')?.remove();

  // Constants / Storage
  const STORE_KEY = 'FSTM_STATE_v3';
  const THEME_KEY = 'FSTM_THEME_v1';

  const DEFAULT_LABELS = ['S', 'A', 'B', 'C', 'D'];

  // Softer button colors
  const COLORS = {
    green: '#4cc38a',
    yellow: '#f5d90a',
    red: '#e5484d',
    blue: '#4f7cff',
  };

  // Brighter label backgrounds
  const LABEL_COLORS = {
    S: '#e64e4e',
    A: '#f0922a',
    B: '#f4d13a',
    C: '#58c39a',
    D: '#7C9EFF'
  };

  // Seeded names for storage (unique hues)
  const SEEDED = [
    'Anette','Authority','B7','Cindy','Clamy','Clay','Cody','Denver','Devon','Dexy','Domo',
    'Gavin','Jay','Jeremy','Katie','Keyon','Kiev','Kikki','Kyle','Lewis','Meegan','Munch',
    'Paper','Ray','Safoof','Temz','TomTom','V','Versse','Wobbles','Xavier'
  ];

  // State
  let state = null;
  let undoStack = [];

  // Utils
  const isPhone = () => matchMedia('(max-width: 720px)').matches;
  const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 10)}`;
  const debounced = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  const saveLocal = debounced(() => localStorage.setItem(STORE_KEY, JSON.stringify(state)));
  const loadLocal = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch { return null; } };

  const pushUndo = () => { undoStack.push(JSON.stringify(state)); if (undoStack.length > 60) undoStack.shift(); undoBtn.disabled = undoStack.length === 0; };

  const applyTheme = (t) => { document.documentElement.setAttribute('data-theme', t); localStorage.setItem(THEME_KEY, t); setThemeButtonUI(); };

  // ---------- Model ----------
  // state = { title, tiers:[{id,label,items:[]},...], items:{id:{...}}, storage:[id,...] }

  const newDefaultState = () => ({
    title: '',
    tiers: DEFAULT_LABELS.map(l => ({ id: uid('tier'), label: l, items: [] })),
    items: {},
    storage: []
  });

  function seedIfEmpty() {
    if (state.storage.length) return;
    const golden = 137.508;
    SEEDED.forEach((name, i) => {
      const h = Math.round((i * golden) % 360);
      const id = uid('item');
      state.items[id] = { id, type: 'text', text: name, color: `hsl(${h} 62% 52%)` };
      state.storage.push(id);
    });
  }

  // ---------- Render ----------
  function renderAll() {
    renderTitle();
    renderBoard();
    renderStorage();
    initSortables();
    wireButtonsAppearance();
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
      // vivid label color
      const bg = LABEL_COLORS[(tier.label || '').toUpperCase()] || '#7f8699';
      label.style.background = bg;

      const letter = document.createElement('div');
      letter.className = 'tier-letter';
      letter.contentEditable = 'true';
      letter.setAttribute('role', 'textbox');
      letter.setAttribute('aria-label', 'Tier label (editable)');
      letter.title = 'Edit label. Use × to delete this row.';
      letter.textContent = tier.label;

      // no box growth
      letter.style.whiteSpace = 'nowrap';
      letter.style.overflow = 'hidden';
      letter.style.textOverflow = 'clip';
      fitTierLabel(letter);

      // delete ×
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '×';
      del.setAttribute('aria-label', 'Delete this row');
      Object.assign(del.style, {
        position: 'absolute', right: '6px', top: '6px', width: '22px', height: '22px',
        borderRadius: '999px', border: '1px solid rgba(0,0,0,.25)', background: 'rgba(255,255,255,.18)',
        color: '#fff', fontWeight: '900', display: 'grid', placeItems: 'center', cursor: 'pointer'
      });
      del.addEventListener('click', () => {
        pushUndo();
        // move items back to storage
        state.storage.unshift(...tier.items);
        state.tiers = state.tiers.filter(t => t.id !== tier.id);
        renderAll();
      });

      letter.addEventListener('input', () => {
        pushUndo();
        const val = letter.textContent.replace(/\s+/g, '').slice(0, 12);
        letter.textContent = val || '?';
        fitTierLabel(letter);
        tier.label = letter.textContent;
        row.dataset.label = tier.label;
        const newBg = LABEL_COLORS[(tier.label || '').toUpperCase()];
        if (newBg) label.style.background = newBg;
        if (radial.classList.contains('open')) buildRadial();
        saveLocal();
      });

      label.appendChild(letter);
      label.appendChild(del);
      row.appendChild(label);

      const wrap = document.createElement('div');
      wrap.className = 'tier-items droplist';
      wrap.dataset.tierId = tier.id;

      tier.items.forEach(id => wrap.appendChild(renderCircle(state.items[id])));

      row.appendChild(wrap);
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

    if (item.type === 'text') {
      el.style.background = item.color || 'var(--panel)';
      const t = document.createElement('div');
      t.className = 'circle-text';
      // single line + auto shrink
      t.style.whiteSpace = 'nowrap';
      t.style.textAlign = 'center';
      t.style.width = '90%';
      t.style.overflow = 'hidden';
      t.style.textOverflow = 'clip';
      t.textContent = item.text;
      fitCircleText(t, el);
      el.appendChild(t);
    } else {
      const imgWrap = document.createElement('div');
      imgWrap.className = 'circle-img';
      const img = document.createElement('img');
      img.alt = 'Uploaded circle image';
      img.src = item.dataUrl;
      imgWrap.appendChild(img);
      el.appendChild(imgWrap);
    }

    // Mobile radial: open on tap (storage or row)
    el.addEventListener('click', (ev) => {
      if (!isPhone()) return;
      ev.stopPropagation();
      openRadial(ev, el);
    });

    return el;
  }

  // ---------- Fit text ----------
  function fitTierLabel(el) {
    const parent = el.parentElement;
    if (!parent) return;
    const max = 72, min = 18;
    let size = max;
    el.style.fontSize = `${size}px`;
    // shrink until it fits inside label (minus padding)
    const maxWidth = parent.clientWidth - 20;
    let guard = 0;
    while (el.scrollWidth > maxWidth && size > min && guard < 30) {
      size -= 2;
      el.style.fontSize = `${size}px`;
      guard++;
    }
  }

  function fitCircleText(textEl, circleEl) {
    const pad = 12;
    const maxWidth = circleEl.clientWidth - pad * 2;
    let size = 26; // start big and readable
    textEl.style.fontSize = `${size}px`;
    let guard = 0;
    while (textEl.scrollWidth > maxWidth && size > 12 && guard < 30) {
      size -= 1;
      textEl.style.fontSize = `${size}px`;
      guard++;
    }
    // vertically center by line-height ~= circle height
    textEl.style.lineHeight = '1.05';
  }

  // ---------- Sortable ----------
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
    rebuildFromDOM();
    saveLocal();
  }

  function rebuildFromDOM() {
    const map = Object.fromEntries(state.tiers.map((t, i) => [t.id, i]));
    const newT = state.tiers.map(t => ({ id: t.id, label: t.label, items: [] }));
    QSA('.tier-items').forEach(w => {
      const tid = w.dataset.tierId;
      newT[map[tid]].items = QSA('.circle', w).map(c => c.dataset.itemId);
    });
    state.tiers = newT;
    state.storage = QSA('.circle', storageGrid).map(c => c.dataset.itemId);
  }

  // ---------- Title edit ----------
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
      const r = document.createRange(); r.selectNodeContents(titleEl); r.collapse(false);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    } else {
      titleEl.setAttribute('contenteditable', 'false');
      pushUndo();
      state.title = (titleEl.textContent || '').trim();
      saveLocal();
    }
  }

  // ---------- Creator / Upload ----------
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

  const fileToDataURL = (file) => new Promise((res, rej) => {
    const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file);
  });

  // ---------- Toolbar actions ----------
  addTierBtn.addEventListener('click', () => {
    pushUndo();
    state.tiers.push({ id: uid('tier'), label: nextLabel(), items: [] });
    renderAll();
  });

  undoBtn.addEventListener('click', () => {
    const prev = undoStack.pop();
    if (!prev) return;
    state = JSON.parse(prev);
    undoBtn.disabled = undoStack.length === 0;
    renderAll();
  });

  clearBtn.addEventListener('click', () => confirmClearDlg.showModal());
  confirmClearDlg.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = e.submitter?.value;
    if (v === 'clear') {
      pushUndo();
      state.tiers.forEach(t => t.items = []);
      state.storage = [];
      renderAll();
    }
    confirmClearDlg.close();
  });

  hardResetBtn.addEventListener('click', () => {
    localStorage.removeItem(STORE_KEY);
    undoStack = [];
    state = newDefaultState();
    seedIfEmpty();
    renderAll();
  });

  themeBtn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  });

  // Button visuals & theme label/icon
  function wireButtonsAppearance() {
    // soft, modern colors
    addTierBtn.style.background = COLORS.green;
    undoBtn.style.background = COLORS.yellow;
    clearBtn.style.background = COLORS.red;
    saveBtn.style.background = COLORS.blue;

    [addTierBtn, undoBtn, clearBtn, saveBtn, themeBtn].forEach(b => {
      b.style.border = '1px solid rgba(0,0,0,.12)';
      b.style.color = '#0f1222';
      if (document.documentElement.getAttribute('data-theme') === 'dark' && b !== clearBtn) {
        b.style.color = '#0f1222';
      }
      if (b === clearBtn) b.style.color = '#fff';
    });

    setThemeButtonUI();
  }

  function setThemeButtonUI() {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    const goTo = cur === 'dark' ? 'Light mode' : 'Dark mode';
    const iconSun = '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M6.76 4.84l-1.8-1.79L3.17 4.84l1.79 1.79 1.8-1.79zM1 13h3v-2H1v2zm10 10h2v-3h-2v3zm9.83-18.16l-1.79-1.79-1.79 1.79 1.79 1.79 1.79-1.79zM20 13h3v-2h-3v2zM6.76 19.16l-1.8 1.79 1.79 1.79 1.8-1.79-1.79-1.79zM17.24 19.16l1.79 1.79 1.79-1.79-1.79-1.79-1.79 1.79zM12 6a6 6 0 100 12 6 6 0 000-12z"/></svg>';
    const iconMoon = '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>';
    themeBtn.innerHTML = `${cur === 'dark' ? iconSun : iconMoon}<span style="margin-left:8px;font-weight:700">${goTo}</span>`;
    themeBtn.style.background = cur === 'dark' ? '#eaeefb' : '#1d2433';
    themeBtn.style.color = cur === 'dark' ? '#0f1222' : '#f6f7fb';
  }

  // ---------- PNG Save (full board, title only if set) ----------
  saveBtn.addEventListener('click', savePNG);

  async function savePNG() {
    // Expand each row to its full scroll width so no circles are clipped
    const rows = QSA('.tier-items');
    const originals = rows.map(w => ({ el: w, width: w.style.width, overflow: w.style.overflow }));
    rows.forEach(w => {
      w.style.overflow = 'visible';
      w.style.width = `${w.scrollWidth}px`;
    });

    // Clone the capture area so we can hide the title if empty
    const clone = captureArea.cloneNode(true);
    const hasTitle = !!(state.title && state.title.trim());
    if (!hasTitle) {
      QS('.title-wrap', clone)?.remove();
    }

    clone.style.position = 'fixed';
    clone.style.left = '-99999px';
    clone.style.top = '0';
    clone.style.opacity = '0';
    document.body.appendChild(clone);

    // Equalize widths of cloned rows to their originals
    QSA('.tier-items', clone).forEach(w => {
      const orig = QS(`.tier-items[data-tier-id="${w.dataset.tierId}"]`, captureArea);
      if (orig) {
        w.style.overflow = 'visible';
        w.style.width = `${orig.scrollWidth}px`;
      }
    });

    try {
      const dataUrl = await window.htmlToImage.toPng(clone, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg')?.trim() || '#111',
        style: { transform: 'none' },
        filter: (node) => {
          // Exclude the radial if somehow present in clone (shouldn't be)
          return !(node.id && node.id === 'radial');
        }
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `FSTM_${Date.now()}.png`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (err) {
      console.error('PNG capture failed:', err);
      alert('PNG save failed. Try again after placing at least one item.');
    } finally {
      // restore
      clone.remove();
      originals.forEach(o => { o.el.style.width = o.width; o.el.style.overflow = o.overflow; });
    }
  }

  // ---------- Mobile Picker Arc (compact, clean, non-overlapping) ----------
  let radialTargetItemId = null;

  function openRadial(ev, circleEl) {
    radialTargetItemId = circleEl.dataset.itemId;
    buildRadial();

    // position above the tapped circle, clamped
    const rect = circleEl.getBoundingClientRect();
    const W = 200, H = 96;
    const x = rect.left + rect.width / 2;
    const y = rect.top;
    let left = Math.max(8, Math.min(x - W / 2, window.innerWidth - W - 8));
    let top = Math.max(8, Math.min(y - (H + 12), window.innerHeight - H - 8));
    radial.style.width = `${W}px`;
    radial.style.height = `${H}px`;
    radial.style.transform = `translate(${left}px, ${top}px)`;

    // clean animation
    radial.style.opacity = '0';
    radial.style.transition = 'transform 160ms ease, opacity 160ms ease';
    setTimeout(() => { radial.classList.add('open'); radial.style.opacity = '1'; }, 0);
    radial.setAttribute('aria-hidden', 'false');

    const onOutside = (e) => { if (!radial.contains(e.target)) closeRadial(); };
    setTimeout(() => document.addEventListener('pointerdown', onOutside, { once: true, capture: true }), 0);
    const onScroll = () => closeRadial();
    window.addEventListener('scroll', onScroll, { once: true, passive: true });
  }

  function buildRadial() {
    radial.innerHTML = '';
    // backdrop (semi circle) via ::before in CSS; ensure buttons are compact and spaced
    const tiers = state.tiers.slice();
    const W = parseInt(radial.style.width || 200, 10);
    const H = parseInt(radial.style.height || 96, 10);

    const BTN = 44;              // button size
    const PAD = 6;               // spacing margin
    const n = Math.max(1, tiers.length);
    const step = Math.PI / (n - 1 || 1); // angle between neighbors (0..π)

    // Compute minimum radius so buttons never overlap:
    // chord length L between neighbors should be >= BTN + PAD
    const minR = (BTN + PAD) / (2 * Math.sin(step / 2));
    const radius = Math.max(minR, 72);
    const cx = W / 2;
    const cy = H - 6; // hinge slightly inside

    for (let i = 0; i < n; i++) {
      const a = Math.PI - i * step;
      const x = cx + radius * Math.cos(a);
      const y = cy - radius * Math.sin(a);

      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = (tiers[i].label || '?').slice(0, 2).toUpperCase();
      Object.assign(b.style, {
        position: 'absolute',
        width: `${BTN}px`,
        height: `${BTN}px`,
        left: `${x}px`,
        top: `${y}px`,
        transform: 'translate(-50%,-50%)',
        borderRadius: '999px',
        fontWeight: '900',
        fontSize: '18px',
        background: '#ffffff',
        color: '#0f1222',
        border: '1px solid rgba(0,0,0,.18)',
        boxShadow: '0 6px 18px rgba(0,0,0,.25)'
      });
      b.addEventListener('click', () => {
        placeRadialTargetIntoTier(tiers[i].id);
      });
      radial.appendChild(b);
    }
  }

  function closeRadial() {
    radialTargetItemId = null;
    radial.classList.remove('open');
    radial.style.opacity = '0';
    radial.setAttribute('aria-hidden', 'true');
    radial.style.transform = 'translate(-9999px,-9999px)';
  }

  function placeRadialTargetIntoTier(tierId) {
    if (!radialTargetItemId) return;
    pushUndo();

    // Remove from wherever it is
    state.storage = state.storage.filter(id => id !== radialTargetItemId);
    state.tiers.forEach(t => t.items = t.items.filter(id => id !== radialTargetItemId));

    // Add to chosen tier
    const tier = state.tiers.find(t => t.id === tierId);
    if (tier) tier.items.push(radialTargetItemId);

    closeRadial();
    renderBoard(); renderStorage(); initSortables(); saveLocal();
  }

  // ---------- Helpers ----------
  function nextLabel() {
    const labels = state.tiers.map(t => t.label.toUpperCase());
    for (let c = 69; c <= 90; c++) { // E..Z
      const ch = String.fromCharCode(c);
      if (!labels.includes(ch)) return ch;
    }
    return 'NEW';
  }

  // Prevent page from rubber-banding while dragging
  document.addEventListener('touchmove', (e) => {
    const dragging = document.querySelector('.dragging');
    if (dragging) e.preventDefault();
  }, { passive: false });

  // ---------- Init ----------
  function init() {
    applyTheme(localStorage.getItem(THEME_KEY) || 'dark');

    state = loadLocal() || newDefaultState();
    if (!loadLocal()) seedIfEmpty();

    renderAll();

    // Re-fit circle text on resize
    window.addEventListener('resize', debounced(() => {
      QSA('.circle').forEach(c => {
        const t = QS('.circle-text', c);
        if (t) fitCircleText(t, c);
      });
    }, 150));

    undoBtn.disabled = true;
  }

  init();
})();