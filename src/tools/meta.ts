/**
 * Meta tools: usage-derived threat list + standard sets for a regulation.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { THREAT_LISTS, getThreatList, findThreat } from '../threats.js';
import { ok, wrap, READ_ONLY_ANNOTATIONS } from '../result.js';

/**
 * One full usage-derived standard set. Shared by `list_threats`' regulation-scoped
 * `threats[]` and (spread) `get_set`'s flat payload.
 */
const threatOutput = {
  species: z
    .string()
    .describe(
      'Base species name in Showdown spelling, e.g. "Garchomp"; every form collapses into it because Species Clause is per National Pokédex number.',
    ),
  form: z
    .string()
    .optional()
    .describe('Form the set is played as when that is not the default one, e.g. "Arcanine-Hisui"; absent otherwise.'),
  megaForm: z
    .string()
    .optional()
    .describe('Mega form this set evolves into, e.g. "Salamence-Mega"; absent when the set is not a Mega set.'),
  role: z
    .string()
    .describe('Role read off the set\u2019s ability and moves, e.g. "Rain setter", "Mega Intimidate pivot".'),
  tier: z
    .enum(['S', 'A', 'B'])
    .describe('Usage band: S is the top 5 by usage, A the next 7, B the rest of the list.'),
  rank: z.number().int().describe('Position by usage in this list; 1 is the most used.'),
  usage: z.number().describe('Share of the sampled teams carrying this species, in percent.'),
  item: z.string().describe('Most-played held item, e.g. "Salamencite".'),
  ability: z
    .string()
    .describe('Most-played ability on the form that was led, i.e. before Mega Evolving on a Mega set.'),
  megaAbility: z
    .string()
    .optional()
    .describe('Ability after Mega Evolving; absent when the set is not a Mega set.'),
  nature: z.string().describe('Most-played nature, e.g. "Timid".'),
  evs: z
    .object({
      hp: z.number().optional().describe('HP EVs.'),
      atk: z.number().optional().describe('Attack EVs.'),
      def: z.number().optional().describe('Defense EVs.'),
      spa: z.number().optional().describe('Special Attack EVs.'),
      spd: z.number().optional().describe('Special Defense EVs.'),
      spe: z.number().optional().describe('Speed EVs.'),
    })
    .optional()
    .describe(
      'Most-played spread, keyed by Showdown stat and scaled to the 0-252 EVs `calculate_stats` and `calculate_damage` take; only invested stats are listed, everything omitted is 0. Absent when the source published no spread for that species.',
    ),
  moves: z.array(z.string()).describe('The four most-played moves, most played first.'),
  notes: z
    .string()
    .optional()
    .describe('The usage figures this set was derived from; absent when the list carries none.'),
};

/** Reduced per-threat projection `list_threats` returns when no regulation is given. */
const threatSummaryOutput = {
  species: z.string().describe('Base species name, e.g. "Rillaboom".'),
  role: z.string().describe('Role read off the set.'),
  tier: z.enum(['S', 'A', 'B']).describe('Usage band within that regulation.'),
  usage: z.number().describe('Share of the sampled teams carrying this species, in percent.'),
};

export function registerMetaTools(server: McpServer) {
  server.registerTool(
    'list_threats',
    {
      title: 'List meta threats',
      description:
        'List the most-used Pok\u00e9mon of one Pok\u00e9mon Champions regulation, ranked by measured usage: each threat\u2019s species, form, role, tier (S/A/B by usage rank), usage share and most-played standard set, plus the sample and sources the list was derived from; omit `regulation` to get every available list with a threat count and its top threats. Use `get_set` for one species instead and `list_regulations` to discover regulation ids. Regulation ids match case- and punctuation-insensitively ("M-C", "mc"); an unknown one returns an isError naming the available lists. Usage-derived from Limitless VGC tournament teams, not editorial opinion. Read-only and offline; no network, auth, or rate limits.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        regulation: z
          .string()
          .optional()
          .describe('Optional regulation set id, e.g. "m-c" (matched case- and punctuation-insensitively); omit to list every regulation with its threat count.'),
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
          .describe('Provenance of the returned list ("usage"); present only when `regulation` was supplied.'),
        sourceAsOf: z
          .string()
          .optional()
          .describe('ISO date of the newest data point behind that list; present only when `regulation` was supplied.'),
        note: z
          .string()
          .optional()
          .describe('How that list was derived and what it leaves out; present only when `regulation` was supplied.'),
        sample: z
          .object({
            teams: z.number().int().describe('Teams sampled.'),
            tournaments: z.number().int().describe('Tournaments those teams came from.'),
            minPlayers: z.number().int().describe('Minimum players per tournament for inclusion.'),
            windowDays: z.number().int().describe('How far back the source looked, in days.'),
            through: z.string().describe('ISO date of the newest tournament in the sample.'),
          })
          .optional()
          .describe('Size and window of the sample the list was derived from; present only when `regulation` was supplied.'),
        sources: z
          .array(
            z.object({
              name: z.string().describe('Dataset name, e.g. "Data from Limitless TCG".'),
              url: z.string().describe('Where that dataset is published.'),
              scope: z.string().describe('Which fields of a threat it supplies.'),
            }),
          )
          .optional()
          .describe('Every dataset behind the list, with what each one supplies; present only when `regulation` was supplied.'),
        corroboration: z
          .object({
            source: z.string().describe('The independent source that was compared against, e.g. "Pikalytics".'),
            url: z.string().describe('Where that source publishes its ranking.'),
            dataDate: z.string().describe('That source\u2019s own data-revision label, which lags the regulation itself.'),
            top10Overlap: z
              .number()
              .int()
              .describe('How many of this list\u2019s top 10 that source also ranks in its top 10, out of 10.'),
          })
          .optional()
          .describe('Independent second ranking used to check the ordering; absent when the cross-check was unavailable, or when `regulation` was omitted.'),
        threats: z
          .array(z.object(threatOutput))
          .optional()
          .describe('Every threat in this regulation, most used first, with its standard set; present only when `regulation` was supplied.'),
        lists: z
          .array(
            z.object({
              regulation: z.string().describe('Regulation id, e.g. "m-c".'),
              name: z.string().describe('Display name, e.g. "Regulation Set M-C".'),
              sourceAsOf: z.string().describe('ISO date of the newest data point behind that list.'),
              threats: z
                .array(z.object(threatSummaryOutput))
                .describe('Reduced projection of that regulation\u2019s threats — species, role, tier and usage only; call again with `regulation`, or use `get_set`, for the full standard sets.'),
            }),
          )
          .optional()
          .describe('One summary per regulation; present only when `regulation` was omitted.'),
      },
    },
    wrap(async (args: { regulation?: string }) => {
      if (args.regulation) {
        const list = getThreatList(args.regulation);
        if (!list) throw new Error(`No threats for "${args.regulation}". Available: ${Object.values(THREAT_LISTS).map((l) => `${l.name} (${l.regulation})`).join(', ')}.`);
        return ok({
          regulation: list.regulation,
          name: list.name,
          source: list.source,
          sourceAsOf: list.sourceAsOf,
          note: list.note,
          sample: list.sample,
          sources: list.sources,
          ...(list.corroboration ? { corroboration: list.corroboration } : {}),
          threats: list.threats,
        });
      }
      return ok({
        lists: Object.values(THREAT_LISTS).map((l) => ({
          regulation: l.regulation,
          name: l.name,
          sourceAsOf: l.sourceAsOf,
          threats: l.threats.map((t) => ({ species: t.species, role: t.role, tier: t.tier, usage: t.usage })),
        })),
      });
    }),
  );

  server.registerTool(
    'get_set',
    {
      title: 'Get standard competitive set',
      description:
        'Return one species\u2019 most-played competitive set: item, ability (with the Mega form and ability for Mega sets), nature, EVs, the four most-played moves, role, tier, usage share, and the usage figures behind it. Reach for it when asked what a species usually runs; `list_threats` browses a whole regulation and `check_legality` validates teams. Species match is case-insensitive and ignores punctuation, and resolves forms, so "Indeedee-F" and "Salamence-Mega" find the same sets as "Indeedee" and "Salamence"; pass `regulation` (e.g. "m-c") to scope to one list; unknown species return an isError listing every known threat. Usage-derived from Limitless VGC tournament teams, not editorial opinion; read-only, offline, no network or auth.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        species: z
          .string()
          .describe('Base species or form name, e.g. "Garchomp", "Indeedee-F" (case- and punctuation-insensitive).'),
        regulation: z
          .string()
          .optional()
          .describe('Optional regulation set id, e.g. "m-c"; omit to search every list.'),
      },
      outputSchema: {
        regulation: z
          .string()
          .describe('Display name of the list the set came from, e.g. "Regulation Set M-C".'),
        sourceAsOf: z.string().describe('ISO date of the newest data point behind that list.'),
        ...threatOutput,
      },
    },
    wrap(async (args: { species: string; regulation?: string }) => {
      const hit = findThreat(args.species, args.regulation);
      if (!hit) {
        const known = Object.values(THREAT_LISTS).flatMap((l) => l.threats.flatMap((t) => [t.species, t.form, t.megaForm].filter((n) => n !== undefined)));
        throw new Error(`No set for "${args.species}". Known threats: ${known.join(', ')}.`);
      }
      return ok({
        regulation: hit.list.name,
        sourceAsOf: hit.list.sourceAsOf,
        ...hit.threat,
      });
    }),
  );
}
