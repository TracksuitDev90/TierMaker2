(() => {
  const QS = (s, el = document) => el.querySelector(s);
  const QSA = (s, el = document) => [...el.querySelectorAll(s)];

  // DOM
  const boardEl = QS('#tier-board');
  const storageGrid = QS('#storage-grid');
  const titleEl = QS('#board-title');
  const titleEditBtn = QS('#title-edit');

  // toolbar
  const btnAdd   = QS('#btn-add-tier-2');
  const btnUndo  = QS('#btn-undo-2');
  const btnSave  = QS('#btn-save-2');
  const btnClear = QS('#btn-clear-2');
  const btnTheme = QS('#btn-theme-2');

  // dialogs/forms
  const confirmClearDlg = QS('#confirm-clear');
  const hardResetBtn    = QS('#btn-hard-reset');
  const creatorForm     = QS('#circle-creator');
  const ccText          = QS('#cc-text');
  const ccColor         = QS('#cc-color');
  const fileInput       = QS('#file-input');
  const captureArea     = QS('#capture-area');

  // simplified help body
  const helpBody        = QS('#help-body');

  // minimal picker
  const picker = QS('#fstm-picker');

  // constants / storage
  const STORE_KEY = 'FSTM_STATE_v5';
  const THEME_KEY = 'FSTM_THEME_v1';
  const DEFAULT_LABELS = ['S','A','B','C','D'];

  const BTN_COLORS = {
    add:   '#46c480',
    undo:  '#f5d90a',
    clear: '#e5484d',
    save:  '#4f7cff',
  };

  const LABEL_COLORS = { S:'#e64e4e', A:'#f0922a', B:'#f4d13a', C:'#58c39a', D:'#7C9EFF' };

  const SEEDED = [
    'Anette','Authority','B7','Cindy','Clamy','Clay','Cody','Denver','Devon','Dexy','Domo',
    'Gavin','Jay','Jeremy','Katie','Keyon','Kiev','Kikki','Kyle','Lewis','Meegan','Munch',
    'Paper','Ray','Safoof','Temz','TomTom','V','Versse','Wobbles','Xavier'
  ];

  // state / utils
  let state = null;
  let undoStack = [];

  const isPhone = () => matchMedia('(max-width: 720px)').matches;
  const uid = (p='id') => `${p}_${Math.random().toString(36).slice(2,10)}`;
  const debounced = (fn, ms=200) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

  // Save with ephemerals removed (Circle Creator items marked ephemeral:true)
  const saveState = () => {
    const copy = JSON.parse(JSON.stringify(state));
    // filter out ephemeral items
    const keepIds = Object.values(copy.items)
      .filter(it => !it.ephemeral)
      .map(it => it.id);
    const keepSet = new Set(keepIds);

    // remove from items
    copy.items = Object.fromEntries(Object.entries(copy.items).filter(([id]) => keepSet.has(id)));

    // scrub from tiers + storage
    copy.tiers.forEach(t => t.items = t.items.filter(id => keepSet.has(id)));
    copy.storage = copy.storage.filter(id => keepSet.has(id));

    localStorage.setItem(STORE_KEY, JSON.stringify(copy));
  };
  const saveLocal = debounced(saveState, 200);

  const loadLocal = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch { return null; }
  };

  const pushUndo = () => {
    undoStack.push(JSON.stringify(state));
    if (undoStack.length > 60) undoStack.shift();
    btnUndo.disabled = undoStack.length === 0;
  };

  const applyTheme = (t) => {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(THEME_KEY, t);
    setThemeButtonUI();
  };

  // model
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
      // pale (~20%): lower saturation + higher lightness
      const color = `hsl(${h} 50% 72%)`;
      const id = uid('item');
      state.items[id] = { id, type: 'text', text: name, color };
      state.storage.push(id);
    });
  }

  // render
  function renderAll(){
    renderHelp();
    renderTitle();
    renderBoard();
    renderStorage();
    initSortables();
    styleButtons();
    setThemeButtonUI();
    saveLocal();
  }

  function renderHelp(){
    const on = isPhone();
    helpBody.innerHTML = `
      <ul class="help-list">
        <li><strong>Create circles:</strong> type a name/emoji and choose a color, then “Add to storage”. (Custom circles are <em>not</em> saved after refresh.)</li>
        <li><strong>Upload images:</strong> pick images and they’ll become circles.</li>
        <li><strong>${on ? 'On phones' : 'On desktop/tablet'}:</strong> ${on
          ? 'tap a circle to pop a row selector, then tap a letter. Drag to reorder within a row.'
          : 'drag circles between rows and storage; drag within a row to reorder.'}</li>
        <li><strong>Delete a row:</strong> use the small × on the label. Undo reverses it.</li>
      </ul>
    `;
  }

  function renderTitle(){
    titleEl.textContent = state.title || '';
  }

  function renderBoard(){
    boardEl.innerHTML = '';
    state.tiers.forEach(tier=>{
      const row = document.createElement('div');
      row.className = 'tier-row';
      row.dataset.tierId = tier.id;
      row.dataset.label = tier.label;

      // label
      const label = document.createElement('div');
      label.className = 'tier-label';
      label.style.background = LABEL_COLORS[(tier.label || '').toUpperCase()] || '#8aa0c9';

      const letter = document.createElement('div');
      letter.className = 'tier-letter';
      letter.contentEditable = 'true';
      letter.setAttribute('role', 'textbox');
      letter.setAttribute('aria-label', 'Tier label (editable)');
      letter.title = 'Edit label • × deletes row';
      letter.textContent = tier.label;
      fitTierLabel(letter);

      // delete ×
      const del = document.createElement('button');
      del.type = 'button'; del.textContent = '×';
      del.className = 'tier-del';
      del.addEventListener('click', ()=>{
        pushUndo();
        state.storage.unshift(...tier.items);
        state.tiers = state.tiers.filter(t=>t.id!==tier.id);
        renderAll();
      });

      letter.addEventListener('input', ()=>{
        pushUndo();
        const val = (letter.textContent || '').replace(/\s+/g,'').slice(0,12) || '?';
        letter.textContent = val;
        fitTierLabel(letter);
        tier.label = val;
        row.dataset.label = val;
        label.style.background = LABEL_COLORS[val] || label.style.background;
        if (picker.classList.contains('open')) buildPickerButtons();
        saveLocal();
      });

      label.appendChild(letter);
      label.appendChild(del);
      row.appendChild(label);

      // items wrap
      const wrap = document.createElement('div');
      wrap.className = 'tier-items droplist';
      wrap.dataset.tierId = tier.id;

      tier.items.forEach(id => wrap.appendChild(renderCircle(state.items[id])));

      row.appendChild(wrap);
      boardEl.appendChild(row);
    });
  }

  function renderStorage(){
    storageGrid.innerHTML = '';
    state.storage.forEach(id => storageGrid.appendChild(renderCircle(state.items[id])));
  }

  function renderCircle(item){
    const el = document.createElement('div');
    el.className = 'circle';
    el.dataset.itemId = item.id;

    if (item.type === 'text'){
      el.style.background = item.color || 'var(--panel)';
      const t = document.createElement('div'); t.className = 'circle-text';
      t.textContent = item.text;
      fitCircleText(t, el);
      el.appendChild(t);
    } else {
      const wrap = document.createElement('div'); wrap.className = 'circle-img';
      const img = document.createElement('img'); img.alt = 'Uploaded circle image'; img.src = item.dataUrl;
      wrap.appendChild(img); el.appendChild(wrap);
    }

    // phone: open picker
    el.addEventListener('click', (ev)=>{
      if (!isPhone()) return;
      ev.stopPropagation();
      openPicker(ev, el);
    });

    return el;
  }

  // fitting
  function fitTierLabel(el){
    const parentW = el.parentElement.clientWidth - 20;
    let size = 72; el.style.fontSize = `${size}px`;
    let guard = 0;
    while (el.scrollWidth > parentW && size > 18 && guard < 32){
      size -= 2; el.style.fontSize = `${size}px`; guard++;
    }
  }

  function fitCircleText(textEl, circleEl){
    const maxW = circleEl.clientWidth * 0.92;
    let size = 30; textEl.style.fontSize = `${size}px`; // +2px from last build
    let guard = 0;
    while (textEl.scrollWidth > maxW && size > 12 && guard < 40){
      size -= 1; textEl.style.fontSize = `${size}px`; guard++;
    }
  }

  // Sortable
  let sortables = [];
  function initSortables(){
    sortables.forEach(s=>s.destroy()); sortables = [];
    const opts = {
      group: 'fstm',
      animation: 120,
      ghostClass: 'dragging',
      dragClass: 'dragging',
      forceFallback: true,
      fallbackOnBody: true,
      touchStartThreshold: 4,
      delayOnTouchOnly: true,
      delay: 0,
      onEnd: onDragEnd
    };
    QSA('.tier-items').forEach(el=> sortables.push(new Sortable(el, opts)));
    sortables.push(new Sortable(storageGrid, opts));
  }
  function onDragEnd(){
    pushUndo();
    const idx = Object.fromEntries(state.tiers.map((t,i)=>[t.id,i]));
    const newT = state.tiers.map(t=>({id:t.id,label:t.label,items:[]}));
    QSA('.tier-items').forEach(w=>{
      const tid = w.dataset.tierId;
      newT[idx[tid]].items = QSA('.circle', w).map(c=>c.dataset.itemId);
    });
    state.tiers = newT;
    state.storage = QSA('.circle', storageGrid).map(c=>c.dataset.itemId);
    saveLocal();
  }

  // Title editing
  titleEditBtn.addEventListener('click', ()=>toggleTitleEdit());
  titleEl.addEventListener('keydown', e=>{
    if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); toggleTitleEdit(false); }
  });
  titleEl.addEventListener('blur', ()=>{ if (titleEl.getAttribute('contenteditable')==='true') toggleTitleEdit(false); });
  function toggleTitleEdit(forceOff){
    const editing = titleEl.getAttribute('contenteditable')==='true';
    if (!editing && forceOff !== false){
      titleEl.setAttribute('contenteditable','true'); titleEl.focus();
      const r = document.createRange(); r.selectNodeContents(titleEl); r.collapse(false);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    } else {
      titleEl.setAttribute('contenteditable','false');
      pushUndo(); state.title = (titleEl.textContent || '').trim(); saveLocal();
    }
  }

  // Creator / Upload
  creatorForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    const text = ccText.value.trim(); if (!text) return;
    pushUndo();
    const id = uid('item');
    // mark ephemeral so it won't persist across refresh
    state.items[id] = { id, type:'text', text, color: ccColor.value, ephemeral: true };
    state.storage.unshift(id);
    ccText.value = '';
    renderStorage(); initSortables(); saveLocal();
  });

  fileInput.addEventListener('change', async (e)=>{
    const files = [...e.target.files]; if (!files.length) return;
    pushUndo();
    for (const f of files){
      const dataUrl = await fileToDataURL(f);
      const id = uid('item');
      state.items[id] = { id, type:'image', dataUrl }; // images DO persist
      state.storage.push(id);
    }
    renderStorage(); initSortables(); saveLocal(); fileInput.value='';
  });
  const fileToDataURL = (file)=> new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(file); });

  // Toolbar actions
  btnAdd.addEventListener('click', ()=>{
    pushUndo();
    state.tiers.push({ id: uid('tier'), label: nextLabel(), items: [] });
    renderAll();
  });
  btnUndo.addEventListener('click', ()=>{
    const prev = undoStack.pop(); if (!prev) return;
    state = JSON.parse(prev); btnUndo.disabled = undoStack.length===0; renderAll();
  });
  btnClear.addEventListener('click', ()=>confirmClearDlg.showModal());
  confirmClearDlg.addEventListener('submit', (e)=>{
    e.preventDefault();
    const v = e.submitter?.value;
    if (v==='clear'){ pushUndo(); state.tiers.forEach(t=>t.items=[]); state.storage=[]; renderAll(); }
    confirmClearDlg.close();
  });
  hardResetBtn.addEventListener('click', ()=>{
    localStorage.removeItem(STORE_KEY);
    undoStack=[]; state = newDefaultState(); seedIfEmpty(); renderAll();
  });

  btnTheme.addEventListener('click', ()=>{
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(cur==='dark' ? 'light' : 'dark');
  });

  // Button visuals & theme label/icon
  function styleButtons(){
    btnAdd.style.background  = BTN_COLORS.add;  btnAdd.style.color  = '#0f1222';
    btnUndo.style.background = BTN_COLORS.undo; btnUndo.style.color = '#0f1222';
    btnClear.style.background= BTN_COLORS.clear;btnClear.style.color= '#ffffff';
    btnSave.style.background = BTN_COLORS.save; btnSave.style.color = '#ffffff';
  }
  function setThemeButtonUI(){
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    const goTo = cur==='dark' ? 'Light mode' : 'Dark mode';
    const iconSun  = '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M6.76 4.84l-1.8-1.79L3.17 4.84l1.79 1.79 1.8-1.79zM1 13h3v-2H1v2zm10 10h2v-3h-2v3zm9.83-18.16l-1.79-1.79-1.79 1.79 1.79 1.79 1.79-1.79zM20 13h3v-2h-3v2zM6.76 19.16l-1.8 1.79 1.79 1.79 1.8-1.79-1.79-1.79zM17.24 19.16l1.79 1.79 1.79-1.79-1.79-1.79-1.79 1.79zM12 6a6 6 0 100 12 6 6 0 000-12z"/></svg>';
    const iconMoon = '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>';
    btnTheme.innerHTML = `${cur==='dark' ? iconSun : iconMoon}<span style="margin-left:8px;font-weight:800">${goTo}</span>`;
    btnTheme.style.background = cur==='dark' ? '#eaeefb' : '#22293a';
    btnTheme.style.color      = cur==='dark' ? '#0f1222' : '#f6f7fb';
  }

  // PNG capture (live DOM; full board; title only if set; excludes × and picker)
  btnSave.addEventListener('click', savePNG);
  async function savePNG(){
    // ensure fonts (Safari)
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch {} }

    document.body.classList.add('capture-mode');

    // expand rows so long lines are fully captured
    const rows = QSA('.tier-items');
    const backups = rows.map(w=>({ w, overflow:w.style.overflow, width:w.style.width }));
    rows.forEach(w => { w.style.overflow='visible'; w.style.width = `${w.scrollWidth}px`; });

    // hide title if empty
    const titleWrap = QS('.title-wrap');
    const includeTitle = !!(state.title && state.title.trim());
    const prevDisplay = titleWrap.style.display;
    if (!includeTitle) titleWrap.style.display = 'none';

    // close picker if open
    closePicker();

    try{
      const width  = Math.max(captureArea.scrollWidth, captureArea.getBoundingClientRect().width);
      const height = Math.max(captureArea.scrollHeight, captureArea.getBoundingClientRect().height);
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg')?.trim() || '#111';

      const dataUrl = await window.htmlToImage.toPng(captureArea, {
        width, height, canvasWidth: width, canvasHeight: height,
        pixelRatio: 2, cacheBust: true, backgroundColor: bg,
        style: { transform: 'none' },
        filter: (node) => {
          // exclude delete buttons / pickers if any slipped inside capture area
          if (node.classList) {
            if (node.classList.contains('tier-del')) return false;
            if (node.id === 'fstm-picker') return false;
          }
          return true;
        }
      });

      const a = document.createElement('a');
      a.href = dataUrl; a.download = `FSTM_${Date.now()}.png`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch(err){
      console.error('PNG capture error:', err);
      alert('PNG save failed. Try again after placing at least one item.');
    } finally {
      rows.forEach(({w,overflow,width})=>{ w.style.overflow = overflow; w.style.width = width; });
      if (!includeTitle) titleWrap.style.display = prevDisplay;
      document.body.classList.remove('capture-mode');
    }
  }

  // Minimal mobile picker (no background)
  function buildPickerButtons(){
    picker.innerHTML = '';
    const tiers = state.tiers.slice();
    const W = 220, H = 120;
    const BTN = 46, PAD = 6;
    const step = Math.PI / (Math.max(1, tiers.length) - 1 || 1);
    const minR = (BTN + PAD) / (2 * Math.sin(step/2));
    const r = Math.max(72, minR);
    const cx = W/2, cy = H - 6;

    tiers.forEach((t, i)=>{
      const a = Math.PI - i*step;
      const x = cx + r*Math.cos(a);
      const y = cy - r*Math.sin(a);
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = (t.label || '?').slice(0,2).toUpperCase();
      b.style.left = `${x}px`; b.style.top = `${y}px`;
      b.addEventListener('click', ()=> {
        placePickerTargetIntoTier(t.id);
      });
      picker.appendChild(b);
      // animate in
      requestAnimationFrame(()=> b.classList.add('show'));
    });

    picker.style.width = `${W}px`; picker.style.height = `${H}px`;
  }

  let pickerItemId = null;
  function openPicker(ev, circleEl){
    pickerItemId = circleEl.dataset.itemId;
    buildPickerButtons();
    // position
    const rect = circleEl.getBoundingClientRect();
    const W = 220, H = 120;
    const x = rect.left + rect.width/2;
    const y = rect.top;
    const left = Math.max(8, Math.min(x - W/2, innerWidth - W - 8));
    const top  = Math.max(8, Math.min(y - (H + 12), innerHeight - H - 8));
    picker.style.transform = `translate(${left}px, ${top}px)`;
    picker.classList.add('open');
    picker.setAttribute('aria-hidden', 'false');

    const onOutside = (e)=>{ if (!picker.contains(e.target)) closePicker(); };
    setTimeout(()=> document.addEventListener('pointerdown', onOutside, { once:true, capture:true }), 0);
    window.addEventListener('scroll', closePicker, { once:true, passive:true });
  }
  function closePicker(){
    pickerItemId = null;
    picker.classList.remove('open');
    picker.setAttribute('aria-hidden','true');
    picker.style.transform = 'translate(-9999px,-9999px)';
  }
  function placePickerTargetIntoTier(tierId){
    if (!pickerItemId) return;
    pushUndo();
    state.storage = state.storage.filter(id => id !== pickerItemId);
    state.tiers.forEach(t => t.items = t.items.filter(id => id !== pickerItemId));
    const t = state.tiers.find(x => x.id === tierId); if (t) t.items.push(pickerItemId);
    closePicker(); renderBoard(); renderStorage(); initSortables(); saveLocal();
  }

  // helpers
  function nextLabel(){
    const labels = state.tiers.map(t=>t.label.toUpperCase());
    for (let c=69;c<=90;c++){ const ch=String.fromCharCode(c); if (!labels.includes(ch)) return ch; }
    return 'NEW';
  }

  // prevent page scroll while dragging
  document.addEventListener('touchmove', (e)=>{
    if (document.querySelector('.dragging')) e.preventDefault();
  }, { passive:false });

  // init
  function init(){
    applyTheme(localStorage.getItem(THEME_KEY) || 'dark');

    const loaded = loadLocal();
    state = loaded || newDefaultState();
    if (!loaded) seedIfEmpty();

    renderAll();

    window.addEventListener('resize', debounced(()=>{
      const on = isPhone();
      renderHelp();
      QSA('.circle').forEach(c=>{
        const t = QS('.circle-text', c); if (t) fitCircleText(t, c);
      });
    }, 160));

    btnUndo.disabled = true;
  }
  init();
})();