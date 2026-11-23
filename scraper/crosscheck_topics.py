"""Independent completeness check against practicepaper.in's topic-wise and subject-wise pages.

Each topic/subject page (e.g. /gate-cse/probability-theory) lists questions from every year, newest
first. A question's id there is <paper quizId>*100 + <question number>, the same id as on the year page,
so every topic-page question can be matched to our database.

The script fetches every slug linked from the topic-wise index (both topics and whole subjects), stops
paging once a page holds only questions older than FIRST_YEAR, saves raw pages, and reports:
  * questions from FIRST_YEAR+ papers that appear on a topic page but are missing from data/pyqs.json
  * database questions that never appear on any topic/subject page
  * questions whose topic page disagrees with the tag we stored (informational)

Usage:
    ~/.venvs/analysis/bin/python scraper/crosscheck_topics.py [--month 2026-11]
Raw: data/raw/<month>/practicepaper_topics/<slug>/page_NN.json   Report: data/crosscheck_report.txt
"""
import argparse
import collections
import datetime as dt
import json
import pathlib
import re
import time

from scrape_practicepaper import BASE, fetch, parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = "/gate-cse/topic-wise-practice-of-gate-cse-previous-year-papers"
SUBJECT_INDEX = "/gate-cse/gate-cse-subject-wise-questions"
FIRST_YEAR = 2014


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--month", default=dt.date.today().strftime("%Y-%m"))
    ap.add_argument("--delay", type=float, default=1.0)
    ap.add_argument("--all-topics", action="store_true")
    args = ap.parse_args()

    db = json.loads((ROOT / "data" / "pyqs.json").read_text())
    quiz_of = {}  # paper slug -> quizId, from the raw year pages
    for f in (ROOT / "data" / "raw").glob(f"{args.month}/practicepaper/*/page_01.json"):
        quiz_of[f.parent.name] = json.loads(f.read_text())["meta"]["quizId"]
    # quizId*100+number -> our record
    by_ppid = {}
    for q in db["questions"]:
        if q["paper"] in quiz_of:
            by_ppid[quiz_of[q["paper"]] * 100 + q["number"]] = q
    min_quiz = min(v for k, v in quiz_of.items() if int(k[9:13]) >= FIRST_YEAR)

    # Subject pages list every question exactly once (fast, enough for completeness).
    # --all-topics also walks the ~100 topic pages (slow, ~1 h; only adds tag comparisons).
    html = fetch(BASE + (INDEX if args.all_topics else SUBJECT_INDEX))
    found = set(re.findall(r'href="(?:https://practicepaper\.in)?/gate-cse/([a-z0-9-]+)"', html))
    if not args.all_topics:
        found |= {"discrete-mathematics"}  # a subject page not linked from the subject index
    slugs = sorted(found - {
        "topic-wise-practice-of-gate-cse-previous-year-papers", "gate-cse-year-wise-questions",
        "gate-cse-subject-wise-questions", "gate-cse-syllabus", "gate-cse-mock-test-series", "gate-cse-notes"})
    out = ROOT / "data" / "raw" / args.month / "practicepaper_topics"
    seen = collections.defaultdict(set)   # ppid -> {slug}
    tags = {}                              # ppid -> (tag1 = paper name, tag2 = topic)
    for slug in slugs:
        d = out / slug
        d.mkdir(parents=True, exist_ok=True)
        page, total = 1, None
        while total is None or page <= total:
            f = d / f"page_{page:02d}.json"
            if f.exists():
                data = json.loads(f.read_text())
            else:
                try:
                    data = parse(fetch(f"{BASE}/gate-cse/{slug}" + ("" if page == 1 else f"?page_no={page}")))
                except ValueError:
                    print(f"  {slug}: no question data (not a topic page)")
                    break
                f.write_text(json.dumps(data, ensure_ascii=False))
                time.sleep(args.delay)
            total = data["meta"]["totalPages"]
            ids = [q["id"] for q in data["questions"]]
            for q in data["questions"]:
                seen[q["id"]].add(slug)
                tags[q["id"]] = (q.get("tag1"), q.get("tag2"))
            if ids and max(ids) // 100 < min_quiz:
                break  # everything further is older than FIRST_YEAR
            page += 1
        print(f"  {slug}: {page if total is None else min(page, total)} page(s)")

    lines = []
    recent = {i for i in seen if i // 100 >= min_quiz and (i // 100) in set(quiz_of.values())}
    missing = sorted(recent - set(by_ppid))
    never = sorted(set(by_ppid) - set(seen))
    lines.append(f"Topic/subject slugs checked: {len(slugs)}")
    lines.append(f"Distinct {FIRST_YEAR}+ questions seen on topic pages: {len(recent)}; in database: {len(by_ppid)}")
    lines.append(f"On a topic page but MISSING from database: {len(missing)}")
    lines += [f"   {i} {tags[i]}" for i in missing]
    lines.append(f"In database but on NO topic/subject page: {len(never)}")
    lines += [f"   {by_ppid[i]['id']} {by_ppid[i]['subject']} / {by_ppid[i]['topic']}" for i in never]
    unknown_quiz = sorted({i // 100 for i in seen if i // 100 >= min_quiz} - set(quiz_of.values()))
    names = {i // 100: tags[i][0] for i in seen if i // 100 in unknown_quiz}
    lines.append("Quiz ids on topic pages that are not a scraped GATE paper (expected: ISRO papers): "
                 + ", ".join(f"{k} = {names.get(k)}" for k in unknown_quiz))
    # where each database question appears (useful for remapping topics)
    appear = {by_ppid[i]["id"]: sorted(s) for i, s in seen.items() if i in by_ppid}
    (ROOT / "data" / "crosscheck_topic_slugs.json").write_text(json.dumps(appear, indent=0, sort_keys=True))
    report = "\n".join(lines)
    (ROOT / "data" / "crosscheck_report.txt").write_text(report + "\n")
    print(report)


if __name__ == "__main__":
    main()
