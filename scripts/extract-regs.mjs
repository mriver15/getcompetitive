// Maintenance script: regenerate regulation roster data. Usage:
//   node scripts/extract-regs.mjs  -> writes src/regulations.data.ts
//
// Pokémon Champions Regulation Sets are cumulative: every set contains the
// previous set's eligible and Mega rosters. The data is stored that way —
// `base` holds M-A in full, and each later set stores only its `additions` —
// so a carry-over species cannot silently disappear (2026-09-20: Bulbapedia's
// M-C page omitted Kingambit; eligible rosters now come straight from the
// official event pages, which carry the complete list).
//
// Sources:
//   * eligible rosters — the official Pokémon Champions event web-view page
//     (`official` URL below), which embeds the full list as
//     `const pokemons = [["0003-000",1,"Venusaur"],…]` keyed by National
//     Pokédex number.
//   * Mega rosters — Bulbapedia's per-set "Mega Evolutions" section, whose
//     entries are collapsed to base species. A carried-over Mega omission is
//     caught by the cumulative check below.
//
// Every set is verified: its full eligible list must be a superset of the
// previous set's (no drops), and any disagreement fails the run WITHOUT
// writing the file.
//
// To ingest Regulation Set M-D:
//   1. Add { id: 'm-d', official: '<url>' } to SETS below. The URL is the
//      Pokémon Champions event page linked from the M-D announcement on
//      https://news.pokemon-home.com/en/ ("Eligible Pokémon").
//   2. Add the 'm-d' entry to METADATA in src/regulations.ts (name, start,
//      end, notes).
//   3. Run this script, then `npm test`. Done.
import { Dex } from '@pkmn/dex';
import { writeFileSync } from 'node:fs';

const SETS = [
  { id: 'm-a', official: 'https://web-view.app.pokemonchampions.jp/battle/pages/events/rs177501629259kmzbny/en/pokemon.html' },
  { id: 'm-b', official: 'https://web-view.app.pokemonchampions.jp/battle/pages/events/rs178066986988lmoqpm/en/pokemon.html' },
  { id: 'm-c', official: 'https://web-view.app.pokemonchampions.jp/battle/pages/events/rs178713870219xeaaio/en/pokemon.html' },
];

function extractEntries(html, start, end) {
  const slice = html.slice(start, end);
  const out = [];
  const re = /<div class="blacklinks"><b><a href="[^"]*" title="([^"]*)">([\s\S]*?)<\/a><\/b><\/div>/g;
  let m;
  while ((m = re.exec(slice))) {
    const title = m[1];
    const display = m[2].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    out.push({ title, display });
  }
  return out;
}

// Base name from the wiki title (e.g. "Raichu (Pokémon)" -> "Raichu").
function baseFromTitle(title) {
  return title.replace(/\s*\(Pokémon\)\s*$/i, '').trim();
}

function collapseToBase(entries) {
  const bases = new Set();
  const unresolved = [];
  for (const e of entries) {
    const name = baseFromTitle(e.title);
    const s = Dex.species.get(name);
    if (!s.exists) {
      unresolved.push(e);
      continue;
    }
    bases.add(s.baseSpecies || s.name);
  }
  return { names: [...bases].sort(), unresolved };
}

/** Base-species display name per National Pokédex number, from the bundled dex. */
const NUM_TO_NAME = new Map(
  Object.entries(Dex.data.Species)
    .filter(([, s]) => s.num && !s.baseSpecies)
    .map(([, s]) => [s.num, s.name]),
);
function numToName(num) {
  const name = NUM_TO_NAME.get(num);
  if (!name) throw new Error(`No base species for dex #${num}`);
  return name;
}

/** Full eligible roster from one official event page, as base-species names. */
async function officialEligible(url) {
  const html = await (await fetch(url)).text();
  const m = html.match(/const pokemons = (\[[\s\S]*?\]);/);
  if (!m) throw new Error(`official roster array not found at ${url}`);
  const nums = [...new Set(JSON.parse(m[1]).map(([id]) => parseInt(id, 10)))];
  return nums.map(numToName).sort();
}

/** Mega-capable base species from Bulbapedia's per-set "Mega Evolutions" section. */
async function wikiMegas(wikiTitle) {
  const html = await (await fetch(`https://bulbapedia.bulbagarden.net/wiki/${wikiTitle}`)).text();
  const iMega = html.indexOf('id="Mega_Evolutions"');
  if (iMega < 0) throw new Error(`no "Mega Evolutions" section on ${wikiTitle}`);
  const mega = extractEntries(html, iMega, html.indexOf('<h2', iMega + 10));
  return collapseToBase(mega);
}

const result = { base: null, additions: {} };
const failures = [];
const eligible = new Set(); // cumulative across sets, in SETS order
const mega = new Set();

for (const [i, set] of SETS.entries()) {
  let elig;
  try {
    elig = await officialEligible(set.official);
  } catch (err) {
    failures.push(`${set.id}: eligible roster fetch failed: ${err.message}`);
    continue;
  }
  let meg = { names: [], unresolved: [] };
  try {
    meg = await wikiMegas(`Regulation_Set_${set.id.toUpperCase()}`);
  } catch (err) {
    failures.push(`${set.id}: mega roster fetch failed: ${err.message}`);
  }
  for (const u of meg.unresolved) failures.push(`${set.id}: mega species does not resolve: ${u.title}`);

  if (i === 0) {
    result.base = { eligibleSpecies: elig, megaEvolutions: meg.names };
    for (const s of elig) eligible.add(s);
    for (const s of meg.names) mega.add(s);
    console.log(`${set.id} | eligible: ${elig.length} | mega: ${meg.names.length}`);
    continue;
  }

  const eligAdd = elig.filter((s) => !eligible.has(s)).sort();
  const eligDrop = [...eligible].filter((s) => !elig.includes(s));
  const megAdd = meg.names.filter((s) => !mega.has(s)).sort();
  const megDrop = [...mega].filter((s) => !meg.names.includes(s));
  for (const s of eligDrop) failures.push(`${set.id}: eligible species carried over from the previous set is missing: ${s}`);
  for (const s of megDrop) failures.push(`${set.id}: mega species carried over from the previous set is missing: ${s}`);

  result.additions[set.id] = { eligibleSpecies: eligAdd, megaEvolutions: megAdd };
  for (const s of eligAdd) eligible.add(s);
  for (const s of megAdd) mega.add(s);
  console.log(
    `${set.id} | eligible: ${eligible.size} (+${eligAdd.length}) | mega: ${mega.size} (+${megAdd.length})` +
      (eligDrop.length || megDrop.length ? ` | DROPS: ${[...eligDrop, ...megDrop].join(', ')}` : ''),
  );
}

if (failures.length) {
  console.error('\nVERIFICATION FAILURES:\n - ' + failures.join('\n - '));
  console.error('regulations.data.ts was NOT written; a roster disagrees with its sources.');
  process.exit(1);
}

writeFileSync(
  'src/regulations.data.ts',
  `// Generated by scripts/extract-regs.mjs — do not edit by hand.\n` +
    `// Regulation rosters are cumulative: every set contains the previous set's\n` +
    `// roster (Species Clause is by National Pokédex number). \`base\` is M-A in\n` +
    `// full; each later set's \`additions\` are the species it adds over the one\n` +
    `// before. Eligible lists come from the official Pokémon Champions event\n` +
    `// pages; Mega lists from Bulbapedia's per-set pages.\n` +
    `export default ${JSON.stringify(result, null, 2)};\n`,
);
console.log('\nWrote src/regulations.data.ts');
