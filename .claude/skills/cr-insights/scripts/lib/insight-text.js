// Shared by build-dashboard.js and insights.js: the rule that an insight gets its numbers only through {placeholders} of facts.json,
// and the freshness check of facts.json.
const fs = require('fs');
const path = require('path');
const { loadModel } = require('./model');
const { aggregate } = require('./aggregate');

const lookup = (facts, p) => p.split('.').reduce((o, k) => (o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined), facts);
const pathsOf = (text) => [...String(text).matchAll(/\{([^{}]+)\}/g)].map((m) => m[1].trim());

// Replaces the placeholders with the values of `facts` (or of a recorded { path: value } map when `recorded` is given).
// Errors: a placeholder that does not exist, or a bare number typed by hand. Identifiers stay allowed: PR references (#244) and names such as F3, O1, DB2.
function resolveText(text, facts, id, recorded) {
  const errors = [];
  const out = String(text).replace(/\{([^{}]+)\}/g, (m, p) => {
    const v = recorded ? recorded[p.trim()] : lookup(facts, p.trim());
    if (typeof v !== 'number' && typeof v !== 'string') {
      errors.push(`${id}: placeholder inválido {${p}}`);
      return '?';
    }
    return String(v);
  });
  const literal = String(text).replace(/\{[^{}]+\}/g, '').replace(/#\d+/g, '').replace(/\b[A-Za-z]+\d[A-Za-z0-9]*\b/g, '');
  if (/\d/.test(literal)) errors.push(`${id}: número digitado à mão (use {placeholder} de facts.json)`);
  return { text: out, errors };
}

// facts.json must describe the current data: recompute and compare the numbers. Throws with the message to show.
function loadFreshFacts(area) {
  const factsFile = path.join(area, 'reviews', '_index', 'facts.json');
  if (!fs.existsSync(factsFile)) throw new Error('facts.json not found. Run facts.js first.');
  const facts = JSON.parse(fs.readFileSync(factsFile, 'utf8'));
  const fresh = aggregate(loadModel(area).rows);
  if (JSON.stringify(fresh.totals) !== JSON.stringify(facts.totals) || JSON.stringify(fresh.byCategory) !== JSON.stringify(facts.byCategory)) {
    throw new Error('facts.json is stale (numbers differ from the current data). Run facts.js again.');
  }
  return facts;
}

module.exports = { lookup, pathsOf, resolveText, loadFreshFacts };
