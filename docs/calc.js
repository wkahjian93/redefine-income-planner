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

  // GM AOM, from the "Group Manager (GM)'s Extra AOM Calculation" sheet:
  // Basic AOM = new business premium x 0.75% + total renewal premium x 1.75%. The GM is paid up to RM60,000 of it;
  // only the part above RM60,000 can be claimed as Extra AOM, up to the entitlement for whole group sales, times the PR factor.
  const AOM = {nbRate: 0.0075, renewalRate: 0.0175, basicPaid: 60000,
    tiers: [[5000000, 80000], [3000000, 60000], [1500000, 40000]]};

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

  // Whole group = direct unit + UM group + UM block (the daughter GM group is not counted)
  const wholeGroup = (s, i) => at(s.gmDU, i) + at(s.gmUM, i) + at(s.gmBlock, i);
  // A band's top amount belongs to it (RM1.5m is RM20,000, RM5m is RM60,000); RM750k starts the first band
  const entitlement = wg => wg < 750000 ? 0 : (AOM.tiers.find(([from]) => wg > from) || [0, 20000])[1];
  const prFactor = pr => Math.max(0, (pr - 88) / 12 + 1);

  // AOM for year i+1. Renewal premium starts at the GM's existing book and each year adds the
  // previous years' whole group sales that stay in force at the PR.
  function aom(s, i) {
    const pr = s.gmPR == null ? 100 : s.gmPR, book = s.gmBook || 0;
    let renewal = book;
    for (let c = 0; c < i; c++) renewal += wholeGroup(s, c) * pr / 100;
    const wg = wholeGroup(s, i);
    const basic = wg * AOM.nbRate + renewal * AOM.renewalRate;
    const surplus = Math.max(0, basic - AOM.basicPaid);
    const factor = prFactor(pr), ent = entitlement(wg);
    const qualifies = basic >= AOM.basicPaid;
    return {wg, renewal, basic, basicPaid: Math.min(basic, AOM.basicPaid), surplus, factor, entitlement: ent, qualifies,
      extra: qualifies ? factor * Math.min(ent, surplus) : 0};
  }

  // GM benefits are paid on top of overriding and are not tied to any sales year.
  function benefits(level, s, i) {
    if (level !== 'gm') return [];
    const a = aom(s, i), money = n => 'RM' + Math.round(n).toLocaleString('en-MY');
    const extraNote = !a.qualifies ? `Needs Basic AOM of RM60,000 first (now ${money(a.basic)})`
      : !a.entitlement ? 'Whole group sales under RM750,000: no entitlement'
      : `Factor ${+a.factor.toFixed(3)} × lower of ${money(a.entitlement)} entitlement and ${money(a.surplus)} above RM60,000`;
    return [
      {key: 'aom', label: 'Basic AOM', note: `${money(a.wg)} × 0.75% + ${money(a.renewal)} renewal × 1.75% = ${money(a.basic)}, paid up to RM60,000`, parts: [], sold: 0, total: a.basicPaid},
      {key: 'xaom', label: 'Extra AOM', note: extraNote, parts: [], sold: 0, total: a.extra}
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

  // MAE: Market (average case size) x Activity (presentations) x Efficiency (closing ratio) = ANP.
  // Works back from an ANP goal over `months` (1, 3, 6 or 12), as in the REDEFINE MAE video:
  // ANP / case size = cases, / closing ratio = presentations in the period,
  // then a month (/months, rounded up) and a week (/4, rounded up); appointments = presentations / P:O, approaches = appointments / O:A.
  function mae({anp, months, size, closing, presentRatio, prospectRatio}) {
    const rate = RATES.personal[0];
    const cases = size > 0 ? anp / size : 0;
    const pPeriod = closing > 0 ? cases / closing : 0;
    const pMonth = Math.max(0, Math.ceil(pPeriod / months - 1e-9));
    const pWeek = Math.max(0, Math.ceil(pMonth / 4 - 1e-9));
    const oWeek = presentRatio > 0 ? Math.round(pWeek / presentRatio) : 0;
    const aWeek = prospectRatio > 0 ? Math.round(oWeek / prospectRatio) : 0;
    return {rate, anp, commission: anp * rate, cases, pPeriod, pMonth, pWeek, oWeek, aWeek, cWeek: pWeek * closing};
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

  const api = {RATES, AOM, DEFERRED, YEARS, at, cohorts, sources, project, wholeGroup, entitlement, prFactor, aom, deferred, mae};
  if (typeof module !== 'undefined') module.exports = api; else root.Calc = api;
})(this);
