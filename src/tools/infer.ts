/**
 * Set inference: reverse constraint solving. The player reports what they saw —
 * who moved first, a damage percentage, what survived — and this tool narrows
 * the space of sets the opponent's Pokémon could be running, ranked by how far
 * each surviving candidate is from what the meta actually plays. The primitives
 * are the same ones the forward tools use (exact level-50 Speed math and real
 * damage rolls), run backwards. Every elimination is shown, so the narrowing is
 * auditable rather than a black box, and everything a battle observation cannot
 * prove is stated in the note.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getDex, finalStat, damageResult } from '../dex.js';
import { getRegulationSet } from '../regulations.js';
import { findThreat, type Threat, type ThreatList } from '../threats.js';
import { ok, wrap, requireExists, READ_ONLY_ANNOTATIONS } from '../result.js';
import type { ModdedDex } from '@pkmn/dex';

interface Candidate {
  item?: string;
  ability: string;
  nature: string;
  evs: Record<string, number>;
  speed: number;
  weight: number;
}

/** The plausible item pool for an uncurated species, plus Choice Scarf. */
const ITEM_POOL = ['Choice Scarf', 'Choice Band', 'Choice Specs', 'Life Orb', 'Focus Sash', 'Assault Vest', 'Sitrus Berry'];
const SPEED_NATURES = ['Jolly', 'Timid'];

function spreadBy(primary: string, secondary: string): Record<string, number> {
  const evs: Record<string, number> = {};
  evs[primary] = 252;
  evs[secondary] = 252;
  evs['hp'] = 4;
  return evs;
}

/** Candidate sets for one species: the meta set plus the variations a scout can distinguish. */
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
        // Prior: distance from the set the meta actually plays.
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

const otherSetSchema = z.object({
  species: z.string().describe('Species name, e.g. "Rillaboom".'),
  level: z.number().int().optional().describe('Level; defaults to 50.'),
  nature: z.string().optional().describe('Nature; defaults to neutral.'),
  evs: z.record(z.string(), z.number()).optional().describe('EVs keyed by stat id.'),
  championsPoints: z.record(z.string(), z.number()).optional().describe('Champions stat points, an alternative to evs.'),
  item: z.string().optional().describe('Held item.'),
  ability: z.string().optional().describe('Ability.'),
});

const observationSchema = z.union([
  z.object({
    kind: z.literal('speed'),
    referenceSpeed: z.number().int().describe('The Speed of the member it raced against, e.g. your Salamence at 188.'),
    relation: z
      .enum(['outsped', 'outspeeds'])
      .describe('"outsped" means the observed Pokémon moved first (its Speed is higher); "outspeeds" means your member moved first (its Speed is lower).'),
  }),
  z.object({
    kind: z.literal('damageDealt'),
    move: z.string().describe('The move the observed Pokémon used.'),
    target: otherSetSchema.describe('The member it hit — your member, with its known set.'),
    percent: z.number().describe('Damage shown as a percentage of the target\u2019s HP, e.g. 71 for "71/100".'),
  }),
  z.object({
    kind: z.literal('damageTaken'),
    move: z.string().describe('The move that hit the observed Pokémon.'),
    attacker: otherSetSchema.describe('The attacker — your member, with its known set.'),
    percentTaken: z.number().describe('Damage the observed Pokémon took, as a percentage of its own HP, e.g. 88 when it survived with 12%.'),
  }),
  z.object({
    kind: z.literal('ability'),
    ability: z.string().describe('An ability the observed Pokémon is known to have.'),
  }),
  z.object({
    kind: z.literal('item'),
    item: z.string().describe('An item the observed Pokémon is known to hold.'),
  }),
]);

export function registerInferTool(server: McpServer) {
  server.registerTool(
    'infer_set',
    {
      title: 'Infer an opponent\u2019s set',
      description:
        'Reverse constraint solving for a battle observation: the player reports what they saw — who moved first, how hard a hit landed, what survived — and this tool narrows which set the opponent\u2019s Pok\u00e9mon could be running, ranked by how far each survivor is from the set the meta actually plays. The engine is the same math the forward tools use, run backwards: exact level-50 Speed (Choice Scarf included) and real damage rolls against the spread each candidate implies. Every observation is applied in order and the elimination count is reported, so the narrowing is auditable; `candidates` carries the surviving sets with a probability share. Roll variance means a damage observation keeps every candidate whose roll range contains the observed percentage, and the note lists what a battle observation cannot prove. For a ranked species the meta set anchors the prior; an unranked species gets a flat plausible pool. Read-only and offline.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        species: z
          .string()
          .describe('The opponent\u2019s species as observed, e.g. "Sneasler", "Salamence-Mega"; resolves case- and punctuation-insensitively.'),
        observations: z
          .array(observationSchema)
          .min(1)
          .max(8)
          .describe('What the player saw, applied in order; later observations narrow earlier results.'),
        regulation: z
          .string()
          .optional()
          .describe('Regulation id, e.g. "m-c"; scopes which curated meta set anchors the prior.'),
      },
      outputSchema: {
        species: z.string().describe('The species as resolved.'),
        regulation: z.string().optional().describe('The regulation used for the meta prior, when one matched.'),
        priorSets: z.number().int().describe('Candidate sets considered before any observation.'),
        survivingSets: z
          .number()
          .int()
          .describe('Candidates still possible after the last observation; `candidates` lists at most the top 8, so a count above 8 means the probabilities shown cover part of the mass, not all of it.'),
        constraints: z
          .array(
            z.object({
              observation: z.string().describe('The observation, restated.'),
              before: z.number().int().describe('Candidates still possible before it.'),
              after: z.number().int().describe('Candidates still possible after it.'),
              eliminated: z.number().int().describe('How many it ruled out.'),
            }),
          )
          .describe('One entry per observation, in the order they were applied — the narrowing, shown.'),
        candidates: z
          .array(
            z.object({
              item: z.string().optional().describe('Held item; absent when none is implied.'),
              ability: z.string().describe('Ability.'),
              nature: z.string().describe('Nature.'),
              evs: z.record(z.string(), z.number()).describe('The spread, keyed by stat id.'),
              speed: z.number().int().describe('Level-50 Speed with that spread, Scarf included.'),
              probability: z.number().describe('Share of surviving prior mass, in percent; the engine\u2019s confidence in this candidate.'),
            }),
          )
          .describe('The surviving sets, most likely first, at most 8.'),
        note: z.string().describe('What the engine assumed and what observations cannot prove: neutral abilities when unknown, no stat stages, roll variance, and that damage percentages are rounded by the client.'),
      },
    },
    wrap(async (args: { species: string; observations: z.infer<typeof observationSchema>[]; regulation?: string }) => {
      const dex = getDex(9);
      const set = args.regulation ? getRegulationSet(args.regulation) : undefined;
      const curated = findThreat(args.species, set?.id);
      const sp = dex.species.get(args.species);
      requireExists(sp, 'Pokemon species', args.species);

      const priorPool = candidatesFor(dex, sp.name, curated);
      let candidates = priorPool;

      const constraints: { observation: string; before: number; after: number; eliminated: number }[] = [];
      for (const obs of args.observations) {
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
                {
                  species: sp.name,
                  level: 50,
                  nature: c.nature,
                  evs: c.evs,
                  item: c.item,
                  ability: c.ability,
                  moves: [obs.move],
                },
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
                {
                  species: sp.name,
                  level: 50,
                  nature: c.nature,
                  evs: c.evs,
                  item: c.item,
                  ability: c.ability,
                },
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

      return ok({
        species: sp.name,
        ...(set ? { regulation: set.name } : {}),
        priorSets: priorPool.length,
        survivingSets: candidates.length,
        constraints,
        candidates: ranked,
        note: 'The engine assumes neutral abilities when unknown, no stat stages on either side, and that damage percentages are rounded by the client — a range that contains the observed value survives, which is why a single roll rarely pins one set. Speed observations are strict inequalities. For an unranked species the prior is a flat pool of plausible natures, items and spreads, so probabilities are relative within that pool, not metagame odds. At most the top 8 survivors are listed; `survivingSets` tells you when more were cut off.',
      });
    }),
  );
}
