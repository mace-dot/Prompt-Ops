const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function render() {
  const { sites = {}, log = {} } = await chrome.storage.local.get(["sites", "log"]);
  const wrap = $("sites");
  const open = new Set([...wrap.querySelectorAll("details[open]")].map(d => d.dataset.k));
  wrap.innerHTML = "";
  wrap.style.cssText = "display:grid;gap:10px";
  for (const k of Object.keys(QP.DEFAULT_SITES)) {
    const cfg = { ...QP.DEFAULT_SITES[k], ...(sites[k] || {}) };
    const s = QP.status(cfg, log[k] || []);
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="head"><b>${esc(cfg.name)}</b><span class="pill ${s.level}">${s.tag}</span></div>
      <div class="bar"><i style="width:${Math.min(100, s.used / cfg.cap * 100)}%"></i></div>
      <div class="row mono" style="justify-content:space-between">
        <span>${s.remaining}/${cfg.cap} left</span>
        <span>${cfg.mode === "session" ? "resets " + QP.fmtDur(s.resetIn) : "next slot " + QP.fmtDur(s.nextFree ? s.nextFree - Date.now() : null)}</span>
        <span>${Math.round(s.rate)}/h</span>
      </div>
      <p class="adv">${s.advice}</p>
      <details data-k="${k}" ${open.has(k) ? "open" : ""}><summary>Limits and corrections</summary>
        <div class="cfg">
          <label>Reset rule<select data-k="${k}" data-f="mode">
            <option value="session" ${cfg.mode === "session" ? "selected" : ""}>From 1st msg</option>
            <option value="rolling" ${cfg.mode === "rolling" ? "selected" : ""}>Rolling</option></select></label>
          <label>Window (h)<input type="number" min="0.5" step="0.5" value="${cfg.windowH}" data-k="${k}" data-f="windowH"></label>
          <label>Cap (msgs)<input type="number" min="1" value="${cfg.cap}" data-k="${k}" data-f="cap"></label>
        </div>
        <div class="row" style="margin-top:6px">
          <button data-act="add" data-k="${k}">+1 message</button>
          <button data-act="undo" data-k="${k}">Remove last</button>
          <button data-act="reset" data-k="${k}">Clear window</button>
        </div>
      </details>`;
    wrap.appendChild(card);
  }
}

document.addEventListener("change", async e => {
  const el = e.target; if (!el.dataset.f) return;
  const { sites = {} } = await chrome.storage.local.get("sites");
  sites[el.dataset.k] = { ...(sites[el.dataset.k] || {}), [el.dataset.f]: el.type === "number" ? Math.max(0.5, +el.value || 1) : el.value };
  await chrome.storage.local.set({ sites });
});
document.addEventListener("click", e => {
  const b = e.target.closest("button[data-act]"); if (!b) return;
  chrome.runtime.sendMessage({ type: b.dataset.act, site: b.dataset.k, t: Date.now() });
});
chrome.storage.onChanged.addListener(render);

function renderTrim() {
  const src = $("in").value, out = QP.trimPrompt(src);
  $("out").value = out;
  $("tc").textContent = `${QP.estimateTokens(src)} → ${QP.estimateTokens(out)} tok`;
  $("tips").innerHTML = QP.promptTips(src).map(t => `<li>${esc(t)}</li>`).join("");
}
$("in").addEventListener("input", renderTrim);
$("copy").onclick = () => navigator.clipboard.writeText($("out").value).then(() => $("msg").textContent = "Copied.", () => { $("out").select(); $("msg").textContent = "Press Cmd+C."; });

render(); renderTrim();
setInterval(render, 30e3);
