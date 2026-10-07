// Service worker: stores sent-message timestamps, runs alerts, sets the toolbar badge.
importScripts("quota.js");

const KEEP_MS = 48 * QP.H;

async function load() {
  const d = await chrome.storage.local.get(["sites", "log", "notified"]);
  return { sites: d.sites || {}, log: d.log || {}, notified: d.notified || {} };
}
const cfgFor = (sites, k) => ({ ...QP.DEFAULT_SITES[k], ...(sites[k] || {}) });

async function check() {
  const { sites, log, notified } = await load();
  let worst = null;
  for (const k of Object.keys(QP.DEFAULT_SITES)) {
    const cfg = cfgFor(sites, k);
    const s = QP.status(cfg, log[k] || []);
    if (s.used && (!worst || s.remaining / s.cap < worst.s.remaining / worst.s.cap)) worst = { k, cfg, s };
    // Notify once per site, alert type and window.
    if (s.level === "warn" || s.level === "crit") {
      const key = `${k}:${s.tag}:${s.windowStart || s.resetAt}`;
      if (!notified[key]) {
        notified[key] = Date.now();
        chrome.notifications.create(key, { type: "basic", iconUrl: "icons/icon128.png", title: `${cfg.name}: ${s.tag}`, message: s.advice, priority: 1 });
      }
    }
  }
  for (const key of Object.keys(notified)) if (Date.now() - notified[key] > KEEP_MS) delete notified[key];
  await chrome.storage.local.set({ notified });

  if (worst) {
    chrome.action.setBadgeText({ text: String(worst.s.remaining) });
    chrome.action.setBadgeBackgroundColor({ color: { ok: "#1f8a5b", info: "#2f6fb5", warn: "#c27c00", crit: "#c8372d" }[worst.s.level] });
    chrome.action.setTitle({ title: `Quota Pilot: ${worst.cfg.name} ${worst.s.remaining}/${worst.s.cap} left. ${worst.s.advice}` });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (!msg) return;
  (async () => {
    const { log } = await load();
    if (msg.type === "sent" || msg.type === "add") {
      const arr = (log[msg.site] || []).filter(t => Date.now() - t < KEEP_MS);
      arr.push(msg.t || Date.now()); arr.sort((a, b) => a - b);
      log[msg.site] = arr;
    } else if (msg.type === "undo") {
      (log[msg.site] || []).pop();
    } else if (msg.type === "reset") {
      log[msg.site] = [];
    } else return;
    await chrome.storage.local.set({ log });
    await check();
    reply && reply({ ok: true });
  })();
  return true;
});

chrome.commands.onCommand.addListener(async cmd => {
  if (cmd !== "trim-prompt") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) chrome.tabs.sendMessage(tab.id, { type: "trim" }).catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => { chrome.alarms.create("tick", { periodInMinutes: 1 }); check(); });
chrome.runtime.onStartup.addListener(() => { chrome.alarms.create("tick", { periodInMinutes: 1 }); check(); });
chrome.alarms.onAlarm.addListener(a => { if (a.name === "tick") check(); });
chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && ch.sites) check(); });
