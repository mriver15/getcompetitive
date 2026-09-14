/**
 * Official Pokémon Champions / VGC regulation tools: list sets, get one set's
 * rules + legal roster, and check a team's legality against a set.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getDex, toID } from '../dex.js';
import {
  REGULATION_SETS,
  getRegulationSet,
  setStatus,
  type RegulationSet,
} from '../regulations.js';
import { ok, wrap } from '../result.js';

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
      description:
        'List official Pokémon Champions / VGC Regulation Sets with dates, current status, and roster size. The current set is the one active today.',
      inputSchema: {},
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
      description:
        'Get the full detail for one Regulation Set: battle rules (double battles, timers, level), team rules (Species Clause, Item Clause, auto-level 50), the Mega Evolution rules + eligible Mega species, and the complete legal roster. Accepts "M-A", "Regulation Set M-C", "mc", etc.',
      inputSchema: { regulation: z.string() },
    },
    wrap(async (args: { regulation: string }) => {
      const set = getRegulationSet(args.regulation);
      if (!set) {
        throw new Error(
          `Unknown regulation set "${args.regulation}". Available: ${REGULATION_SETS.map((s) => s.name).join(', ')}.`,
        );
      }
      return ok(detail(set));
    }),
  );

  server.registerTool(
    'check_legality',
    {
      description:
        'Check a team against a Pokémon Champions Regulation Set. Takes a list of up to 6 {species, item} entries and reports: illegal species (not in the set roster), Species Clause violations (same National Dex number), Item Clause violations (duplicate items), team size, and which members may Mega Evolve (remember: only one Mega per battle).',
      inputSchema: {
        regulation: z.string(),
        team: z
          .array(
            z.object({
              species: z.string(),
              item: z.string().optional(),
            }),
          )
          .min(1)
          .max(6),
      },
    },
    wrap(async (args: { regulation: string; team: { species: string; item?: string }[] }) => {
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

        members.push({
          species: sp.exists ? sp.name : entry.species,
          baseSpecies: sp.exists ? baseName : undefined,
          item: entry.item,
          itemValid: entry.item ? !!dex.items.get(entry.item).exists : undefined,
          legal,
          megaCapable: sp.exists ? megaSet.has(baseId) : false,
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
