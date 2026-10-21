#!/usr/bin/env node
// Computes every number of the dashboard into reviews/_index/facts.json (no model involved).
// Usage: node facts.js [area-dir]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadModel } = require('./lib/model');
const { aggregate } = require('./lib/aggregate');

const area = path.resolve(process.argv[2] || '.');
const model = loadModel(area);
const agg = aggregate(model.rows);

const sameGroups = model.relations.filter((r) => r.type === 'same-cause' && (!r.verdict || r.verdict === 'same'));
const facts = {
  schemaVersion: 1,
  ...agg,
  relations: {
    confirmed: model.relations.length,
    sameCause: sameGroups.length,
    related: model.relations.filter((r) => r.type === 'same-cause' && r.verdict === 'related').length,
    jiraSame: model.relations.filter((r) => r.type === 'jira-same').length,
    prMention: model.relations.filter((r) => r.type === 'pr-mention').length,
  },
  sample: {
    prs: agg.totals.prs,
    minPrsForTrends: model.settings.minPrsForTrends,
    trendsVisible: agg.totals.prs >= model.settings.minPrsForTrends,
    people: model.people,
    minPeopleForPersonViews: model.settings.minPeopleForPersonViews,
    peopleVisible: model.people >= model.settings.minPeopleForPersonViews,
  },
};
const body = JSON.stringify(facts, null, 2) + '\n';
facts.hash = crypto.createHash('sha1').update(body).digest('hex').slice(0, 12);
const outDir = path.join(area, 'reviews', '_index');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'facts.json'), JSON.stringify(facts, null, 2) + '\n');
console.log(`Facts: ${agg.totals.prs} PR(s), ${agg.totals.items} item(ns), criticalHigh ${agg.totals.criticalHigh}, pendingDecisions ${agg.totals.pendingDecisions}, relations ${facts.relations.confirmed}, hash ${facts.hash}`);
console.log(`Amostra: tendências ${facts.sample.trendsVisible ? 'visíveis' : `ocultas (< ${facts.sample.minPrsForTrends} PRs)`}; pessoas ${facts.sample.peopleVisible ? 'visíveis' : `ocultas (${facts.sample.people} < ${facts.sample.minPeopleForPersonViews})`}.`);
