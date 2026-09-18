/**
 * Meta tools: usage-derived threat list + standard sets for a regulation.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { THREAT_LISTS, getThreatList, findThreat, type Threat } from '../threats.js';
import { STATS, evsToChampionsPoints } from '../dex.js';
import { ok, wrap, READ_ONLY_ANNOTATIONS } from '../result.js';

/** Showdown's stat labels, used when writing a paste. */
const STAT_LABEL: Record<string, string> = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };

/**
 * One set as a Showdown-format paste — the shape poképaste hosts and team
 * builders import.
 *
 * EVs are written in Champions stat points rather than the 0-252 scale the
 * calculate_* tools take: that is what the game's training screen shows and what
 * the community's Champions paste sites publish (a real team page reads "HP 30 /
 * Atk 32 / Def 31 …", summing to the 66-point budget). A Mega set names the base
 * species holding its stone, which is the set you actually own.
 */
function setPaste(t: Threat): string {
  const points = t.championsPoints ?? evsToChampionsPoints(t.evs ?? {});
  const evLine = STATS.filter((s) => points[s]).map((s) => `${points[s]} ${STAT_LABEL[s]}`).join(' / ');
  return [
    `${t.megaForm ? t.species : (t.form ?? t.species)} @ ${t.item}`,
    `Ability: ${t.ability}`,
    'Level: 50',
    `${t.nature} Nature`,
    ...(evLine ? [`EVs: ${evLine}`] : []),
    ...t.moves.map((m) => `- ${m}`),
  ].join('\n');
}

/** The paste string, shared by `get_set`'s single and batched shapes. */
const pasteOutput = z
  .string()
  .describe(
    'The whole set as a Showdown-format paste, ready to copy into a team builder or paste host: `species @ item`, ability, level 50, nature, EVs in Pok\u00e9mon Champions stat points (0-32 each, 66 total \u2014 what the game\u2019s training screen takes), then the four moves. A Mega set names the base species holding its stone.',
  );

/**
 * One full usage-derived standard set, used by `get_set`'s `sets[]`.
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
  championsPoints: z
    .record(z.string(), z.number())
    .optional()
    .describe(
      'The same spread in Pok\u00e9mon Champions stat points (whole numbers, at most 32 in a stat, 66 total), which is what the game\u2019s training screen takes and the form the source publishes; `evs` is this converted to the 0-252 scale the calculate_* tools take. Absent when the source published no spread.',
    ),
  moves: z.array(z.string()).describe('The four most-played moves, most played first.'),
  notes: z
    .string()
    .optional()
    .describe('The usage figures this set was derived from; absent when the list carries none.'),
};

/** The flat single-set payload's fields; every one is optional at the top level too,
 *  because this tool answers with `sets[]` instead when several species are asked for. */
const flatSetOutput = z.object({ ...threatOutput, paste: pasteOutput }).partial().shape;

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
        'List the most-used Pok\u00e9mon of one Pok\u00e9mon Champions regulation, ranked by measured usage: each threat\u2019s species, role, tier (S/A/B by usage rank) and usage share, plus the sample and sources the list was derived from; omit `regulation` to get every available list. This is the ranking only \u2014 for a threat\u2019s standard set call `get_set`, which takes several species at once, and use `list_regulations` to discover regulation ids. Regulation ids match case- and punctuation-insensitively ("M-C", "mc"); an unknown one returns an isError naming the available lists. Usage-derived from Limitless VGC tournament teams, not editorial opinion. Read-only and offline; no network, auth, or rate limits.',
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
          .array(z.object(threatSummaryOutput))
          .optional()
          .describe(
            'Every threat in this regulation, most used first \u2014 species, role, tier and usage only; present only when `regulation` was supplied. Fetch the sets you need with `get_set`, which takes several species in one call.',
          ),
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
          threats: list.threats.map((t) => ({ species: t.species, role: t.role, tier: t.tier, usage: t.usage })),
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
        'Return one species\u2019 most-played competitive set: item, ability (with the Mega form and ability for Mega sets), nature, EVs, the four most-played moves, role, tier, usage share, the usage figures behind it, and the set as a Showdown-format `paste` ready to copy into a team builder or paste host, with EVs in Champions stat points. Sets exist for the ranked species of each regulation only \u2014 `list_threats` lists exactly which, and `list_regulations` gives each set\u2019s `threatCount` \u2014 so check there before asking for a species outside the meta; a miss returns an isError naming that coverage. Pass an array of species to fetch several sets in one call, which answers as `sets` \u2014 use that rather than calling once per species. Reach for it when asked what a species usually runs; `check_legality` validates teams. Species match is case-insensitive and ignores punctuation, and resolves forms, so "Indeedee-F" and "Salamence-Mega" find the same sets as "Indeedee" and "Salamence"; pass `regulation` (e.g. "m-c") to scope to one list. Usage-derived from Limitless VGC tournament teams, not editorial opinion; read-only, offline, no network or auth.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        species: z
          .union([z.string(), z.array(z.string()).min(1).max(24)])
          .describe(
            'Base species or form name, e.g. "Garchomp", "Indeedee-F" (case- and punctuation-insensitive). Pass an array to fetch several sets in one call, which returns `sets` instead of the flat set.',
          ),
        regulation: z
          .string()
          .optional()
          .describe('Optional regulation set id, e.g. "m-c"; omit to search every list.'),
      },
      outputSchema: {
        ...flatSetOutput,
        regulation: z
          .string()
          .optional()
          .describe('Display name of the list the set came from, e.g. "Regulation Set M-C"; present only when a single species was requested.'),
        sourceAsOf: z
          .string()
          .optional()
          .describe('ISO date of the newest data point behind that list; present only when a single species was requested.'),
        sets: z
          .array(
            z.object({
              regulation: z.string().describe('Display name of the list the set came from.'),
              sourceAsOf: z.string().describe('ISO date of the newest data point behind that list.'),
              ...threatOutput,
              paste: pasteOutput,
            }),
          )
          .optional()
          .describe('One entry per requested species, in the order supplied; present only when `species` was an array.'),
      },
    },
    wrap(async (args: { species: string | string[]; regulation?: string }) => {
      const known = Object.values(THREAT_LISTS);
      const scoped = args.regulation ? getThreatList(args.regulation) : undefined;
      if (args.regulation && !scoped) {
        // A different failure from a missing species: usage needs a closed sample
        // window, so a regulation with no list has no sets at all to return.
        throw new Error(
          `No threat list for "${args.regulation}", so there are no sets to return. Available: ${known.map((l) => `${l.name} (${l.regulation})`).join(', ')}.`,
        );
      }

      // Sets exist only for the ranked species, so a miss is a question the caller
      // could have answered before asking. Name the coverage and the call that
      // lists it, rather than only naming the tool that would have said so.
      const coverage = scoped
        ? `${scoped.name}'s ${scoped.threats.length} ranked species`
        : `the ${known.reduce((n, l) => n + l.threats.length, 0)} ranked species across ${known.length} regulation${known.length === 1 ? '' : 's'}`;

      const lookup = (name: string) => {
        const hit = findThreat(name, args.regulation);
        if (!hit) {
          throw new Error(
            `No curated set for "${name}"; sets exist for ${coverage} only, and \`list_threats\` lists them.`,
          );
        }
        return {
          regulation: hit.list.name,
          sourceAsOf: hit.list.sourceAsOf,
          ...hit.threat,
          paste: setPaste(hit.threat),
        };
      };

      if (Array.isArray(args.species)) return ok({ sets: args.species.map(lookup) });
      return ok(lookup(args.species));
    }),
  );
}
