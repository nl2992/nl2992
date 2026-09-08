// Regenerates assets/banner.svg with live GitHub stats.
// Run by .github/workflows/banner.yml — needs env GITHUB_TOKEN and GH_USER.

import { writeFileSync, readFileSync, mkdirSync } from "node:fs";

const USER = process.env.GH_USER || "nl2992";
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) throw new Error("GITHUB_TOKEN not set");

const query = `
{
  user(login: "${USER}") {
    followers { totalCount }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
      totalCount
      nodes {
        stargazerCount
        languages(first: 8, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name } }
        }
      }
    }
    contributionsCollection {
      totalCommitContributions
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});
const json = await res.json();
if (json.errors) throw new Error(JSON.stringify(json.errors));
const u = json.data.user;

const repos = u.repositories.totalCount;
const stars = u.repositories.nodes.reduce((s, r) => s + r.stargazerCount, 0);
const followers = u.followers.totalCount;
const commits = u.contributionsCollection.totalCommitContributions;
const contribs = u.contributionsCollection.contributionCalendar.totalContributions;

// Current streak: consecutive days with >0 contributions, counting back from the end.
// A still-empty today doesn't break it.
// The calendar already ends at the user's own "today", so don't second-guess it with the
// runner's UTC clock — that drifts a day whenever the two timezones straddle midnight.
const days = u.contributionsCollection.contributionCalendar.weeks
  .flatMap((w) => w.contributionDays)
  .sort((a, b) => a.date.localeCompare(b.date));
let streak = 0;
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].contributionCount > 0) streak++;
  else if (i === days.length - 1) continue; // ignore an empty today
  else break;
}

// Top languages, weighted the way GitHub's own "most used languages" card is:
// the geometric mean of a language's share of bytes and its share of repos.
// Raw bytes alone lets one .ipynb (megabytes of embedded output) drown everything.
const langBytes = {};
const langRepos = {};
for (const r of u.repositories.nodes) {
  const seen = new Set();
  for (const e of r.languages?.edges || []) {
    const n = e.node.name;
    langBytes[n] = (langBytes[n] || 0) + e.size;
    if (!seen.has(n)) { langRepos[n] = (langRepos[n] || 0) + 1; seen.add(n); }
  }
}
const totalBytes = Object.values(langBytes).reduce((a, b) => a + b, 0) || 1;
const totalHits = Object.values(langRepos).reduce((a, b) => a + b, 0) || 1;
const scored = Object.keys(langBytes).map((name) => ({
  name,
  bytes: langBytes[name],
  repos: langRepos[name] || 0,
  score: Math.sqrt((langBytes[name] / totalBytes) * ((langRepos[name] || 0) / totalHits)),
}));
const scoreSum = scored.reduce((a, l) => a + l.score, 0) || 1;
for (const l of scored) l.share = +((l.score / scoreSum) * 100).toFixed(2);
scored.sort((a, b) => b.share - a.share);

const rename = { "Jupyter Notebook": "jupyter", "C++": "cpp", "C#": "csharp" };
const langs = scored.slice(0, 5).map((l) => (rename[l.name] || l.name).toLowerCase());

const fmt = (n) => n.toLocaleString("en-US");

// ---- build language pills ----
const CH = 7.8; // approx mono char width at 13px
let px = 58;
const pills = langs
  .map((l) => {
    const w = Math.round(l.length * CH + 22);
    const rect = `<rect x="${px}" y="230" width="${w}" height="24" rx="5" fill="#161b22" stroke="#30363d"/>`;
    const text = `<text x="${px + w / 2}" y="246" text-anchor="middle">${l}</text>`;
    px += w + 8;
    return rect + text;
  })
  .join("");

const statLine = `${fmt(contribs)} contributions · ${fmt(commits)} commits · ${streak}-day streak`;
const subLine = `${fmt(repos)} repos · ${fmt(stars)} stars · ${fmt(followers)} followers`;
const stamp = new Date().toISOString().slice(0, 10);

const svg = `<svg width="1200" height="300" viewBox="0 0 1200 300" fill="none" xmlns="http://www.w3.org/2000/svg" font-family="'SFMono-Regular','SF Mono',Menlo,Consolas,'Liberation Mono',monospace">
  <!-- generated ${stamp} by .github/scripts/gen-banner.mjs -->
  <defs>
    <clipPath id="round"><rect x="1" y="1" width="1198" height="298" rx="12"/></clipPath>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#27c93f"/>
      <stop offset="100%" stop-color="#27c93f" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="scan" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.03"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <g clip-path="url(#round)">
    <rect width="1200" height="300" fill="#0d1117"/>
    <circle cx="1080" cy="20" r="300" fill="url(#glow)" opacity="0.18"/>
    <rect width="1200" height="150" fill="url(#scan)"/>
    <rect width="1200" height="40" fill="#161b22"/>
    <circle cx="26" cy="20" r="6.5" fill="#ff5f56"/>
    <circle cx="50" cy="20" r="6.5" fill="#ffbd2e"/>
    <circle cx="74" cy="20" r="6.5" fill="#27c93f"/>
    <text x="600" y="25" text-anchor="middle" font-size="13" fill="#8b949e">${USER} — zsh — 120×30</text>
  </g>

  <!-- whoami -->
  <text x="34" y="78" font-size="17">
    <tspan fill="#27c93f">➜</tspan>  <tspan fill="#56d4dd">~</tspan>  <tspan fill="#c9d1d9">whoami</tspan>
  </text>
  <text x="58" y="108" font-size="21" font-weight="700" fill="#e6edf3">${USER}</text>
  <text x="58" y="130" font-size="12" fill="#6e7681">${subLine}</text>

  <!-- stats -->
  <text x="34" y="164" font-size="17">
    <tspan fill="#27c93f">➜</tspan>  <tspan fill="#56d4dd">~</tspan>  <tspan fill="#c9d1d9">gh-stats --since=1y</tspan>
  </text>
  <text x="58" y="192" font-size="14" fill="#8b949e">${statLine}</text>

  <!-- stack -->
  <text x="34" y="224" font-size="17">
    <tspan fill="#27c93f">➜</tspan>  <tspan fill="#56d4dd">~</tspan>  <tspan fill="#c9d1d9">ls ~/stack</tspan>
  </text>
  <g font-size="13" fill="#7ee787">${pills}</g>

  <!-- prompt + cursor -->
  <text x="34" y="288" font-size="17">
    <tspan fill="#27c93f">➜</tspan>  <tspan fill="#56d4dd">~</tspan>
  </text>
  <rect x="74" y="276" width="9" height="15" fill="#c9d1d9">
    <animate attributeName="opacity" values="1;1;0;0" dur="1.06s" repeatCount="indefinite"/>
  </rect>

  <rect x="1" y="1" width="1198" height="298" rx="12" fill="none" stroke="#30363d" stroke-width="1"/>
</svg>
`;

const PATH = "assets/banner.svg";
const prev = (() => { try { return readFileSync(PATH, "utf8"); } catch { return ""; } })();
// ignore the date-stamp comment when deciding if anything changed
const strip = (s) => s.replace(/<!-- generated.*?-->/, "");
if (strip(prev) === strip(svg)) {
  console.log("banner unchanged");
} else {
  writeFileSync(PATH, svg);
  console.log("banner updated:", { repos, stars, followers, commits, contribs, streak, langs });
}

// ---- stats the REST API can't give the browser (contributions, streak, language bytes) ----
// consumed by docs/index.html; live repo/star/follower counts are fetched client-side.
const STATS = "docs/stats.json";
const topLangs = scored.slice(0, 8).map(({ name, bytes, repos, share }) => ({ name, bytes, repos, share }));
const statsDoc = { contribs, commits, streak, repos, stars, followers, topLangs };
const prevStats = (() => { try { return JSON.parse(readFileSync(STATS, "utf8")); } catch { return null; } })();
const same = prevStats && JSON.stringify({ ...prevStats, generated: 0 }) === JSON.stringify({ ...statsDoc, generated: 0 });
if (same) {
  console.log("stats.json unchanged");
} else {
  mkdirSync("docs", { recursive: true });
  writeFileSync(STATS, JSON.stringify({ ...statsDoc, generated: new Date().toISOString() }, null, 2) + "\n");
  console.log("stats.json updated");
}
