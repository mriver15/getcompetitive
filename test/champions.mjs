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

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);
