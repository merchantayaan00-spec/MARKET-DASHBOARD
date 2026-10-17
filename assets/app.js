(function () {
  "use strict";

  // ---------- helpers ----------
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "class") el.className = attrs[k];
      else if (k === "text") el.textContent = attrs[k];
      else el.setAttribute(k, attrs[k]);
    });
    [].concat(kids || []).forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return el;
  }
  function $(id) { return document.getElementById(id); }
  function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : "#"; }
  function link(text, url) { return h("a", { href: safeUrl(url), target: "_blank", rel: "noopener noreferrer", text: text }); }
  function num(v, d) {
    if (v == null || isNaN(v)) return "n/a";
    return Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function pct(v, d) { return v == null ? "n/a" : (v > 0 ? "+" : "") + num(v, d == null ? 2 : d) + "%"; }
  function cls(v) { return v == null ? "" : v > 0 ? "up" : v < 0 ? "down" : ""; }
  function stale(rec, extra) {
    if (!rec || !rec.stale) return null;
    var s = h("span", { class: "stale", text: "stale", title: "Latest refresh failed. Showing the last good value" + (rec.fetched_at ? " from " + rec.fetched_at.slice(0, 10) : "") + "." });
    return s;
  }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtDate(iso) { // 2026-10-05 -> Oct 5, 2026
    if (!iso) return "";
    var p = iso.slice(0, 10).split("-");
    return MONTHS[+p[1] - 1] + " " + (+p[2]) + ", " + p[0];
  }
  function fmtPeriod(iso, quarterly) { // observation period
    if (!iso) return "";
    var p = iso.split("-");
    if (quarterly) return "Q" + (Math.floor((+p[1] - 1) / 3) + 1) + " " + p[0];
    return MONTHS[+p[1] - 1] + " " + p[0];
  }
  function fmtET(iso) {
    try {
      return new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
    } catch (e) { return iso; }
  }
  function getJSON(path) {
    return fetch(path + "?t=" + Date.now(), { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(path + " " + r.status);
      return r.json();
    });
  }

  var NAMES = {
    "^GSPC": "S&P 500", "^IXIC": "Nasdaq Composite", "^DJI": "Dow Jones", "^RUT": "Russell 2000",
    "ES=F": "S&P 500 futures", "NQ=F": "Nasdaq 100 futures",
    "XLC": "Communication", "XLY": "Cons. Discretionary", "XLP": "Cons. Staples", "XLE": "Energy",
    "XLF": "Financials", "XLV": "Health Care", "XLI": "Industrials", "XLB": "Materials",
    "XLRE": "Real Estate", "XLK": "Technology", "XLU": "Utilities",
    "^VIX": "VIX", "CL=F": "WTI crude oil", "GC=F": "Gold", "XRT": "XRT (Retail ETF)"
  };

  // ---------- tiles ----------
  function quoteTile(sym, opts) {
    opts = opts || {};
    var q = (window.MKT.quotes || {})[sym];
    var label = h("div", { class: "lbl" }, [h("span", { text: NAMES[sym] || sym }), h("span", { text: opts.ticker || "" })]);
    if (!q || q.price == null) {
      return h("div", { class: "card tile" }, [label, h("div", { class: "val na", text: "n/a" }), h("div", { class: "note" }, ["No data yet", stale(q)])]);
    }
    var c = q.change_pct;
    var kids = [label,
      h("div", { class: "val", text: (opts.prefix || "") + num(q.price, opts.dec == null ? 2 : opts.dec) }),
      h("div", { class: "chg " + cls(c) }, [pct(c), stale(q)])];
    if (opts.extra) kids.push(opts.extra);
    var t = h("div", { class: "card tile" + (opts.sector ? " sec " + (c > 0 ? "up-bg" : c < 0 ? "down-bg" : "") : "") }, kids);
    return t;
  }

  function fredVal(id) { return (window.MKT.fred || {})[id]; }

  function fredTile(id, label, o) {
    o = o || {};
    var r = fredVal(id);
    var head = h("div", { class: "lbl" }, [h("span", { text: label })]);
    if (!r || r.value == null) {
      return h("div", { class: "card tile" }, [head, h("div", { class: "val na", text: "n/a" }), h("div", { class: "note" }, [(r && r.error) || "No data yet", stale(r)])]);
    }
    var big = o.mom ? pct(r.mom_pct, 2) + " MoM" : (o.prefix || "") + num(r.value, o.dec == null ? 2 : o.dec) + (o.suffix || "");
    var kids = [head, h("div", { class: "val", text: big })];
    if (o.mom) kids.push(h("div", { class: "note", text: "Level: $" + num(r.value / 1000, 1) + "B" }));
    else if (r.prior_value != null && o.showPrior !== false) {
      var d = r.value - r.prior_value;
      kids.push(h("div", { class: "note", text: "Prior: " + (o.prefix || "") + num(r.prior_value, o.dec == null ? 2 : o.dec) + (o.suffix || "") + " (" + (d > 0 ? "+" : "") + num(d, o.dec == null ? 2 : o.dec) + ")" }));
    }
    var when = o.daily ? "As of " + fmtDate(r.obs_date) : o.weekly ? "Week of " + fmtDate(r.obs_date) + (r.released ? " \u00b7 released " + fmtDate(r.released) : "") : fmtPeriod(r.obs_date, o.quarterly) + (r.released ? " · released " + fmtDate(r.released) : "");
    kids.push(h("div", { class: "note" }, [when, stale(r)]));
    return h("div", { class: "card tile" }, kids);
  }

  // ---------- sections ----------
  function renderMarkets() {
    var m = $("indices"); m.textContent = "";
    ["^GSPC", "^IXIC", "^DJI", "^RUT"].forEach(function (s) { m.appendChild(quoteTile(s, { dec: 2 })); });
    var f = $("futures"); f.textContent = "";
    ["ES=F", "NQ=F"].forEach(function (s) { f.appendChild(quoteTile(s, { dec: 2 })); });
    var sec = $("sectors"); sec.textContent = "";
    ["XLC", "XLY", "XLP", "XLE", "XLF", "XLV", "XLI", "XLB", "XLRE", "XLK", "XLU"].forEach(function (s) {
      sec.appendChild(quoteTile(s, { dec: 2, sector: true, ticker: s }));
    });
  }

  function vixLabel(v) {
    if (v < 15) return ["Calm", "calm"];
    if (v <= 20) return ["Normal", "normal"];
    if (v <= 30) return ["Nervous", "nervous"];
    return ["Panic", "panic"];
  }

  function renderRisk() {
    var g = $("risk-grid"); g.textContent = "";
    var q = (window.MKT.quotes || {})["^VIX"];
    var extra = null;
    if (q && q.price != null) { var l = vixLabel(q.price); extra = h("div", { class: "note" }, [h("span", { class: "pill " + l[1], text: l[0] }), " under 15 calm · 15-20 normal · 20-30 nervous · 30+ panic"]); }
    g.appendChild(quoteTile("^VIX", { dec: 2, extra: extra }));
    g.appendChild(quoteTile("CL=F", { dec: 2, prefix: "$" }));
    g.appendChild(quoteTile("GC=F", { dec: 2, prefix: "$" }));
  }

  function renderRates() {
    var g = $("rates-grid"); g.textContent = "";
    g.appendChild(fredTile("DGS2", "2Y Treasury", { suffix: "%", daily: true }));
    g.appendChild(fredTile("DGS10", "10Y Treasury", { suffix: "%", daily: true }));
    var s = fredVal("T10Y2Y");
    if (!s || s.value == null) {
      g.appendChild(fredTile("T10Y2Y", "2s10s spread", {}));
    } else {
      var bps = Math.round(s.value * 100), inv = s.value < 0;
      var kids = [h("div", { class: "lbl" }, [h("span", { text: "2s10s spread" })]),
        h("div", { class: "val " + (inv ? "down" : ""), text: (bps > 0 ? "+" : "") + bps + " bps" }),
        h("div", { class: "note" }, [inv ? h("span", { class: "pill inv", text: "INVERTED" }) : h("span", { class: "pill normal", text: "Normal (positive)" }), stale(s)]),
        h("div", { class: "note", text: "As of " + fmtDate(s.obs_date) })];
      g.appendChild(h("div", { class: "card tile", style: inv ? "border-color:var(--down)" : "" }, kids));
    }
    g.appendChild(fredTile("DFF", "Fed funds (effective)", { suffix: "%", daily: true }));
    g.appendChild(fredTile("MORTGAGE30US", "30Y mortgage rate", { suffix: "%", weekly: true }));
  }

  function chart(points) {
    var W = 800, H = 170, pl = 8, pr = 44, pt = 10, pb = 20;
    var vals = points.map(function (p) { return p[1]; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals), pad = (max - min) * 0.08 || 0.01;
    min -= pad; max += pad;
    var x = function (i) { return pl + (W - pl - pr) * i / (points.length - 1); };
    var y = function (v) { return pt + (H - pt - pb) * (1 - (v - min) / (max - min)); };
    var d = points.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p[1]).toFixed(1); }).join(" ");
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("class", "chart"); svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "XLY divided by XLP, six months");
    function add(tag, attrs, text) { var e = document.createElementNS(ns, tag); Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (text) e.textContent = text; svg.appendChild(e); return e; }
    for (var i = 0; i < 4; i++) {
      var v = min + (max - min) * i / 3;
      add("line", { x1: pl, x2: W - pr, y1: y(v), y2: y(v) });
      add("text", { x: W - pr + 4, y: y(v) + 4 }, v.toFixed(3));
    }
    add("path", { class: "a", d: d + " L" + x(points.length - 1) + " " + (H - pb) + " L" + x(0) + " " + (H - pb) + " Z" });
    add("path", { class: "l", d: d, "vector-effect": "non-scaling-stroke" });
    add("text", { x: pl, y: H - 4 }, fmtDate(points[0][0]));
    add("text", { x: W - pr, y: H - 4, "text-anchor": "end" }, fmtDate(points[points.length - 1][0]));
    return svg;
  }

  function renderConsumer() {
    var r = window.MKT.ratio || {}, card = $("ratio-card"); card.textContent = "";
    if (!r.points || !r.points.length) {
      card.appendChild(h("div", { class: "na", text: "XLY/XLP ratio: no data yet" }));
    } else {
      card.appendChild(h("div", { class: "chart-head" }, [
        h("span", {}, [h("b", { text: "XLY / XLP ratio  " }), h("span", { text: num(r.value, 3) }), stale(r)]),
        h("span", { class: cls(r.six_month_change_pct), text: pct(r.six_month_change_pct, 1) + " over 6 months  ·  " + pct(r.change_pct) + " today" }),
        h("span", { class: "fine", text: "Rising = discretionary outperforming staples (risk-on consumer)" })]));
      card.appendChild(chart(r.points));
    }
    var g = $("consumer-grid"); g.textContent = "";
    g.appendChild(quoteTile("XRT", { dec: 2, ticker: "XRT" }));
    g.appendChild(fredTile("UMCSENT", "UMich consumer sentiment", { dec: 1 }));
    g.appendChild(fredTile("RSAFS", "Retail sales (MoM)", { mom: true }));
    g.appendChild(fredTile("UNRATE", "Unemployment rate", { suffix: "%", dec: 1 }));
    g.appendChild(fredTile("PSAVERT", "Personal savings rate", { suffix: "%", dec: 1 }));
    g.appendChild(fredTile("GASREGW", "Avg US gas price (regular)", { prefix: "$", dec: 3, weekly: true }));
    g.appendChild(fredTile("DRCCLACBS", "Credit card delinquency rate", { suffix: "%", dec: 2, quarterly: true }));
  }

  function renderWatch() {
    var t = $("watch-table"); t.textContent = "";
    t.appendChild(h("thead", {}, [h("tr", {}, [h("th", { text: "Ticker" }), h("th", { text: "Price" }), h("th", { text: "Day %" })])]));
    var tb = h("tbody");
    (window.MKT.watchlist || []).forEach(function (s) {
      var q = (window.MKT.quotes || {})[s];
      var first = h("td", {}, [h("b", { text: s }), q && q.name ? h("span", { class: "nm", text: q.name }) : null]);
      if (!q || q.price == null) {
        tb.appendChild(h("tr", {}, [first, h("td", { class: "na", text: "n/a" }), h("td", {}, [stale(q) || h("span", { class: "na", text: "no data" })])]));
      } else {
        tb.appendChild(h("tr", {}, [first, h("td", { text: "$" + num(q.price, 2) }), h("td", { class: cls(q.change_pct) }, [pct(q.change_pct), stale(q)])]));
      }
    });
    t.appendChild(tb);
  }

  function renderHeadlines() {
    var box = $("headline-list"); box.textContent = "";
    var hd = (window.NEWS || {}).headlines;
    if (!hd || !hd.items || !hd.items.length) { box.appendChild(h("div", { class: "na", text: "No headlines yet." })); return; }
    var ul = h("ul", { class: "hl" });
    hd.items.forEach(function (it) {
      ul.appendChild(h("li", {}, [link(it.title, it.link), h("div", { class: "meta", text: it.published ? fmtET(it.published) : "" })]));
    });
    box.appendChild(ul);
    box.appendChild(h("div", { class: "fine" }, [(hd.source || "") + " · headlines and links only", stale(hd)]));
  }

  // ---------- deals ----------
  function renderDeals() {
    var root = $("deal-list"); root.textContent = "";
    var deals = (window.DEALS || {}).deals || [];
    deals.forEach(function (d) {
      var closed = d.status_tag === "Closed";
      var head = h("div", { class: "deal-head" }, [
        h("h3", { text: d.name }),
        h("span", { class: "tag" + (closed ? " closed" : " pending"), text: closed ? "Closed" + (d.closed_date ? " " + fmtDate(d.closed_date) : "") : d.status_tag }),
        h("span", { class: "tag", text: d.tag })]);
      var body = h("div", { class: "deal-body" });

      body.appendChild(h("h4", { text: "Deal terms" }));
      var dl = h("dl", { class: "facts" });
      (d.facts || []).forEach(function (f) {
        dl.appendChild(h("dt", { text: f.label }));
        var ul = h("ul");
        (f.items || []).forEach(function (it) {
          ul.appendChild(h("li", {}, [it.text, it.badge ? h("span", { class: "badge" + (it.badge === "Official" ? " official" : ""), text: it.badge }) : null]));
        });
        var dd = h("dd", {}, [ul]);
        if (f.sources && f.sources.length) {
          var s = h("div", { class: "src" }, ["Source: "]);
          f.sources.forEach(function (x, i) { if (i) s.appendChild(document.createTextNode(" · ")); s.appendChild(link(x.label, x.url)); });
          dd.appendChild(s);
        }
        dl.appendChild(dd);
      });
      body.appendChild(dl);

      body.appendChild(h("h4", { text: "Updates" }));
      var tl = h("ul", { class: "tl" });
      (d.updates || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (u) {
        tl.appendChild(h("li", { class: u.upcoming ? "up" : "" }, [
          h("div", { class: "d", text: (u.approx ? "~" : "") + fmtDate(u.date) + (u.upcoming ? "  ·  UPCOMING" : "") }),
          h("div", {}, [h("b", { text: u.title })]),
          u.detail ? h("div", { text: u.detail }) : null,
          u.source_url ? h("div", { class: "src" }, ["Source: ", link(u.source_label || "link", u.source_url)]) : null]));
      });
      body.appendChild(tl);

      body.appendChild(h("h4", { text: "Latest news (auto-refreshed)" }));
      var n = ((window.NEWS || {}).deals || {})[d.id];
      var nl = h("ul", { class: "news" });
      if (n && n.items && n.items.length) {
        n.items.forEach(function (it) {
          nl.appendChild(h("li", {}, [link(it.title, it.link), h("div", { class: "meta" }, [[it.source, it.published ? fmtDate(it.published) : ""].filter(Boolean).join(" · "), stale(n)])]));
        });
      } else nl.appendChild(h("li", { class: "na", text: "No news yet." }));
      body.appendChild(nl);

      body.appendChild(h("h4", { text: "Test yourself (click to reveal)" }));
      (d.questions || []).forEach(function (q) {
        body.appendChild(h("details", { class: "q" }, [h("summary", { text: q.q }), h("div", { class: "ans", text: q.a })]));
      });

      root.appendChild(h("div", { class: "card deal" }, [head, h("div", { class: "status" }, [h("b", { text: "Current status: " }), d.status]), body]));
    });
    var lr = (window.DEALS || {}).last_reviewed;
    if (lr) root.appendChild(h("p", { class: "fine", text: "Deal analysis last reviewed " + fmtDate(lr) + " (updated weekly by hand; headlines refresh automatically)." }));
  }

  // ---------- boot ----------
  function renderStamp() {
    var m = window.MKT || {}, el = $("stamp"); el.textContent = "";
    if (!m.updated) { el.textContent = "No data yet"; return; }
    var all = [].concat(Object.keys(m.quotes || {}).map(function (k) { return m.quotes[k]; }), Object.keys(m.fred || {}).map(function (k) { return m.fred[k]; }));
    var n = all.filter(function (x) { return x && x.stale; }).length;
    el.appendChild(document.createTextNode("Last updated: "));
    el.appendChild(h("b", { text: fmtET(m.updated) }));
    if (n) el.appendChild(h("div", {}, [h("span", { class: "stale", text: n + " stale" }), " some sources failed; showing last good values"]));
  }

  function load() {
    return Promise.all([
      getJSON("data/market.json").catch(function () { return window.MKT || {}; }),
      getJSON("data/news.json").catch(function () { return window.NEWS || {}; }),
      getJSON("data/deals.json").catch(function () { return window.DEALS || {}; })
    ]).then(function (r) {
      window.MKT = r[0]; window.NEWS = r[1]; window.DEALS = r[2];
      var open = {};
      [].forEach.call(document.querySelectorAll("details.q[open] summary"), function (s) { open[s.textContent] = 1; });
      renderStamp(); renderMarkets(); renderRisk(); renderRates(); renderConsumer(); renderWatch(); renderHeadlines(); renderDeals();
      [].forEach.call(document.querySelectorAll("details.q"), function (d) { if (open[d.firstChild.textContent]) d.open = true; });
    });
  }

  load();
  setInterval(load, 15 * 60 * 1000); // pinned tab: re-read the data files every 15 min
  document.addEventListener("visibilitychange", function () { if (!document.hidden) load(); });
})();
