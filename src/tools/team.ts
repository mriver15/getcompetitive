/**
 * Team-building tools: archetypes, tier lists, and speed tiers.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { normalizeGen, getDex, finalStat, type GenerationNum } from '../dex.js';
import { getArchetype, listArchetypes, ARCHETYPES, type ArchetypeFormat } from '../archetypes.js';
import { ok, wrap, READ_ONLY_ANNOTATIONS } from '../result.js';
import { genSchema } from './schemas.js';

function usableTier(s: { isCosmeticForme: boolean; isNonstandard: string | null; battleOnly?: string | string[] }) {
  return !s.isCosmeticForme && !s.isNonstandard && !s.battleOnly;
}

/**
 * Fields every archetype carries, in both the list summary and the full entry;
 * the two differ only in how `members` is shaped, so the shared part is written
 * once and the member field is added at each use site.
 */
const archetypeFields = {
  id: z.string().describe('Stable slug id, e.g. "hyper-offense"; accepted by `get_archetype`.'),
  name: z.string().describe('Display name, e.g. "Hyper Offense"; also accepted by `get_archetype`.'),
  format: z
    .enum(['singles', 'doubles', 'both'])
    .describe('Format the archetype is written for; "both" means it applies to either.'),
  playstyle: z
    .enum(['offense', 'defense', 'balance', 'weather', 'room', 'gimmick'])
    .describe('Broad playstyle family the archetype belongs to.'),
  summary: z.string().describe('One-sentence description of the game plan.'),
  description: z.string().describe('Full prose description of how the archetype wins.'),
  keyRoles: z.array(z.string()).describe('Roles a build of this archetype must fill, e.g. "Hazard setter".'),
  strengths: z.array(z.string()).describe('What the archetype does well.'),
  weaknesses: z.array(z.string()).describe('Where the archetype is vulnerable.'),
  counters: z.array(z.string()).describe('How opponents beat it.'),
  tips: z.array(z.string()).describe('Teambuilding advice for running it.'),
};

export function registerTeamTools(server: McpServer) {
  server.registerTool(
    'list_archetypes',
    {
      title: 'List team archetypes',
      description:
        'List the curated team-building archetypes (Hyper Offense, Rain, Stall, Trick Room, …) as summaries carrying playstyle, format, key roles, and typical member species, with a total count. Use `get_archetype` for one archetype\'s full detail and `analyze_team` to evaluate an actual team. `format` narrows to `singles` or `doubles` and always keeps archetypes tagged `both`; omit it for every archetype. Editorial guidance, not usage statistics — for legal species and rosters use `list_tiers`, `get_regulation`, or `check_legality`. Read-only and offline.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        format: z
          .enum(['singles', 'doubles', 'both'])
          .optional()
          .describe(
            'Format to filter by: "singles" or "doubles" only, "both" for archetypes tagged both. Omit for every archetype.',
          ),
      },
      outputSchema: {
        count: z.number().int().describe('Number of archetypes returned, i.e. the length of `archetypes`.'),
        archetypes: z
          .array(
            z.object({
              ...archetypeFields,
              members: z
                .array(z.string())
                .describe('Typical member species names, e.g. ["Pelipper", "Barraskewda"]; roles are not included here.'),
            }),
          )
          .describe('Summaries of every curated archetype matching `format`, in the order they are defined.'),
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
      title: 'Get archetype detail',
      description:
        'Get one archetype\'s full entry: description, key roles, typical members with their assigned roles, strengths, weaknesses, counters, and teambuilding tips. Call `list_archetypes` first when the name is uncertain, and `analyze_team` when you have a real team to evaluate instead of a template to read. `name` accepts either the id or the display name, case-insensitively ("trick-room", "Trick Room"); an unknown name is an isError listing every available archetype. Read-only and offline over the curated archetype data — no network or auth.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        name: z
          .string()
          .describe('Archetype id or display name, case-insensitive, e.g. "hyper-offense" or "Trick Room".'),
      },
      outputSchema: {
        ...archetypeFields,
        members: z
          .array(
            z.object({
              species: z.string().describe('Typical member species name, e.g. "Great Tusk".'),
              role: z.string().describe('The job that member does in this archetype, e.g. "Physical wall + Rapid Spin remover".'),
            }),
          )
          .describe('Typical members paired with the role each fills — fuller than `list_archetypes`, which lists species only.'),
      },
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
      title: 'List tiers and their species',
      description:
        'List species names grouped by competitive tier — Smogon tiers (Uber, OU, UU, RU, NU, PU, NFE, LC, …) for `singles`, VGC tiers for `doubles` — answering "what is legal in tier X". `tier` filters to one exact tier name, case-insensitive; omit it for every tier, returned as tier → {count, pokemon[]} ordered strongest to weakest. Cosmetic, nonstandard, battle-only, and CAP/Unreleased entries are omitted. These are fan tiers, not Champions regulation rosters: use `get_regulation` or `check_legality` for those, and `list_speed_tiers` for Speed numbers. Read-only and offline.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        league: z
          .enum(['singles', 'doubles'])
          .default('singles')
          .describe('Tier list to group by: "singles" uses Smogon singles tiers, "doubles" uses VGC tiers (default "singles").'),
        tier: z
          .string()
          .optional()
          .describe('Exact tier name to restrict output to, case-insensitive, e.g. "OU" or "UU". Omit for every tier.'),
        generation: genSchema,
      },
      outputSchema: {
        generation: z.number().int().describe('Generation whose data was read, after normalising `generation`.'),
        league: z.enum(['singles', 'doubles']).describe('Which tier list the grouping came from — Smogon singles or VGC doubles.'),
        tiers: z
          .record(
            z.string(),
            z.object({
              count: z.number().int().describe('How many species the tier holds.'),
              pokemon: z.array(z.string()).describe('Every species name in the tier, sorted alphabetically.'),
            }),
          )
          .describe(
            'Map of tier name (e.g. "OU", "UU", "DUU") to its roster, ordered strongest tier first. Holds every tier present in the chosen league and generation, or just the requested `tier` when one was supplied; an empty object means no tier matched.',
          ),
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
    'list_speed_tiers',
    {
      title: 'Compute speed tiers',
      description:
        'Compute Speed numbers for every species in one tier at three investment levels: base Speed, max (252 EV, +Spe nature), 252 neutral, and uninvested (31 IVs), sorted fastest to slowest — use it to see whether a set outspeeds a threat. `tier` must match a name from `list_tiers` for league `singles` exactly (case-insensitive, "OU"); anything else is an isError pointing at `list_tiers`. `level` defaults to 50 and `query` substring-filters species. Use `list_tiers` for tier rosters and `check_speed` for one Pokémon against the whole roster. Read-only and offline.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        tier: z
          .string()
          .describe('Exact singles tier name as `list_tiers` reports it, case-insensitive, e.g. "OU", "UU", "PU".'),
        level: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(50)
          .describe('Level at which Speed is computed, 1-100 (default 50, the standard competitive level).'),
        query: z
          .string()
          .optional()
          .describe('Case-insensitive substring to keep only matching species names, e.g. "rotom". Omit for the whole tier.'),
        generation: genSchema,
      },
      outputSchema: {
        generation: z.number().int().describe('Generation whose data was read, after normalising `generation`.'),
        tier: z.string().describe('Tier name as it was requested; matches a `list_tiers` singles tier name.'),
        level: z.number().int().describe('Level the Speed numbers were computed at, 1-100.'),
        count: z.number().int().describe('Number of species rows returned, i.e. the length of `speedTiers`.'),
        speedTiers: z
          .array(
            z.object({
              species: z.string().describe('Species name.'),
              baseSpe: z.number().int().describe('Base Speed stat, before nature, EVs, or level.'),
              max: z.number().int().describe('Speed at 252 Speed EVs, a +Spe nature (Jolly), and 31 IVs.'),
              neutral252: z.number().int().describe('Speed at 252 Speed EVs, a neutral nature, and 31 IVs.'),
              uninvested: z.number().int().describe('Speed with no Speed EVs, a neutral nature, and 31 IVs.'),
            }),
          )
          .describe('One row per species in the tier — and matching `query` when given — sorted fastest `max` to slowest.'),
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
