#!/usr/bin/env node
// Ingests every review.md of a crharness into reviews/_index/items.json (no model involved).
// Usage: node ingest.js [area-dir] [--full]
// Incremental: a round is re-parsed only when the hash of its review.md or of the PR's pr-info.json changed,
// or when the parser itself changed (PARSER_VERSION: 2 added the finding bullets as `campos`).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const full = args.includes('--full');
const area = path.resolve(args.find((a) => !a.startsWith('--')) || '.');
const reviews = path.join(area, 'reviews');
const indexDir = path.join(reviews, '_index');
if (!fs.existsSync(reviews)) {
  console.error(`No reviews/ folder in ${area}`);
  process.exit(1);
}

const PARSER_VERSION = 2;
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const readJson = (f, fallback) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')) : fallback);
const noAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------- normalization ----------
const SEVERITY = { critica: 'critical', critico: 'critical', critical: 'critical', alta: 'high', alto: 'high', high: 'high', media: 'medium', medio: 'medium', medium: 'medium', baixa: 'low', baixo: 'low', low: 'low' };
const normSeverity = (raw) => SEVERITY[noAccent(raw.toLowerCase()).split(/[\s(,—-]+/)[0]] || null;
const person = (name) => (name ? name.split(' - ')[0].trim() : null);

// ---------- layer extraction ----------
const LAYER_BY_DIR = {
  test: 'test', tests: 'test', handler: 'controller', controller: 'controller', controllers: 'controller',
  service: 'service', services: 'service', integration: 'integration', repository: 'repository', repositories: 'repository', dao: 'repository',
  model: 'model', dto: 'model', entity: 'model', domain: 'model', config: 'config', configuration: 'config', security: 'security',
  util: 'util', utils: 'util', commom: 'util', common: 'util', producer: 'messaging', consumer: 'messaging', kafka: 'messaging',
  helm: 'delivery', cd: 'delivery', '.github': 'delivery',
};
const LAYER_BY_SUFFIX = [
  [/Test(s)?$/, 'test'], [/Controller|ExceptionHandler|ControllerAdvice/, 'controller'], [/Service(Impl)?$/, 'service'],
  [/Repository$|Dao$/, 'repository'], [/Integration$|Client$|RestTemplate/, 'integration'],
  [/Dto$|Response$|Request$|Event$|Message$|Entity$/, 'model'], [/Config(uration)?$|Properties$/, 'config'],
  [/Helper$|Util(s)?$/, 'util'], [/Security/, 'security'],
];
const FILE_EXT = /\.(java|ya?ml|properties|json|xml|gradle|sql|md)$/i;

function layerOfToken(raw) {
  const token = raw.replace(/:\d[\d,\s-]*$/, '').trim();
  if (!token || /\s|[(){}=;]/.test(token)) return null;
  const hasPath = token.includes('/');
  const base = token.split('/').pop();
  const ext = FILE_EXT.test(base);
  if (!hasPath && !ext && !/^[A-Z]/.test(base)) return null; // method or property names
  const dirs = hasPath ? token.split('/').slice(0, -1).map((d) => d.toLowerCase()) : [];
  if (/(^|\/)src\/test\//.test(token) || dirs.includes('test')) return 'test';
  if (dirs.includes('cd') || dirs.includes('helm') || dirs.includes('.github') || /^(Dockerfile|Jenkinsfile)/.test(base)) return 'delivery';
  if (/\.(ya?ml|properties)$/i.test(base)) return 'config';
  for (const d of [...dirs].reverse()) if (LAYER_BY_DIR[d]) return LAYER_BY_DIR[d];
  const cls = base.replace(FILE_EXT, '').split('.')[0];
  for (const [re, layer] of LAYER_BY_SUFFIX) if (re.test(cls)) return layer;
  return null;
}
const tokens = (text) => [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const layersOf = (text, all) => {
  const found = [];
  for (const t of tokens(text)) {
    const l = layerOfToken(t);
    if (l && !found.includes(l)) found.push(l);
    if (l && !all) break;
  }
  return found;
};

// ---------- review.md parsing ----------
function parseReview(text) {
  const header = {};
  for (const m of text.matchAll(/^\s*-?\s*\*\*(Rodada|Head SHA|Data|Veredito|Publicado):\*\*\s*(.*)$/gm)) header[m[1]] = m[2].trim().replace(/[.\s]+$/, '');
  const section = (n) => {
    const m = text.match(new RegExp(`^## ${n}\\.[^\\n]*\\n([\\s\\S]*?)(?=^## \\d|^## Histórico|(?![\\s\\S]))`, 'm'));
    return m ? m[1] : '';
  };
  const findings = [];
  const body4 = section(4);
  const parts = body4.split(/^### /m).slice(1);
  for (const p of parts) {
    const h = p.match(/^(F\d+)\s+·\s+([^·]+?)\s+·\s+([^—\n]+?)\s+—\s+(.+)/);
    if (!h) continue;
    const onde = (p.match(/^- \*\*Onde:\*\*\s*(.*)$/m) || [])[1] || '';
    const status = (p.match(/^- \*\*Status:\*\*\s*(.*)$/m) || [])[1] || '';
    const campos = {};
    let cur = null;
    for (const line of p.split(/\r?\n/).slice(1)) {
      const f = line.match(/^- \*\*(.+?):\*\*\s*(.*)$/);
      if (f) {
        cur = f[1];
        campos[cur] = f[2].trim();
      } else if (cur && line.trim()) campos[cur] += ' ' + line.trim();
    }
    findings.push({ id: h[1], severityRaw: h[2].trim(), tipo: h[3].trim(), title: h[4].trim(), onde, statusRaw: status.trim(), campos });
  }
  const observations = [];
  for (const line of section(6).split(/\r?\n/)) {
    const m = line.match(/^\|\s*(O\d+)\s*\|\s*([^|]*?)\s*\|\s*(.*)\|\s*$/);
    if (!m) continue;
    const s = m[3].trim().match(/^([\s\S]*?)\s*\|\s*(Aberto|Encaminhado|Aceito|Resolvido)\s*$/);
    observations.push({ id: m[1], severityRaw: m[2], text: s ? s[1] : m[3].trim(), status: s ? s[2] : null });
  }
  return { header, findings, observations };
}

// ---------- corpus ----------
function prFolders() {
  const out = [];
  const scan = (dir, archived) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && /-PR\d+$/.test(e.name)) out.push({ name: e.name, dir: path.join(dir, e.name), archived });
    }
  };
  scan(reviews, false);
  scan(path.join(reviews, '_archive'), true);
  return out;
}
const rounds = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^r\d+-/.test(e.name))
    .map((e) => ({ n: Number(e.name.match(/^r(\d+)-/)[1]), name: e.name }))
    .sort((a, b) => a.n - b.n);

const prevItems = readJson(path.join(indexDir, 'items.json'), null);
const ledger = readJson(path.join(indexDir, 'ledger.json'), { schemaVersion: 1, entries: {} });
const newEntries = {};
const items = [];
const prs = [];
let parsed = 0;
let reused = 0;

for (const pr of prFolders().sort((a, b) => a.name.localeCompare(b.name))) {
  const info = readJson(path.join(pr.dir, 'pr-info.json'), null);
  const infoHash = info ? sha(JSON.stringify(info)) : null;
  const rs = rounds(pr.dir);
  if (!rs.length) continue;
  const latest = rs[rs.length - 1];
  const repoShort = info ? info.pr.repo.split('/')[1] : pr.name.replace(/-PR\d+$/, '');
  const owner = info ? person(info.jira.reporter) : null;
  const executor = info ? person(info.pr.authorName) : null;
  let latestHeader = {};

  for (const r of rs) {
    const reviewFile = path.join(pr.dir, r.name, 'review.md');
    if (!fs.existsSync(reviewFile)) continue;
    const key = `${pr.name}/r${r.n}`;
    const reviewHash = sha(fs.readFileSync(reviewFile));
    const prev = ledger.entries[key];
    const cached = prevItems && !full && prev && prev.reviewHash === reviewHash && prev.infoHash === infoHash && prev.archived === pr.archived && prev.parserVersion === PARSER_VERSION;
    let roundItems;
    if (cached) {
      roundItems = prevItems.items.filter((i) => i.pr === pr.name && i.round === r.n);
      reused++;
      latestHeader = r === latest ? (prevItems.prs.find((p) => p.pr === pr.name) || {}).header || {} : latestHeader;
    } else {
      const text = fs.readFileSync(reviewFile, 'utf8').replace(/^﻿/, '');
      const rv = parseReview(text);
      parsed++;
      if (r === latest) latestHeader = rv.header;
      const common = { pr: pr.name, repo: repoShort, jira: info ? info.jira.key : null, round: r.n, roundDir: r.name, base: info ? info.pr.baseRef : null, owner, executor, jiraType: info ? info.jira.type : null, archived: pr.archived };
      roundItems = [
        ...rv.findings.map((f) => ({
          ...common, key: `${key}/${f.id}`, id: f.id, scope: 'pr', tipo: f.tipo, severity: normSeverity(f.severityRaw), severityRaw: f.severityRaw,
          status: f.statusRaw.split(/[\s—-]+/)[0] || null, title: f.title, onde: f.onde, campos: f.campos, layers: layersOf(f.onde, true),
        })),
        ...rv.observations.map((o) => ({
          ...common, key: `${key}/${o.id}`, id: o.id, scope: 'fora', tipo: null, severity: normSeverity(o.severityRaw), severityRaw: o.severityRaw,
          flagCritical: /cr[ií]tic/i.test(o.severityRaw + ' ' + o.text.slice(0, 60)), status: o.status, text: o.text, layers: layersOf(o.text, false),
        })),
      ];
    }
    items.push(...roundItems);
    newEntries[key] = { reviewHash, infoHash, archived: pr.archived, parserVersion: PARSER_VERSION, ingestedAt: cached ? prev.ingestedAt : new Date().toISOString() };
  }
  prs.push({
    pr: pr.name, repo: repoShort, jira: info ? info.jira.key : null, jiraType: info ? info.jira.type : null, base: info ? info.pr.baseRef : null,
    owner, executor, latestRound: latest.n, roundDir: latest.name, archived: pr.archived, header: latestHeader,
    verdict: latestHeader.Veredito || null, publicado: /^sim/i.test(latestHeader.Publicado || ''),
  });
}

const out = { schemaVersion: 1, prs, items };
fs.mkdirSync(indexDir, { recursive: true });
fs.writeFileSync(path.join(indexDir, 'items.json'), JSON.stringify(out, null, 2) + '\n');
fs.writeFileSync(path.join(indexDir, 'ledger.json'), JSON.stringify({ schemaVersion: 1, entries: newEntries }, null, 2) + '\n');

const count = (f) => items.filter(f).length;
console.log(`Ingest ${area}${full ? ' (--full)' : ''}: rounds parsed ${parsed}, reused ${reused}`);
console.log(`PRs ${prs.length} | items ${items.length} (F ${count((i) => i.scope === 'pr')}, O ${count((i) => i.scope === 'fora')})`);
console.log(`No severity: ${count((i) => !i.severity)} | no layer: ${count((i) => !i.layers.length)} of ${items.length}`);
