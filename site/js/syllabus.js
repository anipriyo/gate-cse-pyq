// Official GATE 2027 CS syllabus, mapped to PYQ topics, with study ticks and practice shortcuts.
import { $, $$, esc, store } from "./util.js";

const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

export function viewSyllabus(app, DB) {
  const S = DB.syllabus;
  if (!S) { app.innerHTML = `<div class="wrap"><div class="card empty">Syllabus data missing. Rebuild with build_db.py.</div></div>`; return; }
  const qstats = store.get("qstats", {});
  const studied = new Set(store.get("syllabus.studied", []));
  const open = new Set(store.get("syllabus.open", []));
  // topic key -> practice-pool ids
  const ids = new Map();
  for (const s of DB.tree) for (const t of s.topics) ids.set(s.subject + "||" + t.topic, t.ids);
  const idsOf = (keys) => [...new Set(keys.flatMap((k) => ids.get(k) || []))];
  const stat = (list) => {
    const att = list.filter((i) => qstats[i]?.a > 0).length;
    const right = list.filter((i) => qstats[i]?.last === "correct").length;
    return { n: list.length, att, right };
  };
  const itemKey = (si, gi, ii) => `${S.sections[si].id}.${gi}.${ii}`;
  const allItems = S.sections.flatMap((s, si) => s.groups.flatMap((g, gi) => g.items.map((_, ii) => itemKey(si, gi, ii))));

  const bar = (st) => `<div class="acc-bar" title="${st.att}/${st.n} attempted, ${st.right} right on last try"><i class="c" style="width:${pct(st.right, st.n)}%"></i><i class="w" style="width:${pct(st.att - st.right, st.n)}%"></i></div>`;

  app.innerHTML = `<div class="wrap stack">
    <div><h1>Syllabus</h1>
      <p class="sub" style="margin-bottom:8px">${esc(S.exam)}, official text, section by section. Each line links to the previous-year topics that test it (practice pool 2018–2026). Tick lines as you finish studying them.</p>
      <div class="row small"><a href="${esc(S.pdfs.cs)}" target="_blank" rel="noopener">CS syllabus PDF ↗</a><a href="${esc(S.pdfs.ga)}" target="_blank" rel="noopener">General Aptitude PDF ↗</a>
        <span class="muted">Local copies: <a href="data/syllabus/CS_GATE2027_Syllabus.pdf" target="_blank">CS</a> · <a href="data/syllabus/GA_GATE2027_Syllabus.pdf" target="_blank">GA</a></span></div></div>
    <div class="card"><div class="stat-row">
      <div class="stat"><b id="studiedPct">0%</b><span>syllabus lines ticked</span></div>
      <div class="stat"><b>${S.sections.length}</b><span>sections</span></div>
      <div class="stat"><b>${allItems.length}</b><span>syllabus lines</span></div>
      <div class="stat"><b>${stat(DB.questions.map((q) => q.id)).att}</b><span>PYQs attempted</span></div></div>
      <div class="row" style="margin-top:14px"><button class="btn btn-sm btn-ghost" id="sylExpand">Expand all</button></div></div>
    ${S.sections.map((sec, si) => {
      const keys = sec.groups.flatMap((g) => g.items.flatMap((it) => it.topics));
      const st = stat(idsOf(keys));
      const secItems = sec.groups.flatMap((g, gi) => g.items.map((_, ii) => itemKey(si, gi, ii)));
      const done = secItems.filter((k) => studied.has(k)).length;
      return `<div class="card syl-sec ${open.has(sec.id) ? "open" : ""}" data-sec="${esc(sec.id)}">
        <div class="syl-head"><span class="chev">▸</span><span class="syl-id">${esc(sec.id)}</span><b class="syl-name">${esc(sec.name)}</b>
          <span class="muted small syl-meta">${st.n} PYQs · <span data-done="${esc(sec.id)}">${done}</span>/${secItems.length} ticked</span>${bar(st)}</div>
        <div class="syl-body">
          ${sec.groups.map((g, gi) => `${g.name ? `<h3 class="syl-group">${esc(g.name)}</h3>` : ""}
            ${g.items.map((it, ii) => {
              const k = itemKey(si, gi, ii);
              const list = idsOf(it.topics);
              const ist = stat(list);
              return `<div class="syl-item">
                <label class="syl-check"><input type="checkbox" data-item="${k}" ${studied.has(k) ? "checked" : ""}><span>${esc(it.text)}</span></label>
                <div class="syl-topics">${it.topics.length ? it.topics.map((t) => {
                  const tl = ids.get(t) || [];
                  const ts = stat(tl);
                  return `<button class="chip syl-chip" data-practice="${esc(t)}" title="${ts.att}/${ts.n} attempted · ${ts.right} right">${esc(t.split("||")[1])} <span class="muted">${tl.length}</span></button>`;
                }).join("") : `<span class="muted small">No PYQs since 2018 on this line</span>`}
                ${list.length > 1 && it.topics.length > 1 ? `<button class="btn btn-sm btn-ghost" data-practice-all="${esc(it.topics.join("##"))}">Practise all ${list.length}</button>` : ""}
                ${list.length ? `<span class="syl-mini">${bar(ist)}</span>` : ""}</div></div>`;
            }).join("")}`).join("")}
          <div class="row" style="margin-top:12px"><button class="btn btn-sm btn-primary" data-practice-all="${esc([...new Set(keys)].join("##"))}">Practise whole section (${st.n})</button></div>
        </div></div>`;
    }).join("")}
    ${S.out_of_syllabus?.length ? `<div class="card"><h2>In past papers, not in the GATE 2027 syllabus</h2>
      <p class="muted small">These topics appear in 2018–2026 papers but the 2027 syllabus no longer lists them. They are still in the practice pool, marked “not in 2027 syllabus”.</p>
      <div class="chips">${S.out_of_syllabus.map((t) => `<button class="chip" data-practice="${esc(t)}">${esc(t.replace("||", " › "))} <span class="muted">${(ids.get(t) || []).length}</span></button>`).join("")}</div></div>` : ""}
  </div>`;

  const paintPct = () => { $("#studiedPct").textContent = pct(allItems.filter((k) => studied.has(k)).length, allItems.length) + "%"; };
  paintPct();
  $$(".syl-head").forEach((hd) => (hd.onclick = () => {
    const c = hd.parentElement;
    c.classList.toggle("open");
    c.classList.contains("open") ? open.add(c.dataset.sec) : open.delete(c.dataset.sec);
    store.set("syllabus.open", [...open]);
  }));
  $("#sylExpand").onclick = () => {
    const anyClosed = $$(".syl-sec").some((c) => !c.classList.contains("open"));
    $$(".syl-sec").forEach((c) => { c.classList.toggle("open", anyClosed); anyClosed ? open.add(c.dataset.sec) : open.delete(c.dataset.sec); });
    store.set("syllabus.open", [...open]);
    $("#sylExpand").textContent = anyClosed ? "Collapse all" : "Expand all";
  };
  $$("[data-item]").forEach((b) => (b.onchange = () => {
    b.checked ? studied.add(b.dataset.item) : studied.delete(b.dataset.item);
    store.set("syllabus.studied", [...studied]);
    const sec = b.dataset.item.split(".")[0];
    $(`[data-done="${sec}"]`).textContent = $$(`[data-item^="${sec}."]`).filter((x) => x.checked).length;
    paintPct();
  }));
  // open the practice builder pre-filled with these topics (user still controls everything else)
  const toBuilder = (keys) => {
    const cfg = store.get("builder", {});
    store.set("builder", { ...cfg, topics: keys.filter((k) => ids.has(k)), status: cfg.status || "all" });
    const subj = [...new Set(keys.map((k) => k.split("||")[0]))];
    store.set("builder.open", subj);
    location.hash = "#/practice";
  };
  $$("[data-practice]").forEach((b) => (b.onclick = () => toBuilder([b.dataset.practice])));
  $$("[data-practice-all]").forEach((b) => (b.onclick = () => toBuilder(b.dataset.practiceAll.split("##"))));
}
