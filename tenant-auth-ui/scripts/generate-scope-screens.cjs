#!/usr/bin/env node
// scripts/generate-scope-screens.cjs
//
// Derives "which screens does this scope open" from config/navigation.js — the
// file that already decides it — and writes scope-screens.json.
//
// WHY A GENERATED FILE AND NOT A HAND-WRITTEN ONE
// The capability names on the dashboard were hand-written once and four of them
// were wrong: POS_OPS was described as opening the Tables screen, which it does
// not, and POS_CONFIG was called "settings" when it opens nine screens. A name
// written by hand drifts from the routing the day somebody moves a menu item.
// Generated, it cannot.
//
// The backend serves the wording (see capability.service), and the two repos
// cannot import from each other — so this writes the JSON here and it is copied
// across. `--check` fails when the copy is stale, which is what makes the drift
// visible instead of silent.
//
//   node scripts/generate-scope-screens.cjs           # write
//   node scripts/generate-scope-screens.cjs --check   # fail if stale

const fs = require('fs');
const path = require('path');

const NAV = path.join(__dirname, '..', 'src', 'config', 'navigation.js');
const OUT = path.join(__dirname, '..', 'src', 'config', 'scope-screens.json');

const src = fs.readFileSync(NAV, 'utf8');

// SCOPES constant name -> its string value, so the JSON holds real scopes.
const scopeSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'constants', 'scopes.js'), 'utf8');
const scopeValue = {};
for (const m of scopeSrc.matchAll(/([A-Z_]+):\s*'([^']+)'/g)) scopeValue[m[1]] = m[2];

// Every FRONT_DESK_NAV entry, with the group it sits in.
const frontDesk = src.slice(src.indexOf('FRONT_DESK_NAV'));
const byScope = {};
let group = null;

for (const line of frontDesk.split('\n')) {
  const g = line.match(/group:\s*'([^']+)'/);
  if (g) group = g[1];
  const label = line.match(/label:\s*'([^']+)'/);
  const scopes = line.match(/scopes:\s*\[([^\]]*)\]/);
  if (!label || !scopes) continue;
  for (const raw of scopes[1].split(',')) {
    const name = raw.trim().replace(/^SCOPES\./, '');
    if (!name) continue;
    const value = scopeValue[name];
    // TENANT_ADMIN opens everything by rank, so listing it against each screen
    // would say only "an admin can do anything" — which the banner says once.
    if (!value || name === 'TENANT_ADMIN' || name === 'TENANT_SUPER_ADMIN') continue;
    const subject = value.split(':')[0];
    (byScope[subject] ||= { subject, group, screens: [] });
    if (!byScope[subject].screens.includes(label[1])) byScope[subject].screens.push(label[1]);
  }
}

const payload = {
  // Regenerate rather than edit: this file is derived from navigation.js.
  generatedFrom: 'src/config/navigation.js',
  subjects: Object.values(byScope).sort((a, b) => a.subject.localeCompare(b.subject)),
};
const text = `${JSON.stringify(payload, null, 2)}\n`;

if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (current !== text) {
    console.error('scope-screens.json is stale — run: node scripts/generate-scope-screens.cjs');
    process.exit(1);
  }
  console.log('scope-screens.json is up to date');
  process.exit(0);
}

fs.writeFileSync(OUT, text);
console.log(`wrote ${path.relative(process.cwd(), OUT)} — ${payload.subjects.length} subjects`);
payload.subjects.forEach((s) => console.log(`  ${s.subject.padEnd(14)} ${s.screens.join(', ')}`));
