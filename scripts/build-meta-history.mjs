// Maintenance script: rebuild the two-window usage history for one regulation.
// Usage: node scripts/build-meta-history.mjs [regulation]   -> src/meta-history.data.ts
//
// `compare_meta` answers "what is changing?", and the server must stay a pure
// offline read, so the comparison is computed here and committed: the last
// seven days of tournaments against the seven before them, aggregated from the
// same source the threat list uses.
//
// Data flow:
//   * MunchStats' aggregator index (`/limitless/api/<reg>/<minPlayers>/?cut=all`)
//     supplies the list of tournaments that count — organisers tag Champions
//     events as PTCG/VGC, CUSTOM or M-B, so the aggregator's own included list
//     is the reliable filter (never the `format` field).
//   * Limitless TCG's public API (play.limitlesstcg.com/api) serves each
//     tournament's standings with full Champions teamlists — six members, each
//     with species, item, ability, nature and four attacks. One request per
//     tournament in the 14-day window.
//
// Output per window: share of teams carrying each base species (Species Clause
// is per dex number), and the most common species pairs, so "emerging cores"
// are measured co-occurrence, not opinion. A species or pair must cross 3% in
// at least one window to be reported.
import { writeFileSync } from 'node:fs';
import { Dex } from '@pkmn/dex';

const dex = Dex.mod('gen9');
const AGG = 'https://www.munchstats.com';
const LIMITLESS = 'https://play.limitlesstcg.com/api';
const UA = 'getcompetitive-history/1.0 (+https://github.com/mriver15/getcompetitive)';
const regulation = (process.argv[2] ?? 'm-c').toLowerCase();
const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const windowStart = (daysAgo) => new Date(now - daysAgo * DAY).toISOString().slice(0, 10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const index = await (
  await fetch(`${AGG}/limitless/api/${regulation}/25/?cut=all`, { headers: { 'user-agent': UA } })
).json();

// Only the tournaments inside the 14-day window matter; the rest is the
// history's past and the future's current window.
const recent = index.included_tournaments.filter((t) => {
  const d = Date.parse(t.date);
  return d > now - 14 * DAY && d <= now;
});
console.log(`Aggregator lists ${index.included_tournaments.length} tournaments; ${recent.length} fall in the last 14 days.`);

const teamsInWindow = { current: [], previous: [] };
const skipped = [];
for (const t of recent) {
  const bucket = Date.parse(t.date) > now - 7 * DAY ? 'current' : 'previous';
  let standings;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(`${LIMITLESS}/tournaments/${t.id}/standings`, { headers: { 'user-agent': UA } });
      if (r.status === 429 || r.status >= 500) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      standings = await r.json();
      break;
    } catch (e) {
      if (attempt === 3) {
        skipped.push(`${t.name} (${t.id}): ${e.message}`);
        console.warn(`  skipping ${t.name} (${t.id}): ${e.message}`);
      } else {
        await sleep(1500 * (attempt + 1));
      }
    }
  }
  if (!standings) continue;
  for (const row of standings) {
    const list = row.decklist ?? row.list ?? {};
    const members = (Array.isArray(list) ? list : Object.values(list)).filter((m) => m && m.name);
    if (members.length) teamsInWindow[bucket].push({ date: t.date, members });
  }
  await sleep(250);
}

const speciesOf = (members) => {
  const set = new Set();
  for (const m of members) {
    const s = dex.species.get(m.name);
    if (s.exists) set.add(s.baseSpecies ?? s.name);
  }
  return set;
};

function aggregate(teams) {
  const usage = new Map();
  const pairs = new Map();
  for (const team of teams) {
    const base = [...speciesOf(team.members)];
    for (const b of base) usage.set(b, (usage.get(b) ?? 0) + 1);
    for (let i = 0; i < base.length; i++) {
      for (let j = i + 1; j < base.length; j++) {
        const key = [base[i], base[j]].sort().join(' + ');
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
  }
  const pct = (n) => (teams.length ? Number(((n / teams.length) * 100).toFixed(1)) : 0);
  return {
    teams: teams.length,
    usage: new Map([...usage].map(([k, n]) => [k, pct(n)])),
    pairs: new Map([...pairs].map(([k, n]) => [k, pct(n)])),
  };
}

const cur = aggregate(teamsInWindow.current);
const prev = aggregate(teamsInWindow.previous);

// Completeness gate: the aggregator's own player counts say how many teamlists
// each window should contain. A partial fetch must not ship silently.
const expected = (bucket) => recent.filter((t) => (Date.parse(t.date) > now - 7 * DAY ? bucket === 'current' : bucket === 'previous')).reduce((a, t) => a + t.players, 0);
if (skipped.length) {
  console.error(`INCOMPLETE: ${skipped.length} tournament${skipped.length === 1 ? '' : 's'} skipped — no data file written.`);
  process.exit(1);
}
console.log(
  `Completeness: current ${cur.teams} of ~${expected('current')} expected teamlists, previous ${prev.teams} of ~${expected('previous')} (drops and byes make counted less than listed players).`,
);

const species = [];
for (const [name, pct] of cur.usage) {
  const before = prev.usage.get(name) ?? 0;
  if (pct >= 3 || before >= 3) species.push({ species: name, current: pct, previous: before });
}
species.sort((a, b) => b.current - b.previous - (a.current - a.previous));

const cores = [];
for (const [core, pct] of cur.pairs) {
  const before = prev.pairs.get(core) ?? 0;
  if (pct >= 3 || before >= 3) cores.push({ core: core.split(' + '), current: pct, previous: before });
}
cores.sort((a, b) => b.current - b.previous - (a.current - a.previous));

const out = {
  regulation,
  name: index.selected_format_name ?? `Regulation Set ${regulation.toUpperCase()}`,
  source: 'usage',
  sourceAsOf: new Date().toISOString().slice(0, 10),
  note: `Computed from ${cur.teams} teams across ${recent.filter((t) => Date.parse(t.date) > now - 7 * DAY).length} tournaments in the last 7 days and ${prev.teams} teams across the 7 days before that. Windows are rolling: regenerate to slide them forward.`,
  windows: {
    current: { start: windowStart(7), end: windowStart(0), teams: cur.teams },
    previous: { start: windowStart(14), end: windowStart(7), teams: prev.teams },
  },
  species: species.slice(0, 40),
  cores: cores.slice(0, 20),
};

writeFileSync(
  new URL('../src/meta-history.data.ts', import.meta.url),
  [
    '// Generated by scripts/build-meta-history.mjs — do not edit by hand.',
    '// Two 7-day windows of measured usage (last 7 days vs the 7 before) for',
    '// `compare_meta`, keyed by regulation id: per-species usage share and the',
    '// most common species pairs, aggregated from the same tournament source the',
    '// threat list uses. Regenerate with `node scripts/build-meta-history.mjs <regulation>`.',
    `export default { ${JSON.stringify(regulation)}: ${JSON.stringify(out, null, 2)} } as const;`,
    '',
  ].join('\n'),
);

console.log(`Wrote src/meta-history.data.ts: ${cur.teams} teams (current window) vs ${prev.teams} (previous).`);
const up = species.filter((s) => s.current > s.previous).length;
console.log(`Species reported: ${species.length} (${up} rising). Cores reported: ${cores.length}.`);
