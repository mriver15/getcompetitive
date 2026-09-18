import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

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
  ['list_speed_tiers', { tier: 'OU', level: 50, query: 'dragapult' }],
  ['list_tiers', { league: 'singles' }],
  ['list_archetypes', {}],
  ['get_archetype', { name: 'rain' }],
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
  ['list_tiers', { league: 'doubles', tier: 'duu' }],
  ['list_threats', {}],
  ['get_set', { species: 'Incineroar', regulation: 'm-c' }],
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

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILURES`);
await client.close();
process.exit(failed === 0 ? 0 : 1);
