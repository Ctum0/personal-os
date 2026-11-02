import fs from "node:fs";
import path from "node:path";

const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]
  );

const files = walk("src").filter(
  (f) => /\.(ts|tsx)$/.test(f) && !f.includes("/tests/") && !f.includes("lib/time/")
);

let changed = 0;
let sites = 0;

for (const f of files) {
  const before = fs.readFileSync(f, "utf8");
  const hits = (before.match(/toISOString\(\)\.slice\(0,\s*10\)/g) || []).length;
  if (!hits) continue;
  let s = before;
  if (!s.includes("todayISO")) {
    const lines = s.split("\n");
    let last = -1;
    lines.forEach((l, i) => {
      if (/^import\s.+from\s+['"].+['"];?\s*$/.test(l)) last = i;
    });
    const imp = 'import { todayISO } from "@/lib/time";';
    if (last >= 0) lines.splice(last + 1, 0, imp);
    else lines.unshift(imp);
    s = lines.join("\n");
  }
  s = s.replace(/new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/g, "todayISO()");
  s = s.replace(/\bnew Date\(([^()]*)\)\.toISOString\(\)\.slice\(0,\s*10\)/g, "toISODate($1)");
  const after = (s.match(/toISOString\(\)\.slice\(0,\s*10\)/g) || []).length;
  if (after < hits) {
    if (s.includes("toISODate(") && !s.includes("toISODate,") && s.includes('import { todayISO } from "@/lib/time";')) {
      s = s.replace('import { todayISO } from "@/lib/time";', 'import { todayISO, toISODate } from "@/lib/time";');
    }
    fs.writeFileSync(f, s);
    changed++;
    sites += hits - after;
    console.log(`${f}: ${hits - after}`);
  }
}
console.log(`TOTAL files=${changed} sites=${sites}`);
