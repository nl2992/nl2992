// Regenerates assets/streak.svg — total contributions, current streak, longest streak.
// Replaces streak-stats.demolab.com, which ships cache-control: max-age=86400 and so
// sits a full day stale behind GitHub's image proxy.
// Run by .github/workflows/banner.yml — needs env GITHUB_TOKEN and GH_USER.

import { writeFileSync, readFileSync } from "node:fs";

const USER = process.env.GH_USER || "nl2992";
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) throw new Error("GITHUB_TOKEN not set");

async function gql(query) {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

// A contributionsCollection spans at most one year, so alias one per year since signup.
const { user: { createdAt } } = await gql(`{ user(login:"${USER}") { createdAt } }`);
const firstYear = new Date(createdAt).getUTCFullYear();
const thisYear = new Date().getUTCFullYear();
const years = [];
for (let y = firstYear; y <= thisYear; y++) years.push(y);

// Cap the current year at "now" — asking for the whole year returns the remaining
// months as empty days, and a tail of zeroes reads as a broken streak.
const nowIso = new Date().toISOString().replace(/\.\d+Z$/, "Z");
const slices = years.map((y) => {
  const to = y === thisYear ? nowIso : `${y}-12-31T23:59:59Z`;
  return `y${y}: contributionsCollection(from:"${y}-01-01T00:00:00Z", to:"${to}") {
     contributionCalendar { weeks { contributionDays { date contributionCount } } } }`;
}).join("\n");

const data = await gql(`{ user(login:"${USER}") { ${slices} } }`);

// merge every year into one date-sorted list, de-duplicated
const byDate = new Map();
for (const y of years) {
  for (const w of data.user[`y${y}`].contributionCalendar.weeks) {
    for (const d of w.contributionDays) byDate.set(d.date, d.contributionCount);
  }
}
const days = [...byDate.entries()].map(([date, count]) => ({ date, count }))
  .sort((a, b) => a.date.localeCompare(b.date));

const total = days.reduce((s, d) => s + d.count, 0);

// current streak: back from the end; a still-empty today doesn't break it
let cur = 0, curFrom = null, curTo = null;
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].count > 0) {
    if (!curTo) curTo = days[i].date;
    curFrom = days[i].date;
    cur++;
  } else if (i === days.length - 1) continue; // today hasn't happened yet
  else break;
}

// longest streak across all history
let best = 0, bestFrom = null, bestTo = null, run = 0, runFrom = null;
for (const d of days) {
  if (d.count > 0) {
    if (run === 0) runFrom = d.date;
    run++;
    if (run > best) { best = run; bestFrom = runFrom; bestTo = d.date; }
  } else run = 0;
}

const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const nice = (iso) => { const [y, m, d] = iso.split("-"); return `${MON[+m - 1]} ${+d}, ${y}`; };
const short = (iso) => { const [, m, d] = iso.split("-"); return `${MON[+m - 1]} ${+d}`; };
const range = (a, b) => (!a ? "—" : a === b ? short(a) : `${short(a)} - ${short(b)}`);
const fmt = (n) => n.toLocaleString("en-US");

const firstDay = days.find((d) => d.count > 0)?.date || createdAt.slice(0, 10);

const W = 470, H = 180;
const cols = [78, 235, 392];

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" xmlns="http://www.w3.org/2000/svg" font-family="'SFMono-Regular','SF Mono',Menlo,Consolas,'Liberation Mono',monospace">
  <!-- generated ${new Date().toISOString().slice(0, 10)} by .github/scripts/gen-streak.mjs -->
  <rect width="${W}" height="${H}" fill="#0d1117" rx="6"/>
  <line x1="157" y1="34" x2="157" y2="150" stroke="#30363d" stroke-width="1"/>
  <line x1="313" y1="34" x2="313" y2="150" stroke="#30363d" stroke-width="1"/>

  <!-- total contributions -->
  <text x="${cols[0]}" y="80" text-anchor="middle" font-size="30" font-weight="700" fill="#c9d1d9">${fmt(total)}</text>
  <text x="${cols[0]}" y="106" text-anchor="middle" font-size="12" fill="#8b949e">Total Contributions</text>
  <text x="${cols[0]}" y="127" text-anchor="middle" font-size="10" fill="#6e7681">${nice(firstDay)} - Present</text>

  <!-- current streak -->
  <g transform="translate(${cols[1] - 9}, 10) scale(0.75)">
    <path d="M12 23c-4.4 0-8-3.4-8-7.7 0-3.5 2-6.3 4-8.9.9-1.1 1.7-2.3 2.1-3.6.5 1.7 1.4 3 2.6 4.2 2.1 2.1 3.9 4.6 3.9 8.3 0 4.3-3.6 7.7-8 7.7z" fill="#27c93f"/>
    <path d="M12 23c-2.2 0-4-1.7-4-3.9 0-1.7 1-3 2-4.3.5-.6.9-1.2 1.1-1.8.3.9.8 1.5 1.4 2.1 1 1 1.9 2.3 1.9 4.1 0 2.1-1.8 3.8-4 3.8z" fill="#0d1117" opacity=".55"/>
  </g>
  <circle cx="${cols[1]}" cy="72" r="34" fill="none" stroke="#27c93f" stroke-width="4.5"/>
  <text x="${cols[1]}" y="82" text-anchor="middle" font-size="26" font-weight="700" fill="#c9d1d9">${fmt(cur)}</text>
  <text x="${cols[1]}" y="128" text-anchor="middle" font-size="12" font-weight="700" fill="#27c93f">Current Streak</text>
  <text x="${cols[1]}" y="148" text-anchor="middle" font-size="10" fill="#6e7681">${range(curFrom, curTo)}</text>

  <!-- longest streak -->
  <text x="${cols[2]}" y="80" text-anchor="middle" font-size="30" font-weight="700" fill="#c9d1d9">${fmt(best)}</text>
  <text x="${cols[2]}" y="106" text-anchor="middle" font-size="12" fill="#8b949e">Longest Streak</text>
  <text x="${cols[2]}" y="127" text-anchor="middle" font-size="10" fill="#6e7681">${range(bestFrom, bestTo)}</text>
</svg>
`;

const PATH = "assets/streak.svg";
const prev = (() => { try { return readFileSync(PATH, "utf8"); } catch { return ""; } })();
const strip = (s) => s.replace(/<!-- generated.*?-->/, "");
if (strip(prev) === strip(svg)) {
  console.log("streak unchanged");
} else {
  writeFileSync(PATH, svg);
  console.log("streak updated:", { total, cur, curRange: range(curFrom, curTo), best, bestRange: range(bestFrom, bestTo) });
}
