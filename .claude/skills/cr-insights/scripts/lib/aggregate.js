// Single source of truth for every number of the dashboard and of facts.json.
// Pure function, no dependencies: facts.js calls it in Node, and build-dashboard.js inlines this very file into the HTML,
// so the filtered view in the browser and facts.json can never disagree.
// rows: [{ pr, service, jira, base, scope: 'pr'|'fora', severity, tipo, status, category, layers: [] , key }]
function aggregate(rows) {
  var SEV = ['critical', 'high', 'medium', 'low'];
  var out = {
    totals: { prs: 0, items: 0, findings: 0, observations: 0, critical: 0, high: 0, medium: 0, low: 0, criticalHigh: 0, criticalHighOutOfScope: 0, openFindings: 0, pendingDecisions: 0, unclassified: 0 },
    bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
    byCategory: {}, byLayer: {}, byService: {}, byRelease: {}, byJira: {}, byStatus: {},
    sevByService: {}, catBySev: {},
    pending: [], criticalHigh: [],
  };
  var prs = {};
  var bump = function (o, k, n) { o[k] = (o[k] || 0) + (n === undefined ? 1 : n); };
  rows.forEach(function (r) {
    var t = out.totals;
    prs[r.pr] = true;
    t.items++;
    if (r.scope === 'pr') t.findings++; else t.observations++;
    if (SEV.indexOf(r.severity) >= 0) { t[r.severity]++; out.bySeverity[r.severity]++; }
    if (r.severity === 'critical' || r.severity === 'high') { t.criticalHigh++; out.criticalHigh.push(r.key); if (r.scope === 'fora') t.criticalHighOutOfScope++; }
    var open = r.scope === 'pr' && (r.status === 'Aberto' || r.status === 'Mantido');
    if (open) t.openFindings++;
    if (open && (r.tipo === 'decisão' || r.tipo === 'maybe-false')) { t.pendingDecisions++; out.pending.push(r.key); }
    var cat = r.category || 'sem-categoria';
    if (!r.category) t.unclassified++;
    bump(out.byCategory, cat);
    (r.layers.length ? r.layers : ['indefinida']).forEach(function (l) { bump(out.byLayer, l); });
    bump(out.byService, r.service);
    if (r.base) bump(out.byRelease, r.base);
    if (r.jira) bump(out.byJira, r.jira);
    bump(out.byStatus, (r.scope === 'pr' ? 'achado' : 'observação') + ' · ' + (r.status || 'sem status'));
    out.sevByService[r.service] = out.sevByService[r.service] || { critical: 0, high: 0, medium: 0, low: 0 };
    if (SEV.indexOf(r.severity) >= 0) out.sevByService[r.service][r.severity]++;
    out.catBySev[cat] = out.catBySev[cat] || { critical: 0, high: 0, medium: 0, low: 0 };
    if (SEV.indexOf(r.severity) >= 0) out.catBySev[cat][r.severity]++;
  });
  out.totals.prs = Object.keys(prs).length;
  return out;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { aggregate: aggregate };
