#!/usr/bin/env node
// Category of each finding/observation (latest round of every PR). Stores reviews/_index/classification.json.
// Usage: node classify.js <command> [--area <dir>] [--limit N] [--full]
//   pending           items that need a category (new, changed text, or hit by a taxonomy change); prints them for the model
//   apply <file>      JSON array [{ "key", "category", "secondary"?, "reason"? }] written by the model; validated against taxonomy.json
//   show              counts per category and what is still unclassified
//   taxonomy          prints the category ids with their descriptions
// Incremental: an item is pending only when it has no category, its content changed, or its category was affected by a newer taxonomy version.
// An item whose text is unchanged since an earlier round of the same PR inherits that category (no model call).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : null;
};
const area = path.resolve(opt('--area') || '.');
const indexDir = path.join(area, 'reviews', '_index');
const itemsFile = path.join(indexDir, 'items.json');
const clsFile = path.join(indexDir, 'classification.json');
const fail = (m) => {
  console.error(m);
  process.exit(1);
};
if (!fs.existsSync(itemsFile)) fail('items.json not found. Run cr-common/scripts/ingest.js first.');
const tax = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'taxonomy.json'), 'utf8'));
const catIds = new Set(tax.categories.map((c) => c.id));
const data = JSON.parse(fs.readFileSync(itemsFile, 'utf8'));
const store = fs.existsSync(clsFile) ? JSON.parse(fs.readFileSync(clsFile, 'utf8')) : { schemaVersion: 1, items: {} };
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const now = () => new Date().toISOString().slice(0, 16).replace('T', ' ');
const latest = data.items.filter((i) => data.prs.some((p) => p.pr === i.pr && p.latestRound === i.round));
const contentHash = (i) => sha(JSON.stringify([i.scope, i.severity, i.title || i.text, i.onde || '']));
const affectedSince = (v) => new Set(tax.history.filter((h) => h.version > v).flatMap((h) => h.affectedCategories));

function needs(i) {
  const e = store.items[i.key];
  if (!e) return true;
  if (e.contentHash !== contentHash(i)) return true;
  if (e.taxonomyVersion < tax.version) return e.category === 'outro' || affectedSince(e.taxonomyVersion).has(e.category);
  return false;
}

function inherit() {
  let n = 0;
  for (const i of latest) {
    if (store.items[i.key] && store.items[i.key].contentHash === contentHash(i)) continue;
    const prev = Object.entries(store.items).find(([k, e]) => k.startsWith(`${i.pr}/`) && k.endsWith(`/${i.id}`) && e.contentHash === contentHash(i) && e.taxonomyVersion === tax.version);
    if (prev) {
      store.items[i.key] = { ...prev[1], inheritedFrom: prev[0], at: now() };
      n++;
    }
  }
  return n;
}

function pending() {
  const inherited = inherit();
  const todo = latest.filter(needs);
  const limit = Number(opt('--limit')) || 20;
  if (inherited) fs.writeFileSync(clsFile, JSON.stringify(store, null, 2) + '\n');
  console.log(`Taxonomia v${tax.version}: ${[...catIds].join(' | ')}`);
  console.log(`${inherited} herdado(s) de rodadas anteriores; ${todo.length} pendente(s)${todo.length > limit ? `, mostrando ${limit}` : ''}.\n`);
  for (const i of todo.slice(0, limit)) {
    const body = i.scope === 'pr' ? `${i.title}\n    Onde: ${i.onde}` : i.text;
    console.log(`[${i.key}] ${i.severity} · ${i.scope === 'pr' ? `${i.tipo}` : 'fora do escopo'} · camadas ${i.layers.join(',') || '-'}\n    ${body}\n`);
  }
}

function apply() {
  const file = argv[1];
  if (!file || !fs.existsSync(file)) fail('Usage: classify.js apply <file.json>');
  const rows = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const byKey = Object.fromEntries(latest.map((i) => [i.key, i]));
  const errors = [];
  for (const r of rows) {
    if (!byKey[r.key]) errors.push(`${r.key}: item desconhecido`);
    else if (!catIds.has(r.category)) errors.push(`${r.key}: categoria inválida "${r.category}"`);
    else if (r.secondary && (!catIds.has(r.secondary) || r.secondary === r.category || r.secondary === 'outro')) errors.push(`${r.key}: secundária inválida "${r.secondary}"`);
    else if (r.category === 'outro' && !r.reason) errors.push(`${r.key}: 'outro' exige reason`);
  }
  if (errors.length) fail(`Nada gravado. Erros:\n  ${errors.join('\n  ')}`);
  for (const r of rows) {
    store.items[r.key] = { category: r.category, secondary: r.secondary || null, reason: r.reason || null, contentHash: contentHash(byKey[r.key]), taxonomyVersion: tax.version, by: 'model', at: now() };
  }
  store.taxonomyVersion = tax.version;
  fs.writeFileSync(clsFile, JSON.stringify(store, null, 2) + '\n');
  console.log(`${rows.length} item(ns) classificado(s). Ainda pendentes: ${latest.filter(needs).length}.`);
}

function show() {
  const counts = {};
  let un = 0;
  for (const i of latest) {
    const e = store.items[i.key];
    if (!e) un++;
    else counts[e.category] = (counts[e.category] || 0) + 1;
  }
  for (const [c, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(3)}  ${c}`);
  console.log(`Sem categoria: ${un} de ${latest.length}. Pendentes (inclui alterados): ${latest.filter(needs).length}.`);
}

function taxonomy() {
  for (const c of tax.categories) console.log(`${c.id}\t${c.description}`);
}

const commands = { pending, apply, show, taxonomy };
if (!commands[cmd]) fail('Usage: node classify.js <pending|apply|show|taxonomy> [--area <dir>]');
commands[cmd]();
