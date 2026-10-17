# Weekly deal update instructions

Playbook for the **weekly research update** of the M&A tracker (Mondays, 7:30 AM Eastern). GitHub Actions only refreshes market data and headlines; everything in `data/deals.json` needs a human-quality read of real sources. Follow these steps exactly.

Only edit `data/deals.json`. Never touch `index.html`, `assets/`, `scripts/`, `data/market.json` or `data/news.json`.

## What the page shows (keep it short)

Each deal is a compact card. The page displays only: **name + Pending/Closed badge**, the **`summary`** line, the **`terms`** table (Buyer, Target, Value, Structure, Advisors, Expected close), the **3 most recent `updates`** (date + one-line `title`), and the **`questions`** behind a "Test yourself" button.

`facts` (long, with `sources`) is the verified record behind the scenes. It is not shown on the page but is how you prove every number; keep it accurate and sourced. Source links are not shown on the page.

## Ground rules (accuracy)

1. Only write facts found in a real source: company press release, SEC filing, regulator page, or a reputable outlet (Reuters, Bloomberg, WSJ, FT, Nikkei, CNBC, trade press). Record the link in `facts[].sources` / `updates[].source_url`.
2. If something is not publicly reported write exactly **"Not disclosed"**. Never estimate or fill gaps.
3. Reported-but-unconfirmed numbers carry `"badge": "Unconfirmed"` in `facts`, and say "unconfirmed" in `terms`.
4. If sources conflict, show both with the outlet named in `facts`; keep `terms` to the short version.
5. Practice-answer arithmetic must be labeled "illustrative" and use only reported inputs.
6. Dates are `YYYY-MM-DD`. If only a month is known use the 1st and set `"approx": true`.

## Step 1: Check each deal for news

For every deal, search the web (primary sources first: company IR, SEC EDGAR, regulator pages such as UK CMA / European Commission / FTC, Rothschild & Co newsroom; then Reuters, Bloomberg, WSJ, FT, Nikkei, trade press). Look for anything since `last_reviewed`: shareholder votes, regulatory milestones, financing, price/terms changes, competing bids, litigation, delays, closing. Re-check every "Not disclosed" field.

- **McCormick + Unilever Foods** (`mccormick-unilever-foods`): McCormick shareholder vote (S-4, meeting date, result); UK CMA (Phase 1 decision was due 2026-11-11; Phase 2 or undertakings; Colman's sale); EU notification; other jurisdictions; S-4 / Form 10 effectiveness; bonds replacing the bridge; ratings; closing (expected mid-2027).
- **Bain Capital + Gong cha** (`bain-gong-cha`): closing; any official price; financing; approvals; competing bids; new EBITDA/valuation reports.

## Step 2: Add dated updates (ONE LINE each)

Add one object per new event to `updates`:

```json
{"date": "2026-11-11", "title": "CMA clears Phase 1", "source_label": "CMA", "source_url": "https://..."}
```

- `title` is **one line, 90 characters or fewer**, plain facts, no sentences of explanation. Good: "McCormick shareholders approve deal (vote 2026-12-04)". Bad: a paragraph.
- `detail` is optional: at most one short sentence, not shown on the page. Omit it unless it adds a number.
- Use `"upcoming": true` for scheduled future milestones (not shown on the page; keep for tracking). When it happens, replace it with a real dated entry.
- Never delete past updates. The page shows only the 3 newest.

## Step 3: Update summary, terms, facts

- Rewrite `summary`: **one line, 100 characters or fewer**, current status + next milestone with a date (e.g. "Reverse Morris Trust. US cleared; UK CMA Phase 1 decision due Nov 11.").
- Update `terms` (array of `["Label","value"]` pairs, in this order: Buyer, Target, Value, Structure, Advisors, Expected close). Each value is **short (about 70 characters or fewer)**. Use "Not disclosed" for unknowns; label unconfirmed figures "(unconfirmed)".
- Keep `terms` consistent with `facts`. Update `facts` and their `sources` whenever something changes or is newly disclosed.
- Set top-level `last_reviewed` to today, even if nothing changed.

## Step 4: Add 2 to 3 new practice questions

Append to `questions`: `{"q": "...", "a": "..."}`. Investment-banking interview style (why this deal, strategic vs financial buyer, valuation vs comps, financing, accretion/dilution, synergies, risks, what could block it, structure mechanics). Tie at least one to something that happened this week. Answers: **3 to 6 sentences**, sourced numbers only. Keep at most about 10 questions per deal; drop the oldest or weakest.

## Step 5: Mark a deal closed

On a source-confirmed close: set `"status_tag": "Closed"` and `"closed_date"`; rewrite `summary` ("Closed <date>. Final terms ..."); add a "Deal closes" update; update `terms`/`facts` with final values (final price if disclosed); add one lessons-learned question. The deal stays on the page marked Closed for **14 days**.

## Step 6: Replace closed deals (after 14 days)

When `closed_date` is 14+ days ago, remove the deal and add a **new consumer deal announced in the last few months** (restaurants and food, retail and apparel, or consumer products). Prefer deals where **Rothschild & Co is an advisor** (https://www.rothschildandco.com/en/newsroom/). Keep **one strategic and one private equity deal** on the page whenever possible: replace like with like. If no good same-type match exists, say so in the commit message.

New entry shape (same as existing deals): `id` (kebab-case), `name`, `tag` ("Strategic" or "Private equity"), `status_tag` ("Pending"), `closed_date` (null), `summary`, `terms`, `news_query` (Google News search words), `facts` (buyer, target, deal value, structure, premium, implied multiple, advisors on each side, strategic rationale, financing, expected close, approvals needed, each with sources), `updates` (at least the announcement), `questions` (5-7). Same accuracy rules.

## Step 7: Validate and save

1. `python3 -c "import json; json.load(open('data/deals.json'))"` prints nothing.
2. Every deal has `id, name, tag, status_tag, summary, terms, news_query, facts, updates, questions`; `terms` has exactly the 6 labels above; every update `title` is one line (90 chars or fewer); all URLs start with `https://`.
3. Commit only `data/deals.json`: `Weekly deal update YYYY-MM-DD: <one-line summary>`; push to `main` (or push a branch and open a PR if main is protected).
4. Reply with a short summary: what changed per deal, any new/replaced deal, anything unverified.
