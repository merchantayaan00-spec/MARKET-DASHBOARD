# Weekly deal update instructions

This file is the playbook for the **weekly research update** of the M&A tracker (every Monday, 7:30 AM Eastern). GitHub Actions already refreshes the "Latest news" boxes automatically; everything else in `data/deals.json` needs a human-quality read of the sources. Follow these steps exactly.

Only edit `data/deals.json` (and this file if the process changes). Never touch `index.html` or anything in `assets/` or `scripts/` as part of a deal update. Do not edit `data/market.json` or `data/news.json` (the Actions workflow owns them).

## Ground rules (accuracy)

1. Only write facts you found in a real source: a company press release, SEC filing, regulator page, or a reputable outlet (Reuters, Bloomberg, WSJ, FT, Nikkei, CNBC, trade press). **Link the source for every key number** (`sources` on a fact, `source_url` on an update).
2. If something is not publicly reported, write exactly **"Not disclosed"**. Never estimate or fill gaps.
3. Reported-but-unconfirmed numbers (e.g. press reports of a price) must carry the `"badge": "Unconfirmed"` flag. Company-confirmed numbers need no badge.
4. If sources conflict, show both with the outlet named; do not pick one silently.
5. Illustrative math in practice answers must say it is illustrative and use only reported inputs.
6. Dates are `YYYY-MM-DD`. If only a month is known, use the 1st and set `"approx": true`.

## Step 1: Check each tracked deal for news

For every deal in `data/deals.json`:

1. Search the web for the deal name plus keywords from the checklist below. Prioritise primary sources first:
   - Company press releases / investor relations pages and SEC EDGAR (8-K, S-4, 425, DEFM14A, 10-Q) for public companies.
   - Regulators: UK CMA case page, European Commission merger notifications, FTC/DOJ early termination notices, other relevant national regulators.
   - Rothschild & Co newsroom for adviser announcements.
   - Then Reuters, Bloomberg, WSJ, FT, Nikkei, Sky News, trade press.
2. Look specifically for anything since `last_reviewed` on: shareholder vote dates/results, regulatory milestones (filings, Phase 1/Phase 2 decisions, remedies, clearances), financing (bond deals, bridge changes, term loans, ratings actions), price or terms changes, competing or higher bids, litigation or activist opposition, delays, and closing.
3. Also re-read the current `status` and every "Not disclosed" field to see whether a source has now disclosed it.

Deal-specific checklist:

- **McCormick + Unilever Foods** (`mccormick-unilever-foods`): McCormick shareholder vote (S-4 filing, meeting date, result); UK CMA (Phase 1 decision was due 2026-11-11; Phase 2 referral or undertakings in lieu, Colman's sale); EU Commission notification; any other jurisdictions; Form S-4 / Form 10 effectiveness; bond issuance replacing the bridge; ratings agency actions; works council; closing (expected mid-2027). Sources: McCormick IR, Unilever IR, SEC EDGAR for CIK 63754, CMA case page, Rothschild & Co newsroom.
- **Bain Capital + Gong cha** (`bain-gong-cha`): closing announcement; any official price disclosure by Bain, TA Associates or Gong cha; financing (lenders, loan syndication); regulatory approvals; any competing bid; new reports on EBITDA/valuation that could narrow the price range. Sources: Bain Capital and Gong cha press pages, Reuters, Bloomberg, Nikkei Asia, KED Global, PE trade press.

## Step 2: Add dated updates

In the deal's `updates` array add one object per new event (newest order does not matter; the page sorts by date):

```json
{"date": "2026-11-11", "title": "UK CMA clears Phase 1", "detail": "One or two plain sentences with the key facts and numbers.", "source_label": "CMA", "source_url": "https://..."}
```

- Add `"approx": true` if the exact date is unknown.
- Use `"upcoming": true` for scheduled future milestones (e.g. a decision deadline). When the milestone happens, replace the upcoming entry with the real, dated one (remove `upcoming`).
- Do not delete past updates.

## Step 3: Update status and fields

- Rewrite the deal's `status` string: one or two sentences with dates (e.g. "Pending. HSR cleared 5 Oct. CMA Phase 1 decision due 11 Nov.").
- Update any fact in `facts` that changed or is now disclosed. Keep the `sources` links current. Replace "Not disclosed" only when a real source discloses it.
- Set `last_reviewed` (top of the file) to today's date, even if nothing changed.

## Step 4: Write 2 to 3 new practice questions

Append 2-3 new objects to each deal's `questions` array: `{"q": "...", "a": "..."}`.

- Interview style (investment banking): why this deal, strategic vs financial buyer, valuation vs comps, financing, accretion/dilution mechanics, synergies, risks, what could block it, how the structure works (e.g. RMT), what the latest news means for the deal.
- Tie at least one new question to something that actually happened this week (a regulatory milestone, vote, financing step) and explain what it means for deal certainty or value.
- Answers: concise (4-8 sentences), use only sourced numbers, label any arithmetic "illustrative".
- Keep each deal to a maximum of about 10 questions: if it grows past that, remove the oldest or weakest.

## Step 5: Mark a deal closed

When a source confirms closing (press release or filing):

1. Set `"status_tag": "Closed"` and `"closed_date": "YYYY-MM-DD"`.
2. Rewrite `status` to "Closed on <date>." plus final terms (final price if disclosed).
3. Add a dated update titled "Deal closes" with the source link.
4. Update `facts` with final values (final consideration, final advisers, financing actually used). Remove "Expected close" wording or change it to the actual date.
5. Add one practice question on lessons (e.g. how long it took, what the final terms imply).

The deal stays on the page marked "Closed" for **14 days**.

## Step 6: Replace closed deals (after 14 days)

When a deal's `closed_date` is 14 or more days before today, remove it and add a replacement:

1. Choose a **new consumer deal announced in the last few months** in one of: restaurants and food, retail and apparel, or consumer products.
2. Prefer deals where **Rothschild & Co is an advisor** (check Rothschild & Co's newsroom: https://www.rothschildandco.com/en/newsroom/).
3. Keep **one strategic and one private equity deal** on the page whenever possible. If the closed deal was strategic, replace it with a strategic deal (and likewise for PE). If no good match with the same type exists, say so in the commit message and pick the best consumer deal.
4. Build the new entry with the same shape as the existing deals: `id` (kebab-case), `name`, `tag` ("Strategic" or "Private equity"), `status_tag` ("Pending"), `closed_date` (null), `status`, `news_query` (words for a Google News search, e.g. `"Buyer Target"`), `facts` (buyer, target, deal value, structure, premium, implied multiple, advisors on each side, strategic rationale, financing, expected close, approvals needed), `updates` (at least the announcement), and 5-7 `questions` in the interview style above. Apply the accuracy rules: every key number linked, "Not disclosed" where not public.
5. The next Actions run fills in the "Latest news" box automatically from `news_query`. To see it sooner, trigger the "Refresh market data" workflow manually.

## Step 7: Validate and save

1. Validate the JSON: `python3 -c "import json; json.load(open('data/deals.json'))"` must print nothing.
2. Check each deal has: `id`, `name`, `tag`, `status_tag`, `status`, `news_query`, `facts`, `updates`, `questions`; every `facts[].items[]` has `text`; all URLs start with `https://`.
3. Commit only `data/deals.json` with a message like `Weekly deal update 2026-10-26: <one-line summary>` and push to the repository's default branch (`main`). If your environment requires a branch, push the branch and open a pull request, and say so.
4. Finish with a short summary: what changed per deal, any new or replaced deal, any item you could not verify.
