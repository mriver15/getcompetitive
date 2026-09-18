/**
 * Matchup preparation: "here is my opponent — prepare me." A pre-game dossier
 * built entirely from the deterministic primitives the rest of the surface
 * shares: usage-derived sets, level-50 Speed math, real damage calculations,
 * and the same bring-four type scoring `analyze_team` uses. The caller narrates;
 * every claim in here carries the number behind it.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getDex, typeEffectiveness, TYPES18, finalStat, damageResult, learnableMoveIds } from '../dex.js';
import { REGULATION_SETS, getRegulationSet, setStatus } from '../regulations.js';
import { getThreatList, findThreat, type Threat } from '../threats.js';
import { ok, wrap, requireExists, READ_ONLY_ANNOTATIONS } from '../result.js';
import { parsedSetSchema, resolveMembers, type ParsedSet, type ResolvedMember } from './team.js';
import { planBringFour } from './analyze.js';
import type { ModdedDex } from '@pkmn/dex';

const LEAD_MOVES = ['fakeout', 'tailwind', 'trickroom', 'helpinghand', 'followme', 'ragepowder', 'wideguard'];
const toKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

interface OpponentMember {
  species: string;
  types: string[];
  baseSpe: number;
  speed: number;
  speedKnown: boolean;
  moves: string[];
  moveTypes: string[];
  curated?: { threat: Threat; form: string; usage: number; role: string };
}

export function registerMatchupTool(server: McpServer) {
  server.registerTool(
    'prepare_matchup',
    {
      title: 'Prepare a matchup',
      description:
        'Prepare a match against a known opponent: "here is their team — what do I bring, and what should I watch for?" A deterministic pre-game dossier composed from the rest of the surface. `likelySets` orders the opponent most-used first, carrying each species\u2019 actual usage-derived set (item, ability, nature, EVs, four moves, usage share) where one exists. `speedTiers` compares real level-50 Speed with the margins spelled out. `relevantDamageCalcs` runs real damage rolls for the key matchups — the team\u2019s hardest hit into their top threats and the threat\u2019s hardest hit back at the member that answers it. `recommendedBringFour` is the same type-scored pick `analyze_team` makes. Leads, win conditions, loss conditions, and the members to preserve are heuristics from movesets, Speed and typing, each labelled with what it can see. Speeds and moves for uncurated opponent species are base-stat or STAB estimates and say so. The caller narrates; every number here is a real calculation or a real usage figure.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        team: z
          .array(parsedSetSchema)
          .min(1)
          .max(6)
          .describe('Your team, in the canonical shape `parse_team` returns: species with optional moves, ability, nature, evs or championsPoints, and item.'),
        opponent: z
          .array(z.union([z.string().describe('A species name, e.g. "Sneasler", "Salamence-Mega".'), parsedSetSchema]))
          .min(1)
          .max(6)
          .describe('The opponent\u2019s team: species names for what preview shows, or full sets when more is known — full sets widen the damage calculations and speed math.'),
        regulation: z
          .string()
          .optional()
          .describe('Regulation id the match is under, e.g. "m-c"; omitted, the current set is used.'),
      },
      outputSchema: {
        regulation: z.string().describe('Display name of the regulation the matchup was prepared under.'),
        opponent: z.array(z.string()).describe('The opponent team as resolved species names, in the order supplied.'),
        likelySets: z
          .array(
            z.object({
              species: z.string().describe('Species name.'),
              priority: z
                .number()
                .int()
                .nullable()
                .describe('Rank by usage among the opponent, 1 being the most used; null when the species has no curated set.'),
              usage: z.number().optional().describe('Usage share in percent; present only for curated species.'),
              role: z.string().optional().describe('Competitive role from the curated list; present only for curated species.'),
              item: z.string().optional().describe('Most-played item; present only for curated species.'),
              ability: z.string().optional().describe('Most-played ability; present only for curated species.'),
              nature: z.string().optional().describe('Most-played nature; present only for curated species.'),
              evs: z.record(z.string(), z.number()).optional().describe('Most-played spread, keyed by stat id; present only for curated species.'),
              moves: z.array(z.string()).optional().describe('The four most-played moves; present only for curated species.'),
              note: z.string().optional().describe('"No curated set" — its speed below is a base-stat estimate; present only for uncurated species.'),
            }),
          )
          .describe('One entry per opponent species, ordered most used first.'),
        speedTiers: z
          .object({
            ourOrder: z.array(z.string()).describe('Your members, fastest first, with their real level-50 Speed.'),
            theirOrder: z.array(z.string()).describe('Their members, fastest first; uncurated species use a base-stat estimate and say so in `races`.'),
            races: z
              .array(
                z.object({
                  ours: z.string().describe('Your member.'),
                  theirs: z.string().describe('Their member.'),
                  ourSpeed: z.number().int().describe('Your member\u2019s level-50 Speed.'),
                  theirSpeed: z.number().int().describe('Their Speed; flagged below when estimated.'),
                  margin: z.number().int().describe('How many points separate them.'),
                  weMoveFirst: z.boolean().describe('True when your member moves first.'),
                  estimated: z.boolean().optional().describe('True when their Speed is a base-stat estimate; present only then.'),
                }),
              )
              .describe('Your top two against their top two, up to four races.'),
          })
          .describe('Where the Speed matchups stand.'),
        relevantDamageCalcs: z
          .array(
            z.object({
              move: z.string().describe('The move rolled.'),
              attacker: z.string().describe('Who attacks.'),
              defender: z.string().describe('Who takes it.'),
              damageRange: z.tuple([z.number(), z.number()]).describe('[minimum, maximum] damage.'),
              koChance: z.string().optional().describe('KO chance text, e.g. "guaranteed 2HKO"; absent when the calc reports none.'),
              description: z.string().describe('The rendered Showdown-format line.'),
            }),
          )
          .describe('The key damage rolls, at most four: your hardest hit into each of their top two threats, and each threat\u2019s hardest hit back at your best answer.'),
        recommendedBringFour: z
          .object({
            opponent: z.array(z.string()).describe('The opponent as resolved species names.'),
            picks: z
              .array(
                z.object({
                  species: z.string().describe('Member to bring.'),
                  offensive: z.number().int().describe('Opponent species it hits super-effectively.'),
                  defensive: z.number().int().describe('Opponent species that hit it super-effectively on STAB.'),
                  score: z.number().int().describe('`offensive` minus `defensive`.'),
                }),
              )
              .describe('The recommended four, best first.'),
            leftBehind: z
              .array(
                z.object({
                  species: z.string().describe('Member left behind.'),
                  offensive: z.number().int(),
                  defensive: z.number().int(),
                  score: z.number().int(),
                }),
              )
              .describe('The members not recommended.'),
            atRiskTypes: z.array(z.string()).describe('Types the recommended four leave stacked and uncovered.'),
            note: z.string().describe('What the pick is scored on and what it cannot see.'),
          })
          .describe('Which four of your six to bring, scored on the types team preview shows.'),
        possibleLeads: z
          .object({
            pairs: z
              .array(
                z.object({
                  support: z.string().describe('The lead support with Fake Out, Tailwind, Trick Room, Helping Hand, Follow Me, Rage Powder or Wide Guard.'),
                  attacker: z.string().describe('The fast member that follows it up.'),
                  why: z.string().describe('One-line reason the pairing works.'),
                }),
              )
              .describe('Your strongest lead pairings; empty when no member supplied a lead-support move.'),
            note: z.string().describe('The heuristic: supports pair with your fastest attackers; it cannot see their defensive answers.'),
          })
          .describe('What to open with.'),
        dangerousOpponentLeads: z
          .object({
            pairs: z
              .array(
                z.object({
                  support: z.string().describe('Their lead support.'),
                  attacker: z.string().describe('Their fast member that follows it up.'),
                  why: z.string().describe('One-line reason to watch for it.'),
                }),
              )
              .describe('Their lead pairings, from curated movesets only; empty when none of their species have curated sets.'),
            note: z.string().describe('Only curated species have movesets to read, so an uncurated opponent contributes nothing here.'),
          })
          .describe('What to watch for at team preview.'),
        winConditions: z.array(z.string()).describe('The concrete ways the matchup is won: who answers which threat, and which Speed races are already yours.'),
        lossConditions: z.array(z.string()).describe('The concrete ways it is lost: unanswered threats, losing the Speed race, and stacked weaknesses into their STAB.'),
        pokemonToPreserve: z
          .array(z.string())
          .describe('Members that are the only super-effective answer to a threat — losing one forfeits that matchup.'),
        matchupConfidence: z
          .object({
            score: z.number().int().describe('0-100: mean of threat coverage, Speed advantage and how much of their team is known sets.'),
            note: z.string().describe('What the three components are.'),
          })
          .describe('A transparent read on how well the matchup is understood.'),
        note: z.string().describe('What is estimated rather than known: uncurated opponent speeds and moves, and everything the damage calcs do not model.'),
      },
    },
    wrap(async (args: { team: ParsedSet[]; opponent: (string | ParsedSet)[]; regulation?: string }) => {
      const dex = getDex(9);
      const regulationId = args.regulation ?? (REGULATION_SETS.find((s) => setStatus(s) === 'current')?.id ?? 'm-c');
      const set = getRegulationSet(regulationId);
      if (!set) {
        throw new Error(`Unknown regulation set "${regulationId}". Available: ${REGULATION_SETS.map((s) => s.name).join(', ')}.`);
      }
      const list = getThreatList(set.id);

      const { members, unknownMoves } = resolveMembers(args.team);

      // --- Opponent resolution: curated where a set exists, base-stat otherwise ---
      const opponents: OpponentMember[] = [];
      for (const entry of args.opponent) {
        const parsed = typeof entry === 'string' ? { species: entry } : entry;
        const sp = dex.species.get(parsed.species);
        requireExists(sp, 'Pokemon species', parsed.species);
        const curatedHit = findThreat(parsed.species, set.id);
        if (curatedHit) {
          const t = curatedHit.threat;
          const form = t.megaForm ?? t.form ?? t.species;
          const fs = dex.species.get(form);
          const moveTypes = t.moves
            .map((mv) => dex.moves.get(mv))
            .filter((m) => m.exists)
            .map((m) => m.type);
          opponents.push({
            species: sp.name,
            types: [...sp.types],
            baseSpe: sp.baseStats.spe,
            speed: finalStat(9, 'spe', fs.baseStats.spe, 31, t.evs?.spe ?? 0, 50, t.nature),
            speedKnown: true,
            moves: t.moves,
            moveTypes,
            curated: { threat: t, form, usage: t.usage, role: t.role },
          });
        } else {
          const moveTypes = (parsed.moves ?? [])
            .map((mv) => dex.moves.get(mv))
            .filter((m) => m.exists)
            .map((m) => m.type);
          opponents.push({
            species: sp.name,
            types: [...sp.types],
            baseSpe: sp.baseStats.spe,
            speed: sp.baseStats.spe,
            speedKnown: false,
            moves: parsed.moves ?? [],
            moveTypes,
          });
        }
      }
      const ranked = [...opponents].sort((a, b) => (b.curated?.usage ?? -1) - (a.curated?.usage ?? -1));

      const likelySets = ranked.map((o, i) =>
        o.curated
          ? {
              species: o.curated.form,
              priority: i + 1,
              usage: o.curated.usage,
              role: o.curated.role,
              item: o.curated.threat.item,
              ability: o.curated.threat.ability,
              nature: o.curated.threat.nature,
              evs: o.curated.threat.evs,
              moves: o.curated.threat.moves,
            }
          : { species: o.species, priority: null, note: 'No curated set' },
      );

      // --- Speed tiers ---
      const ourOrder = [...members].sort((a, b) => b.speed - a.speed);
      const theirOrder = [...opponents].sort((a, b) => b.speed - a.speed);
      const races: { ours: string; theirs: string; ourSpeed: number; theirSpeed: number; margin: number; weMoveFirst: boolean; estimated?: boolean }[] = [];
      for (const theirs of theirOrder.slice(0, 2)) {
        for (const ours of ourOrder.slice(0, 2)) {
          races.push({
            ours: ours.species,
            theirs: theirs.species,
            ourSpeed: ours.speed,
            theirSpeed: theirs.speed,
            margin: Math.abs(ours.speed - theirs.speed),
            weMoveFirst: ours.speed >= theirs.speed,
            ...(theirs.speedKnown ? {} : { estimated: true }),
          });
        }
      }

      // --- Damage calcs: our hardest hit into their top two threats, and back ---
      const calcs: { move: string; attacker: string; defender: string; damageRange: [number, number]; koChance?: string; description: string }[] = [];
      const topThreats = opponents.filter((o) => o.curated).slice(0, 2);
      for (const threat of topThreats) {
        // Their side: threat's hardest move into our best answer (highest SE coverage on it).
        let bestAnswer = ourOrder[0];
        let bestEff = 0;
        for (const m of members) {
          const eff = Math.max(...[...new Set([...m.types, ...m.moveTypes])].map((t) => typeEffectiveness(t, threat.types, 9)));
          if (eff > bestEff) {
            bestEff = eff;
            bestAnswer = m;
          }
        }
        let theirMove: { name: string; score: number } | undefined;
        for (const mv of threat.moves) {
          const m = dex.moves.get(mv);
          const eff = typeEffectiveness(m.type, bestAnswer.types, 9);
          if (!m.exists || eff === 0) continue;
          const score = eff * (m.basePower || 0);
          if (score > 0 && (!theirMove || score > theirMove.score)) theirMove = { name: m.name, score };
        }
        if (theirMove) {
          const res = damageResult(
            9,
            {
              species: threat.curated!.form,
              level: 50,
              item: threat.curated!.threat.item,
              ability: threat.curated!.threat.ability,
              nature: threat.curated!.threat.nature,
              evs: threat.curated!.threat.evs,
              moves: threat.curated!.threat.moves,
            },
            { ...bestAnswer.set, level: 50 },
            theirMove.name,
          );
          calcs.push({
            move: theirMove.name,
            attacker: res.attacker.species,
            defender: res.defender.species,
            damageRange: res.damageRange,
            koChance: res.koChance,
            description: res.description,
          });
        }
        // Our side: hardest hit into the threat.
        const ourMove = await hardestHit(dex, members, threat.types);
        if (ourMove) {
          const res = damageResult(
            9,
            { ...ourMove.member.set, level: 50 },
            {
              species: threat.curated!.form,
              level: 50,
              item: threat.curated!.threat.item,
              ability: threat.curated!.threat.ability,
              nature: threat.curated!.threat.nature,
              evs: threat.curated!.threat.evs,
              moves: threat.curated!.threat.moves,
            },
            ourMove.move,
          );
          calcs.push({
            move: ourMove.move,
            attacker: res.attacker.species,
            defender: res.defender.species,
            damageRange: res.damageRange,
            koChance: res.koChance,
            description: res.description,
          });
        }
      }

      // --- Bring four, leads, conditions ---
      const bringFour = planBringFour(
        members.map((m) => ({ species: m.species, types: m.types, moveTypes: m.moveTypes })),
        opponents.map((o) => ({ name: o.species, types: o.types })),
      );

      const ourSupports = members.filter((m) => m.moves.some((mv) => LEAD_MOVES.includes(toKey(mv))));
      const ourAttackers = [...members].sort((a, b) => b.speed - a.speed).filter((m) => !ourSupports.includes(m)).slice(0, 2);
      const ourPairs = [];
      for (const s of ourSupports.slice(0, 3)) {
        for (const a of ourAttackers.slice(0, 1)) {
          ourPairs.push({
            support: s.species,
            attacker: a.species,
            why: `${s.species} opens with ${s.moves.find((mv) => LEAD_MOVES.includes(toKey(mv)))} to buy ${a.species} (${a.speed} Speed) a free turn.`,
          });
        }
      }
      const theirSupports = opponents.filter((m) => m.moves.some((mv) => LEAD_MOVES.includes(toKey(mv))));
      const theirAttackers = [...opponents].sort((a, b) => b.speed - a.speed).filter((m) => !theirSupports.includes(m)).slice(0, 2);
      const theirPairs = [];
      for (const s of theirSupports.slice(0, 3)) {
        for (const a of theirAttackers.slice(0, 1)) {
          theirPairs.push({
            support: s.species,
            attacker: a.species,
            why: `Watch for ${s.species} opening with ${s.moves.find((mv) => LEAD_MOVES.includes(toKey(mv)))} into ${a.species}.`,
          });
        }
      }

      const threatAnswers = opponents.map((o) => {
        let best = 0;
        let by: string | undefined;
        const solvers: string[] = [];
        for (const m of members) {
          const eff = Math.max(...[...new Set([...m.types, ...m.moveTypes])].map((t) => typeEffectiveness(t, o.types, 9)));
          if (eff > best) {
            best = eff;
            by = m.species;
          }
          if (eff >= 2) solvers.push(m.species);
        }
        return { species: o.species, best, solvers, by };
      });

      const winConditions: string[] = [];
      const lossConditions: string[] = [];
      const preserve = new Set<string>();
      for (const a of threatAnswers.filter((t) => t.best >= 2).slice(0, 3)) {
        winConditions.push(`${a.by} answers ${a.species} (${a.best}\u00d7 from STAB or a supplied move).`);
        if (a.solvers.length === 1) preserve.add(a.solvers[0]);
      }
      for (const a of threatAnswers.filter((t) => t.best < 2).slice(0, 3)) {
        lossConditions.push(`No super-effective answer to ${a.species} (best hit ${a.best}\u00d7).`);
      }
      const ourFastest = ourOrder[0];
      const theirFastest = theirOrder[0];
      if (ourFastest.speed >= theirFastest.speed) {
        winConditions.push(`${ourFastest.species} (${ourFastest.speed}) outruns their fastest, ${theirFastest.species} (${theirFastest.speed}), by ${ourFastest.speed - theirFastest.speed}.`);
      } else {
        lossConditions.push(`${theirFastest.species} (${theirFastest.speed}) moves before ${ourFastest.species} (${ourFastest.speed}) by ${theirFastest.speed - ourFastest.speed}.`);
      }
      const theirStab = new Set(opponents.flatMap((o) => o.types));
      for (const t of TYPES18) {
        if (!theirStab.has(t)) continue;
        let weak = 0;
        for (const m of members) if (typeEffectiveness(t, m.types, 9) > 1) weak++;
        if (weak >= 2) lossConditions.push(`${weak} of your members are weak to ${t}, which their team carries on STAB.`);
      }

      const answered = threatAnswers.filter((t) => t.best >= 2).length;
      const coveragePart = opponents.length ? answered / opponents.length : 0.5;
      const speedPart = ourFastest.speed >= theirFastest.speed ? 1 : 0.5;
      const knownPart = opponents.length ? opponents.filter((o) => o.curated).length / opponents.length : 0;
      const confidence = Math.round(((coveragePart + speedPart + knownPart) / 3) * 100);

      return ok({
        regulation: set.name,
        opponent: opponents.map((o) => o.species),
        likelySets,
        speedTiers: {
          ourOrder: ourOrder.map((m) => m.species),
          theirOrder: theirOrder.map((o) => o.species),
          races,
        },
        relevantDamageCalcs: calcs.slice(0, 4),
        recommendedBringFour: {
          ...bringFour,
          note: 'Scored on type alone, which is what team preview gives you: ranked is closed teamlist, so the opponent\u2019s sets are unknown by design. `offensive` counts the opponent species a member hits super-effectively from STAB or a supplied move, `defensive` counts those that hit it back on their STAB. Speed, bulk, damage rolls and abilities are not modelled here \u2014 pair it with `relevantDamageCalcs`.',
        },
        possibleLeads: {
          pairs: ourPairs,
          note: 'Lead supports are members carrying Fake Out, Tailwind, Trick Room, Helping Hand, Follow Me, Rage Powder or Wide Guard, paired with your fastest attackers. It cannot see their defensive answers \u2014 treat it as a starting point, not a lock.',
        },
        dangerousOpponentLeads: {
          pairs: theirPairs,
          note: 'Read only from curated movesets; an opponent species without one contributes nothing here.',
        },
        winConditions: winConditions.slice(0, 4),
        lossConditions: lossConditions.slice(0, 5),
        pokemonToPreserve: [...preserve],
        matchupConfidence: {
          score: confidence,
          note: 'Mean of three components: share of their team your team has a super-effective answer for, whether your fastest outruns theirs, and how much of their team is known curated sets. A rough read, not a metagame rating.',
        },
        ...(unknownMoves.length ? { unknownMoves: [...new Set(unknownMoves)] } : {}),
        note: list
          ? `Opponent sets come from the ${list.name} usage list (${list.sourceAsOf}); uncurated opponent species use base-stat Speed estimates and contribute no moves, and Choice Scarf is not modelled on either side.`
          : `No usage list exists for ${set.name}, so every opponent species is estimated from base stats and STAB alone.`,
      });
    }),
  );
}

/** The team's hardest hit into a target: best super-effective power among supplied moves, else among the learnset. */
async function hardestHit(
  dex: ModdedDex,
  members: ResolvedMember[],
  targetTypes: string[],
): Promise<{ member: ResolvedMember; move: string } | undefined> {
  let best: { member: ResolvedMember; move: string; score: number } | undefined;
  for (const m of members) {
    for (const mv of m.moves) {
      const move = dex.moves.get(mv);
      const eff = move.exists ? typeEffectiveness(move.type, targetTypes, 9) : 0;
      if (eff === 0) continue;
      const stab = m.types.includes(move.type) ? 1.5 : 1;
      const score = eff * (move.basePower || 0) * stab;
      if (score > 0 && (!best || score > best.score)) best = { member: m, move: move.name, score };
    }
    // Learnset fallback for members that listed no moves: the strongest learnable hit.
    const learnable = await learnableMoveIds(dex, dex.species.get(m.species));
    for (const id of learnable) {
      const move = dex.moves.get(id);
      const eff = move.exists ? typeEffectiveness(move.type, targetTypes, 9) : 0;
      if (eff === 0 || !(move.basePower || 0)) continue;
      const stab = m.types.includes(move.type) ? 1.5 : 1;
      const score = eff * move.basePower * stab;
      if (!best || score > best.score) best = { member: m, move: move.name, score };
    }
  }
  return best ? { member: best.member, move: best.move } : undefined;
}
