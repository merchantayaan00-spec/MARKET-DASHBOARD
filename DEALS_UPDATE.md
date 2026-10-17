# Weekly deal update instructions

Playbook for the **weekly research update** of the M&A tracker (Mondays, 7:30 AM Eastern). GitHub Actions only refreshes market data and headlines; everything in `data/deals.json` needs a careful read of real sources. Follow these steps exactly.

Only edit `data/deals.json`. Never touch `index.html`, `assets/`, `scripts/`, `data/market.json`, `data/news.json` or `data/history.json`.

## What the page shows

**Card view (Today tab, keep as is):** each deal card shows, in this order: name + Pending/Closed badge + "Test yourself" button; a 3-step **progress tracker** (Announced, Approvals, Closing) with the announcement date, expected close and a countdown; four tiles (**Value, Structure, Expected close, Next catalyst**); one **visual**; one **Advisors** line; the **3 most recent updates**, one line each with an exact date.

**Detail panel (click a card):** header with badge and progress bar, then summary, key terms, strategic rationale, key risks, approvals status, full timeline of every update (newest first), source links, and the "Test yourself" quiz button. It is filled from the `detail` object, **all** `updates`, and the source links in `facts` / `updates`. Source links appear only at the bottom of the panel, never on the card.

`facts` (long, with `sources`) is the verified record behind the scenes. Keep it accurate and sourced; the panel's source list is built from it.

## Deal fields (what to keep current)

| Field | Meaning |
|---|---|
| `stage` | Progress tracker position: `0` Announced, `1` Approvals, `2` Closing. Moves forward when the deal advances (e.g. all approvals received and only closing remains: `2`). |
| `announced` | `YYYY-MM-DD` signing/announcement date. |
| `close_label` | Expected close as text: `"Mid-2027"`, `"Q4 2026"`, or `"not confirmed"`. |
| `close_by` | `YYYY-MM-DD` only if a real end date exists (e.g. end of the guided quarter), else `null`. If set, the page shows a countdown ("by Dec 31 \| ~75 days"). If `null` it shows "expected <close_label>". |
| `next` | `{"event": "...", "date": "..."}`: the **next catalyst** and its date. Use an ISO date when scheduled (the page adds "in Nd"), otherwise short text such as `"Q4 2026"`. Event is 1 to 4 words. |
| `tiles` | Two tiles (Value, Structure): `{"label","value","sub"}`. `value` is short (e.g. `"$44.8B EV"`); `sub` is one small line. The page adds Expected close and Next catalyst itself. |
| `advisors` | One short line. Format: `"Buyer: A, B  \|  Target: C, D"`. |
| `visual` | One visual per deal (see below). |
| `updates` | List of dated entries; the page shows the 3 newest (excluding `upcoming`). |
| `questions` | Flashcards: `{"q","a"}`. |
| `status_tag` / `closed_date` | `"Pending"` or `"Closed"` (+ date). |

Visual types: `{"type":"ownership","segments":[["Label",55.1],...],"note":"short note"}` (post-close ownership; segments should total 100) and `{"type":"range","low":635,"high":2000,"ebitda":70,"label":"Reported, unconfirmed","note":"..."}` (price range in $M; the page computes ~x EBITDA at each end from `ebitda`; omit `ebitda` if no figure is reported). Keep the existing visual unless the facts change; for a new deal choose the type that fits (ownership split for stock deals, range for unconfirmed prices).

## Detail panel fields (`detail` object, per deal)

Keep these current every week. They are plain text; the page renders them. If something is not publicly reported write **"Not disclosed"**; if you could not verify it write **"not confirmed"**. Never estimate.

| Field | Format |
|---|---|
| `detail.summary` | 2 to 3 plain sentences: what the deal is, the headline numbers, and why it matters or what comes next. |
| `detail.terms` | List of `["Label","value"]` rows in this order: Buyer, Target, Value, Structure, Premium, Implied multiple, Advisors: <buyer>, Advisors: <target>, Financing, Expected close. One line each; unconfirmed figures say "unconfirmed" or "reported". |
| `detail.rationale` | Exactly 3 short bullets (one sentence each). |
| `detail.risks` | Exactly 3 short bullets: key risks and what could block the deal. Clearly label any analyst view that is not from a source ("Analyst view, not reported for this deal: ..."). |
| `detail.approvals` | List of `{"name","status","note"}`, one per approval the deal needs: shareholder vote, US antitrust (HSR), UK CMA, EU, other antitrust / foreign investment, registration statements, works councils, etc. `status` must be one of: `Done`, `In progress`, `Pending`, `Not scheduled`, `Not disclosed`, `Not confirmed`. `note` is a short fact with the date (e.g. "Early termination, Oct 5, 2026"). |

**Full timeline:** the panel shows every entry in `updates`, newest first (upcoming ones marked "(upcoming)"). Do not delete past entries. The card still shows only the 3 newest non-upcoming entries, so keep each `title` to one line.

**Sources:** the panel lists the unique links from every `facts[].sources` entry and every `updates[].source_url`. Make sure each key fact has a primary-source link there.

## Ground rules (accuracy)

1. Only write facts found in a real source, and prefer primary sources: company press release, SEC filing (8-K, S-4, 10-Q, 425), regulator page (UK CMA case page, European Commission, FTC), then Reuters, Bloomberg, WSJ, FT, Nikkei, trade press. Record the link in `facts[].sources` / `updates[].source_url`.
2. If something is not publicly reported, write **"Not disclosed"**. If you cannot verify it, write **"not confirmed"**. Never estimate or fill gaps, and never show a number you could not source.
3. Reported-but-unconfirmed numbers carry `"badge": "Unconfirmed"` in `facts` and say "unconfirmed" or "reported" on the page.
4. If sources conflict, show both in `facts` with the outlet named; keep the page version short.
5. Practice-answer arithmetic must be labeled "illustrative" and use only sourced inputs.
6. **Every update date is an exact `YYYY-MM-DD`.** No approximate dates and no "~". If you cannot find the exact date, do not add the entry.
7. A press report is not a company confirmation: say who reported it (e.g. "Bloomberg: ... (unconfirmed)").

## Step 1: Check each deal for news

For every deal, search the web (primary sources first) for anything since `last_reviewed`: shareholder votes, regulatory milestones, financing, price or terms changes, competing bids, litigation, delays, closing. Re-check every "Not disclosed" / "not confirmed" field.

- **McCormick + Unilever Foods** (`mccormick-unilever-foods`): McCormick shareholder vote (Form S-4 filing, meeting date, result); UK CMA case page https://www.gov.uk/cma-cases/mccormick-slash-unilever-merger-inquiry (Phase 1 launched 2026-09-16, decision due 2026-11-11; Phase 2 referral or undertakings; Colman's sale); EU notification; other jurisdictions; bonds replacing the bridge; ratings; closing (expected mid-2027). Sources: McCormick IR, SEC EDGAR (CIK 63754), Unilever IR.
- **Bain Capital + Gong cha** (`bain-gong-cha`): closing announcement; any official price; financing; competing bids; new EBITDA/valuation reports. Sources: Bain Capital newsroom, Gong cha press page, Reuters, Bloomberg, Nikkei Asia.

## Step 2: Progress stage and next catalyst

- Update `stage` if the deal moved (Announced 0, Approvals 1, Closing 2).
- Update `next` to the **next dated event** and its date (e.g. the CMA decision date, the shareholder meeting date, the expected closing). When an event happens, replace `next` with the following one.
- Update `close_label` / `close_by` if the expected close changed.
- Update `detail.approvals` statuses and notes to match (e.g. HSR `Done`, CMA `In progress` then `Done`).
- Set top-level `last_reviewed` to today, even if nothing changed.

## Step 3: Latest 3 updates (one line each, exact dates)

Add one object per new event to `updates`:

```json
{"date": "2026-11-11", "title": "CMA clears Phase 1", "source_label": "CMA case page", "source_url": "https://..."}
```

- `title` is **one line, 90 characters or fewer**: plain facts, no explanation.
- Use `"upcoming": true` for scheduled future milestones; they are not shown in the 3 latest. When the event happens, replace the upcoming entry with the real dated one (remove `upcoming`).
- Never delete past updates. The page shows only the 3 newest, so make sure the newest three are the most important and exact.

## Step 4: Refresh tiles, advisors, visual, detail panel, facts

- Update `tiles`, `advisors` and `visual` (card view) whenever the underlying facts change (final price, new ownership split, new reported EBITDA, new advisors). Keep the card view short as is.
- Update the detail panel: rewrite `detail.summary`, refresh `detail.terms`, and revisit `detail.rationale` (3 bullets) and `detail.risks` (3 bullets) so they reflect this week's news.
- Keep `facts` (and their `sources`) consistent with what the page shows; update them first, then derive the short page text.

## Step 5: Add 2 to 3 new practice questions

Append to `questions`: `{"q": "...", "a": "..."}`. Investment-banking interview style (why this deal, strategic vs financial buyer, valuation vs comps, financing, accretion/dilution, synergies, risks, what could block it, structure mechanics). Tie at least one to something that happened this week. Answers: 3 to 6 sentences, sourced numbers only. Keep at most about 10 questions per deal; drop the oldest or weakest. These appear on the flashcards (question, "Show answer", "Got it" / "Missed", running score).

## Step 6: Mark a deal closed

On a source-confirmed close: set `"status_tag": "Closed"` and `"closed_date"`; set `stage` to `2`; set `next` to `{"event":"Closed","date":"<date>"}`; add a "Deal closes" update (exact date); update `tiles`/`facts` with final values (final price if disclosed); add one lessons-learned question. The deal stays on the page marked Closed for **14 days**.

## Step 7: Replace closed deals (after 14 days)

When `closed_date` is 14+ days ago, remove the deal and add a **new consumer deal announced in the last few months** (restaurants and food, retail and apparel, or consumer products). Prefer deals where **Rothschild & Co is an advisor** (https://www.rothschildandco.com/en/newsroom/). Keep **one strategic and one private equity deal** whenever possible: replace like with like; if no good same-type match exists, say so in the commit message.

New entry fields: `id` (kebab-case), `name`, `tag` ("Strategic" or "Private equity"), `status_tag` ("Pending"), `closed_date` (null), `stage`, `announced`, `close_label`, `close_by`, `next`, `tiles`, `advisors`, `visual`, `detail` (summary, terms, rationale, risks, approvals), `news_query` (Google News search words), `facts` (buyer, target, deal value, structure, premium, implied multiple, advisors on each side, strategic rationale, financing, expected close, approvals needed, each with sources), `updates` (at least the announcement, exact date), `questions` (5-7).

## Step 8: Validate and save

1. `python3 -c "import json; json.load(open('data/deals.json'))"` prints nothing.
2. Every deal has all fields listed above, including `detail` with `summary`, `terms`, `rationale` (3), `risks` (3) and `approvals` (each status from the allowed list); every update `date` matches `YYYY-MM-DD` with no `approx` key; every update `title` is one line (90 characters or fewer); `tiles` has 2 entries; all URLs start with `https://`.
3. Commit only `data/deals.json`: `Weekly deal update YYYY-MM-DD: <one-line summary>`; push to `main` (or push a branch and open a PR if main is protected).
4. Reply with a short summary: what changed per deal (stage, next catalyst, new updates), any new or replaced deal, anything you could not verify.
