/**
 * Battle mechanics tools: stat calculation, damage calculation, speed tiers.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { normalizeGen, getDex, statTable, damageResult, STATS } from '../dex.js';
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
});

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
}
