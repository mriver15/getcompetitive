#!/usr/bin/env node
/**
 * getcompetitive — MCP server for the Pokémon Champions meta.
 *
 * Champions is the only game here, so the surface is scoped to it: the official
 * regulation sets, the usage-derived threat list, and the data lookups and
 * battle math a team needs — all in the game's own terms (doubles, level 50,
 * 66 stat points, no Terastallization).
 */
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerDataTools } from './tools/data.js';
import { registerCalcTools } from './tools/calc.js';
import { registerRegulationTools } from './tools/regulations.js';
import { registerAnalyzeTools } from './tools/analyze.js';
import { registerMetaTools } from './tools/meta.js';

const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

const server = new McpServer({
  name: 'getcompetitive',
  version,
});

registerDataTools(server);
registerCalcTools(server);
registerRegulationTools(server);
registerAnalyzeTools(server);
registerMetaTools(server);

await server.connect(new StdioServerTransport());
