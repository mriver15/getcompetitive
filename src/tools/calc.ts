/**
 * Battle mechanics tools: stat calculation, damage calculation, speed tiers.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Move as CalcMove, calculate } from '@smogon/calc';
import { normalizeGen, getDex, statTable, damageResult, finalStat, buildPokemon, buildField, getCalcGen, STATS, type SetInput } from '../dex.js';
import { getRegulationSet } from '../regulations.js';
import { ok, wrap, requireExists } from '../result.js';

const genSchema = z.number().int().min(1).max(9).default(9);
const statMap = z.record(z.string(), z.number()).optional();

const setSchema = z.object({
  species: z.string(),
  level: z.number().int().min(1).max(100).optional(),
  nature: z.string().optional(),
  ivs: statMap,
  evs: statMap,
  item: z.string().optional(),
  ability: z.string().optional(),
  boosts: statMap,
  status: z.string().optional(),
  teraType: z.string().optional(),
  abilityOn: z.boolean().optional(),
  isDynamaxed: z.boolean().optional(),
  curHP: z.number().optional(),
  moves: z.array(z.string()).optional(),
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

export function registerCalcTools(server: McpServer) {
  server.registerTool(
    'calculate_stats',
    {
      description:
        'Compute a Pokemon\u2019s final stats at a given level with chosen EVs, IVs, and nature. Returns all six stats plus base stats and BST for reference. This is the canonical in-game formula (level, IV, EV, nature).',
      inputSchema: {
        species: z.string(),
        level: z.number().int().min(1).max(100).default(50),
        nature: z.string().optional(),
        evs: statMap,
        ivs: statMap,
        generation: genSchema,
      },
    },
    wrap(
      async (args: {
        species: string;
        level: number;
        nature?: string;
        evs?: Record<string, number>;
        ivs?: Record<string, number>;
        generation: number;
      }) => {
        const gen = normalizeGen(args.generation);
        const dex = getDex(gen);
        const s = dex.species.get(args.species);
        requireExists(s, 'Pokemon species', args.species);

        const ivs: Record<string, number> = {};
        const evs: Record<string, number> = {};
        for (const st of STATS) {
          ivs[st] = args.ivs?.[st] ?? 31;
          evs[st] = args.evs?.[st] ?? 0;
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
          generation: gen,
          level: args.level,
          nature: nature,
          baseStats: s.baseStats,
          bst: s.bst,
          evs,
          ivs,
          stats,
        });
      },
    ),
  );

  server.registerTool(
    'calculate_damage',
    {
      description:
        'Run a full damage calculation between two Pokemon using the Smogon battle calculator. Specify attacker and defender sets (species, level, EVs, IVs, nature, item, ability, boosts, status, Tera type), the move, and optional field conditions (weather, terrain, game type, side hazards/screens). Returns the damage range, KO chance, a human-readable summary, and both Pokemon\u2019s computed stats.',
      inputSchema: {
        attacker: setSchema,
        defender: setSchema,
        move: z.string(),
        field: z
          .object({
            gameType: z.enum(['Singles', 'Doubles']).optional(),
            weather: z.string().optional(),
            terrain: z.string().optional(),
            attackerSide: z.record(z.string(), z.unknown()).optional(),
            defenderSide: z.record(z.string(), z.unknown()).optional(),
          })
          .optional(),
        generation: genSchema,
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
          teraType?: string;
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
          teraType?: string;
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
        generation: number;
      }) => {
        const gen = normalizeGen(args.generation);
        // Validate species + move names for helpful errors before the calc throws.
        const dex = getDex(gen);
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
    'calc_matchups',
    {
      description:
        'Batch damage calculation: one attacker (optionally with a moveset) against a list of defenders. For each defender, picks the attacking move that deals the most damage and returns the damage range, KO chance, immunity, and who moves first. Runs many matchups in one call instead of repeated calculate_damage calls.',
      inputSchema: {
        attacker: setSchema,
        move: z.string().optional(),
        defenders: z.array(setSchema).min(1).max(30),
        field: z
          .object({
            gameType: z.enum(['Singles', 'Doubles']).optional(),
            weather: z.string().optional(),
            terrain: z.string().optional(),
          })
          .optional(),
        generation: genSchema,
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
          teraType?: string;
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
          teraType?: string;
        }[];
        field?: { gameType?: 'Singles' | 'Doubles'; weather?: string; terrain?: string };
        generation: number;
      }) => {
        const gen = normalizeGen(args.generation);
        const dex = getDex(gen);
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
          description: string;
          immune: boolean;
          speed: { attacker: number; defender: number; attackerMovesFirst: boolean };
        }[] = [];

        for (const defSpec of args.defenders) {
          requireExists(dex.species.get(defSpec.species), 'Pokemon species', defSpec.species);
          const defender = buildPokemon(gen, defSpec);

          let best: {
            move: string;
            maxDmg: number;
            range: [number, number];
            desc: string;
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
              let desc = '';
              let ko: string | undefined;
              try {
                desc = result.desc();
                ko = result.kochance().text;
              } catch {
                desc = `${attacker.name} ${mv.name} vs. ${defender.name}: 0 damage (immune).`;
              }
              best = {
                move: mv.name,
                maxDmg,
                range: flat.length ? ([Math.min(...flat), Math.max(...flat)] as [number, number]) : [0, 0],
                desc,
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
            description: best ? best.desc : 'No damage-dealing move resolved.',
            immune: best ? best.maxDmg === 0 : true,
            speed: { attacker: atkSpe, defender: defSpe, attackerMovesFirst: atkSpe >= defSpe },
          });
        }

        return ok({
          generation: gen,
          attacker: attacker.name,
          move: args.move ?? 'best of moveset',
          matchups,
        });
      },
    ),
  );

  server.registerTool(
    'speed_check',
    {
      description:
        'Compute a Pokemon\u2019s final Speed (nature, EVs, IVs, stat boosts, Choice Scarf), then compare it against a Regulation Set\u2019s legal roster at two reference investment levels: max (252 EV, +Spe nature) and uninvested (0 EV, neutral). Returns what you outspeed, what you conditionally tie, and what outspeeds you.',
      inputSchema: {
        species: z.string(),
        level: z.number().int().min(1).max(100).default(50),
        nature: z.string().optional(),
        evs: statMap,
        ivs: statMap,
        boosts: statMap,
        item: z.string().optional(),
        regulation: z.string().optional(),
        generation: genSchema,
      },
    },
    wrap(
      async (args: {
        species: string;
        level: number;
        nature?: string;
        evs?: Record<string, number>;
        ivs?: Record<string, number>;
        boosts?: Record<string, number>;
        item?: string;
        regulation?: string;
        generation: number;
      }) => {
        const gen = normalizeGen(args.generation);
        const dex = getDex(gen);
        const sp = dex.species.get(args.species);
        requireExists(sp, 'Pokemon species', args.species);

        const nature = args.nature ?? 'Serious';
        requireExists(dex.natures.get(nature), 'nature', nature);

        const speEV = args.evs?.spe ?? 0;
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
          generation: gen,
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
      description:
        'Find an EV spread for a Pokemon that satisfies up to three goals: survive a specific attack (minimize HP+Def/SpD EVs to always live), outspeed a target (minimize Speed EVs), and guarantee a KO (minimize Atk/SpA EVs). Leftover EVs go into the maximize stat. Returns the recommended spread plus verification damage/speed numbers. Set level 50 for VGC.',
      inputSchema: {
        species: z.string(),
        level: z.number().int().min(1).max(100).default(50),
        nature: z.string().optional(),
        ivs: statMap,
        item: z.string().optional(),
        ability: z.string().optional(),
        survive: z.object({ attacker: setSchema, move: z.string() }).optional(),
        outspeed: z
          .object({ target: setSchema.optional(), speed: z.number().int().min(1).optional() })
          .optional(),
        kill: z.object({ target: setSchema, move: z.string(), hits: z.number().int().min(1).max(4).default(1) }).optional(),
        maximize: z.enum(['atk', 'spa', 'spe', 'hp', 'def', 'spd']).default('spe'),
        field: z
          .object({
            gameType: z.enum(['Singles', 'Doubles']).optional(),
            weather: z.string().optional(),
            terrain: z.string().optional(),
          })
          .optional(),
        generation: genSchema,
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
        generation: number;
      }) => {
        const gen = normalizeGen(args.generation);
        const dex = getDex(gen);
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
          generation: gen,
          level: args.level,
          nature,
          item: args.item,
          evs: required,
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
