#!/usr/bin/env node
// Everything the reviews found and nobody corrected (dentro ou fora do escopo), as a shareable HTML of potential tickets.
// Stores the model's analysis in reviews/_index/pendencias.json; writes reviews/_index/pendencias-tickets.html.
// Usage: node pendencias.js <command> [--area <dir>] [--limit N]
//   pending         items without analysis (new, or whose text/outcome changed); prints them for the model
//   apply <file>    JSON array written by the model (fields below); validated, nothing is written if any row is invalid
//   show            counts: analysed, stale, pending
//   build           writes pendencias-tickets.html (items still without analysis appear as "Aguardando análise")
// Fields per item: key, issueType, resumo, detalhe, impacto, evidencia, evidenciaNota, justificativaAbrir[], justificativaNaoAbrir[],
//   recomendacao, recomendacaoMotivo, acaoSugerida, quemDecide, pendencias?  (extra fields are ignored; `situacao` is derived, not typed)
// The HTML embeds observation text, so every text goes through lib/redact.js (see there and SKILL.md). It is a filter, not a guarantee.
const fs = require('fs');
const path = require('path');
const { loadPending } = require('./lib/pending-model');
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
const storeFile = path.join(indexDir, 'pendencias.json');
const fail = (m) => {
  console.error(m);
  process.exit(1);
};
if (!fs.existsSync(path.join(indexDir, 'items.json'))) fail('items.json not found. Run cr-common/scripts/ingest.js first.');

const ISSUE = ['vulnerabilidade', 'correcao-necessaria', 'debito-tecnico', 'ma-pratica', 'decisao-de-negocio'];
const EVID = ['fato-verificado', 'hipotese', 'misto'];
const REC = ['abrir', 'abrir-agrupado', 'decidir-com-PO', 'monitorar', 'nao-abrir'];
const TEXT = ['resumo', 'detalhe', 'impacto', 'evidenciaNota', 'recomendacaoMotivo', 'acaoSugerida', 'quemDecide'];
const now = () => new Date().toISOString().slice(0, 16).replace('T', ' ');
const m = loadPending(area);
const store = fs.existsSync(storeFile) ? JSON.parse(fs.readFileSync(storeFile, 'utf8').replace(/^﻿/, '')) : { schemaVersion: 1, items: {} };
const stateOf = (i) => (!store.items[i.key] ? 'pendente' : store.items[i.key].contentHash !== i.contentHash ? 'desatualizada' : 'ok');

function pending() {
  const todo = m.items.filter((i) => stateOf(i) !== 'ok');
  const limit = Number(opt('--limit')) || 20;
  console.log(`Tipos: ${ISSUE.join(' | ')}\nEvidência: ${EVID.join(' | ')}\nRecomendação: ${REC.join(' | ')}`);
  console.log(`${todo.length} pendente(s)${todo.length > limit ? `, mostrando ${limit}` : ''} de ${m.items.length} não corrigidos.\n`);
  for (const i of todo.slice(0, limit)) {
    console.log(`[${i.key}] ${i.severity} · ${i.escopo}${i.tipoRevisao && i.escopo !== 'fora do escopo' ? ` · ${i.tipoRevisao}` : ''} · situação ${i.situacao} · ${i.estadoPR} · ${stateOf(i) === 'desatualizada' ? 'REVISAR (texto mudou) · ' : ''}${i.jira}`);
    if (i.titulo) console.log(`    ${i.titulo}`);
    for (const [k, v] of Object.entries(i.campos)) console.log(`    ${k}: ${v}`);
    if (i.desfecho) console.log(`    Depois da aprovação: ${i.desfecho}${i.evidenciaDesfecho ? ` | ${i.evidenciaDesfecho}` : ''}`);
    if (i.decisaoUsuario) console.log(`    Decisão do usuário: ${i.decisaoUsuario}`);
    console.log('');
  }
}

function apply() {
  const file = argv[1];
  if (!file || !fs.existsSync(file)) fail('Usage: pendencias.js apply <file.json>');
  const rows = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const byKey = Object.fromEntries(m.items.map((i) => [i.key, i]));
  const byShort = Object.fromEntries(m.items.map((i) => [i.key.replace(/\/r\d+\//, '/'), i]));
  const errors = [];
  const resolved = rows.map((r) => {
    const it = byKey[r.key] || byShort[r.key];
    const bad = (msg) => errors.push(`${r.key}: ${msg}`);
    if (!it) bad('item desconhecido (ou já corrigido)');
    if (!ISSUE.includes(r.issueType)) bad(`issueType inválido "${r.issueType}"`);
    if (!EVID.includes(r.evidencia)) bad(`evidencia inválida "${r.evidencia}"`);
    if (!REC.includes(r.recomendacao)) bad(`recomendacao inválida "${r.recomendacao}"`);
    for (const f of TEXT) if (typeof r[f] !== 'string' || !r[f].trim()) bad(`campo "${f}" vazio`);
    for (const f of ['justificativaAbrir', 'justificativaNaoAbrir']) if (!Array.isArray(r[f]) || !r[f].length || r[f].some((x) => typeof x !== 'string' || !x.trim())) bad(`"${f}" precisa de ao menos 1 texto`);
    return it;
  });
  if (errors.length) fail(`Nada gravado. Erros:\n  ${errors.join('\n  ')}`);
  rows.forEach((r, n) => {
    const it = resolved[n];
    store.items[it.key] = {
      issueType: r.issueType, resumo: r.resumo, detalhe: r.detalhe, impacto: r.impacto, evidencia: r.evidencia, evidenciaNota: r.evidenciaNota,
      justificativaAbrir: r.justificativaAbrir, justificativaNaoAbrir: r.justificativaNaoAbrir, recomendacao: r.recomendacao, recomendacaoMotivo: r.recomendacaoMotivo,
      acaoSugerida: r.acaoSugerida, quemDecide: r.quemDecide, pendencias: r.pendencias || '', contentHash: it.contentHash, by: 'model', at: now(),
    };
  });
  fs.writeFileSync(storeFile, JSON.stringify(store, null, 2) + '\n');
  console.log(`${rows.length} item(ns) gravado(s). Ainda sem análise: ${m.items.filter((i) => !store.items[i.key] || store.items[i.key].contentHash !== i.contentHash).length}.`);
}

function show() {
  const c = { ok: 0, desatualizada: 0, pendente: 0 };
  for (const i of m.items) c[stateOf(i)]++;
  console.log(`Não corrigidos: ${m.items.length} | analisados ${c.ok} | desatualizados ${c.desatualizada} | pendentes ${c.pendente}`);
}

function build() {
  const red = loadRedactor(area, m.prs);
  const fallbackTitle = (i) => {
    const b = red.text(i.titulo || i.campos['Observação'] || '');
    return b.length > 220 ? b.slice(0, 217) + '…' : b;
  };
  const itens = m.items.map((i) => {
    const st = stateOf(i), e = store.items[i.key] || {};
    const orig = {};
    for (const [k, v] of Object.entries(i.campos)) orig[k] = red.text(v);
    return {
      key: i.key, sev: i.severity, id: i.id, escopo: i.escopo, tipoRevisao: i.tipoRevisao, titulo: red.text(i.titulo), origem: i.origem, repo: i.repo, jira: i.jira,
      estadoPR: i.estadoPR, rodada: i.round, fonte: i.fonte, categoria: i.categoria, secundaria: i.secundaria, grupo: i.grupo, statusRevisao: i.status,
      desfecho: red.text(i.desfecho), evidenciaDesfecho: red.text(i.evidenciaDesfecho), decisaoUsuario: red.text(i.decisaoUsuario), veredictoPR: red.text(i.veredito),
      originais: orig, analise: st, situacao: i.situacao,
      issueType: e.issueType || 'nao-analisado', resumo: e.resumo ? red.text(e.resumo) : fallbackTitle(i), detalhe: red.text(e.detalhe), impacto: red.text(e.impacto),
      evidencia: e.evidencia || 'nao-analisado', evidenciaNota: red.text(e.evidenciaNota), abrir: red.list(e.justificativaAbrir), naoAbrir: red.list(e.justificativaNaoAbrir),
      recomendacao: e.recomendacao || 'nao-analisado', recomendacaoMotivo: red.text(e.recomendacaoMotivo), acao: red.text(e.acaoSugerida), quemDecide: red.text(e.quemDecide), pendencias: red.text(e.pendencias),
    };
  });
  const data = { geradoEm: now(), total: itens.length, grupos: m.groups.map((g) => ({ id: g.id, membros: g.membros })), itens };
  const safeJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const html = fs.readFileSync(path.join(__dirname, 'lib', 'pendencias.template.html'), 'utf8').replace('<!--__NAV__-->', () => navHtml('pendencias')).replace('/*__DATA__*/', () => safeJson(data));
  const out = path.join(indexDir, 'pendencias-tickets.html');
  fs.writeFileSync(out, html);
  const waiting = itens.filter((i) => i.analise !== 'ok').length;
  console.log(`Pendências: ${out} (${Math.round(html.length / 1024)} KB, ${itens.length} itens, ${waiting} sem análise atual, ${m.groups.length} agrupamento(s)).`);
  console.log(`Omissões: ${Object.entries(red.counts).map(([k, v]) => `${k} ${v}`).join(', ') || 'nenhuma'}. O HTML embute texto das revisões: revise antes de compartilhar.`);
  if (waiting) console.log(`Atenção: ${waiting} item(ns) aparecem como "Aguardando análise". Rode "pending" e "apply".`);
}

const commands = { pending, apply, show, build };
if (!commands[cmd]) fail('Usage: node pendencias.js <pending|apply|show|build> [--area <dir>]');
commands[cmd]();
