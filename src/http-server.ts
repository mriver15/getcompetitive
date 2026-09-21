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
 * to whoever runs it: the server itself makes no outbound request. Every tool is
 * an offline read except `record_set`, which appends to the local per-user
 * recorded-set file and fails cleanly where there is no filesystem to write.
 */
import http from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildServer } from './server.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';

const APP_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>getcompetitive — evidence display</title>
<style>
body{font-family:system-ui,sans-serif;max-width:52rem;margin:2rem auto;padding:0 1rem;color:#111;background:#fafafa}
h1{font-size:1.4rem} textarea{width:100%;height:7rem;font-family:ui-monospace,monospace;font-size:.8rem}
button{font-size:1rem;padding:.4rem .9rem} pre{background:#fff;border:1px solid #ddd;padding:.8rem;overflow:auto;font-size:.8rem}
.row{display:flex;gap:1rem;flex-wrap:wrap}.box{flex:1;min-width:18rem}
.tag{display:inline-block;padding:.1rem .4rem;margin:.1rem;border-radius:.3rem;font-size:.75rem}
.HARD_ANSWER{background:#d9f2d9}.SOFT_ANSWER{background:#e3f2d9}.REVENGE,.SPEED_DEPENDENT,.TRADE{background:#fff3cd}.UNFAVORABLE{background:#f8d7da}.UNKNOWN{background:#eee}
</style></head><body>
<h1>getcompetitive — the model converses, this displays the proof</h1>
<div class="row">
<div class="box"><label>Your team (paste text)</label><br>
<textarea id="team">Garchomp @ Garchompite | Sand Veil | Jolly | 252 Atk / 252 Spe | Earthquake / Dragon Claw / Rock Slide / Protect
Incineroar @ Sitrus Berry | Intimidate | Careful | 32 HP / 14 Def / 20 SpD | Fake Out / Flare Blitz / Parting Shot / Knock Off
Rillaboom @ Assault Vest | Grassy Surge | Adamant | 252 HP / 252 Atk | Fake Out / Grassy Glide / Wood Hammer / U-turn</textarea></div>
<div class="box"><label>Opponent (species)</label><br>
<textarea id="opp" style="height:3rem">Sneasler, Salamence-Mega, Gholdengo, Farigiraf, Kingambit, Rillaboom</textarea>
<br><button id="go">Analyze</button></div>
</div>
<h2 id="status"></h2>
<pre id="out"></pre>
<script>
const call = async (name, args) => {
  await fetch('/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'evidence-app', version: '0' } } }) });
  const r = await fetch('/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return JSON.parse(j.result.content[0].text);
};
document.getElementById('go').onclick = async () => {
  const status = document.getElementById('status');
  const out = document.getElementById('out');
  status.textContent = 'analyzing…';
  try {
    const team = (await call('team_io', { mode: 'parse', text: document.getElementById('team').value })).team;
    const opp = document.getElementById('opp').value.split(',').map((s) => s.trim()).filter(Boolean);
    const [syn, prep, meta] = await Promise.all([
      call('analyze_team', { mode: 'synergy', team, regulation: 'm-c', detail: 'evidence' }),
      call('prepare_matchup', { team, opponent: opp, detail: 'evidence' }),
      call('analyze_meta', { mode: 'threats' }),
    ]);
    const cls = (c) => '<span class="tag ' + c + '">' + c + '</span>';
    const threatRows = (syn.threatCoverage?.threats ?? []).slice(0, 12).map((t) => t.species + ' ' + (t.answerClass ? cls(t.answerClass) : '') + ' (' + t.usage + '%)').join('\n');
    const metaTop = (meta.threats ?? []).slice(0, 8).map((t) => t.species + ' ' + t.usage + '% [' + t.tier + ']').join('\n');
    out.textContent = [
      'BRING FOUR: ' + prep.recommendedBringFour.picks.map((p) => p.species).join(' / '),
      '  score ' + prep.recommendedBringFour.score + ' | alternates: ' + prep.recommendedBringFour.alternates.map((a) => a.map((p) => p.species).join('+')).join('; '),
      'LEADS: ' + prep.possibleLeads.pairs.map((p) => p.support + ' + ' + p.attacker).join(' | '),
      'PRESERVE: ' + (prep.pokemonToPreserve.join(', ') || '—'),
      'WIN: ' + prep.winConditions.join(' | '),
      'LOSE: ' + prep.lossConditions.join(' | '),
      'CONFIDENCE: ' + prep.matchupConfidence.score + '/100',
      'KEY ROLLS:',
      ...prep.relevantDamageCalcs.map((c) => '  ' + c.attacker + ' ' + c.move + ' -> ' + c.defender + ': ' + c.damageRange.join('-') + ' (' + (c.koChance ?? '') + ')'),
      '',
      'THREAT MATRIX (battle math, not type chart):',
      threatRows,
      '',
      'META TOP:',
      metaTop,
    ].join('\n');
    status.textContent = 'done — every number above came from the deterministic engine.';
  } catch (e) {
    status.textContent = 'error: ' + e.message;
    out.textContent = '';
  }
};
</script></body></html>`;

const httpServer = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/app')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(APP_HTML);
    return;
  }
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
