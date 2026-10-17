#!/usr/bin/env python3
"""Refresh data/market.json, data/history.json (chart data) and data/news.json.

Runs in GitHub Actions (stdlib only, no installs). Any source that fails keeps
its last good value and is flagged "stale": true so the page never breaks.

Secrets (environment variables, set as GitHub Actions secrets):
  FRED_API_KEY  - free key from https://fredaccount.stlouisfed.org/apikeys
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
UA = "Mozilla/5.0 (compatible; personal-market-dashboard/1.0)"

INDICES = ["^GSPC", "^DJI"]
SECTORS = ["XLC", "XLY", "XLP", "XLE", "XLF", "XLV", "XLI", "XLB", "XLRE", "XLK", "XLU"]
RISK = ["^VIX", "GC=F"]
CONSUMER_QUOTES = ["XRT"]

# FRED series: id -> (daily?, transform)
FRED_SERIES = {
    "DGS2": True, "DGS10": True, "DFF": True,
    "MORTGAGE30US": False, "UMCSENT": False, "RSAFS": False, "UNRATE": False,
    "PSAVERT": False, "GASREGW": False, "DRCCLACBS": False,
}

WSJ_FEED = "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain"
FALLBACK_FEED = "https://feeds.content.dowjones.io/public/rss/mw_topstories"  # MarketWatch (Dow Jones)


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def http_get(url, retries=3, timeout=25):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001 - we retry on anything
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"GET failed: {type(last).__name__}: {last}")


def load_json(path, default):
    try:
        return json.loads(Path(path).read_text())
    except Exception:  # noqa: BLE001
        return default


def save_json(path, obj):
    Path(path).write_text(json.dumps(obj, indent=1, ensure_ascii=False) + "\n")


def with_stale(old, key, fn):
    """Run fn(); on failure return the previous good record flagged stale."""
    try:
        rec = fn()
        rec["stale"] = False
        rec["fetched_at"] = now_iso()
        return rec
    except Exception as e:  # noqa: BLE001
        print(f"  ! {key}: {e}", file=sys.stderr)
        prev = dict(old.get(key) or {})
        prev["stale"] = True
        prev["error"] = str(e)[:200]
        return prev


# ---------------------------------------------------------------- quotes
def yahoo_chart(symbol, rng="1y"):
    q = urllib.parse.quote(symbol, safe="")
    last = None
    for host in ("query1", "query2"):
        try:
            raw = http_get(f"https://{host}.finance.yahoo.com/v8/finance/chart/{q}?range={rng}&interval=1d", retries=2)
            res = json.loads(raw)["chart"]["result"][0]
            break
        except Exception as e:  # noqa: BLE001
            last = e
    else:
        raise RuntimeError(f"yahoo {symbol}: {last}")
    meta = res["meta"]
    off = meta.get("gmtoffset", 0)
    pts = [
        (datetime.fromtimestamp(t + off, timezone.utc).strftime("%Y-%m-%d"), c)
        for t, c in zip(res.get("timestamp") or [], res["indicators"]["quote"][0]["close"])
        if c is not None
    ]
    if len(pts) < 2:
        raise RuntimeError(f"yahoo {symbol}: not enough data")
    (d1, price), (_, prev) = pts[-1], pts[-2]
    return {
        "symbol": symbol,
        "name": meta.get("shortName") or meta.get("longName") or symbol,
        "price": round(price, 4),
        "prev_close": round(prev, 4),
        "change_pct": round((price / prev - 1) * 100, 3),
        "as_of": d1,
        "spark": [round(c, 4) for _, c in pts[-5:]],
    }, pts


def fetch_quotes(symbols, old_quotes, ranges=None):
    quotes, hist = {}, {}
    ranges = ranges or {}
    for s in symbols:
        holder = {}

        def go():
            rec, pts = yahoo_chart(s, ranges.get(s, "1y"))
            holder["pts"] = pts
            return rec

        quotes[s] = with_stale(old_quotes, s, go)
        if "pts" in holder:
            hist[s] = holder["pts"]
        time.sleep(0.3)
    return quotes, hist


# ---------------------------------------------------------------- FRED
def fred_series(sid, key, daily):
    base = "https://api.stlouisfed.org/fred/series/observations"
    p = {"series_id": sid, "api_key": key, "file_type": "json", "sort_order": "desc", "limit": "6"}
    obs = json.loads(http_get(f"{base}?{urllib.parse.urlencode(p)}"))["observations"]
    obs = [o for o in obs if o["value"] not in (".", "")]
    if not obs:
        raise RuntimeError(f"fred {sid}: no observations")
    latest = obs[0]
    prior = obs[1] if len(obs) > 1 else None
    rec = {
        "series": sid,
        "value": float(latest["value"]),
        "obs_date": latest["date"],
        "prior_value": float(prior["value"]) if prior else None,
        "prior_date": prior["date"] if prior else None,
        "released": None,
        "spark": [float(o["value"]) for o in reversed(obs[:5])],
    }
    if sid == "RSAFS" and prior:
        rec["mom_pct"] = round((rec["value"] / rec["prior_value"] - 1) * 100, 2)
        if len(obs) > 2:
            rec["prior_mom_pct"] = round((rec["prior_value"] / float(obs[2]["value"]) - 1) * 100, 2)
    if not daily:
        # First-release date of the latest observation (ALFRED vintage data).
        try:
            p2 = {"series_id": sid, "api_key": key, "file_type": "json", "output_type": "4",
                  "realtime_start": "1776-07-04", "realtime_end": "9999-12-31",
                  "observation_start": latest["date"], "observation_end": latest["date"], "limit": "1"}
            o2 = json.loads(http_get(f"{base}?{urllib.parse.urlencode(p2)}"))["observations"]
            if o2:
                rec["released"] = o2[0]["realtime_start"]
        except Exception as e:  # noqa: BLE001
            print(f"  ! release date {sid}: {e}", file=sys.stderr)
    return rec


# ---------------------------------------------------------------- RSS
def parse_rss(raw, n=3):
    root = ET.fromstring(raw)
    items = []
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or "").strip()
        pub = it.findtext("pubDate")
        src = it.find("source")
        try:
            ts = parsedate_to_datetime(pub).astimezone(timezone.utc) if pub else None
        except Exception:  # noqa: BLE001
            ts = None
        if title and link:
            items.append({"title": title, "link": link,
                          "published": ts.strftime("%Y-%m-%dT%H:%M:%SZ") if ts else None,
                          "source": (src.text.strip() if src is not None and src.text else None)})
    items.sort(key=lambda x: x["published"] or "", reverse=True)
    seen, out = set(), []
    for x in items:
        k = re.sub(r"\W+", "", x["title"].lower())[:60]
        if k not in seen:
            seen.add(k)
            out.append(x)
    return out[:n]


# Headline filter: stock market, economy, interest rates, earnings, M&A. No roundups, columns or opinion.
BAD_PATH = ("/opinion", "/politics", "/lifestyle", "/arts-culture", "/sports", "/health", "/real-estate", "/style",
            "/personal-finance", "/world", "/us-news", "/tech/", "/science", "/travel", "/food", "/pro/",
            "/commodities-futures", "/currencies", "/podcasts", "/video")
GOOD_PATH = ("/finance", "/economy", "/business", "/markets")
BAD_TITLE = re.compile(r"roundup|market talk|^opinion|heard on the street|streetwise|overheard|what's news|"
                       r"\bhow to\b|here's how|\bwhy you\b|your money|\breview\b|\bletters?\b|podcast|"
                       r"\bobituary|\bcolumn\b|^the .* problem|dollar index|futures (rise|fall|edge|settle)", re.I)
TOPIC = re.compile(
    r"\b(stocks?|shares?|equit(?:y|ies)|s&p|nasdaq|dow|russell|wall street|rally|rout|selloff|sell-off|"
    r"stock market|bond market|markets|economy|economic|inflation|jobs|payrolls|gdp|recession|consumer|"
    r"retail sales|housing|home prices|tariffs?|unemployment|fed|federal reserve|rates?|yields?|treasur(?:y|ies)|"
    r"bonds?|mortgages?|earnings|profits?|revenue|forecast|guidance|quarterly|deals?|mergers?|acquires?|"
    r"acquired|acquisitions?|buyouts?|takeovers?|bids?|private equity|private credit|ipos?|spinoffs?|"
    r"banks?|banking|lenders?)\b", re.I)


def is_finance(item, strict_path=True):
    path = urllib.parse.urlparse(item["link"]).path.lower() + "/"
    if BAD_TITLE.search(item["title"]) or (strict_path and any(b in path for b in BAD_PATH)):
        return False
    if strict_path and not any(g in path for g in GOOD_PATH):
        return False
    return TOPIC.search(item["title"]) is not None


def get_headlines(n=5):
    found = []
    for name, feed, strict in (("WSJ", WSJ_FEED, True), ("MarketWatch", FALLBACK_FEED, False)):
        try:
            items = [x for x in parse_rss(http_get(feed), n=80) if is_finance(x, strict)]
        except Exception as e:  # noqa: BLE001
            print(f"  ! {name} feed: {e}", file=sys.stderr)
            continue
        for x in items:
            x["source"] = name
        found.append(items)
        if sum(len(f) for f in found) >= n and name == "WSJ" and len(items) >= n:
            break  # WSJ alone fills the list
    wsj = found[0] if found else []
    top = wsj[:n]
    if len(top) < n:  # top up from MarketWatch, skipping near-duplicates
        seen = {re.sub(r"\W+", "", x["title"].lower())[:50] for x in top}
        for x in (found[1] if len(found) > 1 else []):
            k = re.sub(r"\W+", "", x["title"].lower())[:50]
            if k not in seen and len(top) < n:
                top.append(x); seen.add(k)
    if not top:
        raise RuntimeError("no finance headlines from any feed")
    top.sort(key=lambda x: x["published"] or "", reverse=True)
    return {"source": "WSJ / MarketWatch RSS", "items": top}


def deal_news(query):
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode(
        {"q": query, "hl": "en-US", "gl": "US", "ceid": "US:en"})
    items = parse_rss(http_get(url), n=3)
    for x in items:  # Google appends " - Publisher" to titles
        if x.get("source") and x["title"].endswith(" - " + x["source"]):
            x["title"] = x["title"][: -len(x["source"]) - 3]
    if not items:
        raise RuntimeError("no items")
    return {"items": items}


# ---------------------------------------------------------------- chart history (data/history.json)
TENORS = [("1M", "DGS1MO"), ("3M", "DGS3MO"), ("6M", "DGS6MO"), ("1Y", "DGS1"),
          ("2Y", "DGS2"), ("5Y", "DGS5"), ("10Y", "DGS10"), ("30Y", "DGS30")]


def d2s(d):
    return d.strftime("%Y-%m-%d")


def days_ago(n):
    return d2s(datetime.now(timezone.utc) - timedelta(days=n))


def fred_obs(sid, key, start):
    p = {"series_id": sid, "api_key": key, "file_type": "json", "sort_order": "asc",
         "observation_start": start, "limit": "100000"}
    obs = json.loads(http_get("https://api.stlouisfed.org/fred/series/observations?" + urllib.parse.urlencode(p)))["observations"]
    out = [(o["date"], float(o["value"])) for o in obs if o["value"] not in (".", "")]
    if not out:
        raise RuntimeError(f"fred {sid}: no observations")
    return out


def sma(vals, n):
    out, run = [], 0.0
    for i, v in enumerate(vals):
        run += v
        if i >= n:
            run -= vals[i - n]
        out.append(round(run / n, 2) if i >= n - 1 else None)
    return out


def build_sp500(hist):
    pts = hist["^GSPC"]
    closes = [c for _, c in pts]
    m50, m200 = sma(closes, 50), sma(closes, 200)
    k = 252
    return {"dates": [d for d, _ in pts][-k:], "close": [round(c, 2) for c in closes][-k:],
            "ma50": m50[-k:], "ma200": m200[-k:]}


def build_vix(hist):
    pts = hist["^VIX"][-252:]
    return {"dates": [d for d, _ in pts], "close": [round(c, 2) for _, c in pts]}


def build_sectors(hist):
    out = {}
    for sym in SECTORS:
        pts = hist[sym]
        last_d, last = pts[-1]
        m1_cut = d2s(datetime.strptime(last_d, "%Y-%m-%d") - timedelta(days=30))
        m1 = [c for d, c in pts if d <= m1_cut]
        prev_year = [c for d, c in pts if d[:4] < last_d[:4]]
        out[sym] = {"m1": round((last / m1[-1] - 1) * 100, 2) if m1 else None,
                    "ytd": round((last / prev_year[-1] - 1) * 100, 2) if prev_year else None}
    out["as_of"] = hist["XLK"][-1][0]
    return out


def build_yield_curve(key):
    series = {sid: dict(fred_obs(sid, key, days_ago(420))) for _, sid in TENORS}
    common = sorted(set.intersection(*[set(v) for v in series.values()]))
    if not common:
        raise RuntimeError("no common yield-curve date")
    today = common[-1]
    target = d2s(datetime.strptime(today, "%Y-%m-%d") - timedelta(days=365))
    ago = [d for d in common if d <= target]
    if not ago:
        raise RuntimeError("no year-ago yield-curve date")
    ago = ago[-1]
    return {"tenors": [t for t, _ in TENORS], "today_date": today, "year_ago_date": ago,
            "today": [series[sid][today] for _, sid in TENORS],
            "year_ago": [series[sid][ago] for _, sid in TENORS]}


def build_fedfunds(key):
    """Effective federal funds rate (FRED series DFF, daily), last ~10 years."""
    obs = fred_obs("DFF", key, days_ago(3660))
    first = json.loads(http_get("https://api.stlouisfed.org/fred/series/observations?" + urllib.parse.urlencode(
        {"series_id": "DFF", "api_key": key, "file_type": "json", "sort_order": "asc", "limit": "1"})))["observations"][0]["date"]
    print(f"  DFF: earliest observation on FRED {first}; stored {len(obs)} daily points from {obs[0][0]}")
    return {"dates": [d for d, _ in obs], "values": [v for _, v in obs], "earliest_on_fred": first}


def build_consumer(key):
    """UMich consumer sentiment: last 24 months plus the long-run average (monthly data since 1978)."""
    allobs = fred_obs("UMCSENT", key, "1978-01-01")
    cut = days_ago(740)
    recent = [[d, v] for d, v in allobs if d >= cut]
    avg = round(sum(v for _, v in allobs) / len(allobs), 1)
    return {"umcsent": recent, "avg": avg, "avg_since": allobs[0][0][:4]}


def need_key(key, fn):
    def run():
        if not key:
            raise RuntimeError("FRED_API_KEY not set")
        return fn(key)
    return run


# ---------------------------------------------------------------- main
def main():
    old = load_json(DATA / "market.json", {})
    old_q = old.get("quotes", {})
    old_f = old.get("fred", {})

    print("Quotes...")
    symbols = list(dict.fromkeys(INDICES + SECTORS + RISK + CONSUMER_QUOTES))
    quotes, hist = fetch_quotes(symbols, old_q, ranges={"^GSPC": "2y"})

    # Consumer mood: XLY/XLP ratio rising over the past month = "Spending", falling = "Defensive"
    def ratio():
        a, b = dict(hist["XLY"]), dict(hist["XLP"])
        pts = [(d, a[d] / b[d]) for d in sorted(set(a) & set(b))]
        if len(pts) < 10:
            raise RuntimeError("not enough overlapping history")
        last_d, last_v = pts[-1]
        cutoff = (datetime.strptime(last_d, "%Y-%m-%d") - timedelta(days=30)).strftime("%Y-%m-%d")
        base = [p for p in pts if p[0] <= cutoff]
        base_d, base_v = base[-1] if base else pts[0]
        chg = (last_v / base_v - 1) * 100
        return {"value": round(last_v, 4), "as_of": last_d, "base_date": base_d,
                "month_change_pct": round(chg, 2), "mood": "Spending" if chg >= 0 else "Defensive"}

    try:
        ratio_rec = ratio()
        ratio_rec.update(stale=False, fetched_at=now_iso())
    except Exception as e:  # noqa: BLE001
        print(f"  ! XLY/XLP ratio: {e}", file=sys.stderr)
        ratio_rec = dict(old.get("ratio") or {})
        ratio_rec.update(stale=True, error=str(e)[:200])

    print("FRED...")
    key = os.environ.get("FRED_API_KEY", "").strip()
    fred = {}
    for sid, daily in FRED_SERIES.items():
        if not key:
            fred[sid] = dict(old_f.get(sid) or {}, stale=True, error="FRED_API_KEY not set")
            continue
        fred[sid] = with_stale(old_f, sid, lambda sid=sid, daily=daily: fred_series(sid, key, daily))

    market = {
        "updated": now_iso(),
        "quotes": quotes,
        "ratio": ratio_rec,
        "fred": fred,
    }
    save_json(DATA / "market.json", market)

    print("History (charts)...")
    old_h = load_json(DATA / "history.json", {})
    history = {"updated": now_iso()}
    builders = {
        "sp500": lambda: build_sp500(hist), "vix": lambda: build_vix(hist),
        "sectors": lambda: build_sectors(hist),
        "yield_curve": need_key(key, build_yield_curve), "fedfunds": need_key(key, build_fedfunds),
        "consumer": need_key(key, build_consumer),
    }
    for k, fn in builders.items():
        history[k] = with_stale(old_h, k, fn)
    save_json(DATA / "history.json", history)

    print("News...")
    old_n = load_json(DATA / "news.json", {})
    news = {"updated": now_iso()}
    news["headlines"] = with_stale(old_n, "headlines", get_headlines)
    deals = load_json(DATA / "deals.json", {}).get("deals", [])
    news["deals"] = {}
    for d in deals:
        if d.get("news_query"):
            news["deals"][d["id"]] = with_stale(old_n.get("deals", {}), d["id"],
                                                lambda q=d["news_query"]: deal_news(q))
    save_json(DATA / "news.json", news)

    stale = [k for k, v in {**quotes, **fred, **{"hist:" + k: history[k] for k in builders}}.items() if v.get("stale")]
    print(f"Done. Stale items: {stale or 'none'}")


if __name__ == "__main__":
    main()
