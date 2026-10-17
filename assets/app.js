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
  function dir(v) { return v > 0 ? "up" : v < 0 ? "dn" : "flat"; }
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function md(iso) { if (!iso) return ""; var p = iso.slice(0, 10).split("-"); return MON[+p[1] - 1] + " " + (+p[2]); }
  function staleChip(rec) {
    return rec && rec.stale ? h("span", { class: "chip stale", text: "stale", title: "Last refresh failed; showing last good value" }) : null;
  }
  function getJSON(path) {
    return fetch(path + "?t=" + Date.now(), { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(path + " " + r.status);
      return r.json();
    });
  }
  function yahoo(sym) { return "https://finance.yahoo.com/quote/" + encodeURIComponent(sym) + "/"; }
  function fredUrl(id) { return "https://fred.stlouisfed.org/series/" + id; }

  // ---------- eastern time: market status + next update ----------
  var ETF = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" });
  function etParts(d) {
    var o = {};
    ETF.formatToParts(d).forEach(function (p) { o[p.type] = p.value; });
    return { y: +o.year, m: +o.month, d: +o.day, h: (+o.hour) % 24, mi: +o.minute, wd: o.weekday };
  }
  function etInstant(y, m, d, hh, mi) {
    var target = Date.UTC(y, m - 1, d, hh, mi), g = target;
    for (var i = 0; i < 3; i++) {
      var p = etParts(new Date(g));
      g += target - Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
    }
    return g;
  }
  function ymd(p) { return p.y + "-" + ("0" + p.m).slice(-2) + "-" + ("0" + p.d).slice(-2); }
  // NYSE full-day holidays and 1 pm early closes (update yearly)
  var HOLIDAYS = ["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
    "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24"];
  var EARLY = ["2026-11-27", "2026-12-24", "2027-11-26"];
  function marketOpen(now) {
    var p = etParts(now), key = ymd(p), mins = p.h * 60 + p.mi;
    if (p.wd === "Sat" || p.wd === "Sun" || HOLIDAYS.indexOf(key) >= 0) return false;
    return mins >= 570 && mins < (EARLY.indexOf(key) >= 0 ? 780 : 960);
  }
  function nextUpdate(now) {
    var p0 = etParts(now);
    for (var i = 0; i < 9; i++) {
      var base = etInstant(p0.y, p0.m, p0.d + i, 12, 0), p = etParts(new Date(base));
      if (p.wd === "Sat" || p.wd === "Sun") continue;
      var slots = [[8, 30], [16, 30]];
      for (var s = 0; s < 2; s++) {
        var t = etInstant(p.y, p.m, p.d, slots[s][0], slots[s][1]);
        if (t > now.getTime()) {
          var same = ymd(p) === ymd(p0);
          return (same ? "today" : p.wd) + " " + (slots[s][0] > 12 ? slots[s][0] - 12 : slots[s][0]) + ":30 " + (slots[s][0] >= 12 ? "PM" : "AM") + " ET";
        }
      }
    }
    return "n/a";
  }
  function fmtET(iso) {
    try {
      return new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
    } catch (e) { return iso; }
  }
  function ago(iso) {
    if (!iso) return "";
    var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return "now";
    if (m < 60) return m + "m ago";
    if (m < 1440) return Math.round(m / 60) + "h ago";
    return md(iso);
  }

  function renderBar() {
    var now = new Date(), open = marketOpen(now), m = $("mkt");
    m.className = "mkt" + (open ? " open" : "");
    m.querySelector("b").textContent = open ? "Open" : "Closed";
    var mk = window.MKT || {};
    var all = Object.keys(mk.quotes || {}).map(function (k) { return mk.quotes[k]; }).concat(Object.keys(mk.fred || {}).map(function (k) { return mk.fred[k]; }));
    var n = all.filter(function (x) { return x && x.stale; }).length;
    var u = $("upd"); u.textContent = "Updated " + (mk.updated ? fmtET(mk.updated) : "n/a");
    if (n) u.appendChild(h("span", { class: "chip stale", text: n + " stale" }));
    $("nxt").textContent = "Next update " + nextUpdate(now);
  }

  // ---------- sparkline ----------
  function spark(vals) {
    if (!vals || vals.length < 2) return null;
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals), rng = max - min || 1;
    var pts = vals.map(function (v, i) { return (i / (vals.length - 1) * 100).toFixed(1) + "," + (18 - (v - min) / rng * 16).toFixed(1); }).join(" ");
    var ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg"), pl = document.createElementNS(ns, "polyline");
    s.setAttribute("viewBox", "0 0 100 20"); s.setAttribute("preserveAspectRatio", "none"); s.setAttribute("class", "sp"); s.setAttribute("aria-hidden", "true");
    pl.setAttribute("points", pts); pl.setAttribute("fill", "none"); pl.setAttribute("stroke-width", "2");
    pl.setAttribute("stroke-linejoin", "round"); pl.setAttribute("vector-effect", "non-scaling-stroke");
    pl.setAttribute("stroke", vals[vals.length - 1] >= vals[0] ? "var(--up)" : "var(--dn)");
    s.appendChild(pl);
    return s;
  }

  // move steps (hard steps, no fades): m0 small < 0.5%, m1 medium < 1.5%, m2 large; up/dn = direction
  function moveCls(c) {
    if (c == null || c === 0) return c === 0 ? " m0" : "";
    var a = Math.abs(c);
    return " " + (a >= 1.5 ? "m2" : a >= 0.5 ? "m1" : "m0") + (c > 0 ? " up" : " dn");
  }

  // ---------- tiles: label, value, change (+ small "as of"), optional sparkline ----------
  // t: {label, value, vcls, change:{text,dir}, asof, url, spark, big, inv, chip, stale, title}
  function tile(t) {
    var attrs = { class: "t" + (t.big ? " big" : "") + (t.inv ? " inv" : "") + moveCls(t.move) };
    if (t.url) { attrs.href = safeUrl(t.url); attrs.target = "_blank"; attrs.rel = "noopener noreferrer"; }
    if (t.title) attrs.title = t.title;
    return h(t.url ? "a" : "div", attrs, [
      h("div", { class: "l" }, [t.label, t.chip || null, t.stale || null]),
      h("div", { class: "v " + (t.vcls || ""), text: t.value }),
      h("div", { class: "r" }, [
        h("span", { class: t.change ? t.change.dir : "", text: t.change ? t.change.text : "" }),
        h("span", { class: "d", text: t.asof ? "as of " + t.asof : "" })]),
      t.spark ? spark(t.spark) : null
    ]);
  }
  function chgPct(v) { return v == null ? null : { text: (v > 0 ? "▲ " : v < 0 ? "▼ " : "") + num(Math.abs(v), 2) + "%", dir: dir(v) }; }
  function chgNum(d, dec, suffix) {
    if (d == null) return null;
    if (Math.abs(d) < 1e-9) return { text: num(0, dec) + (suffix || ""), dir: "flat" };
    return { text: (d > 0 ? "▲ " : "▼ ") + num(Math.abs(d), dec) + (suffix || ""), dir: dir(d) };
  }
  function naTile(label, rec, url) { return tile({ label: label, value: "n/a", vcls: "na", stale: staleChip(rec), url: url }); }

  function quoteTile(sym, label, o) {
    o = o || {};
    var q = (window.MKT.quotes || {})[sym];
    if (!q || q.price == null) return naTile(label, q, yahoo(sym));
    return tile({ label: label, value: (o.prefix || "") + num(q.price, 2), change: chgPct(q.change_pct), asof: md(q.as_of), url: yahoo(sym),
      spark: o.spark ? q.spark : null, big: o.big, stale: staleChip(q), chip: o.chip && o.chip(q), move: q.change_pct });
  }

  function fred(id) { return (window.MKT.fred || {})[id]; }
  function fredTile(id, label, o) {
    var r = fred(id);
    if (!r || r.value == null) return naTile(label, r, fredUrl(id));
    var dec = o.dec == null ? 2 : o.dec, d = r.prior_value == null ? null : r.value - r.prior_value;
    var tip = o.kind === "daily" ? "" : (o.kind === "weekly" ? "Week of " + md(r.obs_date) : r.obs_date.slice(0, 7)) + " data" + (r.released ? ", released " + md(r.released) : "");
    return tile({ label: label, value: (o.prefix || "") + num(r.value, dec) + (o.suffix || ""), change: chgNum(d, dec, o.suffix),
      asof: md(o.kind === "daily" ? r.obs_date : (r.released || r.obs_date)), url: fredUrl(id), spark: o.spark ? r.spark : null,
      stale: staleChip(r), title: tip });
  }

  // ---------- sections ----------
  function renderMarkets() {
    var ix = clear("indices");
    ix.appendChild(quoteTile("^GSPC", "S&P 500", { big: true, spark: true }));
    ix.appendChild(quoteTile("^DJI", "Dow", { big: true, spark: true }));
    var sec = clear("sectors"), names = window.SECTOR_NAMES || {};
    var rows = Object.keys(names).map(function (s) { var q = (window.MKT.quotes || {})[s]; return { s: s, c: q ? q.change_pct : null, q: q }; })
      .sort(function (a, b) { return (b.c == null ? -99 : b.c) - (a.c == null ? -99 : a.c); });
    rows.forEach(function (r, i) {
      var c = r.c;
      sec.appendChild(h("a", { class: "h" + (i >= 6 ? " w" : "") + (c == null ? "" : moveCls(c)), href: yahoo(r.s), target: "_blank", rel: "noopener noreferrer",
        title: r.s + (r.q && r.q.stale ? " (stale)" : "") }, [
        h("div", { class: "n", text: names[r.s] }),
        h("div", { class: "p " + (c == null ? "na" : dir(c)), text: c == null ? "n/a" : (c > 0 ? "+" : "") + num(c, 2) + "%" })]));
    });
  }

  function vixChip(q) {
    var v = q.price, l = v < 15 ? ["Calm", "calm"] : v <= 20 ? ["Normal", ""] : v <= 30 ? ["Nervous", "nervous"] : ["Panic", "panic"];
    return h("span", { class: "chip " + l[1], text: l[0] });
  }

  function renderRisk() {
    var g = clear("risk-grid");
    g.appendChild(quoteTile("^VIX", "VIX", { chip: vixChip, spark: true }));
    g.appendChild(quoteTile("GC=F", "Gold", { prefix: "$", spark: true }));
  }

  function renderRates() {
    var g = clear("rates-grid");
    g.appendChild(fredTile("DGS2", "2Y", { suffix: "%", kind: "daily", spark: true }));
    g.appendChild(fredTile("DGS10", "10Y", { suffix: "%", kind: "daily", spark: true }));
    g.appendChild(fredTile("DFF", "Fed funds", { suffix: "%", kind: "daily" }));
    g.appendChild(fredTile("MORTGAGE30US", "30Y mortgage", { suffix: "%", kind: "weekly" }));
  }

  function renderConsumer() {
    var g = clear("consumer-grid"), r = window.MKT.ratio || {};
    if (!r.mood) g.appendChild(naTile("Consumer mood", r, yahoo("XLY")));
    else g.appendChild(tile({ label: "Consumer mood", value: r.mood, vcls: r.mood === "Spending" ? "up" : "dn",
      change: { text: (r.month_change_pct > 0 ? "▲ " : r.month_change_pct < 0 ? "▼ " : "") + num(Math.abs(r.month_change_pct), 2) + "% 1M", dir: dir(r.month_change_pct) },
      asof: md(r.as_of), url: yahoo("XLY"), stale: staleChip(r), title: "XLY / XLP ratio, 1 month" }));
    g.appendChild(quoteTile("XRT", "XRT"));
    g.appendChild(fredTile("UMCSENT", "UMich sentiment", { dec: 1, kind: "monthly" }));
    var ra = fred("RSAFS");
    if (!ra || ra.mom_pct == null) g.appendChild(naTile("Retail sales MoM", ra, fredUrl("RSAFS")));
    else {
      var prevMom = ra.prior_mom_pct;
      g.appendChild(tile({ label: "Retail sales MoM", value: (ra.mom_pct > 0 ? "+" : "") + num(ra.mom_pct, 2) + "%", vcls: dir(ra.mom_pct),
        change: chgNum(prevMom == null ? null : ra.mom_pct - prevMom, 2, " pts"), asof: md(ra.released || ra.obs_date), url: fredUrl("RSAFS"),
        stale: staleChip(ra), title: ra.obs_date.slice(0, 7) + " data" + (ra.released ? ", released " + md(ra.released) : "") }));
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
    hd.items.slice(0, 5).forEach(function (it) {
      ul.appendChild(h("li", {}, [
        h("a", { href: safeUrl(it.link), target: "_blank", rel: "noopener noreferrer", text: it.title }),
        h("div", { class: "m", title: it.published || "" }, [(it.source || "") + (it.published ? " · " + ago(it.published) : ""), staleChip(hd)])]));
    });
    box.appendChild(ul);
  }

  // ---------- deals ----------
  function mdy(iso) { var p = iso.split("-"); return MON[+p[1] - 1] + " " + (+p[2]) + ", " + p[0]; }
  function isoDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || ""); }
  function daysUntil(iso) { var p = iso.split("-"); return Math.ceil((Date.UTC(+p[0], +p[1] - 1, +p[2]) - Date.now()) / 864e5); }

  function tracker(d, closed) {
    var cur = closed ? 2 : (d.stage == null ? 1 : d.stage), names = ["Announced", "Approvals", "Closing"], steps = h("div", { class: "steps" }), lb = h("div", { class: "lb" });
    var extra = [d.announced ? mdy(d.announced) : "n/a", "", ""];
    if (closed) extra[2] = d.closed_date ? mdy(d.closed_date) : "done";
    else if (isoDate(d.close_by)) extra[2] = "by " + md(d.close_by) + " \u00b7 ~" + Math.max(daysUntil(d.close_by), 0) + " days";
    else extra[2] = "expected " + (d.close_label || "n/a").toLowerCase();
    names.forEach(function (n, i) {
      steps.appendChild(h("div", { class: "st" + (i < cur || (closed && i === 2) ? " done" : i === cur ? " cur" : "") }));
      lb.appendChild(h("span", { class: i === cur ? "on" : "" }, [n, extra[i] ? h("em", { text: " " + extra[i] }) : null]));
    });
    return h("div", { class: "trk" }, [steps, lb]);
  }

  function tiles4(d) {
    var nx = d.next || {}, nd = isoDate(nx.date) ? md(nx.date) + (daysUntil(nx.date) >= 0 ? " · in " + daysUntil(nx.date) + "d" : "") : (nx.date || "");
    var list = (d.tiles || []).concat([{ label: "Expected close", value: d.close_label || "not confirmed", sub: isoDate(d.close_by) ? "by " + md(d.close_by) : "" },
      { label: "Next catalyst", value: nx.event || "not confirmed", sub: nd }]);
    var box = h("div", { class: "dt4" });
    list.forEach(function (t) { box.appendChild(h("div", { class: "k" }, [h("div", { class: "l", text: t.label }), h("div", { class: "v", text: t.value }), h("div", { class: "s", text: t.sub || "", title: t.sub || "" })])); });
    return box;
  }

  function visual(v) {
    var box = h("div", { class: "viz" });
    if (!v) return box;
    if (v.type === "ownership") {
      var bar = h("div", { class: "own" }), leg = h("div", { class: "leg" });
      v.segments.forEach(function (sg, i) {
        bar.appendChild(h("i", { class: "f" + (i % 3), style: "flex:" + sg[1], text: num(sg[1], 1) + "%" }));
        leg.appendChild(h("span", {}, [h("em", { class: "f" + (i % 3) }), sg[0]]));
      });
      if (v.note) leg.appendChild(h("span", { class: "nt", text: v.note }));
      box.appendChild(bar); box.appendChild(leg);
    } else if (v.type === "range") {
      var max = Math.ceil(v.high * 1.1 / 100) * 100, pl = v.low / max * 100, ph = v.high / max * 100;
      function lbl(x) { return x >= 1000 ? "$" + num(x / 1000, x % 1000 ? 1 : 0).replace(/\.0$/, "") + "B" : "$" + x + "M"; }
      function mult(x) { return v.ebitda ? "~" + Math.round(x / v.ebitda) + "x EBITDA" : ""; }
      var r = h("div", { class: "rng" }, [h("div", { class: "tr" }),
        h("div", { class: "fl", style: "left:" + pl + "%;width:" + (ph - pl) + "%" }),
        h("div", { class: "mk", style: "left:calc(" + pl + "% - 1px)" }), h("div", { class: "mk", style: "left:calc(" + ph + "% - 2px)" }),
        h("div", { class: "a", style: "left:" + pl + "%", text: lbl(v.low) }), h("div", { class: "b", style: "left:" + pl + "%", text: mult(v.low) }),
        h("div", { class: "a", style: "left:" + ph + "%", text: "~" + lbl(v.high) }), h("div", { class: "b", style: "left:" + ph + "%", text: mult(v.high) })]);
      box.appendChild(r);
      box.appendChild(h("div", { class: "vnote" }, [h("b", { text: v.label || "" }), v.note ? " · " + v.note : ""]));
    }
    return box;
  }

  function renderDeals() {
    var root = clear("deal-list"), D = window.DEALS || {};
    $("deals-meta").textContent = D.last_reviewed ? "reviewed " + md(D.last_reviewed) : "";
    (D.deals || []).forEach(function (d) {
      var closed = d.status_tag === "Closed", card = h("div", { class: "deal", role: "button", tabindex: "0", "aria-label": d.name + ": open details" });
      var btn = h("button", { class: "ty", type: "button", text: "Test yourself" });
      btn.addEventListener("click", function (e) { e.stopPropagation(); openCards(d); });
      btn.addEventListener("keydown", function (e) { e.stopPropagation(); });
      card.appendChild(h("div", { class: "dh" }, [h("b", { text: d.name }), h("span", { class: "badge" + (closed ? " closed" : ""), text: closed ? "Closed" : "Pending" }),
        h("div", { class: "ctl" }, [btn, h("span", { class: "go", text: "Details →" })])]));
      card.appendChild(tracker(d, closed));
      card.appendChild(tiles4(d));
      card.appendChild(visual(d.visual));
      card.appendChild(h("div", { class: "adv", title: d.advisors || "" }, [h("b", { text: "Advisors " }), d.advisors || "not disclosed"]));
      var ul = h("ul", { class: "upd" });
      (d.updates || []).filter(function (u) { return !u.upcoming && isoDate(u.date); }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 3)
        .forEach(function (u) { ul.appendChild(h("li", { title: u.title }, [h("span", { class: "dt", text: mdy(u.date) }), u.title])); });
      card.appendChild(ul);
      card.addEventListener("click", function () { openDetail(d, card); });
      card.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(d, card); } });
      root.appendChild(card);
    });
  }

  // ---------- deal detail panel (slides in from the right) ----------
  var dp = null;
  function ensurePanel() {
    if (dp) return dp;
    var back = h("div", { class: "dpb" }), aside = h("aside", { class: "dp", role: "dialog", "aria-modal": "true", "aria-label": "Deal details" });
    document.body.appendChild(back); document.body.appendChild(aside);
    back.addEventListener("mousedown", closeDetail);
    document.addEventListener("keydown", function (e) {
      if (!dp || !dp.open || fc) return;
      if (e.key === "Escape") { e.preventDefault(); closeDetail(); return; }
      if (e.key === "Tab") { // keep focus inside the panel
        var f = [].filter.call(aside.querySelectorAll("button,a[href]"), function (x) { return !x.disabled; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    dp = { back: back, aside: aside, open: false, prev: null };
    return dp;
  }
  function closeDetail() {
    if (!dp || !dp.open) return;
    dp.open = false; dp.back.classList.remove("on"); dp.aside.classList.remove("on");
    document.body.style.overflow = "";
    if (dp.prev && document.body.contains(dp.prev)) dp.prev.focus();
  }
  function pillCls(st) {
    var k = (st || "").toLowerCase();
    return k === "done" ? "s-done" : k === "in progress" ? "s-prog" : (k === "pending" || k === "not scheduled") ? "s-pend" : "";
  }
  function section(title, node) { return [h("h3", { text: title }), node]; }
  function bullets(list) {
    var ul = h("ul", { class: "bl" });
    (list && list.length ? list : ["not confirmed"]).forEach(function (t) { ul.appendChild(h("li", { text: t })); });
    return ul;
  }
  function openDetail(d, trigger) {
    var P = ensurePanel(), det = d.detail || {}, closed = d.status_tag === "Closed";
    var aside = P.aside; aside.textContent = ""; aside.scrollTop = 0;
    var x = h("button", { class: "close", type: "button", "aria-label": "Close details", text: "×" });
    x.addEventListener("click", closeDetail);
    aside.appendChild(h("div", { class: "hd" }, [
      h("div", { class: "row1" }, [h("h2", { text: d.name }), h("span", { class: "badge" + (closed ? " closed" : ""), text: closed ? "Closed" : "Pending" }), x]),
      tracker(d, closed)]));
    var bd = h("div", { class: "bd" });
    var add = function (arr) { arr.forEach(function (n) { bd.appendChild(n); }); };

    add(section("Summary", h("p", { class: "sm", text: det.summary || "not confirmed" })));

    var kt = h("table", { class: "kt" });
    (det.terms && det.terms.length ? det.terms : [["Terms", "not confirmed"]]).forEach(function (r) { kt.appendChild(h("tr", {}, [h("td", { text: r[0] }), h("td", { text: r[1] })])); });
    add(section("Key terms", kt));

    add(section("Strategic rationale", bullets(det.rationale)));
    add(section("Key risks and what could block it", bullets(det.risks)));

    var ap = h("table", { class: "ap" });
    (det.approvals && det.approvals.length ? det.approvals : [{ name: "Approvals", status: "Not confirmed", note: "" }]).forEach(function (a) {
      ap.appendChild(h("tr", {}, [h("td", { text: a.name }), h("td", {}, [h("span", { class: "pill " + pillCls(a.status), text: a.status })]), h("td", { text: a.note || "" })]));
    });
    add(section("Approvals needed", ap));

    var tl = h("ul", { class: "tlx" });
    (d.updates || []).filter(function (u) { return isoDate(u.date); }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (u) {
      tl.appendChild(h("li", { class: u.upcoming ? "up" : "" }, [h("span", { class: "d", text: mdy(u.date) + (u.upcoming ? " (upcoming)" : "") }), h("span", { text: u.title })]));
    });
    add(section("Timeline", tl));

    var seen = {}, src = h("div", { class: "src" });
    (d.facts || []).forEach(function (f) { (f.sources || []).forEach(function (s0) { push(s0.label, s0.url); }); });
    (d.updates || []).forEach(function (u) { if (u.source_url) push(u.source_label, u.source_url); });
    function push(label, url) { if (!url || seen[url]) return; seen[url] = 1; src.appendChild(h("a", { href: safeUrl(url), target: "_blank", rel: "noopener noreferrer", text: label || url })); }
    add(section("Sources", src));

    var qz = h("button", { class: "ty qz", type: "button", text: "Test yourself" });
    qz.addEventListener("click", function () { openCards(d); });
    bd.appendChild(h("div", { class: "act" }, [qz]));
    aside.appendChild(bd);

    P.prev = trigger || document.activeElement; P.open = true;
    document.body.style.overflow = "hidden";
    P.back.classList.add("on"); aside.classList.add("on");
    x.focus();
  }

  // ---------- flashcards ----------
  var fc = null;
  function closeCards() {
    if (!fc) return;
    document.removeEventListener("keydown", fc.key, true);
    fc.el.remove(); if (fc.prev && fc.prev.focus) fc.prev.focus(); fc = null;
  }
  function openCards(d) {
    var qs = (d.questions || []).slice();
    if (!qs.length) return;
    var st = { i: 0, shown: false, got: 0, miss: 0 };
    var back = h("div", { class: "fcb", role: "presentation" }), box = h("div", { class: "fc", role: "dialog", "aria-modal": "true", "aria-label": d.name + " practice questions" });
    back.appendChild(box);
    function draw() {
      box.textContent = "";
      var done = st.i >= qs.length;
      box.appendChild(h("div", { class: "top" }, [h("span", {}, [h("b", { text: d.name }), done ? " · Done" : " · Question " + (st.i + 1) + " of " + qs.length]),
        h("span", { class: "sc" }, [h("span", { class: "up", text: "✓ " + st.got }), h("span", { class: "dn", text: "✗ " + st.miss })]),
        h("button", { class: "x", type: "button", "aria-label": "Close", text: "×" })]));
      box.querySelector(".x").addEventListener("click", closeCards);
      if (done) {
        box.appendChild(h("div", { class: "big", text: st.got + " / " + qs.length }));
        box.appendChild(h("div", { class: "bar2" }, [h("i", { style: "width:" + Math.round(st.got / qs.length * 100) + "%" })]));
        var again = h("button", { class: "b pri", type: "button", text: "Restart" }), cl = h("button", { class: "b", type: "button", text: "Close" });
        again.addEventListener("click", function () { st = { i: 0, shown: false, got: 0, miss: 0 }; draw(); }); cl.addEventListener("click", closeCards);
        box.appendChild(h("div", { class: "row" }, [cl, again])); again.focus(); return;
      }
      box.appendChild(h("div", { class: "q", text: qs[st.i].q }));
      var row = h("div", { class: "row" });
      if (!st.shown) {
        var show = h("button", { class: "b pri", type: "button", text: "Show answer" });
        show.addEventListener("click", function () { st.shown = true; draw(); }); row.appendChild(show);
        box.appendChild(row); show.focus();
      } else {
        box.appendChild(h("div", { class: "an", text: qs[st.i].a }));
        var mis = h("button", { class: "b mis", type: "button", text: "Missed" }), got = h("button", { class: "b got", type: "button", text: "Got it" });
        mis.addEventListener("click", function () { st.miss++; st.i++; st.shown = false; draw(); });
        got.addEventListener("click", function () { st.got++; st.i++; st.shown = false; draw(); });
        row.appendChild(mis); row.appendChild(got); box.appendChild(row); got.focus();
      }
    }
    back.addEventListener("mousedown", function (e) { if (e.target === back) closeCards(); });
    fc = { el: back, prev: document.activeElement, key: function (e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeCards(); } } };
    document.addEventListener("keydown", fc.key, true);
    document.body.appendChild(back); draw();
  }

  // ---------- tabs ----------
  var tab = "today", TABS = ["today", "charts"];
  function store(v) { try { if (v) localStorage.setItem("md.tab", v); else return localStorage.getItem("md.tab"); } catch (e) { /* storage unavailable */ } return null; }
  function showTab(name, opts) {
    opts = opts || {};
    if (TABS.indexOf(name) < 0) name = "today";
    var changed = name !== tab; tab = name;
    $("seg").setAttribute("data-active", name);
    var tv = $("view-today"), cv = $("view-charts"), target = name === "charts" ? cv : tv, other = name === "charts" ? tv : cv;
    TABS.forEach(function (t) { var b = $("tab-" + t); b.setAttribute("aria-selected", String(t === name)); b.tabIndex = t === name ? 0 : -1; });
    other.hidden = true; target.hidden = false;
    if (name === "charts" && window.renderCharts) window.renderCharts();
    if (changed && !opts.initial) { target.classList.remove("fade"); void target.offsetWidth; target.classList.add("fade"); }
    if (opts.persist !== false) {
      store(name);
      try { history.replaceState(null, "", "#" + name); } catch (e) { /* ignore */ }
    }
    if (opts.focus) $("tab-" + name).focus();
  }
  [].forEach.call(document.querySelectorAll(".seg button"), function (b) {
    b.addEventListener("click", function () { showTab(b.getAttribute("data-tab")); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || fc || (dp && dp.open)) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
    if (e.key === "1") showTab("today"); else if (e.key === "2") showTab("charts");
  });
  window.addEventListener("hashchange", function () { var n = location.hash.replace("#", ""); if (TABS.indexOf(n) >= 0) showTab(n); });

  // ---------- boot ----------
  function load() {
    return Promise.all([
      getJSON("data/market.json").catch(function () { return window.MKT || {}; }),
      getJSON("data/news.json").catch(function () { return window.NEWS || {}; }),
      getJSON("data/deals.json").catch(function () { return window.DEALS || {}; }),
      getJSON("data/history.json").catch(function () { return window.HIST || {}; })
    ]).then(function (r) {
      window.MKT = r[0]; window.NEWS = r[1]; window.DEALS = r[2]; window.HIST = r[3];
      renderBar(); renderMarkets(); renderRisk(); renderRates(); renderConsumer(); renderHeadlines(); renderDeals();
      if (tab === "charts" && window.renderCharts) window.renderCharts();
    });
  }

  var hashTab = location.hash.replace("#", ""), saved = store();
  showTab(TABS.indexOf(hashTab) >= 0 ? hashTab : (TABS.indexOf(saved) >= 0 ? saved : "today"), { initial: true });
  load();
  setInterval(renderBar, 60 * 1000);
  setInterval(load, 15 * 60 * 1000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) load(); });
})();
