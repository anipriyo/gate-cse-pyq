# scraper

Two steps: fetch raw pages, then build the database.

## 1. `scrape_practicepaper.py`

Every practicepaper.in year page (for example `https://practicepaper.in/gate-cse/gate-cse-2024-set-1?page_no=3`) embeds a `<script id="pp-quiz-data">` JSON blob with 5 questions: text, options, answer (`correct`, `correctSet` or `ansMin`/`ansMax`), solution HTML (ending in a GATE Overflow link), `tag1` (subject) and `tag2` (topic). The script:

- reads the paper list from `/gate-cse/gate-cse-year-wise-questions` and keeps 2014 onwards (new papers such as 2027 are picked up automatically);
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
- folds duplicate names (`C programming` vs `C Programming`, `Transactions` vs `Transaction`, and so on), preferring the properly capitalised spelling;
- re-files every question under the official GATE 2027 syllabus sections using `syllabus.py` (e.g. probability moves from practicepaper's Discrete Mathematics to Engineering Mathematics › Probability and Statistics; hashing to Algorithms; B/B+ trees to Databases), keeps practicepaper's own tags in `pp_subject`/`pp_topic`, and flags topics the 2027 syllabus dropped (`in_syllabus: false`);
- marks papers before 2018 `mock_only` (used only as full mock tests);
- writes the syllabus (official text split into lines, each with its topics) into the site data and copies the PDFs to `site/data/syllabus/`; fails loudly ("Problems") if any practice topic sits on no syllabus line;
- downloads every `<img>` once and rewrites it to a local path;
- pulls the GATE Overflow URL out of the solution into `go_url`, and builds a YouTube search URL.

```bash
~/.venvs/analysis/bin/python scraper/build_db.py
```

Record fields: `id` (e.g. `2024-1-07`), `paper`, `paper_label`, `year`, `set`, `number` (practicepaper numbering: CS questions 1–55, General Aptitude 56–65), `section` (`GA`/`CS`), `type` (`MCQ`/`MSQ`/`NAT`), `marks`, `subject` (syllabus section), `topic`, `in_syllabus`, `mock_only`, `pp_subject`, `pp_topic`, `text`, `options`, `answer`, `solution`, `go_url`, `youtube_url`, `source_url`.

## 3. `crosscheck_topics.py` (completeness check)

Walks every topic and subject page linked from practicepaper's topic-wise index (newest first, stopping at pre-2014 questions). A question id there is `quizId*100 + number`, so each one maps back to a paper. Reports questions seen on topic pages but missing from the database, database questions on no topic page, and unknown papers. Output: `data/crosscheck_report.txt`, raw pages in `data/raw/<month>/practicepaper_topics/`.

```bash
cd scraper && ~/.venvs/analysis/bin/python crosscheck_topics.py
```

## Syllabus mapping (`syllabus.py`)

Hand-made from the official PDFs (`data/raw/2026-11/syllabus/`): `SUBJECT` and `TOPIC` map practicepaper tags to syllabus sections/topics, `QUESTION` fixes individual mis-filed questions, `OUT_OF_SYLLABUS` lists dropped topics, `SECTIONS` holds the official text line by line. When a new syllabus comes out, update this file and rebuild.

Notes: gateoverflow.in returns 403 to scripts, so it is not scraped. GATE IT was a separate paper only from 2004 to 2008, so 2018 onwards is CSE only.
