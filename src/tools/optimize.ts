/**
 * Constraint-based team completion: "these slots are open, and these are the
 * things the finished team must answer." The engine scores every legal species
 * (and, for two open slots, every pair) against the constraints — the types
 * nothing on the current team hits super-effectively, plus the threats named or
 * the meta's own top threats — and reports the strongest fills with the reasons
 * for each. Typing is the only honest currency for unranked species (their
 * movesets are unknown), so every reason states exactly what it covers or
 * resists; usage adds a preference, never a claim about the set.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { typeEffectiveness, TYPES18 } from '../dex.js';
import { getChampionsDex } from '../champions.js';
import { REGULATION_SETS, getRegulationSet, setStatus } from '../regulations.js';
import { getThreatList, findThreat } from '../threats.js';
import { ok, wrap, READ_ONLY_ANNOTATIONS } from '../result.js';
import { parsedSetSchema, resolveMembers, type ParsedSet } from './team.js';
import { detectRoles, ROLES, type Role } from '../roles.js';

export function registerOptimizeTeamTool(server: McpServer) {
  server.registerTool(
    'optimize_team',
    {
      title: 'Optimize team slots',
      description:
        'Pok\u00e9mon Champions team building: fill open slots against constraints: "cover these types" and "answer these threats." The engine scores every legal species in the regulation against the constraint set — the types the current team never hits super-effectively (computed automatically, or supplied), and the threats named or defaulted to the meta\u2019s top five by usage — by what its typing covers, resists and hits, with a small preference for species the meta actually plays. With two open slots it scores pairs on their combined coverage, not just the sum. Every recommendation carries the reasons, so the tradeoff is visible; unranked species are scored on typing alone because their movesets are unknown. The fills respect Species Clause and stay inside the roster, so the result passes `check_legality` — verify with it once the team is assembled. Read-only and offline.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        team: z
          .array(parsedSetSchema)
          .min(1)
          .max(5)
          .describe('The team so far, in the canonical shape `parse_team` returns; the open slots are what this tool fills.'),
        slots: z
          .union([z.literal(1), z.literal(2)])
          .describe('How many members to recommend: one species, or a pair whose combined coverage is scored together.'),
        regulation: z
          .string()
          .optional()
          .describe('Regulation id, e.g. "m-c"; omitted, the current set is used and its roster bounds the candidates.'),
        coverTypes: z
          .array(z.string())
          .optional()
          .describe('Types the finished team must hit super-effectively, e.g. ["Water", "Steel"]; omitted, the engine computes the types the current team cannot hit at all.'),
        answerThreats: z
          .array(z.string())
          .optional()
          .describe('Species the finished team must answer, e.g. ["Sneasler", "Gholdengo"]; omitted, the regulation\u2019s five most-used threats are used.'),
        requiredRoles: z
          .array(z.enum(ROLES))
          .optional()
          .describe('Competitive roles the filled slots must collectively provide, e.g. ["tailwind", "fake_out"]; candidates earn score for roles the team still lacks.'),
        excludedSpecies: z
          .array(z.string())
          .optional()
          .describe('Species to exclude from the search, e.g. ["Milotic"]; case- and punctuation-insensitive.'),
        playstyle: z
          .string()
          .optional()
          .describe('Shorthand for the objective: "tailwind" or "trick-room" map to the corresponding required role; any other value is carried into the note verbatim.'),
      },
      outputSchema: {
        regulation: z.string().describe('The regulation whose roster the candidates came from.'),
        constraints: z
          .object({
            types: z.array(z.string()).describe('Types the recommendations were scored against covering.'),
            threats: z
              .array(
                z.object({
                  species: z.string().describe('Threat species.'),
                  usage: z.number().optional().describe('Usage share in percent; present for curated threats.'),
                }),
              )
              .describe('Threats the recommendations were scored against answering.'),
            requiredRoles: z
              .array(z.enum(ROLES))
              .optional()
              .describe('The roles the filled slots were asked to provide; present only when supplied or mapped from a playstyle.'),
          })
          .describe('The constraint set the search was run against.'),
        recommendations: z
          .array(
            z.object({
              members: z.array(z.string()).describe('The species to add — one, or a pair when two slots were asked for.'),
              roles: z
                .array(z.enum(ROLES))
                .optional()
                .describe('The competitive roles this fill provides, detected from learnset, abilities and base stats; present when any apply.'),
              score: z.number().describe('The fill\u2019s score against the constraints; higher is better, absolute value has no external meaning.'),
              reasons: z
                .array(z.string())
                .describe('What this fill does: the constraint types it covers super-effectively, the threats it resists, and the threats it hits super-effectively — from typing (and curated usage) alone.'),
            }),
          )
          .describe('The strongest fills, best first.'),
        note: z.string().describe('The limits: unranked species are scored on typing alone because their movesets are unknown, usage is a preference not a claim, and Species Clause is respected by construction.'),
      },
    },
    wrap(async (args: { team: ParsedSet[]; slots: 1 | 2; regulation?: string; coverTypes?: string[]; answerThreats?: string[]; requiredRoles?: Role[]; excludedSpecies?: string[]; playstyle?: string }) => {
      const dex = getChampionsDex();
      const regulationId = args.regulation ?? (REGULATION_SETS.find((s) => setStatus(s) === 'current')?.id ?? 'm-c');
      const set = getRegulationSet(regulationId);
      if (!set) {
        throw new Error(`Unknown regulation set "${regulationId}". Available: ${REGULATION_SETS.map((s) => s.name).join(', ')}.`);
      }
      const list = getThreatList(set.id);
      const { members } = resolveMembers(args.team);

      // --- Constraint set ---
      const constraintTypes = args.coverTypes ?? TYPES18.filter(
        (def) => !members.some((m) => [...new Set([...m.types, ...m.moveTypes])].some((atk) => typeEffectiveness(atk, [def], 9) > 1)),
      );
      const threatNames = args.answerThreats ?? list?.threats.slice(0, 5).map((t) => t.megaForm ?? t.form ?? t.species) ?? [];
      const threats = threatNames.map((name) => {
        const sp = dex.species.get(name);
        if (!sp.exists) throw new Error(`Unknown species "${name}".`);
        const curated = findThreat(name, set.id);
        return {
          name: sp.name,
          types: sp.types,
          usage: curated?.threat.usage,
        };
      });

      // --- Candidates: legal roster, Species Clause respected, objectives applied ---
      const excluded = new Set((args.excludedSpecies ?? []).map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')));
      const playstyleRoles: Role[] = args.playstyle === 'tailwind' ? ['tailwind'] : args.playstyle === 'trick-room' ? ['trick_room'] : [];
      const requiredRoles = [...new Set([...(args.requiredRoles ?? []), ...playstyleRoles])];
      const onTeam = new Set(members.map((m) => m.baseSpecies.toLowerCase().replace(/[^a-z0-9]/g, '')));
      const candidates: { name: string; types: string[]; baseSpe: number; usage: number; roles: Role[] }[] = [];
      for (const name of set.eligibleSpecies) {
        const sp = dex.species.get(name);
        if (!sp.exists) continue;
        const key = (sp.baseSpecies ?? sp.name).toLowerCase().replace(/[^a-z0-9]/g, '');
        if (onTeam.has(key) || excluded.has(key)) continue;
        const curated = findThreat(name, set.id);
        candidates.push({
          name: sp.name,
          types: [...sp.types],
          baseSpe: sp.baseStats.spe,
          usage: curated?.threat.usage ?? 0,
          roles: await detectRoles(sp.name),
        });
      }

      const scoreOf = (c: (typeof candidates)[number]) => {
        const covers = constraintTypes.filter((t) => c.types.some((ct) => typeEffectiveness(ct, [t], 9) > 1));
        const resists = threats.filter((t) => t.types.every((tt) => typeEffectiveness(tt, c.types, 9) < 1));
        const hits = threats.filter((t) => c.types.some((ct) => typeEffectiveness(ct, t.types, 9) > 1));
        const roles = requiredRoles.filter((r) => c.roles.includes(r));
        const score = covers.length * 3 + resists.length * 2 + hits.length * 2 + roles.length * 3 + c.usage / 25 + c.baseSpe / 200;
        return { covers, resists, hits, roles, score };
      };

      const scored = candidates
        .map((c) => ({ ...c, ...scoreOf(c) }))
        .sort((a, b) => b.score - a.score);

      const reasonsOf = (s: { name: string; covers: string[]; resists: { name: string }[]; hits: { name: string }[]; roles: Role[]; usage: number }) => {
        const out: string[] = [];
        if (s.covers.length) out.push(`${s.name} hits ${s.covers.join(', ')} super-effectively`);
        if (s.resists.length) out.push(`${s.name} resists ${s.resists.map((t) => t.name).join(', ')} on its typing`);
        if (s.hits.length) out.push(`${s.name} hits ${s.hits.map((t) => t.name).join(', ')} super-effectively`);
        if (s.roles.length) out.push(`${s.name} provides the ${s.roles.join(', ')} role${s.roles.length === 1 ? '' : 's'}`);
        if (s.usage) out.push(`${s.name} carries ${s.usage}% measured usage`);
        return out;
      };

      const top = scored.slice(0, 30);
      const recommendations =
        args.slots === 1
          ? top.slice(0, 8).map((s) => ({ members: [s.name], roles: s.roles, score: Number(s.score.toFixed(1)), reasons: reasonsOf(s) }))
          : (() => {
              const pairs: { a: (typeof top)[number]; b: (typeof top)[number]; union: string[]; score: number }[] = [];
              for (let i = 0; i < top.length; i++) {
                for (let j = i + 1; j < top.length; j++) {
                  const a = top[i];
                  const b = top[j];
                  const union = [...new Set([...a.types, ...b.types])];
                  const covers = constraintTypes.filter((t) => union.some((ct) => typeEffectiveness(ct, [t], 9) > 1));
                  const hits = threats.filter((t) => union.some((ct) => typeEffectiveness(ct, t.types, 9) > 1));
                  const resists = threats.filter((t) => t.types.every((tt) => typeEffectiveness(tt, union, 9) < 1));
                  const roleUnion = new Set([...a.roles, ...b.roles]);
                  const roleHit = requiredRoles.filter((r) => roleUnion.has(r)).length;
                  const score = covers.length * 3 + resists.length * 2 + hits.length * 2 + roleHit * 3 + (a.usage + b.usage) / 25 + Math.max(a.baseSpe, b.baseSpe) / 200;
                  pairs.push({ a, b, union, score });
                }
              }
              return pairs
                .sort((x, y) => y.score - x.score)
                .slice(0, 6)
                .map((p) => ({
                  members: [p.a.name, p.b.name],
                  roles: [...new Set([...p.a.roles, ...p.b.roles])],
                  score: Number(p.score.toFixed(1)),
                  reasons: [
                    [...new Set([...p.a.covers, ...p.b.covers])].length
                      ? `${p.a.name} + ${p.b.name} together hit ${[...new Set([...p.a.covers, ...p.b.covers])].join(', ')} super-effectively`
                      : 'no super-effective coverage added',
                    ...reasonsOf(p.a).slice(0, 2),
                    ...reasonsOf(p.b).slice(0, 2),
                  ],
                }));
            })();

      return ok({
        regulation: set.name,
        constraints: {
          types: constraintTypes,
          threats: threats.map((t) => ({ species: t.name, ...(t.usage !== undefined ? { usage: t.usage } : {}) })),
          ...(requiredRoles.length ? { requiredRoles } : {}),
        },
        recommendations,
        note: `Candidates are scored on typing and detected roles (learnset and ability facts), with measured usage as a preference and not a claim about the set. Species Clause, excluded species and roster legality hold by construction, and every recommendation carries its reasons so the tradeoff is visible.${args.playstyle && !['tailwind', 'trick-room'].includes(args.playstyle) ? ` Playstyle "${args.playstyle}" was carried verbatim and did not change the search.` : ''}`,
      });
    }),
  );
}
