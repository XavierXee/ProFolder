// Turns Vitest's coverage/coverage-summary.json into a Markdown table (total, plus one row per
// area of the codebase) for the GitHub Actions job summary. Usage:
//   node .github/scripts/coverage-summary.mjs >> "$GITHUB_STEP_SUMMARY"
import fs from "node:fs";
import path from "node:path";

const summary = JSON.parse(fs.readFileSync("coverage/coverage-summary.json", "utf8"));
const METRICS = ["lines", "statements", "branches", "functions"];
const AREAS = [
  ["Backend", "src/"],
  ["Frontend", "frontend/src/"],
  ["Electron", "electron/"],
];

function emptyTotals() {
  return Object.fromEntries(METRICS.map((m) => [m, { covered: 0, total: 0 }]));
}

const byArea = new Map(AREAS.map(([name]) => [name, emptyTotals()]));
for (const [file, data] of Object.entries(summary)) {
  if (file === "total") continue;
  const relative = path.relative(process.cwd(), file);
  const area = AREAS.find(([, prefix]) => relative.startsWith(prefix));
  if (!area) continue;
  const totals = byArea.get(area[0]);
  for (const m of METRICS) {
    totals[m].covered += data[m].covered;
    totals[m].total += data[m].total;
  }
}

const pct = ({ covered, total }) => (total === 0 ? "—" : `${((covered / total) * 100).toFixed(1)}%`);
const row = (label, totals) => `| ${label} | ${METRICS.map((m) => pct(totals[m])).join(" | ")} |`;

const lines = [
  "## Unit test coverage",
  "",
  `| Area | ${METRICS.map((m) => m[0].toUpperCase() + m.slice(1)).join(" | ")} |`,
  `|---|${METRICS.map(() => "---:").join("|")}|`,
  row("**Total**", summary.total),
  ...AREAS.map(([name]) => row(name, byArea.get(name))),
  "",
  "The full HTML report is attached to this run as the `coverage-report` artifact.",
];
console.log(lines.join("\n"));
