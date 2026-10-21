#!/usr/bin/env node
// Generates Maps of Content (Obsidian notes) under <area>/moc/ from reviews/_index/items.json.
// Usage: node moc.js [area-dir]
// Deterministic and idempotent: no timestamps, moc/ is rebuilt from scratch on every run.
// Out-of-scope observations (O) are exposed by id, severity and layer only, never by text.
// Optional reviews/_index/config.json: { "moc": { "people": "auto" | "on" | "off" } }  (auto = only with >= 3 people)

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const area = path.resolve(process.argv[2] || '.');
const indexDir = path.join(area, 'reviews', '_index');
const mocDir = path.join(area, 'moc');
const MARK = '<!-- cr-moc:generated -->';

const itemsFile = path.join(indexDir, 'items.json');
if (!fs.existsSync(itemsFile)) {
  console.error('items.json not found. Run cr-common/scripts/ingest.js first.');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(itemsFile, 'utf8'));
const cfgFile = path.join(indexDir, 'config.json');
const cfg = fs.existsSync(cfgFile) ? JSON.parse(fs.readFileSync(cfgFile, 'utf8').replace(/^﻿/, '')) : {};
const peopleMode = (cfg.moc && cfg.moc.people) || 'auto';

if (fs.existsSync(mocDir)) {
  const home = path.join(mocDir, '_Home.md');
  if (!fs.existsSync(home) || !fs.readFileSync(home, 'utf8').includes(MARK)) {
    console.error(`${mocDir} exists and is not a generated MoC folder; refusing to overwrite.`);
    process.exit(1);
  }
  fs.rmSync(mocDir, { recursive: true, force: true });
}

// ---------- model ----------
const safe = (s) => String(s).replace(/[\\/:*?"<>|#^[\]]/g, '-');
const prs = data.prs;
const prByName = Object.fromEntries(prs.map((p) => [p.pr, p]));
const latest = data.items.filter((i) => prByName[i.pr] && i.round === prByName[i.pr].latestRound);
const prBase = (p) => (p.archived ? `reviews/_archive/${p.pr}` : `reviews/${p.pr}`);
const prNum = (p) => p.pr.match(/-PR(\d+)$/)[1];
// short repo names (drop the "pob-policy-"/"pob-saa-" prefix) keep graph labels readable; fall back to the full name on collision
const stripRepo = (r) => r.replace(/^pob-(policy-|saa-)?/, '');
const repoNames = [...new Set(prs.map((p) => p.repo))];
const short = Object.fromEntries(repoNames.map((r) => [r, repoNames.filter((x) => stripRepo(x) === stripRepo(r)).length > 1 ? r : stripRepo(r)]));
const prKey = (p) => `${short[p.repo]}-${prNum(p)}`;
const prLabel = (p) => `${short[p.repo]} #${prNum(p)}`;
const link = (target, alias) => `[[${target}${alias ? '|' + alias : ''}]]`;
const hubTarget = (p) => `moc/pr/${safe(prKey(p))}`;
const prLinks = (p) => link(hubTarget(p), prLabel(p));
const itemTarget = (i) => `moc/items/${safe(prKey(prByName[i.pr]) + '--' + i.id)}`;
const itemLink = (i) => link(itemTarget(i), `${prLabel(prByName[i.pr])} ${i.id}`);
const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
const sortItems = (a, b) => (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9) || a.pr.localeCompare(b.pr) || a.id.localeCompare(b.id, 'en', { numeric: true });
const itemLine = (i) =>
  i.scope === 'pr'
    ? `- ${itemLink(i)} · ${i.severity} · ${i.tipo} · ${i.status || '-'} — ${i.title}`
    : `- ${itemLink(i)} · ${i.severity} · fora do escopo · ${i.status || 'sem status'}`;
const layersOf = (i) => (i.layers.length ? i.layers : ['indefinida']);
const group = (arr, keyFn) => {
  const m = new Map();
  for (const x of arr) for (const k of [].concat(keyFn(x))) m.set(k, [...(m.get(k) || []), x]);
  return [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
};

const files = {};
const put = (rel, text) => { files[rel] = text.replace(/\s+$/, '') + '\n'; };
const section = (title, lines) => (lines.length ? `## ${title}\n\n${lines.join('\n')}\n` : '');
const people = [...new Set(prs.flatMap((p) => [p.owner, p.executor]).filter(Boolean))].sort();
const showPeople = peopleMode === 'on' || (peopleMode === 'auto' && people.length >= 3);

// ---------- categories (classification.json, made by classify.js) ----------
const clsFile = path.join(indexDir, 'classification.json');
const cls = fs.existsSync(clsFile) ? JSON.parse(fs.readFileSync(clsFile, 'utf8').replace(/^﻿/, '')).items : {};
const tax = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'taxonomy.json'), 'utf8'));
const taxById = Object.fromEntries(tax.categories.map((c) => [c.id, c]));
const catOf = (i) => (cls[i.key] || {}).category || null;
const cat2Of = (i) => (cls[i.key] || {}).secondary || null;

// ---------- confirmed relations (cr-links) ----------
// Only relations the user confirmed reach the maps. same-cause edges judged "same" form shared-cause groups; "related" ones are plain links.
const relFile = path.join(indexDir, 'relations.json');
const confirmed = fs.existsSync(relFile) ? JSON.parse(fs.readFileSync(relFile, 'utf8').replace(/^﻿/, '')).relations.filter((r) => r.status === 'confirmado') : [];
const itemOf = Object.fromEntries(latest.map((i) => [`${i.pr}/${i.id}`, i]));
const isSame = (r) => r.type === 'same-cause' && (!r.judgment || r.judgment.verdict === 'same');
const parent = {};
const root = (x) => (parent[x] === undefined || parent[x] === x ? (parent[x] = x) : (parent[x] = root(parent[x])));
const sameEdges = confirmed.filter((r) => isSame(r) && itemOf[r.from] && itemOf[r.to]);
for (const r of sameEdges) parent[root(r.from)] = root(r.to);
const comps = {};
for (const r of sameEdges) for (const n of [r.from, r.to]) (comps[root(n)] ||= new Set()).add(n);
const causas = Object.values(comps)
  .map((s) => {
    const members = [...s].map((k) => itemOf[k]).sort(sortItems);
    const anchor = [...members].sort((a, b) => (a.pr + a.id).localeCompare(b.pr + b.id))[0];
    const withTitle = members.find((m) => m.scope === 'pr');
    return { members, slug: safe(`causa--${prKey(prByName[anchor.pr])}--${anchor.id}`), title: withTitle ? withTitle.title : 'Observações fora do escopo com a mesma causa', notes: confirmed.filter((r) => isSame(r) && s.has(r.from) && r.judgment && r.judgment.note).map((r) => r.judgment.note) };
  })
  .sort((a, b) => a.slug.localeCompare(b.slug));
const causaOf = {};
for (const c of causas) for (const m of c.members) causaOf[`${m.pr}/${m.id}`] = c;
const relatedOf = {};
for (const r of confirmed.filter((x) => x.type === 'same-cause' && x.judgment && x.judgment.verdict === 'related' && itemOf[x.from] && itemOf[x.to])) {
  (relatedOf[r.from] ||= []).push(itemOf[r.to]);
  (relatedOf[r.to] ||= []).push(itemOf[r.from]);
}
const prRelated = {};
const addPrRel = (pr, other, text) => (prRelated[pr] ||= []).push(`- ${prLinks(prByName[other])} · ${text}`);
for (const r of confirmed) {
  if (!prByName[r.from] || !prByName[r.to]) continue;
  if (r.type === 'jira-same') { addPrRel(r.from, r.to, `mesmo Jira ${r.evidence.jira}`); addPrRel(r.to, r.from, `mesmo Jira ${r.evidence.jira}`); }
  if (r.type === 'pr-mention') { addPrRel(r.from, r.to, 'cita'); addPrRel(r.to, r.from, 'citado por'); }
}

// ---------- notes ----------
for (const i of latest) {
  const p = prByName[i.pr];
  const fm = {
    pr: i.pr, repo: i.repo, jira: i.jira, round: i.round, id: i.id, scope: i.scope, severity: i.severity, tipo: i.tipo, status: i.status,
    category: catOf(i), secondary: cat2Of(i), layers: layersOf(i), base: i.base, tags: ['cr/item', `sev/${i.severity}`, i.scope === 'pr' ? 'cr/finding' : 'cr/fora-do-escopo'],
  };
  const front = '---\n' + Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v ?? null)}`).join('\n') + '\n---\n';
  const refs = [
    `- PR: ${prLinks(p)}`,
    `- Serviço: ${link('moc/servico/' + safe(i.repo), i.repo)}`,
    `- Camada: ${layersOf(i).map((l) => link('moc/camada/' + safe(l), l)).join(', ')}`,
    catOf(i) ? `- Categoria: ${[catOf(i), cat2Of(i)].filter(Boolean).map((c) => link('moc/categoria/' + safe(c), c)).join(', ')}` : null,
    i.jira ? `- Jira: ${link('moc/jira/' + safe(i.jira), i.jira)}` : null,
    i.base ? `- Release: ${link('moc/release/' + safe(i.base), i.base)}` : null,
    causaOf[`${i.pr}/${i.id}`] ? `- Mesma causa: ${link('moc/causa/' + causaOf[`${i.pr}/${i.id}`].slug, causaOf[`${i.pr}/${i.id}`].slug)}` : null,
    ...(relatedOf[`${i.pr}/${i.id}`] || []).map((o) => `- Relacionado: ${itemLink(o)}`),
  ].filter(Boolean);
  const heading = i.scope === 'pr' ? `${i.id} · ${i.severity} · ${i.tipo} — ${i.title}` : `${i.id} · ${i.severity} · fora do escopo`;
  put(`items/${safe(prKey(p) + '--' + i.id)}.md`, `${front}\n# ${heading}\n\n${refs.join('\n')}\n`);
}

for (const p of prs) {
  const its = latest.filter((i) => i.pr === p.pr).sort(sortItems);
  const counts = ['critical', 'high', 'medium', 'low'].map((s) => `${s} ${its.filter((i) => i.severity === s).length}`).join(' · ');
  const attrs = [
    `- Serviço: ${link('moc/servico/' + safe(p.repo), p.repo)}`,
    p.jira ? `- Jira: ${link('moc/jira/' + safe(p.jira), p.jira)}` : null,
    p.base ? `- Release: ${link('moc/release/' + safe(p.base), p.base)}` : null,
    `- Rodada: r${p.latestRound} · Publicado: ${p.publicado ? 'sim' : 'não'}${p.archived ? ' · arquivado' : ''}`,
    `- Itens: ${counts}`,
    showPeople && p.owner ? `- Owner da US: ${link('moc/pessoa/' + safe(p.owner), p.owner)}` : null,
    showPeople && p.executor ? `- Executor: ${link('moc/pessoa/' + safe(p.executor), p.executor)}` : null,
  ].filter(Boolean);
  const src = [`- ${link(prBase(p) + '/STATUS', 'STATUS')}`, `- ${link(`${prBase(p)}/${p.roundDir}/review`, 'review ' + p.roundDir)}`];
  put(`pr/${safe(prKey(p))}.md`, `# ${prLabel(p)}\n\n${attrs.join('\n')}\n\n${section('Relacionados', prRelated[p.pr] || [])}\n${section('Fontes', src)}\n${section('Itens', its.map(itemLine))}`);
}

for (const [cat, xs] of group(latest.filter(catOf), catOf)) {
  const bySvc = group(xs, (i) => i.repo).map(([r, ys]) => `### ${link('moc/servico/' + safe(r), r)}\n\n${ys.sort(sortItems).map(itemLine).join('\n')}\n`);
  const also = latest.filter((i) => cat2Of(i) === cat).sort(sortItems);
  const info = taxById[cat];
  put(`categoria/${safe(cat)}.md`, `# Categoria ${info ? info.label : cat}\n\n${info ? info.description + '\n\n' : ''}${bySvc.join('\n')}\n${section('Também toca esta categoria', also.map(itemLine))}`);
}

for (const c of causas) {
  put(`causa/${c.slug}.md`, `# Mesma causa: ${c.title}\n\nRelações confirmadas em reviews/_index/relations.json (cr-links).\n\n${section('Itens', c.members.map(itemLine))}\n${section('Pareceres', [...new Set(c.notes)].map((n) => `- ${n}`))}`);
}

for (const [repo, ps] of group(prs, (p) => p.repo)) {
  const its = latest.filter((i) => i.repo === repo);
  const byLayer = group(its, layersOf).map(([l, xs]) => `### ${link('moc/camada/' + safe(l), l)}\n\n${xs.sort(sortItems).map(itemLine).join('\n')}\n`);
  put(`servico/${safe(repo)}.md`, `# Serviço ${repo}\n\n${section('PRs', ps.map((p) => `- ${prLinks(p)} · ${p.jira ? link('moc/jira/' + safe(p.jira), p.jira) : '-'} · ${p.base ? link('moc/release/' + safe(p.base), p.base) : '-'}`))}\n## Itens por camada\n\n${byLayer.join('\n')}`);
}

for (const [layer, xs] of group(latest, layersOf)) {
  const bySvc = group(xs, (i) => i.repo).map(([r, ys]) => `### ${link('moc/servico/' + safe(r), r)}\n\n${ys.sort(sortItems).map(itemLine).join('\n')}\n`);
  put(`camada/${safe(layer)}.md`, `# Camada ${layer}\n\n${bySvc.join('\n')}`);
}

for (const [jira, ps] of group(prs.filter((p) => p.jira), (p) => p.jira)) {
  const infoFile = path.join(area, prBase(ps[0]), 'pr-info.json');
  const info = fs.existsSync(infoFile) ? JSON.parse(fs.readFileSync(infoFile, 'utf8').replace(/^﻿/, '')).jira : null;
  const attrs = info ? [`- Tipo: ${info.type} · Status: ${info.status}`, `- Owner (reporter): ${info.reporter || '-'}`, ...info.links.map((l) => `- ${l.relation}: ${l.key} (${l.type})`)] : [];
  const its = latest.filter((i) => i.jira === jira).sort(sortItems);
  put(`jira/${safe(jira)}.md`, `# ${jira}\n\n${section('Atributos', attrs)}\n${section('PRs', ps.map((p) => `- ${prLinks(p)}`))}\n${section('Itens', its.map(itemLine))}`);
}

for (const [base, ps] of group(prs.filter((p) => p.base), (p) => p.base)) {
  put(`release/${safe(base)}.md`, `# Release ${base}\n\n${section('PRs', ps.map((p) => `- ${prLinks(p)} · ${link('moc/servico/' + safe(p.repo), p.repo)}`))}`);
}

if (showPeople) {
  for (const name of people) {
    const asOwner = prs.filter((p) => p.owner === name);
    const asExec = prs.filter((p) => p.executor === name);
    put(`pessoa/${safe(name)}.md`, `# ${name}\n\nNavegação apenas: lista PRs, sem contagens nem severidades.\n\n${section('Owner da US (reporter do Jira)', asOwner.map((p) => `- ${prLinks(p)}`))}\n${section('Executor (autor do PR)', asExec.map((p) => `- ${prLinks(p)}`))}`);
  }
}

const crit = latest.filter((i) => i.severity === 'critical' || i.severity === 'high').sort(sortItems);
const pending = latest.filter((i) => i.scope === 'pr' && ['Aberto', 'Mantido'].includes(i.status) && ['decisão', 'maybe-false'].includes(i.tipo)).sort(sortItems);
// Shortcuts: the dashboard is an HTML file, which Obsidian cannot open inside the vault; a file:/// link opens it in the default browser.
// The absolute URL is machine-specific, so it is generated here and never versioned (moc/ is local and rebuilt every run).
const reportLink = (file, label, mode) => {
  const f = path.join(indexDir, file);
  return `- [${label}](${pathToFileURL(f).href})${fs.existsSync(f) ? '' : ` — ainda não gerado: rode o modo ${mode} da skill cr-insights`}`;
};
const shortcuts = [
  reportLink('dashboard.html', 'Abrir o dashboard no navegador', 'dashboard'),
  reportLink('insights.html', 'Abrir os insights (situação e detalhe) no navegador', 'insights'),
  reportLink('fora-do-escopo.html', 'Abrir o relatório de observações fora do escopo no navegador', 'oos'),
  reportLink('pendencias-tickets.html', 'Abrir o relatório de pendências e potenciais tickets no navegador', 'pendencias'),
  fs.existsSync(path.join(area, 'reviews', 'PACK.md')) ? `- ${link('reviews/PACK', 'Índice de PRs (PACK)')}` : null,
  fs.existsSync(path.join(indexDir, 'RELATIONS.md')) ? `- ${link('reviews/_index/RELATIONS', 'Relações entre PRs e achados')}` : null,
].filter(Boolean);
const nav = (title, dir, names) => section(title, names.map((n) => `- ${link(`moc/${dir}/${safe(n)}`, n)}`));
put('_Home.md',
  `${MARK}\n# crharness — mapa\n\nGerado a partir de \`reviews/_index/items.json\`. Não edite: \`moc/\` é recriado a cada execução. Notas suas ficam fora desta pasta.\n\n` +
  `${prs.length} PR(s), ${latest.length} item(ns) na última rodada de cada PR.\n\n` +
  section('Atalhos', shortcuts) + '\n' +
  nav('Serviços', 'servico', [...new Set(prs.map((p) => p.repo))].sort()) + '\n' +
  nav('PRs', 'pr', prs.map(prKey).sort()) + '\n' +
  nav('Categorias', 'categoria', [...new Set(latest.map(catOf).filter(Boolean))].sort()) + '\n' +
  nav('Causas compartilhadas', 'causa', causas.map((c) => c.slug)) + '\n' +
  nav('Camadas', 'camada', [...new Set(latest.flatMap(layersOf))].sort()) + '\n' +
  nav('Jira', 'jira', [...new Set(prs.map((p) => p.jira).filter(Boolean))].sort()) + '\n' +
  nav('Releases', 'release', [...new Set(prs.map((p) => p.base).filter(Boolean))].sort()) + '\n' +
  (showPeople ? nav('Pessoas', 'pessoa', people) + '\n' : '') +
  section('Críticos e altos', crit.map(itemLine)) + '\n' +
  section('Decisões pendentes', pending.map(itemLine)));

// ---------- write ----------
for (const [rel, text] of Object.entries(files)) {
  const f = path.join(mocDir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
}

// ---------- validate links ----------
let broken = 0;
for (const [rel, text] of Object.entries(files)) {
  for (const m of text.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
    if (!fs.existsSync(path.join(area, m[1] + '.md'))) {
      broken++;
      console.log(`BROKEN in moc/${rel}: [[${m[1]}]]`);
    }
  }
}
console.log(`MoC ${mocDir}: ${Object.keys(files).length} notes, people MoCs ${showPeople ? 'on' : 'off'} (${people.length} person(s), mode ${peopleMode}), broken links ${broken}`);
if (broken) process.exit(1);
