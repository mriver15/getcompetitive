/**
 * The server itself, transport-agnostic: every entrypoint (stdio for local
 * clients, HTTP for a remote endpoint) builds the same surface from here, so
 * the tools, prompts, version and client-facing identity can never drift
 * between them.
 */
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPrompts } from './prompts.js';
import { registerCompoundTools } from './tools/compound.js';

export const VERSION = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
).version;

export function buildServer(): McpServer {
  const server = new McpServer(
    {
      name: 'getcompetitive',
      title: 'Pok\u00e9mon Champions Competitive Tools',
      description:
        'Competitive Pok\u00e9mon Champions data, battle math, and team analysis: the official Regulation Sets, the usage-derived meta, and level-50 doubles calculations in the game\u2019s own terms.',
      version: VERSION,
      websiteUrl: 'https://github.com/mriver15/getcompetitive',
    },
    {
      instructions:
        'This server is exclusively about Pok\u00e9mon Champions competitive play: doubles at level 50, Mega Evolution once per battle, 66 stat points, no Terastallization, Regulation Sets M-A through M-C. Its eight tools dispatch on a `mode` field: lookup (the dataset), calculate (stat and damage math, in EV and Champions-point scales), analyze_team, optimize_team, prepare_matchup, analyze_battle, analyze_meta (the usage-derived meta), team_io (paste import/export and regulation legality). Use the prompts /team-doctor, /matchup-prep, /build-around, /tournament-prep, /learn-my-team, and /meta-report to chain them. Every tool is read-only and offline.',
    },
  );

  registerCompoundTools(server);
  registerPrompts(server);

  return server;
}
