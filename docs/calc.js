// Income maths for the REDEFINE Income Planner. No page code here, so test.js can run it in Node.
// Override rates: company AAC contract, standard investment-link plans, new business w.e.f. 01.01.2020.
// Personal rates: "Agent PS" table in the REDEFINE commission sheet (not on the company chart).
(function (root) {
  const YEARS = 6;

  // Each array is the rate paid in policy year 1, 2, 3...
  const RATES = {
    personal: [0.28, 0.28, 0.155, 0.155, 0.15, 0.15],
    umDU: [0.084, 0.084, 0.02853, 0.045],
    gmDU: [0.14, 0.14, 0.045, 0.045],
    gmRideUM: [0.056, 0.056, 0.01647],
    umRideUM: [0, 0.056, 0.01647],      // UM who developed another UM: 3-year block
    gmRideBlockUM: [0.056, 0, 0],       // GM above that block: Year 1 only
    spo: [0.03, 0.03]                   // FY 3 + SY 3, received by the Mother GM
  };

  // GM benefits as given by the agency leader
  const GM_BENEFITS = {aomMonthly: 5000, wgStep: 750000, wgBonus: 40000};

  // An input is one number (same every year) or an array with one value per year.
  const at = (v, i) => Array.isArray(v) ? v[i] : v;

  // Income in calendar `year`, one entry per sales year: result[c] is the amount from sales made in year c+1.
  function cohorts(production, rates, year, renewal) {
    const out = [];
    for (let c = 1; c <= year; c++) {
      const age = year - c;
      out.push(at(production, c - 1) * (rates[age] || 0) * Math.pow(renewal, age));
    }
    return out;
  }

  const sum = a => a.reduce((x, y) => x + y, 0);

  function sources(level, s) {
    const sales = Array.from({length: YEARS}, (_, i) => at(s.cases, i) * 12 * at(s.size, i));
    const personal = {key: 'personal', label: 'Personal commission', production: sales, rates: RATES.personal};
    if (level === 'agent') return [personal];
    // UM and GM tabs show overriding only
    if (level === 'um') return [
      {key: 'du', label: 'Override on your direct unit', production: s.umDU, rates: RATES.umDU},
      {key: 'ride', label: 'UM you developed (3-year block)', production: s.umBlock, rates: RATES.umRideUM}
    ];
    return [
      {key: 'du', label: 'Override on your direct unit', production: s.gmDU, rates: RATES.gmDU},
      {key: 'ride', label: 'Ride on your UM group', production: s.gmUM, rates: RATES.gmRideUM},
      {key: 'block', label: 'Ride on UM block, Year 1 only', production: s.gmBlock, rates: RATES.gmRideBlockUM},
      {key: 'spo', label: 'SPO on daughter GM group', production: s.gmWG, rates: RATES.spo}
    ];
  }

  // Whole group bonus: every full step of whole group sales in a year earns one bonus.
  const wgSteps = wg => Math.floor(wg / GM_BENEFITS.wgStep);
  const wholeGroup = (s, i) => at(s.gmDU, i) + at(s.gmUM, i) + at(s.gmBlock, i);

  // GM benefits are paid on top of overriding and are not tied to any sales year.
  function benefits(level, s, i) {
    if (level !== 'gm') return [];
    const wg = wholeGroup(s, i), steps = wgSteps(wg);
    return [
      {key: 'aom', label: 'AOM', note: 'RM5,000 a month', parts: [], sold: 0, total: GM_BENEFITS.aomMonthly * 12},
      {key: 'wg', label: 'Whole group bonus', note: `${steps} × RM${GM_BENEFITS.wgBonus.toLocaleString('en-MY')} on RM${wg.toLocaleString('en-MY')} whole group sales`, parts: [], sold: 0, total: steps * GM_BENEFITS.wgBonus}
    ];
  }

  // Full picture for one level: yearly income per source and per sales year, for years 1 to 6.
  function project(level, s) {
    const list = sources(level, s);
    const years = [];
    for (let y = 1; y <= YEARS; y++) {
      const earned = list.map(src => {
        const parts = cohorts(src.production, src.rates, y, s.renewal);
        return Object.assign({}, src, {parts, total: sum(parts), sold: at(src.production, y - 1)});
      });
      const extra = benefits(level, s, y - 1), rows = earned.concat(extra);
      const total = sum(rows.map(r => r.total));
      const bySalesYear = [];
      for (let c = 0; c < y; c++) bySalesYear.push(sum(earned.map(r => r.parts[c])));
      years.push({year: y, rows, total, monthly: total / 12, bySalesYear, sold: sum(earned.map(r => r.sold)), benefits: sum(extra.map(r => r.total))});
    }
    return {years, sixYearTotal: sum(years.map(y => y.total))};
  }

  // Deferred Benefits table in the commission sheet: 90% of new business builds accumulated renewal each year.
  // 1.25% of it is added to the fund each year, and from Year 2 the fund plus that addition grows 5%.
  const DEFERRED = {renewal: 0.9, rate: 0.0125, growth: 0.05, years: 30};

  function deferred(newBusiness) {
    const rows = [];
    let accumulated = 0, fund = 0;
    for (let y = 1; y <= DEFERRED.years; y++) {
      accumulated += newBusiness * DEFERRED.renewal;
      const added = accumulated * DEFERRED.rate;
      const growth = y === 1 ? 0 : (fund + added) * DEFERRED.growth;
      fund += added + growth;
      rows.push({year: y, accumulated, added, growth, fund});
    }
    return rows;
  }

  const api = {RATES, GM_BENEFITS, DEFERRED, YEARS, at, cohorts, sources, project, wgSteps, wholeGroup, deferred};
  if (typeof module !== 'undefined') module.exports = api; else root.Calc = api;
})(this);
