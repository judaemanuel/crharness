#!/usr/bin/env node
// Relations between PRs and findings of a crharness. Stores reviews/_index/relations.json.
// Usage: node relations.js <command> [options]      (--area <dir>, default ".")
//   scan [--full]                         find deterministic relations and same-cause candidates (no model)
//   list [--status S] [--type T] [--unjudged]   compact table of relations
//   detail <Lid>                          full text of both ends of a relation (for judging); local, may hold sensitive text
//   judge <Lid> --verdict same|related|unrelated [--note "..."]   record the model's judgment ("unrelated" => rejeitado)
//   decide <Lid...> | --all-deterministic  --status confirmado|rejeitado   record the user's decision
//   render                                writes reviews/_index/RELATIONS.md (no out-of-scope text)
// Rules: a rejected relation never returns unless its evidenceHash changes. Only confirmed relations reach the MoC.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const flag = (name) => argv.includes(name);
const area = path.resolve(opt('--area') || '.');
const indexDir = path.join(area, 'reviews', '_index');
const relFile = path.join(indexDir, 'relations.json');
const itemsFile = path.join(indexDir, 'items.json');
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};
if (!fs.existsSync(itemsFile)) fail('items.json not found. Run cr-common/scripts/ingest.js first.');
const data = JSON.parse(fs.readFileSync(itemsFile, 'utf8'));
const store = fs.existsSync(relFile) ? JSON.parse(fs.readFileSync(relFile, 'utf8')) : { schemaVersion: 1, nextId: 1, itemsHash: null, relations: [] };
const save = () => fs.writeFileSync(relFile, JSON.stringify(store, null, 2) + '\n');
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const now = () => new Date().toISOString().slice(0, 16).replace('T', ' ');

// ---------- corpus ----------
const prs = data.prs;
const prBase = (p) => path.join(area, 'reviews', p.archived ? '_archive' : '', p.pr);
const prNum = (p) => Number(p.pr.match(/-PR(\d+)$/)[1]);
const stripRepo = (r) => r.replace(/^pob-(policy-|saa-)?/, '');
const latestItems = data.items.filter((i) => prs.some((p) => p.pr === i.pr && p.latestRound === i.round));
const itemByKey = Object.fromEntries(latestItems.map((i) => [`${i.pr}/${i.id}`, i]));
const label = (node) => {
  if (node.startsWith('jira:')) return node.slice(5);
  const [pr, id] = node.split('/');
  const p = prs.find((x) => x.pr === pr);
  return p ? `${stripRepo(p.repo)} #${prNum(p)}${id ? ' ' + id : ''}` : node;
};

// ---------- deterministic relations ----------
function deterministic() {
  const out = [];
  const byJira = {};
  for (const p of prs) if (p.jira) (byJira[p.jira] ||= []).push(p);
  for (const [jira, ps] of Object.entries(byJira)) {
    for (let a = 0; a < ps.length; a++) {
      for (let b = a + 1; b < ps.length; b++) {
        out.push({ type: 'jira-same', from: ps[a].pr, to: ps[b].pr, evidence: { jira }, confidence: 'deterministic' });
      }
    }
  }
  const seen = new Set();
  for (const p of prs) {
    const f = path.join(prBase(p), 'pr-info.json');
    if (!fs.existsSync(f)) continue;
    const info = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
    for (const l of info.jira.links || []) {
      const k = `${info.jira.key}|${l.key}|${l.relation}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ type: 'jira-link', from: `jira:${info.jira.key}`, to: `jira:${l.key}`, evidence: { relation: l.relation, targetType: l.type, inCorpus: Boolean(byJira[l.key]) }, confidence: 'deterministic' });
    }
  }
  // PR mentions: the text must name the mentioned PR's repo next to its number (or give its URL), otherwise the number is ambiguous across repos
  for (const p of prs) {
    const dir = path.join(prBase(p), p.roundDir);
    const files = [['review', path.join(dir, 'review.md')], ['pr-body', path.join(dir, 'snapshot', 'pr-body.md')]];
    for (const q of prs) {
      if (q.pr === p.pr) continue;
      const names = [q.repo, stripRepo(q.repo)].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      const n = prNum(q);
      const re = new RegExp(`(?:${names})[^\\n]{0,40}?(?:PR\\s*)?#${n}\\b|(?:PR\\s*)?#${n}\\b[^\\n]{0,40}?(?:${names})|github\\.com/[^/\\s]+/${q.repo}/pull/${n}\\b`, 'i');
      const mentions = [];
      for (const [source, file] of files) {
        if (!fs.existsSync(file)) continue;
        let current = null;
        let sec = null;
        for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
          const s = line.match(/^## (\d+)\./);
          if (s || /^## /.test(line)) {
            sec = s ? s[1] : null;
            current = null;
          }
          const h = line.match(/^### (F\d+)\b/);
          if (h) current = h[1];
          const o = line.match(/^\|\s*(O\d+)\s*\|/);
          const where = source === 'pr-body' ? 'pr-body' : o ? o[1] : current || (sec ? `seção ${sec}` : 'cabeçalho');
          // keep an excerpt only for findings and the PR body; header, verdict and observation lines can quote credentials or PII
          if (re.test(line)) mentions.push({ source, where, excerpt: source === 'pr-body' || /^F\d+$/.test(where) ? line.trim().slice(0, 160) : null });
        }
      }
      if (mentions.length) out.push({ type: 'pr-mention', from: p.pr, to: q.pr, evidence: { mentions: mentions.slice(0, 5) }, confidence: 'deterministic' });
    }
  }
  return out;
}

// ---------- same-cause candidates (shared identifiers across PRs) ----------
const STOP = new Set(['string', 'exception', 'private', 'public', 'return', 'static', 'final', 'boolean', 'integer', 'object', 'import', 'package', 'class', 'resources', 'application', 'springframework']);
function idTokens(item) {
  const text = item.scope === 'pr' ? `${item.title} ${item.onde}` : item.text;
  const set = new Set();
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    // in a path only the file name is an identifier; directory names (service, integration, package parts) are noise
    const body = m[1].includes('/') ? m[1].split('/').pop() : m[1];
    for (const w of body.match(/[A-Za-z_][A-Za-z0-9_.-]{5,}/g) || []) {
      for (const t of [w, ...w.split('.')]) {
        const k = t.toLowerCase();
        if (k.length >= 6 && !STOP.has(k) && !/^(src|main|java|test|yml|json)$/.test(k) && !/^\w+\.(java|yml|yaml|json)$/.test(k)) set.add(k);
      }
    }
  }
  return set;
}
function candidates() {
  const toks = latestItems.map((i) => ({ i, t: idTokens(i) }));
  const prCount = {};
  for (const { i, t } of toks) for (const k of t) (prCount[k] ||= new Set()).add(i.pr);
  const out = [];
  for (let a = 0; a < toks.length; a++) {
    for (let b = a + 1; b < toks.length; b++) {
      if (toks[a].i.pr === toks[b].i.pr) continue;
      const shared = [...toks[a].t].filter((k) => toks[b].t.has(k) && prCount[k].size <= 2).sort();
      if (!shared.length) continue;
      const [x, y] = [`${toks[a].i.pr}/${toks[a].i.id}`, `${toks[b].i.pr}/${toks[b].i.id}`].sort();
      out.push({ type: 'same-cause', from: x, to: y, evidence: { shared }, confidence: 'candidate' });
    }
  }
  // categories flagged "linkCandidates" in the taxonomy (secrets, sensitive data in logs) also pair items across PRs, even with no identifier in common
  const clsFile = path.join(indexDir, 'classification.json');
  const taxFile = path.join(__dirname, '..', '..', 'cr-insights', 'taxonomy.json');
  if (fs.existsSync(clsFile) && fs.existsSync(taxFile)) {
    const cls = JSON.parse(fs.readFileSync(clsFile, 'utf8').replace(/^﻿/, '')).items;
    const linkCats = new Set(JSON.parse(fs.readFileSync(taxFile, 'utf8')).categories.filter((c) => c.linkCandidates).map((c) => c.id));
    const inCat = latestItems.filter((i) => cls[i.key] && linkCats.has(cls[i.key].category));
    for (let a = 0; a < inCat.length; a++) {
      for (let b = a + 1; b < inCat.length; b++) {
        if (inCat[a].pr === inCat[b].pr || cls[inCat[a].key].category !== cls[inCat[b].key].category) continue;
        const [x, y] = [`${inCat[a].pr}/${inCat[a].id}`, `${inCat[b].pr}/${inCat[b].id}`].sort();
        const category = cls[inCat[a].key].category;
        const hit = out.find((c) => c.type === 'same-cause' && c.from === x && c.to === y);
        if (hit) hit.evidence.category = category;
        else out.push({ type: 'same-cause', from: x, to: y, evidence: { category }, confidence: 'candidate' });
      }
    }
  }
  return out;
}

// ---------- commands ----------
const find = (id) => store.relations.find((r) => r.id === id);
const need = (id) => find(id) || fail(`Unknown relation ${id}`);

function scan() {
  const clsPath = path.join(indexDir, 'classification.json');
  const itemsHash = sha(fs.readFileSync(itemsFile, 'utf8') + (fs.existsSync(clsPath) ? fs.readFileSync(clsPath, 'utf8') : ''));
  if (!flag('--full') && store.itemsHash === itemsHash) {
    console.log('Nada novo: items.json não mudou desde o último scan (use --full para forçar).');
    return;
  }
  let created = 0;
  let reopened = 0;
  const produced = new Set();
  const same = (r, c) => r.type === c.type && r.from === c.from && r.to === c.to && (c.type !== 'jira-link' || r.evidence.relation === c.evidence.relation);
  for (const c of [...deterministic(), ...candidates()]) {
    // category is supporting evidence: adding it to a pair already found by shared identifiers must not reopen a decided relation
    const basis = c.evidence.shared ? { shared: c.evidence.shared } : c.evidence;
    const evidenceHash = sha(JSON.stringify(basis));
    const existing = store.relations.find((r) => same(r, c));
    if (existing) produced.add(existing.id);
    if (!existing) {
      const rel = { id: `L${store.nextId++}`, ...c, evidenceHash, status: 'proposto', judgment: null, createdAt: now() };
      store.relations.push(rel);
      produced.add(rel.id);
      created++;
    } else if (existing.evidenceHash !== evidenceHash) {
      Object.assign(existing, { evidence: c.evidence, evidenceHash, previousStatus: existing.status, status: 'proposto', judgment: null, decidedAt: null, reopenedAt: now() });
      reopened++;
    } else {
      existing.evidence = c.evidence;
    }
  }
  // an undecided proposal the scan no longer produces is an artifact (old rule, changed text): drop it; decided ones stay, flagged stale
  const before = store.relations.length;
  store.relations = store.relations.filter((r) => produced.has(r.id) || r.status !== 'proposto');
  store.relations.forEach((r) => {
    if (!produced.has(r.id)) r.stale = true;
    else delete r.stale;
  });
  const dropped = before - store.relations.length;
  store.itemsHash = itemsHash;
  save();
  const by = (s) => store.relations.filter((r) => r.status === s).length;
  console.log(`Scan: ${created} nova(s), ${reopened} reaberta(s) por evidência alterada, ${dropped} proposta(s) obsoleta(s) removida(s). Total ${store.relations.length} (propostas ${by('proposto')}, confirmadas ${by('confirmado')}, rejeitadas ${by('rejeitado')}).`);
}

function list() {
  const st = opt('--status');
  const ty = opt('--type');
  const rows = store.relations.filter((r) => (!st || r.status === st) && (!ty || r.type === ty) && (!flag('--unjudged') || (r.confidence === 'candidate' && r.status === 'proposto' && !r.judgment)));
  for (const r of rows) {
    const ev = r.type === 'same-cause' ? [r.evidence.shared && `shared: ${r.evidence.shared.join(', ')}`, r.evidence.category && `categoria: ${r.evidence.category}`].filter(Boolean).join(' | ') : r.type === 'jira-same' ? r.evidence.jira : r.type === 'jira-link' ? `${r.evidence.relation} (${r.evidence.targetType}${r.evidence.inCorpus ? '' : ', fora do corpus'})` : `${r.evidence.mentions.length} menção(ões) em ${[...new Set(r.evidence.mentions.map((m) => m.where))].join(', ')}`;
    const j = r.judgment ? ` | modelo: ${r.judgment.verdict}` : '';
    console.log(`${r.id}\t${r.status}\t${r.type}\t${label(r.from)} -> ${label(r.to)}\t${ev}${j}`);
  }
  console.log(`${rows.length} relação(ões).`);
}

function detail() {
  const r = need(argv[1]);
  console.log(`${r.id} ${r.type} [${r.status}] ${r.confidence}\nEvidência: ${JSON.stringify(r.evidence)}`);
  for (const node of [r.from, r.to]) {
    const i = itemByKey[node];
    if (!i) {
      console.log(`\n== ${label(node)}`);
      continue;
    }
    console.log(`\n== ${label(node)} · ${i.severity} · ${i.scope === 'pr' ? `${i.tipo} · ${i.status}` : 'fora do escopo'} · camadas ${i.layers.join(',') || '-'}`);
    console.log(i.scope === 'pr' ? `${i.title}\nOnde: ${i.onde}` : i.text);
  }
}

function judge() {
  const r = need(argv[1]);
  const verdict = opt('--verdict');
  if (!['same', 'related', 'unrelated'].includes(verdict)) fail('--verdict must be same, related or unrelated');
  r.judgment = { verdict, note: opt('--note') || '', by: 'model', at: now() };
  if (verdict === 'unrelated') Object.assign(r, { status: 'rejeitado', decidedBy: 'model', decidedAt: now() });
  save();
  console.log(`${r.id}: ${verdict}${verdict === 'unrelated' ? ' -> rejeitado' : ' (aguardando sua decisão)'}`);
}

function decide() {
  const status = opt('--status');
  if (!['confirmado', 'rejeitado'].includes(status)) fail('--status must be confirmado or rejeitado');
  const ids = flag('--all-deterministic')
    ? store.relations.filter((r) => r.confidence === 'deterministic' && r.status === 'proposto').map((r) => r.id)
    : argv.slice(1).filter((a) => /^L\d+$/.test(a));
  if (!ids.length) fail('No relation to decide.');
  for (const id of ids) Object.assign(need(id), { status, decidedBy: 'user', decidedAt: now() });
  save();
  console.log(`${ids.length} relação(ões) -> ${status}: ${ids.join(', ')}`);
}

function render() {
  const fmt = (node) => {
    const i = itemByKey[node];
    return i && i.scope === 'pr' ? `${label(node)} — ${i.title}` : label(node);
  };
  const sect = (title, st) => {
    const rs = store.relations.filter((r) => r.status === st);
    if (!rs.length) return '';
    const lines = rs.map((r) => {
      const hasO = [r.from, r.to].some((n) => itemByKey[n] && itemByKey[n].scope === 'fora');
      const ev = r.type === 'same-cause' ? [r.evidence.shared && (hasO ? `${r.evidence.shared.length} termo(s) em comum` : `termos: ${r.evidence.shared.join(', ')}`), r.evidence.category && `categoria: ${r.evidence.category}`].filter(Boolean).join(' · ') : r.type === 'jira-same' ? `Jira ${r.evidence.jira}` : r.type === 'jira-link' ? r.evidence.relation : `menções: ${[...new Set(r.evidence.mentions.map((m) => m.where))].join(', ')}`;
      const j = r.judgment ? ` · modelo: ${r.judgment.verdict}${r.judgment.note ? ' — ' + r.judgment.note : ''}` : '';
      return `- **${r.id}** · ${r.type} · ${fmt(r.from)} → ${fmt(r.to)} · ${ev}${j}`;
    });
    return `## ${title}\n\n${lines.join('\n')}\n\n`;
  };
  const text = `# Relações\n\nGerado por cr-links. Não edite. Texto de observações fora do escopo não aparece aqui.\n\n` + sect('Confirmadas', 'confirmado') + sect('Propostas (aguardando decisão)', 'proposto') + `## Rejeitadas\n\n${store.relations.filter((r) => r.status === 'rejeitado').map((r) => r.id).join(', ') || '-'}\n`;
  fs.writeFileSync(path.join(indexDir, 'RELATIONS.md'), text);
  console.log(`RELATIONS.md escrito (${store.relations.length} relações).`);
}

const commands = { scan, list, detail, judge, decide, render };
if (!commands[cmd]) fail('Usage: node relations.js <scan|list|detail|judge|decide|render> [--area <dir>]');
commands[cmd]();
