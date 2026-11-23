// Shared helpers: data loading, storage, scoring, rendering.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function h(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ---------- data ----------
let DB = null;
export async function loadDB() {
  if (DB) return DB;
  const r = await fetch("data/questions.json");
  const d = await r.json();
  // d.all = every question (incl. mock-only 2014–2017 papers); d.questions = the practice pool
  d.all = d.questions;
  d.byId = new Map(d.all.map((q) => [q.id, q]));
  d.questions = d.all.filter((q) => !q.mock_only);
  // subject -> topic -> [ids]
  const tree = new Map();
  for (const q of d.questions) {
    if (!tree.has(q.subject)) tree.set(q.subject, new Map());
    const t = tree.get(q.subject);
    if (!t.has(q.topic)) t.set(q.topic, []);
    t.get(q.topic).push(q.id);
  }
  // subjects in official syllabus order (S1..S10, then General Aptitude)
  const secOrder = (d.syllabus?.sections || []).map((x) => x.name);
  const order = (s) => { const i = secOrder.indexOf(s); return i < 0 ? 999 : i; };
  d.tree = [...tree.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]))
    .map(([s, t]) => ({ subject: s, topics: [...t.entries()].sort((a, b) => b[1].length - a[1].length).map(([n, ids]) => ({ topic: n, ids, out: d.byId.get(ids[0])?.in_syllabus === false })) }));
  d.years = [...new Set(d.questions.map((q) => q.year))].sort((a, b) => b - a);
  DB = d;
  return d;
}

// ---------- storage ----------
const NS = "gatepyq.";
export const store = {
  get(k, dflt) {
    try {
      const v = localStorage.getItem(NS + k);
      return v == null ? dflt : JSON.parse(v);
    } catch {
      return dflt;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(NS + k, JSON.stringify(v));
    } catch (e) {
      console.warn("storage failed", e);
    }
  },
  del(k) {
    try {
      localStorage.removeItem(NS + k);
    } catch {}
  },
  dumpAll() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith(NS)) out[k] = localStorage.getItem(k);
    }
    return out;
  },
  loadAll(obj) {
    for (const [k, v] of Object.entries(obj)) if (k.startsWith(NS)) localStorage.setItem(k, v);
  },
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// per-question history: {qid: {a: attempts, c: correct, last: 'c'|'w'|'s', t: ts}}
export function recordQStat(qid, verdict) {
  const s = store.get("qstats", {});
  const e = s[qid] || { a: 0, c: 0 };
  if (verdict !== "skip") {
    e.a++;
    if (verdict === "correct") e.c++;
  }
  e.last = verdict;
  e.t = Date.now();
  s[qid] = e;
  store.set("qstats", s);
}

export function bookmarks() {
  return new Set(store.get("bookmarks", []));
}
export function toggleBookmark(qid) {
  const b = bookmarks();
  b.has(qid) ? b.delete(qid) : b.add(qid);
  store.set("bookmarks", [...b]);
  return b.has(qid);
}

// ---------- answers & scoring (GATE rules) ----------
export function isAnswered(q, a) {
  if (a == null) return false;
  if (q.type === "MSQ") return Array.isArray(a) && a.length > 0;
  if (q.type === "NAT") return String(a).trim() !== "" && !isNaN(parseFloat(a));
  return a !== "" && a !== undefined;
}

export function verdict(q, a) {
  if (!isAnswered(q, a)) return "skip";
  if (q.type === "MCQ") return a === q.answer.correct ? "correct" : "wrong";
  if (q.type === "MSQ") {
    const want = [...(q.answer.correctSet || [])].sort().join(",");
    return [...a].sort().join(",") === want ? "correct" : "wrong";
  }
  if (q.type === "NAT") {
    const v = parseFloat(a);
    const { min, max } = q.answer;
    const eps = 1e-9;
    return v >= Math.min(min, max) - eps && v <= Math.max(min, max) + eps ? "correct" : "wrong";
  }
  return "wrong";
}

// Marks per GATE: MCQ wrong = -1/3 of marks; MSQ & NAT no negative.
export function marksFor(q, v) {
  if (v === "correct") return q.marks;
  if (v === "wrong" && q.type === "MCQ") return -q.marks / 3;
  return 0;
}

export const fmtMarks = (m) => (Math.round(m * 100) / 100).toFixed(2).replace(/\.00$/, "");

export function answerText(q, a) {
  if (!isAnswered(q, a)) return "—";
  if (q.type === "MCQ") return "ABCD"[a] ?? a;
  if (q.type === "MSQ") return [...a].sort().map((i) => "ABCD"[i]).join(", ");
  return String(a);
}
export function correctText(q) {
  if (q.type === "MCQ") return "ABCD"[q.answer.correct];
  if (q.type === "MSQ") return (q.answer.correctSet || []).map((i) => "ABCD"[i]).join(", ");
  const { min, max } = q.answer;
  return min === max ? String(min) : `${min} to ${max}`;
}

export const typeName = { MCQ: "Multiple Choice (MCQ)", MSQ: "Multiple Select (MSQ)", NAT: "Numerical Answer (NAT)" };

// ---------- math rendering ----------
// Content uses [latex]...[/latex]; KaTeX auto-render handles it.
export function renderMath(el) {
  if (!window.renderMathInElement) {
    // KaTeX not loaded yet; retry shortly
    setTimeout(() => window.renderMathInElement && renderMath(el), 300);
    return;
  }
  try {
    window.renderMathInElement(el, {
      delimiters: [
        { left: "[latex]", right: "[/latex]", display: false },
        { left: "$$", right: "$$", display: true },
        { left: "\\(", right: "\\)", display: false },
        { left: "\\[", right: "\\]", display: true },
      ],
      throwOnError: false,
      strict: "ignore",
    });
  } catch (e) {
    console.warn(e);
  }
}

// Scraped HTML is from one known source; still strip anything executable.
export function safe(html) {
  return String(html ?? "")
    .replace(/<\s*(script|iframe|object|embed|style)[\s\S]*?<\/\s*\1\s*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
}

export function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function linksHTML(q) {
  return `<div class="sol-links">
    ${q.go_url ? `<a class="btn btn-sm" href="${esc(q.go_url)}" target="_blank" rel="noopener">GATE Overflow ↗</a>` : `<a class="btn btn-sm" href="https://www.google.com/search?q=${encodeURIComponent("gateoverflow " + q.paper_label + " question " + q.number)}" target="_blank" rel="noopener">Find on GATE Overflow ↗</a>`}
    <a class="btn btn-sm" href="${esc(q.youtube_url)}" target="_blank" rel="noopener">YouTube solutions ↗</a>
    <a class="btn btn-sm btn-ghost" href="${esc(q.source_url)}" target="_blank" rel="noopener">Source ↗</a>
  </div>`;
}

// Store finished sessions (results) — keeps the latest 300.
export function saveResult(res) {
  const all = store.get("results", []);
  const i = all.findIndex((r) => r.id === res.id);
  if (i >= 0) all[i] = res;
  else all.unshift(res);
  store.set("results", all.slice(0, 300));
}
export function getResult(id) {
  return store.get("results", []).find((r) => r.id === id);
}

export function computeSummary(db, qids, responses) {
  let score = 0, max = 0, c = 0, w = 0, s = 0, time = 0;
  const bySubject = {};
  for (const id of qids) {
    const q = db.byId.get(id);
    if (!q) continue;
    const r = responses[id] || {};
    const v = verdict(q, r.ans);
    const m = marksFor(q, v);
    score += m;
    max += q.marks;
    time += r.time || 0;
    v === "correct" ? c++ : v === "wrong" ? w++ : s++;
    const key = q.subject;
    const b = (bySubject[key] ||= { subject: key, n: 0, c: 0, w: 0, s: 0, score: 0, max: 0, topics: {} });
    b.n++; b.max += q.marks; b.score += m;
    v === "correct" ? b.c++ : v === "wrong" ? b.w++ : b.s++;
    const t = (b.topics[q.topic] ||= { topic: q.topic, n: 0, c: 0, w: 0, s: 0 });
    t.n++;
    v === "correct" ? t.c++ : v === "wrong" ? t.w++ : t.s++;
  }
  return { score, max, c, w, s, n: qids.length, time, bySubject: Object.values(bySubject).sort((a, b) => b.n - a.n) };
}
