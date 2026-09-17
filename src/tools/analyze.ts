/**
 * Team synergy analysis: defensive weakness stacking, offensive type coverage,
 * and speed placement against a regulation roster. Pure type/list math over the
 * existing dataset — no external data source.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getDex, typeEffectiveness, TYPES18 } from '../dex.js';
import { getRegulationSet } from '../regulations.js';
import { ok, wrap, requireExists, READ_ONLY_ANNOTATIONS } from '../result.js';

export function registerAnalyzeTools(server: McpServer) {
  server.registerTool(
    'analyze_team',
    {
      title: 'Analyze team synergy',
      description:
        'Analyze a whole team\u2019s type synergy: per-type weak, resist, and immune counts with the types at risk, super-effective coverage from STAB, Tera type and supplied moves, speed placement, and a transparent 0-100 heuristic score \u2014 a quick signal, not a metagame rating. Use `get_type_matchup` or `get_type` for one matchup. Each entry is a `species` with optional `teraType` and `moves`; unknown moves are collected into `unknownMoves`, unknown species or Tera types error, and `regulation` (e.g. "m-c") adds legal threats that outspeed your fastest member. Read-only and offline over the bundled dataset.',
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
        team: { species: string; teraType?: string; moves?: string[] }[];
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

          members.push({
            species: sp.name,
            types: [...sp.types],
            teraType: entry.teraType,
            baseSpe: sp.baseStats.spe,
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
                  note: 'Threats are base-speed comparisons; EVs, natures, and Choice Scarf shift real speed tiers.',
                }
              : {}),
          },
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
