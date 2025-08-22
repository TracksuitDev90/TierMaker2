/* =========================
   Tier Maker — Clean Build
   ========================= */

(() => {
  const TIERS = ["S","A","B","C","D"]; // canonical order
  const overlayRoot = document.getElementById("overlayRoot");
  const board = document.getElementById("tierBoard");
  const tray = document.getElementById("itemsTray");
  const themeToggle = document.getElementById("themeToggle");
  const savePngBtn = document.getElementById("savePngBtn");
  const form = document.getElementById("createForm");
  const input = document.getElementById("newItemText");
  const seedBtn = document.getElementById("seedBtn");
  const appRoot = document.getElementById("appRoot");

  let openPickerEl = null;
  let openMenuEl = null;
  let dragState = null; // active drag record

  /* ---------- Theme ---------- */
  const savedTheme = localStorage.getItem("tier.theme");
  if (savedTheme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    themeToggle.checked = true;
  }
  themeToggle.addEventListener("change", () => {
    const mode = themeToggle.checked ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", mode);
    localStorage.setItem("tier.theme", mode);
  });

  /* ---------- Build Rows ---------- */
  function buildBoard() {
    board.innerHTML = "";
    TIERS.forEach(t => board.appendChild(makeRow(t)));
  }

  function makeRow(tier) {
    const row = document.createElement("div");
    row.className = "tier-row";
    row.dataset.tier = tier;

    const label = document.createElement("div");
    label.className = "tier-label";
    label.dataset.tier = tier;

    const title = document.createElement("span");
    title.textContent = tier;

    // Kebab button
    const kebab = document.createElement("button");
    kebab.className = "kebab";
    kebab.setAttribute("aria-haspopup", "menu");
    kebab.setAttribute("aria-expanded", "false");
    kebab.setAttribute("aria-label", `Open row menu for ${tier}`);

    // three dots
    for (let i=0;i<3;i++){
      const dot = document.createElement("div");
      dot.className = "dot";
      kebab.appendChild(dot);
    }

    label.append(title, kebab);

    const drop = document.createElement("div");
    drop.className = "tier-drop";
    drop.setAttribute("aria-label", `Drop items on ${tier} tier`);
    drop.dataset.tierDrop = tier;

    row.append(label, drop);
    return row;
  }

  buildBoard();

  /* ---------- Create/Seed Items ---------- */
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = input.value.trim();
    if (!val) return;
    tray.appendChild(makeItem(val));
    input.value = "";
    input.focus();
  });

  seedBtn.addEventListener("click", () => {
    ["Alpha","Beta","Gamma","Delta","Epsilon","Zeta","Eta","Theta","Iota"].forEach(t => {
      tray.appendChild(makeItem(t));
    });
  });

  let itemIdSeq = 1;
  function makeItem(label) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "item";
    el.textContent = glyph(label);
    el.title = label;
    el.dataset.itemId = String(itemIdSeq++);
    el.setAttribute("aria-label", `Item ${label}`);
    el.setAttribute("tabindex", "0");

    enableItemInteractions(el);
    return el;
  }

  // Simple glyph: first letter(s)
  function glyph(label) {
    const parts = label.trim().split(/\s+/);
    const g = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
    return g.toUpperCase() || "•";
  }

  /* ---------- Item interactions (tap opens picker; drag for desktop) ---------- */
  function enableItemInteractions(el){
    // Open picker on click/tap
    el.addEventListener("click", (e) => {
      // If a drag just ended, ignore the click that follows
      if (dragState?.justDropped) { dragState.justDropped = false; return; }
      openPickerFor(el);
    });

    // Keyboard: Enter or Space opens picker
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.code === "Space") {
        e.preventDefault();
        openPickerFor(el);
      }
    });

    // Pointer-based dragging (prevents OS file/window drags)
    el.addEventListener("dragstart", (e) => e.preventDefault()); // kill native DnD
    el.addEventListener("pointerdown", onPointerDown);
  }

  function onPointerDown(e){
    const target = e.currentTarget;
    // Left button or primary touch only
    if (e.button !== 0 && e.pointerType !== "touch") return;

    // Start drag only on long-press for touch; immediate for mouse/pen
    const startPoint = { x: e.clientX, y: e.clientY, t: performance.now() };
    let longPressTimer = null;
    let moved = false;

    const startDrag = () => {
      // Build drag state
      dragState = {
        item: target,
        pointerId: e.pointerId,
        ghost: null,
        offsetX: 0,
        offsetY: 0,
        justDropped: false
      };

      // Prevent page gestures while dragging this element
      target.setPointerCapture(e.pointerId);
      target.classList.add("dragging");
      target.style.touchAction = "none";

      // Ghost element (fixed) so we never fight grid layout
      const rect = target.getBoundingClientRect();
      const ghost = target.cloneNode(true);
      ghost.style.position = "fixed";
      ghost.style.left = `${rect.left}px`;
      ghost.style.top = `${rect.top}px`;
      ghost.style.zIndex = 999;
      ghost.style.pointerEvents = "none";
      overlayRoot.appendChild(ghost);

      dragState.ghost = ghost;
      dragState.offsetX = e.clientX - rect.left;
      dragState.offsetY = e.clientY - rect.top;

      // Close overlays while dragging
      closePicker();
      closeMenu();

      window.addEventListener("pointermove", onPointerMove, { passive: false });
      window.addEventListener("pointerup", onPointerUp, { passive: false });
      window.addEventListener("pointercancel", onPointerUp, { passive: false });
    };

    // For touch: require slight hold (150ms) unless user obviously moves
    if (e.pointerType === "touch") {
      longPressTimer = setTimeout(() => {
        startDrag();
      }, 150);
    } else {
      startDrag();
    }

    function cancelTimers(){
      if (longPressTimer){ clearTimeout(longPressTimer); longPressTimer = null; }
    }

    function onPointerMove(ev){
      if (!dragState) return;
      // If user moved before long press, start drag immediately
      if (e.pointerId === ev.pointerId && !dragState.ghost && e.pointerType === "touch") {
        const dx = Math.abs(ev.clientX - startPoint.x);
        const dy = Math.abs(ev.clientY - startPoint.y);
        if (dx + dy > 6) { cancelTimers(); }
        return;
      }

      if (!dragState.ghost) return;
      ev.preventDefault(); // prevent scrolling during drag
      moved = true;

      const x = ev.clientX - dragState.offsetX;
      const y = ev.clientY - dragState.offsetY;
      dragState.ghost.style.left = `${x}px`;
      dragState.ghost.style.top = `${y}px`;
    }

    function onPointerUp(ev){
      cancelTimers();

      if (dragState && dragState.ghost){
        // Drop target resolution
        const dropAt = document.elementFromPoint(ev.clientX, ev.clientY);
        const dropZone = dropAt?.closest?.(".tier-drop, #itemsTray");

        if (dropZone){
          dropZone.appendChild(dragState.item);
          dragState.justDropped = true; // avoid opening picker due to click-after-drag
        }

        // Cleanup
        dragState.item.classList.remove("dragging");
        dragState.item.style.touchAction = "";
        dragState.item.releasePointerCapture(dragState.pointerId);
        dragState.ghost.remove();
        dragState = null;
      }

      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    }
  }

  /* ---------- Radial Picker ---------- */
  function closePicker(){
    if (openPickerEl){ openPickerEl.remove(); openPickerEl = null; }
  }

  function openPickerFor(itemEl){
    closePicker(); // always one
    const picker = buildPicker();
    document.body.appendChild(picker);
    openPickerEl = picker;

    // Position logic: prefer below the circle; clamp inside viewport.
    const r = itemEl.getBoundingClientRect();
    const radius = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--picker-radius"));
    const pad = 8;

    // Default below
    let top = r.bottom + pad;
    // If it would overflow bottom, place above
    if (top + radius > window.innerHeight) {
      top = r.top - radius - pad;
    }
    // Center horizontally around the circle
    let left = r.left + r.width / 2 - radius / 2;

    // Clamp inside viewport with padding
    left = Math.min(Math.max(left, pad), window.innerWidth - radius - pad);
    top  = Math.min(Math.max(top, pad), window.innerHeight - radius - pad);

    picker.style.top = `${top}px`;
    picker.style.left = `${left}px`;

    // Outside click should NOT auto-close the picker
    // (per request: the picker closes only after choosing a tier)
  }

  function buildPicker(){
    const el = document.createElement("div");
    el.className = "picker";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Choose a tier");
    const grid = document.createElement("div");
    grid.className = "picker-grid";
    el.appendChild(grid);

    // Place buttons in a circle, keeping canonical order S A B C D clockwise
    const R = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--picker-radius")) / 2 - 32;
    const center = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--picker-radius")) / 2;
    // Angles: 270, 342, 54, 126, 198 deg (spaced evenly, starting at top)
    const angles = [270, 342, 54, 126, 198];

    TIERS.forEach((tier, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "picker-btn";
      btn.dataset.tier = tier;
      btn.textContent = tier;
      btn.setAttribute("aria-label", `Place in ${tier} tier`);

      const rad = angles[i] * Math.PI / 180;
      const x = center + R * Math.cos(rad);
      const y = center + R * Math.sin(rad);

      btn.style.left = `${x - 22}px`;
      btn.style.top  = `${y - 22}px`;

      btn.addEventListener("click", () => {
        // Find the most recently focused/active item; fallback to last clicked
        const active = document.activeElement?.classList?.contains("item") ? document.activeElement : lastClickedItem();
        const item = active || findAnyItem();
        if (!item) { closePicker(); return; }

        const dropZone = board.querySelector(`.tier-drop[data-tier-drop="${tier}"]`);
        dropZone.appendChild(item);
        closePicker();
      });

      grid.appendChild(btn);
    });

    return el;
  }

  let _lastClickedItem = null;
  function lastClickedItem(){ return _lastClickedItem; }
  function findAnyItem(){ return document.querySelector(".item"); }

  // Track last clicked item for picker targeting
  appRoot.addEventListener("click", (e) => {
    const it = e.target.closest?.(".item");
    if (it) _lastClickedItem = it;
  }, true);

  /* ---------- Kebab Menu ---------- */
  function closeMenu(){
    if (openMenuEl){ openMenuEl.remove(); openMenuEl = null; }
    document.querySelectorAll(".kebab[aria-expanded='true']").forEach(k => k.setAttribute("aria-expanded","false"));
  }

  board.addEventListener("click", (e) => {
    const kebab = e.target.closest(".kebab");
    if (!kebab) return;
    e.stopPropagation();

    if (openMenuEl){ closeMenu(); }

    kebab.setAttribute("aria-expanded", "true");
    const row = kebab.closest(".tier-row");
    openMenuEl = buildMenuForRow(row);

    document.body.appendChild(openMenuEl);
    positionMenuAtButton(openMenuEl, kebab);
  });

  function buildMenuForRow(row){
    const menu = document.createElement("div");
    menu.className = "menu";
    menu.setAttribute("role","menu");

    const ul = document.createElement("ul");
    menu.appendChild(ul);

    const btns = [
      { id: "rename", text: "Rename Tier…" },
      { id: "clear",  text: "Clear Items"  },
      { id: "color",  text: "Change Color…" }
    ];

    for (const b of btns){
      const li = document.createElement("li");
      const bt = document.createElement("button");
      bt.type = "button";
      bt.dataset.action = b.id;
      bt.textContent = b.text;
      bt.setAttribute("role","menuitem");
      li.appendChild(bt);
      ul.appendChild(li);
    }

    menu.addEventListener("click", (e) => {
      const action = e.target.closest("button")?.dataset?.action;
      if (!action) return;
      if (action === "rename"){
        const current = row.querySelector(".tier-label span").textContent.trim();
        const name = prompt("Rename tier label:", current);
        if (name && name.trim()){
          row.querySelector(".tier-label span").textContent = name.trim();
        }
        // keep menu open until an explicit choice is made; rename counts as a choice
        closeMenu();
      } else if (action === "clear"){
        row.querySelectorAll(".tier-drop .item").forEach(n => tray.appendChild(n));
        closeMenu();
      } else if (action === "color"){
        const c = prompt("Enter a CSS color (e.g., #ffcc66 or rgb(10 200 100)):");
        if (c){
          row.querySelector(".tier-label").style.background = c;
        }
        closeMenu();
      }
    });

    // Close only on outside click or Escape; not on hover/blur
    setTimeout(() => {
      const onDocClick = (ev) => {
        if (!menu.contains(ev.target)) {
          closeMenu();
          document.removeEventListener("click", onDocClick);
          document.removeEventListener("keydown", onKey);
        }
      };
      const onKey = (ev) => {
        if (ev.key === "Escape"){ closeMenu(); document.removeEventListener("click", onDocClick); document.removeEventListener("keydown", onKey); }
      };
      document.addEventListener("click", onDocClick);
      document.addEventListener("keydown", onKey);
    }, 0);

    return menu;
  }

  function positionMenuAtButton(menu, btn){
    const r = btn.getBoundingClientRect();
    const pad = 8;
    let left = r.right + 8;
    let top  = r.top;

    // If it goes offscreen to the right, place to the left
    const w = 220; // approximate
    if (left + w > window.innerWidth - pad) left = r.left - w - 8;

    // Clamp vertically
    menu.style.left = `${Math.max(pad, Math.min(left, window.innerWidth - w - pad))}px`;
    menu.style.top  = `${Math.max(pad, Math.min(top, window.innerHeight - 160))}px`;
  }

  /* ---------- Save PNG ---------- */
  savePngBtn.addEventListener("click", async () => {
    try{
      // Use board only (not tray), so results match expectations
      const node = board;
      // Ensure external images (if any) can draw without tainting
      node.querySelectorAll("img").forEach(img => img.setAttribute("crossorigin", "anonymous"));

      const theme = document.documentElement.getAttribute("data-theme") || "light";
      const canvas = await html2canvas(node, {
        backgroundColor: theme === "dark" ? "#0b1220" : "#ffffff",
        useCORS: true,
        scale: Math.min(2, window.devicePixelRatio || 1.5)
      });
      const data = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = data;
      a.download = "tier-board.png";
      a.click();
    } catch (err){
      alert("Unable to save PNG. Try a desktop browser if the problem persists.");
      console.error(err);
    }
  });

  /* ---------- Accessibility niceties ---------- */
  // Keep “Help” link color visible across themes handled by CSS tokens.

  /* ---------- Utilities ---------- */
  function closeAllOverlays(){
    closePicker();
    closeMenu();
  }

  // Only close overlays when clicking outside both overlays and interactive anchors
  document.addEventListener("click", (e) => {
    const withinMenu = openMenuEl && openMenuEl.contains(e.target);
    const onKebab = e.target.closest?.(".kebab");
    const withinPicker = openPickerEl && openPickerEl.contains(e.target);
    const onItem = e.target.closest?.(".item");

    if (!withinMenu && !onKebab && !withinPicker && !onItem){
      closeAllOverlays();
    }
  });

  // Keep picker order consistent no matter placement (handled by static TIERS array and fixed angle map)

  // Prevent accidental text selection when dragging fast
  document.addEventListener("selectstart", (e) => {
    if (dragState) e.preventDefault();
  });

})();
