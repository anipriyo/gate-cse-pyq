# app: GATE PYQ desktop app

`~/Applications/GATE PYQ.app` (shows in Launchpad and Spotlight) runs `gate_app.py`, which:

1. serves `../site` at `http://127.0.0.1:8790` (fixed port so the window's saved progress stays with it), and
2. opens it in a native window (pywebview / WebKit), and
3. adds an AI tutor behind `/api/*`. The site shows the AI features (✦ Ask AI page, ✦ Hint, ✦ Explain with AI) only when `/api/status` answers, so the public GitHub Pages copy stays AI-free.

Everything except ChatGPT works offline: the site has no CDN or font downloads (KaTeX is in `site/vendor/katex`).

## AI backends

| Provider | How | Needs |
|---|---|---|
| **Qwen · offline** (default) | Streams from the local `llama-server` (Qwen3.8-27B Q3_K_XL + DFlash2) set up in `~/Documents/Models`, OpenAI-compatible at `127.0.0.1:8080`. **Loaded only while you use it:** opening the app never loads it. The first Qwen question (or "Load now") starts it through `~/Documents/Models/tray/qwen_tray.py` (same command and PID file as Qwen Chat.app). If this app loaded it, it unloads after `QWEN_IDLE_MIN` (10) minutes with no Qwen activity (from any client, read from `/slots`) and when you close the app. A Qwen you started yourself (Qwen Switch / Qwen Chat) is never stopped. | The Models workspace. About 30 s to load, then about 10 words/s. Question figures are sent as images (vision encoder). |
| **ChatGPT** | Your own ChatGPT account via Codex CLI: `codex exec --ignore-user-config --ignore-rules --ephemeral -s read-only --json`, run in the empty `app/codex_cwd/`. Your Codex config, plugins and history are not touched. Replies arrive whole (no token streaming), usually 5–15 s. "Think harder" maps to `model_reasoning_effort="high"`, otherwise `"low"`. | Internet, `npm i -g @openai/codex`, and `codex login` → Sign in with ChatGPT (already done on this Mac). Uses your ChatGPT plan's Codex allowance. |
| **Open in ChatGPT app** | Copies the conversation to the clipboard and opens ChatGPT.app (falls back to chatgpt.com). | ChatGPT.app |

"Think harder" on Qwen turns on its thinking mode (slower, shown in a collapsible "Thinking" box).

Chats from the tutor and the Ask AI page are saved in the window's local storage (`gatepyq.ai.chats`, latest 100).

## Commands

```bash
./app/make_app.sh                                        # (re)build ~/Applications/GATE PYQ.app
~/.venvs/analysis/bin/python app/make_icon.py            # redraw GatePYQ.icns
~/.venvs/analysis/bin/python app/gate_app.py --serve     # server only, open http://127.0.0.1:8790 in a browser
```

Code changes in `site/` or `app/gate_app.py` need no rebuild; just reopen the app. The launcher points at this folder, so rebuild after moving the workspace. Log: `app/app.log`.

## Notes

- Progress in the app is separate from the GitHub Pages site (different browser storage). Use Progress → Export / Import to move it.
- The app needs pywebview in `~/.venvs/analysis` (`VIRTUAL_ENV=~/.venvs/analysis uv pip install pywebview`) and, for Start Qwen, `rumps` (already installed for Qwen Switch).
