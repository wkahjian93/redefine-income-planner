// REDEFINE Income Planner page code. The maths lives in calc.js.
(function () {
  const $ = id => document.getElementById(id);
  const rm = n => 'RM' + Math.round(n).toLocaleString('en-MY');
  const pct = n => +(n * 100).toFixed(3) + '%';

  const DEFAULTS = {cases: 6, size: 3000, renewalPct: 100, umDU: 600000, umBlock: 0, gmDU: 1000000, gmUM: 600000, gmBlock: 0, gmWG: 2000000, gmPR: 95, gmBook: 4000000, defNB: 1000000, defYears: 30, maeGoal: 120000, maePeriod: 12, maeSize: 3000, maeClose: 20, maePresent: 70, maeProspect: 60};
  const ONE_VALUE = ['renewalPct', 'gmPR', 'gmBook', 'defNB', 'defYears', 'maeGoal', 'maePeriod', 'maeSize', 'maeClose', 'maePresent', 'maeProspect'];   // never set year by year
  const PER_YEAR = Object.keys(DEFAULTS).filter(k => !ONE_VALUE.includes(k));
  let state = Object.assign({}, DEFAULTS);
  let plan = null, mode = 'same';   // plan holds one value per year for each PER_YEAR key
  let view = 'agent', year = 1, shown = 0, tween = null, settle = null;

  const money = v => v >= 1e6 ? 'RM' + +(v / 1e6).toFixed(2) + 'm' : rm(v);
  const shortMoney = v => !v ? '0' : v >= 1e6 ? +(v / 1e6).toFixed(2) + 'm' : Math.round(v / 1000) + 'k';
  const CONTROLS = {
    cases: {label: 'Cases a month', min: 0, max: 20, top: 100, whole: true, step: 1, fmt: v => v + (v === 1 ? ' case' : ' cases')},
    size: {label: 'Case size (annual premium)', min: 500, max: 15000, top: 1000000, step: 100, fmt: rm},
    renewalPct: {label: 'Policies renewing each year', min: 50, max: 100, step: 1, fmt: v => v + '%', hint: 'The commission tables assume 100%. Lower it to test a more cautious case.'},
    umDU: {label: 'Your direct unit sales a year including your PS', min: 0, max: 3000000, step: 10000, fmt: money},
    umBlock: {label: 'Group sales of a UM you developed', min: 0, max: 2000000, step: 10000, fmt: money},
    gmDU: {label: 'Your direct unit sales a year including your PS', min: 0, max: 5000000, step: 50000, fmt: money},
    gmUM: {label: 'Your UM group sales a year', min: 0, max: 5000000, step: 50000, fmt: money},
    gmBlock: {label: 'Group sales of a UM developed by your UM', min: 0, max: 3000000, step: 10000, fmt: money},
    gmWG: {label: 'Daughter GM whole group sales a year', min: 0, max: 10000000, step: 100000, fmt: money},
    gmPR: {label: 'Whole group persistency ratio (PR), for AOM', min: 70, max: 100, top: 100, step: 1, fmt: v => v + '%', hint: 'PR 88% gives factor 1. PR 100% gives factor 2.'},
    gmBook: {label: 'Renewal premium you already have in Year 1', min: 0, max: 20000000, step: 100000, fmt: money},
    defNB: {label: 'New business a year (DU)', min: 0, max: 5000000, step: 50000, fmt: money},
    defYears: {label: 'After how many years', min: 1, max: 30, whole: true, step: 1, fmt: v => v + (v === 1 ? ' year' : ' years')},
    maeGoal: {label: 'Total ANP goal', min: 0, max: 600000, step: 5000, fmt: rm},
    maeSize: {label: 'M: average case size (ANP)', min: 500, max: 15000, top: 1000000, step: 100, fmt: rm},
    maeClose: {label: 'E: closing ratio (C/P)', min: 5, max: 50, top: 100, step: 1, fmt: v => v + '%', hint: 'Usually 10% to 20%. Ideal 20%.'},
    maePresent: {label: 'Presentation ratio (P/O)', min: 30, max: 100, top: 100, step: 1, fmt: v => v + '%', hint: 'Aim for 70% or higher.'},
    maeProspect: {label: 'Prospecting ratio (O/A)', min: 20, max: 100, top: 100, step: 1, fmt: v => v + '%', hint: 'Aim for 60% or higher.'}
  };
  const topOf = c => c.top || (c.fmt === money ? 1e9 : c.max);

  // Reads a typed amount: "RM1,200,000", "1.2m", "350k" and "6 cases" all work.
  function parseAmount(text) {
    const s = String(text).toLowerCase().replace(/rm|,|\s|cases?|years?|%/g, '');
    const m = s.match(/^(\d*\.?\d+)([km]?)$/);
    if (!m) return NaN;
    return +m[1] * (m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1);
  }

  const LAYOUT = {
    agent: {main: ['cases', 'size', 'renewalPct']},
    um: {main: ['umDU', 'renewalPct'], more: ['umBlock'], moreLabel: 'Developed another UM?'},
    gm: {main: ['gmDU', 'gmUM', 'gmWG', 'renewalPct', 'gmPR', 'gmBook'], more: ['gmBlock'], moreLabel: 'UM block under your UM?'}
  };
  const COHORT = ['#BE8A2A', '#5B7FE6', '#7E9A2E', '#B867C4', '#22A08F', '#D0655A'];   // one colour per sales year
  const inputs = () => Object.assign({}, state, mode === 'yearly' ? plan : {}, {renewal: state.renewalPct / 100});
  const val = k => mode === 'yearly' && !ONE_VALUE.includes(k) ? plan[k][year - 1] : state[k];

  const at = Calc.at;
  const heroLabel = n => ({agent: `Agent, Year ${n} income`, um: `Unit Manager, Year ${n} overriding`, gm: `Group Manager, Year ${n} overriding + benefits`})[view];

  function controlHtml(key) {
    const c = CONTROLS[key];
    return `<div class="ctl">
      <div class="ctl-top"><label for="n-${key}">${c.label}</label><input class="num" id="n-${key}" data-num="${key}" inputmode="decimal" autocomplete="off" enterkeyhint="done"></div>
      ${c.hint ? `<div class="ctl-hint">${c.hint}</div>` : ''}
      <div class="ctl-row">
        <button class="step" data-key="${key}" data-dir="-1" aria-label="Less: ${c.label}">&minus;</button>
        <input type="range" id="r-${key}" data-key="${key}" aria-label="${c.label}" min="${c.min}" max="${c.max}" step="${c.step}" value="${val(key)}">
        <button class="step" data-key="${key}" data-dir="1" aria-label="More: ${c.label}">+</button>
      </div></div>`;
  }

  function buildSliders() {
    const l = LAYOUT[view];
    if (!l) return;
    let html = '';
    l.main.forEach(k => {
      html += controlHtml(k);
      if (k === 'size') html += '<p class="summary-line" id="yearly"><span id="salesCalc"></span> = <input class="num sales" id="salesIn" data-sales inputmode="decimal" autocomplete="off" enterkeyhint="done" aria-label="Personal sales"> <span id="salesWhen"></span></p>';
      if (k === 'gmUM') html += '<p class="summary-line" id="wgLine"></p>';
    });
    if (l.more) html += `<details><summary>${l.moreLabel}</summary>${l.more.map(controlHtml).join('')}</details>`;
    $('sliders').innerHTML = '<p class="type-tip">Drag, tap &minus; or +, or tap any amount to type it.</p>' + html;
    syncSliders();
  }

  // A typed box is left alone while someone is typing in it
  const showNum = (el, text) => { if (el && document.activeElement !== el) el.value = text; };

  function syncSliders() {
    document.querySelectorAll('#sliders input[type=range], #defSliders input[type=range], #maeSliders input[type=range]').forEach(el => {
      const k = el.dataset.key, c = CONTROLS[k];
      el.value = val(k);
      el.style.setProperty('--p', Math.min(100, (val(k) - c.min) / (c.max - c.min) * 100) + '%');
      showNum($('n-' + k), c.fmt(val(k)));
      el.setAttribute('aria-valuetext', c.fmt(val(k)));
    });
    const yearly = $('yearly');
    if (yearly) {
      $('salesCalc').innerHTML = `${val('cases')} &times; ${rm(val('size'))} &times; 12`;
      showNum($('salesIn'), rm(val('cases') * val('size') * 12));
      $('salesWhen').textContent = `personal sales ${mode === 'yearly' ? 'in Year ' + year : 'a year'}`;
    }
    const wgLine = $('wgLine');
    if (wgLine) {
      const a = Calc.aom(inputs(), year - 1);
      wgLine.innerHTML = `Year ${year}: whole group <b>${money(a.wg)}</b>, entitlement <b>${rm(a.entitlement)}</b>. Basic AOM ${rm(a.basic)}${a.qualifies ? '' : ', under RM60,000 so no Extra AOM'}`;
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

  const segLabel = m => m >= 10000 ? 'RM' + +(m / 1000).toFixed(1) + 'k' : rm(m);
  const segments = y => y.bySalesYear.map((v, i) => ({v, color: COHORT[i]})).concat({v: y.benefits, color: 'var(--cream)'});

  function renderChart(p) {
    const max = Math.max(1, ...p.years.map(y => y.monthly));
    $('chart').innerHTML = p.years.map(y => {
      const h = y.monthly / max * 168;
      // Each box shows its monthly amount when there is room for the text
      const segs = segments(y).filter(s => s.v > 0).map(s => {
        const px = Math.max(1, s.v / y.total * h - 2);
        return `<span class="seg${s.color === 'var(--cream)' ? ' light' : ''}" style="height:${px}px;background:${s.color}">${px >= 11 ? segLabel(s.v / 12) : ''}</span>`;
      }).join('');
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
      // One row per sales year, with each override source and its rate, like the Agent tab
      const short = {du: 'Direct unit', ride: view === 'um' ? 'UM you developed' : 'UM group', block: 'UM block', spo: 'Daughter GM group (SPO)'};
      const earned = y.rows.filter(r => r.rates);
      for (let i = year - 1; i >= 0; i--) {
        const age = year - 1 - i;
        const lines = earned.filter(r => at(r.production, i) > 0 && (r.rates[age] || 0) > 0);
        if (!lines.length) continue;
        const amount = lines.reduce((s, r) => s + r.parts[i], 0);
        rows += `<div class="row"><i style="background:${COHORT[i]}"></i><div><b>Year ${i + 1} sales</b><small>Policy year ${age + 1}</small>${lines.map(r =>
          `<small class="src">${short[r.key]} ${money(at(r.production, i))} at <strong class="pct">${pct(r.rates[age])}</strong></small>`).join('')}</div><span class="amt">${rm(amount / 12)}</span></div>`;
      }
      rows += y.rows.filter(r => !r.rates && (r.total > 0 || r.key === 'xaom')).map(r =>
        `<div class="row"><i style="background:var(--cream)"></i><div><b>${r.label}</b><small>${r.note}</small></div><span class="amt">${rm(r.total / 12)}</span></div>`).join('');
    }
    rows += `<div class="row total"><span></span><div><b>Total for Year ${year}</b><small>${rm(y.total)} a year</small></div><span class="amt">${rm(y.monthly)}</span></div>`;
    $('breakdown').innerHTML = rows;
  }

  const MAE_KEYS = ['maeGoal', 'maeSize', 'maeClose', 'maePresent', 'maeProspect'];
  const count = (n, d = 1) => (+n.toFixed(d)).toLocaleString('en-MY');

  // Goal periods: months in each, its name, and the goal slider's range for it
  const PERIODS = {1: ['month', 'a month', 50000, 500], 3: ['quarter', 'a quarter', 150000, 1000], 6: ['half year', 'a half year', 300000, 1000], 12: ['year', 'a year', 600000, 5000]};

  function setPeriod(months) {
    // keep the same pace: RM10,000 a month becomes RM30,000 a quarter
    state.maeGoal = Math.round(state.maeGoal / state.maePeriod * months);
    state.maePeriod = months;
    buildMae();
    render();
  }

  function buildMae() {
    const [, , max, step] = PERIODS[state.maePeriod];
    Object.assign(CONTROLS.maeGoal, {max, step});
    $('maeSliders').innerHTML = MAE_KEYS.map(controlHtml).join('');
    document.querySelectorAll('.period button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.period === state.maePeriod));
    syncSliders();
  }

  // 2026 Elevation, Redesignation and Maintenance Guidelines ("D" Contract), circular AD/5024/APR2026, 29 April 2026.
  // Plain-language version; the live checks only test the production and policy numbers this app knows.
  const PROMO_SOURCE = 'Source: Great Eastern circular AD/5024/APR2026, 2026 Elevation, Redesignation and Maintenance Guidelines ("D" Contract), 29 April 2026. The full guideline and checklist in ePartner prevail.';
  const PROMO_WORDS = [
    ['FYLPI', 'First-year premium. This app uses ANP as a close estimate.'],
    ['PS', 'Your personal sales.'],
    ['DIA', 'Agents you introduced yourself.'],
    ['QA', 'Qualifying agent: holds an agent contract on 31 Dec and sold at least RM18,000 FYLPI that year.'],
    ['DG', 'Direct group: you plus your direct agents and CA/LIA.'],
    ['WG', 'Whole group: everyone under you, except GMs your group has developed.'],
    ['PR', 'First-year persistency: share of new policies still in force after a year.']
  ];

  function promoContent(y) {
    const tick = (ok, text) => `<span class="pill ${ok ? 'ok' : 'no'}">${ok ? 'Met' : 'Not yet'}</span> ${text}`;
    if (view === 'agent') {
      const sales = y.rows[0].sold, policies = val('cases') * 12;
      return {
        title: 'Sales Manager title', sub: 'A yearly title. You must qualify again every year.',
        live: [tick(sales >= 75000, `Year ${year} personal sales ${rm(sales)}, needs RM75,000`), tick(policies >= 24, `Year ${year} policies ${policies}, needs 24`)],
        get: [
          ['Sales', 'RM75,000 FYLPI a year: all personal, or at least RM50,000 personal plus the rest from agents you introduced.'],
          ['Policies', 'At least 24 a year. Smart Invest Premier counts for at most 6.'],
          ['Persistency', 'First-year PR of 85%.'],
          ['Training', 'Complete UM Venture Level 1 (UV L1).']
        ],
        keep: [
          ['Stay an agent', 'At least RM18,000 FYLPI personal sales a year, PR 85%, and CPD from your 2nd year (30 hours in 2026).'],
          ['New agents', 'Joined in 2026: RM13,500 (Jan–Mar), RM9,000 (Apr–Jun), RM4,500 (Jul–Sep), none after October.']
        ]
      };
    }
    if (view === 'um') {
      const dg = y.rows.find(r => r.key === 'du').sold;
      return {
        title: 'Promotion to Unit Manager', sub: 'From agent to UM. Takes effect on 1 January.',
        live: [tick(dg >= 100000, `Year ${year} direct group ${rm(dg)}, needs RM100,000 to stay UM`)],
        get: [
          ['Time', 'At least 2 calendar years as an agent, working full time.'],
          ['Sales, year 1', 'RM75,000 FYLPI: all personal, or at least RM50,000 personal plus the rest from agents you introduced.'],
          ['Sales, year 2', 'RM150,000 FYLPI, with at least RM75,000 personal and the rest from agents you introduced.'],
          ['Team', 'At least 4 qualified agents you introduced (each RM18,000+). 2 of them must sell RM30,000+ each.'],
          ['Policies', 'At least 24 a year, 2 years in a row. Smart Invest Premier counts for at most 6 a year.'],
          ['Persistency', 'Personal first-year PR of 85%, 2 years in a row.'],
          ['Training', 'UM Venture Level 2 (30 hours, done 2024–2026), and pass BAMC and CEILLI.']
        ],
        keep: [
          ['Sales', 'RM100,000 FYLPI a year from your direct group.'],
          ['Team', 'At least 4 qualifying agents in your direct group.'],
          ['Persistency', 'Direct group first-year PR of 85%.'],
          ['Training', 'Finish PLS1 (GM Venture Level 1) in your first year as UM, and CPD every year.'],
          ['If you miss', 'Missing the requirements 2 years in a row returns you to agent.'],
          ['Bonus credit', 'When your agent becomes a UM, you get 50% of their direct group sales in their 1st year and 25% in their 2nd, towards your own target.']
        ]
      };
    }
    const dg = y.rows.find(r => r.key === 'du').sold, wg = Calc.wholeGroup(inputs(), year - 1);
    const meets = dg >= 300000 || (dg >= 100000 && wg >= 400000);
    return {
      title: 'Promotion to Group Manager', sub: 'From UM to GM. Takes effect on 1 January.',
      live: [tick(meets, `Year ${year} direct group ${rm(dg)}, whole group ${rm(wg)}. To stay GM: RM300,000 direct group, or RM100,000 direct + RM400,000 whole group`)],
      get: [
        ['Time', 'At least 3 years as UM, working full time.'],
        ['Path 1, 3 years', 'Direct group sales of RM300,000, then RM400,000, then RM450,000, in 3 years in a row. Team: 4 qualifying agents plus 2 qualified direct UMs in the final year.'],
        ['Path 2, fast track', 'RM1.2m direct group sales within 2 years in a row. Team: 10 qualifying agents (at least 6 direct), at least 1 qualified direct UM, and 2 of the agents selling RM30,000+ personal each.'],
        ['Help from your UMs', 'You may count 100% of a junior UM\'s sales for 3 years after they become UM.'],
        ['Persistency', 'Direct group first-year PR of 85%, 2 years in a row.'],
        ['Training', 'Pacesetter Program (GM Venture Level 3, 30 hours, done 2024–2026), and pass CEILLI.']
      ],
      keep: [
        ['Sales, one of', 'RM300,000 direct group; or RM100,000 direct group + RM400,000 whole group; or RM100,000 direct group + RM300,000 whole group + RM100,000 GI/PA/HL.'],
        ['Team', 'At least 8 qualifying agents in your whole group.'],
        ['Persistency', 'Whole group first-year PR of 80%.'],
        ['Training', 'Finish AMTC (GM Venture Level 4) in your first year as GM, and CPD every year.'],
        ['If you miss', 'Missing the requirements 2 years in a row returns you to UM.'],
        ['Bonus credit', 'When your UM becomes a GM, you get 50% of their whole group sales in their 1st year and 25% in their 2nd, towards your own target.'],
        ['Senior GM title', '10 years in a row as GM and 3 GMs broken away from your direct group. A title only, with no extra pay.']
      ]
    };
  }

  function renderPromo(y) {
    const c = promoContent(y);
    const list = items => `<ul class="steps">${items.map(([k, v]) => `<li><b>${k}</b><span>${v}</span></li>`).join('')}</ul>`;
    $('promoCard').innerHTML = `<div class="card-head"><h2>${c.title}</h2><span class="muted">2026 guideline</span></div>
      <p class="promo-sub">${c.sub}</p>
      <div class="promo-live">${c.live.map(l => `<p>${l}</p>`).join('')}<p class="muted">Persistency, team and training can't be checked here.</p></div>
      <h3 class="promo-h">To get it</h3>${list(c.get)}
      <details><summary>To keep it</summary>${list(c.keep)}</details>
      <details><summary>Words used</summary>${list(PROMO_WORDS)}</details>
      <p class="note">${PROMO_SOURCE}</p>`;
  }

  function renderMae() {
    const months = state.maePeriod, [name, per] = PERIODS[months];
    const r = Calc.mae({anp: state.maeGoal, months, size: state.maeSize, closing: state.maeClose / 100, presentRatio: state.maePresent / 100, prospectRatio: state.maeProspect / 100});
    $('maeNum').textContent = r.pWeek;
    $('maeSub').textContent = months === 1
      ? `${r.pMonth} a month, for ${rm(state.maeGoal)} ANP a month`
      : `${r.pMonth} a month, ${count(r.pPeriod, 0)} a ${name}, for ${rm(state.maeGoal)} ANP ${per}`;
    $('maeSteps').innerHTML = [
      ['ANP goal ÷ M (case size)', `${rm(state.maeGoal)} ÷ ${rm(state.maeSize)}`, `${count(r.cases)} cases ${per}`],
      ['Cases ÷ E (closing ratio)', `${count(r.cases)} ÷ <strong class="pct">${state.maeClose}%</strong>`, `${count(r.pPeriod, 0)} presentations ${per}`],
      months === 1
        ? ['A week', `${count(r.pPeriod, 0)} ÷ 4 weeks, rounded up`, `${r.pWeek} a week`]
        : ['A month, then a week', `${count(r.pPeriod, 0)} ÷ ${months}, then ÷ 4 weeks, rounded up`, `${r.pMonth} a month, ${r.pWeek} a week`]
    ].map(([b, s, v], i) => `<div class="row"><span class="stepno">${i + 1}</span><div><b>${b}</b><small>${s}</small></div><span class="amt">${v}</span></div>`).join('');
    $('maeEq').innerHTML = `M ${rm(state.maeSize)} &times; A ${count(r.pPeriod, 0)} presentations &times; E ${state.maeClose}% = <b>${rm(r.anp)} ANP</b> ${per}<br>About <b>${rm(r.commission)}</b> first-year commission at ${pct(r.rate)}`;
    const funnel = [
      ['A', 'approaches', r.aWeek, `O/A ${state.maeProspect}%`],
      ['O', 'appointments', r.oWeek, `P/O ${state.maePresent}%`],
      ['P', 'presentations', r.pWeek, `C/P ${state.maeClose}%`],
      ['C', r.cWeek === 1 ? 'case closed' : 'cases closed', r.cWeek, '']
    ];
    const top = Math.max(1, ...funnel.map(f => f[2]));
    $('maeFunnel').innerHTML = funnel.map(([k, name, n, ratio]) => `<div class="fstep"><span class="fkey">${k}</span><div class="fbar"><span style="width:${Math.max(4, n / top * 100)}%"></span><b>${count(n)} ${name}</b></div><span class="fratio">${ratio}</span></div>`).join('');
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
    if (view === 'mae') return renderMae();
    const p = Calc.project(view, inputs());
    const y = p.years[year - 1];
    $('heroLabel').textContent = heroLabel(year);
    $('heroSub').textContent = `${rm(y.total)} a year, illustrative`;
    animateHero(y.monthly);
    document.querySelectorAll('#years button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.year === year));
    renderPlan(p);
    renderChart(p);
    renderBreakdown(y);
    renderPromo(y);
    $('six').textContent = rm(p.sixYearTotal);
  }

  function setView(v) {
    view = v;
    document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.view === v));
    $('planner').hidden = ['rates', 'deferred', 'mae'].includes(v);
    $('mae').hidden = v !== 'mae';
    $('rates').hidden = v !== 'rates';
    $('deferred').hidden = v !== 'deferred';
    if (v !== 'rates') { buildSliders(); render(); }
    scrollTo(0, 0);
  }

  function setValue(key, value) {
    const c = CONTROLS[key];
    const v = Math.min(topOf(c), Math.max(c.min, c.whole ? Math.round(value) : value));
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
      {h: 'Basic AOM', lines: ['New business premium × 0.75% + total renewal premium × 1.75%.', 'Paid up to RM60,000 a year (RM5,000 a month).']},
      {h: 'Extra AOM', lines: ['Needs Basic AOM of at least RM60,000.', 'Factor × the lower of the entitlement and Basic AOM above RM60,000.', 'Factor = [(PR − 88) ÷ 12] + 1. PR is the whole group persistency ratio.']},
      {h: 'Entitlement (whole group MFYLP)', lines: ['RM750k to RM1.5m: RM20,000', 'RM1.5m to RM3m: RM40,000', 'RM3m to RM5m: RM60,000', 'Over RM5m: RM80,000']}
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
  // Typed sales amount on the Agent tab: keeps the cases and works out the average case size
  function setSales(total) {
    if (!(total >= 0)) return syncSliders();
    if (total === 0) return setValue('cases', 0);
    let cases = val('cases') || 1;
    // too few sales for the smallest case size: use fewer cases instead
    if (total / (cases * 12) < CONTROLS.size.min) cases = Math.max(1, Math.floor(total / (12 * CONTROLS.size.min)));
    setValue('cases', cases);
    setValue('size', total / (cases * 12));
  }

  ['sliders', 'defSliders', 'maeSliders'].forEach(id => {
    $(id).addEventListener('focusin', e => {
      const k = e.target.dataset.num;
      if (k) e.target.value = +val(k).toFixed(2);
      else if (e.target.id === 'salesIn') e.target.value = Math.round(val('cases') * val('size') * 12);
      else return;
      e.target.select();
    });
    $(id).addEventListener('change', e => {
      const k = e.target.dataset.num, n = parseAmount(e.target.value);
      if (k) { if (isNaN(n)) syncSliders(); else setValue(k, n); e.target.blur(); syncSliders(); }
      else if (e.target.id === 'salesIn') { e.target.blur(); setSales(n); syncSliders(); }
    });
    $(id).addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('num')) e.target.blur(); });
    $(id).addEventListener('focusout', e => { if (e.target.classList.contains('num')) setTimeout(syncSliders); });
    $(id).addEventListener('input', e => { if (e.target.dataset.key) setValue(e.target.dataset.key, +e.target.value); });
    $(id).addEventListener('click', e => {
      const b = e.target.closest('.step');
      if (b) setValue(b.dataset.key, val(b.dataset.key) + CONTROLS[b.dataset.key].step * +b.dataset.dir);
    });
  });
  $('defChart').addEventListener('click', e => { const b = e.target.closest('[data-defyear]'); if (b) setValue('defYears', +b.dataset.defyear); });
  $('maeReset').addEventListener('click', () => { MAE_KEYS.concat('maePeriod').forEach(k => { state[k] = DEFAULTS[k]; }); buildMae(); render(); });
  $('defReset').addEventListener('click', () => { state.defNB = DEFAULTS.defNB; state.defYears = DEFAULTS.defYears; syncSliders(); render(); });
  $('reset').addEventListener('click', () => { state = Object.assign({}, DEFAULTS); plan = null; mode = 'same'; syncSliders(); render(); });

  buildRates();
  $('defSliders').innerHTML = ['defNB', 'defYears'].map(controlHtml).join('');
  buildMae();
  document.querySelector('.period').addEventListener('click', e => { const b = e.target.closest('[data-period]'); if (b) setPeriod(+b.dataset.period); });
  setView('agent');
})();
