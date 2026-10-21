#!/usr/bin/env node
// Generates a clean crharness from this scaffold.
// Usage: node scripts/new-area.js <target-dir>
// Only the paths in INCLUDE are copied, so reviews, HANDOFF.md and scripts/ never leak into an area.

const fs = require('fs');
const path = require('path');

const INCLUDE = ['CLAUDE.md', 'README.md', 'GUIDE.md', 'AJUDA.md', '.claude', '.obsidian'];

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/new-area.js <target-dir>');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const dest = path.resolve(target);

if (dest === root || dest.startsWith(root + path.sep)) {
  console.error(`Target must be outside the scaffold: ${dest}`);
  process.exit(1);
}
if (fs.existsSync(dest) && fs.readdirSync(dest).length > 0) {
  console.error(`Target exists and is not empty: ${dest}`);
  process.exit(1);
}

fs.mkdirSync(path.join(dest, 'reviews'), { recursive: true });
fs.writeFileSync(path.join(dest, 'reviews', '.gitkeep'), '');
for (const item of INCLUDE) {
  fs.cpSync(path.join(root, item), path.join(dest, item), { recursive: true });
}

console.log(`Area created at ${dest}`);
console.log('Next: open Claude Code there, fill reviews/INPUT.md and run /cr-pullrequest');
