(function () {
  const DESK = window.DESK;
  const FLOOR = 60300;
  const CEILING = 60400;
  const EXAMPLE = { no: 3, yes: 3, noPrice: 0.3, yesPrice: 0.3 };

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function cents(n) {
    return Math.round(n * 100);
  }
  function fromCents(c) {
    return c / 100;
  }
  function money(n, signed) {
    const c = cents(n);
    const body = "$" + Math.abs(fromCents(c)).toFixed(2);
    if (!signed) return (c < 0 ? "−" : "") + body;
    if (c > 0) return "+" + body;
    if (c < 0) return "−" + body;
    return body;
  }
  function centsLabel(price) {
    return Math.round(price * 100) + "¢";
  }
  function hourClock(h) {
    const suffix = h < 12 ? "a.m." : "p.m.";
    const hr = h % 12 === 0 ? 12 : h % 12;
    return hr + ":00 " + suffix;
  }
  function hourTick(h) {
    const suffix = h < 12 ? "a" : "p";
    const hr = h % 12 === 0 ? 12 : h % 12;
    return hr + suffix;
  }
  function whenLabel(t) {
    const [y, m, d] = t.date.split("-").map(Number);
    return MONTHS[m - 1] + " " + d + " · " + hourClock(t.hour);
  }
  function outcomeLabel(outcome) {
    if (outcome === "up") return "Broke up";
    if (outcome === "down") return "Broke down";
    return "Stayed inside";
  }
  function phaseOf(minute) {
    if (minute < 6) return "observe";
    if (minute < 30) return "enter";
    if (minute < 54) return "hold";
    return "settle";
  }
  function phaseCopy(minute) {
    const phase = phaseOf(minute);
    if (phase === "observe") {
      return "Observe. The bracket can lock. No order yet. At minute 4 the bot reads cash, after the previous hour has had time to settle.";
    }
    if (phase === "enter") {
      return "Enter. If the hour is allowed, the pair is 65¢ or less, and each leg clears a 5¢ edge, the bot sends the straddle once.";
    }
    if (phase === "hold") {
      return "Hold. It keeps watching the hour and does not add. The add window in the file is commented out.";
    }
    return "Settle. The hour is running out. The bot waits for the next one.";
  }
  function verdict(t) {
    const hist = DESK.hourlyEdge[t.hour];
    const reasons = [];
    if (t.noContracts === 0 || t.yesContracts === 0) reasons.push("one leg only");
    if (hist < DESK.minHourlyEdge) reasons.push("hour switched off");
    const combined = t.noPrice + t.yesPrice;
    if (t.noContracts > 0 && t.yesContracts > 0 && combined > DESK.ceiling + 1e-9) {
      reasons.push("pair over 65¢");
    }
    if (t.noContracts > 0 && hist - t.noPrice < DESK.minEdge - 1e-9) reasons.push("NO edge under 5¢");
    if (t.yesContracts > 0 && hist - t.yesPrice < DESK.minEdge - 1e-9) reasons.push("YES edge under 5¢");
    return { take: reasons.length === 0, reasons, hist, combined };
  }
  function summarize(trades) {
    let cost = 0;
    let pnl = 0;
    let up = 0;
    let down = 0;
    let inside = 0;
    trades.forEach(function (t) {
      cost += cents(t.totalCost);
      pnl += cents(t.pnl);
      if (t.outcome === "up") up += 1;
      else if (t.outcome === "down") down += 1;
      else inside += 1;
    });
    return {
      n: trades.length,
      cost: fromCents(cost),
      pnl: fromCents(pnl),
      up: up,
      down: down,
      inside: inside,
      exits: up + down,
    };
  }

  const judged = DESK.trades.map(function (t) {
    return Object.assign({ rule: verdict(t) }, t);
  });

  function edtParts(date) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const get = function (type) {
      return Number(parts.find(function (p) { return p.type === type; }).value);
    };
    return { hour: get("hour") % 24, minute: get("minute") };
  }

  function renderClockPill() {
    const now = edtParts(new Date());
    const phase = phaseOf(now.minute);
    const allowed = DESK.hourlyEdge[now.hour] >= DESK.minHourlyEdge;
    const time = document.getElementById("phase-time");
    const name = document.getElementById("phase-name");
    const pill = document.getElementById("phase-pill");
    time.textContent = hourClock(now.hour).replace(":00", ":" + String(now.minute).padStart(2, "0"));
    name.textContent = allowed ? phase : "standing down";
    pill.classList.toggle("is-off", !allowed);
  }

  document.getElementById("phase-pill").addEventListener("click", function () {
    document.getElementById("machine").scrollIntoView({ behavior: "smooth" });
  });
  renderClockPill();
  setInterval(renderClockPill, 15000);

  function settlement(price) {
    const cost = EXAMPLE.no * EXAMPLE.noPrice + EXAMPLE.yes * EXAMPLE.yesPrice;
    if (price <= FLOOR) {
      return { zone: "down", pnl: EXAMPLE.no - cost, line: EXAMPLE.no + " <span class=\"no\">NO</span> contracts − " + money(cost) + " cost" };
    }
    if (price > CEILING) {
      return { zone: "up", pnl: EXAMPLE.yes - cost, line: EXAMPLE.yes + " <span class=\"yes\">YES</span> contracts − " + money(cost) + " cost" };
    }
    return { zone: "inside", pnl: -cost, line: "Neither leg pays. Cost " + money(cost) + " is the loss." };
  }

  const slider = document.getElementById("settle");
  function renderSettlement() {
    const price = Number(slider.value);
    const result = settlement(price);
    document.querySelectorAll(".zone").forEach(function (zone) {
      zone.classList.toggle("is-on", zone.dataset.zone === result.zone);
    });
    document.querySelectorAll("[data-settle]").forEach(function (button) {
      button.setAttribute("aria-pressed", String(Number(button.dataset.settle) === price));
    });
    const where = price <= FLOOR ? "at or below the floor" : price > CEILING ? "above the ceiling" : "inside the band";
    document.getElementById("settle-readout").innerHTML = "Finishes at <b>$" + price.toLocaleString("en-US") + "</b>, " + where + ". Result <b>" + money(result.pnl, true) + "</b>.";
    document.getElementById("settle-formula").innerHTML = result.line;
  }
  slider.addEventListener("input", renderSettlement);
  document.querySelectorAll("[data-settle]").forEach(function (button) {
    button.addEventListener("click", function () {
      slider.value = button.dataset.settle;
      renderSettlement();
    });
  });
  renderSettlement();

  const allSummary = summarize(judged);
  const rulesSummary = summarize(judged.filter(function (t) { return t.rule.take; }));
  const BT = DESK.backtest;
  document.querySelector("[data-fill=hours]").textContent = BT.hours.toLocaleString("en-US");
  document.querySelector("[data-fill=exit-rate]").textContent = (BT.probExit * 100).toFixed(2) + "%";
  document.querySelector("[data-fill=split]").textContent =
    (100 * BT.movedUp / BT.exits).toFixed(1) + " / " + (100 * BT.movedDown / BT.exits).toFixed(1);
  document.querySelector("[data-fill=net]").textContent = money(allSummary.pnl, true);

  document.getElementById("years").innerHTML = BT.years.map(function (y) {
    const width = ((y.prob - 0.78) / 0.12) * 100;
    return "<div class='year'><span>" + y.year + "</span><span class='year-bar'><i style='width:" +
      Math.max(8, width).toFixed(1) + "%'></i></span><span>" + y.hours.toLocaleString("en-US") +
      " · " + (y.prob * 100).toFixed(2) + "%</span></div>";
  }).join("");

  document.getElementById("windows").innerHTML = BT.windows.map(function (w) {
    return "<button type='button' class='window' data-window='" + w.id + "'>" +
      "<strong>" + w.label + "</strong>" +
      "<em>" + w.hours.map(hourClock).join(" · ") + "</em>" +
      "<span>" + w.note + "</span></button>";
  }).join("");

  const worstInside = judged
    .filter(function (t) { return t.outcome === "inside"; })
    .slice()
    .sort(function (a, b) { return a.pnl - b.pnl; })
    .slice(0, 3);
  const worstAllRefused = worstInside.every(function (t) {
    return !t.rule.take && t.rule.reasons.indexOf("pair over 65¢") !== -1;
  });
  document.getElementById("finding-copy").textContent =
    "The three largest losses were " +
    worstInside.map(function (t) { return money(t.pnl); }).join(", ") +
    (worstAllRefused ? ", each a pair priced above 65¢. " : ". ") +
    "The rule in the bot refuses a pair above that. It also refuses winners. " +
    "Passed through the rules in strategy.py, this book keeps " +
    rulesSummary.n + " of " + allSummary.n + " hours and the result moves from " +
    money(allSummary.pnl, true) + " to " + money(rulesSummary.pnl, true) +
    " on " + money(rulesSummary.cost) + " deployed.";
  document.getElementById("legend-book").textContent = money(allSummary.pnl, true);
  document.getElementById("legend-rules").textContent = money(rulesSummary.pnl, true);

  let selectedHour = 10;
  function windowOf(h) {
    return BT.windows.find(function (w) { return w.hours.indexOf(h) !== -1; }) || null;
  }
  function renderHourCard(h) {
    const row = BT.byHour[h];
    const stored = DESK.hourlyEdge[h];
    const rows = judged.filter(function (t) { return t.hour === h; });
    const stats = summarize(rows);
    const allowed = stored >= DESK.minHourlyEdge;
    const taken = rows.filter(function (t) { return t.rule.take; }).length;
    const card = document.getElementById("hour-card");
    const band = windowOf(h);
    let book = "Nothing in the June book falls in this hour.";
    if (rows.length) {
      book = "June book: " + rows.length + " hour" + (rows.length === 1 ? "" : "s") + ", " +
        stats.exits + " exit" + (stats.exits === 1 ? "" : "s") + ", " + money(stats.pnl, true) +
        ". The bot would take " + taken + " of them.";
    }
    let extra = " Backtest key " + h + " is " + hourClock(h) + " Eastern.";
    if (h === 16) {
      extra = " The backtest is 84.12%. The bot stores 50% and stands down because Kalshi’s 4 p.m. strikes are not $100.";
    } else if (Math.abs(stored - row.prob) > 0.002) {
      extra = " The bot stores " + (stored * 100).toFixed(2) + "%, a few tenths off this print.";
    }
    card.innerHTML =
      "<span class='pill " + (allowed ? "on" : "off") + "'>" + (allowed ? "Bot may trade" : "Bot stands down") + "</span>" +
      (band ? "<span class='pill on' style='margin-left:6px'>" + band.label + "</span>" : "") +
      "<h3>" + hourClock(h) + "</h3>" +
      "<p class='big'>" + (row.prob * 100).toFixed(2) + "%</p>" +
      "<p>" + row.exits.toLocaleString("en-US") + " exits in " + row.n.toLocaleString("en-US") + " hours." + extra + "</p>" +
      "<p>" + book + "</p>";
  }
  function renderHourChart() {
    const plot = document.getElementById("hour-plot");
    const labels = document.getElementById("hour-labels");
    const min = 0.75;
    const max = 0.93;
    const norm = function (p) { return (p - min) / (max - min); };
    plot.innerHTML = "";
    labels.innerHTML = "";
    const line = document.createElement("div");
    line.className = "threshold";
    line.style.bottom = (norm(DESK.minHourlyEdge) * 100) + "%";
    line.innerHTML = "<span>79% cutoff</span>";
    plot.appendChild(line);
    BT.byHour.forEach(function (row) {
      const h = row.hour;
      const stored = DESK.hourlyEdge[h];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "hour-col" + (h === selectedHour ? " is-selected" : "") + (stored < DESK.minHourlyEdge ? " is-off" : "");
      button.setAttribute("aria-pressed", String(h === selectedHour));
      button.setAttribute("aria-label", hourClock(h) + ", exit rate " + (row.prob * 100).toFixed(2) + " percent");
      const space = document.createElement("span");
      space.className = "bar-space";
      const bar = document.createElement("span");
      bar.className = "bar";
      bar.style.height = Math.max(6, norm(row.prob) * 100) + "%";
      space.appendChild(bar);
      button.appendChild(space);
      button.addEventListener("click", function () {
        selectedHour = h;
        renderHourChart();
      });
      plot.appendChild(button);
      const label = document.createElement("span");
      label.textContent = h % 3 === 0 ? hourTick(h) : "";
      labels.appendChild(label);
    });
    renderHourCard(selectedHour);
  }
  document.getElementById("windows").addEventListener("click", function (event) {
    const button = event.target.closest("[data-window]");
    if (!button) return;
    const win = BT.windows.find(function (w) { return w.id === button.dataset.window; });
    if (win) {
      selectedHour = win.hours[0];
      renderHourChart();
    }
  });
  renderHourChart();

  const svg = document.getElementById("equity");
  const tip = document.getElementById("tip");
  const VB_W = 760;
  const VB_H = 300;
  let equity = [];
  let hoverIndex = judged.length - 1;

  function buildEquity() {
    let book = 0;
    let rules = 0;
    const points = [{ i: -1, book: 0, rules: 0, trade: null }];
    judged.forEach(function (t, i) {
      book = fromCents(cents(book) + cents(t.pnl));
      if (t.rule.take) rules = fromCents(cents(rules) + cents(t.pnl));
      points.push({ i: i, book: book, rules: rules, trade: t });
    });
    return points;
  }

  function renderEquity() {
    equity = buildEquity();
    const values = equity.flatMap(function (p) { return [p.book, p.rules]; });
    const minV = Math.min(0, ...values);
    const maxV = Math.max(0, ...values);
    const pad = (maxV - minV) * 0.12 || 1;
    const y0 = minV - pad;
    const y1 = maxV + pad;
    const left = 70;
    const right = 16;
    const top = 16;
    const bottom = 28;
    const xOf = function (i) {
      return left + ((i + 1) / judged.length) * (VB_W - left - right);
    };
    const yOf = function (v) {
      return top + (1 - (v - y0) / (y1 - y0)) * (VB_H - top - bottom);
    };
    const pathOf = function (key) {
      return equity.map(function (p, idx) {
        return (idx ? "L" : "M") + xOf(p.i).toFixed(1) + " " + yOf(p[key]).toFixed(1);
      }).join(" ");
    };
    const ticks = [];
    const span = y1 - y0;
    const step = span > 40 ? 10 : 5;
    for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) ticks.push(v);

    const zero = yOf(0);
    let marks = "";
    ticks.forEach(function (v) {
      const y = yOf(v);
      marks += "<line x1='" + left + "' x2='" + (VB_W - right) + "' y1='" + y.toFixed(1) + "' y2='" + y.toFixed(1) + "' stroke='#343b44' stroke-width='1'/>";
      marks += "<text x='" + (left - 8) + "' y='" + (y + 4).toFixed(1) + "' text-anchor='end' font-family='IBM Plex Mono, monospace' font-size='11' fill='#9a948a'>" + money(v, true) + "</text>";
    });
    const rug = equity.slice(1).map(function (p) {
      const color = p.trade.outcome === "inside" ? "#e35d5c" : p.trade.outcome === "up" ? "#3db87a" : "#6a9bb8";
      const opacity = p.trade.rule.take ? 1 : 0.35;
      return "<rect x='" + (xOf(p.i) - 3).toFixed(1) + "' y='" + (VB_H - 10) + "' width='6' height='6' rx='1' fill='" + color + "' opacity='" + opacity + "'></rect>";
    }).join("");

    svg.innerHTML =
      marks +
      "<line x1='" + left + "' x2='" + (VB_W - right) + "' y1='" + zero.toFixed(1) + "' y2='" + zero.toFixed(1) + "' stroke='#5a616a' stroke-width='1'/>" +
      "<path d='" + pathOf("book") + "' fill='none' stroke='#e6e2da' stroke-width='2' stroke-linejoin='round'/>" +
      "<path d='" + pathOf("rules") + "' fill='none' stroke='#d4784a' stroke-width='2' stroke-linejoin='round'/>" +
      rug +
      "<line id='hover-line' x1='0' x2='0' y1='" + top + "' y2='" + (VB_H - bottom) + "' stroke='#e6e2da' stroke-width='1' opacity='0.35'/>";

    svg._xOf = xOf;
    svg._map = equity;
    positionHover(hoverIndex, false);
  }

  function positionHover(index, reveal) {
    hoverIndex = Math.max(0, Math.min(judged.length - 1, index));
    const point = equity[hoverIndex + 1];
    if (!point || !svg._xOf) return;
    const line = svg.querySelector("#hover-line");
    const x = svg._xOf(point.i);
    if (line) {
      line.setAttribute("x1", x);
      line.setAttribute("x2", x);
      line.setAttribute("opacity", reveal ? "0.35" : "0");
    }
    if (!reveal) {
      tip.hidden = true;
      return;
    }
    const trade = point.trade;
    tip.hidden = false;
    tip.innerHTML =
      whenLabel(trade) + "<br>" +
      outcomeLabel(trade.outcome) + " · " + money(trade.pnl, true) + "<br>" +
      "Book " + money(point.book, true) + " · rules " + money(point.rules, true) + "<br>" +
      (trade.rule.take ? "Bot would take" : "Skip · " + trade.rule.reasons[0]);
    const rect = svg.getBoundingClientRect();
    const host = svg.parentElement.getBoundingClientRect();
    const px = rect.left - host.left + (x / VB_W) * rect.width;
    tip.style.left = Math.min(Math.max(8, px + 12), host.width - 210) + "px";
    tip.style.top = "52px";
  }

  function indexFromEvent(event) {
    const rect = svg.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const x = ratio * VB_W;
    let best = 0;
    let bestDist = Infinity;
    equity.slice(1).forEach(function (p, i) {
      const dist = Math.abs(svg._xOf(p.i) - x);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    return best;
  }
  svg.addEventListener("pointermove", function (event) { positionHover(indexFromEvent(event), true); });
  svg.addEventListener("pointerleave", function () { tip.hidden = true; });
  svg.addEventListener("keydown", function (event) {
    if (event.key === "ArrowRight") { positionHover(hoverIndex + 1, true); event.preventDefault(); }
    if (event.key === "ArrowLeft") { positionHover(hoverIndex - 1, true); event.preventDefault(); }
  });
  renderEquity();

  const state = { filter: "all", sort: "when", dir: 1 };

  function visibleTrades() {
    let rows = judged.slice();
    if (state.filter === "rules") rows = rows.filter(function (t) { return t.rule.take; });
    else if (state.filter !== "all") rows = rows.filter(function (t) { return t.outcome === state.filter; });
    const dir = state.dir;
    rows.sort(function (a, b) {
      if (state.sort === "cost") return (a.totalCost - b.totalCost) * dir;
      if (state.sort === "pnl") return (a.pnl - b.pnl) * dir;
      if (state.sort === "combined") return ((a.noPrice + a.yesPrice) - (b.noPrice + b.yesPrice)) * dir;
      const aw = a.date + String(a.hour).padStart(2, "0");
      const bw = b.date + String(b.hour).padStart(2, "0");
      return aw < bw ? -dir : aw > bw ? dir : 0;
    });
    return rows;
  }

  function renderTable() {
    const rows = visibleTrades();
    const stats = summarize(rows);
    document.getElementById("book-summary").textContent =
      "Showing " + stats.n + " · deployed " + money(stats.cost) +
      " · net " + money(stats.pnl, true) +
      " · " + stats.up + " up, " + stats.down + " down, " + stats.inside + " stayed";
    const body = document.getElementById("book-body");
    body.innerHTML = rows.map(function (t) {
      const pair = t.noContracts && t.yesContracts ? t.noPrice + t.yesPrice : null;
      const legs = "<span class=\"no\">NO</span> " + t.noContracts + " @ " + centsLabel(t.noPrice) +
        " · <span class=\"yes\">YES</span> " + t.yesContracts + " @ " + centsLabel(t.yesPrice);
      const rule = t.rule.take
        ? "<span class='tag take'>Take</span>"
        : "<span class='tag skip'>Skip · " + t.rule.reasons.join(", ") + "</span>";
      return "<tr class='" + t.outcome + "'>" +
        "<td>" + whenLabel(t) + "</td>" +
        "<td>" + legs + "</td>" +
        "<td class='num'>" + money(t.totalCost) + "</td>" +
        "<td class='num" + (pair !== null && pair > DESK.ceiling ? " over" : "") + "'>" + (pair === null ? "—" : centsLabel(pair)) + "</td>" +
        "<td>" + outcomeLabel(t.outcome) + "</td>" +
        "<td class='num " + (t.pnl >= 0 ? "pnl-pos" : "pnl-neg") + "'>" + money(t.pnl, true) + "</td>" +
        "<td>" + rule + "</td>" +
        "</tr>";
    }).join("");
  }
  document.querySelectorAll("[data-filter]").forEach(function (button) {
    button.addEventListener("click", function () {
      state.filter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach(function (other) {
        other.setAttribute("aria-pressed", String(other === button));
      });
      renderTable();
    });
  });
  document.querySelectorAll("[data-sort]").forEach(function (button) {
    button.addEventListener("click", function () {
      const key = button.dataset.sort;
      state.dir = state.sort === key ? -state.dir : 1;
      state.sort = key;
      renderTable();
    });
  });
  renderTable();

  let demoMinute = 14;
  let timer = null;
  const needle = document.getElementById("needle");
  const readout = document.getElementById("clock-readout");
  const play = document.getElementById("clock-play");
  function renderDemo() {
    needle.style.setProperty("--deg", (demoMinute * 6) + "deg");
    const phase = phaseOf(demoMinute);
    readout.innerHTML = "<b>Minute " + demoMinute + " · " + phase + ".</b> " + phaseCopy(demoMinute);
  }
  play.addEventListener("click", function () {
    if (timer) {
      clearInterval(timer);
      timer = null;
      play.textContent = "Run the hour";
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      demoMinute = (demoMinute + 6) % 60;
      renderDemo();
      return;
    }
    demoMinute = 0;
    renderDemo();
    play.textContent = "Stop";
    timer = setInterval(function () {
      demoMinute += 1;
      if (demoMinute > 59) {
        clearInterval(timer);
        timer = null;
        demoMinute = 59;
        play.textContent = "Run the hour";
      }
      renderDemo();
    }, 180);
  });
  renderDemo();

  const signals = DESK.signals;
  let placedLegs = 0;
  let filled = 0;
  let tpPlaced = 0;
  let placedDollars = 0;
  signals.forEach(function (signal) {
    signal.legs.forEach(function (leg) {
      if (leg.status === "placed") {
        placedLegs += 1;
        placedDollars += cents(leg.dollars);
        if (leg.fill) filled += 1;
        if (leg.tp === "placed") tpPlaced += 1;
      }
    });
  });
  document.getElementById("tape-stats").innerHTML =
    "<div><b>" + signals.length + "</b><span>signals</span></div>" +
    "<div><b>" + placedLegs + "</b><span>legs placed</span></div>" +
    "<div><b>" + filled + "</b><span>of those filled</span></div>" +
    "<div><b>" + money(fromCents(placedDollars)) + "</b><span>on placed legs</span></div>";
  document.getElementById("tape-list").innerHTML = signals.map(function (signal) {
    const legs = signal.legs.map(function (leg) {
      let status = "Rejected";
      let cls = "bad";
      if (leg.status === "placed" && leg.tp === "placed") {
        status = "Filled " + leg.fill + " · 92¢ sell accepted";
        cls = "good";
      } else if (leg.status === "placed") {
        status = "Filled " + leg.fill + " · 92¢ sell rejected";
        cls = "bad";
      }
      const sideCls = leg.side === "YES" ? "side yes" : "side no";
      return "<li><span class='" + sideCls + "'>" + leg.side + "</span><span>" +
        leg.contracts + " @ " + centsLabel(leg.price) + " · above " + leg.strike +
        "</span><span class='status " + cls + "'>" + status + "</span></li>";
    }).join("");
    return "<article class='signal'><div><h3>" + signal.when + "</h3><p class='meta'>Hour " + signal.hour +
      " · pair " + centsLabel(signal.combined) + " · best leg edge +" + signal.edge.toFixed(2) +
      " · stored exit " + (signal.hist * 100).toFixed(1) + "%</p></div><ul class='legs'>" + legs + "</ul></article>";
  }).join("");

  const audit = document.getElementById("audit");
  const same = function (n, expected) { return cents(n) === cents(expected); };
  const ok = allSummary.n === 37 &&
    same(allSummary.pnl, 13.32) &&
    same(allSummary.cost, 132.68) &&
    allSummary.exits === 28 &&
    allSummary.up === 15 &&
    allSummary.down === 13 &&
    rulesSummary.n === 16 &&
    same(rulesSummary.pnl, 24.27) &&
    same(rulesSummary.cost, 53.73) &&
    placedLegs === 10 &&
    same(fromCents(placedDollars), 5.02) &&
    tpPlaced === 4 &&
    BT.hours === 19199 &&
    BT.exits === 16122 &&
    BT.stays === 3077 &&
    BT.movedUp === 8160 &&
    BT.movedDown === 7962 &&
    BT.byHour.reduce(function (s, r) { return s + r.n; }, 0) === 19199 &&
    BT.byHour.reduce(function (s, r) { return s + r.exits; }, 0) === 16122;
  audit.textContent = ok ? "audit ok" : [
    "audit fail",
    allSummary.n, allSummary.pnl, allSummary.cost, allSummary.exits, allSummary.up, allSummary.down,
    rulesSummary.n, rulesSummary.pnl, rulesSummary.cost,
    placedLegs, fromCents(placedDollars), tpPlaced
  ].join(" ");
})();
