import { spawn } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// `record_set` writes to a per-user file; point it at a scratch one so the suite
// never touches the store a person actually uses.
const scratch = mkdtempSync(join(tmpdir(), 'getcompetitive-smoke-'));
const storeFile = join(scratch, 'sets.jsonl');

const client = new Client({ name: 'smoke', version: '0.0.0' });
const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/index.js'],
  stderr: 'pipe',
  env: { ...process.env, GETCOMPETITIVE_STORE: storeFile },
});
transport.stderr?.on('data', (d) => process.stderr.write(`[server] ${d}`));

await client.connect(transport);

const listed = await client.listTools();
console.log(`TOOLS (${listed.tools.length}): ${listed.tools.map((t) => t.name).join(', ')}\n`);

const calls = [
  ['lookup', { mode: 'species', species: 'Garchomp' }],
  ['lookup', { mode: 'species', species: 'Ogerpon-Wellspring' }],
  ['lookup', { mode: 'forms', species: 'Rotom' }],
  ['lookup', { mode: 'forms', species: 'Gholdengo' }],
  ['lookup', { mode: 'search', query: 'ogerpon' }],
  ['lookup', { mode: 'search', query: 'sword', kind: 'move', limit: 10 }],
  ['lookup', { mode: 'move', move: 'Earthquake' }],
  ['lookup', { mode: 'move', move: 'Make It Rain' }],
  ['lookup', { mode: 'item', item: 'Choice Band' }],
  ['lookup', { mode: 'ability', ability: 'Intimidate' }],
  ['lookup', { mode: 'nature', nature: 'Jolly' }],
  ['lookup', { mode: 'learnset', species: 'Garchomp' }],
  ['lookup', { mode: 'type', type: 'Steel' }],
  ['lookup', { mode: 'matchup', attacker: 'Fire', defender: 'Grass' }],
  ['lookup', { mode: 'matchup', attacker: 'Ice' }],
  ['lookup', { mode: 'matchup', defender: 'Garchomp' }],
  ['lookup', { mode: 'matchup', attacker: 'Ice', defender: 'Garchomp' }],
  ['calculate', { mode: 'stats', species: 'Garchomp', level: 50, nature: 'Jolly', evs: { atk: 252, spe: 252 } }],
  // Champions point spreads are accepted alongside EVs, and echoed back in kind.
  ['calculate', { mode: 'stats', species: 'Incineroar', level: 50, nature: 'Careful', championsPoints: { hp: 32, def: 14, spd: 20 } }],
  ['calculate', { mode: 'damage', 
    attacker: { species: 'Garchomp', level: 50, nature: 'Jolly', evs: { atk: 252, spe: 252 }, item: 'Choice Band' },
    defender: { species: 'Corviknight', level: 50, nature: 'Impish', evs: { hp: 252, def: 252 } },
    move: 'Dragon Claw',
  }],
  ['calculate', { mode: 'damage', 
    attacker: { species: 'Incineroar', level: 50, nature: 'Careful', championsPoints: { hp: 32, def: 14, spd: 20 } },
    defender: { species: 'Sneasler', level: 50, nature: 'Adamant', championsPoints: { hp: 2, atk: 32, spe: 32 } },
    move: 'Flare Blitz',
  }],
  ['calculate', { mode: 'damage', 
    attacker: { species: 'Flutter Mane', level: 50, nature: 'Timid', evs: { spa: 252, spe: 252 }, item: 'Booster Energy' },
    defender: { species: 'Kingambit', level: 50, nature: 'Adamant', evs: { hp: 252, atk: 252 } },
    move: 'Moonblast',
    field: { weather: 'Sun' },
  }],
  ['analyze_meta', { mode: 'threats', regulation: 'm-c' }],
  ['analyze_meta', { mode: 'set', species: 'Garchomp' }],
  // Form names resolve to their base species' set (Indeedee-F is the played form).
  ['analyze_meta', { mode: 'set', species: 'Indeedee-F' }],
  ['team_io', { mode: 'regulations', }],
  ['team_io', { mode: 'regulation', regulation: 'M-C' }],
  ['team_io', { mode: 'legality', 
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
  ['team_io', { mode: 'legality', 
    regulation: 'm-c',
    team: [
      { species: 'Flutter Mane', item: 'Choice Specs' },
      { species: 'Rotom', item: 'Leftovers' },
      { species: 'Rotom-Wash', item: 'Leftovers' },
      { species: 'Garchomp', item: 'Choice Band' },
    ],
  }],
  ['analyze_team', { mode: 'synergy', 
    team: [
      { species: 'Garchomp', moves: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Swords Dance'] },
      { species: 'Dragonite', moves: ['Extreme Speed', 'Dragon Dance', 'Earthquake', 'Outrage'] },
      { species: 'Salamence', moves: ['Dragon Dance', 'Outrage', 'Earthquake', 'Dual Wingbeat'] },
      { species: 'Gholdengo', moves: ['Make It Rain', 'Shadow Ball', 'Nasty Plot', 'Recover'] },
      { species: 'Pelipper', moves: ['Surf', 'Hurricane', 'U-turn', 'Roost'] },
      { species: 'Incineroar', moves: ['Flare Blitz', 'Knock Off', 'Parting Shot', 'Fake Out'] },
    ],
    regulation: 'm-c',
  }],
  ['calculate', { mode: 'matchups', 
    attacker: { species: 'Garchomp', level: 50, nature: 'Jolly', evs: { atk: 252, spe: 252 }, item: 'Choice Band', moves: ['Earthquake', 'Dragon Claw', 'Rock Slide'] },
    defenders: [
      { species: 'Dragapult', level: 50, nature: 'Timid', evs: { spa: 252, spe: 252 } },
      { species: 'Gholdengo', level: 50, nature: 'Bold', evs: { hp: 252, def: 252 } },
      { species: 'Corviknight', level: 50, nature: 'Impish', evs: { hp: 252, def: 252 } },
    ],
  }],
  ['calculate', { mode: 'speed', species: 'Garchomp', level: 50, nature: 'Jolly', evs: { spe: 252 }, regulation: 'm-c' }],
  ['calculate', { mode: 'speed', species: 'Dragapult', level: 50, nature: 'Timid', championsPoints: { spe: 32 } }],
  // Real sets in the team turn the threat coverage into a real-Speed comparison.
  ['analyze_team', { mode: 'synergy', 
    regulation: 'm-c',
    opponent: ['Salamence', 'Sneasler', 'Kingambit', 'Pelipper', 'Farigiraf', 'Incineroar'],
    team: [
      { species: 'Garchomp', nature: 'Jolly', evs: { atk: 252, spe: 252 } },
      { species: 'Incineroar', nature: 'Careful', championsPoints: { hp: 32, def: 14, spd: 20 }, item: 'Sitrus Berry' },
      { species: 'Gholdengo', moves: ['Make It Rain', 'Shadow Ball'] },
    ],
  }],
  ['calculate', { mode: 'optimize_evs', 
    species: 'Garchomp', level: 50, nature: 'Jolly', item: 'Choice Band',
    kill: { target: { species: 'Incineroar', level: 50, nature: 'Careful', evs: { hp: 252, spd: 252 } }, move: 'Earthquake' },
    outspeed: { speed: 100 },
    maximize: 'spe',
  }],
  ['team_io', { mode: 'legality', 
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
  ['lookup', { mode: 'matchup', }],
  ['calculate', { mode: 'speed', species: 'Garchomp', level: 50, nature: 'Jolly', evs: { spe: 252 } }],
  ['calculate', { mode: 'optimize_evs', 
    species: 'Garchomp', level: 50, nature: 'Impish',
    survive: { attacker: { species: 'Incineroar', level: 50, ability: 'Intimidate', evs: { atk: 252 } }, move: 'Flare Blitz' },
  }],
  ['calculate', { mode: 'optimize_evs', species: 'Garchomp', level: 50, outspeed: { speed: 150 } }],
  ['analyze_meta', { mode: 'threats', }],
  ['analyze_meta', { mode: 'set', species: 'Incineroar', regulation: 'm-c' }],
  // The P0 workflow surface: paste in, diagnose, prepare a matchup, paste out.
  ['team_io', { mode: 'parse', 
    text: 'Rillaboom @ Assault Vest\nAbility: Grassy Surge\nAdamant Nature\nEVs: 252 HP / 252 Atk / 4 SpD\n- Fake Out\n- Grassy Glide\n- Wood Hammer\n- U-turn\n\nSalamence @ Salamencite\nAbility: Intimidate\nJolly Nature\nEVs: 32 Atk / 32 Spe\n- Dragon Dance\n- Dual Wingbeat\n- Earthquake\n- Protect\n\nGholdengo @ Life Orb | Good as Gold | Modest | 252 SpA / 252 Spe | Make It Rain / Shadow Ball / Nasty Plot / Protect',
    regulation: 'm-c',
  }],
  ['team_io', { mode: 'format', 
    team: [
      { species: 'Garchomp', item: 'Choice Scarf', ability: 'Rough Skin', nature: 'Jolly', evs: { atk: 252, spe: 252 }, moves: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] },
      { species: 'Incineroar', item: 'Sitrus Berry', nature: 'Careful', championsPoints: { hp: 32, def: 14, spd: 20 }, moves: ['Fake Out', 'Flare Blitz', 'Parting Shot', 'Knock Off'] },
    ],
  }],
  ['analyze_team', { mode: 'diagnose', 
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
  ['lookup', { mode: 'sprites', species: ['Garchomp', 'Rotom-Wash', 'Indeedee', 'Salamence-Mega', 'NotAMon', 'Annihilape'] }],
  ['lookup', { mode: 'sprites', species: ['Garchomp', 'Basculegion'], size: 'icon' }],
  ['analyze_meta', { mode: 'compare', }],
  ['analyze_battle', { mode: 'infer', 
    species: 'Sneasler', regulation: 'm-c',
    observations: [
      { kind: 'speed', referenceSpeed: 167, relation: 'outsped' },
      { kind: 'damageDealt', move: 'Close Combat', target: { species: 'Rillaboom', level: 50, nature: 'Adamant', evs: { hp: 252, atk: 252 } }, percent: 71 },
      { kind: 'damageTaken', move: 'Flare Blitz', attacker: { species: 'Incineroar', level: 50, nature: 'Careful', championsPoints: { hp: 32, def: 14, spd: 20 } }, percentTaken: 80 },
    ],
  }],
  ['optimize_team', {
    team: [
      { species: 'Garchomp', nature: 'Jolly', evs: { atk: 252, spe: 252 } },
      { species: 'Incineroar', nature: 'Careful', championsPoints: { hp: 32, def: 14, spd: 20 } },
      { species: 'Rillaboom', nature: 'Adamant', evs: { hp: 252, atk: 252 } },
    ],
    slots: 2,
  }],
  ['analyze_battle', { mode: 'replay', 
    log: '|player|p1|Alice|\n|player|p2|Bob|\n|teamsize|p1|2|p2|2\n|switch|p1a: Sneasler|Sneasler, F|100/100\n|switch|p2a: Rillaboom|Rillaboom|100/100\n|turn|1\n|move|p1a: Sneasler|Close Combat|p2a: Rillaboom\n|-damage|p2a: Rillaboom|71/100\n|move|p2a: Rillaboom|Grassy Glide|p1a: Sneasler\n|-damage|p1a: Sneasler|45/100\n|turn|2\n|move|p1a: Sneasler|Dire Claw|p2a: Rillaboom\n|-damage|p2a: Rillaboom|8/100\n|faint|p2a: Rillaboom\n|switch|p2a: Gholdengo|Gholdengo|100/100\n|turn|3\n|move|p2a: Gholdengo|Make It Rain|p1a: Sneasler\n|-damage|p1a: Sneasler|0/100\n|faint|p1a: Sneasler\n|win|Bob',
  }],
  ['analyze_team', { mode: 'synergy', 
    team: [
      { species: 'Garchomp', moves: ['Earthquake'] },
      { species: 'Gholdengo', moves: ['Make It Rain'] },
    ],
  }],
  ['calculate', { mode: 'damage', 
    attacker: { species: 'Garchomp', level: 50, nature: 'Jolly', evs: { atk: 252 } },
    defender: { species: 'Corviknight', level: 50, nature: 'Impish', evs: { hp: 252, def: 252 } },
    move: 'Dragon Claw',
    field: { gameType: 'Doubles', weather: 'Rain', terrain: 'Electric', attackerSide: { isReflect: true }, defenderSide: { isLightScreen: true } },
  }],
];

let failed = 0;

// Client identity: the initialize handshake must tell every client this server
// is about Pokémon Champions — a titled, described serverInfo plus model-facing
// instructions — and every tool description must name the game, so a client
// that surfaces only the tool list still knows what it is connected to.
const serverInfo = client.getServerVersion() ?? {};
if (!serverInfo.title || !serverInfo.description?.includes('Champions') || !serverInfo.websiteUrl) {
  console.log(`=== initialize serverInfo is not Champions-titled: ${JSON.stringify(serverInfo)} ===`);
  failed++;
}
if (!client.getInstructions()?.includes('Champions')) {
  console.log('=== initialize instructions do not name the game ===');
  failed++;
}
for (const t of listed.tools) {
  if (!t.description?.includes('Champions')) {
    console.log(`=== ${t.name} description does not name the game ===`);
    failed++;
  }
}

// Champions only: the Smogon-tier and archetype surface was removed deliberately
// and must not creep back in.
for (const gone of ['list_tiers', 'list_speed_tiers', 'list_archetypes', 'get_archetype']) {
  if (listed.tools.some((t) => t.name === gone)) {
    console.log(`=== ${gone} is exposed but should not be ===`);
    failed++;
  }
}

// The MCP App surface: one bundled HTML resource, registered once, linked from
// the three App tools, and served byte-identical over every transport — never a
// runtime filesystem path. Non-App tools carry no `_meta.ui` at all.
{
  const check = (label, ok) => {
    console.log(`=== ${label} => ${ok} ===`);
    if (!ok) failed++;
  };
  const uiTools = listed.tools.filter((t) => ['analyze_team', 'optimize_team', 'prepare_matchup'].includes(t.name));
  check(
    'the three App tools point at the workspace resource',
    uiTools.length === 3 && uiTools.every((t) => t._meta?.ui?.resourceUri === 'ui://getcompetitive/workspace'),
  );
  check(
    'no other tool is App-linked',
    listed.tools.every((t) => ['analyze_team', 'optimize_team', 'prepare_matchup'].includes(t.name) || t._meta?.ui === undefined),
  );
  const resources = (await client.listResources()).resources;
  const ws = resources.find((r) => r.uri === 'ui://getcompetitive/workspace');
  check('the workspace resource is listed with the app mime type', !!ws && ws.mimeType === 'text/html;profile=mcp-app');
  const read = await client.readResource({ uri: 'ui://getcompetitive/workspace' });
  const html = read.contents.map((c) => ('text' in c ? c.text : '')).join('');
  check(
    'the workspace resource serves the bundled app, not a dev path',
    read.contents.some((c) => c.mimeType === 'text/html;profile=mcp-app' && c.uri === 'ui://getcompetitive/workspace') &&
      html.includes('id="root"') &&
      html.includes('getcompetitive') &&
      !html.includes('src/'),
  );
  const synergy = await client.callTool({
    name: 'analyze_team',
    arguments: { mode: 'synergy', team: [{ species: 'Garchomp', moves: ['Earthquake'] }], regulation: 'm-c' },
  });
  check(
    'an App-linked result is wrapped in the versioned envelope',
    !synergy.isError &&
      synergy.structuredContent.schemaVersion === 1 &&
      synergy.structuredContent.view === 'teamDoctor' &&
      synergy.structuredContent.tool === 'analyze_team' &&
      synergy.structuredContent.mode === 'synergy' &&
      typeof synergy.structuredContent.data.score.overall === 'number',
  );
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
  ['lookup', { mode: 'species', species: 'NotAMon' }],
  ['calculate', { mode: 'stats', species: 'Garchomp', level: 50, evs: { atk: 999 } }],
  ['calculate', { mode: 'stats', species: 'Garchomp', level: 50, evs: { spe: 4 }, championsPoints: { spe: 32 } }],
  ['calculate', { mode: 'stats', species: 'Garchomp', level: 50, championsPoints: { hp: 32, atk: 32, spe: 32 } }],
  ['lookup', { mode: 'matchup', attacker: 'Fire', defender: 'Bogus' }],
  ['team_io', { mode: 'parse', text: '' }],
  ['analyze_team', { mode: 'diagnose', team: [{ species: 'NotAMon' }] }],
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
    name: 'team_io',
    arguments: {
      mode: 'legality',
      detail: 'evidence',
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
const threats = (await client.callTool({ name: 'analyze_meta', arguments: { mode: 'threats', regulation: 'm-c' } })).structuredContent.threats;
for (const threat of threats) {
  const species = threat.megaForm ?? threat.form ?? threat.species;
  const rejected = [...(await legalMoves(species, threat.moves))].filter(([, legal]) => !legal).map(([move]) => move);
  if (rejected.length) {
    console.log(`=== generated set ${species} rejected by check_legality: ${rejected.join(', ')} ===`);
    failed++;
  }
}
console.log(`=== ${threats.length} generated sets all pass check_legality ===`);

// The record of sets the reasoning generated: a per-user file, never blended
// with the usage-derived meta. `Annihilape` is off the M-C list on purpose, so
// the record is the only thing that can answer for it.
{
  const check = (label, ok) => {
    console.log(`=== ${label} => ${ok} ===`);
    if (!ok) failed++;
  };
  const proposed = {
    species: 'Annihilape',
    item: 'Leftovers',
    ability: 'Defiant',
    nature: 'Adamant',
    championsPoints: { hp: 32, atk: 32, spd: 2 },
    moves: ['Rage Fist', 'Drain Punch', 'Protect', 'Bulk Up'],
  };
  const write = (set, extra = {}) =>
    client.callTool({ name: 'record_set', arguments: { set, basis: 'proposed', tool: 'diagnose_team', regulation: 'm-c', ...extra } });

  // A species the meta has no set for: without a record it is a usage miss that
  // names the way to read records back.
  const miss = await client.callTool({ name: 'analyze_meta', arguments: { mode: 'set', species: 'Annihilape' } });
  check('an unranked species is a usage miss that points at includeRecorded', !!miss.isError && miss.content[0].text.includes('includeRecorded'));

  const first = await write(proposed, { note: 'derived for a scratch team' });
  check(
    'record_set files a generated set',
    !first.isError && first.structuredContent.created === true && first.structuredContent.stored === 1 && first.structuredContent.species === 'Annihilape',
  );
  check('a record carries no usage figure and gets a canonical id', first.structuredContent.usage === undefined && first.structuredContent.id.startsWith('gc_'));

  const again = await write(proposed);
  check('re-recording an identical set writes nothing', !again.isError && again.structuredContent.created === false && again.structuredContent.id === first.structuredContent.id);
  check('the store holds one line for one set', readFileSync(storeFile, 'utf8').trim().split('\n').length === 1);

  // The same spread in the other scale is the same set, so it must not file twice.
  const evScale = await write({ ...proposed, championsPoints: undefined, evs: { hp: 252, atk: 252, spd: 16 } });
  check('the two spread scales hash to one record', !evScale.isError && evScale.structuredContent.created === false && evScale.structuredContent.id === first.structuredContent.id);

  const changed = await client.callTool({
    name: 'record_set',
    arguments: { set: { ...proposed, championsPoints: { hp: 32, atk: 20, spe: 14 } }, basis: 'inferred', tool: 'infer_set', regulation: 'm-c' },
  });
  check('a changed spread is a new record', !changed.isError && changed.structuredContent.created === true && changed.structuredContent.id !== first.structuredContent.id);

  // Reading back: a usage set keeps its usage fields and gains the records; an
  // unranked species is answered by its records alone.
  const ranked = await client.callTool({ name: 'analyze_meta', arguments: { mode: 'set', species: 'Garchomp', includeRecorded: true } });
  check('a usage set still answers with its usage fields', !ranked.isError && typeof ranked.structuredContent.usage === 'number' && ranked.structuredContent.recorded === undefined);

  const alone = await client.callTool({ name: 'analyze_meta', arguments: { mode: 'set', species: 'Annihilape', includeRecorded: true } });
  check(
    'an unranked species answers with its records alone',
    !alone.isError && alone.structuredContent.usage === undefined && alone.structuredContent.recorded.length === 2,
  );

  // The batch path answers through the same shape, so a record-only entry must
  // not be rejected as outside its schema.
  const batch = await client.callTool({ name: 'analyze_meta', arguments: { mode: 'set', species: ['Garchomp', 'Annihilape'], includeRecorded: true } });
  check(
    'a batched read mixes usage sets and record-only answers',
    !batch.isError &&
      batch.structuredContent.sets.length === 2 &&
      typeof batch.structuredContent.sets[0].usage === 'number' &&
      batch.structuredContent.sets[1].usage === undefined &&
      batch.structuredContent.sets[1].recorded.length === 2,
  );
  check(
    'a record comes back with its paste and origin, labelled by basis',
    alone.structuredContent.recorded[0].paste.startsWith('Annihilape @ Leftovers') &&
      alone.structuredContent.recorded[0].origin.tool === 'diagnose_team' &&
      alone.structuredContent.recorded[0].basis === 'proposed' &&
      alone.structuredContent.recorded[1].basis === 'inferred',
  );

  const bogus = await write({ ...proposed, species: 'NotAMon' });
  check('an unresolvable species is refused, not filed', !!bogus.isError);
  check('the refusal left the store alone', readFileSync(storeFile, 'utf8').trim().split('\n').length === 2);

  // A process killed mid-append leaves a partial line; skipping it must not cost
  // the records around it, and the count has to be visible rather than silent.
  appendFileSync(storeFile, '{"id":"gc_trunc","species":"Annih');
  const afterTear = await client.callTool({ name: 'record_set', arguments: { set: { ...proposed, championsPoints: { hp: 32, atk: 20, spe: 14 } }, basis: 'inferred', tool: 'infer_set', regulation: 'm-c' } });
  check('a torn line is skipped, not fatal', !afterTear.isError && afterTear.structuredContent.created === false && afterTear.structuredContent.stored === 2 && afterTear.structuredContent.skipped === 1);
}

// get_sprites acceptance: batch order, partial failure, dex numbers, artwork vs
// icon, and purity (deterministic table lookup — no runtime network anywhere).
{
  const check = (label, ok) => {
    console.log(`=== ${label} => ${ok} ===`);
    if (!ok) failed++;
  };
  const batch = await client.callTool({
    name: 'lookup',
    arguments: { mode: 'sprites', species: ['Garchomp', 'Rotom-Wash', 'Indeedee', 'Salamence-Mega', 'NotAMon', 'Annihilape'] },
  });
  const { sprites, unresolved, note } = batch.structuredContent;
  check('get_sprites resolves a batched team in order', !batch.isError && sprites.map((s) => s.species).join(',') === 'Garchomp,Rotom-Wash,Indeedee,Salamence-Mega,Annihilape');
  check('get_sprites reports partial failure instead of failing the batch', unresolved?.length === 1 && unresolved[0] === 'NotAMon');
  check('get_sprites carries National Dex numbers', sprites.every((s, i) => s.dexNumber === [445, 479, 876, 373, 979][i]));
  check('get_sprites artwork URLs point at official artwork', sprites.every((s) => s.url.includes('/other/official-artwork/') && s.url.endsWith('.png')));
  const icon = await client.callTool({ name: 'lookup', arguments: { mode: 'sprites', species: ['Garchomp'], size: 'icon' } });
  check('get_sprites icon URLs point at the game sprite', icon.structuredContent.sprites[0].url.endsWith('/sprites/pokemon/445.png'));
  const again = await client.callTool({ name: 'lookup', arguments: { mode: 'sprites', species: ['Garchomp'] } });
  check(
    'get_sprites is deterministic and pure (committed table, no runtime I/O)',
    JSON.stringify(again.structuredContent) === JSON.stringify({ sprites: [sprites[0]], note }),
  );
}

// The paste is the artefact a player copies into the game, so it must be written
// in Champions stat points (0-32 each, 66 total) — never the 0-252 calc scale.
const pasteSet = await client.callTool({ name: 'analyze_meta', arguments: { mode: 'set', species: 'Rillaboom' } });
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
  const cm = await client.callTool({ name: 'analyze_meta', arguments: { mode: 'compare', } });
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
  check(
    'compare_meta carries rank deltas, lift and set changes',
    md.rising.every((s) => typeof s.rankDelta === 'number') &&
      md.emergingCores.every((c) => typeof c.liftCurrent === 'number' && c.liftCurrent > 0) &&
      Array.isArray(md.setChanges) && md.setChanges.every((s) => s.item !== undefined),
  );
  const cmErr = await client.callTool({ name: 'analyze_meta', arguments: { mode: 'compare', regulation: 'm-a' } });
  check('compare_meta names the regulations with history', !!cmErr.isError && cmErr.content[0].text.includes('m-c'));

  const rp = await client.callTool({
    name: 'analyze_battle',
    arguments: {
      mode: 'replay',
      detail: 'evidence',
      log: '|player|p1|Alice|\n|player|p2|Bob|\n|switch|p1a: Sneasler|Sneasler|100/100\n|switch|p2a: Rillaboom|Rillaboom|100/100\n|turn|1\n|move|p1a: Sneasler|Close Combat|p2a: Rillaboom\n|-damage|p2a: Rillaboom|71/100\n|move|p2a: Rillaboom|Grassy Glide|p1a: Sneasler\n|-damage|p1a: Sneasler|45/100\n|faint|p2a: Rillaboom\n|win|Alice',
    },
  });
  const r = rp.structuredContent;
  check(
    'analyze_replay parses teams, KO and winner',
    !rp.isError && r.players.join(',') === 'Alice,Bob' && r.winner === 'Alice' && r.turns === 1 && r.kos.length === 1 && r.kos[0].move === 'Close Combat' && r.teams.p2.includes('Rillaboom'),
  );
  check('analyze_replay reads speed and damage from the log', r.speedConstraints.length === 1 && r.speedConstraints[0].faster.includes('Sneasler') && r.damageEvents[0].percent === 71);
  const dx = await client.callTool({ name: 'analyze_team', arguments: { mode: 'diagnose', detail: 'evidence', team: [{ species: 'Garchomp' }] } });
  check(
    'diagnose_team changes carry dataUpdated provenance',
    dx.structuredContent.data.candidateChanges.every((c) => typeof c.dataUpdated === 'string'),
  );
}
// P3: set inference narrows monotonically and recovers the meta set, and the
// team optimizer respects the constraints and Species Clause.
{
  const check = (label, ok) => {
    console.log(`=== ${label} => ${ok} ===`);
    if (!ok) failed++;
  };
  const inf = await client.callTool({
    name: 'analyze_battle',
    arguments: {
      mode: 'infer',
      detail: 'evidence',
      species: 'Sneasler', regulation: 'm-c',
      observations: [
        { kind: 'speed', referenceSpeed: 167, relation: 'outsped' },
        { kind: 'damageDealt', move: 'Close Combat', target: { species: 'Rillaboom', level: 50, nature: 'Adamant', evs: { hp: 252, atk: 252 } }, percent: 71 },
        { kind: 'damageTaken', move: 'Flare Blitz', attacker: { species: 'Incineroar', level: 50, nature: 'Careful', championsPoints: { hp: 32, def: 14, spd: 20 } }, percentTaken: 80 },
      ],
    },
  });
  const d = inf.structuredContent;
  check(
    'infer_set narrows monotonically and keeps survivors',
    !inf.isError && d.constraints.length === 3 && d.constraints.every((k) => k.after <= k.before && k.after > 0) && d.candidates.length > 0,
  );
  check(
    'infer_set recovers the meta set as most likely',
    d.candidates[0].item === 'Grassy Seed' && d.candidates[0].nature === 'Adamant' && d.candidates[0].speed > 167,
  );
  check(
    'infer_set probabilities are a valid share of survivors',
    d.candidates.every((c, i) => c.probability > 0 && c.probability <= 100 && (i === 0 || c.probability <= d.candidates[i - 1].probability)) &&
      (d.survivingSets <= 8 ? Math.abs(d.candidates.reduce((a, c) => a + c.probability, 0) - 100) < 1 : d.candidates.reduce((a, c) => a + c.probability, 0) < 100),
  );
  const infX = await client.callTool({
    name: 'analyze_battle',
    arguments: {
      mode: 'infer',
      detail: 'evidence',
      species: 'Sneasler', regulation: 'm-c',
      observations: [
        { kind: 'speed', referenceSpeed: 167, relation: 'outsped' },
        { kind: 'damageDealt', move: 'Close Combat', target: { species: 'Rillaboom', level: 50, nature: 'Adamant', evs: { hp: 252, atk: 252 } }, percent: 71 },
        { kind: 'damageTaken', move: 'Psychic', attacker: { species: 'Farigiraf', level: 50, nature: 'Modest', evs: { spa: 252 }, item: 'Choice Specs' }, percentTaken: 88 },
      ],
    },
  });
  check(
    'infer_set eliminates impossible observations cleanly',
    !infX.isError && infX.structuredContent.candidates.length === 0 && infX.structuredContent.constraints[2].after === 0,
  );

  const opt = await client.callTool({
    name: 'optimize_team',
    arguments: {
      team: [
        { species: 'Garchomp', nature: 'Jolly', evs: { atk: 252, spe: 252 } },
        { species: 'Incineroar', nature: 'Careful', championsPoints: { hp: 32, def: 14, spd: 20 } },
        { species: 'Rillaboom', nature: 'Adamant', evs: { hp: 252, atk: 252 } },
      ],
      slots: 2,
    },
  });
  const o = opt.structuredContent.data;
  check(
    'optimize_team fills both slots with reasons and respects Species Clause',
    !opt.isError &&
      o.constraints.threats.length === 5 &&
      o.recommendations.length > 0 &&
      o.recommendations.every((r) => r.members.length === 2 && r.reasons.length > 0 && r.reasons.every((reason) => typeof reason === 'string' && reason.length > 1) && !['Garchomp', 'Incineroar', 'Rillaboom'].some((t) => r.members.includes(t))),
  );
}

// P1: the shared MatchupEvaluator upgrades the analysis tools' answers from
// type multipliers to battle math, and prepare_matchup scores every four.
{
  const check = (label, ok) => {
    console.log(`=== ${label} => ${ok} ===`);
    if (!ok) failed++;
  };
  const team = [
    { species: 'Garchomp', item: 'Garchompite', nature: 'Jolly', evs: { atk: 252, spe: 252 }, moves: ['Swords Dance', 'Earthquake', 'Dragon Claw', 'Rock Slide'] },
    { species: 'Incineroar', item: 'Sitrus Berry', nature: 'Careful', championsPoints: { hp: 32, def: 14, spd: 20 }, moves: ['Fake Out', 'Flare Blitz', 'Parting Shot', 'Knock Off'] },
    { species: 'Rillaboom', item: 'Assault Vest', nature: 'Adamant', evs: { hp: 252, atk: 252 }, moves: ['Fake Out', 'Grassy Glide', 'Wood Hammer', 'U-turn'] },
  ];
  const at = await client.callTool({ name: 'analyze_team', arguments: { mode: 'synergy', team, regulation: 'm-c' } });
  const rows = at.structuredContent.data.threatCoverage.threats;
  check(
    'analyze_team threat rows carry battle-math answerClass',
    rows.every((r) => typeof r.answerClass === 'string' && typeof r.answerBy === 'string') &&
      rows.some((r) => r.answerClass === 'UNFAVORABLE' && r.hitMultiplier >= 2),
  );
  const dx = await client.callTool({ name: 'analyze_team', arguments: { mode: 'diagnose', team } });
  check(
    'diagnose_team problems agree with the evaluator',
    dx.structuredContent.data.problems.some((p) => /initiative|No reliable answer/.test(p.statement)),
  );
  const six = [
    { species: 'Garchomp', item: 'Garchompite', nature: 'Jolly', evs: { atk: 252, spe: 252 }, moves: ['Swords Dance', 'Earthquake', 'Dragon Claw', 'Rock Slide'] },
    { species: 'Incineroar', item: 'Sitrus Berry', nature: 'Careful', championsPoints: { hp: 32, def: 14, spd: 20 }, moves: ['Fake Out', 'Flare Blitz', 'Parting Shot', 'Knock Off'] },
    { species: 'Rillaboom', item: 'Assault Vest', nature: 'Adamant', evs: { hp: 252, atk: 252 }, moves: ['Fake Out', 'Grassy Glide', 'Wood Hammer', 'U-turn'] },
    { species: 'Pelipper', item: 'Damp Rock', nature: 'Bold', evs: { hp: 252, def: 252 }, moves: ['Scald', 'Hurricane', 'U-turn', 'Roost'] },
    { species: 'Farigiraf', item: 'Sitrus Berry', nature: 'Bold', evs: { hp: 252, def: 252 }, moves: ['Trick Room', 'Psychic', 'Helping Hand', 'Protect'] },
    { species: 'Rotom-Wash', item: 'Sitrus Berry', nature: 'Bold', evs: { hp: 252, def: 252 }, moves: ['Volt Switch', 'Hydro Pump', 'Will-O-Wisp', 'Protect'] },
  ];
  const mp = await client.callTool({
    name: 'prepare_matchup',
    arguments: {
      detail: 'evidence', team: six, opponent: ['Sneasler', 'Salamence-Mega', 'Gholdengo', 'Farigiraf', 'Kingambit', 'Rillaboom'] },
  });
  const bf = mp.structuredContent.data.recommendedBringFour;
  check(
    'prepare_matchup scores every four and reports alternates',
    !mp.isError && bf.picks.length === 4 && bf.alternates.length === 2 && typeof bf.score === 'number' && bf.leftBehind.length === 2,
  );
  check(
    'prepare_matchup leads are scored pairings',
    mp.structuredContent.data.possibleLeads.pairs.length >= 1 && mp.structuredContent.data.possibleLeads.pairs[0].support.includes('Incineroar'),
  );
  const compact = await client.callTool({ name: 'analyze_team', arguments: { mode: 'synergy', team, regulation: 'm-c' } });
  const evidence = await client.callTool({ name: 'analyze_team', arguments: { mode: 'synergy', team, regulation: 'm-c', detail: 'evidence' } });
  const debug = await client.callTool({ name: 'analyze_team', arguments: { mode: 'synergy', team, regulation: 'm-c', detail: 'debug' } });
  check(
    'response levels: compact is default, evidence expands, debug adds provenance',
    !('defensiveWeaknesses' in compact.structuredContent.data) &&
      'defensiveWeaknesses' in evidence.structuredContent.data &&
      !!debug.structuredContent.data.engine?.version &&
      !('engine' in evidence.structuredContent.data) &&
      Buffer.byteLength(JSON.stringify(compact.structuredContent)) < Buffer.byteLength(JSON.stringify(evidence.structuredContent)),
  );
}

// P2: the scouting pipeline — replay to normalized observations to set inference.
{
  const check = (label, ok) => {
    console.log(`=== ${label} => ${ok} ===`);
    if (!ok) failed++;
  };
  const sc = await client.callTool({
    name: 'analyze_battle',
    arguments: {
      mode: 'scout',
      log: [
        '|player|p1|Alice|', '|player|p2|Bob|',
        '|switch|p1a: Garchomp|Garchomp|100/100', '|switch|p2a: Sneasler|Sneasler, F|100/100',
        '|turn|1',
        '|move|p2a: Sneasler|Close Combat|p1a: Garchomp', '|-damage|p1a: Garchomp|61/100',
        '|move|p1a: Garchomp|Rock Slide|p2a: Sneasler', '|-damage|p2a: Sneasler|77/100',
        '|-item|p2a: Sneasler|Grassy Seed',
        '|turn|2',
        '|move|p2a: Sneasler|Dire Claw|p1a: Garchomp', '|-damage|p1a: Garchomp|23/100',
        '|move|p1a: Garchomp|Rock Slide|p2a: Sneasler', '|-damage|p2a: Sneasler|54/100',
        '|faint|p2a: Sneasler',
        '|win|Alice',
      ].join('\n'),
      team: [{ species: 'Garchomp', nature: 'Jolly', evs: { atk: 252, spe: 252 }, moves: ['Earthquake', 'Dragon Claw', 'Rock Slide'] }],
      species: 'Sneasler',
      regulation: 'm-c',
    },
  });
  check(
    'analyze_battle scout runs the replay-to-inference pipeline',
    !sc.isError && sc.structuredContent.observations.length >= 3 && sc.structuredContent.inference.survivingSets > 0 && sc.structuredContent.inference.candidates[0].nature === 'Adamant' && sc.structuredContent.rematch.note.includes('prepare_matchup'),
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
    'seven workflow prompts are discoverable',
    promptList.length === 7 &&
      ['team-doctor', 'matchup-prep', 'build-around', 'tournament-prep', 'learn-my-team', 'meta-report', 'scout-opponent'].every((n) =>
        promptList.some((p) => p.name === n),
      ),
  );
  const got = await client.getPrompt({ name: 'matchup-prep', arguments: { opponent: 'Sneasler', regulation: 'm-c' } });
  const ptext = got.messages[0].content.text;
  check('matchup-prep chains the real tools', ['prepare_matchup', 'team_io', 'Sneasler'].every((t) => ptext.includes(t)));

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
    const app = await fetch('http://127.0.0.1:3207/');
    check('HTTP entrypoint serves the evidence app', app.status === 200 && (await app.text()).includes('THREAT MATRIX'));
    const httpClient = new Client({ name: 'smoke-http', version: '0' });
    await httpClient.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:3207/mcp')));
    const httpTools = (await httpClient.listTools()).tools;
    const sprite = await httpClient.callTool({ name: 'lookup', arguments: { mode: 'sprites', species: ['Garchomp'], size: 'icon' } });
    check('HTTP entrypoint serves the same 9 tools', httpTools.length === 9);
    check('HTTP entrypoint answers a tool call', sprite.structuredContent.sprites[0].url.endsWith('445.png'));
    await httpClient.close();
  } finally {
    child.kill();
  }
}

// P3: the serverless entrypoint — the hosted-MCP artifact — answers the same surface.
{
  const check = (label, ok) => {
    console.log(`=== ${label} => ${ok} ===`);
    if (!ok) failed++;
  };
  const worker = (await import('../dist/worker.js')).default;
  const post = (body) =>
    new Request('http://host/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(body),
    });
  const parse = async (res) => {
    const text = await res.text();
    const data = text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n');
    return JSON.parse(data || text);
  };
  const init = await worker.fetch(post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke-worker', version: '0' } } }));
  const listed = await parse(await worker.fetch(post({ jsonrpc: '2.0', id: 2, method: 'tools/list' })));
  const run = await parse(await worker.fetch(post({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'lookup', arguments: { mode: 'species', species: 'Garchomp' } } })));
  check(
    'serverless entrypoint serves the same 9 tools',
    init.status === 200 && listed.result.tools.length === 9 && JSON.parse(run.result.content[0].text).types.join('/') === 'Dragon/Ground',
  );
  const wsRead = await parse(await worker.fetch(post({ jsonrpc: '2.0', id: 4, method: 'resources/read', params: { uri: 'ui://getcompetitive/workspace' } })));
  check(
    'the worker artifact embeds the workspace resource',
    wsRead.result.contents.some((c) => c.mimeType === 'text/html;profile=mcp-app' && c.text.includes('id="root"') && c.text.includes('getcompetitive')),
  );
}

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILURES`);
await client.close();
rmSync(scratch, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
