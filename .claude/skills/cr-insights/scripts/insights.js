#!/usr/bin/env node
// Registry of insights: keeps every insight with its detail, its status and its history, so nothing is lost between generations.
// Stores reviews/_index/insights-registry.json; writes reviews/_index/insights.html and (for the dashboard) reviews/_index/insights.json.
// Usage: node insights.js <command> [--area <dir>]
//   show            one line per insight with its state
//   pending         insights to re-validate (the data changed since they were validated), with the values then and now, and a summary of facts.json
//   apply <file>    JSON array of operations written by the model (see below); validated, nothing is written if any operation is invalid
//   build           writes insights.html and insights.json (only insights validated against the current facts go to the dashboard)
// Operations: { "action": "add", "titulo", "text", "detalhe", "acaoSugerida"?, "nota"? }
//             { "action": "update", "id", "titulo"?, "text"?, "detalhe"?, "acaoSugerida"?, "nota"? }   (re-validates against the current facts)
//             { "action": "validate", "id", "nota"? }                                                  (still holds with the current facts, nothing else changes)
//             { "action": "retire", "id", "motivo" }                                                  (no longer makes sense; kept in the history)
// `text` gets its numbers only through {placeholders} of facts.json (same rule as the dashboard, lib/insight-text.js).
// State: vigente (validated against the current facts) | a-revalidar (facts changed since) | retirado.
const fs = require('fs');
const path = require('path');
const { resolveText, pathsOf, lookup, loadFreshFacts } = require('./lib/insight-text');
const { loadRedactor } = require('./lib/redact');
const { navHtml } = require('./lib/nav');

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : null;
};
const area = path.resolve(opt('--area') || '.');
const indexDir = path.join(area, 'reviews', '_index');
const regFile = path.join(indexDir, 'insights-registry.json');
const insFile = path.join(indexDir, 'insights.json');
const fail = (m) => {
  console.error(m);
  process.exit(1);
};
const readJson = (f, fb) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')) : fb);
const now = () => new Date().toISOString().slice(0, 16).replace('T', ' ');
if (!fs.existsSync(path.join(indexDir, 'items.json'))) fail('items.json not found. Run cr-common/scripts/ingest.js first.');
let facts;
try {
  facts = loadFreshFacts(area);
} catch (e) {
  fail(e.message);
}

const snapshot = (text) => Object.fromEntries(pathsOf(text).map((p) => [p, lookup(facts, p)]));
let reg = readJson(regFile, null);
if (!reg) {
  // first use: seed the registry from an existing insights.json so the earlier insights are not lost
  reg = { schemaVersion: 1, insights: [] };
  const old = readJson(insFile, null);
  if (old && Array.isArray(old.insights)) {
    for (const x of old.insights) {
      const same = old.factsHash === facts.hash;
      reg.insights.push({
        id: x.id, titulo: `Insight ${x.id}`, text: x.text, detalhe: '', acaoSugerida: '', status: 'vigente', criadoEm: now(), validadoEm: same ? now() : null,
        factsHashValidado: old.factsHash || null, valoresNaValidacao: same ? snapshot(x.text) : {},
        historico: [{ at: now(), evento: 'importado', nota: 'Importado de insights.json (sem título nem detalhe: peça ao Claude para detalhar).', factsHash: old.factsHash || null }],
      });
    }
  }
}
const stateOf = (x) => (x.status === 'retirado' ? 'retirado' : x.factsHashValidado === facts.hash ? 'vigente' : 'a-revalidar');
const save = () => fs.writeFileSync(regFile, JSON.stringify(reg, null, 2) + '\n');
const valuesTable = (x) => {
  const paths = Object.keys(x.valoresNaValidacao || {}).length ? Object.keys(x.valoresNaValidacao) : pathsOf(x.text);
  return paths.map((p) => ({ path: p, validacao: x.valoresNaValidacao && p in x.valoresNaValidacao ? x.valoresNaValidacao[p] : null, atual: lookup(facts, p) === undefined ? null : lookup(facts, p) }))
    .map((v) => ({ ...v, mudou: v.validacao !== null && v.atual !== null && String(v.validacao) !== String(v.atual) }));
};

function show() {
  const c = { vigente: 0, 'a-revalidar': 0, retirado: 0 };
  for (const x of reg.insights) {
    c[stateOf(x)]++;
    console.log(`${x.id}\t${stateOf(x)}\t${x.titulo}`);
  }
  console.log(`Vigentes ${c.vigente} | a revalidar ${c['a-revalidar']} | retirados ${c.retirado} (hash dos fatos ${facts.hash})`);
}

function pending() {
  const todo = reg.insights.filter((x) => stateOf(x) === 'a-revalidar');
  console.log(`${todo.length} insight(s) a revalidar (hash atual dos fatos: ${facts.hash}).\n`);
  for (const x of todo) {
    console.log(`[${x.id}] ${x.titulo}\n    Frase: ${x.text}\n    Detalhe: ${x.detalhe || '(sem detalhe)'}\n    Validado em: ${x.validadoEm || 'nunca'} (hash ${x.factsHashValidado || '-'})`);
    for (const v of valuesTable(x)) console.log(`    ${v.path}: validação ${v.validacao === null ? '-' : v.validacao} → agora ${v.atual === null ? '(inexistente)' : v.atual}${v.mudou ? '  MUDOU' : ''}`);
    console.log('');
  }
  console.log('Resumo de facts.json para decidir (keep = validate, ajustar = update, deixou de fazer sentido = retire):');
  console.log(JSON.stringify({ totals: facts.totals, byCategory: facts.byCategory, relations: facts.relations, sample: facts.sample }, null, 1));
}

function apply() {
  const file = argv[1];
  if (!file || !fs.existsSync(file)) fail('Usage: insights.js apply <file.json>');
  const ops = readJson(file, null);
  if (!Array.isArray(ops)) fail('O arquivo precisa ser um array de operações.');
  const errors = [];
  const nextId = (list) => 'i' + (Math.max(0, ...list.map((x) => Number((x.id.match(/\d+/) || [0])[0]))) + 1);
  const work = JSON.parse(JSON.stringify(reg));
  const get = (id, label) => {
    const x = work.insights.find((y) => y.id === id);
    if (!x) errors.push(`${label}: insight "${id}" não existe`);
    else if (x.status === 'retirado') errors.push(`${label}: insight "${id}" está retirado (crie outro com add)`);
    return x && x.status !== 'retirado' ? x : null;
  };
  const check = (id, text) => {
    const r = resolveText(text, facts, id);
    errors.push(...r.errors);
  };
  const req = (o, fields, label) => fields.forEach((f) => (typeof o[f] !== 'string' || !o[f].trim()) && errors.push(`${label}: campo "${f}" vazio`));
  ops.forEach((o, n) => {
    const label = `#${n + 1} ${o.action || '?'}${o.id ? ' ' + o.id : ''}`;
    if (o.action === 'add') {
      req(o, ['titulo', 'text', 'detalhe'], label);
      if (o.id && work.insights.some((y) => y.id === o.id)) errors.push(`${label}: id já existe`);
      const idFinal = o.id || nextId(work.insights);
      if (typeof o.text === 'string') check(idFinal, o.text);
      work.insights.push({
        id: idFinal, titulo: o.titulo, text: o.text, detalhe: o.detalhe, acaoSugerida: o.acaoSugerida || '', status: 'vigente', criadoEm: now(), validadoEm: now(),
        factsHashValidado: facts.hash, valoresNaValidacao: typeof o.text === 'string' ? snapshot(o.text) : {},
        historico: [{ at: now(), evento: 'criado', nota: o.nota || '', factsHash: facts.hash }],
      });
    } else if (o.action === 'update' || o.action === 'validate') {
      const x = get(o.id, label);
      if (!x) return;
      if (o.action === 'update') {
        for (const f of ['titulo', 'text', 'detalhe', 'acaoSugerida']) if (typeof o[f] === 'string') x[f] = o[f];
        if (!o.titulo && !o.text && !o.detalhe && o.acaoSugerida === undefined) errors.push(`${label}: nada a atualizar`);
      }
      check(x.id, x.text);
      x.validadoEm = now();
      x.factsHashValidado = facts.hash;
      x.valoresNaValidacao = snapshot(x.text);
      x.historico.push({ at: now(), evento: o.action === 'update' ? 'atualizado' : 'revalidado', nota: o.nota || '', factsHash: facts.hash });
    } else if (o.action === 'retire') {
      const x = get(o.id, label);
      if (!x) return;
      req(o, ['motivo'], label);
      x.status = 'retirado';
      x.retiradoEm = now();
      x.motivoRetirada = o.motivo;
      x.historico.push({ at: now(), evento: 'retirado', nota: o.motivo, factsHash: facts.hash });
    } else errors.push(`${label}: action inválida (use add, update, validate ou retire)`);
  });
  if (errors.length) fail(`Nada gravado. Erros:\n  ${errors.join('\n  ')}`);
  reg = work;
  save();
  console.log(`${ops.length} operação(ões) gravada(s). Vigentes ${reg.insights.filter((x) => stateOf(x) === 'vigente').length}, a revalidar ${reg.insights.filter((x) => stateOf(x) === 'a-revalidar').length}.`);
}

function build() {
  save();
  const items = readJson(path.join(indexDir, 'items.json'), { prs: [] });
  const red = loadRedactor(area, items.prs);
  const cards = reg.insights.map((x) => {
    const estado = stateOf(x);
    // a vigente insight shows the current numbers; an old or retired one shows what it said when it was validated
    const r = resolveText(x.text, facts, x.id, estado === 'vigente' ? null : x.valoresNaValidacao);
    return {
      id: x.id, titulo: red.text(x.titulo), estado, frase: red.text(r.text), erros: r.errors, detalhe: red.text(x.detalhe), acao: red.text(x.acaoSugerida),
      criadoEm: x.criadoEm, validadoEm: x.validadoEm, retiradoEm: x.retiradoEm || null, motivoRetirada: red.text(x.motivoRetirada || ''),
      valores: valuesTable(x), historico: x.historico.map((h) => ({ at: h.at, evento: h.evento, nota: red.text(h.nota || '') })),
    };
  });
  // the dashboard only gets insights validated against the current facts
  const vigentes = reg.insights.filter((x) => stateOf(x) === 'vigente');
  fs.writeFileSync(insFile, JSON.stringify({ factsHash: facts.hash, insights: vigentes.map((x) => ({ id: x.id, text: x.text })) }, null, 2) + '\n');
  const data = { geradoEm: now(), hashFatos: facts.hash, insights: cards };
  const safeJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const html = fs.readFileSync(path.join(__dirname, 'lib', 'insights.template.html'), 'utf8').replace('<!--__NAV__-->', () => navHtml('insights')).replace('/*__DATA__*/', () => safeJson(data));
  const out = path.join(indexDir, 'insights.html');
  fs.writeFileSync(out, html);
  const c = (s) => cards.filter((x) => x.estado === s).length;
  console.log(`Insights: ${out} (${Math.round(html.length / 1024)} KB) vigentes ${c('vigente')} | a revalidar ${c('a-revalidar')} | retirados ${c('retirado')}. insights.json recebeu só os vigentes (${vigentes.length}).`);
  if (c('a-revalidar')) console.log(`Atenção: ${c('a-revalidar')} insight(s) precisam de revalidação (rode "pending" e "apply"). O dashboard não os mostra até lá.`);
}

const commands = { show, pending, apply, build };
if (!commands[cmd]) fail('Usage: node insights.js <show|pending|apply|build> [--area <dir>]');
commands[cmd]();
