/* =========================================================================
   FSTM — Fireside Tier Maker (Full JavaScript • update set)
   What’s new for this pass:
   1) Circle text is black, always one line, auto-shrinks (2px larger base),
      circles slightly bigger, centered and never clipped.
   2) PNG save rewritten to operate on the live DOM (no flaky cloning) and
      explicitly measures full scroll width/height so it captures the entire
      board; title is included only if non-empty. Radial/pickers are excluded.
   3) Title UI: pencil icon kept, title text size reduced via inline style.
   4) Toolbar order enforced: Add Tier, Undo, Clear Board, Save PNG, [space], Theme.
      Buttons get soft modern colors.
   5) Mobile picker: no arc background — only clean circular buttons in an arc,
      compact, non-overlapping, smooth open/close. (We render a transient
      container instead of using the old backgrounded element.)
   6) Brand header text forced to “FSTM” in neon yellow-green.
   7) Seeded circle colors use a golden-angle HSL palette (pleasing spread).
   ========================================================================= */

(() => {
  // ------- tiny DOM helpers -------
  const QS = (s, el = document) => el.querySelector(s);
  const QSA = (s, el = document) => [...el.querySelectorAll(s)];

  // ------- fixed refs -------
  const boardEl = QS('#tier-board');
  const storageGrid = QS('#storage-grid');
  const titleEl = QS('#board-title');
  const titleEditBtn = QS('#title-edit');

  // toolbar (single row under board)
  const toolbar = QS('.toolbar');
  const btnAdd   = QS('#btn-add-tier-2');
  const btnUndo  = QS('#btn-undo-2');
  const btnSave  = QS('#btn-save-2');
  const btnClear = QS('#btn-clear-2');
  const btnTheme = QS('#btn-theme-2');

  // dialogs, forms
  const confirmClearDlg = QS('#confirm-clear');
  const hardResetBtn    = QS('#btn-hard-reset');
  const creatorForm     = QS('#circle-creator');
  const ccText          = QS('#cc-text');
  const ccColor         = QS('#cc-color');
  const fileInput       = QS('#file-input');
  const captureArea     = QS('#capture-area');

  // legacy radial (we won’t use its background anymore)
  const legacyRadialEl  = QS('#radial'); // left in DOM; ignored/hidden

  // ------- constants / storage -------
  const STORE_KEY = 'FSTM_STATE_v4';
  const THEME_KEY = 'FSTM_THEME_v1';

  const DEFAULT_LABELS = ['S','A','B','C','D'];

  // soft, modern button colors
  const BTN_COLORS = {
    add:   '#46c480', // green
    undo:  '#f5d90a', // yellow
    clear: '#e5484d', // red
    save:  '#4f7cff', // blue
  };

  // colorful defaults for tier labels
  const LABEL_COLORS = { S:'#e64e4e', A:'#f0922a', B:'#f4d13a', C:'#58c39a', D:'#7C9EFF' };

  // pre-seeded names
  const SEEDED = [
    'Anette','Authority','B7','Cindy','Clamy','Clay','Cody','Denver','Devon','Dexy','Domo',
    'Gavin','Jay','Jeremy','Katie','Keyon','Kiev','Kikki','Kyle','Lewis','Meegan','Munch',
    'Paper','Ray','Safoof','Temz','TomTom','V','Versse','Wobbles','Xavier'
  ];

  // slightly bigger circles
  const CIRCLE_SIZE = 84; // was 76

  // ------- state / utils -------
  let state = null;
  let undoStack = [];

  const isPhone = () => matchMedia('(max-width: 720px)').matches;
  const uid = (p='id') => `${p}_${Math.random().toString(36).slice(2,10)}`;
  const debounced = (fn, ms=200) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
  const saveLocal = debounced(()=>localStorage.setItem(STORE_KEY, JSON.stringify(state)));
  const loadLocal = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch { return null; } };
  const pushUndo = () => { undoStack.push(JSON.stringify(state)); if (undoStack.length>60) undoStack.shift(); btnUndo.disabled = undoStack.length===0; };
  const applyTheme = (t) => { document.documentElement.setAttribute('data-theme', t); localStorage.setItem(THEME_KEY, t); setThemeButtonUI(); };

  // ------- model -------
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
    SEEDED.forEach((name,i)=>{
      const h = Math.round((i*golden)%360);
      const id = uid('item');
      state.items[id] = { id, type:'text', text:name, color:`hsl(${h} 62% 52%)` };
      state.storage.push(id);
    });
  }

  // ------- rendering -------
  function renderAll(){
    renderBrand();
    renderTitle();
    renderToolbarOrder();
    renderBoard();
    renderStorage();
    initSortables();
    styleButtons();
    setThemeButtonUI();
    saveLocal();
  }

  function renderBrand(){
    // Header brand to “FSTM” in neon yellow-green (nitex vibe)
    const brandName = QS('.brand-name');
    const brandSub  = QS('.brand-sub');
    const mark      = QS('.brand-mark');
    if (brandName) { brandName.textContent = 'FSTM'; brandName.style.color = '#C8FF00'; } // neon yellow-green
    if (brandSub)  brandSub.style.display = 'none';
    if (mark)      mark.style.fill = '#C8FF00';
  }

  function renderTitle(){
    // Reduce title font size a touch
    titleEl.style.fontSize = 'clamp(20px, 2.6vw, 34px)';
    titleEl.textContent = state.title || '';
    // Ensure the edit button shows a pencil (kept but refreshed)
    titleEditBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM21 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75L21 7.04z"/>
      </svg>`;
  }

  function renderToolbarOrder(){
    // Enforce requested order: Add, Undo, Clear, Save, [space], Theme
    if (!toolbar) return;
    // small spacer before Theme (auto-push to end)
    btnTheme.style.marginLeft = '12px';
    toolbar.append(btnAdd, btnUndo, btnClear, btnSave, btnTheme);
    toolbar.style.display = 'flex';
    toolbar.style.flexWrap = 'wrap';         // stack on phones naturally
    toolbar.style.gap = '10px';
  }

  function renderBoard(){
    boardEl.innerHTML = '';
    state.tiers.forEach(tier=>{
      const row = document.createElement('div');
      row.className = 'tier-row';
      row.dataset.tierId = tier.id;
      row.dataset.label = tier.label;

      // Label box (colorful)
      const label = document.createElement('div');
      label.className = 'tier-label';
      const vivid = LABEL_COLORS[(tier.label||'').toUpperCase()] || '#7b8aa6';
      label.style.background = vivid;

      const letter = document.createElement('div');
      letter.className = 'tier-letter';
      letter.contentEditable = 'true';
      letter.setAttribute('role','textbox');
      letter.setAttribute('aria-label','Tier label (editable)');
      letter.title = 'Edit label • × deletes row';
      letter.textContent = tier.label;
      // keep inside, no multi-line
      Object.assign(letter.style, { whiteSpace:'nowrap', overflow:'hidden', textOverflow:'clip' });
      fitTierLabel(letter);

      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '×';
      del.setAttribute('aria-label','Delete row');
      Object.assign(del.style, {
        position:'absolute', right:'6px', top:'6px', width:'22px', height:'22px',
        borderRadius:'999px', border:'1px solid rgba(0,0,0,.25)', background:'rgba(255,255,255,.18)',
        color:'#fff', fontWeight:'900', display:'grid', placeItems:'center', cursor:'pointer'
      });
      del.addEventListener('click', ()=>{
        pushUndo();
        state.storage.unshift(...tier.items);
        state.tiers = state.tiers.filter(t=>t.id!==tier.id);
        renderAll();
      });

      letter.addEventListener('input', ()=>{
        pushUndo();
        const val = letter.textContent.replace(/\s+/g,'').slice(0,12) || '?';
        letter.textContent = val;
        fitTierLabel(letter);
        tier.label = val;
        row.dataset.label = val;
        const newBg = LABEL_COLORS[val] || vivid;
        label.style.background = newBg;
        buildPickerButtonsCache(); // update picker labels if open
        saveLocal();
      });

      label.appendChild(letter);
      label.appendChild(del);
      row.appendChild(label);

      // Drop container
      const itemsWrap = document.createElement('div');
      itemsWrap.className = 'tier-items droplist';
      itemsWrap.dataset.tierId = tier.id;

      tier.items.forEach(id=> itemsWrap.appendChild(renderCircle(state.items[id])));

      row.appendChild(itemsWrap);
      boardEl.appendChild(row);
    });
  }

  function renderStorage(){
    storageGrid.innerHTML = '';
    state.storage.forEach(id=> storageGrid.appendChild(renderCircle(state.items[id])));
  }

  function renderCircle(item){
    const el = document.createElement('div');
    el.className = 'circle';
    el.dataset.itemId = item.id;
    // bigger circle
    Object.assign(el.style, {
      width:`${CIRCLE_SIZE}px`, height:`${CIRCLE_SIZE}px`,
      minWidth:`${CIRCLE_SIZE}px`, minHeight:`${CIRCLE_SIZE}px`
    });

    if (item.type === 'text'){
      el.style.background = item.color || 'var(--panel)';
      const t = document.createElement('div');
      t.className = 'circle-text';
      t.textContent = item.text;
      // black, single-line, centered
      Object.assign(t.style, {
        color:'#000',
        whiteSpace:'nowrap',
        width:'92%',
        overflow:'hidden',
        textOverflow:'clip',
        textAlign:'center'
      });
      fitCircleText(t, el);
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

    // Phone: open clean picker (no arc bg) on tap
    el.addEventListener('click', (ev)=>{
      if (!isPhone()) return;
      ev.stopPropagation();
      openPicker(ev, el);
    });

    return el;
  }

  // ------- label + circle text fitting -------
  function fitTierLabel(el){
    const parent = el.parentElement;
    if (!parent) return;
    const max = 72, min = 18;
    let size = max;
    el.style.fontSize = `${size}px`;
    const maxWidth = parent.clientWidth - 20;
    let guard = 0;
    while (el.scrollWidth > maxWidth && size > min && guard < 30){
      size -= 2; el.style.fontSize = `${size}px`; guard++;
    }
  }

  function fitCircleText(textEl, circleEl){
    const maxWidth = circleEl.clientWidth * 0.92;
    let size = 28;              // +2px from previous build
    textEl.style.fontSize = `${size}px`;
    textEl.style.lineHeight = '1.05';
    let guard = 0;
    while (textEl.scrollWidth > maxWidth && size > 12 && guard < 40){
      size -= 1;
      textEl.style.fontSize = `${size}px`;
      guard++;
    }
  }

  // ------- Sortable drag -------
  let sortables = [];
  function initSortables(){
    sortables.forEach(s=>s.destroy()); sortables = [];
    const options = {
      group:'fstm',
      animation:120,
      ghostClass:'dragging',
      dragClass:'dragging',
      forceFallback:true,
      fallbackOnBody:true,
      touchStartThreshold:4,
      delayOnTouchOnly:true,
      delay:0,
      onEnd: onDragEnd
    };
    QSA('.tier-items').forEach(el=> sortables.push(new Sortable(el, options)));
    sortables.push(new Sortable(storageGrid, options));
  }
  function onDragEnd(){
    pushUndo();
    rebuildStateFromDOM();
    saveLocal();
  }
  function rebuildStateFromDOM(){
    const idx = Object.fromEntries(state.tiers.map((t,i)=>[t.id,i]));
    const newT = state.tiers.map(t=>({id:t.id,label:t.label,items:[]}));
    QSA('.tier-items').forEach(w=>{
      const tid = w.dataset.tierId;
      newT[idx[tid]].items = QSA('.circle', w).map(c=>c.dataset.itemId);
    });
    state.tiers = newT;
    state.storage = QSA('.circle', storageGrid).map(c=>c.dataset.itemId);
  }

  // ------- Title edit -------
  titleEditBtn.addEventListener('click', ()=>toggleTitleEdit());
  titleEl.addEventListener('keydown', e=>{
    if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); toggleTitleEdit(false); }
  });
  titleEl.addEventListener('blur', ()=>{ if (titleEl.getAttribute('contenteditable')==='true') toggleTitleEdit(false); });

  function toggleTitleEdit(forceOff){
    const editing = titleEl.getAttribute('contenteditable')==='true';
    if (!editing && forceOff !== false){
      titleEl.setAttribute('contenteditable','true');
      titleEl.focus();
      const r = document.createRange(); r.selectNodeContents(titleEl); r.collapse(false);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    } else {
      titleEl.setAttribute('contenteditable','false');
      pushUndo();
      state.title = (titleEl.textContent||'').trim();
      saveLocal();
    }
  }

  // ------- Creator / Upload -------
  creatorForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    const text = ccText.value.trim();
    if (!text) return;
    pushUndo();
    const id = uid('item');
    state.items[id] = { id, type:'text', text, color: ccColor.value };
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
      state.items[id] = { id, type:'image', dataUrl };
      state.storage.push(id);
    }
    renderStorage(); initSortables(); saveLocal(); fileInput.value='';
  });
  const fileToDataURL = (file)=> new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(file); });

  // ------- Toolbar actions -------
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
    if (v==='clear'){
      pushUndo(); state.tiers.forEach(t=>t.items=[]); state.storage=[]; renderAll();
    }
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

  // nice colors + layout for buttons
  function styleButtons(){
    // base
    toolbar.querySelectorAll('.btn').forEach(b=>{
      b.style.border = '1px solid rgba(0,0,0,.12)';
      b.style.fontWeight = '800';
    });
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

  // ------- PNG save (live DOM capture; full board; title optional) -------
  btnSave.addEventListener('click', savePNG);

  async function savePNG(){
    // ensure fonts are ready (prevents blank captures on some iOS builds)
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch {}
    }

    // Temporarily expand every row to its full scroll width so nothing is clipped.
    const rows = QSA('.tier-items');
    const backups = rows.map(w => ({ w, overflow:w.style.overflow, width:w.style.width }));
    rows.forEach(w => { w.style.overflow='visible'; w.style.width = `${w.scrollWidth}px`; });

    // Temporarily hide the picker or legacy radial if visible
    const oldLegacy = legacyRadialEl?.style.display || '';
    if (legacyRadialEl) legacyRadialEl.style.display = 'none';
    const livePicker = document.getElementById('fstm-picker');
    const pickerWasOpen = !!livePicker;
    if (livePicker) livePicker.remove();

    // Title: include only if non-empty
    const titleWrap = QS('.title-wrap');
    const titleHiddenBefore = titleWrap.style.display || '';
    const includeTitle = !!(state.title && state.title.trim());
    if (!includeTitle) titleWrap.style.display = 'none';

    // Compute full size
    const width  = Math.max(captureArea.scrollWidth, captureArea.getBoundingClientRect().width);
    const height = Math.max(captureArea.scrollHeight, captureArea.getBoundingClientRect().height);

    try{
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg')?.trim() || '#111';
      const dataUrl = await window.htmlToImage.toPng(captureArea, {
        width, height,
        canvasWidth: width,
        canvasHeight: height,
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: bg,
        style: { transform: 'none' },
        filter: (node) => !(node && (node.id === 'fstm-picker' || node.id === 'radial'))
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `FSTM_${Date.now()}.png`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch(err){
      console.error('PNG capture failed:', err);
      alert('PNG save failed. Try again after placing at least one item.');
    } finally {
      // restore
      rows.forEach(({w,overflow,width})=>{ w.style.overflow=overflow; w.style.width=width; });
      if (!includeTitle) titleWrap.style.display = titleHiddenBefore;
      if (legacyRadialEl) legacyRadialEl.style.display = oldLegacy;
      // (picker stays closed after capture)
    }
  }

  // ------- Clean mobile picker (no arc background) -------
  // We render a temporary, background-free container with just circular buttons.
  let pickerCache = []; // labels cache for quick rebuild if needed
  function buildPickerButtonsCache(){ pickerCache = state.tiers.map(t=>({ id:t.id, label:(t.label||'?').slice(0,2).toUpperCase() })); }

  function openPicker(ev, circleEl){
    closePicker(); // ensure single instance
    buildPickerButtonsCache();

    const rect = circleEl.getBoundingClientRect();
    const W = 220, H = 120;
    const container = document.createElement('div');
    container.id = 'fstm-picker';
    Object.assign(container.style, {
      position:'fixed', left:'0', top:'0',
      transform:`translate(${Math.max(8, Math.min(rect.left + rect.width/2 - W/2, innerWidth - W - 8))}px, ${Math.max(8, Math.min(rect.top - (H + 12), innerHeight - H - 8))}px)`,
      width:`${W}px`, height:`${H}px`,
      pointerEvents:'auto', zIndex:'99999',
      background:'transparent'
    });

    const n = Math.max(1, pickerCache.length);
    const step = Math.PI / (n - 1 || 1);
    const BTN = 46;  // comfortable touch targets
    const PAD = 6;
    const minR = (BTN + PAD) / (2 * Math.sin(step/2));
    const radius = Math.max(72, minR);
    const cx = W/2, cy = H - 6;

    pickerCache.forEach((p, i)=>{
      const a = Math.PI - i*step;
      const x = cx + radius*Math.cos(a);
      const y = cy - radius*Math.sin(a);
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = p.label;
      Object.assign(b.style, {
        position:'absolute', left:`${x}px`, top:`${y}px`, transform:'translate(-50%,-50%) scale(.92)',
        width:`${BTN}px`, height:`${BTN}px`,
        borderRadius:'999px', border:'1px solid rgba(0,0,0,.18)',
        background:'#fff', color:'#0f1222', fontWeight:'900', fontSize:'18px',
        boxShadow:'0 8px 20px rgba(0,0,0,.25)', transition:'transform 160ms ease, opacity 160ms ease',
        opacity:'0'
      });
      requestAnimationFrame(()=>{ b.style.transform='translate(-50%,-50%) scale(1)'; b.style.opacity='1'; });
      b.addEventListener('click', ()=>{
        placePickerTargetIntoTier(p.id, circleEl.dataset.itemId);
        closePicker();
      });
      container.appendChild(b);
    });

    // close on outside tap
    const onOutside = (e)=>{ if (!container.contains(e.target)) closePicker(); };
    setTimeout(()=> document.addEventListener('pointerdown', onOutside, { once:true, capture:true }), 0);

    document.body.appendChild(container);
  }

  function closePicker(){
    const el = document.getElementById('fstm-picker');
    if (el) el.remove();
  }

  function placePickerTargetIntoTier(tierId, itemId){
    if (!itemId) return;
    pushUndo();
    // remove from storage or any row
    state.storage = state.storage.filter(id=>id!==itemId);
    state.tiers.forEach(t=> t.items = t.items.filter(id=>id!==itemId));
    // add to chosen tier
    const tier = state.tiers.find(t=>t.id===tierId);
    if (tier) tier.items.push(itemId);
    renderBoard(); renderStorage(); initSortables(); saveLocal();
  }

  // ------- helpers -------
  function nextLabel(){
    const labels = state.tiers.map(t=>t.label.toUpperCase());
    for (let c=69;c<=90;c++){ const ch=String.fromCharCode(c); if (!labels.includes(ch)) return ch; }
    return 'NEW';
  }

  // prevent scroll during drag
  document.addEventListener('touchmove', (e)=>{
    if (document.querySelector('.dragging')) e.preventDefault();
  }, { passive:false });

  // ------- init -------
  function init(){
    // theme
    applyTheme(localStorage.getItem(THEME_KEY) || 'dark');

    // load
    const loaded = loadLocal();
    state = loaded || newDefaultState();
    if (!loaded) seedIfEmpty();

    // remove any old arc background element visually
    if (legacyRadialEl) legacyRadialEl.style.display = 'none';

    renderAll();

    // refit text on resize
    window.addEventListener('resize', debounced(()=>{
      QSA('.circle').forEach(c=>{
        const t = QS('.circle-text', c);
        if (t) fitCircleText(t, c);
      });
    }, 150));

    btnUndo.disabled = true;
  }

  init();
})();