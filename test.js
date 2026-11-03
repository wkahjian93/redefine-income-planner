// Checks the app's maths against the commission sheet and the company chart. Run: node test.js
const assert = require('assert');
const {project, RATES, deferred, mae} = require('./docs/calc.js');
const base = {cases: 0, size: 0, renewal: 1, umDU: 0, umBlock: 0, gmDU: 0, gmUM: 0, gmBlock: 0, gmWG: 0};
const near = (a, b, msg) => assert(Math.abs(a - b) < 0.01, `${msg}: got ${a}, expected ${b}`);
const totals = p => p.years.map(y => y.total - y.benefits);   // overriding and commission only

// Agent PS table: 6 cases x RM3,000 a month = RM216,000 a year
const agent = project('agent', {...base, cases: 6, size: 3000});
[60480, 120960, 154440, 187920, 220320, 252720].forEach((v, i) => near(totals(agent)[i], v, 'agent year ' + (i + 1)));
[5040, 10080, 12870, 15660, 18360, 21060].forEach((v, i) => near(agent.years[i].monthly, v, 'agent month ' + (i + 1)));
near(agent.sixYearTotal, 996840, 'agent six years');

// Company chart: UM DU, RM600k. Year 3 uses the chart's 2.853%, the sheet rounds it to 2.85% (RM117,900).
const um = project('um', {...base, umDU: 600000});
[50400, 100800, 117918, 144918].forEach((v, i) => near(totals(um)[i], v, 'um year ' + (i + 1)));

// Company chart: GM DU 14/14/4.5/4.5 on RM1m. Deliberately NOT the sheet's 15/15/6.5/6.5.
const gm = project('gm', {...base, gmDU: 1000000});
[140000, 280000, 325000, 370000].forEach((v, i) => near(totals(gm)[i], v, 'gm du year ' + (i + 1)));

// Rides, sheet tables (Year 3 on the chart's 1.647%)
const ride = project('gm', {...base, gmUM: 600000});
[33600, 67200, 77082].forEach((v, i) => near(totals(ride)[i], v, 'ride um year ' + (i + 1)));
const spo = project('gm', {...base, gmWG: 2000000});
[60000, 120000].forEach((v, i) => near(totals(spo)[i], v, 'spo year ' + (i + 1)));

// Apportionment on the chart adds up: UM + GM = GM DU max in years 1 to 3; Year 4 is all UM
[0, 1, 2].forEach(i => near(RATES.umDU[i] + RATES.gmRideUM[i], RATES.gmDU[i], 'apportionment year ' + (i + 1)));
near(RATES.umDU[3], RATES.gmDU[3], 'apportionment year 4');
// The 3-year block splits the same GM share between the GM and the developing UM
[0, 1, 2].forEach(i => near(RATES.umRideUM[i] + RATES.gmRideBlockUM[i], RATES.gmRideUM[i], 'block year ' + (i + 1)));

// Renewals: 90% a year drops year-2 commission on year-1 sales by 10%
const r90 = project('agent', {...base, cases: 6, size: 3000, renewal: 0.9});
near(r90.years[1].total, 60480 + 60480 * 0.9, 'renewal 90%');

// Different sales each year: Year 2 pays Year 1 sales at 28% plus Year 2 sales at 28%
const up = project('agent', {...base, cases: [4, 8, 8, 8, 8, 8], size: [2000, 3000, 3000, 3000, 3000, 3000]});
near(up.years[0].total, 96000 * 0.28, 'yearly plan year 1');
near(up.years[1].total, 96000 * 0.28 + 288000 * 0.28, 'yearly plan year 2');
near(up.years[2].total, 96000 * 0.155 + 288000 * 0.28 + 288000 * 0.28, 'yearly plan year 3');
assert.strictEqual(up.years[1].sold, 288000);

// Same for leaders: Year 2 override mixes both years' group sales
const umUp = project('um', {...base, umDU: [500000, 800000, 800000, 800000, 800000, 800000]});
near(umUp.years[1].total, 500000 * 0.084 + 800000 * 0.084, 'um plan year 2');
const gmUp = project('gm', {...base, gmWG: [1000000, 2000000, 0, 0, 0, 0]});
near(totals(gmUp)[2], 2000000 * 0.03, 'gm spo plan year 3');

// A plan with the same value every year equals the single-number input
const flat = project('um', {...base, umDU: Array(6).fill(600000)});
const single = project('um', {...base, umDU: 600000});
near(flat.sixYearTotal, single.sixYearTotal, 'flat plan');

// UM and GM tabs show overriding only: personal sales add nothing
near(project('um', {...base, cases: 6, size: 3000, umDU: 600000}).years[0].total, 50400, 'um overriding only');
near(totals(project('gm', {...base, cases: 6, size: 3000, gmDU: 1000000}))[0], 140000, 'gm overriding only');

// GM benefits: AOM RM60,000 a year, plus RM40,000 for every full RM750,000 of whole group sales
const gmBenefit = (gmDU, gmUM, extra = {}) => project('gm', {...base, gmDU, gmUM, ...extra}).years[0].benefits;
near(gmBenefit(0, 0), 60000, 'aom alone');
near(gmBenefit(749999, 0), 60000, 'below first step');
near(gmBenefit(750000, 0), 100000, 'first step');
near(gmBenefit(1000000, 600000), 140000, 'default gm: 1.6m is 2 steps');
near(gmBenefit(1000000, 500000), 140000, '1.5m is 2 steps');
near(gmBenefit(1000000, 0, {gmBlock: 500000}), 140000, 'block counts in whole group');
near(gmBenefit(0, 0, {gmWG: 2000000}), 60000, 'daughter GM group not counted');
near(project('um', {...base, umDU: 3000000}).years[0].benefits, 0, 'no GM benefits for UM');
near(project('agent', {...base, cases: 6, size: 3000}).years[0].benefits, 0, 'no GM benefits for agent');

// Benefits follow each year's own sales, and renewals do not reduce them
const gmPlan = project('gm', {...base, gmDU: [500000, 1500000, 3000000, 0, 0, 0], renewal: 0.5});
[60000, 140000, 220000, 60000].forEach((v, i) => near(gmPlan.years[i].benefits, v, 'benefits year ' + (i + 1)));

// Deferred Benefits table in the sheet, RM1m new business, rows D57 to D86
const SHEET_DEFERRED = [11250,35437.5,72646.875,123529.2188,188768.1797,269081.5887,365223.1681,477984.3265,608196.0428,756730.845,924504.8872,1112480.132,1321666.638,1553124.97,1807968.719,2087367.155,2392548.012,2724800.413,3085477.933,3476001.83,3897864.422,4352632.643,4841951.775,5367549.364,5931239.332,6534926.298,7180610.113,7870390.619,8606472.65,9391171.282];
const def = deferred(1000000);
assert.strictEqual(def.length, 30);
SHEET_DEFERRED.forEach((v, i) => near(def[i].fund, v, 'deferred year ' + (i + 1)));
near(def[0].accumulated, 900000, 'accumulated year 1');
near(def[29].accumulated, 27000000, 'accumulated year 30');
near(deferred(500000)[29].fund, SHEET_DEFERRED[29] / 2, 'deferred scales with new business');
near(deferred(0)[29].fund, 0, 'deferred at zero');

// MAE video worked example: RM36,000 commission, RM3,000 case size, 20% closing, 70% P/O, 60% O/A
const m = mae({goal: 36000, size: 3000, closing: 0.2, presentRatio: 0.7, prospectRatio: 0.6});
near(m.anp, 128571.43, 'mae anp');
near(m.casesYear, 42.857, 'mae cases');
near(m.pYear, 214.286, 'mae presentations a year');
assert.deepStrictEqual([m.pMonth, m.pWeek, m.oWeek, m.aWeek], [18, 5, 7, 12], 'mae month and week');
const m0 = mae({goal: 0, size: 3000, closing: 0.2, presentRatio: 0.7, prospectRatio: 0.6});
assert.deepStrictEqual([m0.pMonth, m0.pWeek, m0.oWeek, m0.aWeek], [0, 0, 0, 0], 'mae zero goal');

console.log('All checks passed');
