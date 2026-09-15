/**
 * Meta tools: curated threat list + standard sets for a regulation.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { THREAT_LISTS, getThreatList, findThreat } from '../threats.js';
import { ok, wrap } from '../result.js';

export function registerMetaTools(server: McpServer) {
  server.registerTool(
    'list_threats',
    {
      description:
        'List the curated meta threats for a Pokémon Champions regulation, each with role, tier (S/A/B), and standard set (item, ability, nature, EVs, moves). Curated editorial data, not usage statistics — a starting point for what is strong in the current format.',
      inputSchema: {
        regulation: z.string().optional(),
      },
    },
    wrap(async (args: { regulation?: string }) => {
      if (args.regulation) {
        const list = getThreatList(args.regulation);
        if (!list) throw new Error(`No curated threats for "${args.regulation}". Available: ${Object.values(THREAT_LISTS).map((l) => `${l.name} (${l.regulation})`).join(', ')}.`);
        return ok({
          regulation: list.regulation,
          name: list.name,
          source: list.source,
          sourceAsOf: list.sourceAsOf,
          note: list.note,
          threats: list.threats,
        });
      }
      return ok({
        lists: Object.values(THREAT_LISTS).map((l) => ({
          regulation: l.regulation,
          name: l.name,
          sourceAsOf: l.sourceAsOf,
          threats: l.threats.map((t) => ({ species: t.species, role: t.role, tier: t.tier })),
        })),
      });
    }),
  );

  server.registerTool(
    'get_set',
    {
      description:
        'Get the standard competitive set for a species (item, ability, nature, EVs, 4 moves, Tera type, role, tier, and notes). Searches the curated threat lists; pass a regulation to scope to one set.',
      inputSchema: {
        species: z.string(),
        regulation: z.string().optional(),
      },
    },
    wrap(async (args: { species: string; regulation?: string }) => {
      const hit = findThreat(args.species, args.regulation);
      if (!hit) {
        const known = Object.values(THREAT_LISTS).flatMap((l) => l.threats.map((t) => t.species));
        throw new Error(`No curated set for "${args.species}". Known threats: ${known.join(', ')}.`);
      }
      return ok({
        regulation: hit.list.name,
        sourceAsOf: hit.list.sourceAsOf,
        ...hit.threat,
      });
    }),
  );
}
