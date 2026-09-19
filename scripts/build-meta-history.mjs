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
  const sets = new Map();
  for (const team of teams) {
    const base = [...speciesOf(team.members)];
    for (const b of base) usage.set(b, (usage.get(b) ?? 0) + 1);
    for (let i = 0; i < base.length; i++) {
      for (let j = i + 1; j < base.length; j++) {
        const key = [base[i], base[j]].sort().join(' + ');
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
    // Per-window set aggregation, one member per base species: the most-played
    // item, ability, nature and moves become the "set" that window played.
    const byBase = new Map();
    for (const m of team.members) {
      const s = dex.species.get(m.name);
      if (!s.exists) continue;
      const baseName = s.baseSpecies ?? s.name;
      if (!byBase.has(baseName)) byBase.set(baseName, m);
    }
    for (const [baseName, m] of byBase) {
      const rec = sets.get(baseName) ?? { item: new Map(), ability: new Map(), nature: new Map(), moves: new Map() };
      rec.item.set(m.item ?? '', (rec.item.get(m.item ?? '') ?? 0) + 1);
      rec.ability.set(m.ability ?? '', (rec.ability.get(m.ability ?? '') ?? 0) + 1);
      rec.nature.set(m.nature ?? '', (rec.nature.get(m.nature ?? '') ?? 0) + 1);
      for (const a of m.attacks ?? []) rec.moves.set(a, (rec.moves.get(a) ?? 0) + 1);
      sets.set(baseName, rec);
    }
  }
  const pct = (n) => (teams.length ? Number(((n / teams.length) * 100).toFixed(1)) : 0);
  const topOf = (map) => (map.size ? [...map].sort((a, b) => b[1] - a[1])[0][0] : null);
  return {
    teams: teams.length,
    usage: new Map([...usage].map(([k, n]) => [k, pct(n)])),
    pairs: new Map([...pairs].map(([k, n]) => [k, pct(n)])),
    sets: new Map([...sets].map(([k, rec]) => [k, {
      item: topOf(rec.item),
      ability: topOf(rec.ability),
      nature: topOf(rec.nature),
      moves: [...rec.moves].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([m]) => m),
    }])),
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

const rankOf = (usage) => {
  const sorted = [...usage].sort((a, b) => b[1] - a[1]);
  return new Map(sorted.map(([k], i) => [k, i + 1]));
};
const curRank = rankOf(cur.usage);
const prevRank = rankOf(prev.usage);

const species = [];
for (const [name, pct] of cur.usage) {
  const before = prev.usage.get(name) ?? 0;
  if (pct >= 3 || before >= 3) {
    species.push({
      species: name,
      current: pct,
      previous: before,
      rankDelta: (prevRank.get(name) ?? 0) - (curRank.get(name) ?? 0),
    });
  }
}
species.sort((a, b) => b.current - b.previous - (a.current - a.previous));

// Lift: P(A,B) / (P(A) * P(B)), so 1.0 means independent and values above 1.0
// mean the pair appears together more than popularity alone explains.
const liftOf = (pairPct, ua, ub) => (ua > 0 && ub > 0 ? Number((pairPct / (((ua / 100) * (ub / 100)) * 100)).toFixed(2)) : 0);

const cores = [];
for (const [core, pct] of cur.pairs) {
  const before = prev.pairs.get(core) ?? 0;
  if (pct >= 3 || before >= 3) {
    const [a, b] = core.split(' + ');
    cores.push({
      core: [a, b],
      current: pct,
      previous: before,
      liftCurrent: liftOf(pct, cur.usage.get(a) ?? 0, cur.usage.get(b) ?? 0),
      liftPrevious: liftOf(before, prev.usage.get(a) ?? 0, prev.usage.get(b) ?? 0),
    });
  }
}
cores.sort((a, b) => b.current - b.previous - (a.current - a.previous));

// Set changes: species whose most-played item, ability or nature moved between
// the windows — "what it runs" changing, not just "how much of it" changing.
const setChanges = [];
for (const s of species.filter((x) => Math.abs(x.current - x.previous) >= 2).slice(0, 20)) {
  const now = cur.sets.get(s.species);
  const then = prev.sets.get(s.species);
  if (!now || !then) continue;
  const change = (a, b) => (a !== b && a != null && b != null ? { from: b, to: a } : null);
  const entry = {
    species: s.species,
    item: change(now.item, then.item),
    ability: change(now.ability, then.ability),
    nature: change(now.nature, then.nature),
  };
  if (entry.item || entry.ability || entry.nature) setChanges.push(entry);
}

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
  setChanges,
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
