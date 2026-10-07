// Prompt trimmer. Shared by the content script and the popup (plain global, no modules).
(function (root) {
  const RULES = [
    // greetings at the very start ("Hi ChatGPT!", "Hey Claude,")
    [/^\s*(hi|hello|hey|yo|good (morning|afternoon|evening))\b[^.!?,\n]{0,20}[.!,]*\s*/i, ""],
    [/\bI was (just )?wondering if you could\s*/gi, ""],
    [/\bI would (really )?like you to\s*/gi, ""],
    [/\bI want you to\s*/gi, ""],
    [/\b(can|could|would) you (please )?help me( out)?( with this| to)?[.!?]?\s*/gi, ""],
    [/\b(can|could|would) you (please )?(?=\w)/gi, ""],
    [/(^|[.!?]\s+)(please )?help me( out)?( with this)?[.!]\s*/gi, "$1"],
    [/\bplease\b,?\s*/gi, ""],
    [/\bkindly\s+/gi, ""],
    [/\b(thank you|thanks)( so much| a lot| in advance)?( for (your|the) help)?[.!]*/gi, ""],
    [/\bI (really |truly )?appreciate (it|this|your help)[.!]*/gi, ""],
    [/\bif (that's|that is|it's) (ok|okay|possible|not too much trouble)[.,!]?\s*/gi, ""],
    [/\b(basically|literally|actually|just)\s+/gi, ""],
  ];

  // Keep code fences and inline code untouched.
  function protect(text) {
    const saved = [];
    const out = text.replace(/```[\s\S]*?```|`[^`\n]+`/g, m => { saved.push(m); return `\u0000${saved.length - 1}\u0000`; });
    return { out, restore: s => s.replace(/\u0000(\d+)\u0000/g, (_, i) => saved[+i]) };
  }

  function trimPrompt(src) {
    const { out, restore } = protect(src);
    let t = out;
    for (const [re, rep] of RULES) t = t.replace(re, rep);
    t = t
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+([.,!?;:])/g, "$1")
      .replace(/([!?.])\1+/g, "$1")
      .replace(/([.!?])[\s,;]*[,;]+/g, "$1")
      .replace(/[\s,;]+$/, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/(^|[.!?]\s+|\n)([a-z])/g, (m, a, b) => a + b.toUpperCase())
      .replace(/^[\s,.!?]+/, "")
      .trim();
    return restore(t);
  }

  // ~4 characters per token is the usual rough estimate for English text.
  const estimateTokens = s => Math.ceil((s || "").trim().length / 4);

  function promptTips(src) {
    const tips = [];
    const qs = (src.match(/\?/g) || []).length;
    const tokens = estimateTokens(src);
    if (qs > 1) tips.push(`${qs} questions in one message saves ${qs - 1} message${qs > 2 ? "s" : ""}. Number them.`);
    if (src.length > 40 && !/\b(bullets?|words?|brief|concise|short|table|sentences?|paragraphs?|tl;?dr|limit)\b/i.test(src))
      tips.push("No length set. Add “under 150 words” or “bullets only” to keep replies short.");
    if (tokens > 1500) tips.push(`Large paste (~${tokens} tokens). Send only the relevant part.`);
    if (/\b(as I said|like (I said|before)|again,)\b/i.test(src))
      tips.push("Re-explaining context? Long threads resend history every turn. A fresh chat with a short summary is cheaper.");
    return tips;
  }

  root.QP = Object.assign(root.QP || {}, { trimPrompt, estimateTokens, promptTips });
})(typeof self !== "undefined" ? self : globalThis);
