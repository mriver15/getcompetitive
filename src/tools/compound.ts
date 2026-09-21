/**
 * The compound surface: nine intent-level tools over the full engine.
 *
 * Every specialized tool's schema and handler are registered onto a throwaway
 * capture server — so the 30 underlying definitions stay exactly where they
 * are, validated as before — and this module re-exposes them as nine
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
 *     record_set      file a generated set (the one entrypoint that writes)
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
import { registerScoutTool } from './scout.js';
import { READ_ONLY_ANNOTATIONS, WRITE_ANNOTATIONS } from '../result.js';
import { detailArg, applyLevel, LEVEL_SPECS } from './levels.js';
import { viewFor, wrapEnvelope, WORKSPACE_RESOURCE_URI } from '../apps/envelope.js';

interface CapturedTool {
  title?: string;
  description?: string;
  inputSchema: z.ZodTypeAny;
  outputSchema?: z.ZodTypeAny;
  annotations?: typeof READ_ONLY_ANNOTATIONS | typeof WRITE_ANNOTATIONS;
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
    scout: 'scout_opponent',
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
  record_set: 'record_set',
};

const DESCRIPTIONS: Record<string, string> = {
  lookup:
    'Pok00e9mon Champions data lookup, dispatching on `mode`: "species" for one Pok\u00e9mon\u2019s profile, "forms" for its forms, "search" for a fuzzy name search across the dataset, "move"/"item"/"ability"/"nature"/"learnset" for those records, "type" for a type\u2019s defensive profile, "matchup" for one type multiplier, and "sprites" for a whole team\u2019s sprite URLs in one call. Each mode carries the same documented fields the dedicated lookup tools had; pick the mode that names the thing being looked up and pass its arguments. Read-only and offline over the bundled dataset.',
  calculate:
    'Pok00e9mon Champions battle calculation, dispatching on `mode`: "stats" for a final stat table, "damage" for a full single-attack simulation, "matchups" to test one attacker against many defenders, "speed" to place a Speed stat against a regulation roster, and "optimize_evs" to derive a minimal spread from goals (survive, outspeed, KO). Each mode carries the same documented fields the dedicated calc tools had. Read-only and offline; deterministic.',
  analyze_team:
    'Pok00e9mon Champions team analysis, dispatching on `mode`: "synergy" for the type-synergy read (stacked weaknesses, coverage gaps, speed placement, heuristic score, and battle-math `answerClass` verdicts against the meta when a regulation and moves are supplied), "diagnose" for the coaching read ("fix my team": problems with evidence, then concrete spread/move/item/member changes). Each mode carries the same documented fields the dedicated tools had. Read-only and offline.',
  analyze_battle:
    'Pok00e9mon Champions battle analysis, dispatching on `mode`: "replay" turns a Showdown-format battle log into a deterministic post-match read (teams, KOs, observed Speed order, damage percentages, type read), "infer" runs reverse constraint solving on battle observations to narrow an opponent\u2019s set. Each mode carries the same documented fields the dedicated tools had. Read-only and offline.',
  analyze_meta:
    'Pok00e9mon Champions meta intelligence, dispatching on `mode`: "threats" for the usage-ranked threat list, "compare" for the two-window usage deltas and emerging cores, "set" for one species\u2019 most-played standard set (batched). Each mode carries the same documented fields the dedicated tools had. Read-only and offline; usage-derived from measured tournament data.',
  team_io:
    'Pok00e9mon Champions team import/export and validation, dispatching on `mode`: "parse" turns pasted text into the canonical team shape, "format" renders a canonical team back into paste text, "legality" checks a team against a regulation\u2019s rules, "regulation" reads one regulation\u2019s rules (rosters optional), "regulations" lists them all. Each mode carries the same documented fields the dedicated tools had. Read-only and offline.',
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
  registerScoutTool(server);
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
        // The absorbed tool's own annotations, so the one writer on the surface is
        // never advertised as a read.
        annotations: def.annotations ?? READ_ONLY_ANNOTATIONS,
        // App-linked tools point the host at the bundled workspace resource.
        ...(viewFor(plainName) ? { _meta: { ui: { resourceUri: WORKSPACE_RESOURCE_URI } } } : {}),
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
          const text = JSON.stringify(shaped, null, 2);
          if (viewFor(plainName)) {
            return {
              content: [{ type: 'text', text }],
              structuredContent: wrapEnvelope(
                plainName,
                undefined,
                shaped,
                typeof parsed.regulation === 'string' ? parsed.regulation : undefined,
              ),
            };
          }
          if (shaped !== result.structuredContent) {
            return { content: [{ type: 'text', text }], structuredContent: shaped };
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
    // A discriminated union validates correctly, but the SDK serializes it to an
    // empty object schema (`normalizeObjectSchema` only accepts object schemas and
    // raw shapes), leaving Apps hosts with no fields to render. So the published
    // schema is a flat shape — the mode enum plus every field each mode accepts,
    // all optional — and the per-mode variant below enforces the real contract
    // inside the handler.
    const mergedShape: Record<string, z.ZodTypeAny> = {
      mode: z.enum(modeNames as [string, ...string[]]).describe(`Which operation to run: ${modeNames.map((m) => `"${m}"`).join(', ')}.`),
      detail: detailArg,
    };
    // A field name shared by several modes (e.g. `species` is a string in
    // `lookup`/`species` and an array in `lookup`/`sprites`) gets the union of
    // every schema it takes, so the loose published shape never rejects a valid
    // call and serializes the real per-mode types.
    const fieldVariants: Record<string, z.ZodTypeAny[]> = {};
    for (const mode of modeNames) {
      const modeShape = getObjectShape(defs[modes[mode]].inputSchema) as Record<string, z.ZodTypeAny>;
      for (const [key, field] of Object.entries(modeShape)) {
        (fieldVariants[key] ??= []).push(field);
      }
    }
    for (const [key, fields] of Object.entries(fieldVariants)) {
      const unique = [...new Set(fields)];
      const unioned = unique.length === 1 ? unique[0] : z.union(unique as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
      mergedShape[key] = unioned.optional();
    }
    const inputSchema = mergedShape as ZodRawShapeCompat;
    const variantByMode: Record<string, z.ZodTypeAny> = Object.fromEntries(modeNames.map((mode, i) => [mode, variants[i]]));
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
        // `analyze_team` is App-linked; every other compound tool stays model-only.
        ...(viewFor(name, modeNames[0]) ? { _meta: { ui: { resourceUri: WORKSPACE_RESOURCE_URI } } } : {}),
      },
      async (args) => {
        type CompoundArgs = { mode: string; detail?: string } & Record<string, unknown>;
        const parsed = args as CompoundArgs;
        const variant = variantByMode[parsed.mode];
        if (!variant) {
          throw new Error(`Unknown mode "${parsed.mode}" for ${name}. Available: ${modeNames.join(', ')}.`);
        }
        const inputCheck = variant.safeParse(parsed);
        if (!inputCheck.success) {
          const issues = inputCheck.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
          throw new Error(`Invalid arguments for ${name} mode "${parsed.mode}": ${issues}`);
        }
        const def = defs[modes[parsed.mode]];
        const result = await def.handler(inputCheck.data as Record<string, unknown>);
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
          const text = JSON.stringify(shaped, null, 2);
          if (viewFor(name, parsed.mode)) {
            return {
              content: [{ type: 'text', text }],
              structuredContent: wrapEnvelope(
                name,
                parsed.mode,
                shaped,
                typeof parsed.regulation === 'string' ? parsed.regulation : undefined,
              ),
            };
          }
          if (shaped !== result.structuredContent) {
            return { content: [{ type: 'text', text }], structuredContent: shaped };
          }
        }
        return result;
      },
    );
  }
}
