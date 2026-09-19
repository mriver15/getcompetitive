/**
 * Battle mechanics tools: stat calculation, damage calculation, speed tiers.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Move as CalcMove, calculate } from '@smogon/calc';
import { statTable, damageResult, finalStat, buildPokemon, buildField, getCalcGen, resolveEvs, evsToChampionsPoints, STATS, type SetInput } from '../dex.js';
import { getChampionsDex } from '../champions.js';
import { getRegulationSet } from '../regulations.js';
import { ok, wrap, requireExists, READ_ONLY_ANNOTATIONS } from '../result.js';
import { evMap, championsPointsMap } from './schemas.js';

const ivMap = z
  .record(z.string(), z.number())
  .optional()
  .describe('IVs keyed by stat id (hp, atk, def, spa, spd, spe), each 0-31; omitted stats default to 31.');

const boostMap = z
  .record(z.string(), z.number())
  .optional()
  .describe(
    'Stat stages keyed by stat id (hp, atk, def, spa, spd, spe), each -6..+6; omitted stats are 0 (e.g. { atk: 2 } = +2 Attack).',
  );

const setSchema = z.object({
  species: z.string().describe('Species or form name, e.g. "Garchomp", "Ogerpon-Wellspring".'),
  level: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Level 1-100; defaults to 100 in the damage tools and 50 in the stat/speed tools.'),
  nature: z
    .string()
    .optional()
    .describe('Nature name, e.g. "Jolly", "Modest", "Adamant"; defaults to Serious (neutral) when omitted.'),
  ivs: ivMap,
  evs: evMap,
  championsPoints: championsPointsMap,
  item: z
    .string()
    .optional()
    .describe('Held item name, e.g. "Choice Band", "Assault Vest", "Leftovers"; the calc applies its damage, Speed, or bulk effect.'),
  ability: z
    .string()
    .optional()
    .describe('Ability name, e.g. "Intimidate", "Protosynthesis"; defaults to the species\u2019 default ability.'),
  boosts: boostMap,
  status: z
    .string()
    .optional()
    .describe('Pre-existing status such as "brn", "par", or "tox"; burn halves physical damage, paralysis cuts Speed.'),
  abilityOn: z
    .boolean()
    .optional()
    .describe('Force the ability on (true) or off (false), e.g. to compare Protosynthesis active vs not; omitted leaves it to the calc.'),
  isDynamaxed: z.boolean().optional().describe('Treat this Pokémon as Dynamaxed (doubles HP and alters several moves).'),
  curHP: z.number().optional().describe('Current HP when entering damaged, e.g. 120; defaults to full HP.'),
  moves: z
    .array(z.string())
    .optional()
    .describe('Moveset names, e.g. ["Earthquake", "Dragon Claw"]; used by `calculate_matchups` to pick the hardest-hitting move per defender.'),
});

/** Flatten a calc damage value (number | number[] | number[][]) into a flat roll list. */
function flatDamage(d: unknown): number[] {
  if (typeof d === 'number') return [d];
  if (Array.isArray(d)) return d.flat(Infinity).map(Number);
  return [];
}

/** Stat-stage multiplier (e.g. +1 = 1.5x, +2 = 2x, -1 = 0.667x). */
function boostMult(stage: number): number {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

/**
 * A six-stat block keyed by stat id (hp, atk, def, spa, spd, spe), always with
 * all six keys: base stats, IVs, stat stages, and computed stats all arrive in
 * this shape. `label` is prepended to each field description, so it must read
 * as a noun phrase, e.g. "Base" -> "Base Attack: ...".
 */
function statBlock(label: string, description: string) {
  return z
    .object({
      hp: z.number().describe(`${label} HP: hit points, which decide how much damage the set can take.`),
      atk: z.number().describe(`${label} Attack: the stat behind physical damage dealt.`),
      def: z.number().describe(`${label} Defense: the stat behind physical damage taken.`),
      spa: z.number().describe(`${label} Special Attack: the stat behind special damage dealt.`),
      spd: z.number().describe(`${label} Special Defense: the stat behind special damage taken.`),
      spe: z.number().describe(`${label} Speed: turn order; the higher Speed moves first.`),
    })
    .describe(description);
}

/** EV map as `summarizeSet` builds it: unused stats are omitted. */
const reportedEvs = z
  .record(z.string(), z.number())
  .describe(
    'EVs the set was calculated with, keyed by stat id (hp, atk, def, spa, spd, spe) with stats left at 0 omitted.',
  );

/** The same spread expressed in Champions stat points, for entry into the game. */
const reportedChampionsPoints = z
  .record(z.string(), z.number())
  .describe(
    'The spread as Pok\u00e9mon Champions stat points (whole numbers, at most 32 in a stat, 66 total) \u2014 what the game\u2019s training screen takes; stats left uninvested are omitted and a maxed stat reads 32. The two systems budget differently (510 EVs against 66 points), so a spread trimmed to fit the EV cap reads back a point or two under what was asked: this is the nearest point spread for the stats actually computed, not a copy of the input.',
  );

/** `[minimum, maximum]` damage of a resolved move, across all of its rolls. */
const damageRangeSchema = z
  .tuple([z.number(), z.number()])
  .describe(
    '[minimum, maximum] damage: `calculate_damage` totals every roll (multi-hit moves are summed), while `calculate_matchups` reports the flattened per-hit rolls, so its bounds stay single-hit values. [0, 0] means nothing could be calculated.',
  );

/** One side of a damage calculation as the calc resolved it (see `summarizeSet` in dex.ts). */
const damageSetSchema = z.object({
  species: z.string().describe('Canonical species name used in the calculation, e.g. "Garchomp".'),
  level: z.number().int().describe('Level the set was calculated at; the damage tools default nested sets to level 100.'),
  nature: z.string().describe('Nature the stats were computed with, e.g. "Jolly"; Serious when the call omitted one.'),
  evs: reportedEvs,
  championsPoints: reportedChampionsPoints,
  ivs: statBlock('Individual value for', 'IVs the set was calculated with; present only when the call supplied a non-default one, since an all-31 spread is what every omitted IV gives.').optional(),
  item: z.string().optional().describe('Held item echoed back as supplied, e.g. "Choice Band", whose effect the calc applied; absent when the set carried none.'),
  ability: z
    .string()
    .optional()
    .describe('Ability used: the one supplied, else the species\u2019 first ability; absent for a species with no abilities.'),
  status: z.string().optional().describe('Pre-existing status such as "brn", "par", or "tox"; absent when the set entered healthy.'),
  boosts: statBlock('Stat stage for', 'Stat stages in effect for the calculation; absent when none were supplied, since every omitted stage is 0.').optional(),
  stats: statBlock('Final', 'The six stats of this set at its level, IVs, EVs, and nature; stat stages are applied inside the damage mechanics, so they are not folded in here.'),
});

export function registerCalcTools(server: McpServer) {
  server.registerTool(
    'calculate_stats',
    {
      title: 'Calculate final stats',
      description:
        'Compute one Pok\u00e9mon\u2019s final six stats at a level from its nature, IVs, and EVs, returning the stat table plus base stats and BST. Stats only, never a battle: use `calculate_damage` or `calculate_matchups` for damage rolls, `check_speed` to place the Speed stat against a regulation roster, and `optimize_evs` when the spread must be derived from a goal. EVs are 0-252 per stat with a 510 total cap, IVs 0-31, level defaults to 50 and nature to Serious. Read-only and offline; unknown species or nature names return an isError.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        species: z.string().describe('Species or form name, e.g. "Garchomp", "Ogerpon-Wellspring".'),
        level: z.number().int().min(1).max(100).default(50).describe('Level 1-100; default 50.'),
        nature: z
          .string()
          .optional()
          .describe('Nature name, e.g. "Jolly", "Modest"; default Serious (raises and lowers nothing).'),
        evs: evMap,
        championsPoints: championsPointsMap,
        ivs: ivMap,
      },
      outputSchema: {
        species: z.string().describe('Canonical species name the stats belong to, e.g. "Garchomp".'),
        level: z.number().int().describe('Level the stats were computed at, 1-100.'),
        nature: z.string().describe('Nature applied to the non-HP stats, e.g. "Jolly"; Serious when the call omitted one.'),
        baseStats: statBlock('Base', 'The species\u2019 unmodified base stats, the same for every set of that species.'),
        bst: z.number().describe('Base stat total: the sum of the six base stats, a rough measure of the species\u2019 overall power.'),
        evs: statBlock('EV applied to', 'The EVs actually used per stat; all six keys are present, 0 for stats the call left uninvested.'),
        championsPoints: reportedChampionsPoints,
        ivs: statBlock('Individual value for', 'The IVs actually used per stat; all six keys are present, defaulting to 31.'),
        stats: statBlock('Final', 'The six in-game stats this species reaches at this level, nature, IVs, and EVs; `hp` is the full HP stat, not a percentage.'),
      },
    },
    wrap(
      async (args: {
        species: string;
        level: number;
        nature?: string;
        evs?: Record<string, number>;
        championsPoints?: Record<string, number>;
        ivs?: Record<string, number>;
      }) => {
        const gen = 9;
        const dex = getChampionsDex();
        const s = dex.species.get(args.species);
        requireExists(s, 'Pokemon species', args.species);

        const supplied = resolveEvs(args.evs, args.championsPoints);
        const ivs: Record<string, number> = {};
        const evs: Record<string, number> = {};
        for (const st of STATS) {
          ivs[st] = args.ivs?.[st] ?? 31;
          evs[st] = supplied[st] ?? 0;
          if (ivs[st] < 0 || ivs[st] > 31) throw new Error(`IV "${st}" must be 0-31.`);
          if (evs[st] < 0 || evs[st] > 252) throw new Error(`EV "${st}" must be 0-252.`);
        }
        const evTotal = STATS.reduce((sum, st) => sum + evs[st], 0);
        if (evTotal > 510) throw new Error(`EV total ${evTotal} exceeds 510.`);

        const nature = args.nature ?? 'Serious';
        const nat = dex.natures.get(nature);
        requireExists(nat, 'nature', nature);

        const stats = statTable(gen, s.baseStats, args.level, ivs, evs, nature);
        return ok({
          species: s.name,
          level: args.level,
          nature: nature,
          baseStats: s.baseStats,
          bst: s.bst,
          evs,
          championsPoints: evsToChampionsPoints(evs),
          ivs,
          stats,
        });
      },
    ),
  );

  server.registerTool(
    'calculate_damage',
    {
      title: 'Calculate damage for one matchup',
      description:
        'Simulate one attack end to end: one attacker set, one defender set, one named move, optionally under weather, terrain, game type, or side conditions. Use `calculate_matchups` when one attacker must be tested against several defenders, and `calculate_stats` for stat tables with no battle. `field.weather` takes Sand/Sun/Rain/Hail/Snow and `field.terrain` Electric/Grassy/Psychic/Misty; `attackerSide`/`defenderSide` take calc flags (isReflect, isLightScreen, isAuroraVeil, spikes 0-3, isSR), and set levels default to 100 here. Species and move names are validated first, so typos return an isError. Returns every damage roll, damageRange, koChance text, a description line, and both sets\u2019 computed stats. Read-only and offline.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        attacker: setSchema.describe('The attacking Pok\u00e9mon: species plus optional level, nature, IVs, EVs, item, ability, boosts, status, and current HP.'),
        defender: setSchema.describe('The defending Pok\u00e9mon, same fields as `attacker`; its Defense/SpD, HP, typing, and ability drive the result.'),
        move: z.string().describe('Move used by the attacker, e.g. "Earthquake", "Make It Rain"; must be a real move name.'),
        field: z
          .object({
            gameType: z.enum(['Singles', 'Doubles']).optional().describe('Doubles spreads damage across targets; default Singles.'),
            weather: z.string().optional().describe('Weather: "Sand", "Sun", "Rain", "Hail", "Snow", "Harsh Sunshine", "Heavy Rain", or "Strong Winds"; default none.'),
            terrain: z.string().optional().describe('Terrain: "Electric", "Grassy", "Psychic", or "Misty"; default none.'),
            attackerSide: z
              .record(z.string(), z.unknown())
              .optional()
              .describe('Attacker-side flags, e.g. { isHelpingHand: true, isTailwind: true, spikes: 2 }.'),
            defenderSide: z
              .record(z.string(), z.unknown())
              .optional()
              .describe('Defender-side flags, e.g. { isReflect: true, isLightScreen: true, isAuroraVeil: true, isSR: true }.'),
          })
          .optional()
          .describe('Battlefield conditions applied to the calc; omit it for a neutral Singles field with no weather, terrain, or hazards.'),
      },
      outputSchema: {
        attacker: damageSetSchema.describe('The attacking set as the calc resolved it, including the six stats it swung with.'),
        defender: damageSetSchema.describe('The defending set as the calc resolved it, including the six stats it was hit on.'),
        move: z.string().describe('Canonical move name that was calculated, e.g. "Dragon Claw".'),
        field: z
          .object({
            gameType: z.enum(['Singles', 'Doubles']).describe('How many targets the move hit; "Singles" unless the call asked for Doubles.'),
            weather: z.string().optional().describe('Weather in effect, e.g. "Sun", "Rain", "Sand"; absent when the field had none.'),
            terrain: z.string().optional().describe('Terrain in effect, e.g. "Electric", "Grassy"; absent when the field had none.'),
          })
          .describe('The battlefield the calc ran under, echoed back with its defaults filled in.'),
        damage: z
          .union([z.number(), z.array(z.number()), z.array(z.array(z.number()))])
          .describe('Damage dealt by the attack: a single number for a straight-damage move (0 when the defender is immune), a flat list of rolls for a move that rolls its own damage (e.g. False Swipe), or one roll list per hit for a multi-hit move (e.g. Population Bomb, Dragon Darts).'),
        damageRange: damageRangeSchema,
        koChance: z
          .string()
          .optional()
          .describe('Human-readable KO chance, e.g. "guaranteed OHKO" or "31.3% chance to 2HKO"; an empty string when no KO is possible (e.g. False Swipe), and absent when the calc could not describe the matchup at all, which is the immunity case.'),
        description: z
          .string()
          .describe('One-line summary of the whole matchup, e.g. "252 Atk Choice Band Garchomp Dragon Claw vs. 252 HP / 252+ Def Corviknight: 64-76 (16.4 - 19.5%) -- possible 6HKO"; an explicit 0-damage note when the calc could not describe it.'),
      },
    },
    wrap(
      async (args: {
        attacker: {
          species: string;
          level?: number;
          nature?: string;
          ivs?: Record<string, number>;
          evs?: Record<string, number>;
          item?: string;
          ability?: string;
          boosts?: Record<string, number>;
          status?: string;
          abilityOn?: boolean;
          isDynamaxed?: boolean;
          curHP?: number;
        };
        defender: {
          species: string;
          level?: number;
          nature?: string;
          ivs?: Record<string, number>;
          evs?: Record<string, number>;
          item?: string;
          ability?: string;
          boosts?: Record<string, number>;
          status?: string;
          abilityOn?: boolean;
          isDynamaxed?: boolean;
          curHP?: number;
        };
        move: string;
        field?: {
          gameType?: 'Singles' | 'Doubles';
          weather?: string;
          terrain?: string;
          attackerSide?: Record<string, unknown>;
          defenderSide?: Record<string, unknown>;
        };
      }) => {
        const gen = 9;
        // Validate species + move names for helpful errors before the calc throws.
        const dex = getChampionsDex();
        requireExists(dex.species.get(args.attacker.species), 'Pokemon species', args.attacker.species);
        requireExists(dex.species.get(args.defender.species), 'Pokemon species', args.defender.species);
        requireExists(dex.moves.get(args.move), 'move', args.move);

        const result = damageResult(
          gen,
          args.attacker,
          args.defender,
          args.move,
          args.field ?? {},
        );
        return ok(result);
      },
    ),
  );

  server.registerTool(
    'calculate_matchups',
    {
      title: 'Batch damage matchups',
      description:
        'Run one attacker against 1-30 defenders in a single call, picking the hardest-hitting move per defender from `move` or `attacker.moves` and reporting each matchup\u2019s damage range, KO chance, immunity, and who moves first. Rows carry only those fields \u2014 they are structured rather than prose, so that 30 defenders do not cost thirty rendered sentences; call `calculate_damage` for the single matchup rendered as a Showdown-format line. Use `calculate_damage` too when side screens and hazards matter (this tool\u2019s `field` has only gameType, weather, and terrain); use `analyze_team` for type-synergy, not damage, and `calculate_stats` for a stat table with no battle. Supply `move` or a non-empty `attacker.moves`, else the call errors; defender levels default to 100. Read-only, offline, deterministic; unknown species or move names return an isError naming the offender.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        attacker: setSchema.describe('The single attacking Pok\u00e9mon; set `moves` to let the tool choose the best move against each defender.'),
        move: z.string().optional().describe('Pin the matchup to this one move, e.g. "Close Combat"; when omitted, `attacker.moves` is searched instead.'),
        defenders: z
          .array(setSchema)
          .min(1)
          .max(30)
          .describe('1-30 defender sets, each with the same fields as `attacker`; every entry is scored against the same attacker, move set, and field.'),
        field: z
          .object({
            gameType: z.enum(['Singles', 'Doubles']).optional().describe('Doubles spreads damage across targets; default Singles.'),
            weather: z.string().optional().describe('Weather: "Sand", "Sun", "Rain", "Hail", "Snow", "Harsh Sunshine", "Heavy Rain", or "Strong Winds"; default none.'),
            terrain: z.string().optional().describe('Terrain: "Electric", "Grassy", "Psychic", or "Misty"; default none.'),
          })
          .optional()
          .describe('Shared battlefield conditions for every matchup; omit for a neutral Singles field. Side hazards and screens are only available on `calculate_damage`.'),
      },
      outputSchema: {
        attacker: z.string().describe('Canonical species name of the single attacker every matchup was run with.'),
        attackerSpeed: z
          .number()
          .describe('The attacker\u2019s final Speed stat; hoisted here because it is the same for every matchup, and `speed.attackerMovesFirst` compares it against each row\u2019s `speed.defender`.'),
        move: z
          .string()
          .describe('The fixed move both sides were scored with, or the literal "best of moveset" when the tool picked the hardest-hitting move per defender.'),
        matchups: z
          .array(
            z.object({
              defender: z.string().describe('Canonical species name of the defending set.'),
              bestMove: z
                .string()
                .nullable()
                .describe('The hardest-hitting move of the supplied move set against this defender, or null when none of them could be calculated (e.g. every move is unsupported in the dataset).'),
              damageRange: damageRangeSchema,
              koChance: z
                .string()
                .optional()
                .describe('KO chance of `bestMove` against this defender, e.g. "guaranteed OHKO", or an empty string when the calc reports no KO; absent when there is no usable move.'),
              immune: z
                .boolean()
                .describe('True when the best move\u2019s maximum roll is 0 — the defender takes nothing from every move tried, so the matchup is unwinnable with this move set.'),
              speed: z
                .object({
                  defender: z.number().describe('This defender\u2019s final Speed stat.'),
                  attackerMovesFirst: z
                    .boolean()
                    .describe('True when the attacker\u2019s Speed is greater than or equal to the defender\u2019s, so the attacker moves first; from raw Speed stats only, so boosts, items, and paralysis are ignored.'),
                })
                .describe('Who moves first in this matchup, from the two Speed stats alone; the attacker\u2019s side of the comparison is the top-level `attackerSpeed`.'),
            }),
          )
          .describe('One entry per defender, in the order the defenders were supplied.'),
      },
    },
    wrap(
      async (args: {
        attacker: {
          species: string;
          level?: number;
          nature?: string;
          ivs?: Record<string, number>;
          evs?: Record<string, number>;
          item?: string;
          ability?: string;
          boosts?: Record<string, number>;
          status?: string;
          moves?: string[];
        };
        move?: string;
        defenders: {
          species: string;
          level?: number;
          nature?: string;
          ivs?: Record<string, number>;
          evs?: Record<string, number>;
          item?: string;
          ability?: string;
          boosts?: Record<string, number>;
          status?: string;
        }[];
        field?: { gameType?: 'Singles' | 'Doubles'; weather?: string; terrain?: string };
      }) => {
        const gen = 9;
        const dex = getChampionsDex();
        requireExists(dex.species.get(args.attacker.species), 'Pokemon species', args.attacker.species);

        const moveNames = args.move ? [args.move] : (args.attacker.moves ?? []);
        if (moveNames.length === 0) {
          throw new Error('Provide `move`, or `attacker.moves` to pick the best move per defender.');
        }
        for (const mv of moveNames) requireExists(dex.moves.get(mv), 'move', mv);

        const attacker = buildPokemon(gen, args.attacker);
        const field = buildField(args.field ?? {});
        const genCalc = getCalcGen(gen);
        const atkSpe = attacker.stats.spe;

        const matchups: {
          defender: string;
          bestMove: string | null;
          damageRange: [number, number];
          koChance?: string;
          immune: boolean;
          speed: { defender: number; attackerMovesFirst: boolean };
        }[] = [];

        for (const defSpec of args.defenders) {
          requireExists(dex.species.get(defSpec.species), 'Pokemon species', defSpec.species);
          const defender = buildPokemon(gen, defSpec);

          let best: {
            move: string;
            maxDmg: number;
            range: [number, number];
            ko?: string;
          } | null = null;

          for (const mvName of moveNames) {
            const mv = new CalcMove(genCalc, mvName);
            let result;
            try {
              result = calculate(genCalc, attacker, defender, mv, field);
            } catch {
              continue;
            }
            const flat = flatDamage(result.damage);
            const maxDmg = flat.length ? Math.max(...flat) : 0;
            if (best === null || maxDmg > best.maxDmg) {
              let ko: string | undefined;
              try {
                ko = result.kochance().text;
              } catch {
                ko = undefined;
              }
              best = {
                move: mv.name,
                maxDmg,
                range: flat.length ? ([Math.min(...flat), Math.max(...flat)] as [number, number]) : [0, 0],
                ko,
              };
            }
          }

          const defSpe = defender.stats.spe;
          matchups.push({
            defender: defender.name,
            bestMove: best ? best.move : null,
            damageRange: best ? best.range : [0, 0],
            koChance: best?.ko,
            immune: best ? best.maxDmg === 0 : true,
            speed: { defender: defSpe, attackerMovesFirst: atkSpe >= defSpe },
          });
        }

        return ok({
          attacker: attacker.name,
          attackerSpeed: atkSpe,
          move: args.move ?? 'best of moveset',
          matchups,
        });
      },
    ),
  );

  server.registerTool(
    'check_speed',
    {
      title: 'Check Speed against a regulation',
      description:
        'Compute one Pok\u00e9mon\u2019s final Speed and, given a Regulation Set, rank it against that roster at its fastest (252 EV, +Spe nature) and uninvested reference speeds. Speed only: for damage use `calculate_damage` or `calculate_matchups`, and to find the Speed EVs that beat a target use `optimize_evs`. Applies `boosts.spe` (-6..+6) and Choice Scarf \u00d71.5; other items are reported as Speed-neutral, and `regulation` is optional. Returns finalSpeed, modifiers, and outspeeds/conditional/losesTo counts with up to 15 threats each. Read-only and offline; unknown names return an isError.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        species: z.string().describe('Species or form name, e.g. "Dragapult", "Ogerpon-Wellspring".'),
        level: z.number().int().min(1).max(100).default(50).describe('Level 1-100; default 50, matching VGC play.'),
        nature: z.string().optional().describe('Nature name, e.g. "Jolly", "Timid"; default Serious (neutral Speed).'),
        evs: evMap.describe('EVs keyed by stat id; only `spe` (0-252) changes the result, e.g. { spe: 252 }.'),
        championsPoints: championsPointsMap.describe(
          'The same Speed investment in Pok\u00e9mon Champions stat points, e.g. { spe: 32 } for a maxed Speed stat; give this or `evs`, not both.',
        ),
        ivs: ivMap.describe('IVs keyed by stat id; only `spe` (0-31) changes the result, and it defaults to 31.'),
        boosts: boostMap.describe('Stat stages; only `spe` (-6..+6) is applied, e.g. { spe: 1 } for a +1 Speed stage.'),
        item: z.string().optional().describe('Held item, e.g. "Choice Scarf"; only Choice Scarf multiplies Speed (\u00d71.5), other items are listed as speed-neutral.'),
        regulation: z
          .string()
          .optional()
          .describe('Regulation Set name or id from `list_regulations` to compare against, e.g. "Regulation Set G"; omit to get the raw Speed only.'),
      },
      outputSchema: {
        species: z.string().describe('Canonical species name the Speed belongs to, e.g. "Dragapult".'),
        level: z.number().int().describe('Level the Speed was computed at, 1-100.'),
        nature: z.string().describe('Nature applied Speed, e.g. "Jolly" for +Spe; Serious when the call omitted one.'),
        baseSpe: z.number().describe('The species\u2019 base Speed stat, before level, IVs, EVs, nature, item, and boosts.'),
        evSpe: z.number().int().describe('Speed EVs invested, 0-252.'),
        ivSpe: z.number().int().describe('Speed IV used, 0-31.'),
        finalSpeed: z
          .number()
          .int()
          .describe('The final Speed stat after level, IVs, EVs, nature, Speed stage, and item; this is the number turn order compares.'),
        modifiers: z
          .array(z.string())
          .describe('Human-readable list of everything that changed the Speed stat, e.g. ["Speed stage +1", "Choice Scarf x1.5"]; a speed-neutral item is noted here too, and the list is empty when nothing applied.'),
        comparison: z
          .object({
            regulation: z.string().describe('Canonical name of the Regulation Set this Speed was ranked against.'),
            yourSpeed: z.number().describe('Your final Speed, repeated so the comparison reads on its own.'),
            outspeeds: z
              .object({
                count: z.number().int().describe('How many eligible species you outspeed even at their fastest.'),
                threats: z
                  .array(
                    z.object({
                      species: z.string().describe('A species you outspeed.'),
                      baseSpe: z.number().describe('Its base Speed stat, for a quick sense of the gap.'),
                      maxSpe: z.number().describe('Its fastest possible Speed at this level (252 Speed EVs, +Spe nature), which your Speed still beats.'),
                    }),
                  )
                  .describe('Up to 15 of the species you always outspeed, fastest first; check `count` for the full total.'),
              })
              .describe('Roster species you move before no matter how they invest.'),
            conditional: z
              .object({
                count: z.number().int().describe('How many eligible species sit in the overlap band between your Speed and their range.'),
                threats: z
                  .array(
                    z.object({
                      species: z.string().describe('A species whose Speed can be either side of yours.'),
                      baseSpe: z.number().describe('Its base Speed stat.'),
                      maxSpe: z.number().describe('Its fastest possible Speed at this level (252 Speed EVs, +Spe nature), above your Speed.'),
                      minSpe: z.number().describe('Its Speed with no investment (0 EVs, neutral nature), below your Speed.'),
                    }),
                  )
                  .describe('Up to 15 of those species, fastest first; you beat an uninvested one but lose to a fully invested one.'),
              })
              .describe('Species whose Speed straddles yours, so the order depends on their spread.'),
            losesTo: z
              .object({
                count: z.number().int().describe('How many eligible species are still faster than you even when they invest nothing.'),
                threats: z
                  .array(
                    z.object({
                      species: z.string().describe('A species that outspeeds you.'),
                      baseSpe: z.number().describe('Its base Speed stat.'),
                      minSpe: z.number().describe('Its Speed with no investment (0 EVs, neutral nature), still above your Speed.'),
                    }),
                  )
                  .describe('Up to 15 of those species, highest Speed first; `count` gives the full total.'),
              })
              .describe('Roster species you cannot outrun even when they are uninvested.'),
          })
          .optional()
          .describe('Present only when `regulation` was supplied: how this Speed places against that roster, whose threat lists are each capped at 15 entries.'),
      },
    },
    wrap(
      async (args: {
        species: string;
        level: number;
        nature?: string;
        evs?: Record<string, number>;
        championsPoints?: Record<string, number>;
        ivs?: Record<string, number>;
        boosts?: Record<string, number>;
        item?: string;
        regulation?: string;
      }) => {
        const gen = 9;
        const dex = getChampionsDex();
        const sp = dex.species.get(args.species);
        requireExists(sp, 'Pokemon species', args.species);

        const nature = args.nature ?? 'Serious';
        requireExists(dex.natures.get(nature), 'nature', nature);

        const speEV = resolveEvs(args.evs, args.championsPoints).spe ?? 0;
        const speIV = args.ivs?.spe ?? 31;
        const boost = args.boosts?.spe ?? 0;
        if (speEV < 0 || speEV > 252) throw new Error('EV "spe" must be 0-252.');
        if (speIV < 0 || speIV > 31) throw new Error('IV "spe" must be 0-31.');
        if (boost < -6 || boost > 6) throw new Error('Boost "spe" must be -6..6.');

        let speed = finalStat(gen, 'spe', sp.baseStats.spe, speIV, speEV, args.level, nature);
        const modifiers: string[] = [];
        if (boost !== 0) {
          speed = Math.floor(speed * boostMult(boost));
          modifiers.push(`Speed stage ${boost > 0 ? '+' : ''}${boost}`);
        }
        if (args.item) {
          const it = dex.items.get(args.item);
          requireExists(it, 'item', args.item);
          if (it.id === 'choicescarf') {
            speed = Math.floor(speed * 1.5);
            modifiers.push('Choice Scarf x1.5');
          } else {
            modifiers.push(`item "${it.name}" (no speed effect)`);
          }
        }

        let comparison: {
          regulation: string;
          yourSpeed: number;
          outspeeds: { count: number; threats: { species: string; baseSpe: number; maxSpe: number }[] };
          conditional: { count: number; threats: { species: string; baseSpe: number; maxSpe: number; minSpe: number }[] };
          losesTo: { count: number; threats: { species: string; baseSpe: number; minSpe: number }[] };
        } | undefined;

        if (args.regulation) {
          const set = getRegulationSet(args.regulation);
          if (!set) throw new Error(`Unknown regulation set "${args.regulation}".`);
          const outspeeds: { species: string; baseSpe: number; maxSpe: number }[] = [];
          const conditional: { species: string; baseSpe: number; maxSpe: number; minSpe: number }[] = [];
          const losesTo: { species: string; baseSpe: number; minSpe: number }[] = [];
          for (const name of set.eligibleSpecies) {
            const s = dex.species.get(name);
            if (!s.exists) continue;
            const base = s.baseStats.spe;
            const maxSpe = finalStat(gen, 'spe', base, 31, 252, args.level, 'Jolly');
            const minSpe = finalStat(gen, 'spe', base, 31, 0, args.level, 'Serious');
            if (speed > maxSpe) outspeeds.push({ species: s.name, baseSpe: base, maxSpe });
            else if (speed < minSpe) losesTo.push({ species: s.name, baseSpe: base, minSpe });
            else conditional.push({ species: s.name, baseSpe: base, maxSpe, minSpe });
          }
          const byMax = (a: { maxSpe: number }, b: { maxSpe: number }) => b.maxSpe - a.maxSpe;
          outspeeds.sort(byMax);
          conditional.sort(byMax);
          losesTo.sort((a, b) => b.minSpe - a.minSpe);
          comparison = {
            regulation: set.name,
            yourSpeed: speed,
            outspeeds: { count: outspeeds.length, threats: outspeeds.slice(0, 15) },
            conditional: { count: conditional.length, threats: conditional.slice(0, 15) },
            losesTo: { count: losesTo.length, threats: losesTo.slice(0, 15) },
          };
        }

        return ok({
          species: sp.name,
          level: args.level,
          nature,
          baseSpe: sp.baseStats.spe,
          evSpe: speEV,
          ivSpe: speIV,
          finalSpeed: speed,
          modifiers,
          comparison,
        });
      },
    ),
  );

  server.registerTool(
    'optimize_evs',
    {
      title: 'Optimize EVs for a goal',
      description:
        'Derive a minimal EV spread for one Pok\u00e9mon satisfying up to three goals: survive a named attack, outspeed a target Speed, and guarantee a KO in 1-4 hits. Use it when EVs must come from a goal \u2014 `calculate_stats` evaluates a spread you already have, `check_speed` ranks Speed without deriving EVs, and `get_set` returns a curated spread. Supplying none of survive/outspeed/kill errors; `outspeed` takes a set `target` or a raw `speed`, and leftover EVs fill `maximize` (default spe). Returns the spread, resulting stats, totalEVs/unusedEVs of the 508 usable, and a verification line per goal. Read-only and offline; an unreachable goal returns an isError.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        species: z.string().describe('Species or form name to optimize, e.g. "Garchomp", "Incineroar".'),
        level: z.number().int().min(1).max(100).default(50).describe('Level 1-100; default 50 (VGC), where bulk and Speed benchmarks are tightest.'),
        nature: z
          .string()
          .optional()
          .describe('Nature used for every stat calculation, e.g. "Adamant", "Calm"; default Serious. Change it to trade one stat for another.'),
        ivs: ivMap.describe('IVs to hold fixed while searching, keyed by stat id; omitted stats default to 31 (use 0 for a Trick Room Speed IV).'),
        item: z.string().optional().describe('Item held while solving, e.g. "Assault Vest"; it changes the bulk or Speed the goals are tested against.'),
        ability: z.string().optional().describe('Ability assumed active while solving, e.g. "Intimidate", "Protosynthesis".'),
        survive: z
          .object({
            attacker: setSchema.describe('The attacker whose move must be survived; the calc picks Defense or SpD from the move\u2019s category. Set its `level` to match the optimized Pok\u00e9mon\u2019s, since a nested set defaults to level 100.'),
            move: z.string().describe('Move being survived, e.g. "Close Combat"; a valid move name is required.'),
          })
          .optional()
          .describe('Add a "always live this hit" goal: the search minimizes HP plus the relevant Defense EVs that keep the worst roll below max HP.'),
        outspeed: z
          .object({
            target: setSchema
              .optional()
              .describe('Set to outspeed, e.g. {"species": "Dragapult", "nature": "Jolly", "evs": {"spe": 252}}; its computed Speed becomes the benchmark. Give it the same `level` as the optimized Pok\u00e9mon, since a nested set defaults to level 100.'),
            speed: z.number().int().min(1).optional().describe('Raw Speed number to beat when there is no full target set, e.g. 189.'),
          })
          .optional()
          .describe('Add an outspeed goal: supply `target` or `speed` (one is required here, otherwise that goal errors).'),
        kill: z
          .object({
            target: setSchema.describe('The defender that must be KOed, including its bulk EVs, item, and ability; give it the same `level` as the optimized Pok\u00e9mon, since a nested set defaults to level 100.'),
            move: z.string().describe('Move used for the KO, e.g. "Knock Off"; its category decides whether Atk or SpA EVs are minimized.'),
            hits: z.number().int().min(1).max(4).default(1).describe('Number of hits the move must KO in, 1-4 (default 1); each hit must reach target max HP / hits.'),
          })
          .optional()
          .describe('Add a KO goal: minimizes Atk or SpA so that even the lowest damage roll reaches the per-hit HP threshold.'),
        maximize: z
          .enum(['atk', 'spa', 'spe', 'hp', 'def', 'spd'])
          .default('spe')
          .describe('Stat that receives leftover EVs after the goals are met, capped at 252 (default spe); EVs are added in steps of 4.'),
        field: z
          .object({
            gameType: z.enum(['Singles', 'Doubles']).optional().describe('Doubles spreads damage across targets; default Singles.'),
            weather: z.string().optional().describe('Weather for the survive/kill calcs, e.g. "Sun", "Rain", "Sand"; default none.'),
            terrain: z.string().optional().describe('Terrain for the survive/kill calcs: "Electric", "Grassy", "Psychic", or "Misty"; default none.'),
          })
          .optional()
          .describe('Battlefield conditions applied while testing the survive and kill goals; omit for a neutral Singles field.'),
      },
      outputSchema: {
        species: z.string().describe('Canonical species name the spread was solved for.'),
        level: z.number().int().describe('Level every stat was computed at, 1-100.'),
        nature: z.string().describe('Nature the spread was solved with, e.g. "Adamant"; Serious when the call omitted one.'),
        item: z.string().optional().describe('Held item assumed while solving, as supplied; absent when the call gave none.'),
        evs: statBlock('EV assigned to', 'The solved spread: all six keys, each a multiple of 4 from 0 to 252, with the `maximize` stat holding the leftover EVs.'),
        championsPoints: reportedChampionsPoints,
        stats: statBlock('Final', 'The six stats this exact spread reaches at this level and nature; recompute with `calculate_stats` to check a different spread.'),
        totalEVs: z.number().int().describe('Sum of the six solved EVs, spent in multiples of 4 so 508 is the practical maximum.'),
        unusedEVs: z.number().int().describe('EVs left over after the goals and the maximize step: 508 minus `totalEVs`, never negative.'),
        verification: z
          .array(z.string())
          .describe('One line per goal that was solved, e.g. "survive: Dragapult Dragon Darts -> 96-114 vs 175 HP (max 65%)" or "kill: 132 ATK EVs -> 187-221 vs 175 HP (min 100%)"; the evidence that the spread meets each goal.'),
        note: z
          .string()
          .describe('Caveat about how the spread was built: EVs come in steps of 4 (508 usable of 510), the maximize stat is capped at 252, and unused EVs can be reallocated by hand.'),
      },
    },
    wrap(
      async (args: {
        species: string;
        level: number;
        nature?: string;
        ivs?: Record<string, number>;
        item?: string;
        ability?: string;
        survive?: { attacker: SetInput; move: string };
        outspeed?: { target?: SetInput; speed?: number };
        kill?: { target: SetInput; move: string; hits: number };
        maximize: 'atk' | 'spa' | 'spe' | 'hp' | 'def' | 'spd';
        field?: { gameType?: 'Singles' | 'Doubles'; weather?: string; terrain?: string };
      }) => {
        const gen = 9;
        const dex = getChampionsDex();
        const sp = dex.species.get(args.species);
        requireExists(sp, 'Pokemon species', args.species);
        const nature = args.nature ?? 'Serious';
        requireExists(dex.natures.get(nature), 'nature', nature);

        if (!args.survive && !args.outspeed && !args.kill) {
          throw new Error('Provide at least one goal: survive, outspeed, or kill.');
        }

        const ivs: Record<string, number> = {};
        for (const st of STATS) ivs[st] = args.ivs?.[st] ?? 31;

        const genCalc = getCalcGen(gen);
        const field = buildField(args.field ?? {});
        const base: SetInput = {
          species: args.species,
          level: args.level,
          nature,
          ivs,
          item: args.item,
          ability: args.ability,
        };
        const build = (evs: Record<string, number>) => buildPokemon(gen, { ...base, evs });

        const required: Record<string, number> = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
        const verification: string[] = [];

        if (args.survive) {
          const mv = dex.moves.get(args.survive.move);
          requireExists(mv, 'move', args.survive.move);
          const atk = buildPokemon(gen, args.survive.attacker);
          const calcMv = new CalcMove(genCalc, args.survive.move);
          const defStat = mv.category === 'Special' ? 'spd' : 'def';
          let best: { total: number; hp: number; d: number } | null = null;
          let range: [number, number] = [0, 0];
          let hp0 = 0;
          for (let hp = 0; hp <= 252; hp += 4) {
            for (let d = 0; d <= 252; d += 4) {
              const defender = build({ hp, [defStat]: d });
              const res = calculate(genCalc, atk, defender, calcMv, field);
              const r = res.range();
              if (r[1] < defender.maxHP()) {
                if (best === null || hp + d < best.total) {
                  best = { total: hp + d, hp, d };
                  range = r;
                  hp0 = defender.maxHP();
                }
                break;
              }
            }
          }
          if (best === null) {
            throw new Error(`Cannot survive ${args.survive.attacker.species} ${args.survive.move} even with 252 HP / 252 ${defStat.toUpperCase()}.`);
          }
          required.hp = Math.max(required.hp, best.hp);
          required[defStat] = Math.max(required[defStat], best.d);
          verification.push(
            `survive: ${args.survive.attacker.species} ${args.survive.move} -> ${range[0]}-${range[1]} vs ${hp0} HP (max ${Math.round((range[1] / hp0) * 100)}%)`,
          );
        }

        if (args.outspeed) {
          let targetSpeed: number;
          if (args.outspeed.target) {
            requireExists(dex.species.get(args.outspeed.target.species), 'Pokemon species', args.outspeed.target.species);
            targetSpeed = buildPokemon(gen, args.outspeed.target).stats.spe;
          } else if (args.outspeed.speed) {
            targetSpeed = args.outspeed.speed;
          } else {
            throw new Error('outspeed requires `target` or `speed`.');
          }
          let minEv = -1;
          for (let e = 0; e <= 252; e += 4) {
            if (finalStat(gen, 'spe', sp.baseStats.spe, ivs.spe, e, args.level, nature) > targetSpeed) {
              minEv = e;
              break;
            }
          }
          if (minEv < 0) throw new Error(`Cannot outspeed ${targetSpeed} with this nature/IV.`);
          required.spe = Math.max(required.spe, minEv);
          verification.push(`outspeed: ${minEv} Speed EVs -> ${finalStat(gen, 'spe', sp.baseStats.spe, ivs.spe, minEv, args.level, nature)} > ${targetSpeed}`);
        }

        if (args.kill) {
          const mv = dex.moves.get(args.kill.move);
          requireExists(mv, 'move', args.kill.move);
          const target = buildPokemon(gen, args.kill.target);
          const calcMv = new CalcMove(genCalc, args.kill.move);
          const offStat = mv.category === 'Special' ? 'spa' : 'atk';
          const needPerHit = Math.ceil(target.maxHP() / args.kill.hits);
          let minEv = -1;
          let range: [number, number] = [0, 0];
          for (let e = 0; e <= 252; e += 4) {
            const attacker = build({ [offStat]: e });
            const res = calculate(genCalc, attacker, target, calcMv, field);
            const r = res.range();
            if (r[0] >= needPerHit) {
              minEv = e;
              range = r;
              break;
            }
          }
          if (minEv < 0) throw new Error(`Cannot guarantee a ${args.kill.hits}-hit KO on ${args.kill.target.species}.`);
          required[offStat] = Math.max(required[offStat], minEv);
          verification.push(`kill: ${minEv} ${offStat.toUpperCase()} EVs -> ${range[0]}-${range[1]} vs ${target.maxHP()} HP (min ${Math.round((range[0] / target.maxHP()) * 100)}%)`);
        }

        const used = STATS.reduce((s, st) => s + (required[st] ?? 0), 0);
        const remaining = Math.max(0, 510 - used);
        const add = Math.min(252 - (required[args.maximize] ?? 0), Math.floor(remaining / 4) * 4);
        required[args.maximize] = (required[args.maximize] ?? 0) + add;

        const finalStats: Record<string, number> = {};
        for (const st of STATS) {
          finalStats[st] = finalStat(gen, st, sp.baseStats[st], ivs[st], required[st], args.level, nature);
        }

        return ok({
          species: sp.name,
          level: args.level,
          nature,
          item: args.item,
          evs: required,
          championsPoints: evsToChampionsPoints(required),
          stats: finalStats,
          totalEVs: STATS.reduce((s, st) => s + required[st], 0),
          unusedEVs: Math.max(0, 508 - STATS.reduce((s, st) => s + required[st], 0)),
          verification,
          note: 'EVs are computed in steps of 4 (508 usable of 510). The maximize stat is capped at 252; unused EVs can be reallocated manually.',
        });
      },
    ),
  );
}
