// Maintenance script: rebuild the usage-derived threat list for one regulation.
// Usage: node scripts/build-threats.mjs [regulation] [--top=N] [--min-players=N]
//        -> writes src/threats.data.ts
//
// Two public, no-auth sources back the output:
//   * Limitless VGC online tournaments, read through MunchStats' aggregator
//     (`/limitless/api/<REGULATION>/<minPlayers>/` and `.../<Species>`). These
//     carry species usage plus the item, ability, nature and move distribution
//     for each species, tagged with the regulation they were played under.
//   * MunchStats' in-game ranked ladder (`/api/championsdoubles/0/<Species>`),
//     the only public source for the EV spread Champions players actually run.
//
// Upstream note: MunchStats reads Limitless TCG ("Data from Limitless TCG"),
// whose own API at play.limitlesstcg.com/api (docs:
// docs.limitlesstcg.com/developer/tournaments) serves the same tournaments with
// full teamlists and needs no key — that is what to aggregate from directly if
// the aggregator's shape ever changes. As of 2026-09-17 a hand aggregation of it
// reproduced this ranking within ~2 points of usage per species. Do NOT filter
// those events by their `format` field: organisers tag M-C events as "CUSTOM" or
// "M-B", so the regulation's start date is the reliable filter.
//
// Species are collapsed to base species by National Pokedex number, because
// VGC Species Clause is per dex number and the regulation rosters are stored
// that way; the form with the highest usage supplies the set.
//
// Champions budgets stat points differently from Gen 9 (66 points total, max 32
// per stat) whereas the calculate_* tools take 0-252 EVs under a 510 cap, so
// toEvs converts at 8 EVs per point and trims the largest stats until the
// spread fits. Every field here is measured usage, never editorial judgement.
import { Dex } from '@pkmn/dex';
import { writeFileSync } from 'node:fs';

const API = 'https://www.munchstats.com';
const LADDER = 'championsdoubles';
const UA = 'getcompetitive-threats/1.0 (+https://github.com/mriver15/getcompetitive)';

/** Stat ids in the order the source writes a spread: hp/atk/def/spa/spd/spe. */
const EV_STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
/** EV per Champions stat point: 32 points is the per-stat maximum, 252 the EV cap. */
const EV_PER_POINT = 8;
/** Total EV budget the calculate_* tools enforce. */
const EV_BUDGET = 510;
/** Tier bands by usage rank: format-defining, core, and the rest of the list. */
const TIER_BANDS = { S: 5, A: 12 };
/** A pivot move marks the difference between "Fake Out support" and "Fake Out pivot". */
const PIVOT_MOVES = ['U-turn', 'Volt Switch', 'Flip Turn', 'Parting Shot', 'Teleport'];
const SETUP_MOVES = [
  'Dragon Dance', 'Swords Dance', 'Nasty Plot', 'Calm Mind', 'Bulk Up', 'Iron Defense',
  'Quiver Dance', 'Shell Smash', 'Shift Gear', 'Belly Drum', 'Agility', 'Rock Polish',
  'Coil', 'Work Up', 'Growth', 'Howl', 'Victory Dance', 'Take Heart', 'Clangorous Soul',
];
/** Ability -> role, for the abilities that define what a set is for. */
const ABILITY_ROLES = {
  Drizzle: 'Rain setter',
  Drought: 'Sun setter',
  'Sand Stream': 'Sand setter',
  'Snow Warning': 'Snow setter',
  'Grassy Surge': 'Grassy Terrain setter',
  'Electric Surge': 'Electric Terrain setter',
  'Psychic Surge': 'Psychic Terrain setter',
  'Misty Surge': 'Misty Terrain setter',
  Prankster: 'Prankster support',
  Intimidate: 'Intimidate pivot',
};

function parseArgs(argv) {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const flag = (name, fallback) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? Number(hit.slice(name.length + 3)) : fallback;
  };
  return {
    regulation: (positional[0] ?? 'm-c').toLowerCase(),
    top: flag('top', 24),
    minPlayers: flag('min-players', 25),
  };
}

async function getJson(path) {
  const res = await fetch(API + path, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

/** `[name, usagePercent]` pairs, ignoring any species the dex cannot resolve. */
function usagePairs(rows, dex) {
  const out = [];
  for (const [name, usage] of rows) {
    const s = dex.species.get(name);
    if (!s.exists) {
      console.warn(`  skipping unresolved species "${name}"`);
      continue;
    }
    out.push({ form: s.name, num: s.num, base: s.baseSpecies, forme: s.forme || '', usage: Number(usage) });
  }
  return out;
}

/**
 * Collapse form rows into one entry per base species, since Species Clause is
 * per dex number. The highest-usage form determines the set that gets reported.
 */
function groupBySpecies(pairs) {
  const groups = new Map();
  for (const p of pairs) {
    const g = groups.get(p.num) ?? { num: p.num, base: p.base, total: 0, forms: [] };
    g.total += p.usage;
    g.forms.push(p);
    groups.set(p.num, g);
  }
  for (const g of groups.values()) {
    g.forms.sort((a, b) => b.usage - a.usage);
    g.total = Number(g.total.toFixed(1));
  }
  return [...groups.values()].sort((a, b) => b.total - a.total);
}

/**
 * The same spread in Champions' own stat points, dropping stats left at 0. This
 * is the authoritative form — the game's training screen takes it, and it is
 * what the 252-scale `evs` above was derived from, so it survives the trim that
 * fitting the 510 EV budget forces.
 */
function toPoints(spec) {
  const points = {};
  spec.split('/').forEach((p, i) => {
    const n = Number(p);
    if (n > 0) points[EV_STATS[i]] = n;
  });
  return points;
}

/** Convert a Champions stat-point spread to the 252-scale the calc tools take. */
function toEvs(spec) {
  const evs = spec.split('/').map((p) => Math.min(252, Number(p) * EV_PER_POINT));
  const total = () => evs.reduce((a, b) => a + b, 0);
  while (total() > EV_BUDGET) {
    let largest = 0;
    for (let i = 1; i < evs.length; i++) if (evs[i] > evs[largest]) largest = i;
    if (evs[largest] === 0) break;
    evs[largest] -= 4;
  }
  return Object.fromEntries(EV_STATS.map((k, i) => [k, evs[i]]).filter(([, v]) => v > 0));
}

/** First entry of a `[name, percent]` distribution, as `{ name, usage }`. */
function top(rows) {
  return rows.length ? { name: rows[0][0], usage: Number(rows[0][1]) } : undefined;
}

/**
 * Role read off the resolved set — which ability it leans on and what it does
 * with it. `ability` must be the ability the set actually plays with, i.e. the
 * Mega ability for a Mega set: Intimidate only describes the switch-in turn.
 */
function deriveRole(dex, { ability, nature, moves, mega }) {
  const damaging = moves
    .map((m) => dex.moves.get(m))
    .filter((m) => m.exists && m.category !== 'Status');
  const physical = damaging.filter((m) => m.category === 'Physical').length;
  const special = damaging.filter((m) => m.category === 'Special').length;
  const plus = dex.natures.get(nature).plus;

  let kind;
  if (physical !== special) kind = physical > special ? 'Physical' : 'Special';
  else kind = plus === 'atk' ? 'Physical' : plus === 'spa' ? 'Special' : 'Mixed';
  const breaker = `${kind} attacker`;

  const byAbility = ABILITY_ROLES[ability];
  let role;
  if (byAbility) role = byAbility;
  else if (moves.includes('Trick Room')) role = 'Trick Room setter';
  else if (moves.includes('Tailwind')) role = 'Tailwind setter';
  else if (moves.some((m) => m === 'Follow Me' || m === 'Rage Powder')) role = 'Redirector support';
  else if (moves.includes('Fake Out')) {
    role = moves.some((m) => PIVOT_MOVES.includes(m)) ? 'Fake Out pivot' : 'Fake Out support';
  } else if (moves.some((m) => SETUP_MOVES.includes(m))) role = `${kind} setup sweeper`;
  else if (!damaging.length) role = 'Support';
  else role = breaker;

  return mega ? `Mega ${role}` : role;
}

function tierFor(rank) {
  if (rank <= TIER_BANDS.S) return 'S';
  if (rank <= TIER_BANDS.A) return 'A';
  return 'B';
}

/**
 * Independent second opinion on the ordering. Pikalytics publishes its own
 * ranked usage for the same regulation from Showdown play, so a high overlap
 * with the tournament ranking means the list is not an artefact of one sample.
 * Best-effort: a failure only drops the corroboration block.
 */
async function corroborate(regulation, dex, groups) {
  const format = `gen9championsvgc2026reg${regulation.replace(/[^a-z0-9]/g, '')}`;
  const months = [];
  const now = new Date();
  for (let i = 0; i < 8; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }

  const otherTop10 = new Set();
  let month;
  try {
    for (month of months) {
      const res = await fetch(`https://www.pikalytics.com/api/l/${month}/${format}-1760`, {
        headers: { 'user-agent': UA },
      });
      if (!res.ok) continue;
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) continue;
      for (const name of rows.map((r) => dex.species.get(r.name)).filter((s) => s.exists).map((s) => s.baseSpecies)) {
        if (otherTop10.size < 10) otherTop10.add(name);
      }
      if (otherTop10.size) break;
    }
  } catch (err) {
    console.warn(`Corroboration: Pikalytics unavailable (${err.message}), skipping`);
    return undefined;
  }
  if (!otherTop10.size) {
    console.warn('Corroboration: Pikalytics published no data for a recent month, skipping');
    return undefined;
  }

  const onlyHere = groups.slice(0, 10).filter((g) => !otherTop10.has(g.base)).map((g) => g.base);
  const overlap = 10 - onlyHere.length;
  console.log(
    `Corroboration: ${overlap}/10 of the top 10 also rank in Pikalytics' ${month} top 10` +
      (onlyHere.length ? ` (only here: ${onlyHere.join(', ')})` : ''),
  );

  return {
    source: 'Pikalytics',
    url: `https://www.pikalytics.com/pokedex/${format}`,
    dataDate: month,
    top10Overlap: overlap,
  };
}

const { regulation, top: topN, minPlayers } = parseArgs(process.argv.slice(2));
const dex = Dex.forGen(9);

console.log(`Building threat list for ${regulation} (top ${topN}, min ${minPlayers} players)\n`);

const index = await getJson(`/limitless/api/${regulation}/${minPlayers}/?cut=all`);
if (index.selected_format_id !== regulation.toUpperCase() && index.selected_format_id !== regulation) {
  throw new Error(
    `Source returned format "${index.selected_format_id}" for "${regulation}". ` +
      `Known formats: ${index.formats.map((f) => f[0]).join(', ')}.`,
  );
}

const sample = {
  teams: index.total_teams,
  tournaments: index.tournament_count,
  minPlayers: index.min_players,
  windowDays: index.window_days,
  through: index.included_tournaments.map((t) => t.date.slice(0, 10)).sort().at(-1),
};
console.log(
  `Sample: ${sample.teams} teams from ${sample.tournaments} tournaments, through ${sample.through} ` +
    `(${index.attribution})\n`,
);

const groups = groupBySpecies(usagePairs(index.pokemon_names, dex)).slice(0, topN);
console.log(`Resolved ${groups.length} base species of ${index.pokemon_names.length} form rows`);

const corroboration = await corroborate(regulation, dex, groups);
console.log();

const threats = [];
for (const [i, g] of groups.entries()) {
  const form = g.forms[0].form;
  const detail = await getJson(
    `/limitless/api/${regulation}/${minPlayers}/${encodeURIComponent(form)}?cut=all`,
  );
  if (detail.current_pokemon[0] !== form) {
    console.warn(`  ${form}: source resolved to ${detail.current_pokemon[0]}, skipping`);
    continue;
  }

  const item = top(detail.items_list);
  const ability = top(detail.abilities_list);
  const nature = top(detail.natures_list);
  const moves = detail.moves_list.slice(0, 4).map((m) => m[0]);
  const species = dex.species.get(form);
  const mega = species.forme.startsWith('Mega');
  const megaAbility = mega ? species.abilities['0'] : undefined;

  // The spread is the only field the tournament data lacks; fall back to the
  // in-game ladder, which publishes it in Champions stat points.
  let evs;
  let championsPoints;
  try {
    const ladder = await getJson(`/api/${LADDER}/0/${encodeURIComponent(g.base)}`);
    const spread = ladder.spreads_list?.[0]?.[0];
    if (spread) {
      evs = toEvs(spread);
      championsPoints = toPoints(spread);
    }
  } catch (err) {
    console.warn(`  ${form}: no spread data (${err.message})`);
  }

  // Pre-Mega abilities describe only the switch-in turn, so read the role off
  // whichever ability the set actually plays with.
  const role = deriveRole(dex, { ability: megaAbility ?? ability.name, nature: nature.name, moves, mega });
  const usage = g.total;
  const rank = i + 1;
  const sets = `item ${item.name} ${item.usage}%, ability ${ability.name} ${ability.usage}%, nature ${nature.name} ${nature.usage}%`;
  const spread = evs ? `; spread ${Object.entries(evs).map(([k, v]) => `${v} ${k}`).join(' / ')}` : '';
  const notes =
    `${usage}% usage across ${sample.teams.toLocaleString('en-US')} teams in ${sample.tournaments} ` +
    `${regulation.toUpperCase()} tournaments (through ${sample.through}); ${sets}${spread}.`;

  threats.push({
    species: g.base,
    ...(form === g.base ? {} : mega ? { megaForm: species.name } : { form }),
    role,
    tier: tierFor(rank),
    rank,
    usage,
    item: item.name,
    ability: ability.name,
    ...(mega ? { megaAbility: species.abilities['0'] } : {}),
    nature: nature.name,
    ...(evs ? { evs, championsPoints } : {}),
    moves,
    notes,
  });
  console.log(
    `  #${String(rank).padStart(2)} ${g.base.padEnd(16)} ${String(usage).padStart(5)}%  ${role.padEnd(28)} ${form}`,
  );
}

const list = {
  regulation,
  name: index.selected_format_name ?? `Regulation Set ${regulation.toUpperCase()}`,
  source: 'usage',
  sourceAsOf: sample.through,
  note:
    `Usage-derived, not editorial: species, items, abilities, natures, moves and the ordering come from ` +
    `${sample.teams} tournament teams (Limitless VGC online events with at least ${sample.minPlayers} players, ` +
    `through ${sample.through}); EV spreads come from the in-game ranked ladder.`,
  sample,
  sources: [
    { name: index.attribution ?? 'Limitless TCG', url: index.attribution_url ?? 'https://play.limitlesstcg.com/', scope: 'usage, items, abilities, natures, moves' },
    { name: 'MunchStats in-game ranked ladder', url: `${API}/champions/doubles`, scope: 'EV spreads' },
  ],
  ...(corroboration ? { corroboration } : {}),
  threats,
};

writeFileSync(
  'src/threats.data.ts',
  `// Generated by scripts/build-threats.mjs — do not edit by hand.\n` +
    `// Usage-derived per regulation; regenerate when a new Regulation Set starts.\n` +
    `export default ${JSON.stringify({ [regulation]: list }, null, 2)};\n`,
);
console.log(`\nWrote src/threats.data.ts (${threats.length} threats)`);
