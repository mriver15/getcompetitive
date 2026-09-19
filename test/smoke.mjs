import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const client = new Client({ name: 'smoke', version: '0.0.0' });
const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/index.js'],
  stderr: 'pipe',
});
transport.stderr?.on('data', (d) => process.stderr.write(`[server] ${d}`));

await client.connect(transport);

const listed = await client.listTools();
console.log(`TOOLS (${listed.tools.length}): ${listed.tools.map((t) => t.name).join(', ')}\n`);

const calls = [
  ['get_pokemon', { species: 'Garchomp' }],
  ['get_pokemon', { species: 'Ogerpon-Wellspring' }],
  ['list_forms', { species: 'Rotom' }],
  ['list_forms', { species: 'Gholdengo' }],
  ['search_dex', { query: 'ogerpon' }],
  ['search_dex', { query: 'sword', kind: 'move', limit: 10 }],
  ['get_move', { move: 'Earthquake' }],
  ['get_move', { move: 'Make It Rain' }],
  ['get_item', { item: 'Choice Band' }],
  ['get_ability', { ability: 'Intimidate' }],
  ['get_nature', { nature: 'Jolly' }],
  ['get_learnset', { species: 'Garchomp' }],
  ['get_type', { type: 'Steel' }],
  ['get_type_matchup', { attacker: 'Fire', defender: 'Grass' }],
  ['get_type_matchup', { attacker: 'Ice' }],
  ['get_type_matchup', { defender: 'Garchomp' }],
  ['get_type_matchup', { attacker: 'Ice', defender: 'Garchomp' }],
  ['calculate_stats', { species: 'Garchomp', level: 50, nature: 'Jolly', evs: { atk: 252, spe: 252 } }],
  // Champions point spreads are accepted alongside EVs, and echoed back in kind.
  ['calculate_stats', { species: 'Incineroar', level: 50, nature: 'Careful', championsPoints: { hp: 32, def: 14, spd: 20 } }],
  ['calculate_damage', {
    attacker: { species: 'Garchomp', level: 50, nature: 'Jolly', evs: { atk: 252, spe: 252 }, item: 'Choice Band' },
    defender: { species: 'Corviknight', level: 50, nature: 'Impish', evs: { hp: 252, def: 252 } },
    move: 'Dragon Claw',
  }],
  ['calculate_damage', {
    attacker: { species: 'Incineroar', level: 50, nature: 'Careful', championsPoints: { hp: 32, def: 14, spd: 20 } },
    defender: { species: 'Sneasler', level: 50, nature: 'Adamant', championsPoints: { hp: 2, atk: 32, spe: 32 } },
    move: 'Flare Blitz',
  }],
  ['calculate_damage', {
    attacker: { species: 'Flutter Mane', level: 50, nature: 'Timid', evs: { spa: 252, spe: 252 }, item: 'Booster Energy' },
    defender: { species: 'Kingambit', level: 50, nature: 'Adamant', evs: { hp: 252, atk: 252 } },
    move: 'Moonblast',
    field: { weather: 'Sun' },
  }],
  ['list_threats', { regulation: 'm-c' }],
  ['get_set', { species: 'Garchomp' }],
  // Form names resolve to their base species' set (Indeedee-F is the played form).
  ['get_set', { species: 'Indeedee-F' }],
  ['list_regulations', {}],
  ['get_regulation', { regulation: 'M-C' }],
  ['check_legality', {
    regulation: 'm-c',
    team: [
      { species: 'Garchomp', item: 'Choice Band' },
      { species: 'Gholdengo', item: 'Leftovers' },
      { species: 'Dragonite', item: 'Assault Vest' },
      { species: 'Tyranitar', item: 'Sitrus Berry' },
      { species: 'Incineroar', item: 'Rocky Helmet' },
      { species: 'Dragapult', item: 'Choice Scarf' },
    ],
  }],
  ['check_legality', {
    regulation: 'm-c',
    team: [
      { species: 'Flutter Mane', item: 'Choice Specs' },
      { species: 'Rotom', item: 'Leftovers' },
      { species: 'Rotom-Wash', item: 'Leftovers' },
      { species: 'Garchomp', item: 'Choice Band' },
    ],
  }],
  ['analyze_team', {
    team: [
      { species: 'Garchomp', moves: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Swords Dance'] },
      { species: 'Dragonite', teraType: 'Normal', moves: ['Extreme Speed', 'Dragon Dance', 'Earthquake', 'Outrage'] },
      { species: 'Salamence', moves: ['Dragon Dance', 'Outrage', 'Earthquake', 'Dual Wingbeat'] },
      { species: 'Gholdengo', moves: ['Make It Rain', 'Shadow Ball', 'Nasty Plot', 'Recover'] },
      { species: 'Pelipper', moves: ['Surf', 'Hurricane', 'U-turn', 'Roost'] },
      { species: 'Incineroar', moves: ['Flare Blitz', 'Knock Off', 'Parting Shot', 'Fake Out'] },
    ],
    regulation: 'm-c',
  }],
  ['calculate_matchups', {
    attacker: { species: 'Garchomp', level: 50, nature: 'Jolly', evs: { atk: 252, spe: 252 }, item: 'Choice Band', moves: ['Earthquake', 'Dragon Claw', 'Rock Slide'] },
    defenders: [
      { species: 'Dragapult', level: 50, nature: 'Timid', evs: { spa: 252, spe: 252 } },
      { species: 'Gholdengo', level: 50, nature: 'Bold', evs: { hp: 252, def: 252 } },
      { species: 'Corviknight', level: 50, nature: 'Impish', evs: { hp: 252, def: 252 } },
    ],
  }],
  ['check_speed', { species: 'Garchomp', level: 50, nature: 'Jolly', evs: { spe: 252 }, regulation: 'm-c' }],
  ['check_speed', { species: 'Dragapult', level: 50, nature: 'Timid', championsPoints: { spe: 32 } }],
  // Real sets in the team turn the threat coverage into a real-Speed comparison.
  ['analyze_team', {
    regulation: 'm-c',
    opponent: ['Salamence', 'Sneasler', 'Kingambit', 'Pelipper', 'Farigiraf', 'Incineroar'],
    team: [
      { species: 'Garchomp', nature: 'Jolly', evs: { atk: 252, spe: 252 } },
      { species: 'Incineroar', nature: 'Careful', championsPoints: { hp: 32, def: 14, spd: 20 }, item: 'Sitrus Berry' },
      { species: 'Gholdengo', moves: ['Make It Rain', 'Shadow Ball'] },
    ],
  }],
  ['optimize_evs', {
    species: 'Garchomp', level: 50, nature: 'Jolly', item: 'Choice Band',
    kill: { target: { species: 'Incineroar', level: 50, nature: 'Careful', evs: { hp: 252, spd: 252 } }, move: 'Earthquake' },
    outspeed: { speed: 100 },
    maximize: 'spe',
  }],
  ['check_legality', {
    regulation: 'm-c',
    team: [
      { species: 'Garchomp', item: 'Choice Band', moves: ['Earthquake', 'Dragon Claw', 'Rock Slide'] },
      { species: 'Gholdengo', item: 'Leftovers', moves: ['Make It Rain', 'Spore'] },
    ],
  }],
  // Branch coverage for the declared output schemas: every optional payload
  // block (no-argument chart, missing comparison, single-goal EV solves,
  // filtered tier list, threat-list index, team without a regulation) is
  // exercised, and the SDK validates each result against the tool's schema.
  ['get_type_matchup', {}],
  ['check_speed', { species: 'Garchomp', level: 50, nature: 'Jolly', evs: { spe: 252 } }],
  ['optimize_evs', {
    species: 'Garchomp', level: 50, nature: 'Impish',
    survive: { attacker: { species: 'Incineroar', level: 50, ability: 'Intimidate', evs: { atk: 252 } }, move: 'Flare Blitz' },
  }],
  ['optimize_evs', { species: 'Garchomp', level: 50, outspeed: { speed: 150 } }],
  ['list_threats', {}],
  ['get_set', { species: 'Incineroar', regulation: 'm-c' }],
  // The P0 workflow surface: paste in, diagnose, prepare a matchup, paste out.
  ['parse_team', {
    text: 'Rillaboom @ Assault Vest\nAbility: Grassy Surge\nAdamant Nature\nEVs: 252 HP / 252 Atk / 4 SpD\n- Fake Out\n- Grassy Glide\n- Wood Hammer\n- U-turn\n\nSalamence @ Salamencite\nAbility: Intimidate\nJolly Nature\nEVs: 32 Atk / 32 Spe\n- Dragon Dance\n- Dual Wingbeat\n- Earthquake\n- Protect\n\nGholdengo @ Life Orb | Good as Gold | Modest | 252 SpA / 252 Spe | Make It Rain / Shadow Ball / Nasty Plot / Protect',
    regulation: 'm-c',
  }],
  ['format_team', {
    team: [
      { species: 'Garchomp', item: 'Choice Scarf', ability: 'Rough Skin', nature: 'Jolly', evs: { atk: 252, spe: 252 }, moves: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] },
      { species: 'Incineroar', item: 'Sitrus Berry', nature: 'Careful', championsPoints: { hp: 32, def: 14, spd: 20 }, moves: ['Fake Out', 'Flare Blitz', 'Parting Shot', 'Knock Off'] },
    ],
  }],
  ['diagnose_team', {
    team: [
      { species: 'Garchomp', item: 'Garchompite', nature: 'Jolly', evs: { atk: 252, spe: 252 }, moves: ['Swords Dance', 'Earthquake', 'Dragon Claw', 'Rock Slide'] },
      { species: 'Incineroar', item: 'Sitrus Berry', nature: 'Careful', championsPoints: { hp: 32, def: 14, spd: 20 }, moves: ['Fake Out', 'Flare Blitz', 'Parting Shot', 'Knock Off'] },
      { species: 'Rillaboom', item: 'Assault Vest', nature: 'Adamant', evs: { hp: 252, atk: 252 }, moves: ['Fake Out', 'Grassy Glide', 'Wood Hammer', 'U-turn'] },
    ],
    lockedMembers: ['Garchomp'],
  }],
  ['prepare_matchup', {
    team: [
      { species: 'Garchomp', item: 'Garchompite', nature: 'Jolly', evs: { atk: 252, spe: 252 }, moves: ['Swords Dance', 'Earthquake', 'Dragon Claw', 'Rock Slide'] },
      { species: 'Incineroar', item: 'Sitrus Berry', nature: 'Careful', championsPoints: { hp: 32, def: 14, spd: 20 }, moves: ['Fake Out', 'Flare Blitz', 'Parting Shot', 'Knock Off'] },
      { species: 'Rillaboom', item: 'Assault Vest', nature: 'Adamant', evs: { hp: 252, atk: 252 }, moves: ['Fake Out', 'Grassy Glide', 'Wood Hammer', 'U-turn'] },
    ],
    opponent: ['Sneasler', 'Salamence-Mega', 'Gholdengo', 'Farigiraf', 'Kingambit', 'Rillaboom'],
  }],
  ['get_sprites', { species: ['Garchomp', 'Rotom-Wash', 'Indeedee', 'Salamence-Mega', 'NotAMon', 'Annihilape'] }],
  ['get_sprites', { species: ['Garchomp', 'Basculegion'], size: 'icon' }],
  ['compare_meta', {}],
  ['analyze_replay', {
    log: '|player|p1|Alice|\n|player|p2|Bob|\n|teamsize|p1|2|p2|2\n|switch|p1a: Sneasler|Sneasler, F|100/100\n|switch|p2a: Rillaboom|Rillaboom|100/100\n|turn|1\n|move|p1a: Sneasler|Close Combat|p2a: Rillaboom\n|-damage|p2a: Rillaboom|71/100\n|move|p2a: Rillaboom|Grassy Glide|p1a: Sneasler\n|-damage|p1a: Sneasler|45/100\n|turn|2\n|move|p1a: Sneasler|Dire Claw|p2a: Rillaboom\n|-damage|p2a: Rillaboom|8/100\n|faint|p2a: Rillaboom\n|switch|p2a: Gholdengo|Gholdengo|100/100\n|turn|3\n|move|p2a: Gholdengo|Make It Rain|p1a: Sneasler\n|-damage|p1a: Sneasler|0/100\n|faint|p1a: Sneasler\n|win|Bob',
  }],
  ['analyze_team', {
    team: [
      { species: 'Garchomp', moves: ['Earthquake'] },
      { species: 'Gholdengo', moves: ['Make It Rain'] },
    ],
  }],
  ['calculate_damage', {
    attacker: { species: 'Garchomp', level: 50, nature: 'Jolly', evs: { atk: 252 } },
    defender: { species: 'Corviknight', level: 50, nature: 'Impish', evs: { hp: 252, def: 252 } },
    move: 'Dragon Claw',
    field: { gameType: 'Doubles', weather: 'Rain', terrain: 'Electric', attackerSide: { isReflect: true }, defenderSide: { isLightScreen: true } },
  }],
];

let failed = 0;

// Champions only: the Smogon-tier and archetype surface was removed deliberately
// and must not creep back in.
for (const gone of ['list_tiers', 'list_speed_tiers', 'list_archetypes', 'get_archetype']) {
  if (listed.tools.some((t) => t.name === gone)) {
    console.log(`=== ${gone} is exposed but should not be ===`);
    failed++;
  }
}
for (const [name, args] of calls) {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  if (res.isError) failed++;
  console.log(`=== ${name} ${JSON.stringify(args).slice(0, 90)}${res.isError ? '  [ERROR]' : ''} ===`);
  console.log(text.slice(0, 520).replace(/\n+/g, ' '));
  console.log('');
}

// Error-path checks
for (const [name, args] of [
  ['get_pokemon', { species: 'NotAMon' }],
  ['calculate_stats', { species: 'Garchomp', level: 50, evs: { atk: 999 } }],
  ['calculate_stats', { species: 'Garchomp', level: 50, evs: { spe: 4 }, championsPoints: { spe: 32 } }],
  ['calculate_stats', { species: 'Garchomp', level: 50, championsPoints: { hp: 32, atk: 32, spe: 32 } }],
  ['get_type_matchup', { attacker: 'Fire', defender: 'Bogus' }],
  ['parse_team', { text: '' }],
  ['diagnose_team', { team: [{ species: 'NotAMon' }] }],
]) {
  const res = await client.callTool({ name, arguments: args });
  const isErr = !!res.isError;
  console.log(`=== ${name} ${JSON.stringify(args)} => isError=${isErr} ===`);
  if (!isErr) failed++;
}

// Evolution-line legality. A move a pre-evolution learns (an egg move included)
// is legal on the evolved form, while a different form of the same National
// Pokédex number must not leak its pool in. Getting this wrong in either
// direction has bitten before: too narrow rejected Rillaboom's Fake Out and
// Arcanine-Hisui's Head Smash, too wide accepted Johto Sneasel's Surf on
// Sneasler and broke Charizard-Mega-Y's prevo chain.
async function legalMoves(species, moves) {
  const res = await client.callTool({
    name: 'check_legality',
    arguments: {
      regulation: 'm-c',
      team: [species, 'Garchomp', 'Gholdengo', 'Incineroar', 'Pelipper', 'Farigiraf'].map((s, i) => ({
        species: s,
        ...(i === 0 ? { moves } : {}),
      })),
    },
  });
  const member = res.structuredContent.members.find((m) => m.species === species);
  return new Map((member.moves ?? []).map((m) => [m.move, m.legal]));
}

for (const [species, move, expected] of [
  ['Rillaboom', 'Fake Out', true],
  ['Sneasler', 'Fake Out', true],
  ['Arcanine-Hisui', 'Head Smash', true],
  ['Charizard-Mega-Y', 'Ancient Power', true],
  ['Rillaboom', 'Surf', false],
  ['Sneasler', 'Surf', false],
  ['Arcanine-Hisui', 'Ice Beam', false],
]) {
  const legal = (await legalMoves(species, [move])).get(move);
  console.log(`=== legality ${species} + ${move} => ${legal} (want ${expected}) ===`);
  if (legal !== expected) failed++;
}

// The sets the meta tools hand out must survive the regulation's own legality
// check: a `get_set` that `check_legality` rejects is a bug in one of them.
const threats = (await client.callTool({ name: 'list_threats', arguments: { regulation: 'm-c' } })).structuredContent.threats;
for (const threat of threats) {
  const species = threat.megaForm ?? threat.form ?? threat.species;
  const rejected = [...(await legalMoves(species, threat.moves))].filter(([, legal]) => !legal).map(([move]) => move);
  if (rejected.length) {
    console.log(`=== generated set ${species} rejected by check_legality: ${rejected.join(', ')} ===`);
    failed++;
  }
}
console.log(`=== ${threats.length} generated sets all pass check_legality ===`);

// get_sprites acceptance: batch order, partial failure, dex numbers, artwork vs
// icon, and purity (deterministic table lookup — no runtime network anywhere).
{
  const check = (label, ok) => {
    console.log(`=== ${label} => ${ok} ===`);
    if (!ok) failed++;
  };
  const batch = await client.callTool({
    name: 'get_sprites',
    arguments: { species: ['Garchomp', 'Rotom-Wash', 'Indeedee', 'Salamence-Mega', 'NotAMon', 'Annihilape'] },
  });
  const { sprites, unresolved, note } = batch.structuredContent;
  check('get_sprites resolves a batched team in order', !batch.isError && sprites.map((s) => s.species).join(',') === 'Garchomp,Rotom-Wash,Indeedee,Salamence-Mega,Annihilape');
  check('get_sprites reports partial failure instead of failing the batch', unresolved?.length === 1 && unresolved[0] === 'NotAMon');
  check('get_sprites carries National Dex numbers', sprites.every((s, i) => s.dexNumber === [445, 479, 876, 373, 979][i]));
  check('get_sprites artwork URLs point at official artwork', sprites.every((s) => s.url.includes('/other/official-artwork/') && s.url.endsWith('.png')));
  const icon = await client.callTool({ name: 'get_sprites', arguments: { species: ['Garchomp'], size: 'icon' } });
  check('get_sprites icon URLs point at the game sprite', icon.structuredContent.sprites[0].url.endsWith('/sprites/pokemon/445.png'));
  const again = await client.callTool({ name: 'get_sprites', arguments: { species: ['Garchomp'] } });
  check(
    'get_sprites is deterministic and pure (committed table, no runtime I/O)',
    JSON.stringify(again.structuredContent) === JSON.stringify({ sprites: [sprites[0]], note }),
  );
}

// The paste is the artefact a player copies into the game, so it must be written
// in Champions stat points (0-32 each, 66 total) — never the 0-252 calc scale.
const pasteSet = await client.callTool({ name: 'get_set', arguments: { species: 'Rillaboom' } });
const paste = pasteSet.structuredContent?.paste ?? '';
const evLine = paste.split('\n').find((l) => l.startsWith('EVs:')) ?? '';
const evPoints = (evLine.match(/\d+/g) ?? []).map(Number);
if (!evLine || evPoints.some((n) => n > 32) || evPoints.reduce((a, b) => a + b, 0) > 66) {
  console.log(`=== paste EVs are not in Champions points: ${JSON.stringify(evLine)} ===`);
  failed++;
}
if (!/- Fake Out/.test(paste)) {
  console.log('=== paste is missing its move lines ===');
  failed++;
}

// P2: meta deltas and replay analysis are deterministic reads over committed data.
{
  const check = (label, ok) => {
    console.log(`=== ${label} => ${ok} ===`);
    if (!ok) failed++;
  };
  const cm = await client.callTool({ name: 'compare_meta', arguments: {} });
  const md = cm.structuredContent;
  check(
    'compare_meta reports two windows with team counts',
    !cm.isError && md.windows.current.teams > 0 && md.windows.previous.teams > 0 && md.rising.length > 0 && md.falling.length > 0,
  );
  check(
    'compare_meta deltas are consistent',
    md.rising.every((s) => Number((s.current - s.previous).toFixed(1)) === s.delta) &&
      md.emergingCores.every((c) => c.core.length === 2 && c.delta >= 0),
  );
  const cmErr = await client.callTool({ name: 'compare_meta', arguments: { regulation: 'm-a' } });
  check('compare_meta names the regulations with history', !!cmErr.isError && cmErr.content[0].text.includes('m-c'));

  const rp = await client.callTool({
    name: 'analyze_replay',
    arguments: {
      log: '|player|p1|Alice|\n|player|p2|Bob|\n|switch|p1a: Sneasler|Sneasler|100/100\n|switch|p2a: Rillaboom|Rillaboom|100/100\n|turn|1\n|move|p1a: Sneasler|Close Combat|p2a: Rillaboom\n|-damage|p2a: Rillaboom|71/100\n|move|p2a: Rillaboom|Grassy Glide|p1a: Sneasler\n|-damage|p1a: Sneasler|45/100\n|faint|p2a: Rillaboom\n|win|Alice',
    },
  });
  const r = rp.structuredContent;
  check(
    'analyze_replay parses teams, KO and winner',
    !rp.isError && r.players.join(',') === 'Alice,Bob' && r.winner === 'Alice' && r.turns === 1 && r.kos.length === 1 && r.kos[0].move === 'Close Combat' && r.teams.p2.includes('Rillaboom'),
  );
  check('analyze_replay reads speed and damage from the log', r.speedConstraints.length === 1 && r.speedConstraints[0].faster.includes('Sneasler') && r.damageEvents[0].percent === 71);
  const dx = await client.callTool({ name: 'diagnose_team', arguments: { team: [{ species: 'Garchomp' }] } });
  check(
    'diagnose_team changes carry dataUpdated provenance',
    dx.structuredContent.candidateChanges.every((c) => typeof c.dataUpdated === 'string'),
  );
}
// P1: server-provided workflow prompts, and the same surface over the HTTP
// entrypoint (the remote-endpoint mode) — a real client against a spawned server.
{
  const check = (label, ok) => {
    console.log(`=== ${label} => ${ok} ===`);
    if (!ok) failed++;
  };
  const promptList = (await client.listPrompts()).prompts;
  check(
    'six workflow prompts are discoverable',
    promptList.length === 6 &&
      ['team-doctor', 'matchup-prep', 'build-around', 'tournament-prep', 'learn-my-team', 'meta-report'].every((n) =>
        promptList.some((p) => p.name === n),
      ),
  );
  const got = await client.getPrompt({ name: 'matchup-prep', arguments: { opponent: 'Sneasler', regulation: 'm-c' } });
  const ptext = got.messages[0].content.text;
  check('matchup-prep chains the real tools', ['prepare_matchup', 'parse_team', 'Sneasler'].every((t) => ptext.includes(t)));

  const child = spawn(process.execPath, ['dist/http-server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: '3207' },
    stdio: 'ignore',
  });
  try {
    let up = false;
    for (let i = 0; i < 40 && !up; i++) {
      try {
        const r = await fetch('http://127.0.0.1:3207/mcp', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1, method: 'initialize',
            params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } },
          }),
        });
        up = r.ok;
      } catch {
        await new Promise((r2) => setTimeout(r2, 200));
      }
    }
    check('HTTP entrypoint comes up', up);
    const httpClient = new Client({ name: 'smoke-http', version: '0' });
    await httpClient.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:3207/mcp')));
    const httpTools = (await httpClient.listTools()).tools;
    const sprite = await httpClient.callTool({ name: 'get_sprites', arguments: { species: ['Garchomp'], size: 'icon' } });
    check('HTTP entrypoint serves the same 28 tools', httpTools.length === 28);
    check('HTTP entrypoint answers a tool call', sprite.structuredContent.sprites[0].url.endsWith('445.png'));
    await httpClient.close();
  } finally {
    child.kill();
  }
}

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILURES`);
await client.close();
process.exit(failed === 0 ? 0 : 1);
