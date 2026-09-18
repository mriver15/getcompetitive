/**
 * Team synergy analysis: defensive weakness stacking, offensive type coverage,
 * and speed placement against a regulation roster. Pure type/list math over the
 * existing dataset — no external data source.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getDex, typeEffectiveness, TYPES18, finalStat, resolveEvs } from '../dex.js';
import { getRegulationSet } from '../regulations.js';
import { getThreatList } from '../threats.js';
import { ok, wrap, requireExists, READ_ONLY_ANNOTATIONS } from '../result.js';
import { evMap, championsPointsMap } from './schemas.js';

export function registerAnalyzeTools(server: McpServer) {
  server.registerTool(
    'analyze_team',
    {
      title: 'Analyze team synergy',
      description:
        'Analyze a whole team\u2019s type synergy: per-type weak, resist, and immune counts with the types at risk, super-effective coverage from STAB, Tera type and supplied moves, speed placement, and a transparent 0-100 heuristic score \u2014 a quick signal, not a metagame rating. With `regulation` it also reports `threatCoverage`: how the team fares against that regulation\u2019s most-used sets, each threat\u2019s real nature, EVs and Mega form included, listing the threats nothing on the team hits super-effectively. Use `get_type_matchup` or `get_type` for one matchup. Each entry is a `species` with optional `teraType`, `moves`, `nature`, `evs`/`championsPoints` and `item`; unknown moves are collected into `unknownMoves`, unknown species or Tera types error. Read-only and offline over the bundled dataset.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        team: z
          .array(
            z.object({
              species: z.string().describe('Species name as it appears in Showdown, e.g. "Incineroar", "Garchomp".'),
              teraType: z
                .string()
                .optional()
                .describe('Optional Tera type, e.g. "Steel"; when set it replaces the member\u2019s defensive typing in the weakness tally.'),
              moves: z
                .array(z.string())
                .optional()
                .describe('Optional move names, e.g. ["Knock Off"]; their types widen offensive coverage. Unknown names are reported, not fatal.'),
              nature: z
                .string()
                .optional()
                .describe(
                  'Optional nature, e.g. "Jolly"; with a spread it sets the member\u2019s real Speed for the threat coverage, otherwise Speed is left neutral and uninvested.',
                ),
              evs: evMap.describe('Optional spread in the 0-252 scale; only Speed affects this analysis.'),
              championsPoints: championsPointsMap.describe(
                'Optional Champions stat points, e.g. { spe: 32 }; only Speed affects this analysis, and it is an alternative to `evs`.',
              ),
              item: z
                .string()
                .optional()
                .describe('Optional held item, e.g. "Choice Scarf"; Choice Scarf multiplies the member\u2019s Speed by 1.5 in the threat coverage.'),
            }),
          )
          .min(1)
          .max(6)
          .describe('Team of up to 6 members, each a species with optional Tera type and moves.'),
        regulation: z
          .string()
          .optional()
          .describe('Optional regulation set id, e.g. "m-c"; when given, the reply also lists legal threats whose base speed beats your fastest member. Unknown ids return an isError.'),
      },
      outputSchema: {
        team: z
          .array(
            z.object({
              species: z.string().describe('Resolved species name, e.g. "Great Tusk".'),
              types: z.array(z.string()).describe('The species\u2019 types as the dataset defines them, e.g. ["Ground", "Fighting"].'),
              teraType: z
                .string()
                .optional()
                .describe('Tera type supplied for this member; when set it replaces the member\u2019s typing defensively and is added to its attacking types. Absent when none was given.'),
              baseSpe: z.number().int().describe('Base Speed stat of the species, used for the speed placement below.'),
              moveTypes: z
                .array(z.string())
                .describe('Types of the supplied moves that were recognised, e.g. ["Dark"]; unrecognised move names are left out here and listed in `unknownMoves`.'),
            }),
          )
          .describe('The analysed team in the order it was supplied, each member with the typing actually used for the analysis.'),
        defensiveWeaknesses: z
          .record(
            z.string(),
            z.object({
              weak: z.number().int().describe('How many members take super-effective damage from this attacking type.'),
              resist: z.number().int().describe('How many members resist it (damage below neutral).'),
              immune: z.number().int().describe('How many members are immune to it.'),
              weakBy: z.array(z.string()).describe('Species names of the members weak to it, in team order; empty when none are.'),
            }),
          )
          .describe(
            'One entry for each of the 18 classic types (keyed by type name, e.g. "Fire"), tallying how the team fares defensively against that type. A member is counted on its Tera type instead of its own types when a Tera type was supplied.',
          ),
        atRiskTypes: z
          .array(z.string())
          .describe('The stacked-weakness types: at least two members weak to it and nobody resisting or immune. Empty means no such hole.'),
        offensiveCoverage: z
          .object({
            coveredBy: z
              .record(z.string(), z.array(z.string()))
              .describe(
                'One entry for each of the 18 classic types (keyed by the defending type), listing the team members that hit it super-effectively from STAB, Tera type, or a supplied move type; an empty array means nobody does.',
              ),
            uncoveredSuperEffectively: z.array(z.string()).describe('Defending types no member hits super-effectively.'),
            note: z.string().describe('Reminder of which attacking types this coverage was computed from.'),
          })
          .describe('Super-effective coverage of all 18 defending types.'),
        speed: z
          .object({
            fastest: z
              .object({
                species: z.string().describe('Species name of the team\u2019s fastest member by base Speed.'),
                baseSpe: z.number().int().describe('Its base Speed stat.'),
              })
              .describe('The fastest member of the team.'),
            slowest: z
              .object({
                species: z.string().describe('Species name of the team\u2019s slowest member by base Speed.'),
                baseSpe: z.number().int().describe('Its base Speed stat.'),
              })
              .describe('The slowest member of the team.'),
            regulation: z
              .string()
              .optional()
              .describe('Display name of the regulation that was checked; present only when `regulation` was supplied.'),
            fasterThreatCount: z
              .number()
              .int()
              .optional()
              .describe('How many legal species outspeed the fastest member; present only when `regulation` was supplied.'),
            fasterThreats: z
              .array(
                z.object({
                  species: z.string().describe('Legal species name.'),
                  baseSpe: z.number().int().describe('Its base Speed stat, higher than the team\u2019s fastest.'),
                }),
              )
              .optional()
              .describe(
                'Up to 20 of those threats, fastest first, cut off at that limit; present only when `regulation` was supplied — compare with `fasterThreatCount` for the full total.',
              ),
            note: z
              .string()
              .optional()
              .describe('Caveat that threats are base-speed comparisons only; present only when `regulation` was supplied.'),
          })
          .describe('Where the team sits on the speed spectrum, plus legal faster threats when a regulation was given.'),
        threatCoverage: z
          .object({
            regulation: z.string().describe('Display name of the regulation whose threat list was used, e.g. "Regulation Set M-C".'),
            sourceAsOf: z.string().describe('ISO date of the newest data point behind that threat list.'),
            threats: z.array(
              z.object({
                species: z.string().describe('The threat as the meta plays it, e.g. "Salamence-Mega".'),
                usage: z.number().describe('Share of the sampled teams carrying it, in percent.'),
                threatSpeed: z.number().int().describe('Its Speed at level 50 with its own nature, EVs and Mega form.'),
                fastestSpeed: z.number().int().describe('Your fastest member\u2019s Speed at level 50 with the sets you supplied.'),
                outspeed: z.boolean().describe('True when your fastest member moves first.'),
                hitMultiplier: z.number().describe('Best type multiplier your team has against it, from STAB, Tera type and supplied moves; 0 when nothing can hit it at all.'),
                hitBy: z.string().optional().describe('The member providing that best hit; absent when nothing hits it super-effectively.'),
                hitVia: z.string().optional().describe('The attacking type providing it; absent when nothing hits it super-effectively.'),
                answered: z.boolean().describe('True when the team has a super-effective (\u22652x) hit on it.'),
              }),
            ).describe('One entry per threat in the regulation\u2019s list, most used first.'),
            unanswered: z.array(z.string()).describe('Threats with no super-effective hit from this team \u2014 the coverage holes to fix first.'),
            unansweredCount: z.number().int().describe('How many threats are unanswered.'),
            note: z.string().describe('How the comparison is made, and what it does not model.'),
          })
          .optional()
          .describe(
            'How the team fares against the regulation\u2019s most-used sets; present only when a regulation with a usage-derived threat list was supplied.',
          ),
        score: z
          .object({
            overall: z.number().int().describe('Rounded mean of the component scores, 0-100.'),
            defensive: z.number().int().describe('0-100 score penalising stacked weaknesses, floored at 0.'),
            coverage: z.number().int().describe('0-100 share of the 18 types the team hits super-effectively.'),
            speed: z
              .number()
              .int()
              .optional()
              .describe('0-100 score dropping 2 points per legal faster threat; present only when `regulation` was supplied.'),
            note: z.string().describe('What each component means and the reminder that this is a heuristic, not a metagame rating.'),
          })
          .describe('Transparent heuristic 0-100 scoring of the team.'),
        unknownMoves: z
          .array(z.string())
          .optional()
          .describe(
            'Deduplicated move names that were not found in the dataset and so contributed no coverage; omitted entirely when every move resolved.',
          ),
      },
    },
    wrap(
      async (args: {
        team: {
          species: string;
          teraType?: string;
          moves?: string[];
          nature?: string;
          evs?: Record<string, number>;
          championsPoints?: Record<string, number>;
          item?: string;
        }[];
        regulation?: string;
      }) => {
        const dex = getDex(9);

        const set = args.regulation ? getRegulationSet(args.regulation) : undefined;
        if (args.regulation && !set) {
          throw new Error(`Unknown regulation set "${args.regulation}".`);
        }

        const members: {
          species: string;
          types: string[];
          teraType?: string;
          baseSpe: number;
          speed: number;
          moveTypes: string[];
        }[] = [];
        const unknownMoves: string[] = [];

        for (const entry of args.team) {
          const sp = dex.species.get(entry.species);
          requireExists(sp, 'Pokemon species', entry.species);

          const moveTypes: string[] = [];
          for (const mv of entry.moves ?? []) {
            const m = dex.moves.get(mv);
            if (m.exists) moveTypes.push(m.type);
            else unknownMoves.push(mv);
          }

          if (entry.teraType && !dex.types.get(entry.teraType).exists) {
            throw new Error(`Unknown Tera type "${entry.teraType}".`);
          }

          // Real Speed at level 50 from whatever set was supplied, so the threat
          // comparison below uses the spread the player actually runs rather than a
          // base-stat assumption. Choice Scarf is the only item that changes Speed.
          const nature = entry.nature ?? 'Serious';
          requireExists(dex.natures.get(nature), 'nature', nature);
          const item = entry.item ? dex.items.get(entry.item) : undefined;
          if (item && !item.exists) throw new Error(`Unknown item "${entry.item}".`);
          const evs = resolveEvs(entry.evs, entry.championsPoints);
          const baseSpeed = finalStat(9, 'spe', sp.baseStats.spe, 31, evs.spe ?? 0, 50, nature);

          members.push({
            species: sp.name,
            types: [...sp.types],
            teraType: entry.teraType,
            baseSpe: sp.baseStats.spe,
            speed: item?.name === 'Choice Scarf' ? Math.floor(baseSpeed * 1.5) : baseSpeed,
            moveTypes,
          });
        }

        // --- Defensive weakness stacking ---
        const defensive: Record<string, { weak: number; resist: number; immune: number; weakBy: string[] }> = {};
        for (const t of TYPES18) {
          let weak = 0;
          let resist = 0;
          let immune = 0;
          const weakBy: string[] = [];
          for (const m of members) {
            // Tera replaces defensive typing entirely.
            const defTypes = m.teraType ? [m.teraType] : m.types;
            const eff = typeEffectiveness(t, defTypes, 9);
            if (eff === 0) immune++;
            else if (eff > 1) {
              weak++;
              weakBy.push(m.species);
            } else if (eff < 1) resist++;
          }
          defensive[t] = { weak, resist, immune, weakBy };
        }

        const atRisk = TYPES18.filter(
          (t) => defensive[t].weak >= 2 && defensive[t].resist + defensive[t].immune === 0,
        );

        // --- Offensive super-effective coverage ---
        const coverage: Record<string, string[]> = {};
        const uncovered: string[] = [];
        for (const def of TYPES18) {
          const hitters: string[] = [];
          for (const m of members) {
            const atkTypes = new Set([...m.types, ...m.moveTypes]);
            if (m.teraType) atkTypes.add(m.teraType);
            for (const atk of atkTypes) {
              if (typeEffectiveness(atk, [def], 9) > 1) {
                hitters.push(m.species);
                break;
              }
            }
          }
          coverage[def] = hitters;
          if (hitters.length === 0) uncovered.push(def);
        }

        // --- Speed placement ---
        const teamSpeeds = members.map((m) => ({ species: m.species, baseSpe: m.baseSpe }));
        const fastest = [...teamSpeeds].sort((a, b) => b.baseSpe - a.baseSpe)[0];
        const slowest = [...teamSpeeds].sort((a, b) => a.baseSpe - b.baseSpe)[0];

        let fasterThreats: { species: string; baseSpe: number }[] = [];
        if (set) {
          const threshold = fastest.baseSpe;
          for (const name of set.eligibleSpecies) {
            const s = dex.species.get(name);
            if (!s.exists) continue;
            if (s.baseStats.spe > threshold) fasterThreats.push({ species: s.name, baseSpe: s.baseStats.spe });
          }
          fasterThreats.sort((a, b) => b.baseSpe - a.baseSpe);
        }

        // --- Threat coverage against the sets the meta actually plays ---
        const threatList = args.regulation ? getThreatList(args.regulation) : undefined;
        const fastestMember = [...members].sort((a, b) => b.speed - a.speed)[0];
        const threatCoverage = threatList?.threats.map((threat) => {
          const form = threat.megaForm ?? threat.form ?? threat.species;
          const threatSpecies = dex.species.get(form);
          const threatSpeed = finalStat(9, 'spe', threatSpecies.baseStats.spe, 31, threat.evs?.spe ?? 0, 50, threat.nature);
          let best: { member: string; multiplier: number; via: string } | undefined;
          for (const m of members) {
            const atkTypes = new Set([...m.types, ...m.moveTypes]);
            if (m.teraType) atkTypes.add(m.teraType);
            for (const atk of atkTypes) {
              const eff = typeEffectiveness(atk, threatSpecies.types, 9);
              if (!best || eff > best.multiplier) best = { member: m.species, multiplier: eff, via: atk };
            }
          }
          const multiplier = best?.multiplier ?? 0;
          return {
            species: form,
            usage: threat.usage,
            threatSpeed,
            fastestSpeed: fastestMember.speed,
            outspeed: fastestMember.speed > threatSpeed,
            hitMultiplier: multiplier,
            ...(multiplier > 1 && best ? { hitBy: best.member, hitVia: best.via } : {}),
            answered: multiplier >= 2,
          };
        });
        const unanswered = threatCoverage?.filter((t) => !t.answered).map((t) => t.species) ?? [];

        // Transparent heuristic score — a quick signal, not a metagame rating.
        const coverageScore = Math.round(((TYPES18.length - uncovered.length) / TYPES18.length) * 100);
        let defensiveScore = 100;
        for (const t of TYPES18) {
          const w = defensive[t].weak;
          if (w >= 4) defensiveScore -= 40;
          else if (w >= 3) defensiveScore -= 25;
          else if (w >= 2) defensiveScore -= 12;
        }
        defensiveScore = Math.max(0, defensiveScore);
        const speedScore = set ? Math.max(0, 100 - fasterThreats.length * 2) : undefined;
        const parts = [defensiveScore, coverageScore, ...(speedScore !== undefined ? [speedScore] : [])];
        const overall = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);

        return ok({
          team: members.map((m) => ({
            species: m.species,
            types: m.types,
            teraType: m.teraType,
            baseSpe: m.baseSpe,
            moveTypes: m.moveTypes,
          })),
          defensiveWeaknesses: defensive,
          atRiskTypes: atRisk,
          offensiveCoverage: {
            coveredBy: coverage,
            uncoveredSuperEffectively: uncovered,
            note: 'Coverage is computed from STAB types, Tera type, and any provided move types.',
          },
          speed: {
            fastest,
            slowest,
            ...(set
              ? {
                  regulation: set.name,
                  fasterThreatCount: fasterThreats.length,
                  fasterThreats: fasterThreats.slice(0, 20),
                  note: 'Threats are base-speed comparisons; for the real-set comparison see `threatCoverage`, which applies each threat\u2019s actual nature, EVs and Mega form.',
                }
              : {}),
          },
          ...(threatCoverage && threatList
            ? {
                threatCoverage: {
                  regulation: threatList.name,
                  sourceAsOf: threatList.sourceAsOf,
                  threats: threatCoverage,
                  unanswered,
                  unansweredCount: unanswered.length,
                  note: 'Each threat is checked against the set the meta actually plays \u2014 its own nature, EVs, item and Mega form \u2014 so `outspeed` compares real Speed at level 50 rather than base stats. `answered` means the team has a super-effective (\u22652x) hit from STAB, Tera type, or a supplied move; it does not model damage rolls, bulk, or whether you survive the return hit.',
                },
              }
            : {}),
          score: {
            overall,
            defensive: defensiveScore,
            coverage: coverageScore,
            ...(speedScore !== undefined ? { speed: speedScore } : {}),
            note: 'Heuristic 0-100: defensive = penalty for stacked weaknesses; coverage = % of 18 types hit super-effectively; speed = penalty for faster legal threats. Not a metagame rating.',
          },
          ...(unknownMoves.length ? { unknownMoves: [...new Set(unknownMoves)] } : {}),
        });
      },
    ),
  );
}
