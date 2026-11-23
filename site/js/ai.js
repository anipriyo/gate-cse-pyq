// AI tutor: works only inside the desktop app (which serves /api/*). On the public site it stays hidden.
import { $, $$, esc, h, store, uid, correctText, answerText, isAnswered } from "./util.js";

// ---------------------------------------------------------------- availability
let statusCache = null;
export async function aiStatus(force = false) {
  if (statusCache && !force) return statusCache;
  try {
    const r = await fetch("api/status", { cache: "no-store" });
    statusCache = r.ok ? await r.json() : { app: false };
  } catch {
    statusCache = { app: false };
  }
  if (!statusCache.app) statusCache = { app: false };
  return statusCache;
}
export const aiAvailable = () => statusCache?.app === true;

// ---------------------------------------------------------------- markdown + maths
function renderTex(tex, display) {
  try {
    return window.katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: "ignore" });
  } catch {
    return esc(tex);
  }
}

export function md(src) {
  const slots = [];
  const keep = (html) => `\u0000${slots.push(html) - 1}\u0000`;
  let s = String(src ?? "");
  // fenced code first
  s = s.replace(/```[\w+-]*\n?([\s\S]*?)(```|$)/g, (_, code) => keep(`<pre><code>${esc(code.replace(/\n$/, ""))}</code></pre>`));
  s = s.replace(/`([^`\n]+)`/g, (_, c) => keep(`<code>${esc(c)}</code>`));
  // maths
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => keep(`<div class="mathblock">${renderTex(t, true)}</div>`));
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => keep(`<div class="mathblock">${renderTex(t, true)}</div>`));
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_, t) => keep(renderTex(t, false)));
  s = s.replace(/(^|[^\\$])\$([^\s$](?:[^$\n]*?[^\s$])?)\$(?!\d)/g, (_, pre, t) => pre + keep(renderTex(t, false)));
  s = esc(s);
  const inline = (t) => t
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const lines = s.split("\n");
  let out = "", list = null, para = [];
  const flushPara = () => { if (para.length) { out += `<p>${inline(para.join("<br>"))}</p>`; para = []; } };
  const flushList = () => { if (list) { out += `</${list}>`; list = null; } };
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    let m;
    if (/^\s*$/.test(ln)) { flushPara(); flushList(); continue; }
    if ((m = ln.match(/^(#{1,4})\s+(.*)/))) { flushPara(); flushList(); out += `<h4>${inline(m[2])}</h4>`; continue; }
    if (/^\s*(---|\*\*\*)\s*$/.test(ln)) { flushPara(); flushList(); out += "<hr>"; continue; }
    if (/^\s*\|.*\|\s*$/.test(ln) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || "")) {
      flushPara(); flushList();
      const row = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      out += `<div class="tbl-wrap"><table class="mdt"><tr>${row(ln).map((c) => `<th>${inline(c)}</th>`).join("")}</tr>`;
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { out += `<tr>${row(lines[i]).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`; i++; }
      i--;
      out += "</table></div>";
      continue;
    }
    if ((m = ln.match(/^\s*([-*•]|\d+[.)])\s+(.*)/))) {
      flushPara();
      const tag = /\d/.test(m[1]) ? "ol" : "ul";
      if (list !== tag) { flushList(); out += `<${tag}>`; list = tag; }
      out += `<li>${inline(m[2])}</li>`;
      continue;
    }
    if ((m = ln.match(/^&gt;\s?(.*)/))) { flushPara(); flushList(); out += `<blockquote>${inline(m[1])}</blockquote>`; continue; }
    flushList();
    para.push(ln);
  }
  flushPara(); flushList();
  return out.replace(/\u0000(\d+)\u0000/g, (_, n) => slots[+n]);
}

// ---------------------------------------------------------------- question -> prompt text
function htmlToText(html) {
  const d = document.createElement("div");
  d.innerHTML = String(html ?? "")
    .replace(/\[latex\]([\s\S]*?)\[\/latex\]/g, (_, t) => "$" + t.trim().replace(/</g, "&lt;") + "$")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr)>/gi, "\n").replace(/<img[^>]*>/gi, "[figure]");
  return d.textContent.replace(/\n{3,}/g, "\n\n").trim();
}

export function questionImages(q) {
  const all = [q.text, ...(q.options || []), q.solution].join(" ");
  return [...all.matchAll(/<img[^>]*src=["']([^"']+)["']/gi)].map((m) => m[1]).filter((s) => s.startsWith("data/img/"));
}

export function questionContext(q, userAns, { withSolution = true } = {}) {
  let t = `GATE CSE question (${q.paper_label}, Q${q.number}; ${q.type}, ${q.marks} mark${q.marks > 1 ? "s" : ""}; ${q.subject} › ${q.topic}).\n\n`;
  t += htmlToText(q.text) + "\n";
  if (q.options?.length) t += "\n" + q.options.map((o, i) => `(${"ABCD"[i]}) ${htmlToText(o)}`).join("\n") + "\n";
  if (q.type === "MSQ") t += "\n(Multiple select: one or more options can be correct.)\n";
  if (questionImages(q).length) t += "\n(The figure(s) are attached as images.)\n";
  if (withSolution) {
    t += `\nOfficial answer: ${correctText(q)}\n`;
    if (userAns !== undefined) t += `My answer: ${isAnswered(q, userAns) ? answerText(q, userAns) : "(not answered)"}\n`;
    if (q.solution) t += `\nReference solution:\n${htmlToText(q.solution)}\n`;
  }
  return t;
}

// ---------------------------------------------------------------- chat engine
export function chats() { return store.get("ai.chats", []); }
function saveChat(c) {
  const all = chats();
  const i = all.findIndex((x) => x.id === c.id);
  c.ts = Date.now();
  if (i >= 0) all.splice(i, 1);
  all.unshift(c);
  store.set("ai.chats", all.slice(0, 100));
}
export function deleteChat(id) { store.set("ai.chats", chats().filter((c) => c.id !== id)); }

export const prefs = {
  get provider() { return store.get("ai.provider", "qwen"); },
  set provider(v) { store.set("ai.provider", v); },
  get think() { return store.get("ai.think", false); },
  set think(v) { store.set("ai.think", v); },
};

// Mounts a chat UI into `root`. chat = {id, title, messages:[{role,content,reasoning?,provider?}], images:[], ctx?}
export function mountChat(root, chat, { chips = [], autoSend = null, onSaved } = {}) {
  root.innerHTML = `
    <div class="ai-bar">
      <div class="seg ai-prov"><button data-p="qwen" title="Local Qwen3.8-27B, works offline">Qwen · offline</button><button data-p="chatgpt" title="Your ChatGPT account via Codex">ChatGPT</button></div>
      <label class="ai-think" title="Deeper reasoning; slower"><input type="checkbox"> Think harder</label>
    </div>
    <div class="ai-status"></div>
    <div class="ai-log"></div>
    <div class="ai-chips"></div>
    <form class="ai-input"><textarea rows="2" placeholder="Ask anything… (Enter to send, Shift+Enter for a new line)"></textarea>
      <div class="ai-input-row"><button type="button" class="btn btn-sm btn-ghost ai-open-gpt" title="Copy this conversation and open the ChatGPT app">Open in ChatGPT app ↗</button><div class="spacer"></div>
      <button type="button" class="btn btn-sm ai-stop" hidden>Stop</button><button class="btn btn-primary btn-sm ai-send">Send</button></div></form>`;
  const log = $(".ai-log", root), ta = $("textarea", root), status = $(".ai-status", root);
  let ctrl = null, pollT = null;

  const paintProv = () => {
    $$(".ai-prov button", root).forEach((b) => b.classList.toggle("on", b.dataset.p === prefs.provider));
    $(".ai-think input", root).checked = prefs.think;
    refreshStatus();
  };
  async function refreshStatus() {
    clearTimeout(pollT);
    const st = await aiStatus(true);
    if (prefs.provider === "qwen") {
      if (!st.qwen?.available) status.innerHTML = `<span class="bad">Qwen setup not found on this Mac.</span>`;
      else if (st.qwen.healthy) status.innerHTML = `<span class="ok">●</span> ${esc(st.qwen.model || "Qwen")} is on · runs offline · about 10 words/s`;
      else if (st.qwen.starting) { status.innerHTML = `<span class="warn">●</span> Loading Qwen into memory… (about 30 s)`; pollT = setTimeout(refreshStatus, 2000); }
      else status.innerHTML = `<span class="muted">●</span> Qwen is off. <button class="btn btn-sm" id="qStart">Start Qwen</button>${st.qwen.error ? ` <span class="bad">${esc(st.qwen.error)}</span>` : ""}`;
      $("#qStart", status)?.addEventListener("click", async () => { await fetch("api/qwen/start", { method: "POST" }); refreshStatus(); });
    } else {
      if (!st.chatgpt?.available) status.innerHTML = `<span class="bad">Codex CLI not found (npm i -g @openai/codex).</span>`;
      else if (!st.chatgpt.logged_in) status.innerHTML = `<span class="bad">Not signed in. Run <code>codex login</code> in Terminal → Sign in with ChatGPT.</span>`;
      else status.innerHTML = `<span class="ok">●</span> Your ChatGPT account (via Codex) · needs internet · replies arrive whole`;
    }
  }
  $$(".ai-prov button", root).forEach((b) => (b.onclick = () => { prefs.provider = b.dataset.p; paintProv(); }));
  $(".ai-think input", root).onchange = (e) => { prefs.think = e.target.checked; };

  function bubble(m, i) {
    const el = h(`<div class="ai-msg ${m.role}">
      ${m.role === "assistant" ? `<div class="ai-who">${m.provider === "chatgpt" ? "ChatGPT" : "Qwen"}</div>` : ""}
      ${m.reasoning ? `<details class="ai-reason"><summary>Thinking</summary><div></div></details>` : ""}
      <div class="ai-body"></div></div>`);
    if (m.reasoning) $(".ai-reason div", el).textContent = m.reasoning;
    const body = $(".ai-body", el);
    if (m.role === "user" && m.hidden) body.innerHTML = `<i class="muted">${esc(m.label || "Question context sent")}</i>`;
    else body.innerHTML = m.role === "assistant" ? md(m.content) : esc(m.content).replace(/\n/g, "<br>");
    el.dataset.i = i;
    return el;
  }
  function paintLog() {
    log.innerHTML = "";
    chat.messages.forEach((m, i) => log.append(bubble(m, i)));
    if (!chat.messages.length) log.innerHTML = `<div class="ai-empty">Ask about any GATE topic, paste a doubt, or use a quick action below.</div>`;
    log.scrollTop = log.scrollHeight;
  }
  function paintChips() {
    $(".ai-chips", root).innerHTML = chips.map((c, i) => `<button class="chip" data-c="${i}">${esc(c.label)}</button>`).join("");
    $$(".ai-chips .chip", root).forEach((b) => (b.onclick = () => send(chips[+b.dataset.c].prompt, chips[+b.dataset.c])));
  }

  async function send(text, meta = {}) {
    text = (text ?? "").trim();
    if (!text || ctrl) return;
    const provider = prefs.provider;
    chat.messages.push({ role: "user", content: text, hidden: !!meta.hidden, label: meta.label });
    const am = { role: "assistant", content: "", reasoning: "", provider };
    chat.messages.push(am);
    if (!chat.title || chat.title === "New chat") chat.title = (meta.label || text).slice(0, 70);
    paintLog();
    const el = log.lastElementChild;
    const body = $(".ai-body", el);
    body.innerHTML = `<span class="ai-typing">●●●</span>`;
    $(".ai-send", root).hidden = true;
    $(".ai-stop", root).hidden = false;
    ctrl = new AbortController();
    let rDetails = null, lastPaint = 0;
    const paint = (final) => {
      const now = Date.now();
      if (!final && now - lastPaint < 120) return;
      lastPaint = now;
      body.innerHTML = am.content ? md(am.content) : `<span class="ai-typing">●●●</span>${am.status ? ` <span class="muted small">${esc(am.status)}</span>` : ""}`;
      if (am.reasoning) {
        if (!rDetails) { rDetails = h(`<details class="ai-reason"><summary>Thinking</summary><div></div></details>`); el.insertBefore(rDetails, body); }
        $("div", rDetails).textContent = am.reasoning;
      }
      if (log.scrollHeight - log.scrollTop - log.clientHeight < 160) log.scrollTop = log.scrollHeight;
    };
    try {
      const msgs = chat.messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
      const r = await fetch("api/chat", {
        method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, think: prefs.think, messages: msgs, images: chat.images || [] }),
      });
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let k;
        while ((k = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, k).trim();
          buf = buf.slice(k + 2);
          if (!line.startsWith("data:")) continue;
          const ev = JSON.parse(line.slice(5));
          if (ev.t === "delta") am.content += ev.text;
          else if (ev.t === "reasoning") am.reasoning += ev.text;
          else if (ev.t === "status") am.status = ev.text;
          else if (ev.t === "error") am.content += (am.content ? "\n\n" : "") + "⚠️ " + ev.text;
          paint(false);
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") am.content += (am.content ? "\n\n" : "") + "⚠️ " + e.message;
      else am.content += am.content ? "\n\n*(stopped)*" : "*(stopped)*";
    }
    delete am.status;
    ctrl = null;
    paint(true);
    $(".ai-send", root).hidden = false;
    $(".ai-stop", root).hidden = true;
    saveChat(chat);
    onSaved && onSaved(chat);
  }

  $(".ai-stop", root).onclick = () => ctrl?.abort();
  $(".ai-input", root).onsubmit = (e) => { e.preventDefault(); const v = ta.value; ta.value = ""; send(v); };
  ta.addEventListener("keydown", (e) => {
    e.stopPropagation(); // keep practice-page shortcuts out of the textbox
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $(".ai-input", root).requestSubmit(); }
  });
  $(".ai-open-gpt", root).onclick = async () => {
    let text = chat.messages.filter((m) => m.content).map((m) => (m.role === "user" ? m.content : "Tutor: " + m.content)).join("\n\n");
    if (!text) text = ta.value;
    await fetch("api/open-chatgpt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    const n = h(`<div class="toast">Copied. Paste it into ChatGPT (⌘V).</div>`);
    document.body.append(n);
    setTimeout(() => n.remove(), 2600);
  };

  paintProv();
  paintLog();
  paintChips();
  if (autoSend) send(autoSend.prompt, autoSend);
  setTimeout(() => ta.focus({ preventScroll: true }), 50);
  return { send, destroy: () => { ctrl?.abort(); clearTimeout(pollT); } };
}

// ---------------------------------------------------------------- tutor drawer for one question
let drawer = null;
export function openTutor(q, userAns, { revealed = true, action = "explain" } = {}) {
  closeTutor();
  const ctx = questionContext(q, userAns, { withSolution: revealed });
  const chat = { id: uid(), title: `${q.paper_label} Q${q.number}: ${q.topic}`, messages: [], images: questionImages(q), qid: q.id };
  const wrongNote = revealed && userAns !== undefined && isAnswered(q, userAns) && answerText(q, userAns) !== correctText(q);
  const chips = (revealed
    ? [
        ["Explain the solution", `Explain step by step how to get the answer ${correctText(q)}.${wrongNote ? " Also show exactly where my answer goes wrong." : ""}`],
        ["Explain the concept", "Teach me the underlying concept(s) this question tests, briefly, with one small example. Then list the common traps."],
        ["Shortcut / trick", "Is there a faster way to solve this under exam time pressure? Show it."],
        ["Give a similar question", "Make one new GATE-style question on the same idea (with options if MCQ). Don't give the answer until I reply."],
      ]
    : [
        ["Give me a hint", "Give me a single hint to get started. Do NOT reveal the answer or the final value."],
        ["Explain the concept", "Explain the concept this question tests, without solving it and without revealing the answer."],
      ]).map(([label, ask]) => ({ label, prompt: ctx + "\n" + ask, hidden: true }));

  const el = h(`<div class="ai-drawer-bg"><aside class="ai-drawer" role="dialog" aria-label="AI tutor">
    <div class="ai-head"><b>✦ AI tutor</b><span class="muted small">${esc(q.paper_label)} · Q${q.number}</span><div class="spacer"></div><button class="icon-btn" aria-label="Close">✕</button></div>
    <div class="ai-root"></div></aside></div>`);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add("open"));
  const auto = (action === "explain" && revealed) || (action === "hint" && !revealed) ? chips[0] : null;
  const ctl = mountChat($(".ai-root", el), chat, { chips, autoSend: auto });
  // follow-up questions typed by the user need the question context too, if no chip was used yet
  const form = $(".ai-input", el);
  form.addEventListener("submit", (e) => {
    if (chat.messages.length === 0) {
      e.stopImmediatePropagation();
      e.preventDefault();
      const v = $("textarea", el).value.trim();
      if (!v) return;
      $("textarea", el).value = "";
      ctl.send(ctx + "\nMy question: " + v, { hidden: true, label: v });
    }
  }, true);
  $(".ai-head .icon-btn", el).onclick = closeTutor;
  el.addEventListener("click", (e) => { if (e.target === el) closeTutor(); });
  drawer = { el, ctl };
}
export function closeTutor() {
  if (!drawer) return;
  drawer.ctl.destroy();
  drawer.el.remove();
  drawer = null;
}

// ---------------------------------------------------------------- "Ask AI" page
export function viewAsk(app, id) {
  const all = chats();
  let chat = all.find((c) => c.id === id) || { id: uid(), title: "New chat", messages: [], images: [] };
  app.innerHTML = `<div class="wrap ask-wrap">
    <aside class="card ask-list"><div class="row" style="margin-bottom:10px"><b>Chats</b><div class="spacer"></div><a class="btn btn-sm btn-primary" href="#/ask">+ New</a></div>
      <div id="askList"></div></aside>
    <section class="card ask-main"><div class="ai-root"></div></section></div>`;
  const paintList = () => {
    const list = chats();
    $("#askList").innerHTML = list.length ? list.map((c) => `<div class="ask-item ${c.id === chat.id ? "on" : ""}"><a href="#/ask/${c.id}">${esc(c.title || "Chat")}</a><button class="ask-del" data-del="${c.id}" title="Delete">✕</button></div>`).join("") : `<div class="muted small">No chats yet.</div>`;
    $$("[data-del]").forEach((b) => (b.onclick = () => { deleteChat(b.dataset.del); if (b.dataset.del === chat.id) location.hash = "#/ask"; else paintList(); }));
  };
  const ctl = mountChat($(".ask-main .ai-root"), chat, {
    chips: chat.messages.length ? [] : [
      { label: "Plan my GATE 2027 prep", prompt: "I am preparing for GATE CSE 2027. Suggest a month-by-month plan that uses previous-year questions well. Keep it practical." },
      { label: "Explain a topic", prompt: "Explain paging and TLBs for GATE with a worked numerical example." },
      { label: "Quiz me", prompt: "Ask me 3 quick GATE-level conceptual questions on DBMS normal forms, one at a time, and check my answers." },
    ],
    onSaved: paintList,
  });
  paintList();
  return () => ctl.destroy();
}
