// Golden regression tests for the Champions game model. Everything here pins a
// fact the higher-level tools depend on: the Champions-exclusive forms and
// their verified typing/BST, regulation roster integrity, the stat-point math
// contract, and representative damage rolls. A dataset or calc upgrade that
// silently changes any of these fails this suite instead of corrupting every
// analysis that builds on it. Verified against official data by
// scripts/verify-champions.mjs on 2026-09-19.
import {
  getChampionsDex,
  CHAMPIONS_EXCLUSIVE_FORMS,
  CHAMPIONS_VERIFIED_AS_OF,
} from '../dist/champions.js';
import { REGULATION_SETS } from '../dist/regulations.js';
import {
  championsPointsToEvs,
  evsToChampionsPoints,
  CHAMPIONS_POINTS_TOTAL,
  CHAMPIONS_POINTS_MAX,
  damageResult,
} from '../dist/dex.js';

let failed = 0;
const check = (label, ok) => {
  console.log(`=== ${label} => ${ok} ===`);
  if (!ok) failed++;
};

const dex = getChampionsDex();

// --- Champions-exclusive forms: exist with exactly the verified typing/BST ---
{
  const wrong = CHAMPIONS_EXCLUSIVE_FORMS.filter((f) => {
    const sp = dex.species.get(f.species);
    return (
      !sp.exists ||
      sp.types.join('/') !== f.types.join('/') ||
      Object.values(sp.baseStats).reduce((a, b) => a + b, 0) !== f.bst
    );
  });
  check(
    `all ${CHAMPIONS_EXCLUSIVE_FORMS.length} exclusive forms match verified typing and BST${wrong.length ? ` — WRONG: ${wrong.map((f) => f.species).join(', ')}` : ''}`,
    wrong.length === 0,
  );
  check('verification date is recorded', typeof CHAMPIONS_VERIFIED_AS_OF === 'string' && CHAMPIONS_VERIFIED_AS_OF.length === 10);
}

// --- Roster integrity: every species the regulations name resolves ---
{
  const missingRoster = REGULATION_SETS.flatMap((s) => s.eligibleSpecies).filter((n) => !dex.species.get(n).exists);
  check(`every regulation roster species resolves${missingRoster.length ? ` — MISSING: ${missingRoster.join(', ')}` : ''}`, missingRoster.length === 0);
  const missingMega = REGULATION_SETS.flatMap((s) => s.megaEvolution.species).filter((n) => !dex.species.get(n).exists);
  check(`every mega-eligible species resolves${missingMega.length ? ` — MISSING: ${missingMega.join(', ')}` : ''}`, missingMega.length === 0);

  // Official roster sizes, counted from the Pokémon Champions event web-view
  // pages (2026-09-20): 186 / 208 / 231. A drift means the scrape silently
  // dropped or invented species — the M-C list once lost Kingambit that way.
  const officialSizes = { 'm-a': 186, 'm-b': 208, 'm-c': 231 };
  const badSizes = REGULATION_SETS.filter((s) => s.eligibleSpecies.length !== officialSizes[s.id]);
  check(
    `regulation roster sizes match official (${Object.entries(officialSizes).map(([k, v]) => `${k}=${v}`).join(', ')})${badSizes.length ? ` — WRONG: ${badSizes.map((s) => `${s.id}=${s.eligibleSpecies.length}`).join(', ')}` : ''}`,
    badSizes.length === 0,
  );
  const mC = REGULATION_SETS.find((s) => s.id === 'm-c');
  check('M-C roster contains Kingambit (upstream omission regression)', !!mC && mC.eligibleSpecies.includes('Kingambit'));

  // The M series is cumulative: every set contains the previous set's eligible
  // and Mega rosters. The derived lists must never drop a carry-over.
  const byStart = REGULATION_SETS.slice().sort((a, b) => a.start.localeCompare(b.start));
  const drops = [];
  for (let i = 1; i < byStart.length; i++) {
    const prev = byStart[i - 1];
    const cur = byStart[i];
    const lost = [
      ...prev.eligibleSpecies.filter((s) => !cur.eligibleSpecies.includes(s)),
      ...prev.megaEvolution.species.filter((s) => !cur.megaEvolution.species.includes(s)),
    ];
    if (lost.length) drops.push(`${cur.id} misses ${lost.join(', ')}`);
  }
  check(`every set contains the previous set's roster${drops.length ? ` — WRONG: ${drops.join('; ')}` : ''}`, drops.length === 0);
}

// --- Stat-point math contract ---
{
  check('one point is eight EVs', JSON.stringify(championsPointsToEvs({ atk: 5 })) === JSON.stringify({ atk: 40 }));
  check('a maxed stat reads 252', JSON.stringify(championsPointsToEvs({ spe: 32 })) === JSON.stringify({ spe: 252 }));
  const trimmed = championsPointsToEvs({ hp: 32, def: 14, spd: 20 });
  check(
    'a 66-point spread trims to the 510 EV budget',
    JSON.stringify(trimmed) === JSON.stringify({ hp: 236, def: 112, spd: 160 }) &&
      Object.values(trimmed).reduce((a, b) => a + b, 0) <= 510,
  );
  check(
    'EVs read back as points',
    JSON.stringify(evsToChampionsPoints({ hp: 252, atk: 252, spe: 4 })) === JSON.stringify({ hp: 32, atk: 32, spe: 1 }),
  );
  check('point budget constants', CHAMPIONS_POINTS_TOTAL === 66 && CHAMPIONS_POINTS_MAX === 32);
}

// --- Representative damage rolls, pinned so calc upgrades cannot drift ---
{
  const r1 = damageResult(
    9,
    { species: 'Garchomp', level: 50, nature: 'Jolly', evs: { atk: 252, spe: 252 }, item: 'Life Orb' },
    { species: 'Incineroar', level: 50, nature: 'Careful', championsPoints: { hp: 32, def: 14, spd: 20 } },
    'Earthquake',
  );
  check(
    'Garchomp Life Orb Earthquake vs Careful Incineroar',
    JSON.stringify(r1.damageRange) === JSON.stringify([218, 257]) && r1.koChance === 'guaranteed OHKO',
  );
  const r2 = damageResult(
    9,
    { species: 'Sneasler', level: 50, nature: 'Adamant', evs: { atk: 252, spe: 252 }, item: 'Grassy Seed' },
    { species: 'Rillaboom', level: 50, nature: 'Adamant', evs: { hp: 252, atk: 252 } },
    'Close Combat',
  );
  check(
    'Sneasler Close Combat vs Adamant Rillaboom',
    JSON.stringify(r2.damageRange) === JSON.stringify([124, 147]) && r2.koChance === 'guaranteed 2HKO',
  );
}

// --- MatchupEvaluator: deterministic classifications, pinned as goldens ---
{
  const { evaluateMatchup } = await import('../dist/evaluator.js');
  const evalCase = async (label, us, them, want) => {
    const r = evaluateMatchup(us, them);
    check(`${label} classifies ${want}`, r.answerClass === want);
  };
  await evalCase(
    'Garchomp into Sneasler',
    { species: 'Garchomp', item: 'Life Orb', nature: 'Jolly', evs: { atk: 252, spe: 252 }, moves: ['Earthquake', 'Dragon Claw', 'Rock Slide'] },
    { species: 'Sneasler', item: 'Grassy Seed', nature: 'Adamant', evs: { atk: 252, spe: 252 }, moves: ['Close Combat', 'Dire Claw', 'Gunk Shot', 'Protect'] },
    'HARD_ANSWER',
  );
  await evalCase(
    'Incineroar into Rillaboom',
    { species: 'Incineroar', item: 'Sitrus Berry', nature: 'Careful', championsPoints: { hp: 32, def: 14, spd: 20 }, moves: ['Fake Out', 'Flare Blitz', 'Knock Off'] },
    { species: 'Rillaboom', item: 'Miracle Seed', nature: 'Adamant', championsPoints: { hp: 32, atk: 32 }, moves: ['Fake Out', 'Grassy Glide', 'Wood Hammer'] },
    'SOFT_ANSWER',
  );
  await evalCase(
    'Pelipper into Garchomp',
    { species: 'Pelipper', item: 'Damp Rock', nature: 'Bold', evs: { hp: 252, def: 252 }, moves: ['Scald', 'Hurricane'] },
    { species: 'Garchomp', item: 'Life Orb', nature: 'Jolly', evs: { atk: 252, spe: 252 }, moves: ['Earthquake', 'Dragon Claw', 'Rock Slide'] },
    'UNFAVORABLE',
  );
  await evalCase(
    'Sneasler into Gholdengo is blocked, not unknown',
    { species: 'Sneasler', item: 'Grassy Seed', nature: 'Adamant', evs: { atk: 252, spe: 252 }, moves: ['Close Combat', 'Dire Claw', 'Gunk Shot', 'Protect'] },
    { species: 'Gholdengo', item: 'Life Orb', nature: 'Modest', evs: { spa: 252, spe: 252 }, moves: ['Make It Rain', 'Shadow Ball', 'Nasty Plot'] },
    'UNFAVORABLE',
  );
}

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);
