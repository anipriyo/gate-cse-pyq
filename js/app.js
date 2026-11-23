import {
  $, $$, esc, h, loadDB, store, uid, recordQStat, bookmarks, toggleBookmark, isAnswered, verdict, marksFor, fmtMarks,
  answerText, correctText, typeName, renderMath, safe, fmtTime, shuffle, linksHTML, saveResult, getResult, computeSummary,
} from "./util.js";
import { renderExamInstructions, resumeExamIfAny } from "./exam.js";

const app = $("#app");
let DB;
let cleanup = null; // teardown for the current view (timers, key handlers)

// ---------------- theme ----------------
$("#themeBtn").addEventListener("click", () => {
  const cur = document.documentElement.dataset.theme ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  store.set("theme", next);
});

export function toast(msg) {
  const t = h(`<div class="toast">${esc(msg)}</div>`);
  document.body.append(t);
  setTimeout(() => t.remove(), 2200);
}

export function modal(html, { onOpen } = {}) {
  const bg = h(`<div class="modal-bg"><div class="modal">${html}</div></div>`);
  $("#modal-root").append(bg);
  const close = () => bg.remove();
  bg.addEventListener("click", (e) => { if (e.target === bg || e.target.closest("[data-close]")) close(); });
  onOpen && onOpen(bg, close);
  return close;
}

// ---------------- router ----------------
const routes = {
  "": viewHome,
  practice: viewBuilder,
  session: viewSession,
  result: viewResult,
  mock: viewMockList,
  "mock-start": (id) => renderExamInstructions(app, DB, id),
  exam: () => resumeExamIfAny(app, DB) || (location.hash = "#/mock"),
  history: viewHistory,
};

async function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  document.body.classList.remove("exam-mode");
  const [name, arg] = location.hash.replace(/^#\/?/, "").split("/");
  $$(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.nav === name || (name === "session" && a.dataset.nav === "practice")));
  const fn = routes[name] || viewHome;
  window.scrollTo(0, 0);
  await fn(arg && decodeURIComponent(arg));
}
export function setCleanup(fn) { cleanup = fn; }

(async function init() {
  try {
    DB = await loadDB();
  } catch (e) {
    app.innerHTML = `<div class="wrap"><div class="card">Could not load the question database. ${esc(e.message)}</div></div>`;
    return;
  }
  window.addEventListener("hashchange", route);
  route();
})();

// ---------------- home ----------------
function viewHome() {
  const results = store.get("results", []);
  const qstats = store.get("qstats", {});
  const attempted = Object.values(qstats).filter((s) => s.a > 0).length;
  const correctNow = Object.values(qstats).filter((s) => s.last === "correct").length;
  const sess = store.get("session.practice");
  const exam = store.get("session.exam");
  const n = DB.questions.length;
  app.innerHTML = `<div class="wrap">
    <h1>GATE CSE previous-year questions</h1>
    <p class="sub">${n} questions from ${DB.papers.length} papers (${Math.min(...DB.years)}–${Math.max(...DB.years)}), with answers and solutions. Your progress stays in this browser.</p>
    ${sess && !sess.finished ? `<div class="card row" style="margin-bottom:16px"><div><b>Unfinished practice:</b> ${esc(sess.title)} <span class="muted">· ${Object.values(sess.responses).filter((r) => r.checked || isAnswered(DB.byId.get(r.qid) || {}, r.ans)).length}/${sess.qids.length} done</span></div><div class="spacer"></div><button class="btn btn-ghost btn-sm" id="dropSess">Discard</button><a class="btn btn-primary btn-sm" href="#/session">Resume</a></div>` : ""}
    ${exam && !exam.finished ? `<div class="card row" style="margin-bottom:16px"><div><b>Mock test in progress:</b> ${esc(exam.title)} <span class="muted">· ${fmtTime(exam.remaining)} left</span></div><div class="spacer"></div><a class="btn btn-primary btn-sm" href="#/exam">Resume</a></div>` : ""}
    <div class="grid grid-3" style="margin-bottom:20px">
      <a class="card mode-card" href="#/practice"><div class="ico">◎</div><h2>Practice</h2><div class="muted">Pick subjects, topics, years, types. Check each answer right away, or see results at the end.</div></a>
      <a class="card mode-card" href="#/mock"><div class="ico">⏱</div><h2>Mock test</h2><div class="muted">A full year's paper in a GATE-style interface: 3 hours, palette, calculator, negative marking.</div></a>
      <a class="card mode-card" href="#/history"><div class="ico">↗</div><h2>Progress</h2><div class="muted">Past sessions, accuracy by subject and topic, bookmarks, backup.</div></a>
    </div>
    <div class="card">
      <h2>Your numbers</h2>
      <div class="stat-row">
        <div class="stat"><b>${attempted}</b><span>of ${n} attempted</span></div>
        <div class="stat"><b>${attempted ? Math.round((100 * correctNow) / attempted) : 0}%</b><span>right on last try</span></div>
        <div class="stat"><b>${results.length}</b><span>sessions finished</span></div>
        <div class="stat"><b>${bookmarks().size}</b><span>bookmarked</span></div>
      </div>
      <div class="row" style="margin-top:16px">
        <button class="btn btn-sm" data-quick="new">20 random unseen</button>
        <button class="btn btn-sm" data-quick="wrong">Redo my wrong ones</button>
        <button class="btn btn-sm" data-quick="bm">Bookmarked</button>
      </div>
    </div>
    <p class="muted small" style="margin-top:28px">Unofficial practice tool for personal use. Questions are from official GATE CSE papers; answer keys and written solutions are taken from <a href="https://practicepaper.in/gate-cse" target="_blank" rel="noopener">practicepaper.in</a>; discussion links go to <a href="https://gateoverflow.in" target="_blank" rel="noopener">GATE Overflow</a>. Database snapshot: ${esc(DB.snapshot)}.</p>
  </div>`;
  $("#dropSess")?.addEventListener("click", () => { store.del("session.practice"); viewHome(); });
  $$("[data-quick]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.quick;
    let ids = DB.questions.map((q) => q.id);
    if (k === "new") ids = shuffle(ids.filter((id) => !(qstats[id]?.a > 0))).slice(0, 20);
    if (k === "wrong") ids = shuffle(ids.filter((id) => qstats[id]?.last === "wrong"));
    if (k === "bm") ids = ids.filter((id) => bookmarks().has(id));
    if (!ids.length) return toast("Nothing matches yet.");
    startPractice({ qids: ids, title: { new: "20 random unseen", wrong: "Redo wrong answers", bm: "Bookmarked questions" }[k], mode: "instant", timeLimit: 0 });
  }));
}

// ---------------- practice builder ----------------
const DEFAULT_CFG = {
  topics: [], years: [], types: ["MCQ", "MSQ", "NAT"], marks: [1, 2], status: "all",
  count: "all", order: "paper", mode: "instant", timer: 0,
};

function filterQuestions(cfg) {
  const sel = new Set(cfg.topics);
  const years = new Set(cfg.years);
  const qstats = store.get("qstats", {});
  const bm = bookmarks();
  return DB.questions.filter((q) =>
    (sel.size === 0 || sel.has(q.subject + "||" + q.topic)) &&
    (years.size === 0 || years.has(q.year)) &&
    cfg.types.includes(q.type) && cfg.marks.includes(q.marks) &&
    (cfg.status === "all" ||
      (cfg.status === "new" && !(qstats[q.id]?.a > 0)) ||
      (cfg.status === "wrong" && qstats[q.id]?.last === "wrong") ||
      (cfg.status === "bookmarked" && bm.has(q.id))));
}

function viewBuilder() {
  const cfg = { ...DEFAULT_CFG, ...store.get("builder", {}) };
  const qstats = store.get("qstats", {});
  const open = new Set(store.get("builder.open", []));

  const topicAcc = (ids) => {
    const a = ids.filter((id) => qstats[id]?.a > 0);
    return { done: a.length, pct: ids.length ? (100 * a.length) / ids.length : 0 };
  };

  app.innerHTML = `<div class="wrap">
    <h1>Practice</h1>
    <p class="sub">Choose what to practise. Leave subjects unticked to include everything.</p>
    <div class="builder">
      <div class="card">
        <div class="row" style="margin-bottom:8px">
          <h2 style="margin:0">Subjects &amp; topics</h2><div class="spacer"></div>
          <button class="btn btn-sm btn-ghost" id="expandAll">Expand all</button>
          <button class="btn btn-sm btn-ghost" id="clearTopics">Clear</button>
        </div>
        <input type="text" class="searchbox" id="topicSearch" placeholder="Search topics… (e.g. paging, heap, LR parser)">
        <div id="tree">${DB.tree.map((s, si) => {
          const all = s.topics.flatMap((t) => t.ids);
          const acc = topicAcc(all);
          return `<div class="tree-subj ${open.has(s.subject) ? "open" : ""}" data-subj="${esc(s.subject)}">
            <div class="tree-head"><span class="chev">▸</span><input type="checkbox" data-subjbox="${si}" aria-label="Select all of ${esc(s.subject)}"><span class="name">${esc(s.subject)}</span>
              <span class="bar-mini" title="${acc.done}/${all.length} attempted"><i style="width:${acc.pct}%"></i></span><span class="count">${all.length}</span></div>
            <div class="topics">${s.topics.map((t) => {
              const ta = topicAcc(t.ids);
              return `<label class="topic" data-name="${esc(t.topic.toLowerCase())}"><input type="checkbox" data-topic="${esc(s.subject + "||" + t.topic)}"><span class="t">${esc(t.topic)}</span><span class="bar-mini" title="${ta.done}/${t.ids.length} attempted"><i style="width:${ta.pct}%"></i></span><span class="count">${t.ids.length}</span></label>`;
            }).join("")}</div></div>`;
        }).join("")}</div>
      </div>
      <aside class="card">
        <div class="field"><span class="lbl">Years</span><div class="chips" id="years">${DB.years.map((y) => `<button class="chip" data-year="${y}">${y}</button>`).join("")}</div><div class="opt-desc">None selected = all years.</div></div>
        <div class="field"><span class="lbl">Question type</span><div class="chips" id="types">${["MCQ", "MSQ", "NAT"].map((t) => `<button class="chip" data-type="${t}">${t}</button>`).join("")}</div></div>
        <div class="field"><span class="lbl">Marks</span><div class="chips" id="marks"><button class="chip" data-mark="1">1 mark</button><button class="chip" data-mark="2">2 marks</button></div></div>
        <div class="field"><span class="lbl">Which questions</span><select id="status">
          <option value="all">All</option><option value="new">Not attempted yet</option><option value="wrong">Got wrong last time</option><option value="bookmarked">Bookmarked</option></select></div>
        <div class="field"><span class="lbl">How many</span><div class="row" style="flex-wrap:nowrap"><select id="count"><option value="all">All matching</option>${[5, 10, 15, 20, 30, 40, 65].map((n) => `<option value="${n}">${n}</option>`).join("")}</select>
          <select id="order"><option value="paper">Newest paper first</option><option value="oldest">Oldest paper first</option><option value="random">Random order</option></select></div></div>
        <div class="field"><span class="lbl">Feedback</span><div class="seg" id="mode"><button data-mode="instant">After each</button><button data-mode="end">At the end</button></div>
          <div class="opt-desc" id="modeDesc"></div></div>
        <div class="field"><span class="lbl">Timer</span><select id="timer"><option value="0">No limit (count up)</option>${[10, 15, 20, 30, 45, 60, 90, 120, 180].map((m) => `<option value="${m}">${m} minutes</option>`).join("")}<option value="-1">GATE pace (~2.8 min per mark)</option></select></div>
        <hr style="border:0;border-top:1px solid var(--border);margin:18px 0">
        <div class="row"><div><div class="match-count" id="matchCount">0</div><div class="muted small" id="matchDesc">questions match</div></div><div class="spacer"></div>
          <button class="btn btn-primary btn-lg" id="startBtn">Start</button></div>
      </aside>
    </div></div>`;

  const sel = new Set(cfg.topics);
  const update = () => {
    cfg.topics = [...sel];
    store.set("builder", cfg);
    $$("[data-topic]").forEach((b) => (b.checked = sel.has(b.dataset.topic)));
    DB.tree.forEach((s, si) => {
      const keys = s.topics.map((t) => s.subject + "||" + t.topic);
      const n = keys.filter((k) => sel.has(k)).length;
      const box = $(`[data-subjbox="${si}"]`);
      box.checked = n === keys.length;
      box.indeterminate = n > 0 && n < keys.length;
    });
    $$("[data-year]").forEach((b) => b.classList.toggle("on", cfg.years.includes(+b.dataset.year)));
    $$("[data-type]").forEach((b) => b.classList.toggle("on", cfg.types.includes(b.dataset.type)));
    $$("[data-mark]").forEach((b) => b.classList.toggle("on", cfg.marks.includes(+b.dataset.mark)));
    $$("[data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === cfg.mode));
    $("#modeDesc").textContent = cfg.mode === "instant"
      ? "Submit an answer and the solution shows immediately."
      : "Answer everything first; score and solutions appear when you finish.";
    $("#status").value = cfg.status; $("#count").value = String(cfg.count); $("#order").value = cfg.order; $("#timer").value = String(cfg.timer);
    const m = filterQuestions(cfg);
    const take = cfg.count === "all" ? m.length : Math.min(m.length, +cfg.count);
    $("#matchCount").textContent = take;
    $("#matchDesc").textContent = take === m.length ? "questions match" : `of ${m.length} matching`;
    $("#startBtn").disabled = take === 0;
  };

  $$(".tree-head").forEach((hd) => hd.addEventListener("click", (e) => {
    if (e.target.matches("input")) return;
    const s = hd.parentElement;
    s.classList.toggle("open");
    s.classList.contains("open") ? open.add(s.dataset.subj) : open.delete(s.dataset.subj);
    store.set("builder.open", [...open]);
  }));
  $$("[data-subjbox]").forEach((b) => b.addEventListener("change", () => {
    const s = DB.tree[+b.dataset.subjbox];
    s.topics.forEach((t) => (b.checked ? sel.add(s.subject + "||" + t.topic) : sel.delete(s.subject + "||" + t.topic)));
    update();
  }));
  $$("[data-topic]").forEach((b) => b.addEventListener("change", () => { b.checked ? sel.add(b.dataset.topic) : sel.delete(b.dataset.topic); update(); }));
  $("#clearTopics").onclick = () => { sel.clear(); update(); };
  $("#expandAll").onclick = () => {
    const anyClosed = $$(".tree-subj").some((s) => !s.classList.contains("open"));
    $$(".tree-subj").forEach((s) => { s.classList.toggle("open", anyClosed); anyClosed ? open.add(s.dataset.subj) : open.delete(s.dataset.subj); });
    store.set("builder.open", [...open]);
    $("#expandAll").textContent = anyClosed ? "Collapse all" : "Expand all";
  };
  $("#topicSearch").addEventListener("input", (e) => {
    const v = e.target.value.trim().toLowerCase();
    $$(".tree-subj").forEach((s) => {
      let any = false;
      $$(".topic", s).forEach((t) => {
        const hit = !v || t.dataset.name.includes(v) || s.dataset.subj.toLowerCase().includes(v);
        t.style.display = hit ? "" : "none";
        any ||= hit;
      });
      s.style.display = any ? "" : "none";
      if (v) s.classList.toggle("open", any);
    });
  });
  const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  $$("[data-year]").forEach((b) => (b.onclick = () => { cfg.years = toggleIn(cfg.years, +b.dataset.year); update(); }));
  $$("[data-type]").forEach((b) => (b.onclick = () => { const n = toggleIn(cfg.types, b.dataset.type); if (n.length) cfg.types = n; update(); }));
  $$("[data-mark]").forEach((b) => (b.onclick = () => { const n = toggleIn(cfg.marks, +b.dataset.mark); if (n.length) cfg.marks = n; update(); }));
  $$("[data-mode]").forEach((b) => (b.onclick = () => { cfg.mode = b.dataset.mode; update(); }));
  $("#status").onchange = (e) => { cfg.status = e.target.value; update(); };
  $("#count").onchange = (e) => { cfg.count = e.target.value === "all" ? "all" : +e.target.value; update(); };
  $("#order").onchange = (e) => { cfg.order = e.target.value; update(); };
  $("#timer").onchange = (e) => { cfg.timer = +e.target.value; update(); };
  $("#startBtn").onclick = () => {
    let qs = filterQuestions(cfg);
    if (cfg.order === "random") qs = shuffle(qs);
    else {
      const dir = cfg.order === "oldest" ? 1 : -1;
      qs.sort((a, b) => dir * (a.year - b.year || (a.set || 0) - (b.set || 0)) || a.number - b.number);
    }
    if (cfg.count !== "all") qs = qs.slice(0, +cfg.count);
    const subjects = [...new Set(qs.map((q) => q.subject))];
    const topics = [...new Set(qs.map((q) => q.topic))];
    const title = sel.size === 0 ? "All subjects" : subjects.length === 1 ? (topics.length <= 2 ? `${subjects[0]}: ${topics.join(", ")}` : subjects[0]) : `${subjects.length} subjects`;
    const marks = qs.reduce((s, q) => s + q.marks, 0);
    const timeLimit = cfg.timer === -1 ? Math.round(marks * 2.77 * 60) : cfg.timer * 60;
    startPractice({ qids: qs.map((q) => q.id), title, mode: cfg.mode, timeLimit });
  };
  update();
}

// ---------------- practice session ----------------
function startPractice({ qids, title, mode, timeLimit }) {
  const old = store.get("session.practice");
  const go = () => {
    const s = { id: uid(), kind: "practice", title, mode, qids, idx: 0, responses: {}, startedAt: Date.now(), timeLimit, elapsed: 0, finished: false };
    store.set("session.practice", s);
    location.hash = "#/session";
  };
  if (old && !old.finished && Object.keys(old.responses).length) {
    modal(`<h3>Replace unfinished practice?</h3><p class="muted">You have an unfinished session: <b>${esc(old.title)}</b>. Starting a new one discards it.</p>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-close>Cancel</button><a class="btn" href="#/session" data-close>Resume old</a><button class="btn btn-primary" id="replaceGo">Start new</button></div>`,
      { onOpen: (bg, close) => ($("#replaceGo", bg).onclick = () => { close(); go(); }) });
  } else go();
}

function viewSession() {
  const s = store.get("session.practice");
  if (!s || s.finished) { location.hash = "#/practice"; return; }
  const save = () => store.set("session.practice", s);
  const qOf = (i) => DB.byId.get(s.qids[i]);
  const R = (id) => (s.responses[id] ||= { qid: id, ans: null, checked: false, time: 0, flag: false });
  let tick = Date.now();
  let draft = null; // working answer for current question before submit

  app.innerHTML = `<div class="wrap">
    <div class="run-top"><a class="btn btn-sm btn-ghost" href="#/practice">← Builder</a><span class="title" id="rtTitle"></span><div class="spacer"></div>
      <span class="tag" id="timerTag"></span><button class="btn btn-sm" id="finishBtn">Finish &amp; see results</button></div>
    <div class="progress"><i id="prog"></i></div>
    <div class="runner">
      <div class="card" id="qcard"></div>
      <aside class="card">
        <div class="row" style="margin-bottom:10px"><b>Questions</b><div class="spacer"></div><span class="muted small" id="doneCount"></span></div>
        <div class="palette" id="palette"></div>
        <div class="legend" id="legend"></div>
        <div class="kbd">Keys: <kbd>A</kbd>–<kbd>D</kbd> pick · <kbd>Enter</kbd> submit · <kbd>←</kbd><kbd>→</kbd> move · <kbd>F</kbd> flag</div>
      </aside>
    </div></div>`;
  $("#rtTitle").textContent = s.title + (s.mode === "instant" ? " · instant feedback" : " · results at end");

  function accrue() {
    const now = Date.now();
    const dt = (now - tick) / 1000;
    tick = now;
    if (document.hidden) return;
    s.elapsed += dt;
    const q = qOf(s.idx);
    if (q) R(q.id).time += dt;
  }

  const paintTimer = () => {
    $("#timerTag").textContent = s.timeLimit ? "⏱ " + fmtTime(s.timeLimit - s.elapsed) + " left" : "⏱ " + fmtTime(s.elapsed);
  };
  paintTimer();
  const timer = setInterval(() => {
    accrue();
    if (s.timeLimit) {
      const left = s.timeLimit - s.elapsed;
      $("#timerTag").textContent = "⏱ " + fmtTime(left) + " left";
      if (left <= 0) { finish(true); return; }
    } else $("#timerTag").textContent = "⏱ " + fmtTime(s.elapsed);
    save();
  }, 1000);

  function statusOf(i) {
    const q = qOf(i), r = s.responses[q.id];
    if (!r) return "";
    if (s.mode === "instant" && r.checked) return verdict(q, r.ans) === "correct" ? "correct" : verdict(q, r.ans) === "wrong" ? "wrong" : "skipped";
    if (isAnswered(q, r.ans)) return "ans";
    if (r.checked) return "skipped";
    return "";
  }

  function renderPalette() {
    $("#palette").innerHTML = s.qids.map((id, i) => {
      const r = s.responses[id];
      return `<div class="pnum ${statusOf(i)} ${i === s.idx ? "cur" : ""} ${r?.flag ? "flag" : ""}" data-go="${i}" title="${esc(DB.byId.get(id)?.paper_label + " Q" + DB.byId.get(id)?.number)}">${i + 1}</div>`;
    }).join("");
    $$("#palette [data-go]").forEach((p) => (p.onclick = () => go(+p.dataset.go)));
    const done = s.qids.filter((id) => { const r = s.responses[id]; return r && (r.checked || isAnswered(DB.byId.get(id), r.ans)); }).length;
    $("#doneCount").textContent = `${done}/${s.qids.length}`;
    $("#prog").style.width = (100 * done) / s.qids.length + "%";
    $("#legend").innerHTML = s.mode === "instant"
      ? `<span><i style="background:var(--good)"></i>Correct</span><span><i style="background:var(--bad)"></i>Wrong</span><span><i style="background:var(--surface-2);border:1px solid var(--border)"></i>Skipped</span><span><i style="background:var(--warn);border-radius:50%"></i>Flagged</span>`
      : `<span><i style="background:var(--accent-soft);border:1px solid var(--accent)"></i>Answered</span><span><i style="background:var(--surface-2);border:1px solid var(--border)"></i>Skipped</span><span><i style="background:var(--warn);border-radius:50%"></i>Flagged</span>`;
  }

  function go(i) {
    if (i < 0 || i >= s.qids.length) return;
    accrue();
    // keep unsubmitted end-mode answers
    s.idx = i;
    save();
    render();
  }

  function render() {
    const q = qOf(s.idx);
    const r = R(q.id);
    draft = r.ans == null ? (q.type === "MSQ" ? [] : null) : JSON.parse(JSON.stringify(r.ans));
    const locked = s.mode === "instant" && r.checked;
    const v = verdict(q, r.ans);
    const bm = bookmarks().has(q.id);
    const card = $("#qcard");
    card.innerHTML = `
      <div class="qmeta">
        <b>Q ${s.idx + 1}</b><span class="muted">/ ${s.qids.length}</span>
        <span class="tag">${esc(q.paper_label)} · Q${q.number}</span>
        <span class="tag type">${q.type}</span>
        <span class="tag">${q.marks} mark${q.marks > 1 ? "s" : ""}${q.type === "MCQ" ? ` · −${fmtMarks(q.marks / 3)}` : ""}</span>
        <span class="tag">${esc(q.subject)} › ${esc(q.topic)}</span>
        <div class="spacer"></div>
        <button class="star ${bm ? "on" : ""}" id="bmBtn" title="Bookmark">${bm ? "★" : "☆"}</button>
      </div>
      <div class="qtext">${safe(q.text)}</div>
      ${q.type === "NAT"
        ? `<div class="nat"><input type="text" inputmode="decimal" id="natIn" placeholder="Type your answer" value="${esc(draft ?? "")}" ${locked ? "readonly" : ""} class="${locked ? (v === "correct" ? "right" : v === "wrong" ? "wrong" : "") : ""}">${locked ? `<span>Correct: <b>${esc(correctText(q))}</b></span>` : ""}</div>`
        : `<ul class="options ${locked ? "locked" : ""}">${q.options.map((o, i) => {
            let cls = "option" + (q.type === "MSQ" ? " msq" : "");
            const picked = q.type === "MSQ" ? (draft || []).includes(i) : draft === i;
            if (locked) {
              const isRight = q.type === "MSQ" ? q.answer.correctSet.includes(i) : q.answer.correct === i;
              if (isRight) cls += " right"; else if (picked) cls += " wrong";
            } else if (picked) cls += " sel";
            return `<li class="${cls}" data-opt="${i}"><span class="key">${"ABCD"[i]}</span><div class="otext">${safe(o)}</div></li>`;
          }).join("")}</ul>`}
      ${q.type === "MSQ" && !locked ? `<div class="opt-desc">Select all correct options. No negative marking.</div>` : ""}
      ${locked ? `<div class="verdict ${v}">${v === "correct" ? "✓ Correct" : v === "wrong" ? "✕ Wrong" : "Skipped"}
          ${q.type !== "NAT" ? `<span style="font-weight:500">· answer ${esc(correctText(q))}${isAnswered(q, r.ans) ? ` · you chose ${esc(answerText(q, r.ans))}` : ""}</span>` : ""}
          <span style="font-weight:500">· ${fmtMarks(marksFor(q, v))} marks · ${fmtTime(r.time)}</span></div>
        <div class="solution"><span class="lbl">Solution</span>${safe(q.solution) || "<i>No written solution available.</i>"}${linksHTML(q)}</div>` : ""}
      <div class="actions">
        <button class="btn" id="prevBtn" ${s.idx === 0 ? "disabled" : ""}>← Prev</button>
        <button class="btn btn-ghost" id="flagBtn">${r.flag ? "⚑ Unflag" : "⚐ Flag"}</button>
        <div class="spacer"></div>
        ${s.mode === "instant"
          ? (locked ? "" : `<button class="btn btn-ghost" id="skipBtn">Skip &amp; show solution</button><button class="btn btn-primary" id="checkBtn">Submit</button>`)
          : `<button class="btn btn-ghost" id="clearBtn">Clear</button>`}
        <button class="btn ${locked || s.mode === "end" ? "btn-primary" : ""}" id="nextBtn">${s.idx === s.qids.length - 1 ? "Finish" : "Next →"}</button>
      </div>`;
    renderMath(card);
    renderPalette();

    // inputs
    if (!locked) {
      $$("[data-opt]", card).forEach((li) => (li.onclick = () => pick(+li.dataset.opt)));
      $("#natIn")?.addEventListener("input", (e) => {
        e.target.value = e.target.value.replace(/[^0-9.\-]/g, "");
        draft = e.target.value;
        if (s.mode === "end") { r.ans = draft; save(); renderPalette(); }
      });
    }
    $("#bmBtn").onclick = () => { const on = toggleBookmark(q.id); $("#bmBtn").classList.toggle("on", on); $("#bmBtn").textContent = on ? "★" : "☆"; };
    $("#prevBtn").onclick = () => go(s.idx - 1);
    $("#nextBtn").onclick = () => (s.idx === s.qids.length - 1 ? finish() : go(s.idx + 1));
    $("#flagBtn").onclick = () => { r.flag = !r.flag; save(); render(); };
    $("#checkBtn") && ($("#checkBtn").onclick = submit);
    $("#skipBtn") && ($("#skipBtn").onclick = () => { r.ans = null; r.checked = true; recordQStat(q.id, "skip"); save(); render(); });
    $("#clearBtn") && ($("#clearBtn").onclick = () => { r.ans = null; save(); render(); });
  }

  function pick(i) {
    const q = qOf(s.idx);
    const r = R(q.id);
    if (q.type === "MSQ") {
      draft = draft || [];
      draft = draft.includes(i) ? draft.filter((x) => x !== i) : [...draft, i].sort();
    } else draft = draft === i ? null : i;
    if (s.mode === "end") { r.ans = q.type === "MSQ" && !draft.length ? null : draft; save(); }
    $$("[data-opt]").forEach((li) => {
      const k = +li.dataset.opt;
      li.classList.toggle("sel", q.type === "MSQ" ? draft.includes(k) : draft === k);
    });
    renderPalette();
  }

  function submit() {
    const q = qOf(s.idx);
    const r = R(q.id);
    if (!isAnswered(q, draft)) { toast(q.type === "NAT" ? "Type a number first (or Skip)." : "Pick an option first (or Skip)."); return; }
    r.ans = draft;
    r.checked = true;
    recordQStat(q.id, verdict(q, r.ans));
    save();
    render();
  }

  function finish(timeUp = false) {
    const pending = s.qids.filter((id) => { const r = s.responses[id]; return !(r && (r.checked || isAnswered(DB.byId.get(id), r.ans))); }).length;
    const doIt = () => {
      clearInterval(timer);
      accrue();
      for (const id of s.qids) {
        const q = DB.byId.get(id);
        const r = s.responses[id];
        if (s.mode === "end" || !r?.checked) recordQStat(id, verdict(q, r?.ans));
      }
      s.finished = true;
      const res = { id: s.id, kind: "practice", title: s.title, mode: s.mode, qids: s.qids, responses: Object.fromEntries(Object.entries(s.responses).map(([k, v]) => [k, { ans: v.ans, time: Math.round(v.time) }])), startedAt: s.startedAt, endedAt: Date.now(), elapsed: Math.round(s.elapsed) };
      res.summary = (({ score, max, c, w, s: sk, n }) => ({ score, max, c, w, s: sk, n }))(computeSummary(DB, s.qids, res.responses));
      saveResult(res);
      store.del("session.practice");
      location.hash = "#/result/" + s.id;
    };
    if (timeUp) { toast("Time's up!"); return doIt(); }
    modal(`<h3>Finish this session?</h3><p class="muted">${pending ? `${pending} question${pending > 1 ? "s are" : " is"} still unanswered and will count as skipped.` : "All questions answered."}</p>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-close>Keep going</button><button class="btn btn-primary" id="finGo">Finish</button></div>`,
      { onOpen: (bg, close) => ($("#finGo", bg).onclick = () => { close(); doIt(); }) });
  }
  $("#finishBtn").onclick = () => finish();

  const onKey = (e) => {
    if ($(".modal-bg")) return;
    const typing = e.target.matches("input, textarea, select");
    const q = qOf(s.idx);
    if (!typing && /^[a-dA-D]$/.test(e.key) && q.type !== "NAT") { const r = s.responses[q.id]; if (!(s.mode === "instant" && r?.checked)) pick("abcd".indexOf(e.key.toLowerCase())); }
    else if (e.key === "Enter") { e.preventDefault(); const r = s.responses[q.id]; if (s.mode === "instant" && !r?.checked) submit(); else $("#nextBtn").click(); }
    else if (!typing && e.key === "ArrowRight") go(s.idx + 1);
    else if (!typing && e.key === "ArrowLeft") go(s.idx - 1);
    else if (!typing && (e.key === "f" || e.key === "F")) $("#flagBtn").click();
  };
  document.addEventListener("keydown", onKey);
  const onVis = () => { tick = Date.now(); };
  document.addEventListener("visibilitychange", onVis);
  setCleanup(() => { clearInterval(timer); accrue(); save(); document.removeEventListener("keydown", onKey); document.removeEventListener("visibilitychange", onVis); });
  render();
}

// ---------------- results ----------------
export function viewResult(id) {
  const res = getResult(id);
  if (!res) { app.innerHTML = `<div class="wrap"><div class="card empty">Result not found. <a href="#/history">Back to progress</a></div></div>`; return; }
  const S = computeSummary(DB, res.qids, res.responses);
  const isMock = res.kind === "mock";
  const pct = S.max ? Math.max(0, S.score) / S.max : 0;
  const C = 2 * Math.PI * 54;
  const attempted = S.c + S.w;

  app.innerHTML = `<div class="wrap stack">
    <div class="row"><a class="btn btn-sm btn-ghost" href="#/history">← Progress</a><div class="spacer"></div>
      <span class="muted small">${new Date(res.endedAt).toLocaleString()}</span></div>
    <div class="card score-hero">
      <svg class="ring" viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" fill="none" stroke="var(--surface-2)" stroke-width="12"/>
        <circle cx="60" cy="60" r="54" fill="none" stroke="var(--accent)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C * pct} ${C}" transform="rotate(-90 60 60)"/>
        <text x="60" y="58" text-anchor="middle" font-size="26" font-weight="700" fill="var(--text)">${fmtMarks(S.score)}</text>
        <text x="60" y="78" text-anchor="middle" font-size="12" fill="var(--muted)">of ${S.max} marks</text></svg>
      <div>
        <h1 style="margin-bottom:4px">${esc(res.title)}</h1>
        <div class="muted" style="margin-bottom:14px">${isMock ? "Mock test" : res.mode === "instant" ? "Practice · instant feedback" : "Practice · results at end"} · ${fmtTime(res.elapsed || S.time)} spent</div>
        <div class="stat-row">
          <div class="stat"><b style="color:var(--good)">${S.c}</b><span>correct</span></div>
          <div class="stat"><b style="color:var(--bad)">${S.w}</b><span>wrong</span></div>
          <div class="stat"><b>${S.s}</b><span>skipped</span></div>
          <div class="stat"><b>${attempted ? Math.round((100 * S.c) / attempted) : 0}%</b><span>accuracy</span></div>
        </div>
      </div>
    </div>
    ${isMock && res.sections ? `<div class="card"><h2>Sections</h2><div class="tbl-wrap"><table class="tbl"><tr><th>Section</th><th>Correct</th><th>Wrong</th><th>Skipped</th><th>Marks</th></tr>
      ${["GA", "CS"].map((sec) => { const ids = res.qids.filter((i) => DB.byId.get(i)?.section === sec); const x = computeSummary(DB, ids, res.responses); return `<tr><td>${sec === "GA" ? "General Aptitude" : "Computer Science &amp; IT"}</td><td>${x.c}</td><td>${x.w}</td><td>${x.s}</td><td><b>${fmtMarks(x.score)}</b> / ${x.max}</td></tr>`; }).join("")}
      </table></div></div>` : ""}
    <div class="card"><h2>By subject and topic</h2><div class="tbl-wrap"><table class="tbl">
      <tr><th>Subject / topic</th><th>Qs</th><th>✓</th><th>✕</th><th>–</th><th>Marks</th><th style="width:30%"></th></tr>
      ${S.bySubject.map((b) => `<tr><td><b>${esc(b.subject)}</b></td><td>${b.n}</td><td>${b.c}</td><td>${b.w}</td><td>${b.s}</td><td>${fmtMarks(b.score)}/${b.max}</td>
        <td><div class="acc-bar"><i class="c" style="width:${(100 * b.c) / b.n}%"></i><i class="w" style="width:${(100 * b.w) / b.n}%"></i></div></td></tr>
        ${Object.values(b.topics).length > 1 ? Object.values(b.topics).map((t) => `<tr class="sub-row"><td>${esc(t.topic)}</td><td>${t.n}</td><td>${t.c}</td><td>${t.w}</td><td>${t.s}</td><td></td><td><div class="acc-bar"><i class="c" style="width:${(100 * t.c) / t.n}%"></i><i class="w" style="width:${(100 * t.w) / t.n}%"></i></div></td></tr>`).join("") : ""}`).join("")}
    </table></div></div>
    <div class="card">
      <div class="row" style="margin-bottom:12px"><h2 style="margin:0">Review</h2><div class="spacer"></div>
        <div class="chips" id="revFilter"><button class="chip on" data-f="all">All ${S.n}</button><button class="chip" data-f="wrong">Wrong ${S.w}</button><button class="chip" data-f="skip">Skipped ${S.s}</button><button class="chip" data-f="correct">Correct ${S.c}</button></div></div>
      <div class="row" style="margin-bottom:14px">
        <button class="btn btn-sm" id="retryWrong" ${S.w + S.s ? "" : "disabled"}>Practise wrong + skipped again</button>
        <button class="btn btn-sm" id="retryAll">Redo all ${S.n}</button>
        <button class="btn btn-sm btn-ghost" id="expandRev">Expand all</button>
      </div>
      <div id="review"></div>
    </div></div>`;

  const items = res.qids.map((id, i) => {
    const q = DB.byId.get(id);
    if (!q) return "";
    const r = res.responses[id] || {};
    const v = verdict(q, r.ans);
    const plain = q.text.replace(/<[^>]+>/g, " ").replace(/\[\/?latex\]/g, "").replace(/\\(rightarrow|to)\b/g, "→").replace(/\\(leftarrow)\b/g, "←").replace(/\\[a-zA-Z]+/g, " ").replace(/[{}]/g, "").replace(/\s+/g, " ").slice(0, 140);
    return `<details class="review-item" data-v="${v}" data-qid="${esc(id)}">
      <summary><span class="dot ${v}"></span><b>${i + 1}.</b><span class="preview">${esc(plain)}</span><span class="tag">${esc(q.paper_label)} Q${q.number}</span><span class="tag">${fmtMarks(marksFor(q, v))}/${q.marks}</span><span class="tag">${fmtTime(r.time || 0)}</span></summary>
      <div class="body"></div></details>`;
  });
  $("#review").innerHTML = items.join("");
  $$(".review-item").forEach((d) => d.addEventListener("toggle", () => {
    if (!d.open || d.dataset.filled) return;
    d.dataset.filled = 1;
    const q = DB.byId.get(d.dataset.qid);
    const r = res.responses[q.id] || {};
    const body = $(".body", d);
    body.innerHTML = `<div class="qmeta"><span class="tag type">${q.type}</span><span class="tag">${esc(q.subject)} › ${esc(q.topic)}</span></div>
      <div class="qtext">${safe(q.text)}</div>
      ${q.type !== "NAT" ? `<ul class="options locked">${q.options.map((o, i) => {
        const isRight = q.type === "MSQ" ? q.answer.correctSet.includes(i) : q.answer.correct === i;
        const picked = q.type === "MSQ" ? (r.ans || []).includes(i) : r.ans === i;
        return `<li class="option ${isRight ? "right" : picked ? "wrong" : ""}"><span class="key">${"ABCD"[i]}</span><div class="otext">${safe(o)}</div></li>`;
      }).join("")}</ul>` : ""}
      <div class="yours"><span>Your answer: <b>${esc(answerText(q, r.ans))}</b></span><span>Correct: <b>${esc(correctText(q))}</b></span></div>
      <div class="solution"><span class="lbl">Solution</span>${safe(q.solution) || "<i>No written solution available.</i>"}${linksHTML(q)}</div>`;
    renderMath(body);
  }));
  $$("#revFilter .chip").forEach((c) => (c.onclick = () => {
    $$("#revFilter .chip").forEach((x) => x.classList.toggle("on", x === c));
    $$(".review-item").forEach((d) => (d.style.display = c.dataset.f === "all" || d.dataset.v === c.dataset.f ? "" : "none"));
  }));
  $("#expandRev").onclick = () => { const anyClosed = $$(".review-item").some((d) => !d.open && d.style.display !== "none"); $$(".review-item").forEach((d) => { if (d.style.display !== "none") d.open = anyClosed; }); };
  $("#retryWrong").onclick = () => {
    const ids = res.qids.filter((id) => verdict(DB.byId.get(id), res.responses[id]?.ans) !== "correct");
    startPractice({ qids: ids, title: "Retry: " + res.title, mode: "instant", timeLimit: 0 });
  };
  $("#retryAll").onclick = () => startPractice({ qids: res.qids, title: "Redo: " + res.title, mode: isMock ? "end" : res.mode, timeLimit: 0 });
}

// ---------------- mock list ----------------
function viewMockList() {
  const results = store.get("results", []).filter((r) => r.kind === "mock");
  const best = {};
  results.forEach((r) => { if (!best[r.paper] || r.summary.score > best[r.paper].summary.score) best[r.paper] = r; });
  const papers = [...DB.papers].sort((a, b) => b.year - a.year || (a.set || 0) - (b.set || 0));
  app.innerHTML = `<div class="wrap">
    <h1>Mock tests</h1>
    <p class="sub">Full previous-year papers in a GATE-style exam screen: 180 minutes, General Aptitude + CS sections, question palette, mark-for-review, on-screen calculator and keypad, negative marking for MCQs. Results and solutions appear after you submit.</p>
    <div class="grid grid-3">${papers.map((p) => {
      const b = best[p.slug];
      const tries = results.filter((r) => r.paper === p.slug).length;
      return `<div class="card paper-card"><div class="yr">${p.year}${p.set ? ` <span class="muted" style="font-size:16px;font-weight:600">Set ${p.set}</span>` : ""}</div>
        <div class="muted small">${p.questions} questions · ${p.marks} marks · 3 hours</div>
        <div class="small">${b ? `Best: <b>${fmtMarks(b.summary.score)}</b> / ${b.summary.max} · ${tries} attempt${tries > 1 ? "s" : ""}` : `<span class="muted">Not attempted</span>`}</div>
        <div class="row"><a class="btn btn-primary btn-sm" href="#/mock-start/${p.slug}">Start test</a>${b ? `<a class="btn btn-sm btn-ghost" href="#/result/${b.id}">Best result</a>` : ""}</div></div>`;
    }).join("")}</div></div>`;
}

// ---------------- history / progress ----------------
function viewHistory() {
  const results = store.get("results", []);
  const qstats = store.get("qstats", {});
  const bm = bookmarks();
  // subject accuracy from per-question last verdicts
  const subj = DB.tree.map((s) => {
    const ids = s.topics.flatMap((t) => t.ids);
    const att = ids.filter((id) => qstats[id]?.a > 0);
    const right = ids.filter((id) => qstats[id]?.last === "correct");
    const wrong = ids.filter((id) => qstats[id]?.last === "wrong");
    return { s: s.subject, n: ids.length, att: att.length, right: right.length, wrong: wrong.length, topics: s.topics.map((t) => ({ t: t.topic, n: t.ids.length, att: t.ids.filter((id) => qstats[id]?.a > 0).length, right: t.ids.filter((id) => qstats[id]?.last === "correct").length, wrong: t.ids.filter((id) => qstats[id]?.last === "wrong").length })) };
  });
  app.innerHTML = `<div class="wrap stack">
    <div><h1>Progress</h1><p class="sub" style="margin:0">Coverage and accuracy use your latest answer to each question.</p></div>
    <div class="card"><div class="row" style="margin-bottom:10px"><h2 style="margin:0">Sessions</h2></div>
      ${results.length ? `<div class="tbl-wrap"><table class="tbl"><tr><th>When</th><th>Session</th><th>Type</th><th>Score</th><th>✓/✕/–</th><th></th></tr>
      ${results.map((r) => `<tr><td class="small">${new Date(r.endedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</td><td>${esc(r.title)}</td><td class="small muted">${r.kind === "mock" ? "Mock" : r.mode === "instant" ? "Instant" : "End"}</td><td><b>${fmtMarks(r.summary.score)}</b>/${r.summary.max}</td><td class="small">${r.summary.c}/${r.summary.w}/${r.summary.s}</td><td><a class="btn btn-sm" href="#/result/${r.id}">Open</a></td></tr>`).join("")}
      </table></div>` : `<div class="empty">No sessions yet. <a href="#/practice">Start practising</a>.</div>`}</div>
    <div class="card"><h2>Coverage by subject</h2><div class="tbl-wrap"><table class="tbl" id="covTbl">
      <tr><th>Subject</th><th>Attempted</th><th>Right now</th><th>Wrong now</th><th style="width:30%"></th><th></th></tr>
      ${subj.map((x, i) => `<tr><td><b>${esc(x.s)}</b></td><td>${x.att}/${x.n}</td><td>${x.right}</td><td>${x.wrong}</td><td><div class="acc-bar"><i class="c" style="width:${(100 * x.right) / x.n}%"></i><i class="w" style="width:${(100 * x.wrong) / x.n}%"></i></div></td><td><button class="btn btn-sm btn-ghost" data-tg="${i}">Topics</button></td></tr>
        ${x.topics.map((t) => `<tr class="sub-row" data-sub="${i}" style="display:none"><td>${esc(t.t)}</td><td>${t.att}/${t.n}</td><td>${t.right}</td><td>${t.wrong}</td><td><div class="acc-bar"><i class="c" style="width:${(100 * t.right) / t.n}%"></i><i class="w" style="width:${(100 * t.wrong) / t.n}%"></i></div></td><td></td></tr>`).join("")}`).join("")}
    </table></div></div>
    <div class="card"><h2>Bookmarks</h2>${bm.size ? `<p class="muted">${bm.size} bookmarked question${bm.size > 1 ? "s" : ""}.</p><button class="btn btn-primary btn-sm" id="practBm">Practise bookmarks</button>` : `<p class="muted">Tap ☆ on any question to bookmark it.</p>`}</div>
    <div class="card"><h2>Backup</h2><p class="muted">Progress lives in this browser only. Export it to move to another device or browser, then import there.</p>
      <div class="row"><button class="btn btn-sm" id="exportBtn">Export progress</button><label class="btn btn-sm">Import progress<input type="file" id="importIn" accept="application/json" hidden></label><div class="spacer"></div><button class="btn btn-sm btn-danger" id="resetBtn">Reset everything</button></div></div>
  </div>`;
  $$("[data-tg]").forEach((b) => (b.onclick = () => $$(`[data-sub="${b.dataset.tg}"]`).forEach((r) => (r.style.display = r.style.display === "none" ? "" : "none"))));
  $("#practBm")?.addEventListener("click", () => startPractice({ qids: DB.questions.filter((q) => bm.has(q.id)).map((q) => q.id), title: "Bookmarked questions", mode: "instant", timeLimit: 0 }));
  $("#exportBtn").onclick = () => {
    const blob = new Blob([JSON.stringify(store.dumpAll())], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `gate-pyq-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  $("#importIn").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { store.loadAll(JSON.parse(await f.text())); toast("Progress imported."); viewHistory(); } catch { toast("That file didn't look right."); }
  };
  $("#resetBtn").onclick = () => modal(`<h3>Reset all progress?</h3><p class="muted">Deletes sessions, per-question history, bookmarks and any test in progress from this browser. Export first if you want a copy.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="resetGo">Reset</button></div>`,
    { onOpen: (bg, close) => ($("#resetGo", bg).onclick = () => { Object.keys(store.dumpAll()).forEach((k) => k !== "gatepyq.theme" && localStorage.removeItem(k)); close(); viewHistory(); }) });
}
