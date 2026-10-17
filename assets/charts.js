(function () {
  "use strict";

  window.SECTOR_NAMES = {
    XLK: "Tech", XLF: "Financials", XLY: "Consumer Disc.", XLC: "Comm. Services", XLV: "Health Care",
    XLI: "Industrials", XLP: "Staples", XLE: "Energy", XLU: "Utilities", XLRE: "Real Estate", XLB: "Materials"
  };

  var C = { ink: "#e6edf5", muted: "#8392a5", line: "#243040", accent: "#6aa8ff", amber: "#f5b942",
    purple: "#b58cff", up: "#2ecc71", dn: "#ff5a5f", panel: "#121923" };
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var state = { sp: "1Y", vix: "6M", spread: "2Y", sector: "1M" };
  var charts = [];

  function md(d) { var p = d.split("-"); return MON[+p[1] - 1] + " " + (+p[2]); }
  function myy(d) { var p = d.split("-"); return MON[+p[1] - 1] + " '" + p[0].slice(2); }
  function full(d) { var p = d.split("-"); return MON[+p[1] - 1] + " " + (+p[2]) + ", " + p[0]; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fmt(v, d) { return v == null ? "n/a" : Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }

  var CARDS = [
    { id: "sp", title: "S&P 500: Trend", sub: "Above the 200 day = uptrend.", toggle: ["1M", "6M", "1Y"], key: "sp" },
    { id: "yc", title: "Yield Curve: Today vs 1 Year Ago", sub: "Downward slope = inverted, a recession warning." },
    { id: "spread", title: "2s10s Spread", sub: "Below zero = inverted.", toggle: ["1M", "6M", "1Y", "2Y"], key: "spread" },
    { id: "vix", title: "VIX: Fear Gauge", sub: "Above 20 = nervous, above 30 = panic.", toggle: ["1M", "6M", "1Y"], key: "vix" },
    { id: "sec", title: "Sector Performance", sub: "Leaders up top, laggards at the bottom.", toggle: ["1M", "YTD"], key: "sector" },
    { id: "cons", title: "Consumer Health", sub: "Rising together = stronger consumer." }
  ];
  var DAYS = { "1M": 21, "6M": 126, "1Y": 252, "2Y": 100000 };

  function build() {
    var grid = document.getElementById("chart-grid");
    if (grid.firstChild) return;
    CARDS.forEach(function (c) {
      var card = el("section", "cc");
      var top = el("div", "ct"), left = el("div");
      left.appendChild(el("h2", null, c.title)); left.appendChild(el("p", "sub", c.sub));
      top.appendChild(left);
      if (c.toggle) {
        var t = el("div", "tog");
        c.toggle.forEach(function (name) {
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
    D.color = C.muted; D.borderColor = C.line; D.font.family = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
    D.font.size = 11; D.maintainAspectRatio = false; D.animation = false;
    D.plugins.legend.labels.boxWidth = 10; D.plugins.legend.labels.boxHeight = 2; D.plugins.legend.labels.usePointStyle = false;
    D.plugins.tooltip.backgroundColor = "#0b0f14"; D.plugins.tooltip.borderColor = C.line; D.plugins.tooltip.borderWidth = 1;
    D.plugins.tooltip.titleColor = C.ink; D.plugins.tooltip.bodyColor = C.ink; D.plugins.tooltip.padding = 8;
    D.plugins.tooltip.boxPadding = 3;
    D.interaction = { mode: "index", intersect: false };
    D.elements.line.borderWidth = 2; D.elements.line.tension = 0;
    D.elements.point.radius = 0; D.elements.point.hoverRadius = 4;
  }

  function xScale(dates, range) {
    return {
      grid: { display: false }, border: { color: C.line },
      ticks: { maxTicksLimit: 6, maxRotation: 0, autoSkipPadding: 18,
        callback: function (v) { var d = dates[v]; if (!d) return ""; return range === "1Y" || range === "2Y" ? myy(d) : md(d); } }
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
        ctx.fillStyle = "rgba(230,237,245,.55)"; ctx.font = "10px sans-serif"; ctx.fillText(label, a.left + 6, b + 12); ctx.restore();
      }
      band(20, 30, "rgba(245,185,66,.10)", "Nervous 20+");
      band(30, 1000, "rgba(255,90,95,.13)", "Panic 30+");
    }
  };
  var barLabels = {
    id: "barLabels",
    afterDatasetsDraw: function (chart) {
      var ctx = chart.ctx, m = chart.getDatasetMeta(0), d = chart.data.datasets[0].data;
      ctx.save(); ctx.font = "11px sans-serif"; ctx.textBaseline = "middle";
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
      { label: "S&P 500", data: lastN(b.close, n), borderColor: C.accent },
      { label: "50 day", data: lastN(b.ma50, n), borderColor: C.amber, borderWidth: 1.4 },
      { label: "200 day", data: lastN(b.ma200, n), borderColor: C.purple, borderWidth: 1.4 }] },
      options: { scales: { x: xScale(dates, state.sp), y: yScale({ ticks: { maxTicksLimit: 6, callback: function (v) { return fmt(v, 0); } } }) },
        plugins: { legend: { align: "end" }, tooltip: { callbacks: { title: function (i) { return full(dates[i[0].dataIndex]); },
          label: function (c) { return c.dataset.label + ": " + fmt(c.parsed.y, 2); } } } } } });
  }

  function renderYC(H) {
    var b = H.yield_curve;
    if (!b || !b.tenors) return slotCanvas("yc", "No data yet");
    var cv = slotCanvas("yc");
    add(cv, { type: "line", data: { labels: b.tenors, datasets: [
      { label: "Today (" + md(b.today_date) + ")", data: b.today, borderColor: C.accent, backgroundColor: C.accent, pointRadius: 3, pointHoverRadius: 5 },
      { label: "1 year ago (" + full(b.year_ago_date) + ")", data: b.year_ago, borderColor: C.muted, backgroundColor: C.muted, borderDash: [5, 4], pointRadius: 3, pointHoverRadius: 5 }] },
      options: { scales: { x: { grid: { display: false }, border: { color: C.line } },
        y: yScale({ ticks: { maxTicksLimit: 6, callback: function (v) { return fmt(v, 1) + "%"; } } }) },
        plugins: { legend: { align: "end" }, tooltip: { callbacks: { label: function (c) { return c.dataset.label.split(" (")[0] + ": " + fmt(c.parsed.y, 2) + "%"; } } } } } });
  }

  function renderSpread(H) {
    var b = H.spread;
    if (!b || !b.dates) return slotCanvas("spread", "No data yet");
    var cv = slotCanvas("spread"), n = DAYS[state.spread], dates = lastN(b.dates, n);
    add(cv, { type: "line", data: { labels: dates, datasets: [{ label: "10Y minus 2Y", data: lastN(b.values, n), borderColor: C.accent, borderWidth: 1.6,
      fill: { target: "origin", above: "rgba(46,204,113,.16)", below: "rgba(255,90,95,.28)" } }] },
      options: { scales: { x: xScale(dates, state.spread),
        y: yScale({ grid: { color: function (c) { return c.tick.value === 0 ? "#e6edf5" : C.line; }, lineWidth: function (c) { return c.tick.value === 0 ? 2 : 1; } },
          ticks: { maxTicksLimit: 6, callback: function (v) { return fmt(v, 1) + "%"; } } }) },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: function (i) { return full(dates[i[0].dataIndex]); },
          label: function (c) { var v = c.parsed.y; return "10Y - 2Y: " + (v > 0 ? "+" : "") + fmt(v * 100, 0) + " bps"; } } } } } });
  }

  function renderVIX(H) {
    var b = H.vix;
    if (!b || !b.dates) return slotCanvas("vix", "No data yet");
    var cv = slotCanvas("vix"), n = DAYS[state.vix], dates = lastN(b.dates, n);
    add(cv, { type: "line", plugins: [zonesPlugin], data: { labels: dates, datasets: [{ label: "VIX", data: lastN(b.close, n), borderColor: C.ink, borderWidth: 1.6 }] },
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
      datasets: [{ label: state.sector, data: rows.map(function (r) { return r[1]; }), borderRadius: 2, barPercentage: .78, categoryPercentage: .9,
        backgroundColor: rows.map(function (r) { return r[1] >= 0 ? "rgba(46,204,113,.75)" : "rgba(255,90,95,.75)"; }) }] },
      options: { indexAxis: "y", interaction: { mode: "nearest", axis: "y", intersect: false },
        layout: { padding: { right: 44 } },
        scales: { x: yScale({ grace: "12%", grid: { color: function (c) { return c.tick.value === 0 ? "#e6edf5" : C.line; } },
          ticks: { maxTicksLimit: 6, callback: function (v) { return v + "%"; } } }),
          y: { grid: { display: false }, border: { color: C.line }, ticks: { color: C.ink } } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return state.sector + ": " + (c.parsed.x > 0 ? "+" : "") + fmt(c.parsed.x, 2) + "%"; } } } } } });
  }

  function renderConsumer(H) {
    var b = H.consumer;
    if (!b || !b.umcsent) return slotCanvas("cons", "No data yet");
    var cv = slotCanvas("cons");
    var labels = Array.from(new Set(b.umcsent.map(function (x) { return x[0]; }).concat(b.retail_mom.map(function (x) { return x[0]; })))).sort();
    var um = {}, rs = {};
    b.umcsent.forEach(function (x) { um[x[0]] = x[1]; }); b.retail_mom.forEach(function (x) { rs[x[0]] = x[1]; });
    add(cv, { data: { labels: labels, datasets: [
      { type: "bar", label: "Retail sales MoM", yAxisID: "y1", data: labels.map(function (d) { return rs[d] == null ? null : rs[d]; }),
        backgroundColor: labels.map(function (d) { return rs[d] >= 0 ? "rgba(245,185,66,.55)" : "rgba(255,90,95,.6)"; }), borderRadius: 2, order: 2 },
      { type: "line", label: "UMich sentiment", yAxisID: "y", data: labels.map(function (d) { return um[d] == null ? null : um[d]; }),
        borderColor: C.accent, pointRadius: 2, pointHoverRadius: 4, spanGaps: true, order: 1 }] },
      options: { scales: {
        x: { grid: { display: false }, border: { color: C.line }, ticks: { maxTicksLimit: 7, maxRotation: 0, callback: function (v) { return myy(labels[v]); } } },
        y: yScale({ position: "left", ticks: { maxTicksLimit: 6 }, title: { display: false } }),
        y1: yScale({ position: "right", grid: { display: false }, ticks: { maxTicksLimit: 6, callback: function (v) { return v + "%"; } } }) },
        plugins: { legend: { align: "end" }, tooltip: { callbacks: { title: function (i) { return myy(labels[i[0].dataIndex]); },
          label: function (c) { return c.dataset.label + ": " + (c.dataset.yAxisID === "y1" ? fmt(c.parsed.y, 2) + "%" : fmt(c.parsed.y, 1)); } } } } } });
  }

  window.renderCharts = function (H) {
    if (H) window.HIST = H;
    H = window.HIST || {};
    build();
    charts.forEach(function (c) { c.destroy(); }); charts = [];
    if (!window.Chart) {
      CARDS.forEach(function (c) { slotCanvas(c.id, "Chart library failed to load"); });
      return;
    }
    setDefaults();
    [renderSP, renderYC, renderSpread, renderVIX, renderSectors, renderConsumer].forEach(function (fn) {
      try { fn(H); } catch (e) { if (window.console) console.error(e); }
    });
  };
})();
