// GATE-style mock test (CBT console look and rules).
import { $, $$, esc, store, uid, isAnswered, verdict, recordQStat, renderMath, safe, fmtTime, fmtMarks, saveResult, computeSummary } from "./util.js";
import { toggleCalculator, closeCalculator } from "./calc.js";
import { modal, setCleanup, toast } from "./app.js";

const DURATION = 180 * 60;
const SECTIONS = [
  { key: "GA", name: "General Aptitude", short: "GA" },
  { key: "CS", name: "Computer Science and Information Technology", short: "CS & IT" },
];

function paperQids(DB, slug) {
  const qs = DB.questions.filter((q) => q.paper === slug);
  // GATE order: General Aptitude first (Q1–10), then the subject paper (Q11–65)
  return [...qs.filter((q) => q.section === "GA"), ...qs.filter((q) => q.section !== "GA")].map((q) => q.id);
}

const LEGEND = `
  <div><span class="xs small">1</span> Not Visited</div>
  <div><span class="xs small na">2</span> Not Answered</div>
  <div><span class="xs small a">3</span> Answered</div>
  <div><span class="xs small m">4</span> Marked for Review</div>
  <div class="full"><span class="xs small am">5</span> Answered &amp; Marked for Review (will be considered for evaluation)</div>`;

export function renderExamInstructions(app, DB, slug) {
  const paper = DB.papers.find((p) => p.slug === slug);
  if (!paper) { location.hash = "#/mock"; return; }
  const running = store.get("session.exam");
  document.body.classList.add("exam-mode");
  app.innerHTML = `<div class="exam">
    <div class="x-head"><div><div class="x-title">${esc(paper.label)} — Mock Test</div><div class="x-sub">Computer Science and Information Technology (CS)</div></div><div class="spacer"></div><a class="x-hbtn" href="#/mock">Exit</a></div>
    <div class="x-instr">
      <h2>General Instructions</h2>
      <ol>
        <li>Total duration of the examination is <b>180 minutes</b>. The clock at the top right shows the remaining time. When it reaches zero, the test ends by itself; you do not need to submit.</li>
        <li>The paper has <b>${paper.questions} questions</b> for <b>${paper.marks} marks</b> in two sections: <b>General Aptitude</b> (Q1–Q10, 15 marks) and <b>Computer Science and Information Technology</b> (Q11–Q65, 85 marks). You can move between sections at any time.</li>
        <li>The question palette on the right shows the status of each question:
          <div class="legend-row"><span class="xs">1</span> You have not visited the question yet.</div>
          <div class="legend-row"><span class="xs na">2</span> You have not answered the question.</div>
          <div class="legend-row"><span class="xs a">3</span> You have answered the question.</div>
          <div class="legend-row"><span class="xs m">4</span> You have NOT answered the question, but have marked it for review.</div>
          <div class="legend-row"><span class="xs am">5</span> You have answered the question and marked it for review. This answer will be evaluated.</div>
        </li>
        <li>Your answer is saved only when you click <b>Save &amp; Next</b> or <b>Mark for Review &amp; Next</b>. If you jump to another question from the palette without saving, the selection you made on the current question is <b>not</b> saved, just as in the real exam.</li>
        <li>Click <b>Clear Response</b> to remove a saved answer.</li>
      </ol>
      <h2>Question types and marking</h2>
      <ol>
        <li><b>MCQ</b> (one correct option): 1-mark questions carry −1/3 for a wrong answer, 2-mark questions carry −2/3.</li>
        <li><b>MSQ</b> (one or more correct options): full marks only if you select exactly all correct options. No negative marking, no partial marks.</li>
        <li><b>NAT</b> (numerical answer): type the value with the on-screen keypad (your keyboard also works). No negative marking. Answers within the official range are accepted.</li>
        <li>A <b>scientific calculator</b> is available from the top bar. Your result, solutions and links to GATE Overflow and YouTube appear after you submit.</li>
      </ol>
      ${running && !running.finished ? `<p style="color:#b42318"><b>Note:</b> you have another mock test in progress (${esc(running.title)}). Starting this one will discard it.</p>` : ""}
    </div>
    <div class="x-agree"><label><input type="checkbox" id="agree"> I have read and understood the instructions. I am ready to begin the test and will not use any unfair means.</label>
      <button class="x-btn blue" id="beginBtn" disabled>I am ready to begin</button></div>
  </div>`;
  $("#agree").onchange = (e) => ($("#beginBtn").disabled = !e.target.checked);
  $("#beginBtn").onclick = () => {
    const qids = paperQids(DB, slug);
    const st = {};
    qids.forEach((id) => (st[id] = { visited: false, saved: null, marked: false, time: 0 }));
    store.set("session.exam", { id: uid(), paper: slug, title: paper.label, qids, cur: 0, st, remaining: DURATION, startedAt: Date.now(), finished: false });
    location.hash = "#/exam";
  };
}

export function resumeExamIfAny(app, DB) {
  const E = store.get("session.exam");
  if (!E || E.finished) return false;
  runExam(app, DB, E);
  return true;
}

function runExam(app, DB, E) {
  document.body.classList.add("exam-mode");
  const save = () => store.set("session.exam", E);
  const Q = (i) => DB.byId.get(E.qids[i]);
  const secOf = (i) => (Q(i).section === "GA" ? "GA" : "CS");
  let draft = null;
  let tick = Date.now();

  app.innerHTML = `<div class="exam">
    <div class="x-head"><div><div class="x-title">${esc(E.title)} — Mock Test</div><div class="x-sub">Computer Science and Information Technology (CS)</div></div><div class="spacer"></div>
      <button class="x-hbtn" id="calcBtn">Calculator</button><button class="x-hbtn x-hide-sm" id="paperBtn">Question Paper</button><button class="x-hbtn x-hide-sm" id="instrBtn">Instructions</button>
      <button class="x-hbtn x-drawer-btn" id="drawerBtn">☰ Palette</button></div>
    <div class="x-strip"><div class="x-tabs">${SECTIONS.map((s) => `<button class="x-tab" data-sec="${s.key}"><span class="full">${s.name}</span><span class="short">${s.short}</span></button>`).join("")}</div>
      <div class="x-timer" id="xTimer"></div></div>
    <div class="x-body">
      <div class="x-main">
        <div class="x-qhead" id="xQhead"></div>
        <div class="x-q" id="xQ"></div>
        <div class="x-foot">
          <button class="x-btn" id="markBtn">Mark for Review &amp; Next</button>
          <button class="x-btn" id="clearBtn">Clear Response</button>
          <div class="spacer"></div>
          <button class="x-btn" id="backBtn">&lt;&lt; Back</button>
          <button class="x-btn blue" id="saveBtn">Save &amp; Next</button>
        </div>
      </div>
      <div class="x-side" id="xSide">
        <div class="x-cand"><div class="x-avatar">👤</div><div><b>Candidate</b><div style="font-size:12px;color:#555">${esc(E.title)}</div></div></div>
        <div class="x-legend" id="xLegend"></div>
        <div class="x-pal-title" id="xPalTitle"></div>
        <div class="x-pal" id="xPal"></div>
        <div class="x-submit"><button class="x-btn blue" id="submitBtn">Submit</button></div>
      </div>
    </div></div>`;

  function status(id) {
    const s = E.st[id];
    if (!s.visited) return "";
    const ans = s.saved != null;
    if (s.marked) return ans ? "am" : "m";
    return ans ? "a" : "na";
  }
  function counts(ids) {
    const c = { "": 0, na: 0, a: 0, m: 0, am: 0 };
    ids.forEach((id) => c[status(id)]++);
    return c;
  }

  function renderSide() {
    const sec = secOf(E.cur);
    $$(".x-tab").forEach((t) => t.classList.toggle("on", t.dataset.sec === sec));
    const ids = E.qids.map((id, i) => [id, i]).filter(([, i]) => secOf(i) === sec);
    const c = counts(ids.map(([id]) => id));
    $("#xLegend").innerHTML = `
      <div><span class="xs small">${c[""]}</span> Not Visited</div>
      <div><span class="xs small na">${c.na}</span> Not Answered</div>
      <div><span class="xs small a">${c.a}</span> Answered</div>
      <div><span class="xs small m">${c.m}</span> Marked for Review</div>
      <div class="full"><span class="xs small am">${c.am}</span> Answered &amp; Marked for Review (will be considered for evaluation)</div>`;
    $("#xPalTitle").textContent = SECTIONS.find((s) => s.key === sec).name;
    $("#xPal").innerHTML = ids.map(([id, i]) => `<div class="xs ${status(id)} ${i === E.cur ? "cur" : ""}" data-go="${i}">${i + 1}</div>`).join("");
    $$("#xPal [data-go]").forEach((d) => (d.onclick = () => { go(+d.dataset.go); $("#xSide").classList.remove("open"); }));
  }

  function renderQ() {
    const q = Q(E.cur);
    const s = E.st[q.id];
    s.visited = true;
    draft = s.saved == null ? (q.type === "MSQ" ? [] : q.type === "NAT" ? "" : null) : JSON.parse(JSON.stringify(s.saved));
    const neg = q.type === "MCQ" ? fmtMarks(q.marks / 3) : "0";
    $("#xQhead").innerHTML = `<b>Question No. ${E.cur + 1}</b>
      <div class="meta"><span>Question Type: <b>${q.type}</b></span><span>Marks for correct answer: <span class="pos">${q.marks}</span></span><span>Negative marks: <span class="neg">${neg}</span></span></div>`;
    $("#xQ").innerHTML = `<div class="qtext">${safe(q.text)}</div>
      ${q.type === "NAT" ? `<div class="x-nat"><input type="text" id="natIn" inputmode="none" autocomplete="off" value="${esc(draft)}">
          <div class="x-keypad">
            <button class="wide" data-kp="bs">Backspace</button>
            ${["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "-"].map((k) => `<button data-kp="${k}">${k}</button>`).join("")}
            <button data-kp="left">←</button><button data-kp="right">→</button><button data-kp="clr">Clear All</button>
          </div></div>`
        : `<ul class="x-opts">${q.options.map((o, i) => `<li data-o="${i}"><input type="${q.type === "MSQ" ? "checkbox" : "radio"}" name="xo" ${q.type === "MSQ" ? (draft.includes(i) ? "checked" : "") : draft === i ? "checked" : ""} tabindex="-1"><span class="k">(${"ABCD"[i]})</span><span class="t">${safe(o)}</span></li>`).join("")}</ul>`}`;
    renderMath($("#xQ"));
    $("#xQ").scrollTop = 0;
    if (q.type === "NAT") {
      const inp = $("#natIn");
      inp.addEventListener("input", () => { inp.value = inp.value.replace(/[^0-9.\-]/g, ""); draft = inp.value; });
      $$("[data-kp]").forEach((b) => (b.onclick = () => {
        const k = b.dataset.kp;
        let pos = inp.selectionStart ?? inp.value.length;
        const v = inp.value;
        if (k === "bs") { if (pos > 0) { inp.value = v.slice(0, pos - 1) + v.slice(pos); pos--; } }
        else if (k === "clr") { inp.value = ""; pos = 0; }
        else if (k === "left") pos = Math.max(0, pos - 1);
        else if (k === "right") pos = Math.min(v.length, pos + 1);
        else { inp.value = v.slice(0, pos) + k + v.slice(pos); pos++; }
        draft = inp.value;
        inp.focus({ preventScroll: true });
        inp.setSelectionRange(pos, pos);
      }));
    } else {
      $$("[data-o]").forEach((li) => (li.onclick = () => {
        const i = +li.dataset.o;
        if (q.type === "MSQ") draft = draft.includes(i) ? draft.filter((x) => x !== i) : [...draft, i].sort();
        else draft = i;
        $$("[data-o]").forEach((l) => ($("input", l).checked = q.type === "MSQ" ? draft.includes(+l.dataset.o) : draft === +l.dataset.o));
      }));
    }
    $("#backBtn").disabled = E.cur === 0;
    save();
    renderSide();
  }

  function accrue() {
    const now = Date.now();
    const dt = (now - tick) / 1000;
    tick = now;
    const q = Q(E.cur);
    if (q) E.st[q.id].time += dt;
    return dt;
  }

  function go(i) {
    if (i < 0 || i >= E.qids.length) return;
    accrue();
    E.cur = i; // unsaved draft is discarded, as in GATE
    renderQ();
  }
  const commit = () => {
    const q = Q(E.cur);
    E.st[q.id].saved = isAnswered(q, draft) ? (q.type === "NAT" ? String(draft).trim() : draft) : null;
  };
  const nextIdx = () => (E.cur + 1 < E.qids.length ? E.cur + 1 : 0);

  $("#saveBtn").onclick = () => {
    const q = Q(E.cur);
    if (q.type === "NAT" && String(draft).trim() !== "" && isNaN(parseFloat(draft))) { toast("Enter a valid number."); return; }
    commit();
    E.st[q.id].marked = false;
    go(nextIdx());
  };
  $("#markBtn").onclick = () => { commit(); E.st[Q(E.cur).id].marked = true; go(nextIdx()); };
  $("#clearBtn").onclick = () => { const q = Q(E.cur); E.st[q.id].saved = null; renderQ(); };
  $("#backBtn").onclick = () => go(E.cur - 1);
  $$(".x-tab").forEach((t) => (t.onclick = () => go(E.qids.findIndex((_, i) => secOf(i) === t.dataset.sec))));
  $("#calcBtn").onclick = toggleCalculator;
  $("#drawerBtn").onclick = () => $("#xSide").classList.toggle("open");
  $("#instrBtn").onclick = () => modal(`<h3>Instructions</h3><ul style="padding-left:18px">
      <li>Answers are saved only with <b>Save &amp; Next</b> or <b>Mark for Review &amp; Next</b>.</li>
      <li>MCQ: −1/3 (1-mark) or −2/3 (2-mark) for wrong answers. MSQ and NAT: no negative marks.</li>
      <li>Answered &amp; Marked for Review questions are evaluated. Marked-only questions are not.</li></ul>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;margin:12px 0" class="exam-legend-inline">${LEGEND}</div>
      <div class="row" style="justify-content:flex-end"><button class="btn btn-primary" data-close>Close</button></div>`);
  $("#paperBtn").onclick = () => {
    const close = modal(`<h3>Question Paper</h3><div class="muted small" style="margin-bottom:8px">Click a question to open it.</div>
      <div id="qpList" style="max-height:60vh;overflow:auto">${E.qids.map((id, i) => { const q = DB.byId.get(id); return `<div data-qp="${i}" style="padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer"><b>Q${i + 1}.</b> <span class="muted small">(${q.type}, ${q.marks}m)</span> <span class="qp-t">${safe(q.text).replace(/<img[^>]*>/g, "[figure]")}</span></div>`; }).join("")}</div>
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-close>Close</button></div>`,
      { onOpen: (bg) => { renderMath(bg); $$("[data-qp]", bg).forEach((d) => (d.onclick = () => { go(+d.dataset.qp); bg.remove(); })); } });
    void close;
  };

  const paintTimer = () => {
    const t = $("#xTimer");
    if (!t) return;
    t.textContent = "Time Left : " + fmtTime(E.remaining).padStart(7, "0");
    t.classList.toggle("low", E.remaining < 300);
  };
  paintTimer();
  let lastT = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    E.remaining -= (now - lastT) / 1000;
    lastT = now;
    accrue();
    paintTimer();
    if (E.remaining <= 0) { finish(true); return; }
    save();
  }, 1000);

  function finish(auto) {
    const doIt = () => {
      clearInterval(timer);
      closeCalculator();
      accrue();
      E.finished = true;
      const responses = {};
      for (const id of E.qids) {
        const s = E.st[id];
        // Marked-only (no answer) is not evaluated; answered (incl. answered & marked) is.
        responses[id] = { ans: s.saved, time: Math.round(s.time), marked: s.marked };
        recordQStat(id, verdict(DB.byId.get(id), s.saved));
      }
      const res = { id: E.id, kind: "mock", paper: E.paper, title: E.title + " (mock)", qids: E.qids, responses, startedAt: E.startedAt, endedAt: Date.now(), elapsed: Math.round(DURATION - Math.max(0, E.remaining)), sections: true };
      res.summary = (({ score, max, c, w, s, n }) => ({ score, max, c, w, s, n }))(computeSummary(DB, E.qids, responses));
      saveResult(res);
      store.del("session.exam");
      document.body.classList.remove("exam-mode");
      location.hash = "#/result/" + E.id;
    };
    if (auto) { toast("Time is over. Your test has been submitted."); doIt(); return; }
    const rows = SECTIONS.map((sec) => {
      const ids = E.qids.filter((_, i) => secOf(i) === sec.key);
      const c = counts(ids);
      return `<tr><td>${sec.name}</td><td>${ids.length}</td><td>${c.a}</td><td>${c.na}</td><td>${c.m}</td><td>${c.am}</td><td>${c[""]}</td></tr>`;
    }).join("");
    modal(`<style>.modal{max-width:720px}</style><h3>Submit the test?</h3><div style="overflow-x:auto"><table class="x-sum"><tr><th>Section</th><th>No. of Questions</th><th>Answered</th><th>Not Answered</th><th>Marked for Review</th><th>Answered &amp; Marked</th><th>Not Visited</th></tr>${rows}</table></div>
      <p class="muted small">Time left: ${fmtTime(E.remaining)}. After submitting you cannot change answers.</p>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-close>No, go back</button><button class="btn btn-primary" id="subGo">Yes, submit</button></div>`,
      { onOpen: (bg, close) => ($("#subGo", bg).onclick = () => { close(); doIt(); }) });
  }
  $("#submitBtn").onclick = () => finish(false);

  const onKey = (e) => {
    if ($(".modal-bg") || e.target.matches("input[type=text]")) return;
    const q = Q(E.cur);
    if (/^[a-dA-D]$/.test(e.key) && q.type !== "NAT") $(`[data-o="${"abcd".indexOf(e.key.toLowerCase())}"]`)?.click();
  };
  document.addEventListener("keydown", onKey);
  const onUnload = () => { accrue(); save(); };
  window.addEventListener("beforeunload", onUnload);
  setCleanup(() => { clearInterval(timer); closeCalculator(); accrue(); save(); document.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", onUnload); });
  renderQ();
}
