"""Scrape GATE CSE previous-year papers (2018 onwards) from practicepaper.in.

Each year page on practicepaper.in embeds a JSON blob (<script id="pp-quiz-data">)
holding 5 questions per page: text, options, correct answer, solution (with a
GATE Overflow link), subject tag and topic tag. We fetch every page of every
paper, save the raw JSON untouched, and leave the normalising to build_db.py.

Usage:
    ~/.venvs/analysis/bin/python scraper/scrape_practicepaper.py            # all papers, skip cached pages
    ~/.venvs/analysis/bin/python scraper/scrape_practicepaper.py --force    # refetch everything
    ~/.venvs/analysis/bin/python scraper/scrape_practicepaper.py --month 2027-03   # new snapshot folder

Raw output: data/raw/<YYYY-MM>/practicepaper/<paper-slug>/page_NN.json
"""
import argparse
import datetime as dt
import json
import pathlib
import re
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = "https://practicepaper.in"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
DATA_RE = re.compile(r'<script[^>]*id=["\']pp-quiz-data["\'][^>]*>(.*?)</script>', re.S)
YEAR_LIST = "/gate-cse/gate-cse-year-wise-questions"
FIRST_YEAR = 2018


def fetch(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # network hiccup: back off and retry
            if i == tries - 1:
                raise
            print(f"  retry {url}: {e}", file=sys.stderr)
            time.sleep(3 * (i + 1))


def paper_slugs():
    """Discover paper slugs (2018+) from the year-wise index page."""
    html = fetch(BASE + YEAR_LIST)
    slugs = sorted(set(re.findall(r'href="/gate-cse/(gate-cse-(\d{4})(?:-set-\d)?)"', html)))
    return [s for s, y in slugs if int(y) >= FIRST_YEAR]


def parse(html):
    m = DATA_RE.search(html)
    if not m:
        raise ValueError("pp-quiz-data not found")
    return json.loads(m.group(1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--month", default=dt.date.today().strftime("%Y-%m"))
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--delay", type=float, default=1.0, help="seconds between requests")
    args = ap.parse_args()

    out_root = ROOT / "data" / "raw" / args.month / "practicepaper"
    slugs = paper_slugs()
    print(f"{len(slugs)} papers: {', '.join(slugs)}")
    for slug in slugs:
        d = out_root / slug
        d.mkdir(parents=True, exist_ok=True)
        page, total = 1, None
        while total is None or page <= total:
            f = d / f"page_{page:02d}.json"
            if f.exists() and not args.force:
                data = json.loads(f.read_text())
            else:
                url = f"{BASE}/gate-cse/{slug}" + ("" if page == 1 else f"?page_no={page}")
                data = parse(fetch(url))
                f.write_text(json.dumps(data, ensure_ascii=False, indent=1))
                time.sleep(args.delay)
            total = data["meta"]["totalPages"]
            page += 1
        print(f"  {slug}: {total} pages, {data['meta']['totalQuestions']} questions")


if __name__ == "__main__":
    main()
