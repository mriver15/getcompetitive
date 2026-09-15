/**
 * Meta tools: curated threat list + standard sets for a regulation.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { THREAT_LISTS, getThreatList, findThreat } from '../threats.js';
import { ok, wrap, READ_ONLY_ANNOTATIONS } from '../result.js';

/**
 * One full curated standard set. Shared by `list_threats`' regulation-scoped
 * `threats[]` and (spread) `get_set`'s flat payload.
 */
const threatOutput = {
  species: z.string().describe('Curated base species name in Showdown spelling, e.g. "Garchomp".'),
  role: z.string().describe('Short competitive role, e.g. "Mega sweeper / wallbreaker".'),
  tier: z
    .enum(['S', 'A', 'B'])
    .describe('Curated tier within the regulation: S (format-defining), A, or B — editorial, not usage data.'),
  item: z.string().describe('The set\u2019s standard held item, e.g. "Garchompite".'),
  ability: z.string().describe('Ability on the base form, i.e. before Mega Evolving.'),
  megaForm: z
    .string()
    .optional()
    .describe('Mega form this set evolves into, e.g. "Mega Garchomp"; absent when the set is not a Mega set.'),
  megaAbility: z
    .string()
    .optional()
    .describe('Ability after Mega Evolving; absent when the set is not a Mega set.'),
  nature: z.string().describe('Recommended nature, e.g. "Jolly".'),
  evs: z
    .object({
      hp: z.number().optional().describe('HP EVs.'),
      atk: z.number().optional().describe('Attack EVs.'),
      def: z.number().optional().describe('Defense EVs.'),
      spa: z.number().optional().describe('Special Attack EVs.'),
      spd: z.number().optional().describe('Special Defense EVs.'),
      spe: z.number().optional().describe('Speed EVs.'),
    })
    .describe('EV spread keyed by Showdown stat; only the invested stats are listed, everything omitted is 0.'),
  moves: z.array(z.string()).describe('The four recommended moves.'),
  teraType: z
    .string()
    .optional()
    .describe('Recommended Tera type; absent when the curated set does not specify one.'),
  notes: z
    .string()
    .optional()
    .describe('Curator commentary on how the set is played; absent when the curated set has none.'),
};

/** Reduced per-threat projection `list_threats` returns when no regulation is given. */
const threatSummaryOutput = {
  species: z.string().describe('Curated base species name, e.g. "Incineroar".'),
  role: z.string().describe('Short competitive role.'),
  tier: z.enum(['S', 'A', 'B']).describe('Curated tier within that regulation.'),
};

export function registerMetaTools(server: McpServer) {
  server.registerTool(
    'list_threats',
    {
      title: 'List curated meta threats',
      description:
        'List the curated meta threats for one Pok\u00e9mon Champions regulation: each threat\u2019s species, role, tier (S/A/B), and full standard set, with the list\u2019s `sourceAsOf` date; omit `regulation` to get every available list with a threat count per regulation. Use `get_set` for one species instead and `list_regulations` to discover regulation ids. Regulation ids match case- and punctuation-insensitively ("M-C", "mc"); an unknown one returns an isError naming the available lists. Curated editorial data, not usage statistics, scoped to a single regulation. Read-only and offline; no network, auth, or rate limits.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        regulation: z
          .string()
          .optional()
          .describe('Optional regulation set id, e.g. "m-c" (matched case- and punctuation-insensitively); omit to list every curated regulation with its threat count.'),
      },
      outputSchema: {
        regulation: z
          .string()
          .optional()
          .describe('Id of the returned list, e.g. "m-c"; present only when `regulation` was supplied.'),
        name: z
          .string()
          .optional()
          .describe('Display name of the returned list, e.g. "Regulation Set M-C"; present only when `regulation` was supplied.'),
        source: z
          .string()
          .optional()
          .describe('Provenance of the returned list ("curated"); present only when `regulation` was supplied.'),
        sourceAsOf: z
          .string()
          .optional()
          .describe('ISO date that list was last reviewed; present only when `regulation` was supplied.'),
        note: z
          .string()
          .optional()
          .describe('Standing disclaimer for that list (editorial, not usage-derived); present only when `regulation` was supplied.'),
        threats: z
          .array(z.object(threatOutput))
          .optional()
          .describe('Every curated threat in full, with its standard set; present only when `regulation` was supplied.'),
        lists: z
          .array(
            z.object({
              regulation: z.string().describe('Regulation id, e.g. "m-c".'),
              name: z.string().describe('Display name, e.g. "Regulation Set M-C".'),
              sourceAsOf: z.string().describe('ISO date the list was last reviewed.'),
              threats: z
                .array(z.object(threatSummaryOutput))
                .describe('Reduced projection of that regulation\u2019s threats — species, role, and tier only; call again with `regulation`, or use `get_set`, for the full standard sets.'),
            }),
          )
          .optional()
          .describe('One summary per curated regulation; present only when `regulation` was omitted.'),
      },
    },
    wrap(async (args: { regulation?: string }) => {
      if (args.regulation) {
        const list = getThreatList(args.regulation);
        if (!list) throw new Error(`No curated threats for "${args.regulation}". Available: ${Object.values(THREAT_LISTS).map((l) => `${l.name} (${l.regulation})`).join(', ')}.`);
        return ok({
          regulation: list.regulation,
          name: list.name,
          source: list.source,
          sourceAsOf: list.sourceAsOf,
          note: list.note,
          threats: list.threats,
        });
      }
      return ok({
        lists: Object.values(THREAT_LISTS).map((l) => ({
          regulation: l.regulation,
          name: l.name,
          sourceAsOf: l.sourceAsOf,
          threats: l.threats.map((t) => ({ species: t.species, role: t.role, tier: t.tier })),
        })),
      });
    }),
  );

  server.registerTool(
    'get_set',
    {
      title: 'Get standard competitive set',
      description:
        'Return one species\u2019 standard competitive set from the curated threat lists: item, ability (with the Mega form and ability for Mega sets), nature, EVs, moves, Tera type, role, tier, notes, and the list\u2019s `sourceAsOf` date. Reach for it when asked what a species usually runs; `list_threats` browses a whole regulation, `check_legality` validates teams. Species match is case-insensitive but exact; pass `regulation` (e.g. "m-c") to scope to one list; unknown species return an isError listing every known threat. Curated editorial data, not usage statistics; read-only, offline, no network or auth.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        species: z
          .string()
          .describe('Base species name as curated, e.g. "Garchomp", "Incineroar" (case-insensitive).'),
        regulation: z
          .string()
          .optional()
          .describe('Optional regulation set id, e.g. "m-c"; omit to search every curated list.'),
      },
      outputSchema: {
        regulation: z
          .string()
          .describe('Display name of the curated list the set came from, e.g. "Regulation Set M-C".'),
        sourceAsOf: z.string().describe('ISO date that list was last reviewed.'),
        ...threatOutput,
      },
    },
    wrap(async (args: { species: string; regulation?: string }) => {
      const hit = findThreat(args.species, args.regulation);
      if (!hit) {
        const known = Object.values(THREAT_LISTS).flatMap((l) => l.threats.map((t) => t.species));
        throw new Error(`No curated set for "${args.species}". Known threats: ${known.join(', ')}.`);
      }
      return ok({
        regulation: hit.list.name,
        sourceAsOf: hit.list.sourceAsOf,
        ...hit.threat,
      });
    }),
  );
}
