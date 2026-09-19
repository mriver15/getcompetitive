/**
 * Pokemon data tools: species, forms, moves, items, abilities, natures,
 * learnsets, types, and type effectiveness.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ModdedDex } from '@pkmn/dex';
import {
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
import { getChampionsDex } from '../champions.js';
import { ok, wrap, requireExists, READ_ONLY_ANNOTATIONS } from '../result.js';

/**
 * Output-schema fragments. Every lookup below returns a projection built in
 * `src/dex.ts` (`speciesToObj`, `moveToObj`, …), so the shapes those helpers
 * produce are declared once here and reused, descriptions included.
 */

/** The six stats of a species, keyed by Showdown stat id. */
const statsTable = z
  .object({
    hp: z.number().describe('Hit Points.'),
    atk: z.number().describe('Attack.'),
    def: z.number().describe('Defense.'),
    spa: z.number().describe('Special Attack.'),
    spd: z.number().describe('Special Defense.'),
    spe: z.number().describe('Speed.'),
  })
  .describe('All six stats keyed by stat id ("hp", "atk", "def", "spa", "spd", "spe").');

/** Stat stages, as produced by moves, Z-moves, and held items. */
const boostsTable = z
  .record(z.string(), z.number())
  .describe(
    'Stat changes keyed by stat id, e.g. {"atk": -1} for one stage of Attack drop. Keys are "atk", "def", "spa", "spd", "spe", and (for secondary effects) "accuracy" or "evasion"; positive values raise the stat, negative values lower it.',
  );

/**
 * Showdown stores flags as a sparse map of `{flag: 1}` — a flag that does not
 * apply is simply absent, never 0.
 */
const moveFlags = z
  .record(z.string(), z.number())
  .describe(
    'Flags the move carries, as {"<flag>": 1}; any flag not listed does not apply. Possible keys: "allyanim", "bite", "bullet", "bypasssub", "cantusetwice", "charge", "contact", "dance", "defrost", "distance", "failcopycat", "failencore", "failinstruct", "failmefirst", "failmimic", "futuremove", "gravity", "heal", "metronome", "minimize", "mirror", "mustpressure", "noassist", "nonsky", "noparentalbond", "nosketch", "nosleeptalk", "pledgecombo", "powder", "protect", "pulse", "punch", "recharge", "reflectable", "slicing", "snatch", "sound", "wind".',
  );

const abilityFlags = z
  .record(z.string(), z.number())
  .describe(
    'Flags the ability carries, as {"<flag>": 1}; any flag not listed does not apply. Possible keys: "breakable", "cantsuppress", "failroleplay", "failskillswap", "noentrain", "noreceiver", "notrace", "notransform".',
  );

/** The ability slots of a species. */
const abilitySlots = z
  .object({
    '0': z.string().describe('Primary ability.'),
    '1': z
      .string()
      .optional()
      .describe('Secondary ability; absent from species with only one normal ability.'),
    H: z.string().optional().describe('Hidden ability; absent from species that have none.'),
    S: z
      .string()
      .optional()
      .describe('Special slot, used by abilities that come with a forme (Battle Bond, Power Construct); absent for species that have none.'),
  })
  .describe('Abilities keyed by Showdown slot: "0" primary, "1" secondary, "H" hidden, "S" special.');

/** One effect a move's secondary hit can apply. */
const secondaryEffect = z
  .object({
    chance: z.number().optional().describe('Percent chance the effect triggers; absent when it is guaranteed.'),
    boosts: boostsTable
      .optional()
      .describe('Stat changes applied to the target, e.g. {"spd": -1} for a Special Defense drop.'),
    self: z
      .object({
        boosts: boostsTable.optional().describe('Stat changes applied to the user of the move.'),
      })
      .optional()
      .describe('Effect applied to the user instead of the target, e.g. a self-boost or self-drop.'),
    status: z.string().optional().describe('Major status inflicted, e.g. "brn", "par", "frz".'),
    volatileStatus: z.string().optional().describe('Volatile status inflicted, e.g. "flinch", "confusion".'),
  })
  .describe('One secondary effect of the move; only the fields that apply to that effect are present.');

/** One attacking type's multiplier in a coverage or damage-taken map. */
const effectivenessEntry = z
  .object({
    effectiveness: z
      .number()
      .describe('Damage multiplier: 0 (immune), 0.25, 0.5 (resisted), 1 (neutral), 2 or 4 (weak).'),
    label: z
      .string()
      .describe('The multiplier in words: "immune", "0.5x not very effective", "neutral", "2x super effective".'),
  })
  .describe('How one attacking type lands against the defender.');

const TYPE_NAMES =
  '"Bug", "Dark", "Dragon", "Electric", "Fairy", "Fighting", "Fire", "Flying", "Ghost", "Grass", "Ground", "Ice", "Normal", "Poison", "Psychic", "Rock", "Steel", "Water"';

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
      title: 'Get Pokémon data',
      description:
        'Look up one Pokémon and return its competitive profile: types, base stats and BST, abilities by slot, weight, gender ratio, egg groups, and evolutions. Accepts any Showdown name or form, case- and punctuation-insensitive ("garchomp", "Ogerpon-Wellspring", "rotom wash"); unknown names return an isError listing near matches. Use `search_dex` when you only have a partial name, `list_forms` for alternate or cosmetic forms, and `calculate_stats` when you need stats computed from EVs, IVs, and nature. Read-only and offline over the bundled Showdown dataset — no network, auth, or rate limits.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        species: z
          .string()
          .describe('Species or form name, e.g. "Garchomp", "Ogerpon-Wellspring", "Rotom-Wash".'),
      },
      outputSchema: {
        name: z.string().describe('Display name of the entry, e.g. "Garchomp" or "Ogerpon-Wellspring".'),
        num: z.number().describe('National Dex number; 0 for entries that have none.'),
        gen: z.number().describe('Generation this entry was introduced in; 0 for entries outside the numbered generations (e.g. MissingNo.).'),
        types: z
          .array(z.string())
          .describe(`Typing, in order, e.g. ["Dragon", "Ground"]. One of ${TYPE_NAMES}.`),
        baseStats: statsTable,
        bst: z.number().describe('Base stat total — the sum of `baseStats`.'),
        abilities: abilitySlots,
        baseSpecies: z.string().describe('Name of the species this entry belongs to; equal to `name` for a base forme.'),
        forme: z.string().optional().describe('Forme label when this entry is an alternate forme, e.g. "Mega", "Wash"; absent for the base forme.'),
        baseForme: z.string().optional().describe('Label of the species\' default forme when it has formes, e.g. "Teal" for Ogerpon; absent otherwise.'),
        otherFormes: z
          .array(z.string())
          .nullable()
          .optional()
          .describe('Names of the non-cosmetic alternate formes; null or absent when the species has none.'),
        cosmeticFormes: z
          .array(z.string())
          .nullable()
          .optional()
          .describe('Names of cosmetic-only formes (different look, identical mechanics); null or absent when there are none.'),
        formeOrder: z
          .array(z.string())
          .nullable()
          .optional()
          .describe('Dataset display order of the species and its formes; absent when the species has no formes.'),
        isCosmeticForme: z.boolean().describe('true when this entry is a cosmetic forme rather than a mechanically distinct one.'),
        battleOnly: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe('The species this entry transforms from during battle, e.g. "Garchomp" for Garchomp-Mega, or a list when it can come from more than one (Wishiwashi); absent for normally selectable entries.'),
        weightkg: z.number().describe('Weight in kilograms, as used by weight-based moves such as Heavy Slam.'),
        genderRatio: z
          .object({
            M: z.number().describe('Fraction of encounters that are male.'),
            F: z.number().describe('Fraction of encounters that are female.'),
          })
          .describe('Gender odds at encounter; both 0 for genderless species.'),
        gender: z
          .string()
          .optional()
          .describe('"M", "F", or "N" (genderless) for species that are not a mix of both; absent when the species has a mixed gender ratio.'),
        eggGroups: z.array(z.string()).describe('Egg groups, e.g. ["Monster", "Dragon"]; empty for species that cannot breed.'),
        nfe: z.boolean().describe('true when the species can still evolve (not fully evolved).'),
        canHatch: z.boolean().describe('true when the species can hatch from an Egg.'),
        prevo: z.string().optional().describe('Species this one evolves from; absent for base evolutions.'),
        evos: z.array(z.string()).describe('Species this one evolves into; empty when it does not evolve.'),
        evoLevel: z.number().optional().describe('Level required to evolve, when the evolution is level-based.'),
        evoItem: z.string().optional().describe('Item required to evolve, when the evolution is item-based.'),
        evoMove: z.string().optional().describe('Move the species must know to evolve, when the evolution is move-based.'),
        evoCondition: z
          .string()
          .optional()
          .describe('Free-text condition for evolutions that are not plain level, item, or move evolutions, e.g. "Level up with 999 Coins in the bag".'),
        isMega: z.boolean().optional().describe('true for Mega Evolutions; absent otherwise.'),
        isPrimal: z.boolean().optional().describe('true for Primal Reversions; absent otherwise.'),
        canGigantamax: z
          .string()
          .optional()
          .describe('Name of the G-Max move, when this entry is a Gigantamax-capable forme; absent otherwise.'),
        cannotDynamax: z.boolean().describe('true when the species cannot Dynamax.'),
        isNonstandard: z
          .string()
          .nullable()
          .describe('"Past", "Future", "Unobtainable", or "CAP" when the entry is not available in the current games; null when it is standard.'),
        unreleasedHidden: z.boolean().optional().describe('true when the hidden ability has not been released; absent otherwise.'),
        tags: z
          .array(z.string())
          .describe('Dataset tags such as ["Sub-Legendary"] or ["Mythical"]; empty when the entry is untagged.'),
      },
    },
    wrap(async (args: { species: string }) => {
      const s = requireSpecies(getChampionsDex(), args.species);
      return ok(speciesToObj(s));
    }),
  );

  server.registerTool(
    'list_forms',
    {
      title: 'List Pokémon forms',
      description:
        'List every form of one species — base, alternate, cosmetic, and battle-only — with each form\'s types, base stats, abilities, plus the total count. Forms that have no data are returned with a note rather than dropped, so a missing entry is visible. Use it before assuming a form exists; for a single species\' full profile use `get_pokemon`, and to search names across species use `search_dex`. Read-only and offline; unknown species return an isError with near matches.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        species: z
          .string()
          .describe('Base species to expand, e.g. "Rotom", "Ogerpon", "Gholdengo".'),
      },
      outputSchema: {
        baseSpecies: z
          .string()
          .describe('Name of the base species whose forms are listed, e.g. "Rotom" when asked for "Rotom-Wash".'),
        count: z.number().describe('Number of entries in `forms`, including placeholders for forms with no data.'),
        forms: z
          .array(
            z.union([
              z
                .object({
                  name: z.string().describe('Form name, e.g. "Rotom-Wash".'),
                  types: z.array(z.string()).describe(`Typing of the form, e.g. ["Electric", "Water"]. One of ${TYPE_NAMES}.`),
                  baseStats: statsTable,
                  bst: z.number().describe('Base stat total of the form.'),
                  abilities: abilitySlots,
                  isCosmetic: z.boolean().describe('true when the form differs only cosmetically.'),
                  battleOnly: z
                    .union([z.string(), z.array(z.string())])
                    .optional()
                    .describe('The species this form transforms from in battle; absent for normally selectable forms.'),
                  isMega: z.boolean().optional().describe('true for Mega Evolutions; absent otherwise.'),
                  isPrimal: z.boolean().optional().describe('true for Primal Reversions; absent otherwise.'),
                })
                .describe('A form that exists in the dataset, carrying the same fields as `get_pokemon` (minus evolutions and the long tail of dataset metadata).'),
              z
                .object({
                  name: z.string().describe('Form name that has no data in the dataset.'),
                  note: z.string().describe('Why the entry is empty — currently always "unavailable in the dataset".'),
                })
                .describe('Placeholder for a form name the dataset knows about but that distinguishes "no such form" from "form missing here"; distinguishes "no such form" from "form missing here".'),
            ]),
          )
          .describe('One entry per known form name of the species — base, alternate, cosmetic, and battle-only — either a full form profile or a `{name, note}` placeholder.'),
      },
    },
    wrap(async (args: { species: string }) => {
      const dex = getChampionsDex();
      const base = requireSpecies(dex, args.species);
      const names = new Set<string>([base.name]);
      for (const f of [...(base.otherFormes ?? []), ...(base.cosmeticFormes ?? []), ...(base.formeOrder ?? [])]) {
        if (f) names.add(f);
      }
      const forms = [...names].map((n) => {
        const f = dex.species.get(n);
        if (!f.exists) return { name: n, note: 'unavailable in the dataset' };
        const o = speciesToObj(f);
        return {
          name: o.name,
          types: o.types,
          baseStats: o.baseStats,
          bst: o.bst,
          abilities: o.abilities,
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
    'search_dex',
    {
      title: 'Search the dataset by name',
      description:
        'Find species, moves, items, abilities, or natures by case-insensitive substring of name or Showdown id, sorted by National Dex number and truncated to `limit`. Use it when the exact name is uncertain, then call the matching lookup (`get_pokemon`, `get_move`, `get_item`, `get_ability`, `get_nature`) with the name it returns. Exactly one `kind` is searched per call; and the reply echoes kind, query, and total match count. Read-only and offline; a blank query is rejected as an error instead of dumping the dataset.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        query: z
          .string()
          .describe('Substring to match against name and Showdown id, e.g. "oger", "sword".'),
        kind: z
          .enum(['species', 'move', 'item', 'ability', 'nature'])
          .default('species')
          .describe('Table to search; one per call (default "species").'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe('Maximum results returned, 1-100 (default 20).'),
      },
      outputSchema: {
        kind: z
          .enum(['species', 'move', 'item', 'ability', 'nature'])
          .describe('The table that was searched, echoed back from the `kind` argument.'),
        query: z.string().describe('The query exactly as it was supplied (not lower-cased or trimmed).'),
        count: z
          .number()
          .describe('Total number of matches the query found, before truncation to `limit` — compare against `results.length` to see whether the list was cut short.'),
        results: z
          .array(
            z.object({
              name: z.string().describe('Match name, usable as-is with the matching lookup tool, e.g. "Garchomp".'),
              num: z.number().describe('National Dex (or table) number, the sort key for this list.'),
            }),
          )
          .describe('Matching entries sorted by `num` ascending and truncated to `limit`; empty when nothing matched.'),
      },
    },
    wrap(
      async (args: { query: string; kind: 'species' | 'move' | 'item' | 'ability' | 'nature'; limit: number }) => {
        const gen = 9;
        const dex = getChampionsDex();
        const q = args.query.toLowerCase().trim();
        if (!q) throw new Error('query must be non-empty.');

        const results: { name: string; num: number }[] = [];
        const push = (all: { id: string; name: string; num: number }[]) => {
          for (const e of all) {
            if (e.name.toLowerCase().includes(q) || e.id.includes(q)) {
              results.push({ name: e.name, num: e.num });
            }
          }
        };

        if (args.kind === 'species') {
          push(dex.species.all().map((s) => ({ id: s.id, name: s.name, num: s.num })));
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
      title: 'Get move data',
      description:
        'Get one move\'s battle data: type, damage class, base power, accuracy, PP, priority, target, flags, secondary effect, Z/Max variants, and effect text. Use `get_learnset` to check which Pokémon learn it and `calculate_damage` to apply it in a matchup, rather than reasoning about damage from these fields. Accepts Showdown move names case- and punctuation-insensitively ("make it rain"); unknown moves return an isError with near matches. Read-only and offline.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        move: z.string().describe('Move name, e.g. "Earthquake", "Make It Rain", "Dragon Claw".'),
      },
      outputSchema: {
        name: z.string().describe('Move name, e.g. "Earthquake".'),
        num: z.number().describe('Move number in the dataset, which is also the sort key `search_dex` returns moves by.'),
        gen: z.number().describe('Generation the move was introduced in.'),
        type: z.string().describe(`Move type. One of ${TYPE_NAMES}.`),
        category: z.string().describe('Damage class: "Physical", "Special", or "Status".'),
        basePower: z
          .number()
          .describe('Base power; 0 for status moves and for moves whose power is computed rather than fixed (e.g. Seismic Toss, Low Kick).'),
        accuracy: z
          .union([z.number(), z.boolean()])
          .describe('Accuracy as a percentage, or true when the move cannot miss.'),
        pp: z.number().describe('Base PP, before PP Ups.'),
        priority: z.number().describe('Priority bracket: positive moves act first, negative moves last.'),
        target: z
          .string()
          .describe('Targeting mode, e.g. "normal", "self", "allAdjacent", "allAdjacentFoes", "allySide".'),
        flags: moveFlags,
        shortDesc: z.string().describe('One-line effect summary.'),
        desc: z.string().describe('Full effect description.'),
        secondary: secondaryEffect
          .optional()
          .describe('Secondary effect attached to the move itself, when it has one (absent for moves with none).'),
        secondaries: z
          .array(secondaryEffect)
          .optional()
          .describe('List of secondary effects, present for moves that carry more than one (e.g. a different effect per hit); absent for moves with none.'),
        isZ: z
          .string()
          .optional()
          .describe('Z-Crystal id that turns this move into a Z-Move; absent when the move has no dedicated Z-Move.'),
        zMove: z
          .object({
            basePower: z.number().optional().describe('Base power the Z-Move is fixed to.'),
            effect: z.string().optional().describe('Effect id applied by the Z-Move, e.g. "clearnegativeboost".'),
            boost: boostsTable.optional().describe('Stat boosts the Z-Move grants the user before attacking.'),
          })
          .optional()
          .describe('The Z-Move this move becomes when a Z-Crystal is held; absent when it does not become one.'),
        isMax: z
          .union([z.string(), z.boolean()])
          .optional()
          .describe('Species name when this is a G-Max move, true for generic Max Moves; absent when the move is not a Max Move.'),
        maxMove: z
          .object({
            basePower: z.number().describe('Base power of the Max Move under Dynamax.'),
          })
          .optional()
          .describe('The Max Move this move becomes under Dynamax; absent when it does not become one.'),
        breaksProtect: z
          .boolean()
          .optional()
          .describe('true when the move hits through Protect and similar protection; absent when it does not.'),
        drain: z
          .array(z.number())
          .optional()
          .describe('HP the user recovers as a [numerator, denominator] fraction of damage dealt, e.g. [1, 2] for half; absent when the move does not drain.'),
        recoil: z
          .array(z.number())
          .optional()
          .describe('Recoil to the user as a [numerator, denominator] fraction of damage dealt, e.g. [33, 100]; absent when the move has no recoil.'),
        multihit: z
          .union([z.number(), z.array(z.number())])
          .optional()
          .describe('Hit count when the move hits multiple times: a fixed number, or a [min, max] range as [2, 5]; absent for single-hit moves.'),
        alwaysHit: z
          .boolean()
          .optional()
          .describe('true when the dataset marks the move as never missing; absent from every other move.'),
        isNonstandard: z
          .string()
          .nullable()
          .describe('"Past", "Future", "Unobtainable", or "CAP" when the move is not available in the current games; null when it is standard.'),
      },
    },
    wrap(async (args: { move: string }) => {
      const dex = getChampionsDex();
      const m = dex.moves.get(args.move);
      const suggestions = m.exists ? [] : fuzzyMatches(dex.moves.all().map((x) => x.id), dex.moves.all().map((x) => x.name), args.move);
      return ok(moveToObj(requireExists(m, 'move', args.move, suggestions)));
    }),
  );

  server.registerTool(
    'get_item',
    {
      title: 'Get item data',
      description:
        'Get one held item\'s data: effect text, category flags (Berry, Choice, Mega Stone, …), Z-move, Natural Gift, Fling, and flat stat boosts. Use it to confirm what an item actually does before recommending it; `get_set` returns the item a curated meta set runs. Accepts item names case-insensitively; unknown items return an isError with near matches. Read-only and offline.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        item: z.string().describe('Item name, e.g. "Choice Band", "Assault Vest", "Leftovers".'),
      },
      outputSchema: {
        name: z.string().describe('Item name, e.g. "Choice Band".'),
        num: z.number().describe('Item number in the dataset; 0 for items that have none.'),
        gen: z.number().describe('Generation the item was introduced in.'),
        shortDesc: z.string().describe('One-line effect summary.'),
        desc: z.string().describe('Full effect description.'),
        isBerry: z.boolean().optional().describe('true when the item is a Berry (held and eaten on a trigger); absent otherwise.'),
        isChoice: z.boolean().optional().describe('true when the item is a Choice item that locks the holder into one move; absent otherwise.'),
        isGem: z.boolean().optional().describe('true when the item is a one-use type Gem that boosts a matching move; absent otherwise.'),
        isPokeball: z.boolean().optional().describe('true when the item is a Poké Ball used for catching; absent otherwise.'),
        megaStone: z
          .record(z.string(), z.string())
          .optional()
          .describe('Mega Stone holders: species name to the Mega forme it unlocks, e.g. {"Garchomp": "Garchomp-Mega"}; absent when the item is not a Mega Stone.'),
        zMove: z
          .union([z.string(), z.boolean()])
          .optional()
          .describe('For Z-Crystals: the Z-Move it unlocks, or true for crystals whose move depends on the held move; absent when the item is not a Z-Crystal.'),
        naturalGift: z
          .object({
            basePower: z.number().describe('Base power Natural Gift gains from this item.'),
            type: z.string().describe('Type Natural Gift becomes with this item, e.g. "Fire".'),
          })
          .optional()
          .describe('Natural Gift data, present only for Berries (the items Natural Gift can consume).'),
        fling: z
          .object({
            basePower: z.number().describe('Base power Fling gains from this item.'),
            status: z.string().optional().describe('Major status Fling inflicts on the target, when the item does (e.g. "par").'),
            volatileStatus: z.string().optional().describe('Volatile status Fling inflicts on the target, when the item does (e.g. "flinch").'),
          })
          .optional()
          .describe('Fling data, present only for items that can be flung.'),
        boosts: boostsTable
          .optional()
          .describe('Flat stat stages the item grants while held, keyed by stat id, e.g. {"atk": 2} for Choice Band; absent for items that do not change stats directly.'),
        forcedForme: z
          .string()
          .optional()
          .describe('Forme this item forces on its holder, e.g. "Dialga-Origin" for Adamant Crystal; absent when the item changes no forme.'),
        itemUser: z
          .array(z.string())
          .optional()
          .describe('Species that can use the item where it is restricted to them; absent when any species can hold it.'),
        isNonstandard: z
          .string()
          .nullable()
          .describe('"Past", "Future", "Unobtainable", or "CAP" when the item is not available in the current games; null when it is standard.'),
      },
    },
    wrap(async (args: { item: string }) => {
      const dex = getChampionsDex();
      const i = dex.items.get(args.item);
      const suggestions = i.exists ? [] : fuzzyMatches(dex.items.all().map((x) => x.id), dex.items.all().map((x) => x.name), args.item);
      return ok(itemToObj(requireExists(i, 'item', args.item, suggestions)));
    }),
  );

  server.registerTool(
    'get_ability',
    {
      title: 'Get ability data',
      description:
        'Get one ability\'s effect text, flags, and the generations it exists in. Use it before relying on an ability in damage or speed reasoning; the set inputs of `calculate_damage` and `check_speed` take the ability or item name and apply it themselves. Accepts ability names case-insensitively; unknown abilities return an isError with near matches. Read-only and offline.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        ability: z.string().describe('Ability name, e.g. "Intimidate", "Protosynthesis".'),
      },
      outputSchema: {
        name: z.string().describe('Ability name, e.g. "Intimidate".'),
        num: z.number().describe('Ability number in the dataset; 0 for abilities that have none.'),
        gen: z.number().describe('Generation the ability was introduced in; 0 for the "No Ability" placeholder.'),
        shortDesc: z.string().describe('One-line effect summary.'),
        desc: z.string().describe('Full effect description.'),
        flags: abilityFlags,
        isNonstandard: z
          .string()
          .nullable()
          .describe('"Past", "Future", "Unobtainable", or "CAP" when the ability is not available in the current games; null when it is standard.'),
      },
    },
    wrap(async (args: { ability: string }) => {
      const dex = getChampionsDex();
      const a = dex.abilities.get(args.ability);
      const suggestions = a.exists ? [] : fuzzyMatches(dex.abilities.all().map((x) => x.id), dex.abilities.all().map((x) => x.name), args.ability);
      return ok(abilityToObj(requireExists(a, 'ability', args.ability, suggestions)));
    }),
  );

  server.registerTool(
    'get_nature',
    {
      title: 'Get nature effect',
      description:
        'Get one nature\'s stat effect: the stat it raises 10% and the stat it lowers 10%, or a neutral effect for the five natures that change nothing (Hardy, Docile, Serious, Bashful, Quirky). Use it when assembling a set, since `calculate_stats`, `calculate_damage`, `check_speed`, and `optimize_evs` all take a nature name rather than a numeric modifier. Accepts nature names case-insensitively; unknown natures return an isError. Read-only and offline.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        nature: z.string().describe('Nature name, e.g. "Jolly", "Timid", "Impish".'),
      },
      outputSchema: {
        name: z.string().describe('Nature name, e.g. "Jolly".'),
        plus: z
          .string()
          .optional()
          .describe('Stat raised 10%, as a stat id such as "spe"; absent for the five neutral natures that change nothing.'),
        minus: z
          .string()
          .optional()
          .describe('Stat lowered 10%, as a stat id such as "spa"; absent for the five neutral natures that change nothing.'),
        gen: z.number().describe('Generation the nature system was introduced in.'),
      },
    },
    wrap(async (args: { nature: string }) => {
      const dex = getChampionsDex();
      const n = dex.natures.get(args.nature);
      return ok(natureToObj(requireExists(n, 'nature', args.nature)));
    }),
  );

  server.registerTool(
    'get_learnset',
    {
      title: 'Get a Pokémon learnset',
      description:
        'List every move a Pokémon can learn, grouped by acquisition method (level-up with the level, TM/TR, egg, tutor, event, and so on). This is the species\u2019 own learnset: a move it inherits from a pre-evolution — an egg move such as Grookey\u2019s Fake Out — is filed against that pre-evolution, so use `check_legality` to decide whether a set\u2019s move is legal in a regulation. Accepts any species or form name; unknown species return an isError with near matches, and a species with no learnset data errors instead of returning an empty list. Read-only and offline.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        species: z.string().describe('Species or form name, e.g. "Garchomp", "Ogerpon-Wellspring".'),
      },
      outputSchema: {
        species: z.string().describe('Name of the species whose learnset this is, resolved from the argument, e.g. "Garchomp".'),
        exists: z.boolean().describe('true when the dataset has learnset data for the species; a species without data errors instead of returning false.'),
        eventOnly: z
          .boolean()
          .describe('true when the species is only obtainable through events, so most of its moves come from the event list.'),
        eventData: z
          .array(
            z.object({
              generation: z.number().describe('Generation the event ran in.'),
              level: z.number().describe('Level the event Pokémon is distributed at.'),
              moves: z.array(z.string()).describe('Move ids the event Pokémon comes with.'),
              pokeball: z.string().optional().describe('Ball the Pokémon is distributed in, as an id such as "cherishball".'),
              shiny: z
                .union([z.boolean(), z.number()])
                .optional()
                .describe('true (or 1) when the distributed Pokémon is shiny; absent when it is not.'),
              gender: z.string().optional().describe('Gender the event forces, "M" or "F"; absent when the event does not fix it.'),
              nature: z.string().optional().describe('Nature the event fixes; absent when the nature is not fixed.'),
              isHidden: z.boolean().optional().describe('true when the event grants the hidden ability; absent otherwise.'),
              abilities: z.array(z.string()).optional().describe('Ability ids the event Pokémon can come with.'),
              ivs: z
                .object({
                  hp: z.number().optional().describe('HP IV.'),
                  atk: z.number().optional().describe('Attack IV.'),
                  def: z.number().optional().describe('Defense IV.'),
                  spa: z.number().optional().describe('Special Attack IV.'),
                  spd: z.number().optional().describe('Special Defense IV.'),
                  spe: z.number().optional().describe('Speed IV.'),
                })
                .optional()
                .describe('IVs the event fixes, keyed by stat id; only the stats the event pins down are listed.'),
              perfectIVs: z.number().optional().describe('Number of stats guaranteed to be perfect (31 IVs); absent when the event guarantees none.'),
              source: z.string().optional().describe('Source game the event belongs to, e.g. "gen8bdsp".'),
              emeraldEventEgg: z.boolean().optional().describe('true when the event is the Emerald event egg; absent otherwise.'),
              japan: z.boolean().optional().describe('true when the event was Japan-only; absent otherwise.'),
            }),
          )
          .optional()
          .describe('Event distributions that granted this species, when it has any; absent for species with no event history.'),
        movesBySource: z
          .record(z.string(), z.array(z.string()))
          .describe(
            'Learned moves grouped by how they are acquired, keyed by "Level-up", "TM", "Egg", "Tutor", "Event", "Raid/Event", "Virtual Console transfer", "Dream World", "Pre-evolution", or "Other"; a move learned more than one way appears under each. Each list is sorted by move name and holds display names, e.g. {"TM": ["Earthquake"], "Level-up": ["Dragon Claw"]}. Empty when the dataset records no moves.',
          ),
        totalMoves: z.number().describe('Number of distinct moves the species can learn, counted before grouping by source.'),
      },
    },
    wrap(async (args: { species: string }) => {
      const dex = getChampionsDex();
      const s = requireSpecies(dex, args.species);
      const ls = await dex.learnsets.getByID(toID(s.name));
      if (!ls.exists) throw new Error(`No learnset data for "${args.species}".`);
      return ok({ species: s.name, ...learnsetToObj(ls) });
    }),
  );

  server.registerTool(
    'get_type',
    {
      title: 'Get type matchup chart entry',
      description:
        'Get the defensive profile of one type: what it is weak to, what it resists, what it is immune to, plus the Hidden Power IVs for that type. Use it for a type\'s own matchups; for one specific pairing pass attacker and defender to `get_type_matchup`, and for a Pokémon\'s combined defensive chart give `get_type_matchup` the species name instead. Accepts type names case-insensitively; unknown types return an isError. Read-only and offline.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: z.string().describe('Type name, e.g. "Steel", "Fairy", "Ground".'),
      },
      outputSchema: {
        name: z.string().describe('Type name, e.g. "Steel".'),
        gen: z.number().describe('Always 0 in the bundled dataset — types are not stamped with the generation they were introduced in.'),
        isNonstandard: z
          .string()
          .nullable()
          .describe('"Future" when the type does not exist in the dataset (e.g. Dark in generation 1) and "Past" when it no longer exists; null for types that are standard in that generation.'),
        damageTaken: z
          .record(z.string(), z.number())
          .describe(
            `Multiplier this type takes from each attacking type, keyed by attacking type name. Values: 0 (immune), 0.5 (resisted), 1 (neutral), 2 (weak). Keys are ${TYPE_NAMES}; e.g. {"Fire": 2, "Ground": 2, "Water": 0.5} for Steel.`,
          ),
        weaknesses: z
          .array(z.string())
          .describe(`Attacking types this type takes 2x from, e.g. ["Fire", "Ground"] for Steel; empty when it has none.`),
        resistances: z
          .array(z.string())
          .describe('Attacking types this type takes 0.5x from; empty when it has none.'),
        immunities: z
          .array(z.string())
          .describe('Attacking types this type takes 0x from, e.g. ["Poison"] for Steel; empty when it has none.'),
        HPivs: z
          .object({
            hp: z.number().optional().describe('Required HP IV (30 or 31); absent when this Hidden Power type does not constrain it.'),
            atk: z.number().optional().describe('Required Attack IV (30 or 31); absent when this Hidden Power type does not constrain it.'),
            def: z.number().optional().describe('Required Defense IV (30 or 31); absent when this Hidden Power type does not constrain it.'),
            spa: z.number().optional().describe('Required Special Attack IV (30 or 31); absent when this Hidden Power type does not constrain it.'),
            spd: z.number().optional().describe('Required Special Defense IV (30 or 31); absent when this Hidden Power type does not constrain it.'),
            spe: z.number().optional().describe('Required Speed IV (30 or 31); absent when this Hidden Power type does not constrain it.'),
          })
          .describe('IVs needed to make Hidden Power come out as this type, keyed by stat id; only the stats this type pins down are listed.'),
      },
    },
    wrap(async (args: { type: string }) => {
      const dex = getChampionsDex();
      const t = dex.types.get(args.type);
      return ok(typeToObj(requireExists(t, 'type', args.type)));
    }),
  );

  server.registerTool(
    'get_type_matchup',
    {
      title: 'Resolve type effectiveness',
      description:
        'Resolve type effectiveness in the mode the arguments imply: attacker + defender returns the single multiplier (the defender may be a type or a species, whose current-generation typing is used); attacker alone returns that type\'s offensive coverage against all 18 types; defender alone returns everything the defender takes, including 4x weaknesses and immunities; neither returns the complete 18x18 matrix. Use `get_type` for a type\'s own defensive entry, and `analyze_team` when the question spans a whole team. Names are case-insensitive; an unknown type or species returns an isError. Read-only and offline.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        attacker: z
          .string()
          .optional()
          .describe('Attacking type name; omit to read the chart from the defender\'s side or to get the full matrix.'),
        defender: z
          .string()
          .optional()
          .describe('Defending type or species name; a species contributes its current-generation types.'),
      },
      outputSchema: {
        attacker: z
          .string()
          .optional()
          .describe('The attacker as supplied, echoed back; absent when no attacker argument was given.'),
        defender: z
          .string()
          .optional()
          .describe('Resolved defender name — the type or species the multipliers were computed against; present in the matchup and defender-only replies.'),
        defenderTypes: z
          .array(z.string())
          .optional()
          .describe('The defending typing the multiplier was computed from, e.g. ["Dragon", "Ground"] for Garchomp or ["Steel"] for a type; present in the matchup and defender-only replies.'),
        effectiveness: z
          .number()
          .optional()
          .describe('Single multiplier for attacker against defender (0, 0.25, 0.5, 1, 2, or 4); present only when both attacker and defender were given.'),
        label: z
          .string()
          .optional()
          .describe('`effectiveness` in words, e.g. "2x super effective", "neutral", "immune"; present only when both attacker and defender were given.'),
        coverage: z
          .record(z.string(), effectivenessEntry)
          .optional()
          .describe(
            `Present only when an attacker was given without a defender: how that attacking type lands against each of the 18 defending types, keyed by defending type name (${TYPE_NAMES}).`,
          ),
        damageTaken: z
          .record(z.string(), effectivenessEntry)
          .optional()
          .describe(
            'Present only when a defender was given without an attacker: everything the defender takes, keyed by attacking type name. Combined typing is folded in, so 4x and 0.25x entries appear for dual types and 0 marks immunities.',
          ),
        chart: z
          .record(z.string(), z.record(z.string(), z.number()))
          .optional()
          .describe(
            'Present only when neither argument was given: the full type chart as `chart[attackingType][defendingType] = multiplier`, each inner map keyed by the 18 defending type names with values 0, 0.25, 0.5, 1, 2, or 4.',
          ),
        note: z
          .string()
          .optional()
          .describe('Present only alongside `chart`, spelling out how to read the full matrix (rows are attackers, columns are defenders) and the multiplier scale.'),
      },
    },
    wrap(async (args: { attacker?: string; defender?: string }) => {
      const dex = getChampionsDex();

      const resolveDefender = (name: string): { label: string; types: string[] } => {
        const t = dex.types.get(name);
        if (t.exists) return { label: t.name, types: [t.name] };
        const s = dex.species.get(name);
        if (s.exists) return { label: s.name, types: [...s.types] };
        throw new Error(`Unknown type or species "${name}".`);
      };

      if (args.attacker && args.defender) {
        const def = resolveDefender(args.defender);
        const mult = typeEffectiveness(args.attacker, def.types, 9);
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
          const m = typeEffectiveness(args.attacker, [t], 9);
          coverage[t] = { effectiveness: m, label: effectivenessLabel(m) };
        }
        return ok({ attacker: args.attacker, coverage });
      }

      if (args.defender) {
        const def = resolveDefender(args.defender);
        const taken: Record<string, { effectiveness: number; label: string }> = {};
        for (const t of TYPES18) {
          const m = typeEffectiveness(t, def.types, 9);
          taken[t] = { effectiveness: m, label: effectivenessLabel(m) };
        }
        return ok({ defender: def.label, defenderTypes: def.types, damageTaken: taken });
      }

      const chart: Record<string, Record<string, number>> = {};
      for (const atk of TYPES18) {
        chart[atk] = {};
        for (const def of TYPES18) {
          chart[atk][def] = typeEffectiveness(atk, [def], 9);
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
