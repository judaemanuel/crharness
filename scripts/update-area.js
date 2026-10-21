#!/usr/bin/env node
// Brings an existing crharness up to date with this scaffold. Never deletes anything and never touches reviews/.
// Usage: node scripts/update-area.js <area-dir> [--dry-run] [--with-docs]
// Default: .claude/ (skills + scripts) and .obsidian/snippets/.
// --with-docs: also CLAUDE.md, README.md, GUIDE.md and AJUDA.md (skip them if you customized the area's copies).
// --reset-graph: also overwrite .obsidian/graph.json. Obsidian rewrites that file with the user's own graph tweaks
//   (and overwrites it on close), so it is only copied when missing, unless this flag is given. Close Obsidian first.
// .obsidian/bookmarks.json is also user-owned (Obsidian rewrites it): it is only copied when missing.
// Skills in the area that no longer exist in the scaffold (e.g. after a rename) are reported as stale and kept;
//   --prune-stale deletes those skill folders (only folders under .claude/skills).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const withDocs = args.includes('--with-docs');
const resetGraph = args.includes('--reset-graph');
const pruneStale = args.includes('--prune-stale');
const target = args.find((a) => !a.startsWith('--'));
if (!target) {
  console.error('Usage: node scripts/update-area.js <area-dir> [--dry-run] [--with-docs] [--reset-graph] [--prune-stale]');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const dest = path.resolve(target);
if (!fs.existsSync(path.join(dest, 'reviews')) || !fs.existsSync(path.join(dest, '.claude'))) {
  console.error(`Not a crharness (needs reviews/ and .claude/): ${dest}`);
  process.exit(1);
}
if (dest === root) {
  console.error('Target is the scaffold itself.');
  process.exit(1);
}

const INCLUDE = ['.claude', path.join('.obsidian', 'graph.json'), path.join('.obsidian', 'bookmarks.json'), path.join('.obsidian', 'snippets'), ...(withDocs ? ['CLAUDE.md', 'README.md', 'GUIDE.md', 'AJUDA.md'] : [])];
const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const walk = (p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).flatMap((n) => walk(path.join(p, n))) : [p]);

const added = [];
const changed = [];
let same = 0;
for (const item of INCLUDE) {
  const src = path.join(root, item);
  if (!fs.existsSync(src)) continue;
  for (const file of walk(src)) {
    const rel = path.relative(root, file);
    const out = path.join(dest, rel);
    const base = path.basename(rel);
    const userOwned = (base === 'graph.json' && !resetGraph) || base === 'bookmarks.json';
    if (!fs.existsSync(out)) added.push(rel);
    else if (userOwned) {
      same++;
      continue;
    } else if (hash(file) !== hash(out)) changed.push(rel);
    else {
      same++;
      continue;
    }
    if (!dryRun) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.copyFileSync(file, out);
    }
  }
}

console.log(`${dryRun ? '[dry-run] ' : ''}Update ${dest}`);
console.log(`Added (${added.length}):`);
added.forEach((f) => console.log(`  + ${f}`));
console.log(`Changed (${changed.length}):`);
changed.forEach((f) => console.log(`  ~ ${f}`));
console.log(`Unchanged: ${same}`);

const skillsDir = path.join(dest, '.claude', 'skills');
const stale = fs.existsSync(skillsDir)
  ? fs.readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory() && !fs.existsSync(path.join(root, '.claude', 'skills', e.name))).map((e) => e.name)
  : [];
if (stale.length) {
  if (pruneStale && !dryRun) {
    stale.forEach((n) => fs.rmSync(path.join(skillsDir, n), { recursive: true, force: true }));
    console.log(`Stale skills removed (${stale.length}): ${stale.join(', ')}`);
  } else {
    console.log(`Stale skills in the area (no longer in the scaffold): ${stale.join(', ')}. ${pruneStale ? '(dry-run: nothing removed)' : 'Remove them with --prune-stale.'}`);
  }
}
