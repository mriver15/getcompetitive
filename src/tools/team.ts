/**
 * Team-building tools: archetypes, tier lists, and speed tiers.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { normalizeGen, getDex, finalStat, type GenerationNum } from '../dex.js';
import { getArchetype, listArchetypes, ARCHETYPES, type ArchetypeFormat } from '../archetypes.js';
import { ok, wrap } from '../result.js';

const genSchema = z.number().int().min(1).max(9).default(9);

function usableTier(s: { isCosmeticForme: boolean; isNonstandard: string | null; battleOnly?: string | string[] }) {
  return !s.isCosmeticForme && !s.isNonstandard && !s.battleOnly;
}

export function registerTeamTools(server: McpServer) {
  server.registerTool(
    'list_archetypes',
    {
      description:
        'List recognized competitive team-building archetypes (Hyper Offense, Rain, Stall, Trick Room, etc.) with summaries, playstyle, key roles, and typical members. Optionally filter by format (singles/doubles/both).',
      inputSchema: {
        format: z.enum(['singles', 'doubles', 'both']).optional(),
      },
    },
    wrap(async (args: { format?: ArchetypeFormat }) => {
      const list = listArchetypes(args.format);
      return ok({
        count: list.length,
        archetypes: list,
      });
    }),
  );

  server.registerTool(
    'get_archetype',
    {
      description:
        'Get the full detail for one team-building archetype: description, key roles, typical members with roles, strengths, weaknesses, counters, and teambuilding tips.',
      inputSchema: { name: z.string() },
    },
    wrap(async (args: { name: string }) => {
      const a = getArchetype(args.name);
      if (!a) {
        throw new Error(`Unknown archetype "${args.name}". Available: ${ARCHETYPES.map((x) => x.name).join(', ')}.`);
      }
      return ok(a);
    }),
  );

  server.registerTool(
    'list_tiers',
    {
      description:
        'List every legal Pokemon grouped by competitive tier (Uber/Ubers, OU, UU, RU, NU, PU, NFE, LC, etc.), so you can see what is legal in a given tier. Choose the singles (Smogon OU-based) or doubles (VGC-based) tier list. Optionally restrict to a single tier name.',
      inputSchema: {
        league: z.enum(['singles', 'doubles']).default('singles'),
        tier: z.string().optional(),
        generation: genSchema,
      },
    },
    wrap(async (args: { league: 'singles' | 'doubles'; tier?: string; generation: number }) => {
      const gen = normalizeGen(args.generation);
      const dex = getDex(gen);
      const groups = new Map<string, string[]>();
      for (const s of dex.species.all()) {
        if (!usableTier(s)) continue;
        const tier = args.league === 'doubles' ? s.doublesTier : s.tier;
        if (!tier || tier === 'Illegal' || tier === 'Unreleased' || tier === 'CAP') continue;
        const list = groups.get(tier) ?? [];
        list.push(s.name);
        groups.set(tier, list);
      }
      const wanted = args.tier?.toLowerCase();
      const out: Record<string, { count: number; pokemon: string[] }> = {};
      for (const [tier, names] of [...groups.entries()].sort((a, b) => tierOrder(a[0]) - tierOrder(b[0]))) {
        if (wanted && tier.toLowerCase() !== wanted) continue;
        names.sort();
        out[tier] = { count: names.length, pokemon: names };
      }
      return ok({ generation: gen, league: args.league, tiers: out });
    }),
  );

  server.registerTool(
    'speed_tiers',
    {
      description:
        'Compute the Speed stat of every Pokemon in a given tier at common investment levels (max positive, max neutral, uninvested), sorted fastest to slowest. Essential for deciding whether your set outspeeds a specific threat. Optionally filter by name substring.',
      inputSchema: {
        tier: z.string(),
        level: z.number().int().min(1).max(100).default(50),
        query: z.string().optional(),
        generation: genSchema,
      },
    },
    wrap(async (args: { tier: string; level: number; query?: string; generation: number }) => {
      const gen = normalizeGen(args.generation);
      const dex = getDex(gen);
      const wanted = args.tier.toLowerCase();
      const q = args.query?.toLowerCase().trim();

      const rows: {
        species: string;
        baseSpe: number;
        max: number;
        neutral252: number;
        uninvested: number;
      }[] = [];

      for (const s of dex.species.all()) {
        if (!usableTier(s)) continue;
        if (s.tier.toLowerCase() !== wanted) continue;
        if (q && !s.name.toLowerCase().includes(q)) continue;
        const base = s.baseStats.spe;
        rows.push({
          species: s.name,
          baseSpe: base,
          max: finalStat(gen, 'spe', base, 31, 252, args.level, 'Jolly'),
          neutral252: finalStat(gen, 'spe', base, 31, 252, args.level, 'Serious'),
          uninvested: finalStat(gen, 'spe', base, 31, 0, args.level, 'Serious'),
        });
      }

      rows.sort((a, b) => b.max - a.max || b.baseSpe - a.baseSpe || a.species.localeCompare(b.species));

      if (rows.length === 0) {
        throw new Error(`No Pokemon found in tier "${args.tier}"${q ? ` matching "${q}"` : ''}. Check list_tiers for valid tier names.`);
      }

      return ok({
        generation: gen,
        tier: args.tier,
        level: args.level,
        count: rows.length,
        speedTiers: rows,
      });
    }),
  );
}

function tierOrder(tier: string): number {
  const order: Record<string, number> = {
    Uber: 0, Ubers: 0,
    UUBL: 1, OU: 1, DOU: 1,
    RUBL: 2, UU: 2, DUU: 2,
    NUBL: 3, RU: 3,
    PUBL: 4, NU: 4,
    PU: 5,
    ZUBL: 6, ZU: 6,
    NFE: 7, LC: 8,
  };
  return order[tier] ?? 9;
}
