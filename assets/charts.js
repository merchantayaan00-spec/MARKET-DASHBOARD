(function () {
  "use strict";

  window.SECTOR_NAMES = {
    XLK: "Tech", XLF: "Financials", XLY: "Consumer Disc.", XLC: "Comm. Services", XLV: "Health Care",
    XLI: "Industrials", XLP: "Staples", XLE: "Energy", XLU: "Utilities", XLRE: "Real Estate", XLB: "Materials"
  };

  var FONT = '"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace';
  var C = { ink: "#f5f5f5", muted: "#9a9a9a", line: "#2a2a2a", bg: "#0a0a0a", up: "#00e676", dn: "#ff3b30" };
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var state = { sp: "1Y", vix: "6M", ff: "3Y", sector: "1M" };
  var charts = [];

  function md(d) { var p = d.split("-"); return MON[+p[1] - 1] + " " + (+p[2]); }
  function myy(d) { var p = d.split("-"); return MON[+p[1] - 1] + " '" + p[0].slice(2); }
  function full(d) { var p = d.split("-"); return MON[+p[1] - 1] + " " + (+p[2]) + ", " + p[0]; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fmt(v, d) { return v == null ? "n/a" : Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }

  var CARDS = [
    { id: "sp", title: "S&P 500: Trend", sub: "Above the 200 day = uptrend.", toggle: ["1M", "6M", "1Y"], key: "sp" },
    { id: "yc", title: "Yield Curve: Today vs 1 Year Ago", sub: "Downward slope = inverted, a recession warning." },
    { id: "ff", title: "Fed Funds Rate", sub: "Higher = tighter money. Lower = easier money.", toggle: ["1Y", "3Y", "5Y", "10Y"], key: "ff" },
    { id: "vix", title: "VIX: Fear Gauge", sub: "Above 20 = nervous, above 30 = panic.", toggle: ["1M", "6M", "1Y"], key: "vix" },
    { id: "sec", title: "Sector Performance", sub: "Leaders up top, laggards at the bottom.", toggle: ["1M", "YTD"], key: "sector" },
    { id: "cons", title: "Consumer Sentiment", sub: "Higher = people feel better about the economy." }
  ];
  var DAYS = { "1M": 21, "6M": 126, "1Y": 252 };          // trading-day series (S&P, VIX)
  var CAL = { "1Y": 365, "3Y": 1096, "5Y": 1826, "10Y": 3652 }; // calendar-day series (Fed funds is daily, 7 days a week)

  // Fed funds ranges the stored history can support (its span must cover the range)
  function ffRanges(H) {
    var b = H && H.fedfunds, all = ["1Y", "3Y", "5Y", "10Y"];
    if (!b || !b.dates || !b.dates.length) return all;
    var span = (Date.parse(b.dates[b.dates.length - 1]) - Date.parse(b.dates[0])) / 864e5;
    var ok = all.filter(function (r) { return span >= CAL[r] * 0.97; });
    return ok.length ? ok : ["1Y"];
  }

  function build(H) {
    var grid = document.getElementById("chart-grid");
    if (grid.firstChild) return;
    var ffr = ffRanges(H);
    if (ffr.indexOf(state.ff) < 0) state.ff = ffr[ffr.length - 1];
    CARDS.forEach(function (c) {
      var card = el("section", "cc");
      var top = el("div", "ct"), left = el("div");
      left.appendChild(el("h2", null, c.title)); left.appendChild(el("p", "sub", c.sub));
      top.appendChild(left);
      if (c.toggle) {
        var t = el("div", "tog");
        (c.id === "ff" ? ffr : c.toggle).forEach(function (name) {
          var b = el("button", state[c.key] === name ? "on" : "", name);
          b.type = "button";
          b.addEventListener("click", function () {
            state[c.key] = name;
            [].forEach.call(t.children, function (x) { x.classList.toggle("on", x === b); });
            window.renderCharts();
          });
          t.appendChild(b);
        });
        top.appendChild(t);
      }
      var wrap = el("div", "cw"); wrap.id = "cw-" + c.id;
      card.appendChild(top); card.appendChild(wrap); grid.appendChild(card);
    });
  }

  function slotCanvas(id, msg) {
    var wrap = document.getElementById("cw-" + id);
    wrap.textContent = "";
    if (msg) { wrap.appendChild(el("div", "none", msg)); return null; }
    var cv = document.createElement("canvas"); wrap.appendChild(cv); return cv;
  }

  function setDefaults() {
    var D = Chart.defaults;
    D.color = C.muted; D.borderColor = C.line; D.font.family = FONT;
    D.font.size = 10; D.font.weight = 500; D.maintainAspectRatio = false; D.animation = false;
    D.plugins.legend.labels.boxWidth = 22; D.plugins.legend.labels.boxHeight = 2; D.plugins.legend.labels.usePointStyle = false;
    D.plugins.legend.labels.color = C.ink;
    var T = D.plugins.tooltip;
    T.backgroundColor = C.bg; T.borderColor = C.ink; T.borderWidth = 2; T.cornerRadius = 0;
    T.titleColor = C.ink; T.bodyColor = C.ink; T.padding = 8; T.boxPadding = 3; T.titleFont = { family: FONT, weight: 700, size: 11 }; T.bodyFont = { family: FONT, size: 11 };
    T.displayColors = true; T.boxWidth = 10; T.boxHeight = 10;
    D.interaction = { mode: "index", intersect: false };
    D.elements.line.borderWidth = 2.5; D.elements.line.tension = 0; D.elements.bar.borderRadius = 0;
    D.elements.point.radius = 0; D.elements.point.hoverRadius = 4; D.elements.point.pointStyle = "rect";
  }

  function xScale(dates, range) {
    return {
      grid: { display: false }, border: { color: C.ink, width: 2 },
      ticks: { maxTicksLimit: 6, maxRotation: 0, autoSkipPadding: 18,
        callback: function (v) { var d = dates[v]; if (!d) return ""; return range === "1M" || range === "6M" ? md(d) : myy(d); } }
    };
  }
  function yScale(extra) {
    return Object.assign({ grid: { color: C.line }, border: { display: false }, ticks: { maxTicksLimit: 6 } }, extra || {});
  }
  function lastN(a, n) { return a.slice(-n); }
  function add(cv, cfg) { charts.push(new Chart(cv, cfg)); }
  var zonesPlugin = {
    id: "zones",
    beforeDatasetsDraw: function (chart) {
      var y = chart.scales.y, a = chart.chartArea, ctx = chart.ctx;
      function band(from, to, rgb, label) {
        var t = Math.min(y.getPixelForValue(from), a.bottom), b = Math.max(y.getPixelForValue(to), a.top);
        if (to > y.max) b = a.top; if (from > y.max) return;
        if (b >= t) return;
        ctx.save(); ctx.fillStyle = rgb; ctx.fillRect(a.left, b, a.right - a.left, t - b);
        ctx.fillStyle = "rgba(245,245,245,.7)"; ctx.font = "700 10px " + FONT; ctx.fillText(label.toUpperCase(), a.left + 6, b + 12); ctx.restore();
      }
      band(20, 30, "rgba(245,245,245,.07)", "Nervous 20+");
      band(30, 1000, "rgba(255,59,48,.16)", "Panic 30+");
    }
  };
  var barLabels = {
    id: "barLabels",
    afterDatasetsDraw: function (chart) {
      var ctx = chart.ctx, m = chart.getDatasetMeta(0), d = chart.data.datasets[0].data;
      ctx.save(); ctx.font = "700 11px " + FONT; ctx.textBaseline = "middle";
      m.data.forEach(function (bar, i) {
        var v = d[i]; if (v == null) return;
        ctx.fillStyle = C.ink; ctx.textAlign = v >= 0 ? "left" : "right";
        ctx.fillText((v > 0 ? "+" : "") + fmt(v, 2) + "%", bar.x + (v >= 0 ? 5 : -5), bar.y);
      });
      ctx.restore();
    }
  };

  function renderSP(H) {
    var b = H.sp500, cv;
    if (!b || !b.dates) return slotCanvas("sp", "No data yet");
    cv = slotCanvas("sp"); var n = DAYS[state.sp];
    var dates = lastN(b.dates, n);
    add(cv, { type: "line", data: { labels: dates, datasets: [
      { label: "S&P 500", data: lastN(b.close, n), borderColor: C.ink, borderWidth: 2.5 },
      { label: "50 day (dashed)", data: lastN(b.ma50, n), borderColor: C.muted, borderWidth: 1.5, borderDash: [7, 5] },
      { label: "200 day (dotted)", data: lastN(b.ma200, n), borderColor: C.muted, borderWidth: 1.5, borderDash: [2, 4] }] },
      options: { scales: { x: xScale(dates, state.sp), y: yScale({ ticks: { maxTicksLimit: 6, callback: function (v) { return fmt(v, 0); } } }) },
        plugins: { legend: { align: "end" }, tooltip: { callbacks: { title: function (i) { return full(dates[i[0].dataIndex]); },
          label: function (c) { return c.dataset.label + ": " + fmt(c.parsed.y, 2); } } } } } });
  }

  function renderYC(H) {
    var b = H.yield_curve;
    if (!b || !b.tenors) return slotCanvas("yc", "No data yet");
    var cv = slotCanvas("yc");
    add(cv, { type: "line", data: { labels: b.tenors, datasets: [
      { label: "Today (" + md(b.today_date) + ")", data: b.today, borderColor: C.ink, backgroundColor: C.ink, borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 5 },
      { label: "1 year ago (" + full(b.year_ago_date) + ")", data: b.year_ago, borderColor: C.muted, backgroundColor: C.muted, borderWidth: 1.5, borderDash: [6, 5], pointRadius: 3, pointHoverRadius: 5 }] },
      options: { scales: { x: { grid: { display: false }, border: { color: C.ink, width: 2 } },
        y: yScale({ ticks: { maxTicksLimit: 6, callback: function (v) { return fmt(v, 1) + "%"; } } }) },
        plugins: { legend: { align: "end" }, tooltip: { callbacks: { label: function (c) { return c.dataset.label.split(" (")[0] + ": " + fmt(c.parsed.y, 2) + "%"; } } } } } });
  }

  var lastLabel = {
    id: "lastLabel",
    afterDatasetsDraw: function (chart) {
      var m = chart.getDatasetMeta(0), pt = m.data[m.data.length - 1], d = chart.data.datasets[0].data;
      if (!pt || d[d.length - 1] == null) return;
      var ctx = chart.ctx, v = d[d.length - 1];
      ctx.save(); ctx.fillStyle = C.ink; ctx.fillRect(pt.x - 4, pt.y - 4, 8, 8);
      ctx.fillStyle = C.ink; ctx.font = "700 12px " + FONT; ctx.textBaseline = "middle"; ctx.textAlign = "left";
      ctx.fillText(fmt(v, 2) + "%", pt.x + 8, pt.y); ctx.restore();
    }
  };

  function renderFF(H) {
    var b = H.fedfunds;
    if (!b || !b.dates) return slotCanvas("ff", "No data yet");
    var cv = slotCanvas("ff"), cut = Date.parse(b.dates[b.dates.length - 1]) - CAL[state.ff] * 864e5, i0 = 0;
    while (i0 < b.dates.length - 1 && Date.parse(b.dates[i0]) < cut) i0++;
    var dates = b.dates.slice(i0), vals = b.values.slice(i0);
    add(cv, { type: "line", plugins: [lastLabel], data: { labels: dates, datasets: [{ label: "Fed funds", data: vals, borderColor: C.ink, borderWidth: 2.5, stepped: "before" }] },
      options: { layout: { padding: { right: 46 } },
        scales: { x: xScale(dates, state.ff), y: yScale({ ticks: { maxTicksLimit: 6, callback: function (v) { return fmt(v, 1) + "%"; } } }) },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: function (i) { return full(dates[i[0].dataIndex]); },
          label: function (c) { return "Fed funds: " + fmt(c.parsed.y, 2) + "%"; } } } } } });
  }

  function renderVIX(H) {
    var b = H.vix;
    if (!b || !b.dates) return slotCanvas("vix", "No data yet");
    var cv = slotCanvas("vix"), n = DAYS[state.vix], dates = lastN(b.dates, n);
    add(cv, { type: "line", plugins: [zonesPlugin], data: { labels: dates, datasets: [{ label: "VIX", data: lastN(b.close, n), borderColor: C.ink, borderWidth: 2.5 }] },
      options: { scales: { x: xScale(dates, state.vix), y: yScale({ suggestedMin: 10, suggestedMax: 35 }) },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: function (i) { return full(dates[i[0].dataIndex]); },
          label: function (c) { return "VIX: " + fmt(c.parsed.y, 2); } } } } } });
  }

  function renderSectors(H) {
    var b = H.sectors;
    if (!b || !b.XLK) return slotCanvas("sec", "No data yet");
    var k = state.sector === "YTD" ? "ytd" : "m1";
    var rows = Object.keys(window.SECTOR_NAMES).map(function (s) { return [window.SECTOR_NAMES[s], b[s] && b[s][k]]; })
      .filter(function (r) { return r[1] != null; }).sort(function (a, c) { return c[1] - a[1]; });
    var cv = slotCanvas("sec");
    add(cv, { type: "bar", plugins: [barLabels], data: { labels: rows.map(function (r) { return r[0]; }),
      datasets: [{ label: state.sector, data: rows.map(function (r) { return r[1]; }), borderRadius: 0, barPercentage: .78, categoryPercentage: .9,
        backgroundColor: rows.map(function (r) { return r[1] >= 0 ? C.up : C.dn; }), borderWidth: 0 }] },
      options: { indexAxis: "y", interaction: { mode: "nearest", axis: "y", intersect: false },
        layout: { padding: { right: 44 } },
        scales: { x: yScale({ grace: "12%", grid: { color: function (c) { return c.tick.value === 0 ? C.ink : C.line; }, lineWidth: function (c) { return c.tick.value === 0 ? 2 : 1; } },
          ticks: { maxTicksLimit: 6, callback: function (v) { return v + "%"; } } }),
          y: { grid: { display: false }, border: { color: C.ink, width: 2 }, ticks: { color: C.ink } } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return state.sector + ": " + (c.parsed.x > 0 ? "+" : "") + fmt(c.parsed.x, 2) + "%"; } } } } } });
  }

  function renderConsumer(H) {
    var b = H.consumer;
    if (!b || !b.umcsent || !b.umcsent.length) return slotCanvas("cons", "No data yet");
    var cv = slotCanvas("cons"), labels = b.umcsent.map(function (x) { return x[0]; }), vals = b.umcsent.map(function (x) { return x[1]; });
    var ds = [{ label: "UMich sentiment", data: vals, borderColor: C.ink, borderWidth: 2.5, pointRadius: 2, pointHoverRadius: 5 }];
    if (b.avg != null) ds.push({ label: "Long-run avg (dotted, since " + b.avg_since + ")", data: labels.map(function () { return b.avg; }), borderColor: C.muted,
      borderDash: [2, 4], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0 });
    add(cv, { type: "line", data: { labels: labels, datasets: ds },
      options: { scales: { x: { grid: { display: false }, border: { color: C.ink, width: 2 }, ticks: { maxTicksLimit: 7, maxRotation: 0, callback: function (v) { return myy(labels[v]); } } },
        y: yScale({ ticks: { maxTicksLimit: 6 } }) },
        plugins: { legend: { align: "end" }, tooltip: { callbacks: { title: function (i) { return myy(labels[i[0].dataIndex]); },
          label: function (c) { return c.dataset.label + ": " + fmt(c.parsed.y, 1); } } } } } });
  }

  window.renderCharts = function (H) {
    if (H) window.HIST = H;
    H = window.HIST || {};
    build(H);
    charts.forEach(function (c) { c.destroy(); }); charts = [];
    if (!window.Chart) {
      CARDS.forEach(function (c) { slotCanvas(c.id, "Chart library failed to load"); });
      return;
    }
    setDefaults();
    [renderSP, renderYC, renderFF, renderVIX, renderSectors, renderConsumer].forEach(function (fn) {
      try { fn(H); } catch (e) { if (window.console) console.error(e); }
    });
  };
})();
