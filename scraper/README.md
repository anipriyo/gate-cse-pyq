# scraper

Two steps: fetch raw pages, then build the database.

## 1. `scrape_practicepaper.py`

Every practicepaper.in year page (for example `https://practicepaper.in/gate-cse/gate-cse-2024-set-1?page_no=3`) embeds a `<script id="pp-quiz-data">` JSON blob with 5 questions: text, options, answer (`correct`, `correctSet` or `ansMin`/`ansMax`), solution HTML (ending in a GATE Overflow link), `tag1` (subject) and `tag2` (topic). The script:

- reads the paper list from `/gate-cse/gate-cse-year-wise-questions` and keeps 2018 onwards (new papers such as 2027 are picked up automatically);
- walks `?page_no=1..totalPages` for each paper, 1 second between requests;
- saves each page untouched to `data/raw/<YYYY-MM>/practicepaper/<paper>/page_NN.json`, skipping pages already saved.

```bash
~/.venvs/analysis/bin/python scraper/scrape_practicepaper.py              # default month = today
~/.venvs/analysis/bin/python scraper/scrape_practicepaper.py --month 2027-03
~/.venvs/analysis/bin/python scraper/scrape_practicepaper.py --force      # refetch
```

## 2. `build_db.py`

Reads the newest snapshot (or `--month`) and writes `data/pyqs.json`, `data/pyqs.sqlite` (table `questions`), `data/img/`, and the website copies in `site/data/`. It:

- checks each paper's question count and mark total against the site's own `totalQuestions` / `totalMarks` and prints any mismatch under "Problems";
- folds duplicate names (`C programming` vs `C Programming`, `Transactions` vs `Transaction`, and so on);
- downloads every `<img>` once and rewrites it to a local path;
- pulls the GATE Overflow URL out of the solution into `go_url`, and builds a YouTube search URL.

```bash
~/.venvs/analysis/bin/python scraper/build_db.py
```

Record fields: `id` (e.g. `2024-1-07`), `paper`, `paper_label`, `year`, `set`, `number` (practicepaper numbering: CS questions 1–55, General Aptitude 56–65), `section` (`GA`/`CS`), `type` (`MCQ`/`MSQ`/`NAT`), `marks`, `subject`, `topic`, `text`, `options`, `answer`, `solution`, `go_url`, `youtube_url`, `source_url`.

Notes: gateoverflow.in returns 403 to scripts, so it is not scraped. GATE IT was a separate paper only from 2004 to 2008, so 2018 onwards is CSE only.
