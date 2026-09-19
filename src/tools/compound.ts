/**
 * The compound surface: eight intent-level tools over the full engine.
 *
 * Every specialized tool's schema and handler are registered onto a throwaway
 * capture server — so the 30 underlying definitions stay exactly where they
 * are, validated as before — and this module re-exposes them as eight
 * entrypoints, each dispatching on a `mode` field (or, for single-purpose
 * tools, taking the absorbed tool's arguments directly). The model picks an
 * intent; the server does the orchestration.
 *
 *     lookup          one data lookup      (species/forms/search/move/item/
 *                                          ability/nature/learnset/type/
 *                                          matchup/sprites)
 *     calculate       one battle calc      (stats/damage/matchups/speed/
 *                                          optimize_evs)
 *     analyze_team    team analysis        (synergy/diagnose)
 *     optimize_team   fill team slots
 *     prepare_matchup pre-game dossier
 *     analyze_battle  post-game / scouting (replay/infer)
 *     analyze_meta    the meta             (threats/compare/set)
 *     team_io         team import/export   (parse/format/legality/
 *                                          regulation/regulations)
 */
import { z } from 'zod';
import type { ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { getObjectShape } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { registerDataTools } from './data.js';
import { registerCalcTools } from './calc.js';
import { registerRegulationTools } from './regulations.js';
import { registerAnalyzeTools } from './analyze.js';
import { registerMetaTools } from './meta.js';
import { registerTeamTools } from './team.js';
import { registerDoctorTool } from './doctor.js';
import { registerMatchupTool } from './matchup.js';
import { registerSpritesTool } from './sprites.js';
import { registerReplayTool } from './replay.js';
import { registerInferTool } from './infer.js';
import { registerOptimizeTeamTool } from './optimize.js';
import { READ_ONLY_ANNOTATIONS } from '../result.js';
import { detailArg, applyLevel, LEVEL_SPECS } from './levels.js';

interface CapturedTool {
  title?: string;
  description?: string;
  inputSchema: z.ZodTypeAny;
  outputSchema?: z.ZodTypeAny;
  handler: (args: Record<string, unknown>) => CallToolResult | Promise<CallToolResult>;
}

/** mode -> underlying tool name, per compound entrypoint. */
const COMPOUND: Record<string, Record<string, string>> = {
  lookup: {
    species: 'get_pokemon',
    forms: 'list_forms',
    search: 'search_dex',
    move: 'get_move',
    item: 'get_item',
    ability: 'get_ability',
    nature: 'get_nature',
    learnset: 'get_learnset',
    type: 'get_type',
    matchup: 'get_type_matchup',
    sprites: 'get_sprites',
  },
  calculate: {
    stats: 'calculate_stats',
    damage: 'calculate_damage',
    matchups: 'calculate_matchups',
    speed: 'check_speed',
    optimize_evs: 'optimize_evs',
  },
  analyze_team: {
    synergy: 'analyze_team',
    diagnose: 'diagnose_team',
  },
  analyze_battle: {
    replay: 'analyze_replay',
    infer: 'infer_set',
  },
  analyze_meta: {
    threats: 'list_threats',
    compare: 'compare_meta',
    set: 'get_set',
  },
  team_io: {
    parse: 'parse_team',
    format: 'format_team',
    legality: 'check_legality',
    regulation: 'get_regulation',
    regulations: 'list_regulations',
  },
};

/** Single-purpose compounds take the absorbed tool's arguments directly. */
const PLAIN: Record<string, string> = {
  optimize_team: 'optimize_team',
  prepare_matchup: 'prepare_matchup',
};

const DESCRIPTIONS: Record<string, string> = {
  lookup:
    'One data lookup, dispatching on `mode`: "species" for one Pok\u00e9mon\u2019s profile, "forms" for its forms, "search" for a fuzzy name search across the dataset, "move"/"item"/"ability"/"nature"/"learnset" for those records, "type" for a type\u2019s defensive profile, "matchup" for one type multiplier, and "sprites" for a whole team\u2019s sprite URLs in one call. Each mode carries the same documented fields the dedicated lookup tools had; pick the mode that names the thing being looked up and pass its arguments. Read-only and offline over the bundled dataset.',
  calculate:
    'One battle calculation, dispatching on `mode`: "stats" for a final stat table, "damage" for a full single-attack simulation, "matchups" to test one attacker against many defenders, "speed" to place a Speed stat against a regulation roster, and "optimize_evs" to derive a minimal spread from goals (survive, outspeed, KO). Each mode carries the same documented fields the dedicated calc tools had. Read-only and offline; deterministic.',
  analyze_team:
    'Team analysis, dispatching on `mode`: "synergy" for the type-synergy read (stacked weaknesses, coverage gaps, speed placement, heuristic score, and battle-math `answerClass` verdicts against the meta when a regulation and moves are supplied), "diagnose" for the coaching read ("fix my team": problems with evidence, then concrete spread/move/item/member changes). Each mode carries the same documented fields the dedicated tools had. Read-only and offline.',
  analyze_battle:
    'Battle analysis, dispatching on `mode`: "replay" turns a Showdown-format battle log into a deterministic post-match read (teams, KOs, observed Speed order, damage percentages, type read), "infer" runs reverse constraint solving on battle observations to narrow an opponent\u2019s set. Each mode carries the same documented fields the dedicated tools had. Read-only and offline.',
  analyze_meta:
    'Meta intelligence, dispatching on `mode`: "threats" for the usage-ranked threat list, "compare" for the two-window usage deltas and emerging cores, "set" for one species\u2019 most-played standard set (batched). Each mode carries the same documented fields the dedicated tools had. Read-only and offline; usage-derived from measured tournament data.',
  team_io:
    'Team import/export and validation, dispatching on `mode`: "parse" turns pasted text into the canonical team shape, "format" renders a canonical team back into paste text, "legality" checks a team against a regulation\u2019s rules, "regulation" reads one regulation\u2019s rules (rosters optional), "regulations" lists them all. Each mode carries the same documented fields the dedicated tools had. Read-only and offline.',
};

function capture(): Record<string, CapturedTool> {
  const server = new McpServer({ name: 'capture', version: '0' });
  registerDataTools(server);
  registerCalcTools(server);
  registerRegulationTools(server);
  registerAnalyzeTools(server);
  registerMetaTools(server);
  registerTeamTools(server);
  registerDoctorTool(server);
  registerMatchupTool(server);
  registerSpritesTool(server);
  registerReplayTool(server);
  registerInferTool(server);
  registerOptimizeTeamTool(server);
  // SDK-internal map, populated by registerTool with the zod raw shapes and
  // wrapped handlers this module dispatches through; pinned by the smoke suite.
  type RegisteredToolsMap = Record<string, CapturedTool>;
  const registeredTools = (server as unknown as { _registeredTools: RegisteredToolsMap })._registeredTools;
  return registeredTools;
}

export function registerCompoundTools(server: McpServer) {
  const defs = capture();

  for (const [plainName, target] of Object.entries(PLAIN)) {
    const def = defs[target];
    server.registerTool(
      plainName,
      {
        title: def.title,
        description: def.description,
        inputSchema: z.object({ detail: detailArg, ...(getObjectShape(def.inputSchema) as ZodRawShapeCompat) }),
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async (args) => {
        type PlainArgs = { detail?: string } & Record<string, unknown>;
        const parsed = args as PlainArgs;
        const result = await def.handler(parsed);
        if (result.structuredContent && def.outputSchema) {
          const check = def.outputSchema.safeParse(result.structuredContent);
          if (!check.success) {
            throw new Error(`produced output outside its schema: ${JSON.stringify(check.error).slice(0, 200)}`);
          }
        }
        if (result.structuredContent && !result.isError) {
          const shaped = applyLevel(LEVEL_SPECS[target], result.structuredContent, parsed.detail, target);
          if (shaped !== result.structuredContent) {
            return { content: [{ type: 'text', text: JSON.stringify(shaped, null, 2) }], structuredContent: shaped };
          }
        }
        return result;
      },
    );
  }

  for (const [name, modes] of Object.entries(COMPOUND)) {
    const modeNames = Object.keys(modes);
    const variants = modeNames.map((mode) =>
      z.object({
        mode: z.literal(mode).describe(`Run ${modes[mode]}'s operation.`),
        detail: detailArg,
        ...(getObjectShape(defs[modes[mode]].inputSchema) as ZodRawShapeCompat),
      }),
    ) as unknown as [z.ZodTypeAny, ...z.ZodTypeAny[]];
    const inputSchema = z.union(variants);
    server.registerTool(
      name,
      {
        title: name
          .split('_')
          .map((w) => w[0].toUpperCase() + w.slice(1))
          .join(' '),
        description: DESCRIPTIONS[name],
        inputSchema,
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async (args) => {
        // registerTool cannot infer argument types from a full-schema inputSchema,
        // so the discriminated union's contract is restated here.
        type CompoundArgs = { mode: string; detail?: string } & Record<string, unknown>;
        const parsed = args as CompoundArgs;
        const def = defs[modes[parsed.mode]];
        const result = await def.handler(parsed);
        // The captured mode schema validates the result exactly as the dedicated
        // tool's output schema did. It is applied here rather than as a compound
        // outputSchema: the SDK's compat layer routes zod-v4 schemas through its
        // bundled mini-zod, which cannot parse a union of mixed-instance objects.
        if (result.structuredContent && def.outputSchema) {
          const check = def.outputSchema.safeParse(result.structuredContent);
          if (!check.success) {
            throw new Error(`mode ${parsed.mode} produced output outside its schema: ${JSON.stringify(check.error).slice(0, 200)}`);
          }
        }
        if (result.structuredContent && !result.isError) {
          const shaped = applyLevel(LEVEL_SPECS[modes[parsed.mode]], result.structuredContent, parsed.detail, parsed.mode);
          if (shaped !== result.structuredContent) {
            return { content: [{ type: 'text', text: JSON.stringify(shaped, null, 2) }], structuredContent: shaped };
          }
        }
        return result;
      },
    );
  }
}
