/**
 * The server itself, transport-agnostic: every entrypoint (stdio for local
 * clients, HTTP for a remote endpoint) builds the same surface from here, so
 * the tools, prompts and version can never drift between them.
 */
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDataTools } from './tools/data.js';
import { registerCalcTools } from './tools/calc.js';
import { registerRegulationTools } from './tools/regulations.js';
import { registerAnalyzeTools } from './tools/analyze.js';
import { registerMetaTools } from './tools/meta.js';
import { registerTeamTools } from './tools/team.js';
import { registerDoctorTool } from './tools/doctor.js';
import { registerMatchupTool } from './tools/matchup.js';
import { registerSpritesTool } from './tools/sprites.js';
import { registerReplayTool } from './tools/replay.js';
import { registerPrompts } from './prompts.js';

export const VERSION = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
).version;

export function buildServer(): McpServer {
  const server = new McpServer({
    name: 'getcompetitive',
    version: VERSION,
  });

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
  registerPrompts(server);

  return server;
}
