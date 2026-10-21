// Omits personal and sensitive data from text that ends up in a shareable HTML (oos-report.js, pendencias.js build).
// Layers, applied in this order:
//   1. area terms and patterns from reviews/_index/config.json  { "redact": { "terms": ["SRVX", {"term":"x","replacement":"‹y›"}], "patterns": [{"pattern":"...","flags":"g","replacement":"..."}] } }
//   2. people of the area: owner, executor, PR author (name and login), Jira reporter/assignee read from pr-info.json (full name and each name part >= 4 letters)
//   3. generic patterns: CPF, CNPJ, JWT, bearer tokens, e-mail addresses, "senha/password/secret/token = <value>"
// It is a best-effort filter, not a guarantee: the HTML still carries a warning to review it before sharing.
const fs = require('fs');
const path = require('path');

const readJson = (f, fallback) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')) : fallback);
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (t) => new RegExp(`(?<![\\p{L}\\p{N}_])${escRe(t)}(?![\\p{L}\\p{N}_])`, 'giu');
const stripRole = (n) => (n ? n.split(' - ')[0].trim() : null);

function peopleOf(area, prs) {
  const names = new Set();
  const add = (n) => {
    const full = stripRole(n);
    if (!full) return;
    names.add(full);
    for (const part of full.split(/\s+/)) if (part.length >= 4 && /^\p{L}+$/u.test(part)) names.add(part);
  };
  for (const p of prs) {
    add(p.owner);
    add(p.executor);
    const dir = path.join(area, 'reviews', p.archived ? '_archive' : '', p.pr);
    const info = readJson(path.join(dir, 'pr-info.json'), null);
    if (!info) continue;
    add(info.pr && info.pr.authorName);
    if (info.pr && info.pr.author) names.add(info.pr.author);
    if (info.jira) {
      add(info.jira.reporter);
      add(info.jira.assignee);
    }
  }
  return [...names];
}

function loadRedactor(area, prs) {
  const cfg = (readJson(path.join(area, 'reviews', '_index', 'config.json'), {}).redact) || {};
  const rules = [];
  for (const t of cfg.terms || []) {
    const term = typeof t === 'string' ? t : t.term;
    rules.push({ label: 'termo da área', re: wordRe(term), rep: (t && t.replacement) || '‹omitido›' });
  }
  for (const p of cfg.patterns || []) rules.push({ label: 'padrão da área', re: new RegExp(p.pattern, p.flags || 'g'), rep: p.replacement || '‹omitido›' });
  for (const n of peopleOf(area, prs).sort((a, b) => b.length - a.length)) rules.push({ label: 'pessoa', re: wordRe(n), rep: '‹pessoa›' });
  rules.push(
    { label: 'CPF', re: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/g, rep: '‹CPF omitido›' },
    { label: 'CNPJ', re: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, rep: '‹CNPJ omitido›' },
    { label: 'JWT', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g, rep: '‹token omitido›' },
    { label: 'bearer', re: /\b(bearer)\s+[A-Za-z0-9._~+/=-]{12,}/gi, rep: '$1 ‹token omitido›' },
    { label: 'e-mail', re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, rep: '‹e-mail omitido›' },
    { label: 'segredo', re: /\b(senha|password|passwd|secret|token)(\s*[=:]\s*)(?![<{$*‹])\S{6,}/gi, rep: '$1$2‹valor omitido›' },
  );
  const counts = {};
  const text = (t) => {
    if (t == null) return '';
    let o = String(t);
    for (const r of rules) {
      r.re.lastIndex = 0;
      const n = (o.match(r.re) || []).length;
      if (n) {
        counts[r.label] = (counts[r.label] || 0) + n;
        o = o.replace(r.re, r.rep);
      }
    }
    return o;
  };
  const list = (a) => (Array.isArray(a) ? a : a ? [a] : []).map(text);
  return { text, list, counts };
}

module.exports = { loadRedactor };
