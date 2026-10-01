#!/usr/bin/env node
// scripts/generate-scope-screens.cjs
//
// Derives "which screens does this scope open" from config/workspaces.js — the
// file that already decides it — and writes scope-screens.json. A screen is a
// tab or section line carrying `label:` and `scopes:`; an embedded Master Data
// grid (`grid('taxTypes')`) counts under its category's read scope.
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

const NAV = path.join(__dirname, '..', 'src', 'config', 'workspaces.js');
const OUT = path.join(__dirname, '..', 'src', 'config', 'scope-screens.json');

const src = fs.readFileSync(NAV, 'utf8');

// SCOPES constant name -> its string value, so the JSON holds real scopes.
const scopeSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'constants', 'scopes.js'), 'utf8');
const scopeValue = {};
for (const m of scopeSrc.matchAll(/([A-Z_]+):\s*'([^']+)'/g)) scopeValue[m[1]] = m[2];

// Every FRONT_DESK_NAV entry, with the group it sits in.
// moduleKey -> category constant name, from config/modules.js.
const modulesSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'config', 'modules.js'), 'utf8');
// Each module's own block only: a module that inherits its category (no
// `category:` line) must not borrow the next module's.
const moduleCategory = {};
const starts = [...modulesSrc.matchAll(/^  (\w+): \{/gm)];
starts.forEach((m, i) => {
  const block = modulesSrc.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : undefined);
  const c = block.match(/category: MODULE_CATEGORIES\.(\w+)/);
  if (c) moduleCategory[m[1]] = c[1];
});
// category constant name -> display value -> read scope constant name.
const categoryName = {};
for (const m of modulesSrc.matchAll(/^  ([A-Z_]+): '([^']+)',$/gm)) categoryName[m[1]] = m[2];
const permSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'permissions.js'), 'utf8');
const readBlock = permSrc.slice(permSrc.indexOf('CATEGORY_READ_SCOPE'), permSrc.indexOf('CATEGORY_WRITE_SCOPE'));
const categoryRead = {};
for (const m of readBlock.matchAll(/'([^']+)':\s*SCOPES\.([A-Z_]+)/g)) categoryRead[m[1]] = m[2];

const scopeNamesOf = (line) => {
  const lit = line.match(/scopes:\s*\[([^\]]*)\]/);
  if (lit) return lit[1].split(',').map((r) => r.trim().replace(/^SCOPES\./, '')).filter(Boolean);
  const g = line.match(/scopes:\s*grid\('(\w+)'\)/);
  if (g) {
    const cat = categoryName[moduleCategory[g[1]]];
    return cat && categoryRead[cat] ? [categoryRead[cat]] : [];
  }
  return [];
};

const byScope = {};
let group = null;

for (const line of src.slice(src.indexOf('export const WORKSPACES')).split('\n')) {
  const g = line.match(/workspace:\s*'([^']+)'/);
  if (g) group = g[1];
  const label = line.match(/\blabel:\s*'([^']+)'/);
  if (!label) continue;
  for (const name of scopeNamesOf(line)) {
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
  // Regenerate rather than edit: this file is derived from workspaces.js.
  generatedFrom: 'src/config/workspaces.js',
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
