#!/usr/bin/env node
/**
 * getcompetitive — MCP server for the Pokémon Champions meta, over stdio.
 *
 * Champions is the only game here, so the surface is scoped to it: the official
 * regulation sets, the usage-derived threat list, and the data lookups and
 * battle math a team needs — all in the game's own terms (doubles, level 50,
 * 66 stat points).
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './server.js';

const server = buildServer();
await server.connect(new StdioServerTransport());
