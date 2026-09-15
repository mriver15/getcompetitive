/**
 * Team synergy analysis: defensive weakness stacking, offensive type coverage,
 * and speed placement against a regulation roster. Pure type/list math over the
 * existing dataset — no external data source.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getDex, typeEffectiveness, TYPES18 } from '../dex.js';
import { getRegulationSet } from '../regulations.js';
import { ok, wrap, requireExists } from '../result.js';

export function registerAnalyzeTools(server: McpServer) {
  server.registerTool(
    'analyze_team',
    {
      description:
        'Analyze a team\u2019s type synergy. For each of the 18 types: how many members are weak/resist/immune (flags stacked weaknesses), offensive super-effective coverage (from STAB, Tera type, and optional move types), and speed placement (fastest/slowest, plus which legal-roster threats outspeed you if a regulation set is given).',
      inputSchema: {
        team: z
          .array(
            z.object({
              species: z.string(),
              teraType: z.string().optional(),
              moves: z.array(z.string()).optional(),
            }),
          )
          .min(1)
          .max(6),
        regulation: z.string().optional(),
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
