"""GATE PYQ desktop app: the practice site in a native window, plus an AI tutor.

- Serves ../site on http://127.0.0.1:8790 (fixed port, so the window's saved progress stays put).
- AI backends behind /api/chat (Server-Sent Events):
    * "qwen":    the local Qwen3.8-27B llama-server from ~/Documents/Models (offline). If it is off,
                 /api/qwen/start launches it the same way "Qwen Chat.app" does (same PID file) and
                 opens "Qwen Switch.app" so it can be turned off from the menu bar.
    * "chatgpt": the user's own ChatGPT account through Codex CLI (`codex exec`, signed in with
                 ChatGPT). Runs with --ignore-user-config --ephemeral in a read-only sandbox, so the
                 user's Codex plugins/history are untouched.
- /api/open-chatgpt copies a prompt to the clipboard and opens the ChatGPT desktop app.

Run:  ~/.venvs/analysis/bin/python app/gate_app.py          (or open "GATE PYQ.app")
      ~/.venvs/analysis/bin/python app/gate_app.py --serve  (server only, use a browser)
"""
import base64
import json
import mimetypes
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
APP_DIR = ROOT / "app"
STORAGE = APP_DIR / "webview_data"        # the window's localStorage (your progress) lives here
CODEX_CWD = APP_DIR / "codex_cwd"         # empty working dir for codex exec
PORT = 8790
MODELS_ROOT = Path.home() / "Documents" / "Models"
TRAY_APP = Path.home() / "Applications" / "Qwen Switch.app"

TUTOR_SYSTEM = (
    "You are a friendly, rigorous GATE CSE tutor helping a student prepare for GATE 2027. "
    "Explain step by step, check the arithmetic, and keep answers focused. Use Markdown, and write "
    "maths in LaTeX between $...$ (inline) or $$...$$ (display). If the student's answer was wrong, "
    "point out the exact mistake. If you are asked for a hint, do not reveal the final answer."
)


# ---------------------------------------------------------------- Qwen (local)
def _qwen_mod():
    """Import the Models workspace's tray module (server start logic + config), if present."""
    tray = MODELS_ROOT / "tray"
    if not (tray / "qwen_tray.py").exists():
        return None
    if str(tray) not in sys.path:
        sys.path.insert(0, str(tray))
    try:
        import qwen_tray  # noqa: F401  (needs rumps, present in ~/.venvs/analysis)
        return qwen_tray
    except Exception as e:  # pragma: no cover
        print("qwen_tray import failed:", e, file=sys.stderr)
        return None


def qwen_cfg():
    try:
        return json.loads((MODELS_ROOT / "server_config.json").read_text())
    except Exception:
        return {"host": "127.0.0.1", "port": 8080, "model": "qwen"}


def qwen_url():
    c = qwen_cfg()
    return f"http://127.0.0.1:{c.get('port', 8080)}"


def qwen_healthy():
    try:
        with urllib.request.urlopen(qwen_url() + "/health", timeout=1) as r:
            return r.status == 200
    except Exception:
        return False


QWEN_IDLE_MIN = 10   # unload Qwen after this many minutes without use (only if this app loaded it)

_start_lock = threading.Lock()
_start_state = {"starting": False, "error": None, "t0": 0}
# Server this app loaded itself: {"tray": QwenTray-like object, "pid": int}. Only this one is ever stopped.
_ours = {"tray": None, "pid": None}
_activity = {"last": 0.0, "task": None}


def qwen_start():
    """Load Qwen on demand (same command + PID file as Qwen Chat.app). Called only when a Qwen
    request arrives or the user clicks Start; nothing loads Qwen at app launch."""
    with _start_lock:
        if qwen_healthy() or _start_state["starting"]:
            return
        q = _qwen_mod()
        if q is None:
            _start_state["error"] = "Qwen setup not found in ~/Documents/Models."
            return
        app = q.QwenTray.__new__(q.QwenTray)
        app.proc = None
        app.pid = None
        app.adopt_existing()
        if not app.running():
            app.start()  # writes logs/server.pid
            _ours.update(tray=app, pid=app.pid)
        _activity["last"] = time.time()
        _start_state.update(starting=True, error=None, t0=time.time())
        if TRAY_APP.exists():
            subprocess.run(["open", "-g", str(TRAY_APP)])  # menu-bar switch shows it's on

        def watch():
            while not qwen_healthy():
                if not app.running() and time.time() - _start_state["t0"] > 5:
                    _start_state["error"] = "Qwen server failed to start (see ~/Documents/Models/logs/server.log)."
                    break
                if time.time() - _start_state["t0"] > 180:
                    _start_state["error"] = "Qwen server is taking too long to load."
                    break
                time.sleep(1)
            _start_state["starting"] = False
        threading.Thread(target=watch, daemon=True).start()


def _qwen_busy_or_used():
    """True if llama-server is generating or has run a new task since the last check (any client)."""
    try:
        with urllib.request.urlopen(qwen_url() + "/slots", timeout=2) as r:
            slots = json.loads(r.read())
    except Exception:
        return False
    task = max((s.get("id_task") or 0) for s in slots) if slots else 0
    busy = any(s.get("is_processing") for s in slots)
    changed = _activity["task"] is not None and task != _activity["task"]
    _activity["task"] = task
    return busy or changed


def qwen_stop_ours(reason=""):
    """Stop the server only if this app started it (by its own PID)."""
    tray = _ours["tray"]
    if tray is None:
        return
    try:
        if tray.running():
            tray.stop()  # SIGTERM to its own PID; also clears logs/server.pid
            print(f"Unloaded Qwen ({reason})", file=sys.stderr)
    except Exception as e:
        print("stop failed:", e, file=sys.stderr)
    _ours.update(tray=None, pid=None)


def idle_watcher():
    while True:
        time.sleep(30)
        if _ours["tray"] is None:
            continue
        if not _ours["tray"].running():  # turned off elsewhere (menu bar)
            _ours.update(tray=None, pid=None)
            continue
        if _qwen_busy_or_used() or _start_state["starting"]:
            _activity["last"] = time.time()
        elif time.time() - _activity["last"] > QWEN_IDLE_MIN * 60:
            qwen_stop_ours(f"idle {QWEN_IDLE_MIN} min")


# ---------------------------------------------------------------- ChatGPT (Codex CLI)
def codex_bin():
    p = shutil.which("codex")
    if p:
        return p
    for c in (Path.home() / ".nvm/versions/node").glob("*/bin/codex"):
        return str(c)
    return None


_codex_login = {"checked": 0, "ok": False}


def codex_logged_in():
    if time.time() - _codex_login["checked"] < 300:
        return _codex_login["ok"]
    b = codex_bin()
    ok = False
    if b:
        try:
            res = subprocess.run([b, "login", "status"], capture_output=True, text=True, timeout=15,
                                 env=_codex_env())
            out = res.stdout + res.stderr  # codex prints the status on stderr
            ok = "Logged in" in out
        except Exception:
            ok = False
    _codex_login.update(checked=time.time(), ok=ok)
    return ok


def _codex_env():
    env = dict(os.environ)
    b = codex_bin()
    if b:  # nvm node must be on PATH for the codex shim
        env["PATH"] = str(Path(b).parent) + ":/opt/homebrew/bin:/usr/local/bin:" + env.get("PATH", "")
    return env


# ---------------------------------------------------------------- helpers
def image_paths(rel_list):
    out = []
    for rel in rel_list or []:
        p = (SITE / urllib.parse.unquote(rel)).resolve()
        if SITE.resolve() in p.parents and p.is_file():
            out.append(p)
    return out[:4]


def data_uri(p):
    mime = mimetypes.guess_type(str(p))[0] or "image/png"
    return f"data:{mime};base64," + base64.b64encode(p.read_bytes()).decode()


class Handler(BaseHTTPRequestHandler):
    server_version = "GatePYQ/1.0"

    def log_message(self, fmt, *args):  # quiet
        pass

    # ---- plumbing
    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def _sse_start(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

    def _sse(self, **ev):
        self.wfile.write(b"data: " + json.dumps(ev).encode() + b"\n\n")
        self.wfile.flush()

    # ---- routes
    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/status":
            return self._json({
                "app": True,
                "qwen": {"available": (MODELS_ROOT / "server_config.json").exists(), "healthy": qwen_healthy(),
                         "starting": _start_state["starting"], "error": _start_state["error"],
                         "ours": _ours["tray"] is not None, "idle_min": QWEN_IDLE_MIN,
                         "model": qwen_cfg().get("model", "").split(".gguf")[0]},
                "chatgpt": {"available": codex_bin() is not None, "logged_in": codex_logged_in()},
            })
        return self._static(path)

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/qwen/start":
            qwen_start()
            return self._json({"ok": True, "starting": _start_state["starting"], "error": _start_state["error"]})
        if path == "/api/chat":
            return self._chat(self._body())
        if path == "/api/open-chatgpt":
            text = self._body().get("text", "")
            subprocess.run(["pbcopy"], input=text.encode(), check=False)
            r = subprocess.run(["open", "-a", "ChatGPT"], capture_output=True)
            if r.returncode != 0:
                subprocess.run(["open", "https://chatgpt.com/"])
            return self._json({"ok": True})
        self._json({"error": "not found"}, 404)

    def _static(self, path):
        rel = urllib.parse.unquote(path).lstrip("/") or "index.html"
        p = (SITE / rel).resolve()
        if SITE.resolve() not in p.parents and p != SITE.resolve():
            return self._json({"error": "forbidden"}, 403)
        if p.is_dir():
            p = p / "index.html"
        if not p.is_file():
            return self._json({"error": "not found"}, 404)
        data = p.read_bytes()
        self.send_response(200)
        ctype = mimetypes.guess_type(str(p))[0] or "application/octet-stream"
        if p.suffix == ".js":
            ctype = "text/javascript"
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    # ---- chat
    def _chat(self, req):
        provider = req.get("provider", "qwen")
        messages = [m for m in req.get("messages", []) if m.get("content")]
        imgs = image_paths(req.get("images"))
        think = bool(req.get("think"))
        self._sse_start()
        try:
            if provider == "chatgpt":
                self._chat_codex(messages, imgs, think)
            else:
                self._chat_qwen(messages, imgs, think)
        except (BrokenPipeError, ConnectionResetError):
            pass  # user pressed Stop / closed the panel
        except Exception as e:
            try:
                self._sse(t="error", text=str(e))
            except Exception:
                pass

    def _chat_qwen(self, messages, imgs, think):
        if not qwen_healthy():
            qwen_start()  # load on demand
            t0 = time.time()
            while not qwen_healthy():
                if _start_state["error"]:
                    self._sse(t="error", text=_start_state["error"])
                    return
                if time.time() - t0 > 200:
                    self._sse(t="error", text="Qwen took too long to load.")
                    return
                # heartbeat: also raises BrokenPipe if the user pressed Stop
                self._sse(t="status", text=f"Loading Qwen into memory… {int(time.time() - t0)} s")
                time.sleep(1)
        _activity["last"] = time.time()
        msgs = [{"role": "system", "content": TUTOR_SYSTEM}]
        first_user = True
        for m in messages:
            if m["role"] == "user" and first_user and imgs:
                parts = [{"type": "image_url", "image_url": {"url": data_uri(p)}} for p in imgs]
                parts.append({"type": "text", "text": m["content"]})
                msgs.append({"role": "user", "content": parts})
                first_user = False
            else:
                if m["role"] == "user":
                    first_user = False
                msgs.append({"role": m["role"], "content": m["content"]})
        body = json.dumps({
            "messages": msgs, "stream": True, "max_tokens": 6000 if think else 2500, "temperature": 0.6,
            "chat_template_kwargs": {"enable_thinking": think},
        }).encode()
        req = urllib.request.Request(qwen_url() + "/v1/chat/completions", data=body,
                                     headers={"Content-Type": "application/json"})
        if imgs:
            self._sse(t="status", text="Reading the figure…")
        with urllib.request.urlopen(req, timeout=600) as r:
            for raw in r:
                line = raw.decode("utf-8", "replace").strip()
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    ch = json.loads(data)["choices"][0]
                except Exception:
                    continue
                d = ch.get("delta") or {}
                if d.get("reasoning_content"):
                    self._sse(t="reasoning", text=d["reasoning_content"])
                if d.get("content"):
                    self._sse(t="delta", text=d["content"])
        _activity["last"] = time.time()
        self._sse(t="done")

    def _chat_codex(self, messages, imgs, think):
        b = codex_bin()
        if not b:
            self._sse(t="error", text="Codex CLI not found. Install it with: npm i -g @openai/codex")
            return
        if not codex_logged_in():
            self._sse(t="error", text="ChatGPT isn't signed in. Run `codex login` in Terminal and choose “Sign in with ChatGPT”.")
            return
        convo = []
        for m in messages[:-1]:
            who = "Student" if m["role"] == "user" else "Tutor"
            convo.append(f"### {who}\n{m['content']}")
        prompt = (TUTOR_SYSTEM + "\nYou are answering in a chat window, not working on code: do not run commands "
                  "or read files; just reply to the student.\n\n")
        if convo:
            prompt += "Conversation so far:\n\n" + "\n\n".join(convo) + "\n\n"
        prompt += "### Student (reply to this)\n" + (messages[-1]["content"] if messages else "")
        CODEX_CWD.mkdir(parents=True, exist_ok=True)
        cmd = [b, "exec", "--ignore-user-config", "--ignore-rules", "--ephemeral", "--skip-git-repo-check",
               "-s", "read-only", "--json", "-C", str(CODEX_CWD),
               "-c", f'model_reasoning_effort="{"high" if think else "low"}"']
        for p in imgs:
            cmd += ["-i", str(p)]
        cmd.append("-")
        self._sse(t="status", text="Asking ChatGPT…")
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                env=_codex_env(), text=True, start_new_session=True)
        try:
            proc.stdin.write(prompt)
            proc.stdin.close()
            got = False
            for line in proc.stdout:
                try:
                    ev = json.loads(line)
                except Exception:
                    continue
                item = ev.get("item") or {}
                if ev.get("type") == "item.completed" and item.get("type") == "agent_message":
                    self._sse(t="delta", text=("\n\n" if got else "") + item.get("text", ""))
                    got = True
                elif ev.get("type") == "item.completed" and item.get("type") == "reasoning":
                    self._sse(t="reasoning", text=item.get("text", "") + "\n")
                elif ev.get("type") in ("error", "turn.failed"):
                    msg = ev.get("message") or (ev.get("error") or {}).get("message") or "ChatGPT request failed."
                    self._sse(t="error", text=msg)
            proc.wait(timeout=10)
            if not got and proc.returncode:
                err = proc.stderr.read()[-500:]
                self._sse(t="error", text="ChatGPT request failed. " + err.strip())
            self._sse(t="done")
        finally:
            if proc.poll() is None:
                proc.terminate()  # only the codex process this request started


# ---------------------------------------------------------------- main
def already_running():
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/status", timeout=1) as r:
            return json.loads(r.read()).get("app") is True
    except Exception:
        return False


def serve():
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    threading.Thread(target=idle_watcher, daemon=True).start()
    return httpd


def main():
    serve_only = "--serve" in sys.argv
    if already_running():
        if serve_only:
            print(f"Already running at http://127.0.0.1:{PORT}")
            return
        url = f"http://127.0.0.1:{PORT}"
    else:
        serve()
        url = f"http://127.0.0.1:{PORT}"
    if serve_only:
        print(f"Serving {SITE} at {url}  (Ctrl+C to stop)")
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            qwen_stop_ours("server stopped")
            return
    import webview
    STORAGE.mkdir(parents=True, exist_ok=True)
    webview.settings["OPEN_EXTERNAL_LINKS_IN_BROWSER"] = True
    webview.settings["ALLOW_DOWNLOADS"] = True
    webview.create_window("GATE PYQ", url, width=1320, height=880, min_size=(420, 560), text_select=True)
    webview.start(private_mode=False, storage_path=str(STORAGE))
    qwen_stop_ours("app closed")  # window closed: free the RAM if this app loaded Qwen


if __name__ == "__main__":
    main()
