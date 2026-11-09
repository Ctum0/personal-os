import { JSDOM } from 'jsdom';
import axe from 'axe-core';

const routes = [
  '/',
  '/productivity/today',
  '/productivity/plan',
  '/productivity/tasks',
  '/productivity/projects',
  '/productivity/calendar',
  '/productivity/inbox',
  '/productivity/habits',
  '/productivity/focus',
  '/productivity/goals',
  '/productivity/analytics',
  '/productivity/insights',
  '/productivity/weekly-review',
  '/finance',
  '/finance/accounts',
  '/finance/transactions',
  '/finance/budgets',
  '/finance/savings',
  '/finance/debts',
  '/finance/recurring',
  '/finance/reports',
  '/finance/net-worth',
  '/finance/import',
  '/overview',
  '/overview/metrics',
  '/overview/settings',
  '/overview/ai-governance',
  '/overview/backup',
  '/overview/formulas'
];

async function auditRoute(route) {
  const port = process.env.PORT || 3000;
  const url = `http://localhost:${port}${route}`;
  const res = await fetch(url);
  const html = await res.text();
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  
  // Inject axe source into JSDOM window
  dom.window.eval(axe.source);
  
  const results = await dom.window.axe.run(dom.window.document.documentElement, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
    }
  });

  return {
    route,
    violations: results.violations.map(v => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.length
    }))
  };
}

async function main() {
  console.log(`Running axe-core ${axe.version} audit across ${routes.length} routes...`);
  const allResults = [];
  
  for (const route of routes) {
    try {
      const res = await auditRoute(route);
      allResults.push(res);
      console.log(`\nRoute: ${route}`);
      if (res.violations.length === 0) {
        console.log('  ✓ 0 violations found!');
      } else {
        console.log(`  ⚠ ${res.violations.length} violation(s):`);
        for (const v of res.violations) {
          console.log(`    - [${v.impact?.toUpperCase()}] ${v.id}: ${v.description} (${v.nodes} nodes)`);
        }
      }
    } catch (err) {
      console.error(`Error auditing ${route}:`, err.message);
    }
  }

  const totalViolations = allResults.reduce((sum, r) => sum + r.violations.length, 0);
  console.log(`\n========================================`);
  console.log(`Audit complete. Total violations across all routes: ${totalViolations}`);
  console.log(`========================================`);
}

main().catch(console.error);
