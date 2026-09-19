#!/usr/bin/env node
/**
 * getcompetitive — MCP server over Streamable HTTP: the remote-endpoint mode.
 *
 *   node dist/http-server.js            # defaults to port 3000, host 127.0.0.1
 *   PORT=8080 node dist/http-server.js
 *
 * Connect any MCP client to http://<host>:<port>/mcp. This is the same
 * transport-agnostic server as the stdio entrypoint — identical tools and
 * prompts. It runs in stateless mode, the shape the SDK recommends for remote
 * deployments: each request gets a fresh transport (stateless transports are
 * single-request by design, so reusing one would collide on message ids), no
 * session state is kept, and the whole thing can sit behind a load balancer.
 * Deployment concerns — TLS, auth, rate limits, hosting — are deliberately left
 * to whoever runs it: the server itself stays a pure offline read.
 */
import http from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildServer } from './server.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';

const httpServer = http.createServer((req, res) => {
  void (async () => {
    // Stateless: a fresh server+transport per request, per the SDK's contract
    // that a stateless transport handles exactly one request.
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  })().catch((e) => {
    console.error('MCP request failed:', e instanceof Error ? e.message : e);
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' } }));
    }
  });
});

httpServer.listen(port, host, () => {
  console.error(`getcompetitive MCP server listening on http://${host}:${port}/mcp (stateless)`);
});

process.on('SIGINT', () => {
  httpServer.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
  httpServer.close(() => process.exit(0));
});
