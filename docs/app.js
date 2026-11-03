// REDEFINE Income Planner page code. The maths lives in calc.js.
(function () {
  const $ = id => document.getElementById(id);
  const rm = n => 'RM' + Math.round(n).toLocaleString('en-MY');
  const pct = n => +(n * 100).toFixed(3) + '%';

  const DEFAULTS = {cases: 6, size: 3000, renewalPct: 100, umDU: 600000, umBlock: 0, gmDU: 1000000, gmUM: 600000, gmBlock: 0, gmWG: 2000000, defNB: 1000000, defYears: 30};
  const ONE_VALUE = ['renewalPct', 'defNB', 'defYears'];   // never set year by year
  const PER_YEAR = Object.keys(DEFAULTS).filter(k => !ONE_VALUE.includes(k));
  let state = Object.assign({}, DEFAULTS);
  let plan = null, mode = 'same';   // plan holds one value per year for each PER_YEAR key
  let view = 'agent', year = 1, shown = 0, tween = null, settle = null;

  const money = v => v >= 1e6 ? 'RM' + +(v / 1e6).toFixed(2) + 'm' : rm(v);
  const shortMoney = v => !v ? '0' : v >= 1e6 ? +(v / 1e6).toFixed(2) + 'm' : Math.round(v / 1000) + 'k';
  const CONTROLS = {
    cases: {label: 'Cases a month', min: 0, max: 20, step: 1, fmt: v => v + (v === 1 ? ' case' : ' cases')},
    size: {label: 'Case size (annual premium)', min: 500, max: 15000, step: 100, fmt: rm},
    renewalPct: {label: 'Policies renewing each year', min: 50, max: 100, step: 1, fmt: v => v + '%', hint: 'The commission tables assume 100%. Lower it to test a more cautious case.'},
    umDU: {label: 'Your direct unit sales a year including your PS', min: 0, max: 3000000, step: 10000, fmt: money},
    umBlock: {label: 'Group sales of a UM you developed', min: 0, max: 2000000, step: 10000, fmt: money},
    gmDU: {label: 'Your direct unit sales a year including your PS', min: 0, max: 5000000, step: 50000, fmt: money},
    gmUM: {label: 'Your UM group sales a year', min: 0, max: 5000000, step: 50000, fmt: money},
    gmBlock: {label: 'Group sales of a UM developed by your UM', min: 0, max: 3000000, step: 10000, fmt: money},
    gmWG: {label: 'Daughter GM whole group sales a year', min: 0, max: 10000000, step: 100000, fmt: money},
    defNB: {label: 'New business a year', min: 0, max: 5000000, step: 50000, fmt: money},
    defYears: {label: 'After how many years', min: 1, max: 30, step: 1, fmt: v => v + (v === 1 ? ' year' : ' years')}
  };
  const LAYOUT = {
    agent: {main: ['cases', 'size', 'renewalPct']},
    um: {main: ['umDU', 'renewalPct'], more: ['umBlock'], moreLabel: 'Developed another UM?'},
    gm: {main: ['gmDU', 'gmUM', 'gmWG', 'renewalPct'], more: ['gmBlock'], moreLabel: 'UM block under your UM?'}
  };
  const COHORT = ['#BE8A2A', '#5B7FE6', '#7E9A2E', '#B867C4', '#22A08F', '#D0655A'];   // one colour per sales year
  const inputs = () => Object.assign({}, state, mode === 'yearly' ? plan : {}, {renewal: state.renewalPct / 100});
  const val = k => mode === 'yearly' && !ONE_VALUE.includes(k) ? plan[k][year - 1] : state[k];

  const heroLabel = n => ({agent: `Agent, Year ${n} income`, um: `Unit Manager, Year ${n} overriding`, gm: `Group Manager, Year ${n} overriding + benefits`})[view];

  function controlHtml(key) {
    const c = CONTROLS[key];
    return `<div class="ctl">
      <div class="ctl-top"><label for="r-${key}">${c.label}</label><output id="o-${key}"></output></div>
      ${c.hint ? `<div class="ctl-hint">${c.hint}</div>` : ''}
      <div class="ctl-row">
        <button class="step" data-key="${key}" data-dir="-1" aria-label="Less: ${c.label}">&minus;</button>
        <input type="range" id="r-${key}" data-key="${key}" min="${c.min}" max="${c.max}" step="${c.step}" value="${val(key)}">
        <button class="step" data-key="${key}" data-dir="1" aria-label="More: ${c.label}">+</button>
      </div></div>`;
  }

  function buildSliders() {
    const l = LAYOUT[view];
    if (!l) return;
    let html = '';
    l.main.forEach(k => {
      html += controlHtml(k);
      if (k === 'size') html += '<p class="summary-line" id="yearly"></p>';
      if (k === 'gmUM') html += '<p class="summary-line" id="wgLine"></p>';
    });
    if (l.more) html += `<details><summary>${l.moreLabel}</summary>${l.more.map(controlHtml).join('')}</details>`;
    $('sliders').innerHTML = html;
    syncSliders();
  }

  function syncSliders() {
    document.querySelectorAll('#sliders input[type=range], #defSliders input[type=range]').forEach(el => {
      const k = el.dataset.key, c = CONTROLS[k];
      el.value = val(k);
      el.style.setProperty('--p', ((val(k) - c.min) / (c.max - c.min) * 100) + '%');
      $('o-' + k).textContent = c.fmt(val(k));
      el.setAttribute('aria-valuetext', c.fmt(val(k)));
    });
    const yearly = $('yearly');
    if (yearly) yearly.innerHTML = `${val('cases')} &times; ${rm(val('size'))} &times; 12 = <b>${rm(val('cases') * val('size') * 12)}</b> personal sales ${mode === 'yearly' ? 'in Year ' + year : 'a year'}`;
    const wgLine = $('wgLine');
    if (wgLine) {
      const wg = val('gmDU') + val('gmUM') + val('gmBlock'), bonus = Calc.wgSteps(wg) * Calc.GM_BENEFITS.wgBonus;
      wgLine.innerHTML = `Whole group <b>${money(wg)}</b> earns <b>${rm(bonus)}</b> bonus ${mode === 'yearly' ? 'in Year ' + year : 'a year'}`;
    }
    document.querySelectorAll('.mode button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === mode));
    $('planBox').hidden = mode !== 'yearly';
    $('editNote').innerHTML = `Now editing <b>Year ${year}</b>. Pick a year, then drag.`;
    $('copy').textContent = `Copy Year ${year} to later years`;
    $('copy').hidden = year === 6;
  }

  function renderPlan(p) {
    $('plan').innerHTML = p.years.map(y => `<button data-year="${y.year}" aria-pressed="${y.year === year}" aria-label="Year ${y.year}: ${money(y.sold)} sales"><span>Y${y.year}</span><b>${shortMoney(y.sold)}</b></button>`).join('');
  }

  function animateHero(to) {
    cancelAnimationFrame(tween);
    const from = shown, start = performance.now(), ms = 180;
    const stepFrame = now => {
      const t = Math.min(1, (now - start) / ms);
      shown = from + (to - from) * (1 - Math.pow(1 - t, 3));
      $('heroNum').textContent = Math.round(shown).toLocaleString('en-MY');
      if (t < 1) tween = requestAnimationFrame(stepFrame);
    };
    tween = requestAnimationFrame(stepFrame);
    // Frames pause in a background tab, so make sure the final figure always lands
    clearTimeout(settle);
    settle = setTimeout(() => { cancelAnimationFrame(tween); shown = to; $('heroNum').textContent = Math.round(to).toLocaleString('en-MY'); }, ms + 40);
  }

  const segments = y => y.bySalesYear.map((v, i) => ({v, color: COHORT[i]})).concat({v: y.benefits, color: 'var(--cream)'});

  function renderChart(p) {
    const max = Math.max(1, ...p.years.map(y => y.monthly));
    $('chart').innerHTML = p.years.map(y => {
      const h = y.monthly / max * 168;
      const segs = segments(y).filter(s => s.v > 0)
        .map(s => `<span class="seg" style="height:${Math.max(1, s.v / y.total * h - 2)}px;background:${s.color}"></span>`).join('');
      return `<button class="bar" data-year="${y.year}" aria-pressed="${y.year === year}" aria-label="Year ${y.year}: ${rm(y.monthly)} a month">
        <span class="val">${y.monthly >= 10000 ? 'RM' + +(y.monthly / 1000).toFixed(1) + 'k' : rm(y.monthly)}</span>
        <span class="stack" style="height:${h}px">${segs}</span></button>`;
    }).join('');
    let x = $('chartX');
    if (!x) {
      x = document.createElement('div');
      x.id = 'chartX';
      x.className = 'chart-x';
      x.innerHTML = [1, 2, 3, 4, 5, 6].map(n => `<span>Y${n}</span>`).join('');
      $('chart').after(x);
    }
    $('legend').innerHTML = COHORT.map((c, i) => `<span><i style="background:${c}"></i>Y${i + 1} sales</span>`).join('')
      + (view === 'gm' ? '<span><i style="background:var(--cream)"></i>GM benefits</span>' : '');
    $('chartNote').textContent = "Each colour is one year's sales, still paying you in the years after."
      + (view === 'agent' ? '' : ' Year 1 is your first year at this level. Income from before the promotion is not included.');
  }

  function renderBreakdown(y) {
    $('breakTitle').textContent = `Year ${year} breakdown`;
    let rows = '';
    if (view === 'agent') {
      const src = y.rows[0];
      rows = src.parts.map((v, i) => {
        const age = year - 1 - i;
        return `<div class="row"><i style="background:${COHORT[i]}"></i><div><b>Year ${i + 1} sales</b><small>${money(src.production[i])}, policy year ${age + 1} at <strong class="pct">${pct(src.rates[age])}</strong></small></div><span class="amt">${rm(v / 12)}</span></div>`;
      }).reverse().join('');
    } else {
      rows = y.rows.filter(r => r.sold > 0 || r.total > 0).map(r =>
        `<div class="row"><span></span><div><b>${r.label}</b><small>${r.note || money(r.sold) + ' sales this year'}</small></div><span class="amt">${rm(r.total / 12)}</span></div>`).join('');
    }
    rows += `<div class="row total"><span></span><div><b>Total for Year ${year}</b><small>${rm(y.total)} a year</small></div><span class="amt">${rm(y.monthly)}</span></div>`;
    $('breakdown').innerHTML = rows;
  }

  function renderDeferred() {
    const rows = Calc.deferred(state.defNB), now = rows[state.defYears - 1];
    const max = Math.max(1, rows[29].fund);
    $('defLabel').textContent = `Deferred benefit after ${CONTROLS.defYears.fmt(state.defYears)}`;
    $('defNum').textContent = Math.round(now.fund).toLocaleString('en-MY');
    $('defChart').innerHTML = rows.map(r => `<button data-defyear="${r.year}" aria-pressed="${r.year === state.defYears}" aria-label="Year ${r.year}: ${rm(r.fund)}"><span style="height:${Math.max(1, r.fund / max * 168)}px"></span></button>`).join('');
    $('defBreak').innerHTML = [
      ['Accumulated renewal', '90% of new business, built up each year', now.accumulated],
      [`Added in Year ${now.year}`, '1.25% of accumulated renewal', now.added],
      [`Growth in Year ${now.year}`, now.year === 1 ? 'Growth starts in Year 2' : '5% on the fund', now.growth]
    ].map(([b, s, v]) => `<div class="row"><span></span><div><b>${b}</b><small>${s}</small></div><span class="amt">${rm(v)}</span></div>`).join('')
      + `<div class="row total"><span></span><div><b>Deferred benefit</b><small>End of Year ${now.year}</small></div><span class="amt">${rm(now.fund)}</span></div>`;
    $('defMiles').innerHTML = [5, 10, 15, 20, 25, 30].map(n => `<div class="row"><span></span><div><b>Year ${n}</b></div><span class="amt">${rm(rows[n - 1].fund)}</span></div>`).join('');
  }

  function render() {
    if (view === 'deferred') return renderDeferred();
    const p = Calc.project(view, inputs());
    const y = p.years[year - 1];
    $('heroLabel').textContent = heroLabel(year);
    $('heroSub').textContent = `${rm(y.total)} a year, illustrative`;
    animateHero(y.monthly);
    document.querySelectorAll('#years button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.year === year));
    renderPlan(p);
    renderChart(p);
    renderBreakdown(y);
    $('six').textContent = rm(p.sixYearTotal);
  }

  function setView(v) {
    view = v;
    document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.view === v));
    $('planner').hidden = v === 'rates' || v === 'deferred';
    $('rates').hidden = v !== 'rates';
    $('deferred').hidden = v !== 'deferred';
    if (v !== 'rates') { buildSliders(); render(); }
    scrollTo(0, 0);
  }

  function setValue(key, value) {
    const c = CONTROLS[key], v = Math.min(c.max, Math.max(c.min, value));
    if (mode === 'yearly' && !ONE_VALUE.includes(key)) plan[key][year - 1] = v;
    else {
      state[key] = v;
      if (!ONE_VALUE.includes(key)) plan = null;   // a new flat assumption replaces any old yearly plan
    }
    syncSliders();
    render();
  }

  function setMode(m) {
    mode = m;
    if (m === 'yearly' && !plan) plan = Object.fromEntries(PER_YEAR.map(k => [k, Array(6).fill(state[k])]));
    syncSliders();
    render();
  }

  function setYear(n) {
    year = n;
    syncSliders();
    render();
  }

  function copyForward() {
    PER_YEAR.forEach(k => plan[k].fill(plan[k][year - 1], year));
    render();
  }

  const RATE_GROUPS = [
    {title: 'Your own sales', cards: [
      {h: 'Agent personal commission', sub: 'Planning rates from the REDEFINE commission sheet. Not on the company chart.', years: 6, rows: [['Rate', [28, 28, 15.5, 15.5, 15, 15], true]]}
    ]},
    {title: 'Maximum override payable', cards: [
      {h: 'Max OR% rates', sub: 'Plus FY 3 + SY 3 as SPO.', years: 4, rows: [['AAC', [14, 14, 4.5, 4.5], true]]}
    ]},
    {title: 'AAC contract', cards: [
      {h: "GM's direct unit", sub: 'Paid to the GM.', years: 4, rows: [['OR', [100, 100, 100, 100]], ['AAC', [14, 14, 4.5, 4.5], true]]},
      {h: "UM's direct unit", sub: 'Paid to the UM.', years: 4, rows: [['OR', [60, 60, 63.4, 100]], ['AAC', [8.4, 8.4, 2.853, 4.5], true]]},
      {h: 'GM on UM group', sub: 'Paid to the GM. Plus FY 3 + SY 3 as SPO.', years: 3, rows: [['OR', [40, 40, 36.6]], ['AAC', [5.6, 5.6, 1.647], true]]},
      {h: 'GM on a UM block', sub: 'Paid to the GM on a UM developed by another UM. Plus FY 3 + SY 3 as SPO.', years: 3, rows: [['OR', [40, 0, 0]], ['AAC', [5.6, 0, 0], true]]},
      {h: 'UM on a UM they developed', sub: '3-years block, paid to the developing UM.', years: 3, rows: [['OR', [0, 40, 36.6]], ['AAC', [0, 5.6, 1.647], true]]}
    ]},
    {title: 'GM benefits', cards: [
      {h: 'AOM', lines: ['RM5,000 a month.']},
      {h: 'Whole group bonus', lines: ['RM40,000 a year for every RM750,000 of whole group sales.']}
    ]},
    {title: 'Deferred benefits', cards: [
      {h: 'How it builds', lines: ['Accumulated renewal: 90% of new business, added each year.', '1.25% of accumulated renewal is added to the fund each year.', 'The fund grows 5% a year from Year 2.']}
    ]}
  ];

  function buildRates() {
    const card = c => {
      if (!c.years) return `<div class="rate"><h3>${c.h}</h3>${c.lines.map(l => `<p>${l}</p>`).join('')}</div>`;
      const head = Array.from({length: c.years}, (_, i) => `<th>Y${i + 1}</th>`).join('');
      const rows = c.rows.map(([name, vals, key]) => `<tr${key ? ' class="key"' : ''}><td>${name}</td>${vals.map(v => `<td>${v}%</td>`).join('')}</tr>`).join('');
      return `<div class="rate"><h3>${c.h}</h3>${c.sub ? `<p>${c.sub}</p>` : ''}<table><thead><tr><th>Year</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
    };
    $('rates').innerHTML = `<h1>Commission structure</h1>
      <p>Override rates under the AAC contract: standard investment-link plans, new business w.e.f. 01.01.2020. OR is the apportionment rate. AAC is the maximum OR payable. SPO is received by the Mother GM.</p>
      ${RATE_GROUPS.map(g => `<h2>${g.title}</h2>${g.cards.map(card).join('')}`).join('')}`;
  }

  $('years').innerHTML = [1, 2, 3, 4, 5, 6].map(n => `<button data-year="${n}" aria-label="Year ${n}">Y${n}</button>`).join('');
  document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setView(b.dataset.view); });
  const pick = e => { const b = e.target.closest('[data-year]'); if (b) setYear(+b.dataset.year); };
  $('years').addEventListener('click', pick);
  $('chart').addEventListener('click', pick);
  $('plan').addEventListener('click', pick);
  $('copy').addEventListener('click', copyForward);
  document.querySelector('.mode').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
  ['sliders', 'defSliders'].forEach(id => {
    $(id).addEventListener('input', e => { if (e.target.dataset.key) setValue(e.target.dataset.key, +e.target.value); });
    $(id).addEventListener('click', e => {
      const b = e.target.closest('.step');
      if (b) setValue(b.dataset.key, val(b.dataset.key) + CONTROLS[b.dataset.key].step * +b.dataset.dir);
    });
  });
  $('defChart').addEventListener('click', e => { const b = e.target.closest('[data-defyear]'); if (b) setValue('defYears', +b.dataset.defyear); });
  $('defReset').addEventListener('click', () => { state.defNB = DEFAULTS.defNB; state.defYears = DEFAULTS.defYears; syncSliders(); render(); });
  $('reset').addEventListener('click', () => { state = Object.assign({}, DEFAULTS); plan = null; mode = 'same'; syncSliders(); render(); });

  buildRates();
  $('defSliders').innerHTML = ['defNB', 'defYears'].map(controlHtml).join('');
  setView('agent');
})();
