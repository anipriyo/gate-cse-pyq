"""Build the PYQ database from the raw practicepaper.in snapshot.

Reads   data/raw/<YYYY-MM>/practicepaper/<paper>/page_NN.json   (newest month by default)
Writes  data/pyqs.json          - full database (one record per question)
        data/pyqs.sqlite        - same thing as a SQLite table `questions`
        data/img/...            - every image used in questions/solutions (downloaded once)
        site/data/questions.json - compact copy the website loads
        site/data/img/...        - images for the website

Usage:
    ~/.venvs/analysis/bin/python scraper/build_db.py [--month 2026-11]
"""
import argparse
import html
import json
import pathlib
import re
import shutil
import sqlite3
import sys
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = "https://practicepaper.in"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
IMG_RE = re.compile(r'(<img[^>]*?\bsrc=["\'])([^"\']+)(["\'])', re.I)
GO_RE = re.compile(r'href=["\'](https?://gateoverflow\.in/[^"\']+)["\']', re.I)
GO_ANCHOR_RE = re.compile(r'(<br\s*/?>\s*)*<a[^>]*gateoverflow\.in[^>]*>.*?</a>\s*', re.I | re.S)

# practicepaper uses a few near-duplicate topic names; fold them together.
TOPIC_ALIASES = {
    "File Systems": "File System",
    "Functions": "Function",
    "Recurrence": "Recurrence Relation",
    "Transactions": "Transaction",
}
SUBJECT_ALIASES = {
    "Computer Networks": "Computer Network",
}


def canon(name, aliases, seen):
    """Trim, apply aliases, and fold case-only variants onto the first spelling seen."""
    name = re.sub(r"\s+", " ", name).strip()
    name = aliases.get(name, name)
    return seen.setdefault(name.lower(), name)


def plain(s, words=12):
    s = re.sub(r"\[/?latex\]|<[^>]+>|\\[a-zA-Z]+|[{}$^_\\]", " ", html.unescape(s or ""))
    return " ".join(s.split()[:words])


def latest_month():
    months = sorted(p.name for p in (ROOT / "data" / "raw").iterdir() if p.is_dir())
    return months[-1]


def download(url, dest):
    if dest.exists():
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    for i in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": BASE + "/"})
            with urllib.request.urlopen(req, timeout=40) as r:
                dest.write_bytes(r.read())
            time.sleep(0.3)
            return True
        except Exception as e:
            print(f"  img retry {url}: {e}", file=sys.stderr)
            time.sleep(2 * (i + 1))
    return False


def localise_images(s, missing):
    """Download <img> sources and rewrite them to img/<path>."""
    def repl(m):
        src = html.unescape(m.group(2))
        absu = urllib.parse.urljoin(BASE + "/", src)
        p = urllib.parse.urlparse(absu)
        rel = p.path.lstrip("/").replace("wp-content/uploads/", "")
        rel = re.sub(r"[^A-Za-z0-9._/-]", "_", rel)
        if download(absu, ROOT / "data" / "img" / rel):
            return f"{m.group(1)}data/img/{rel}{m.group(3)}"
        missing.append(absu)
        return m.group(0)
    return IMG_RE.sub(repl, s or "")


def paper_meta(slug):
    m = re.match(r"gate-cse-(\d{4})(?:-set-(\d))?$", slug)
    year, st = int(m.group(1)), (int(m.group(2)) if m.group(2) else None)
    label = f"GATE CSE {year}" + (f" Set {st}" if st else "")
    return year, st, label


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--month", default=None)
    args = ap.parse_args()
    month = args.month or latest_month()
    raw = ROOT / "data" / "raw" / month / "practicepaper"

    records, missing, problems = [], [], []
    subj_seen, topic_seen = {}, {}
    papers = []
    for pdir in sorted(raw.iterdir()):
        slug = pdir.name
        year, st, label = paper_meta(slug)
        qs, meta = [], None
        for f in sorted(pdir.glob("page_*.json")):
            d = json.loads(f.read_text())
            meta = d["meta"]
            for q in d["questions"]:
                q["_page"] = d["meta"]["pageNo"]
                qs.append(q)
        if len(qs) != meta["totalQuestions"]:
            problems.append(f"{slug}: got {len(qs)} questions, site says {meta['totalQuestions']}")
        marks = sum(q["marks"] for q in qs)
        if marks != meta["totalMarks"]:
            problems.append(f"{slug}: marks sum {marks}, site says {meta['totalMarks']}")
        papers.append({"slug": slug, "year": year, "set": st, "label": label,
                       "questions": len(qs), "marks": marks})

        for q in qs:
            subject = canon((q.get("tag1") or "Uncategorised"), SUBJECT_ALIASES, subj_seen)
            topic = canon((q.get("tag2") or subject), TOPIC_ALIASES, topic_seen)
            if topic == subject:
                topic = "Mixed / other"
            sol = q.get("solution") or ""
            go = GO_RE.search(sol)
            go_url = go.group(1) if go else None
            sol_clean = GO_ANCHOR_RE.sub("", sol).strip()
            sol_clean = re.sub(r"(<br\s*/?>\s*)+$", "", sol_clean)

            t = q["type"]
            if t == "MCQ":
                answer = {"correct": q.get("correct")}
            elif t == "MSQ":
                answer = {"correctSet": q.get("correctSet")}
            elif t == "NAT":
                answer = {"min": q.get("ansMin"), "max": q.get("ansMax")}
            else:
                answer = {}
                problems.append(f"{slug} Q{q['number']}: unknown type {t}")
            if t in ("MCQ",) and answer["correct"] is None:
                problems.append(f"{slug} Q{q['number']}: MCQ without answer")
            if t == "NAT" and answer["min"] is None:
                problems.append(f"{slug} Q{q['number']}: NAT without answer")

            yt_query = f"{label} {plain(q.get('text'))}"
            records.append({
                "id": f"{year}{'-' + str(st) if st else ''}-{q['number']:02d}",
                "paper": slug,
                "paper_label": label,
                "year": year,
                "set": st,
                "number": q["number"],
                "section": "GA" if subject == "General Aptitude" else "CS",
                "type": t,
                "marks": q["marks"],
                "subject": subject,
                "topic": topic,
                "text": localise_images(q.get("text"), missing),
                "options": [localise_images(o, missing) for o in (q.get("options") or [])],
                "answer": answer,
                "solution": localise_images(sol_clean, missing),
                "go_url": go_url,
                "youtube_url": "https://www.youtube.com/results?search_query=" + urllib.parse.quote_plus(yt_query),
                "source_url": f"{BASE}/gate-cse/{slug}" + ("" if q["_page"] == 1 else f"?page_no={q['_page']}"),
            })

    # ---- outputs -------------------------------------------------------
    out = {"source": "practicepaper.in", "snapshot": month, "papers": papers, "questions": records}
    (ROOT / "data" / "pyqs.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))

    db = ROOT / "data" / "pyqs.sqlite"
    db.unlink(missing_ok=True)
    con = sqlite3.connect(db)
    cols = ["id", "paper", "paper_label", "year", "set", "number", "section", "type", "marks",
            "subject", "topic", "text", "options", "answer", "solution", "go_url", "youtube_url", "source_url"]
    con.execute(f"CREATE TABLE questions ({', '.join('"' + c + '"' + (' PRIMARY KEY' if c == 'id' else '') for c in cols)})")
    con.executemany(f"INSERT INTO questions VALUES ({','.join('?' * len(cols))})",
                    [[json.dumps(r[c], ensure_ascii=False) if isinstance(r[c], (list, dict)) else r[c] for c in cols]
                     for r in records])
    con.commit()
    con.close()

    site = ROOT / "site" / "data"
    site.mkdir(parents=True, exist_ok=True)
    (site / "questions.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    if (ROOT / "data" / "img").exists():
        shutil.copytree(ROOT / "data" / "img", site / "img", dirs_exist_ok=True)

    print(f"{len(records)} questions from {len(papers)} papers (snapshot {month})")
    for p in papers:
        print(f"  {p['label']:<22} {p['questions']:>3} q  {p['marks']:>3} marks")
    print(f"GO links: {sum(1 for r in records if r['go_url'])}/{len(records)}")
    print(f"Images missing: {len(missing)}")
    for m in missing[:20]:
        print("   ", m)
    print(f"Problems: {len(problems)}")
    for p in problems:
        print("   ", p)


if __name__ == "__main__":
    main()
