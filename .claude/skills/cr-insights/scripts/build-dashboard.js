#!/usr/bin/env node
// Builds reviews/_index/dashboard.html: one self-contained file (data embedded, no network, no libraries).
// Usage: node build-dashboard.js [area-dir]
// Reads items.json/classification.json/relations.json through lib/model.js, recomputes the facts with the same aggregate()
// that the page inlines, and validates the optional insights.json (placeholders only, see SKILL.md).
const fs = require('fs');
const path = require('path');
const { loadModel } = require('./lib/model');
const { resolveText, loadFreshFacts } = require('./lib/insight-text');
const { navHtml } = require('./lib/nav');

const area = path.resolve(process.argv[2] || '.');
const indexDir = path.join(area, 'reviews', '_index');
const model = loadModel(area);
let facts;
try {
  facts = loadFreshFacts(area);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

// ---------- insights (optional) ----------
// Each insight is { id, text } where text may only get numbers through {path.to.fact} placeholders.
// A bare number typed by hand is rejected. Identifiers are allowed: PR references (#244) and alphanumeric names (F3, O1, DB2).
// insights.json is written by insights.js (the registry of insights); only insights validated against the current facts get here.
let insights = null;
let insightsNote = null;
const insFile = path.join(indexDir, 'insights.json');
if (fs.existsSync(insFile)) {
  const raw = JSON.parse(fs.readFileSync(insFile, 'utf8').replace(/^﻿/, ''));
  if (raw.factsHash !== facts.hash) {
    insightsNote = 'Insights desatualizados: os dados mudaram desde que foram escritos. Rode o modo insights de novo.';
  } else {
    const errors = [];
    insights = (raw.insights || []).map((ins) => {
      const r = resolveText(ins.text, facts, ins.id);
      errors.push(...r.errors);
      return r.text;
    });
    if (errors.length) {
      console.error('Insights inválidos, dashboard NÃO gerado:\n  ' + errors.join('\n  '));
      process.exit(1);
    }
    insightsNote = 'Cada frase usa só números do facts.json (hash ' + facts.hash + ').';
  }
}

const data = {
  rows: model.rows, prs: model.prs, relations: model.relations, sample: facts.sample,
  insights, insightsNote, generated: new Date().toISOString().slice(0, 16).replace('T', ' '),
};
const safeJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const tplDir = path.join(__dirname, 'lib');
const html = fs
  .readFileSync(path.join(tplDir, 'dashboard.template.html'), 'utf8')
  .replace('<!--__NAV__-->', () => navHtml('dashboard'))
  .replace('/*__DATA__*/', () => safeJson(data))
  .replace('/*__AGGREGATE__*/', () => fs.readFileSync(path.join(tplDir, 'aggregate.js'), 'utf8').replace(/<\/script/gi, '<\\/script'));
fs.writeFileSync(path.join(indexDir, 'dashboard.html'), html);
console.log(`Dashboard: ${path.join(indexDir, 'dashboard.html')} (${Math.round(html.length / 1024)} KB, ${model.rows.length} itens, insights ${insights ? insights.length : 'não gerados'}).`);
