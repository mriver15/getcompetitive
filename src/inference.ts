/**
 * SetInferenceEngine: reverse constraint solving over battle observations.
 * Shared by `analyze_battle`'s "infer" mode and the scouting pipeline, so a
 * replay and a hand-typed observation narrow candidate sets with identical
 * math. Battle observations are normalized into the `BattleObservation` union
 * — the kinds a battle can actually reveal (speed relations, damage taken or
 * dealt, item and ability reveals).
 */
import { z } from 'zod';
import { getChampionsDex } from './champions.js';
import { damageResult, finalStat } from './dex.js';
import { getRegulationSet } from './regulations.js';
import { findThreat, type Threat, type ThreatList } from './threats.js';
import { requireExists } from './result.js';
import type { ModdedDex } from '@pkmn/dex';

export const observationSchema = z.union([
  z.object({
    kind: z.literal('speed'),
    referenceSpeed: z.number().int().describe('The Speed of the member it raced against.'),
    relation: z.enum(['outsped', 'outspeeds']).describe('"outsped" means it moved first; "outspeeds" means your member moved first.'),
  }),
  z.object({
    kind: z.literal('damageDealt'),
    move: z.string().describe('The move it used.'),
    target: z.object({
      species: z.string(),
      level: z.number().int().optional(),
      nature: z.string().optional(),
      evs: z.record(z.string(), z.number()).optional(),
      championsPoints: z.record(z.string(), z.number()).optional(),
      item: z.string().optional(),
      ability: z.string().optional(),
    }),
    percent: z.number().describe('Damage as a percentage of the target\u2019s HP.'),
  }),
  z.object({
    kind: z.literal('damageTaken'),
    move: z.string().describe('The move that hit it.'),
    attacker: z.object({
      species: z.string(),
      level: z.number().int().optional(),
      nature: z.string().optional(),
      evs: z.record(z.string(), z.number()).optional(),
      championsPoints: z.record(z.string(), z.number()).optional(),
      item: z.string().optional(),
      ability: z.string().optional(),
    }),
    percentTaken: z.number().describe('Damage it took, as a percentage of its own HP.'),
  }),
  z.object({ kind: z.literal('ability'), ability: z.string().describe('An ability it is known to have.') }),
  z.object({ kind: z.literal('item'), item: z.string().describe('An item it is known to hold.') }),
]);

export type BattleObservation = z.infer<typeof observationSchema>;

interface Candidate {
  item?: string;
  ability: string;
  nature: string;
  evs: Record<string, number>;
  speed: number;
  weight: number;
}

const ITEM_POOL = ['Choice Scarf', 'Choice Band', 'Choice Specs', 'Life Orb', 'Focus Sash', 'Assault Vest', 'Sitrus Berry'];
const SPEED_NATURES = ['Jolly', 'Timid'];

function spreadBy(primary: string, secondary: string): Record<string, number> {
  const evs: Record<string, number> = {};
  evs[primary] = 252;
  evs[secondary] = 252;
  evs['hp'] = 4;
  return evs;
}

function candidatesFor(
  dex: ModdedDex,
  speciesName: string,
  curated: { list: ThreatList; threat: Threat } | undefined,
): Candidate[] {
  const sp = dex.species.get(speciesName);
  requireExists(sp, 'Pokemon species', speciesName);
  const base = sp.baseStats;
  const offensiveStat = base.atk >= base.spa ? 'atk' : 'spa';
  const speedNature = base.atk >= base.spa ? 'Jolly' : 'Timid';
  const powerNature = base.atk >= base.spa ? 'Adamant' : 'Modest';
  const mega = speciesName.toLowerCase().includes('mega');

  const threat = curated?.threat;
  const natures = [...new Set([...(threat?.nature ? [threat.nature] : []), speedNature, powerNature])];
  const items = mega
    ? [...new Set([...(threat?.item ? [threat.item] : []), 'Life Orb', 'Sitrus Berry'])]
    : [...new Set([...(threat?.item ? [threat.item] : []), ...ITEM_POOL])];
  const spreads = [...new Set([
    JSON.stringify(threat?.evs ?? spreadBy(offensiveStat, 'spe')),
    JSON.stringify(spreadBy(offensiveStat, 'spe')),
    JSON.stringify(spreadBy('hp', offensiveStat)),
    JSON.stringify(spreadBy('hp', 'def')),
  ])].map((s) => JSON.parse(s) as Record<string, number>);

  const ability = threat?.ability ?? (sp.abilities?.[0] ?? '');
  const out: Candidate[] = [];
  for (const nature of natures) {
    for (const item of items) {
      for (const evs of spreads) {
        const baseSpeed = finalStat(9, 'spe', base.spe, 31, evs.spe ?? 0, 50, nature);
        const speed = item === 'Choice Scarf' ? Math.floor(baseSpeed * 1.5) : baseSpeed;
        const weight =
          (nature === threat?.nature ? 1 : SPEED_NATURES.includes(nature) ? 0.7 : 0.5) *
          (item === threat?.item ? 1 : item === 'Choice Scarf' ? 0.6 : 0.5) *
          (JSON.stringify(evs) === JSON.stringify(threat?.evs ?? {}) ? 1 : 0.6);
        out.push({ item: item || undefined, ability, nature, evs, speed, weight });
      }
    }
  }
  return out;
}

export interface InferenceResult {
  species: string;
  regulation?: string;
  priorSets: number;
  survivingSets: number;
  constraints: { observation: string; before: number; after: number; eliminated: number }[];
  candidates: {
    item?: string;
    ability: string;
    nature: string;
    evs: Record<string, number>;
    speed: number;
    probability: number;
  }[];
  note: string;
}

/**
 * Narrow the candidate space for one species with normalized battle
 * observations, deterministic and offline: exact level-50 Speed math and real
 * damage rolls, the meta's own set anchoring the prior where one exists.
 */
export function runInference(species: string, observations: BattleObservation[], regulation?: string): InferenceResult {
  const dex = getChampionsDex();
  const set = regulation ? getRegulationSet(regulation) : undefined;
  const curated = findThreat(species, set?.id);
  const sp = dex.species.get(species);
  requireExists(sp, 'Pokemon species', species);

  const priorPool = candidatesFor(dex, sp.name, curated);
  let candidates = priorPool;

  const constraints: InferenceResult['constraints'] = [];
  for (const obs of observations) {
    const before = candidates.length;
    const keep: Candidate[] = [];
    if (obs.kind === 'speed') {
      for (const c of candidates) {
        const faster = obs.relation === 'outsped' ? c.speed > obs.referenceSpeed : c.speed < obs.referenceSpeed;
        if (faster) keep.push(c);
      }
      constraints.push({
        observation: `${obs.relation === 'outsped' ? 'outsped' : 'was outsped by'} a member at ${obs.referenceSpeed} Speed`,
        before, after: keep.length, eliminated: before - keep.length,
      });
    } else if (obs.kind === 'ability') {
      for (const c of candidates) {
        if (c.ability.toLowerCase() === obs.ability.toLowerCase()) keep.push(c);
      }
      constraints.push({ observation: `has ${obs.ability}`, before, after: keep.length, eliminated: before - keep.length });
    } else if (obs.kind === 'item') {
      for (const c of candidates) {
        if (c.item?.toLowerCase() === obs.item.toLowerCase()) keep.push(c);
      }
      constraints.push({ observation: `holds ${obs.item}`, before, after: keep.length, eliminated: before - keep.length });
    } else if (obs.kind === 'damageDealt') {
      const targetSet = { ...obs.target, level: obs.target.level ?? 50 };
      for (const c of candidates) {
        let consistent = false;
        try {
          const res = damageResult(
            9,
            { species: sp.name, level: 50, nature: c.nature, evs: c.evs, item: c.item, ability: c.ability, moves: [obs.move] },
            targetSet,
            obs.move,
          );
          const targetHp = res.defender.stats.hp;
          const observedHp = (obs.percent / 100) * targetHp;
          consistent = res.damageRange[0] <= observedHp && observedHp <= res.damageRange[1];
        } catch {
          consistent = false;
        }
        if (consistent) keep.push(c);
      }
      constraints.push({
        observation: `${obs.move} did ${obs.percent}% to ${obs.target.species}`,
        before, after: keep.length, eliminated: before - keep.length,
      });
    } else {
      const attackerSet = { ...obs.attacker, level: obs.attacker.level ?? 50 };
      for (const c of candidates) {
        let consistent = false;
        try {
          const res = damageResult(
            9,
            attackerSet,
            { species: sp.name, level: 50, nature: c.nature, evs: c.evs, item: c.item, ability: c.ability },
            obs.move,
          );
          const targetHp = res.defender.stats.hp;
          const observedHp = (obs.percentTaken / 100) * targetHp;
          consistent = res.damageRange[0] <= observedHp && observedHp <= res.damageRange[1];
        } catch {
          consistent = false;
        }
        if (consistent) keep.push(c);
      }
      constraints.push({
        observation: `took ${obs.percentTaken}% from ${obs.attacker.species}'s ${obs.move}`,
        before, after: keep.length, eliminated: before - keep.length,
      });
    }
    candidates = keep;
    if (!candidates.length) break;
  }

  const total = candidates.reduce((a, c) => a + c.weight, 0);
  const ranked = [...candidates]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8)
    .map((c) => ({
      ...(c.item ? { item: c.item } : {}),
      ability: c.ability,
      nature: c.nature,
      evs: c.evs,
      speed: c.speed,
      probability: Number(((c.weight / total) * 100).toFixed(1)),
    }));

  return {
    species: sp.name,
    ...(set ? { regulation: set.name } : {}),
    priorSets: priorPool.length,
    survivingSets: candidates.length,
    constraints,
    candidates: ranked,
    note: 'The engine assumes neutral abilities when unknown, no stat stages on either side, and that damage percentages are rounded by the client — a range that contains the observed value survives, which is why a single roll rarely pins one set. Speed observations are strict inequalities. For an unranked species the prior is a flat pool of plausible natures, items and spreads, so probabilities are relative within that pool, not metagame odds. At most the top 8 survivors are listed; `survivingSets` tells you when more were cut off.',
  };
}
