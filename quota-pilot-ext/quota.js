// Usage-window math. Shared by background, popup and content script.
(function (root) {
  const H = 3600e3, M = 60e3;

  // Example caps only. Every plan differs and vendors change limits; the user edits these in the popup.
  const DEFAULT_SITES = {
    chatgpt: { name: "ChatGPT", host: "chatgpt.com", mode: "session", windowH: 5, cap: 40 },
    claude: { name: "Claude", host: "claude.ai", mode: "session", windowH: 5, cap: 45 },
    gemini: { name: "Gemini", host: "gemini.google.com", mode: "rolling", windowH: 24, cap: 100 },
  };

  const siteFromHost = host => Object.keys(DEFAULT_SITES).find(k => host.endsWith(DEFAULT_SITES[k].host)) || null;

  const fmtDur = ms => {
    if (ms == null || !isFinite(ms)) return "—";
    if (ms <= 0) return "now";
    const m = Math.round(ms / M);
    if (m < 60) return m + "m";
    return Math.floor(m / 60) + "h " + String(m % 60).padStart(2, "0") + "m";
  };
  const fmtTime = t => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  // times: sorted array of ms timestamps for one site
  function status(cfg, times, t = Date.now()) {
    const W = cfg.windowH * H;
    const mine = times.filter(x => x <= t);
    let used = 0, windowStart = null, resetAt = null, nextFree = null;
    if (cfg.mode === "session") {
      let s = null;
      for (const x of mine) if (s === null || x >= s + W) s = x;
      if (s !== null && t < s + W) { windowStart = s; resetAt = s + W; used = mine.filter(x => x >= s).length; }
    } else {
      const inWin = mine.filter(x => x > t - W);
      used = inWin.length;
      if (used) { nextFree = inWin[0] + W; resetAt = inWin[inWin.length - 1] + W; }
    }
    const remaining = Math.max(0, cfg.cap - used);
    const lastHour = mine.filter(x => x > t - H).length;
    const elapsedH = windowStart ? Math.max(0.5, (t - windowStart) / H) : 1;
    const rate = Math.max(lastHour, cfg.mode === "session" && windowStart ? used / elapsedH : 0);
    const toEmpty = rate > 0 ? (remaining / rate) * H : Infinity;
    const resetIn = resetAt ? resetAt - t : null;

    let level = "ok", tag = "On pace", advice;
    if (!used) { level = "info"; tag = "Fresh"; advice = cfg.mode === "session" ? `Your first message starts a ${cfg.windowH}h window.` : `${cfg.cap} messages available.`; }
    else if (remaining === 0) { level = "crit"; tag = "Capped"; advice = `Frees up at ${fmtTime(cfg.mode === "session" ? resetAt : nextFree)}.`; }
    else if (cfg.mode === "session" && resetIn <= 45 * M && remaining / cfg.cap >= 0.2) { level = "warn"; tag = "Use it or lose it"; advice = `${remaining} messages expire at ${fmtTime(resetAt)}. Spend them on heavy tasks now.`; }
    else if (resetIn != null && toEmpty < resetIn && used >= Math.max(5, cfg.cap * 0.15)) { level = "crit"; tag = "Burning fast"; advice = `At ${Math.round(rate)}/h you hit the cap around ${fmtTime(t + toEmpty)}, ${fmtDur(resetIn - toEmpty)} before reset.`; }
    else advice = cfg.mode === "session" ? `Resets at ${fmtTime(resetAt)}.` : `Oldest message ages out at ${fmtTime(nextFree)}.`;

    return { used, remaining, cap: cfg.cap, resetAt, resetIn, nextFree, rate, toEmpty, level, tag, advice, windowStart };
  }

  root.QP = Object.assign(root.QP || {}, { DEFAULT_SITES, siteFromHost, status, fmtDur, fmtTime, H, M });
})(typeof self !== "undefined" ? self : globalThis);
