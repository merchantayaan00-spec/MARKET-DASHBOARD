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
  function clear(id) { var e = $(id); e.textContent = ""; return e; }
  function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : "#"; }
  function num(v, d) {
    if (v == null || isNaN(v)) return "n/a";
    return Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function sign(v) { return v > 0 ? "up" : v < 0 ? "dn" : ""; }
  function arrow(v) { return v > 0 ? "▲ " : v < 0 ? "▼ " : ""; }
  function pct(v, d) { return v == null ? "" : arrow(v) + num(Math.abs(v), d == null ? 2 : d) + "%"; }
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function md(iso) { if (!iso) return ""; var p = iso.slice(0, 10).split("-"); return MON[+p[1] - 1] + " " + (+p[2]); }
  function fmtET(iso) {
    try {
      return new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
    } catch (e) { return iso; }
  }
  function staleChip(rec) {
    return rec && rec.stale ? h("span", { class: "chip stale", text: "stale", title: "Last refresh failed; showing last good value" }) : null;
  }
  function getJSON(path) {
    return fetch(path + "?t=" + Date.now(), { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(path + " " + r.status);
      return r.json();
    });
  }

  // ---------- tiles ----------
  // tile(label, value, change, date, opts): all strings; change is {text, dir}
  function tile(label, value, change, date, o) {
    o = o || {};
    return h("div", { class: "t" + (o.big ? " big" : "") + (o.inv ? " inv" : "") }, [
      h("div", { class: "l" }, [label, o.chip || null, o.stale || null]),
      h("div", { class: "v " + (o.vcls || ""), text: value }),
      h("div", { class: "c " + (change ? sign(change.dir) : ""), text: change ? change.text : "" }),
      h("div", { class: "d", text: date || "" })
    ]);
  }
  function naTile(label, rec) { return tile(label, "n/a", null, rec && rec.error ? "no data" : "", { stale: staleChip(rec), vcls: "na" }); }

  function quoteTile(sym, label, o) {
    o = o || {};
    var q = (window.MKT.quotes || {})[sym];
    if (!q || q.price == null) return naTile(label, q);
    return tile(label, (o.prefix || "") + num(q.price, 2), { text: pct(q.change_pct), dir: q.change_pct }, md(q.as_of),
      { big: o.big, stale: staleChip(q), chip: o.chip && o.chip(q) });
  }

  function fred(id) { return (window.MKT.fred || {})[id]; }

  // kind: "daily" | "weekly" | "monthly" | "quarterly"
  function fredTile(id, label, o) {
    var r = fred(id);
    if (!r || r.value == null) return naTile(label, r);
    var dec = o.dec == null ? 2 : o.dec, d = r.prior_value == null ? null : r.value - r.prior_value;
    var date;
    if (o.kind === "daily") date = md(r.obs_date);
    else if (o.kind === "weekly") date = r.released ? "rel " + md(r.released) : md(r.obs_date);
    else {
      var p = r.obs_date.split("-");
      var per = o.kind === "quarterly" ? "Q" + (Math.floor((+p[1] - 1) / 3) + 1) : MON[+p[1] - 1];
      date = per + (r.released ? " · rel " + md(r.released) : "");
    }
    var val = (o.prefix || "") + num(r.value, dec) + (o.suffix || "");
    var chg = d == null ? null : Math.abs(d) < 1e-9 ? { text: "unch", dir: 0 } : { text: arrow(d) + num(Math.abs(d), dec) + (o.suffix || ""), dir: d };
    return tile(label, val, chg, date, { stale: staleChip(r) });
  }

  // ---------- sections ----------
  var SECTORS = [["XLK", "Tech"], ["XLF", "Financials"], ["XLY", "Discret."], ["XLC", "Comm."], ["XLV", "Health"], ["XLI", "Industrials"],
    ["XLP", "Staples"], ["XLE", "Energy"], ["XLU", "Utilities"], ["XLRE", "Real Est."], ["XLB", "Materials"]];

  function renderMarkets() {
    var ix = clear("indices");
    ix.appendChild(quoteTile("^GSPC", "S&P 500", { big: true }));
    ix.appendChild(quoteTile("^DJI", "Dow", { big: true }));
    var sec = clear("sectors");
    SECTORS.forEach(function (s) {
      var q = (window.MKT.quotes || {})[s[0]], c = q && q.change_pct;
      var st = "";
      if (c != null) {
        var a = Math.min(Math.abs(c) / 3, 1) * 0.55 + 0.1;
        st = "background:rgba(var(--" + (c >= 0 ? "up" : "dn") + "-rgb)," + a.toFixed(2) + ")";
      }
      sec.appendChild(h("div", { class: "h", style: st, title: s[0] + (q && q.stale ? " (stale)" : "") }, [
        h("div", { class: "n", text: s[1] }),
        h("div", { class: "p " + (c == null ? "na" : sign(c)), text: c == null ? "n/a" : (c > 0 ? "+" : "") + num(c, 2) + "%" })]));
    });
  }

  function vixChip(q) {
    var v = q.price, l = v < 15 ? ["Calm", "calm"] : v <= 20 ? ["Normal", ""] : v <= 30 ? ["Nervous", "nervous"] : ["Panic", "panic"];
    return h("span", { class: "chip " + l[1], text: l[0] });
  }

  function renderRisk() {
    var g = clear("risk-grid");
    g.appendChild(quoteTile("^VIX", "VIX", { chip: vixChip }));
    g.appendChild(quoteTile("GC=F", "Gold", { prefix: "$" }));
  }

  function renderRates() {
    var g = clear("rates-grid");
    g.appendChild(fredTile("DGS2", "2Y", { suffix: "%", kind: "daily" }));
    g.appendChild(fredTile("DGS10", "10Y", { suffix: "%", kind: "daily" }));
    var s = fred("T10Y2Y");
    if (!s || s.value == null) g.appendChild(naTile("2s10s", s));
    else {
      var bps = Math.round(s.value * 100), inv = s.value < 0;
      g.appendChild(tile("2s10s", (bps > 0 ? "+" : "") + bps + " bps", null, md(s.obs_date),
        { inv: inv, vcls: inv ? "dn" : "", stale: staleChip(s), chip: inv ? h("span", { class: "chip inv", text: "inverted" }) : null }));
    }
    g.appendChild(fredTile("DFF", "Fed funds", { suffix: "%", kind: "daily" }));
    g.appendChild(fredTile("MORTGAGE30US", "30Y mortgage", { suffix: "%", kind: "weekly" }));
  }

  function renderConsumer() {
    var g = clear("consumer-grid"), r = window.MKT.ratio || {};
    if (!r.mood) g.appendChild(naTile("Consumer mood", r));
    else g.appendChild(tile("Consumer mood", r.mood, { text: "XLY/XLP " + (r.month_change_pct > 0 ? "+" : "") + num(r.month_change_pct, 1) + "%", dir: r.month_change_pct },
      "1M \u00b7 " + md(r.as_of), { vcls: r.mood === "Spending" ? "up" : "dn", stale: staleChip(r) }));
    g.appendChild(quoteTile("XRT", "XRT"));
    g.appendChild(fredTile("UMCSENT", "UMich sentiment", { dec: 1, kind: "monthly" }));
    var rs = fred("RSAFS");
    if (!rs || rs.mom_pct == null) g.appendChild(naTile("Retail sales MoM", rs));
    else {
      var p = rs.obs_date.split("-");
      g.appendChild(tile("Retail sales MoM", (rs.mom_pct > 0 ? "+" : "") + num(rs.mom_pct, 2) + "%", null,
        MON[+p[1] - 1] + (rs.released ? " · rel " + md(rs.released) : ""), { vcls: sign(rs.mom_pct), stale: staleChip(rs) }));
    }
    g.appendChild(fredTile("UNRATE", "Unemployment", { suffix: "%", dec: 1, kind: "monthly" }));
    g.appendChild(fredTile("PSAVERT", "Savings rate", { suffix: "%", dec: 1, kind: "monthly" }));
    g.appendChild(fredTile("GASREGW", "Gas price", { prefix: "$", dec: 3, kind: "weekly" }));
    g.appendChild(fredTile("DRCCLACBS", "Card delinquency", { suffix: "%", dec: 2, kind: "quarterly" }));
  }

  function renderHeadlines() {
    var box = clear("headline-list"), hd = (window.NEWS || {}).headlines;
    if (!hd || !hd.items || !hd.items.length) { box.appendChild(h("div", { class: "na", text: "No headlines" })); return; }
    var ul = h("ul", { class: "news" });
    hd.items.forEach(function (it) {
      ul.appendChild(h("li", {}, [h("a", { href: safeUrl(it.link), target: "_blank", rel: "noopener noreferrer", text: it.title })]));
    });
    box.appendChild(ul);
    if (hd.stale) box.appendChild(h("div", { class: "d" }, [staleChip(hd)]));
  }

  // ---------- deals ----------
  function renderDeals() {
    var root = clear("deal-list"), D = window.DEALS || {};
    $("deals-meta").textContent = D.last_reviewed ? "reviewed " + md(D.last_reviewed) : "";
    (D.deals || []).forEach(function (d) {
      var closed = d.status_tag === "Closed";
      var card = h("div", { class: "deal" });
      card.appendChild(h("div", { class: "dh" }, [h("b", { text: d.name }),
        h("span", { class: "badge" + (closed ? " closed" : ""), text: closed ? "Closed" : "Pending" })]));
      card.appendChild(h("div", { class: "sum", text: d.summary || "" }));
      var tb = h("table", { class: "terms" });
      (d.terms || []).forEach(function (t) { tb.appendChild(h("tr", {}, [h("td", { text: t[0] }), h("td", { text: t[1] })])); });
      card.appendChild(tb);

      var ups = (d.updates || []).filter(function (u) { return !u.upcoming; })
        .sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 3);
      var ul = h("ul", { class: "upd" });
      ups.forEach(function (u) {
        ul.appendChild(h("li", { title: u.title }, [h("span", { class: "dt", text: u.approx ? "~" + MON[+u.date.split("-")[1] - 1] : md(u.date) }), u.title]));
      });
      card.appendChild(ul);

      var qs = h("div", { class: "qs", hidden: "" });
      (d.questions || []).forEach(function (q) {
        qs.appendChild(h("details", { class: "q" }, [h("summary", { text: q.q }), h("p", { text: q.a })]));
      });
      var btn = h("button", { class: "ty", type: "button", text: "Test yourself", "aria-expanded": "false" });
      btn.addEventListener("click", function () {
        var open = qs.hasAttribute("hidden");
        if (open) qs.removeAttribute("hidden"); else qs.setAttribute("hidden", "");
        btn.setAttribute("aria-expanded", String(open));
        btn.textContent = open ? "Hide questions" : "Test yourself";
        window.OPEN = window.OPEN || {}; window.OPEN[d.id] = open;
      });
      card.appendChild(btn);
      card.appendChild(qs);
      if (window.OPEN && window.OPEN[d.id]) btn.click();
      root.appendChild(card);
    });
  }

  function renderStamp() {
    var m = window.MKT || {}, el = clear("stamp");
    if (!m.updated) { el.textContent = "No data yet"; return; }
    var all = Object.keys(m.quotes || {}).map(function (k) { return m.quotes[k]; })
      .concat(Object.keys(m.fred || {}).map(function (k) { return m.fred[k]; }));
    var n = all.filter(function (x) { return x && x.stale; }).length;
    el.appendChild(document.createTextNode("Updated "));
    el.appendChild(h("b", { text: fmtET(m.updated) }));
    if (n) el.appendChild(h("span", { class: "chip stale", text: n + " stale" }));
  }

  function load() {
    return Promise.all([
      getJSON("data/market.json").catch(function () { return window.MKT || {}; }),
      getJSON("data/news.json").catch(function () { return window.NEWS || {}; }),
      getJSON("data/deals.json").catch(function () { return window.DEALS || {}; })
    ]).then(function (r) {
      window.MKT = r[0]; window.NEWS = r[1]; window.DEALS = r[2];
      renderStamp(); renderMarkets(); renderRisk(); renderRates(); renderConsumer(); renderHeadlines(); renderDeals();
    });
  }

  load();
  setInterval(load, 15 * 60 * 1000); // pinned tab: re-read data every 15 min
  document.addEventListener("visibilitychange", function () { if (!document.hidden) load(); });
})();
