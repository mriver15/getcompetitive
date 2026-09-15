#!/usr/bin/env node
/**
 * getcompetitive — MCP server for competitive Pokemon team building.
 *
 * Tools span three domains:
 *  - data:   species, forms, moves, items, abilities, natures, learnsets, types
 *  - team:   archetypes, tier lists, speed tiers
 *  - calc:   stat calculation, full damage calculation
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerDataTools } from './tools/data.js';
import { registerCalcTools } from './tools/calc.js';
import { registerTeamTools } from './tools/team.js';
import { registerRegulationTools } from './tools/regulations.js';
import { registerAnalyzeTools } from './tools/analyze.js';
import { registerMetaTools } from './tools/meta.js';

const server = new McpServer({
  name: 'getcompetitive',
  version: '0.1.0',
});

registerDataTools(server);
registerCalcTools(server);
registerTeamTools(server);
registerRegulationTools(server);
registerAnalyzeTools(server);
registerMetaTools(server);

await server.connect(new StdioServerTransport());
