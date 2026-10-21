// Items that were found by the reviews and are NOT corrected (dentro ou fora do escopo), with what is known about their outcome.
// Shared by oos-report.js and pendencias.js. Deterministic: no model, no network.
//
// Sources: items.json (latest round of every PR), classification.json, relations.json,
//   <pr>/pr-info.json (state of the PR as of the last fetch) and, when it exists, <pr>/pos-aprovacao.md
//   (what happened after the approval; tables whose first cell starts with F<n>/O<n>, columns "Desfecho", "Evidência", "Decisão do usuário").
// "Corrected" = the outcome starts with Corrigido / Obsoleto / Resolvido, or the item status is Resolvido. Those are left out.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const readJson = (f, fallback) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')) : fallback);
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const FIXED = /^\W*(corrigid|obsolet|resolvid)/i;
const splitRow = (l) => l.replace(/^\|/, '').replace(/\|\s*$/, '').split(/(?<!\\)\|/).map((s) => s.trim());
const plain = (s) => String(s || '').replace(/\*/g, '').trim();

// { F1: { desfecho, evidencia, decisaoUsuario }, O1: {...} } from a pos-aprovacao.md
function readOutcomes(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  let hdr = null;
  for (const l of fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    if (!l.startsWith('|')) {
      hdr = null;
      continue;
    }
    const c = splitRow(l);
    if (/^[-\s:]+$/.test(c[0])) continue;
    if (/^(ID|Item)\b/i.test(c[0])) {
      hdr = c.map((x) => x.toLowerCase());
      continue;
    }
    const m = c[0].match(/^([FO]\d+)\b/);
    if (!m || !hdr) continue;
    const col = (name) => {
      const i = hdr.findIndex((h) => h.startsWith(name));
      return i >= 0 ? c[i] : '';
    };
    out[m[1]] = { desfecho: plain(col('desfecho')), evidencia: plain(col('evid')), decisaoUsuario: plain(col('decis')) };
  }
  return out;
}

function loadPending(area) {
  const indexDir = path.join(area, 'reviews', '_index');
  const data = readJson(path.join(indexDir, 'items.json'), null);
  if (!data) throw new Error('items.json not found. Run cr-common/scripts/ingest.js first.');
  const cls = readJson(path.join(indexDir, 'classification.json'), { items: {} }).items;
  const rel = readJson(path.join(indexDir, 'relations.json'), { relations: [] }).relations;
  const prByName = Object.fromEntries(data.prs.map((p) => [p.pr, p]));
  const short = (r) => r.replace(/^pob-/, '');
  const prNum = (p) => p.pr.match(/-PR(\d+)$/)[1];

  const prCtx = {};
  for (const p of data.prs) {
    const dir = path.join(area, 'reviews', p.archived ? '_archive' : '', p.pr);
    const info = readJson(path.join(dir, 'pr-info.json'), null);
    const ended = p.archived || !!(info && info.pr && (info.pr.mergedAt || info.pr.closedAt));
    prCtx[p.pr] = { outcomes: readOutcomes(path.join(dir, 'pos-aprovacao.md')), ended, label: `${short(p.repo)} #${prNum(p)}` };
  }

  const all = data.items
    .filter((i) => prByName[i.pr] && prByName[i.pr].latestRound === i.round)
    .map((i) => {
      const p = prByName[i.pr], ctx = prCtx[i.pr], out = ctx.outcomes[i.id] || null, c = cls[i.key] || {};
      const fixed = (out && FIXED.test(out.desfecho)) || i.status === 'Resolvido';
      const rejected = /rejeitad/i.test(i.status || '') || (out && /^rejeitad/i.test(out.decisaoUsuario));
      const accepted = /^aceit/i.test(i.status || '') && i.scope === 'pr';
      let situacao;
      if (rejected) situacao = 'rejeitado-pelo-usuario';
      else if (accepted) situacao = 'aceito-pelo-usuario';
      else if (out && /indeterminad/i.test(out.desfecho)) situacao = 'indeterminado';
      else if (i.scope === 'fora') situacao = 'persiste-no-codigo-base';
      else situacao = ctx.ended ? 'pr-encerrado-sem-correcao' : 'pr-aberto-pode-corrigir';
      const body = i.scope === 'pr' ? { titulo: i.title, campos: i.campos || {} } : { titulo: '', campos: { Observação: i.text } };
      const item = {
        key: i.key, pr: i.pr, origem: ctx.label, repo: short(p.repo), jira: i.jira, id: i.id, round: i.round, roundDir: i.roundDir, archived: !!i.archived,
        escopo: i.scope === 'fora' ? 'fora do escopo' : 'finding do PR', tipoRevisao: i.scope === 'fora' ? 'fora do escopo' : i.tipo, severity: i.severity,
        status: i.status || '', onde: i.onde || '', layers: i.layers || [], categoria: c.category || '', secundaria: c.secondary || '',
        estadoPR: ctx.ended ? 'encerrado' : 'aberto', situacao, veredito: p.verdict || '',
        desfecho: out ? out.desfecho : '', evidenciaDesfecho: out ? out.evidencia : '', decisaoUsuario: out ? out.decisaoUsuario : '',
        fonte: `reviews/${i.archived ? '_archive/' : ''}${i.pr}/${i.roundDir}/review.md`, ...body,
      };
      item.contentHash = sha(JSON.stringify([item.escopo, item.severity, item.titulo, item.campos, item.desfecho, item.situacao]));
      return { item, fixed };
    });
  const items = all.filter((x) => !x.fixed).map((x) => x.item);

  // groups of confirmed same-cause relations among the pending items
  const keys = new Set(items.map((i) => i.key.replace(/\/r\d+\//, '/')));
  const parent = {};
  const find = (k) => (parent[k] === undefined ? (parent[k] = k) : parent[k] === k ? k : (parent[k] = find(parent[k])));
  for (const r of rel) if (r.type === 'same-cause' && r.status === 'confirmado' && keys.has(r.from) && keys.has(r.to)) parent[find(r.from)] = find(r.to);
  const sets = {};
  for (const k of Object.keys(parent)) (sets[find(k)] = sets[find(k)] || []).push(k);
  const groups = Object.values(sets).filter((g) => g.length > 1).map((g, n) => ({ id: `G${n + 1}`, keys: g }));
  const groupOf = {};
  for (const g of groups) for (const k of g.keys) groupOf[k] = g.id;
  for (const i of items) i.grupo = groupOf[i.key.replace(/\/r\d+\//, '/')] || '';
  const labelOf = (k) => {
    const m = k.match(/^(.*)-PR(\d+)\/(\w+)$/);
    return m ? `${short(prByName[`${m[1]}-PR${m[2]}`] ? prByName[`${m[1]}-PR${m[2]}`].repo : m[1])} #${m[2]} ${m[3]}` : k;
  };
  for (const g of groups) g.membros = g.keys.map(labelOf);

  const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const order = (a, b) => (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9) || a.origem.localeCompare(b.origem) || a.id.localeCompare(b.id, 'en', { numeric: true });
  return { prs: data.prs, items: items.sort(order), all: all.map((x) => x.item).sort(order), groups };
}

module.exports = { loadPending, readOutcomes };
