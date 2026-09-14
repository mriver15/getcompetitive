/**
 * Pokemon data tools: species, forms, moves, items, abilities, natures,
 * learnsets, types, and type effectiveness.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ModdedDex } from '@pkmn/dex';
import {
  getDex,
  normalizeGen,
  toID,
  speciesToObj,
  moveToObj,
  itemToObj,
  abilityToObj,
  natureToObj,
  typeToObj,
  learnsetToObj,
  typeEffectiveness,
  TYPES18,
} from '../dex.js';
import { ok, wrap, requireExists } from '../result.js';

const genSchema = z.number().int().min(1).max(9).default(9);

function fuzzyMatches(ids: string[], names: string[], query: string): string[] {
  const q = query.toLowerCase().trim();
  return names.filter((n, i) => n.toLowerCase().includes(q) || ids[i].includes(q));
}

function requireSpecies(dex: ModdedDex, name: string) {
  const s = dex.species.get(name);
  const suggestions = s.exists
    ? []
    : fuzzyMatches(
        dex.species.all().map((x) => x.id),
        dex.species.all().map((x) => x.name),
        name,
      );
  return requireExists(s, 'Pokemon species', name, suggestions);
}

export function registerDataTools(server: McpServer) {
  server.registerTool(
    'get_pokemon',
    {
      description:
        'Get full competitive data for a Pokemon: types, base stats, BST, abilities (0/1/H/S slots), tiers (singles/doubles/natdex), alternate forms, weight, gender ratio, egg groups, and evolution info. Accepts any Showdown name (e.g. "garchomp", "Ogerpon-Wellspring", "Gholdengo").',
      inputSchema: { species: z.string(), generation: genSchema },
    },
    wrap(async (args: { species: string; generation: number }) => {
      const gen = normalizeGen(args.generation);
      const s = requireSpecies(getDex(gen), args.species);
      return ok(speciesToObj(s));
    }),
  );

  server.registerTool(
    'list_forms',
    {
      description:
        'List all forms of a Pokemon (base + alternate + cosmetic + battle-only), with types, base stats, and tier for each.',
      inputSchema: { species: z.string(), generation: genSchema },
    },
    wrap(async (args: { species: string; generation: number }) => {
      const gen = normalizeGen(args.generation);
      const dex = getDex(gen);
      const base = requireSpecies(dex, args.species);
      const names = new Set<string>([base.name]);
      for (const f of [...(base.otherFormes ?? []), ...(base.cosmeticFormes ?? []), ...(base.formeOrder ?? [])]) {
        if (f) names.add(f);
      }
      const forms = [...names].map((n) => {
        const f = dex.species.get(n);
        if (!f.exists) return { name: n, note: 'unavailable in this generation' };
        const o = speciesToObj(f);
        return {
          name: o.name,
          types: o.types,
          baseStats: o.baseStats,
          bst: o.bst,
          abilities: o.abilities,
          tier: o.tier,
          doublesTier: o.doublesTier,
          isCosmetic: o.isCosmeticForme,
          battleOnly: o.battleOnly,
          isMega: o.isMega,
          isPrimal: o.isPrimal,
        };
      });
      return ok({
        baseSpecies: base.baseSpecies || base.name,
        count: forms.length,
        forms,
      });
    }),
  );

  server.registerTool(
    'search',
    {
      description:
        'Fuzzy search the Pokemon dataset by name substring. Returns matching species with their number and tier. Use to find a Pokemon when unsure of exact spelling.',
      inputSchema: {
        query: z.string(),
        kind: z.enum(['species', 'move', 'item', 'ability', 'nature']).default('species'),
        limit: z.number().int().min(1).max(100).default(20),
        generation: genSchema,
      },
    },
    wrap(
      async (args: { query: string; kind: 'species' | 'move' | 'item' | 'ability' | 'nature'; limit: number; generation: number }) => {
        const gen = normalizeGen(args.generation);
        const dex = getDex(gen);
        const q = args.query.toLowerCase().trim();
        if (!q) throw new Error('query must be non-empty.');

        const results: { name: string; num: number; tier?: string }[] = [];
        const push = (all: { id: string; name: string; num: number; tier?: string }[]) => {
          for (const e of all) {
            if (e.name.toLowerCase().includes(q) || e.id.includes(q)) {
              results.push({ name: e.name, num: e.num, tier: e.tier });
            }
          }
        };

        if (args.kind === 'species') {
          push(dex.species.all().map((s) => ({ id: s.id, name: s.name, num: s.num, tier: s.tier })));
        } else if (args.kind === 'move') {
          push(dex.moves.all().map((m) => ({ id: m.id, name: m.name, num: m.num })));
        } else if (args.kind === 'item') {
          push(dex.items.all().map((i) => ({ id: i.id, name: i.name, num: i.num })));
        } else if (args.kind === 'ability') {
          push(dex.abilities.all().map((a) => ({ id: a.id, name: a.name, num: a.num })));
        } else {
          push(dex.natures.all().map((n) => ({ id: n.id, name: n.name, num: n.num })));
        }

        results.sort((a, b) => a.num - b.num);
        return ok({ kind: args.kind, query: args.query, count: results.length, results: results.slice(0, args.limit) });
      },
    ),
  );

  server.registerTool(
    'get_move',
    {
      description:
        'Get full data for a move: type, category, base power, accuracy, PP, priority, target, flags, secondary effects, Z/Max variants, and description.',
      inputSchema: { move: z.string(), generation: genSchema },
    },
    wrap(async (args: { move: string; generation: number }) => {
      const gen = normalizeGen(args.generation);
      const dex = getDex(gen);
      const m = dex.moves.get(args.move);
      const suggestions = m.exists ? [] : fuzzyMatches(dex.moves.all().map((x) => x.id), dex.moves.all().map((x) => x.name), args.move);
      return ok(moveToObj(requireExists(m, 'move', args.move, suggestions)));
    }),
  );

  server.registerTool(
    'get_item',
    {
      description:
        'Get full data for an item: effect description, category flags (Berry/Choice/etc.), mega stone, Z-move, Natural Gift, Fling, and stat boosts.',
      inputSchema: { item: z.string(), generation: genSchema },
    },
    wrap(async (args: { item: string; generation: number }) => {
      const gen = normalizeGen(args.generation);
      const dex = getDex(gen);
      const i = dex.items.get(args.item);
      const suggestions = i.exists ? [] : fuzzyMatches(dex.items.all().map((x) => x.id), dex.items.all().map((x) => x.name), args.item);
      return ok(itemToObj(requireExists(i, 'item', args.item, suggestions)));
    }),
  );

  server.registerTool(
    'get_ability',
    {
      description:
        'Get full data for an ability: effect description, flags, and generation availability.',
      inputSchema: { ability: z.string(), generation: genSchema },
    },
    wrap(async (args: { ability: string; generation: number }) => {
      const gen = normalizeGen(args.generation);
      const dex = getDex(gen);
      const a = dex.abilities.get(args.ability);
      const suggestions = a.exists ? [] : fuzzyMatches(dex.abilities.all().map((x) => x.id), dex.abilities.all().map((x) => x.name), args.ability);
      return ok(abilityToObj(requireExists(a, 'ability', args.ability, suggestions)));
    }),
  );

  server.registerTool(
    'get_nature',
    {
      description: 'Get a nature: which stat it boosts (plus) and lowers (minus).',
      inputSchema: { nature: z.string(), generation: genSchema },
    },
    wrap(async (args: { nature: string; generation: number }) => {
      const gen = normalizeGen(args.generation);
      const dex = getDex(gen);
      const n = dex.natures.get(args.nature);
      return ok(natureToObj(requireExists(n, 'nature', args.nature)));
    }),
  );

  server.registerTool(
    'get_learnset',
    {
      description:
        'Get every move a Pokemon can learn, grouped by method (Level-up, TM, Egg, Tutor, Event, etc.), for the given generation.',
      inputSchema: { species: z.string(), generation: genSchema },
    },
    wrap(async (args: { species: string; generation: number }) => {
      const gen = normalizeGen(args.generation);
      const dex = getDex(gen);
      const s = requireSpecies(dex, args.species);
      const ls = await dex.learnsets.getByID(toID(s.name));
      if (!ls.exists) throw new Error(`No learnset data for "${args.species}".`);
      return ok({ species: s.name, ...learnsetToObj(ls) });
    }),
  );

  server.registerTool(
    'get_type',
    {
      description:
        'Get a type chart entry: what this type is weak to, resists, and is immune to, plus Hidden Power IVs.',
      inputSchema: { type: z.string(), generation: genSchema },
    },
    wrap(async (args: { type: string; generation: number }) => {
      const gen = normalizeGen(args.generation);
      const dex = getDex(gen);
      const t = dex.types.get(args.type);
      return ok(typeToObj(requireExists(t, 'type', args.type)));
    }),
  );

  server.registerTool(
    'type_chart',
    {
      description:
        'Type effectiveness. attacker is an attacking type; defender may be a type OR a Pokemon species (its types are used). With both: the matchup multiplier. With only attacker: offensive coverage vs all 18 types. With only defender: full defensive weaknesses/resistances for that type or species. With neither: the complete 18x18 chart.',
      inputSchema: {
        attacker: z.string().optional(),
        defender: z.string().optional(),
        generation: genSchema,
      },
    },
    wrap(async (args: { attacker?: string; defender?: string; generation: number }) => {
      const gen = normalizeGen(args.generation);
      const dex = getDex(gen);

      const resolveDefender = (name: string): { label: string; types: string[] } => {
        const t = dex.types.get(name);
        if (t.exists) return { label: t.name, types: [t.name] };
        const s = dex.species.get(name);
        if (s.exists) return { label: s.name, types: [...s.types] };
        throw new Error(`Unknown type or species "${name}".`);
      };

      if (args.attacker && args.defender) {
        const def = resolveDefender(args.defender);
        const mult = typeEffectiveness(args.attacker, def.types, gen);
        return ok({
          attacker: args.attacker,
          defender: def.label,
          defenderTypes: def.types,
          effectiveness: mult,
          label: effectivenessLabel(mult),
        });
      }

      if (args.attacker) {
        const coverage: Record<string, { effectiveness: number; label: string }> = {};
        for (const t of TYPES18) {
          const m = typeEffectiveness(args.attacker, [t], gen);
          coverage[t] = { effectiveness: m, label: effectivenessLabel(m) };
        }
        return ok({ attacker: args.attacker, coverage });
      }

      if (args.defender) {
        const def = resolveDefender(args.defender);
        const taken: Record<string, { effectiveness: number; label: string }> = {};
        for (const t of TYPES18) {
          const m = typeEffectiveness(t, def.types, gen);
          taken[t] = { effectiveness: m, label: effectivenessLabel(m) };
        }
        return ok({ defender: def.label, defenderTypes: def.types, damageTaken: taken });
      }

      const chart: Record<string, Record<string, number>> = {};
      for (const atk of TYPES18) {
        chart[atk] = {};
        for (const def of TYPES18) {
          chart[atk][def] = typeEffectiveness(atk, [def], gen);
        }
      }
      return ok({ chart, note: 'Rows are attacking types, columns are defending types. Multipliers: 0 immune, 0.25, 0.5, 1, 2, 4.' });
    }),
  );
}

function effectivenessLabel(m: number): string {
  if (m === 0) return 'immune';
  if (m > 1) return `${m}x super effective`;
  if (m < 1) return `${m}x not very effective`;
  return 'neutral';
}
