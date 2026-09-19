// Maintenance script: verify the bundled dex against official Champions data.
// Usage: npm run build && node scripts/verify-champions.mjs
//
// The server's game model is the stock gen-9 @pkmn/dex, into which smogon has
// vendored Champions forms as isNonstandard 'Future'. This script proves (or
// disproves) that that data matches the official game for the species that can
// be verified: every Champions-exclusive form and every species with measured
// usage in the regulation. Two aggregator behaviours shape the comparison:
//   * a species absent from the usage index returns another species' fallback
//     data from its detail endpoint (Watchog returns Rillaboom's stats), so it
//     cannot be verified this way and is reported as unverifiable, not wrong;
//   * an indexed base name reports the played form's data (Zoroark reports
//     Zoroark-Hisui's), so the official numbers are matched against the dex
//     species and all of its forms.
// Divergences fail the run; a clean run refreshes src/champions.data.ts.
import { Dex } from '@pkmn/dex';
import { REGULATION_SETS } from '../dist/regulations.js';

const AGG = 'https://www.munchstats.com';
const UA = 'getcompetitive-verify/1.0 (+https://github.com/mriver15/getcompetitive)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dex = Dex.mod('gen9');

const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const sameStats = (a, b) => STAT_KEYS.every((k) => a[k] === b[k]);
const sameTypes = (a, b) => a.slice().sort().join('/') === b.slice().sort().join('/');

const index = await (await fetch(`${AGG}/limitless/api/m-c/25/?cut=all`, { headers: { 'user-agent': UA } })).json();
const future = dex.species.all().filter((s) => s.isNonstandard === 'Future').map((s) => s.name);
const indexed = index.pokemon_names.map(([name]) => name);
const roster = REGULATION_SETS.find((s) => s.id === 'm-c').eligibleSpecies;
// Only indexed names carry real data: unindexed species return another species'
// fallback from the detail endpoint, and unindexed forms return mismapped data.
const species = [...indexed];
const unverifiableForms = future.filter((n) => !indexed.includes(n));
const unverifiableRoster = roster.filter((n) => !indexed.includes(n) && !future.includes(n));
console.log(
  `Verifying ${species.length} indexed species; ${unverifiableForms.length} exclusive forms and ${unverifiableRoster.length} roster species carry no usage data and are unverifiable from this source.`,
);

const divergences = [];
let checked = 0;

for (const name of species) {
  let detail;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(`${AGG}/limitless/api/m-c/25/${encodeURIComponent(name)}?cut=all`, { headers: { 'user-agent': UA } });
      if (r.status === 429 || r.status >= 500) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      detail = await r.json();
      break;
    } catch (e) {
      if (attempt === 3) {
        console.warn(`  skipping ${name}: ${e.message}`);
      } else {
        await sleep(2000 * (attempt + 1));
      }
    }
  }
  if (!detail) {
    divergences.push(`${name}: could not fetch official data`);
    continue;
  }
  checked++;

  const officialStats = Object.fromEntries(detail.base_stats.map((v, i) => [STAT_KEYS[i], v]));
  // The official numbers belong to whichever dex entry the game actually plays:
  // the species itself or one of its forms (Zoroark -> Zoroark-Hisui).
  const candidates = dex.species.all().filter((s) => s.name === name || s.baseSpecies === name);
  const matched = candidates.find((s) => sameStats(s.baseStats, officialStats) && sameTypes(s.types, detail.pokemon_types));
  if (!matched) {
    divergences.push(
      `${name}: no dex entry (species or form) has official stats ${JSON.stringify(detail.base_stats)} with types ${detail.pokemon_types.join('/')}`,
    );
    continue;
  }
  const officialAbility = detail.abilities_list?.[0]?.[0];
  if (officialAbility) {
    // The played set may carry the base form's pre-mega ability (Sceptile-Mega
    // -> Overgrow) or a gendered counterpart's (Meowstic-F-Mega -> Competitive
    // on Meowstic-F), so the pool is the matched entry plus every sibling form.
    const siblingNames = matched.baseSpecies
      ? dex.species.all().filter((s) => s.baseSpecies === matched.baseSpecies || s.name === matched.baseSpecies).map((s) => s.name)
      : [];
    const pools = [matched, ...siblingNames.map((n) => dex.species.get(n))].map((s) => s.abilities ?? {});
    if (!pools.some((p) => Object.values(p).some((a) => a.toLowerCase() === officialAbility.toLowerCase()))) {
      divergences.push(
        `${name}: official top ability "${officialAbility}" is missing from the matched dex entry and its forms (${matched.name} has ${Object.values(matched.abilities).join(', ')})`,
      );
    }
  }
  await sleep(300);
}

console.log(`Verified ${checked}/${species.length} species against official Champions data.`);
if (divergences.length) {
  console.log(`${divergences.length} divergence(s):`);
  for (const d of divergences) console.log(`  ${d}`);
  process.exit(1);
}
console.log('No divergences: every verifiable species matches official base stats, types and abilities.');

// On a clean run, refresh the committed facts table the golden tests pin, so
// verification and the tests can never drift apart.
const forms = dex.species
  .all()
  .filter((s) => s.isNonstandard === 'Future')
  .map((s) => ({ species: s.name, types: [...s.types], bst: Object.values(s.baseStats).reduce((a, b) => a + b, 0) }))
  .sort((a, b) => a.species.localeCompare(b.species));
const { writeFileSync } = await import('node:fs');
writeFileSync(
  new URL('../src/champions.data.ts', import.meta.url),
  [
    '// Generated by scripts/verify-champions.mjs — do not edit by hand.',
    '// The Champions-exclusive forms bundled with the gen-9 dataset, with the typing',
    '// and base-stat total the official game data was verified against. Every entry',
    '// here is pinned by test/champions.mjs, so a dataset upgrade that silently',
    '// changes a form fails the suite instead of corrupting every analysis.',
    'export default {',
    '  source: "official Champions data via the MunchStats aggregator, diffed by scripts/verify-champions.mjs",',
    `  verifiedAsOf: "${new Date().toISOString().slice(0, 10)}",`,
    `  forms: ${JSON.stringify(forms, null, 2)}`,
    '} as const;',
    '',
  ].join('\n'),
);
console.log('Refreshed src/champions.data.ts from the verified dataset.');
