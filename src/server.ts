/**
 * The server itself, transport-agnostic: every entrypoint (stdio for local
 * clients, HTTP for a remote endpoint) builds the same surface from here, so
 * the tools, prompts, version and client-facing identity can never drift
 * between them.
 */
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { registerPrompts } from './prompts.js';
import { registerCompoundTools } from './tools/compound.js';
import { WORKSPACE_RESOURCE_URI } from './apps/envelope.js';
import { WORKSPACE_HTML } from './generated/workspace-html.js';

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
        'This server is exclusively about Pok\u00e9mon Champions competitive play: doubles at level 50, Mega Evolution once per battle, 66 stat points, and Regulation Sets M-A through M-C. Its nine tools dispatch on a `mode` field: lookup (the dataset), calculate (stat and damage math, in EV and Champions-point scales), analyze_team, optimize_team, prepare_matchup, analyze_battle, analyze_meta (the usage-derived meta), team_io (paste import/export and regulation legality), and record_set \u2014 the only writer, which files a set the reasoning generated into a local, per-user record that `get_set` reads back with `includeRecorded`, so measured usage stays the single source of the meta. Use the prompts /team-doctor, /matchup-prep, /build-around, /tournament-prep, /learn-my-team, and /meta-report to chain them. Every tool but record_set is read-only and offline; no tool needs a network or credentials. analyze_team, optimize_team and prepare_matchup also carry an MCP App: when a host renders the interactive view (Team Doctor, Team Builder, Matchup Board), end your turn after the call and let the user explore it \u2014 the view calls this server itself for drilldowns and messages you back with any follow-up, so do not summarize the board and move on.',
    },
  );

  registerCompoundTools(server);
  registerPrompts(server);

  // The one bundled MCP App resource. It is embedded in the compiled JS (not
  // read from a runtime path) so the stdio, HTTP and serverless Worker
  // entrypoints serve byte-identical markup, and `resources/read` returns the
  // sandboxed iframe the App-linked tools render through.
  registerAppResource(
    server,
    'getcompetitive workspace',
    WORKSPACE_RESOURCE_URI,
    {
      title: 'getcompetitive workspace',
      description:
        'The bundled getcompetitive App: Team Doctor (team analysis), Team Builder (slot optimization) and Matchup Board (pre-game dossier) over the deterministic competitive Pok\u00e9mon engine.',
    },
    () => ({
      contents: [{ uri: WORKSPACE_RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: WORKSPACE_HTML }],
    }),
  );

  return server;
}
