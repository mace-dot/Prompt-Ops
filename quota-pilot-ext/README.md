# Quota Pilot (Chrome extension, v0.2)

Instant **local** prompt compression (no API wait) plus message counters for ChatGPT, Claude and Gemini — so you know when you’re about to hit a cap, or waste messages at reset.

Built in plain JS (Manifest V3). No build step, no React.

## Install (2 minutes)
1. In Chrome, go to `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this `quota-pilot-ext` folder.
4. Pin it: puzzle-piece icon → pin Quota Pilot.
5. Open the popup and set each assistant's cap and window under **Limits and corrections**. The defaults are placeholders.

Works in Chrome, Edge, Brave and Arc. After editing any file, click the reload arrow on the extension card and refresh the chat tab.

## What it does
- **Non-destructive preview** (bottom-right on chatgpt.com, claude.ai, gemini.google.com): live token estimate (`before→after`). **Preview** / **Alt+T** opens an optimized bubble — your chat box is **not** rewritten until you choose.
  - **Send compressed** — write the lean version, then click Send.
  - **Apply to box** — put the lean version in the editor (original only changes if you ask).
  - **Keep original** — dismiss the preview.
  - **Prefer compressed when I send** — optional; local fluff-strip runs right before Enter / Send.
- **Message counter**: logs a send when you press Enter or click Send. Fix miscounts with +1 / Remove last in the popup.
- **Alerts**: desktop notifications for "Use it or lose it" and "Burning fast", plus a toolbar badge with messages left.

## Why this vs “rewrite with an LLM” tools
- Zero latency (regex rules in `trim.js`, not a cloud call).
- Transparent preview — you see the compression before it touches the box.
- Quota-aware for the Claude-style **5-hour** window (and ChatGPT / Gemini).

## Files
| File | Job |
|---|---|
| `manifest.json` | Permissions, which sites it runs on, Alt+T shortcut |
| `trim.js` | Trimming rules and tips (edit `RULES` to change what gets cut) |
| `quota.js` | Window math: reset rules, burn rate, alert levels |
| `content.js` | On-page pill, preview panel, editor detection, send counting |
| `background.js` | Storage, notifications, badge, shortcut |
| `popup.html/js` | Toolbar popup: gauges, limits, manual trimmer |

## Known limits
- Sites change their HTML. If the pill stops finding the chat box, update `EDITOR_SELECTORS` in `content.js`.
- It counts messages, not the provider's real internal usage (long chats and file uploads can use more than one "message" of quota).
- Local trim removes conversational fluff; it does not rewrite long technical docs (that would need an optional deep-compression step later).
- Data stays in your browser (`chrome.storage.local`). Nothing is sent anywhere.

## Roadmap (not in v0.2)
- One-click context prune / chat fork for long threads (biggest 5-hour saver).
- Optional paid “deep AI compression” for hard cases; free local trim stays unlimited.
