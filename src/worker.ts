/**
 * Serverless entrypoint for the hosted MCP endpoint — the artifact that makes
 * "add a URL to your client" real. Same capture-and-dispatch surface as the
 * stdio and HTTP entrypoints, stateless per request, deployable to any
 * fetch-handler runtime (Cloudflare Workers with `wrangler deploy`, Vercel
 * Edge, Deno Deploy). The domain, account and scaling are the deployer's:
 * this file is the entire server side.
 */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { buildServer } from './server.js';

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('getcompetitive MCP — POST JSON-RPC to this URL.', { status: 405 });
    }
    const server = buildServer();
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    return transport.handleRequest(request);
  },
};
