/**
 * Official Pokémon Champions / VGC regulation tools: list sets, get one set's
 * rules + legal roster, and check a team's legality against a set.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getDex, learnableMoveIds, toID } from '../dex.js';
import {
  REGULATION_SETS,
  getRegulationSet,
  setStatus,
  type RegulationSet,
} from '../regulations.js';
import { READ_ONLY_ANNOTATIONS, ok, wrap } from '../result.js';

function summarize(set: RegulationSet) {
  return {
    id: set.id,
    name: set.name,
    game: set.game,
    status: setStatus(set),
    start: set.start,
    end: set.end,
    eligibleCount: set.eligibleSpecies.length,
    megaCount: set.megaEvolution.species.length,
    notes: set.notes,
  };
}

/**
 * Fields `summarize()` always returns; shared by `list_regulations`' `sets[]`
 * and (spread) `get_regulation`'s flat detail.
 */
const regulationSummaryOutput = {
  id: z.string().describe('Regulation id, e.g. "m-a", "m-b", "m-c".'),
  name: z.string().describe('Display name, e.g. "Regulation Set M-C".'),
  game: z.string().describe('Game the set belongs to ("Pokémon Champions").'),
  status: z
    .enum(['past', 'current', 'upcoming'])
    .describe('Status relative to today: "past", "current", or "upcoming".'),
  start: z.string().describe('First day the set is in force, ISO 8601 (inclusive).'),
  end: z.string().describe('Last day the set is in force, ISO 8601 (inclusive).'),
  eligibleCount: z.number().describe('How many base species are on the legal roster.'),
  megaCount: z.number().describe('How many base species on the roster may Mega Evolve.'),
  notes: z.string().describe('Curator summary of the format and what it changed over the previous set.'),
};

function detail(set: RegulationSet) {
  return {
    ...summarize(set),
    battleType: set.battleRules.battleType,
    level: set.battleRules.level,
    bringPick: set.battleRules.bringPick,
    timers: set.battleRules.timers,
    rounds: set.battleRules.rounds,
    clauses: {
      speciesClause: set.teamRules.speciesClause,
      itemClause: set.teamRules.itemClause,
      autoLevel50: set.teamRules.autoLevel50,
      anyMoveAbility: set.teamRules.anyMoveAbility,
    },
    megaEvolution: {
      allowed: set.megaEvolution.allowed,
      perBattle: set.megaEvolution.perBattle,
      species: set.megaEvolution.species,
    },
    eligibleSpecies: set.eligibleSpecies,
    source: set.source,
    sourceAsOf: set.sourceAsOf,
  };
}

export function registerRegulationTools(server: McpServer) {
  server.registerTool(
    'list_regulations',
    {
      title: 'List regulation sets',
      description:
        'List every Pokémon Champions / VGC Regulation Set with its id, dates, status, and roster size. Takes no arguments; status is relative to today and the active set is also returned as `currentSet` (null when none is). Use `get_regulation` for one set\'s full rules and roster, `check_legality` to validate a team. Read-only and offline over the bundled regulation data — no network, auth, or rate limits; returns `game`, `currentSet`, and one summary per set (id, name, status, start, end, eligibleCount, megaCount, notes).',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {},
      outputSchema: {
        game: z.string().describe('Game every listed set belongs to ("Pokémon Champions").'),
        currentSet: z
          .string()
          .nullable()
          .describe('Id of the one set whose status is "current" today, or null when no set is active.'),
        sets: z
          .array(z.object(regulationSummaryOutput))
          .describe('One summary per bundled Regulation Set, in chronological order (M-A through M-C).'),
        note: z
          .string()
          .describe('Standing note on how Regulation Sets work: the roster is seasonal and eligibility is by base species, so every form of a listed species is legal.'),
      },
    },
    wrap(async () => {
      return ok({
        game: 'Pokémon Champions',
        currentSet: REGULATION_SETS.find((s) => setStatus(s) === 'current')?.id ?? null,
        sets: REGULATION_SETS.map(summarize),
        note: 'Regulation Sets define the seasonal legal roster and change every ~2-3 months. Eligible rosters are base-species lists (all forms of an eligible species are legal).',
      });
    }),
  );

  server.registerTool(
    'get_regulation',
    {
      title: 'Get regulation set',
      description:
        'Get one Pok\u00e9mon Champions / VGC Regulation Set in full: battle rules (level 50 doubles, timers, bring 4 of 6), team clauses (Species, Item, auto-level 50), Mega Evolution rules, and the size of the legal roster. The two name rosters \u2014 every legal base species, and every species allowed to Mega Evolve \u2014 are about two thirds of the response and come back only with `includeRoster`; the `eligibleCount`/`megaCount` sizes are always there. Accepts the id or name case- and punctuation-insensitively ("M-A", "m-a", "mc", "Regulation Set M-C"); an unknown id is an isError listing the valid names. Use `list_regulations` to discover ids and `check_legality` to test a team. Read-only and offline; returns dates, status, counts, clauses, and source.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        regulation: z
          .string()
          .describe(
            'Regulation Set id or name, matched case- and punctuation-insensitively: "M-A", "m-a", "mc", and "Regulation Set M-C" all resolve to the same set.',
          ),
        includeRoster: z
          .boolean()
          .optional()
          .describe(
            'Include the two name rosters \u2014 every legal base species and every species allowed to Mega Evolve \u2014 which together are about two thirds of the response. Omitted, the rules and the `eligibleCount`/`megaCount` sizes come back without them; pass true when you actually need the names.',
          ),
      },
      outputSchema: {
        ...regulationSummaryOutput,
        battleType: z.string().describe('Battle format this set is played in ("Double Battles").'),
        level: z.number().describe('Level every Pokémon is set to (50).'),
        bringPick: z
          .string()
          .describe('Team preview rule ("4 of 6"): register six Pokémon, pick four for each match.'),
        timers: z
          .object({
            gameMinutes: z.number().describe('Total game clock, in minutes.'),
            playerMinutes: z.number().describe('Each player\u2019s clock, in minutes.'),
            moveSeconds: z.number().describe('Seconds allowed per move.'),
            previewSeconds: z.number().describe('Seconds allowed for team preview.'),
          })
          .describe('Match clock limits.'),
        rounds: z
          .string()
          .describe('Tournament round structure, e.g. "BO1/BO3 Swiss, BO3 top cut".'),
        clauses: z
          .object({
            speciesClause: z
              .boolean()
              .describe('True when no two team members may share a National Pokédex number.'),
            itemClause: z.boolean().describe('True when no two team members may hold the same item.'),
            autoLevel50: z
              .boolean()
              .describe('True when Pokémon above or below level 50 are auto-levelled to 50.'),
            anyMoveAbility: z
              .boolean()
              .describe('True when any move or Ability obtainable through normal gameplay is allowed, including Hidden Abilities.'),
          })
          .describe('Team-construction clauses in force for this set.'),
        megaEvolution: z
          .object({
            allowed: z.boolean().describe('Whether Mega Evolution is legal in this set.'),
            perBattle: z.number().describe('How many times a player may Mega Evolve per battle (1).'),
            species: z
              .array(z.string())
              .optional()
              .describe('Base species allowed to Mega Evolve; every form of each is covered. Present only when `includeRoster` was set \u2014 `megaCount` gives the size either way.'),
          })
          .describe('Mega Evolution rules.'),
        eligibleSpecies: z
          .array(z.string())
          .optional()
          .describe('The full legal base-species roster; every form of a listed species is legal. Present only when `includeRoster` was set \u2014 `eligibleCount` gives the size either way.'),
        source: z.string().describe('URL of the source the rosters were taken from.'),
        sourceAsOf: z.string().describe('ISO date the rosters were last refreshed.'),
      },
    },
    wrap(async (args: { regulation: string; includeRoster?: boolean }) => {
      const set = getRegulationSet(args.regulation);
      if (!set) {
        throw new Error(
          `Unknown regulation set "${args.regulation}". Available: ${REGULATION_SETS.map((s) => s.name).join(', ')}.`,
        );
      }
      const { eligibleSpecies, megaEvolution, ...rest } = detail(set);
      if (args.includeRoster) return ok({ ...rest, eligibleSpecies, megaEvolution });
      // The two rosters are roughly two thirds of this payload. The counts in `rest`
      // already say how big they are, so a caller who wants the names asks again.
      return ok({ ...rest, megaEvolution: { allowed: megaEvolution.allowed, perBattle: megaEvolution.perBattle } });
    }),
  );

  server.registerTool(
    'check_legality',
    {
      title: 'Check team legality',
      description:
        'Validate up to 6 team members against a Pokémon Champions / VGC Regulation Set, reporting illegal or unknown species, duplicate National Pokédex numbers (Species Clause), duplicate items (Item Clause), unlearnable moves, team size (must be exactly 6), and who may Mega Evolve (one per battle). Species resolve case-insensitively to base species (any form of a legal base qualifies). A move is legal when any species in the evolution line knows it — the form, its base species, or a pre-evolution — because egg and level-up moves carry up on evolution: Rillaboom may hold Fake Out, which is Grookey\u2019s egg move. `get_learnset` lists one species\u2019 own learnset rather than this union, `get_regulation` gives the roster, and for stat values rather than legality use `calculate_stats`. Unknown ids return an isError listing them. Read-only and offline; returns `valid`, `violations`, and per-member checks.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        regulation: z
          .string()
          .describe(
            'Regulation Set id or name, matched case- and punctuation-insensitively: "M-A", "m-a", "mc", and "Regulation Set M-C" all resolve to the same set.',
          ),
        team: z
          .array(
            z.object({
              species: z
                .string()
                .describe(
                  'Species name in any form; resolved case-insensitively and matched to the set roster by base species, so alternate forms of an eligible species pass.',
                ),
              item: z
                .string()
                .optional()
                .describe(
                  'Held item; a duplicate across the team is an Item Clause violation and an unknown item is reported as a violation.',
                ),
              moves: z
                .array(z.string())
                .optional()
                .describe(
                  'Moves to verify against the form and base-species learnsets; each is reported with legal true/false and, when illegal, a reason.',
                ),
            }),
          )
          .min(1)
          .max(6)
          .describe(
            'Team members, 1-6 of them; a VGC Battle Team must be exactly 6, so any other length adds a team-size violation.',
          ),
      },
      outputSchema: {
        regulation: z
          .string()
          .describe('Display name of the set the team was checked against, e.g. "Regulation Set M-C".'),
        status: z
          .enum(['past', 'current', 'upcoming'])
          .describe('That set\u2019s status relative to today.'),
        teamSize: z.number().describe('How many members were supplied (1-6).'),
        valid: z
          .boolean()
          .describe('True only when `violations` is empty; false when any member is illegal or unknown, a clause is broken, or the team is not exactly 6.'),
        violations: z
          .array(z.string())
          .describe('Every violation found, as human-readable text (illegal/unknown species, Species Clause, unknown item, Item Clause, illegal/unknown moves, team size); empty when the team is legal.'),
        members: z
          .array(
            z.object({
              species: z
                .string()
                .describe('Resolved species name, or the name as supplied when the species is unknown.'),
              baseSpecies: z
                .string()
                .optional()
                .describe('The base species the roster and Species Clause checks used (eligibility is by National Pokédex number); absent when the species is unknown.'),
              item: z
                .string()
                .optional()
                .describe('Held item exactly as supplied; absent when the member had none.'),
              itemValid: z
                .boolean()
                .optional()
                .describe('Whether the supplied item is a known item; absent when the member had no item.'),
              legal: z
                .boolean()
                .describe('True when the species exists and its base species is on this set\u2019s roster.'),
              megaCapable: z
                .boolean()
                .describe('True when this member\u2019s base species may Mega Evolve in this set (false for unknown species).'),
              moves: z
                .array(
                  z.object({
                    move: z
                      .string()
                      .describe('Resolved move name, or the name as supplied when the move is unknown.'),
                    legal: z
                      .boolean()
                      .describe('True when the move is in either the form\u2019s or the base species\u2019 learnset.'),
                    note: z
                      .string()
                      .optional()
                      .describe('Why the move failed ("unknown move" or "not in learnset"); absent for legal moves.'),
                  }),
                )
                .optional()
                .describe('One entry per supplied move, in order; present only when the member listed moves and its species was known.'),
            }),
          )
          .describe('One entry per supplied team member, in the order supplied.'),
        mega: z
          .object({
            capable: z
              .array(z.string())
              .describe('Species on this team that may Mega Evolve; empty when none can.'),
            note: z.string().describe('Reminder that a player may Mega Evolve only once per battle.'),
          })
          .describe('Mega Evolution summary for the checked team.'),
      },
    },
    wrap(async (args: { regulation: string; team: { species: string; item?: string; moves?: string[] }[] }) => {
      const set = getRegulationSet(args.regulation);
      if (!set) {
        throw new Error(
          `Unknown regulation set "${args.regulation}". Available: ${REGULATION_SETS.map((s) => s.name).join(', ')}.`,
        );
      }

      const dex = getDex(9);
      const eligible = new Set(set.eligibleSpecies.map(toID));
      const megaSet = new Set(set.megaEvolution.species.map(toID));

      const seenSpecies = new Map<string, string[]>(); // base id -> names
      const seenItems = new Map<string, string[]>(); // item id -> names
      const members: Record<string, unknown>[] = [];
      const violations: string[] = [];

      for (const entry of args.team) {
        const sp = dex.species.get(entry.species);
        const baseId = sp.exists ? toID(sp.baseSpecies || sp.name) : toID(entry.species);
        const baseName = sp.exists ? (sp.baseSpecies || sp.name) : entry.species;

        const legal = sp.exists && eligible.has(baseId);
        if (!sp.exists) {
          violations.push(`Unknown species "${entry.species}".`);
        } else if (!legal) {
          violations.push(`${sp.name} is not in the ${set.name} legal roster.`);
        }

        seenSpecies.set(baseId, [...(seenSpecies.get(baseId) ?? []), entry.species]);
        if (seenSpecies.get(baseId)!.length > 1) {
          violations.push(`Species Clause: ${[...new Set(seenSpecies.get(baseId)!)]} are the same National Pokédex species (${baseName}).`);
        }

        if (entry.item) {
          const it = dex.items.get(entry.item);
          const itemId = it.exists ? it.id : toID(entry.item);
          if (!it.exists) {
            violations.push(`Unknown item "${entry.item}".`);
          }
          seenItems.set(itemId, [...(seenItems.get(itemId) ?? []), entry.item]);
        }

        const moveChecks: { move: string; legal: boolean; note?: string }[] = [];
        if (sp.exists && entry.moves?.length) {
          // A move is legal when any species in the evolution line knows it: the
          // form itself (form-exclusive moves like Rotom-Wash's Hydro Pump), its
          // base species' shared pool, or a pre-evolution, whose egg and level-up
          // moves carry up.
          const learnable = await learnableMoveIds(dex, sp);
          for (const mv of entry.moves) {
            const m = dex.moves.get(mv);
            if (!m.exists) {
              violations.push(`Unknown move "${mv}" on ${sp.name}.`);
              moveChecks.push({ move: mv, legal: false, note: 'unknown move' });
            } else if (!learnable.has(m.id)) {
              violations.push(`Illegal move: ${sp.name} cannot learn ${m.name} in this format.`);
              moveChecks.push({ move: m.name, legal: false, note: 'not in learnset' });
            } else {
              moveChecks.push({ move: m.name, legal: true });
            }
          }
        }

        members.push({
          species: sp.exists ? sp.name : entry.species,
          baseSpecies: sp.exists ? baseName : undefined,
          item: entry.item,
          itemValid: entry.item ? !!dex.items.get(entry.item).exists : undefined,
          legal,
          megaCapable: sp.exists ? megaSet.has(baseId) : false,
          ...(moveChecks.length ? { moves: moveChecks } : {}),
        });
      }

      for (const [itemId, names] of seenItems) {
        if (names.length > 1) {
          violations.push(`Item Clause: duplicate held item "${names[0]}" (${names.length}x).`);
        }
      }

      if (args.team.length !== 6) {
        violations.push(`Team size is ${args.team.length}; a VGC Battle Team must be exactly 6 (bring 4 of 6 per match).`);
      }

      const megaCapable = members.filter((m) => m.megaCapable).map((m) => m.species);

      return ok({
        regulation: set.name,
        status: setStatus(set),
        teamSize: args.team.length,
        valid: violations.length === 0,
        violations,
        members,
        mega: {
          capable: megaCapable,
          note: 'A player may Mega Evolve only once per battle.',
        },
      });
    }),
  );
}
