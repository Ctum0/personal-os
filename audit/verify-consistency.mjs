#!/usr/bin/env node
/**
 * Internal consistency check for the audit package.
 *
 * The report's opening claim is that every number is derived from a file in this
 * directory. That claim is only true if it is checked, so this script verifies it:
 * stale conclusions, headline counts, the open/resolved split, and that every
 * finding ID is accounted for.
 *
 * Run: node audit/verify-consistency.mjs
 * Exits non-zero on any inconsistency, so it can gate a future edit.
 */
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname));
const read = name => fs.readFileSync(path.join(dir, name), 'utf8');
const docs = Object.fromEntries(
  fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => [f, read(f)])
);
const scan = JSON.parse(fs.readFileSync(path.join(dir, 'evidence/reports/route-scan.json'), 'utf8'));
const resp = JSON.parse(fs.readFileSync(path.join(dir, 'evidence/reports/responsive.json'), 'utf8'));

const failures = [];
const check = (name, ok, detail = '') => {
  if (!ok) failures.push(`${name}${detail ? ` :: ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : ` :: ${detail}`}`);
};

// 1. No document may still assert a conclusion the audit has since revised.
for (const stale of ['377/377', '5 of 8', 'ends the session server-side',
                     'Re-run the command-palette interaction']) {
  const hits = Object.entries(docs).filter(([, text]) => text.includes(stale)).map(([n]) => n);
  check(`no stale claim: ${stale}`, hits.length === 0, hits.join(', '));
}
check('RESPONSIVE no longer calls the calendar clipped',
  !docs['RESPONSIVE_TESTING.md'].includes('permanently clipped'));
check('BUG-002 keeps its history in past tense',
  docs['FUNCTIONAL_BUGS.md'].includes('was permanently clipped'));

// 2. Measured figures must match their evidence files.
check('route scan covered 29 routes', scan.length === 29, String(scan.length));
check('367 buttons measured', scan.reduce((n, r) => n + r.btns, 0) === 367);
check('64 responsive measurements', resp.length === 64, String(resp.length));
check('no document-level horizontal overflow anywhere',
  resp.every(r => !r.overflow));

// 3. Headline counts must agree across documents.
const summary = docs['EXECUTIVE_SUMMARY.md'];
const master = docs['MASTER_PROGRESS.md'];
for (const [label, pattern] of [['resolved 4', /\| \*\*4\*\*/], ['findings 14', /\| \*\*14\*\*/], ['open 9', /\| \*\*9\*\*/]]) {
  check(`summary states ${label}`, pattern.test(summary));
}
check('master agrees with the summary',
  [/\| \*\*4\*\*/, /\| \*\*14\*\*/, /\| \*\*9\*\*/].every(p => p.test(master)));

// 4. Every finding ID must be either open in the table or explicitly resolved.
const openIds = new Set([...summary.matchAll(/^\| `([A-Z]+-\d+)`/gm)].map(m => m[1]));
const sources = [['FUNCTIONAL_BUGS.md', /## (BUG-\d+)/g],
                 ['ACCESSIBILITY_FINDINGS.md', /## (A11Y-\d+)/g],
                 ['UI_UX_FINDINGS.md', /## (UX-\d+|UI-\d+)/g],
                 ['PERFORMANCE_FINDINGS.md', /## (PERF-\d+)/g]];
const register = new Set();
for (const [file, pattern] of sources) {
  for (const match of docs[file].matchAll(pattern)) register.add(match[1]);
}
const resolved = new Set(['BUG-001', 'BUG-002', 'A11Y-008', 'A11Y-009']);
const unaccounted = [...register].filter(id => !openIds.has(id) && !resolved.has(id));
check('every finding is open or resolved', unaccounted.length === 0, unaccounted.join(', '));

// 5. Required deliverables.
for (const name of ['EXECUTIVE_SUMMARY.md', 'ROOT_CAUSE_ANALYSIS.md', 'REGRESSION_TEST_PLAN.md',
                    'IMPROVEMENT_ROADMAP.md', 'ROUTE_COVERAGE.md', 'FEATURE_INVENTORY.md',
                    'INTERACTION_TESTS.md', 'RESPONSIVE_TESTING.md', 'ACCESSIBILITY_FINDINGS.md',
                    'PERFORMANCE_FINDINGS.md', 'WORKFLOW_TESTING.md', 'BLOCKERS.md']) {
  check(`deliverable: ${name}`, Boolean(docs[name]));
}
check('README links the executive summary', docs['README.md'].includes('EXECUTIVE_SUMMARY.md'));

console.log(`\n${failures.length} failure(s)`);
if (failures.length) process.exit(1);
