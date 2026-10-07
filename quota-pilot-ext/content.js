// Runs on chatgpt.com, claude.ai, gemini.google.com.
// Pill: live token count + remaining quota. Preview is non-destructive (original stays in the box).
(() => {
  const site = QP.siteFromHost(location.hostname);
  if (!site) return;

  // Selectors change when sites redesign; the generic fallbacks keep it working most of the time.
  const EDITOR_SELECTORS = {
    chatgpt: ["#prompt-textarea", "div.ProseMirror[contenteditable='true']", "textarea"],
    claude: ["div.ProseMirror[contenteditable='true']", "[contenteditable='true'][role='textbox']", "textarea"],
    gemini: ["rich-textarea .ql-editor", ".ql-editor[contenteditable='true']", "textarea"],
  }[site];
  const SEND_SELECTOR = "button[data-testid='send-button'], button[aria-label*='Send' i], button[aria-label*='Submit' i]";

  const isEditable = el => el && (el.tagName === "TEXTAREA" || el.isContentEditable);
  const visible = el => el && el.offsetParent !== null;
  function findEditor() {
    const a = document.activeElement;
    if (isEditable(a)) return a;
    for (const sel of EDITOR_SELECTORS) {
      const el = [...document.querySelectorAll(sel)].find(visible);
      if (el) return el;
    }
    return null;
  }
  const getText = el => (el.tagName === "TEXTAREA" ? el.value : el.innerText).replace(/\u200b/g, "");

  function setText(el, text) {
    el.focus();
    if (el.tagName === "TEXTAREA") {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      setter.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    // Select everything, then paste so ProseMirror/Quill update their own state.
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    const dt = new DataTransfer(); dt.setData("text/plain", text);
    const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    if (!ev.defaultPrevented) document.execCommand("insertText", false, text);
  }

  function findSendButton() {
    return [...document.querySelectorAll(SEND_SELECTOR)].find(b => visible(b) && !b.disabled) || null;
  }

  // ---------- UI (shadow DOM so the site's CSS can't touch it) ----------
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;right:16px;bottom:96px;z-index:2147483646";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host{all:initial}
      .wrap{display:flex;flex-direction:column;align-items:flex-end;gap:8px;font:12px/1.35 ui-monospace,Menlo,monospace}
      .pill{display:flex;align-items:center;gap:8px;padding:6px 6px 6px 10px;border-radius:99px;
        background:#18202b;color:#e6ebf1;box-shadow:0 4px 16px rgba(0,0,0,.25);border:1px solid #2c3743}
      .dot{width:8px;height:8px;border-radius:50%;background:#4cc38a;flex:0 0 auto}
      .dot.warn{background:#f2b441}.dot.crit{background:#f0695d}.dot.info{background:#6fa8e8}
      button{font:600 12px/1 system-ui,sans-serif;border:0;border-radius:99px;padding:6px 10px;cursor:pointer;background:#f2a531;color:#1a1206}
      button.ghost{background:#2c3743;color:#e6ebf1}
      button[disabled]{background:#2c3743;color:#97a3b3;cursor:default}
      .panel{width:320px;background:#18202b;color:#e6ebf1;border:1px solid #2c3743;border-radius:12px;
        padding:10px 12px;box-shadow:0 8px 24px rgba(0,0,0,.3);display:grid;gap:8px}
      .panel h3{margin:0;font:600 12px/1.2 system-ui,sans-serif;display:flex;justify-content:space-between;align-items:center;gap:8px}
      .preview{max-height:140px;overflow:auto;white-space:pre-wrap;word-break:break-word;background:#11161d;border:1px solid #2c3743;
        border-radius:8px;padding:8px;font:12px/1.4 ui-monospace,Menlo,monospace;color:#e6ebf1}
      .actions{display:flex;flex-wrap:wrap;gap:6px}
      .tips{margin:0;padding-left:16px;font:12px/1.4 system-ui,sans-serif;color:#c5ced8}
      .row{display:flex;align-items:center;gap:6px;font:12px/1.3 system-ui,sans-serif;color:#c5ced8}
      .row input{accent-color:#f2a531}
      .muted{color:#97a3b3}
      .hide{display:none !important}
      .save{color:#4cc38a;font-weight:600}
    </style>
    <div class="wrap">
      <div class="panel hide" id="panel">
        <h3>
          <span>Optimized preview</span>
          <span class="muted" id="stats">0 → 0</span>
        </h3>
        <div class="preview" id="preview"></div>
        <ul class="tips hide" id="tips"></ul>
        <label class="row"><input type="checkbox" id="prefer"> Prefer compressed when I send</label>
        <div class="actions">
          <button id="sendComp" type="button">Send compressed</button>
          <button class="ghost" id="apply" type="button">Apply to box</button>
          <button class="ghost" id="dismiss" type="button">Keep original</button>
        </div>
      </div>
      <div class="pill" id="pill" title="Quota Pilot">
        <span class="dot" id="dot"></span>
        <span id="quota">—</span>
        <span class="muted">·</span>
        <span id="tok">0 tok</span>
        <button id="trim" disabled type="button">Preview</button>
      </div>
    </div>`;
  document.documentElement.appendChild(host);
  const $ = id => shadow.getElementById(id);

  let preferCompressed = false;
  let panelOpen = false;
  let pending = null; // { original, compressed, before, after, saved }
  let lastOriginal = null; // only set after Apply / Send compressed writes the box
  let swapping = false; // avoid double-count while we rewrite then click Send

  chrome.storage.local.get("preferCompressed").then(d => {
    preferCompressed = !!d.preferCompressed;
    $("prefer").checked = preferCompressed;
  }).catch(() => {});

  $("prefer").addEventListener("change", () => {
    preferCompressed = $("prefer").checked;
    try { chrome.storage.local.set({ preferCompressed }); } catch {}
  });

  function hidePanel() {
    panelOpen = false;
    $("panel").classList.add("hide");
  }

  function showPanel() {
    panelOpen = true;
    $("panel").classList.remove("hide");
  }

  function compute() {
    const ed = findEditor();
    const original = ed ? getText(ed) : "";
    const compressed = QP.trimPrompt(original);
    const before = QP.estimateTokens(original);
    const after = QP.estimateTokens(compressed);
    const saved = before ? Math.round((1 - after / before) * 100) : 0;
    const changed = compressed !== original.trim() && compressed !== original && saved >= 3;
    return { ed, original, compressed, before, after, saved, changed, tips: QP.promptTips(original) };
  }

  function renderPreview(state) {
    pending = state;
    $("stats").innerHTML = state.changed
      ? `<span class="save">−${state.saved}%</span> ${state.before} → ${state.after} tok`
      : `${state.before} tok`;
    $("preview").textContent = state.changed ? state.compressed : (state.original.trim() || "(empty)");
    const tips = $("tips");
    if (state.tips.length) {
      tips.innerHTML = state.tips.map(t => `<li>${t}</li>`).join("");
      tips.classList.remove("hide");
    } else {
      tips.innerHTML = "";
      tips.classList.add("hide");
    }
    $("sendComp").disabled = !state.changed;
    $("apply").disabled = !state.changed;
  }

  function refreshTokens() {
    const state = compute();
    $("tok").textContent = state.changed ? `${state.before}→${state.after}` : `${state.before} tok`;
    const btn = $("trim");
    btn.disabled = !state.original.trim();
    btn.textContent = state.changed ? `Preview −${state.saved}%` : "Preview";
    if (panelOpen) renderPreview(state);
  }

  function openPreview() {
    const state = compute();
    if (!state.original.trim()) return;
    renderPreview(state);
    showPanel();
    if (!state.changed && state.tips.length === 0) {
      $("preview").textContent = "Already lean — nothing local compression can cut.";
    }
  }

  function applyCompressed({ thenSend } = {}) {
    const state = pending || compute();
    if (!state.ed || !state.changed) return false;
    lastOriginal = state.original;
    setText(state.ed, state.compressed);
    refreshTokens();
    if (thenSend) {
      swapping = true;
      const send = findSendButton();
      setTimeout(() => {
        if (send) send.click();
        else {
          state.ed.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
        }
        setTimeout(() => { swapping = false; }, 400);
      }, 40);
    }
    return true;
  }

  $("trim").addEventListener("click", openPreview);
  $("dismiss").addEventListener("click", () => { hidePanel(); lastOriginal = null; });
  $("apply").addEventListener("click", () => {
    if (!applyCompressed()) return;
    hidePanel();
  });
  $("sendComp").addEventListener("click", () => {
    if (!applyCompressed({ thenSend: true })) return;
    hidePanel();
  });

  // ---------- quota display ----------
  async function refreshQuota() {
    let data;
    try { data = await chrome.storage.local.get(["sites", "log"]); } catch { return; }
    const cfg = { ...QP.DEFAULT_SITES[site], ...(data.sites || {})[site] };
    const s = QP.status(cfg, (data.log || {})[site] || []);
    $("quota").textContent = `${s.remaining}/${cfg.cap}` + (s.resetIn != null && cfg.mode === "session" ? ` · ${QP.fmtDur(s.resetIn)}` : "");
    $("dot").className = "dot " + s.level;
    $("pill").title = `${cfg.name}: ${s.tag}. ${s.advice}`;
  }
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "local") return;
    if (ch.preferCompressed) {
      preferCompressed = !!ch.preferCompressed.newValue;
      $("prefer").checked = preferCompressed;
    }
    refreshQuota();
  });

  // ---------- count sent messages + optional auto-compress on send ----------
  let lastSent = 0;
  function recordSend() {
    if (swapping) return;
    const t = Date.now();
    if (t - lastSent < 1500) return;
    lastSent = t;
    try { chrome.runtime.sendMessage({ type: "sent", site, t }); } catch {}
  }

  function maybeSwapBeforeSend(ed) {
    if (!preferCompressed || !ed || swapping) return false;
    const original = getText(ed);
    const compressed = QP.trimPrompt(original);
    const before = QP.estimateTokens(original);
    const after = QP.estimateTokens(compressed);
    const saved = before ? Math.round((1 - after / before) * 100) : 0;
    if (saved < 3 || compressed === original || compressed === original.trim()) return false;
    lastOriginal = original;
    swapping = true;
    setText(ed, compressed);
    return true;
  }

  document.addEventListener("keydown", e => {
    if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
    const ed = findEditor();
    if (!ed || !(ed === e.target || ed.contains(e.target)) || !getText(ed).trim()) return;
    if (maybeSwapBeforeSend(ed)) {
      e.preventDefault();
      e.stopPropagation();
      setTimeout(() => {
        const send = findSendButton();
        if (send) send.click();
        else ed.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
        setTimeout(() => { swapping = false; recordSend(); }, 400);
      }, 40);
      return;
    }
    recordSend();
  }, true);

  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest(SEND_SELECTOR);
    if (!b || b.disabled) return;
    const ed = findEditor();
    if (!ed || !getText(ed).trim()) return;
    if (maybeSwapBeforeSend(ed)) {
      e.preventDefault();
      e.stopPropagation();
      setTimeout(() => {
        const send = findSendButton();
        if (send) send.click();
        setTimeout(() => { swapping = false; recordSend(); }, 400);
      }, 40);
      return;
    }
    recordSend();
  }, true);

  let raf = 0;
  document.addEventListener("input", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(refreshTokens); }, true);
  chrome.runtime.onMessage.addListener(msg => { if (msg && msg.type === "trim") openPreview(); });

  refreshTokens(); refreshQuota();
  setInterval(refreshQuota, 30e3);
})();
