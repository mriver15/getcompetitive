/**
 * The server itself, transport-agnostic: every entrypoint (stdio for local
 * clients, HTTP for a remote endpoint) builds the same surface from here, so
 * the tools, prompts and version can never drift between them.
 */
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPrompts } from './prompts.js';
import { registerCompoundTools } from './tools/compound.js';

export const VERSION = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
).version;

export function buildServer(): McpServer {
  const server = new McpServer({
    name: 'getcompetitive',
    version: VERSION,
  });

  registerCompoundTools(server);
  registerPrompts(server);

  return server;
}
