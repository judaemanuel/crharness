#!/usr/bin/env node
// Builds reviews/_index/fora-do-escopo.html: every out-of-scope observation of the area (latest round of each PR), self-contained, no model.
// Usage: node oos-report.js [area-dir]
// Unlike dashboard.html, this file DOES embed the observation text, so every text goes through lib/redact.js first
// (area terms in reviews/_index/config.json, people from pr-info.json, CPF/JWT/e-mail/"senha=valor"). Keep it local or review before sharing.
const fs = require('fs');
const path = require('path');
const { loadPending } = require('./lib/pending-model');
const { loadRedactor } = require('./lib/redact');
const { navHtml } = require('./lib/nav');

const area = path.resolve(process.argv[2] || '.');
const indexDir = path.join(area, 'reviews', '_index');
const m = loadPending(area);
const red = loadRedactor(area, m.prs);
const relFile = path.join(indexDir, 'relations.json');
const rel = fs.existsSync(relFile) ? JSON.parse(fs.readFileSync(relFile, 'utf8').replace(/^﻿/, '')).relations || [] : [];
const short = (r) => r.replace(/^pob-/, '');
const prRepo = Object.fromEntries(m.prs.map((p) => [p.pr, p.repo]));
const fmt = (k) => {
  const x = k.match(/^(.*-PR(\d+))\/(\w+)$/);
  return x ? `${short(prRepo[x[1]] || x[1])} #${x[2]} ${x[3]}` : k;
};
const nb = {};
for (const r of rel) {
  if (r.type !== 'same-cause' || r.status !== 'confirmado') continue;
  (nb[r.from] = nb[r.from] || []).push(fmt(r.to));
  (nb[r.to] = nb[r.to] || []).push(fmt(r.from));
}

const itens = m.all
  .filter((i) => i.escopo === 'fora do escopo')
  .map((i) => ({
    sev: i.severity, id: i.id, origem: i.origem, repo: i.repo, jira: i.jira, rodada: i.round, arquivado: i.archived, status: i.status,
    categoria: i.categoria, camadas: i.layers, texto: red.text(i.campos['Observação']), desfecho: red.text(i.desfecho),
    fonte: i.fonte, relacionados: nb[`${i.pr}/${i.id}`] || [],
  }));
const data = { geradoEm: new Date().toISOString().slice(0, 16).replace('T', ' '), total: itens.length, itens };
const safeJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const html = fs.readFileSync(path.join(__dirname, 'lib', 'oos.template.html'), 'utf8').replace('<!--__NAV__-->', () => navHtml('oos')).replace('/*__DATA__*/', () => safeJson(data));
const out = path.join(indexDir, 'fora-do-escopo.html');
fs.writeFileSync(out, html);
const by = itens.reduce((a, o) => ((a[o.sev] = (a[o.sev] || 0) + 1), a), {});
console.log(`Fora do escopo: ${out} (${Math.round(html.length / 1024)} KB, ${itens.length} observações) ${JSON.stringify(by)}`);
console.log(`Omissões: ${Object.entries(red.counts).map(([k, v]) => `${k} ${v}`).join(', ') || 'nenhuma'}. O HTML embute o texto das observações: revise antes de compartilhar.`);
