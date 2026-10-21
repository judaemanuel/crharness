// Loads the area's derived data into the flat model shared by facts.js and build-dashboard.js.
const fs = require('fs');
const path = require('path');

const readJson = (f, fallback) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')) : fallback);
const stripRepo = (r) => r.replace(/^pob-(policy-|saa-)?/, '');
const person = (n) => (n ? n.split(' - ')[0].trim() : null);

function loadModel(area) {
  const indexDir = path.join(area, 'reviews', '_index');
  const data = readJson(path.join(indexDir, 'items.json'), null);
  if (!data) throw new Error('items.json not found. Run cr-common/scripts/ingest.js first.');
  const cls = readJson(path.join(indexDir, 'classification.json'), { items: {} }).items;
  const rel = readJson(path.join(indexDir, 'relations.json'), { relations: [] }).relations;
  const cfg = readJson(path.join(indexDir, 'config.json'), {});
  const settings = { minPrsForTrends: 10, minPeopleForPersonViews: 3, ...(cfg.insights || {}) };

  const repoNames = [...new Set(data.prs.map((p) => p.repo))];
  const service = Object.fromEntries(repoNames.map((r) => [r, repoNames.filter((x) => stripRepo(x) === stripRepo(r)).length > 1 ? r : stripRepo(r)]));
  const prByName = Object.fromEntries(data.prs.map((p) => [p.pr, p]));
  const prNum = (p) => p.pr.match(/-PR(\d+)$/)[1];
  const prBase = (p) => path.join(area, 'reviews', p.archived ? '_archive' : '', p.pr);
  const created = {};
  for (const p of data.prs) {
    const info = readJson(path.join(prBase(p), 'pr-info.json'), null);
    created[p.pr] = info && info.pr.createdAt ? info.pr.createdAt.slice(0, 10) : null;
  }

  const rows = data.items
    .filter((i) => prByName[i.pr] && prByName[i.pr].latestRound === i.round)
    .map((i) => {
      const p = prByName[i.pr];
      const c = cls[i.key] || {};
      return {
        key: `${i.pr}/${i.id}`, id: i.id, pr: `${service[p.repo]} #${prNum(p)}`, prName: i.pr, service: service[p.repo], jira: i.jira, base: i.base,
        scope: i.scope, severity: i.severity, tipo: i.tipo, status: i.status, category: c.category || null, secondary: c.secondary || null,
        layers: i.layers || [], title: i.scope === 'pr' ? i.title : null, prCreated: created[i.pr], owner: p.owner || null, executor: p.executor || null,
      };
    });
  const prsOut = data.prs.map((p) => ({ pr: `${service[p.repo]} #${prNum(p)}`, prName: p.pr, service: service[p.repo], jira: p.jira, base: p.base, created: created[p.pr], owner: p.owner || null, executor: p.executor || null, publicado: p.publicado }));
  const labelOf = (name) => (prByName[name] ? `${service[prByName[name].repo]} #${prNum(prByName[name])}` : name);
  const relations = rel
    .filter((r) => r.status === 'confirmado')
    .map((r) => ({
      id: r.id, type: r.type, verdict: r.judgment ? r.judgment.verdict : null,
      fromPr: r.from.startsWith('jira:') ? null : labelOf(r.from.split('/')[0]), toPr: r.to.startsWith('jira:') ? null : labelOf(r.to.split('/')[0]),
      fromJira: r.from.startsWith('jira:') ? r.from.slice(5) : null, toJira: r.to.startsWith('jira:') ? r.to.slice(5) : null,
      fromKey: r.from, toKey: r.to,
    }));
  const people = [...new Set(data.prs.flatMap((p) => [p.owner, p.executor]).filter(Boolean))];
  return { rows, prs: prsOut, relations, settings, people: people.length, cfg };
}

module.exports = { loadModel };
