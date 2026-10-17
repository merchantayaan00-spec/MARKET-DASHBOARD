#!/usr/bin/env python3
"""Refresh data/market.json and data/news.json.

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
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
UA = "Mozilla/5.0 (compatible; personal-market-dashboard/1.0)"

INDICES = ["^GSPC", "^IXIC", "^DJI", "^RUT"]
FUTURES = ["ES=F", "NQ=F"]
SECTORS = ["XLC", "XLY", "XLP", "XLE", "XLF", "XLV", "XLI", "XLB", "XLRE", "XLK", "XLU"]
RISK = ["^VIX", "CL=F", "GC=F"]
CONSUMER_QUOTES = ["XRT"]

# FRED series: id -> (daily?, transform)
FRED_SERIES = {
    "DGS2": True, "DGS10": True, "T10Y2Y": True, "DFF": True,
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
def yahoo_chart(symbol, rng="6mo"):
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
    }, pts


def fetch_quotes(symbols, old_quotes, history_for=()):
    quotes, hist = {}, {}
    for s in symbols:
        holder = {}

        def go():
            rec, pts = yahoo_chart(s)
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
    }
    if sid == "RSAFS" and prior:
        rec["mom_pct"] = round((rec["value"] / rec["prior_value"] - 1) * 100, 2)
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


def get_headlines():
    try:
        items = parse_rss(http_get(WSJ_FEED))
        if len(items) >= 1:
            return {"source": "WSJ Markets (public RSS)", "feed": WSJ_FEED, "items": items}
    except Exception as e:  # noqa: BLE001
        print(f"  ! WSJ feed: {e}", file=sys.stderr)
    items = parse_rss(http_get(FALLBACK_FEED))
    if not items:
        raise RuntimeError("fallback feed empty")
    return {"source": "MarketWatch top stories (fallback - WSJ feed failed)", "feed": FALLBACK_FEED, "items": items}


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


# ---------------------------------------------------------------- main
def read_watchlist():
    out = []
    for line in (ROOT / "watchlist.txt").read_text().splitlines():
        t = line.split("#")[0].strip().upper()
        if t and t not in out:
            out.append(t)
    return out


def main():
    old = load_json(DATA / "market.json", {})
    old_q = old.get("quotes", {})
    old_f = old.get("fred", {})
    watch = read_watchlist()

    print("Quotes...")
    symbols = list(dict.fromkeys(INDICES + FUTURES + SECTORS + RISK + CONSUMER_QUOTES + watch))
    quotes, hist = fetch_quotes(symbols, old_q)

    # XLY/XLP ratio, 6 months
    def ratio():
        a, b = dict(hist["XLY"]), dict(hist["XLP"])
        pts = [[d, round(a[d] / b[d], 4)] for d in sorted(set(a) & set(b))]
        if len(pts) < 20:
            raise RuntimeError("not enough overlapping history")
        return {"points": pts, "value": pts[-1][1], "as_of": pts[-1][0],
                "change_pct": round((pts[-1][1] / pts[-2][1] - 1) * 100, 3),
                "six_month_change_pct": round((pts[-1][1] / pts[0][1] - 1) * 100, 2)}

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
        "watchlist": watch,
        "quotes": quotes,
        "ratio": ratio_rec,
        "fred": fred,
    }
    save_json(DATA / "market.json", market)

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

    stale = [k for k, v in {**quotes, **fred}.items() if v.get("stale")]
    print(f"Done. Stale items: {stale or 'none'}")


if __name__ == "__main__":
    main()
