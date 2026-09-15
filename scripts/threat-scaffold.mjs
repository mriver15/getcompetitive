// Scaffold a new threat list for a regulation. Prints the legal Mega roster
// (the marquee mechanic) and the full eligible list to guide authoring, then
// emits a stub ThreatList entry to paste into src/threats.ts.
//
// Usage: node scripts/threat-scaffold.mjs m-c
import { Dex } from '@pkmn/dex';
import { readFileSync } from 'node:fs';

const [, , regulation] = process.argv;
if (!regulation) {
  console.error('Usage: node scripts/threat-scaffold.mjs <regulation-id>');
  process.exit(1);
}

// Import the generated regulation data (TS) via a dynamic eval-free approach:
// read the JSON-ish object by executing the module through a tiny inline import.
const data = await import(`../dist/regulations.data.js`);
const list = data.default[regulation.toLowerCase()];
if (!list) {
  console.error(`No regulation data for "${regulation}". Run scripts/extract-regs.mjs first.`);
  process.exit(1);
}

const dex = Dex.forGen(9);
console.log(`Regulation ${regulation}: ${list.eligibleSpecies.length} legal base species, ${list.megaEvolutions.length} Mega-capable.`);
console.log('\nMega-capable species (marquee mechanic):\n  ' + list.megaEvolutions.join(', '));
console.log('\nFull legal roster:\n  ' + list.eligibleSpecies.join(', '));
console.log('\n\nPaste this stub into src/threats.ts and fill in threats:\n');
console.log(`  '${regulation}': {\n    regulation: '${regulation}',\n    name: 'Regulation Set ${regulation.toUpperCase()}',\n    source: 'curated',\n    sourceAsOf: 'YYYY-MM-DD',\n    note: 'Curated editorial threat list, not usage-derived.',\n    threats: [],\n  },`);
