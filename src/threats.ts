/**
 * Curated meta threat list + standard sets for Pokémon Champions regulations.
 *
 * This is EDITORIAL content, not usage-derived statistics. It reflects
 * established competitive knowledge applied to each regulation's legal roster
 * (Mega Evolution is the marquee mechanic; Legendary/Restricted Pokémon are
 * banned in the M-A/M-B/M-C era). Treat tiers and sets as informed starting
 * points, not authoritative usage data.
 *
 * To add a new regulation:
 *   1. `node scripts/extract-regs.mjs`        (refresh legal rosters)
 *   2. add the set metadata in `src/regulations.ts`
 *   3. `node scripts/threat-scaffold.mjs m-d` (print the Mega roster to guide authoring)
 *   4. add a `ThreatList` entry here keyed by the new regulation id
 */

export type ThreatTier = 'S' | 'A' | 'B';

export interface Threat {
  /** Base species name (Showdown). */
  species: string;
  /** Short competitive role. */
  role: string;
  /** Subjective tier within this regulation. */
  tier: ThreatTier;
  item: string;
  /** Ability on the base form (before Mega). */
  ability: string;
  /** Mega form name, if the set is a Mega set. */
  megaForm?: string;
  /** Ability after Mega Evolving (differs for Mega sets). */
  megaAbility?: string;
  nature: string;
  evs: Record<string, number>;
  moves: string[];
  teraType?: string;
  notes?: string;
}

export interface ThreatList {
  regulation: string;
  name: string;
  source: 'curated';
  sourceAsOf: string;
  note: string;
  threats: Threat[];
}

const THREATS_M_C: Threat[] = [
  {
    species: 'Incineroar',
    role: 'Intimidate support pivot',
    tier: 'S',
    item: 'Safety Goggles',
    ability: 'Intimidate',
    nature: 'Careful',
    evs: { hp: 252, spd: 252, def: 4 },
    moves: ['Fake Out', 'Flare Blitz', 'Knock Off', 'U-turn'],
    teraType: 'Ghost',
    notes: 'The format-defining support: Fake Out + Intimidate + slow U-turn. Ghost Tera dodges Fake Out and Fighting.',
  },
  {
    species: 'Garchomp',
    role: 'Mega sweeper / wallbreaker',
    tier: 'S',
    item: 'Garchompite',
    ability: 'Rough Skin',
    megaForm: 'Mega Garchomp',
    megaAbility: 'Sand Force',
    nature: 'Jolly',
    evs: { atk: 252, spe: 252, hp: 4 },
    moves: ['Swords Dance', 'Earthquake', 'Dragon Claw', 'Rock Slide'],
    teraType: 'Steel',
    notes: 'Premier Mega. Sand Force in sand, Swords Dance to break walls, Rock Slide for Flying coverage.',
  },
  {
    species: 'Salamence',
    role: 'Mega Dragon Dance sweeper',
    tier: 'S',
    item: 'Salamencite',
    ability: 'Intimidate',
    megaForm: 'Mega Salamence',
    megaAbility: 'Aerilate',
    nature: 'Adamant',
    evs: { atk: 252, spe: 252, hp: 4 },
    moves: ['Dragon Dance', 'Dual Wingbeat', 'Earthquake', 'Roost'],
    teraType: 'Steel',
    notes: 'Intimidate pre-Mega, Aerilate-boosted Flying STAB after. One Dragon Dance ends games.',
  },
  {
    species: 'Kangaskhan',
    role: 'Mega pressure',
    tier: 'S',
    item: 'Kangaskhanite',
    ability: 'Scrappy',
    megaForm: 'Mega Kangaskhan',
    megaAbility: 'Parental Bond',
    nature: 'Jolly',
    evs: { atk: 252, spe: 252, hp: 4 },
    moves: ['Fake Out', 'Body Slam', 'Sucker Punch', 'Crunch'],
    teraType: 'Normal',
    notes: 'Parental Bond double-hits everything; Fake Out + Sucker Punch chip is relentless.',
  },
  {
    species: 'Gholdengo',
    role: 'Good as Gold breaker',
    tier: 'S',
    item: 'Life Orb',
    ability: 'Good as Gold',
    nature: 'Timid',
    evs: { spa: 252, spe: 252, hp: 4 },
    moves: ['Nasty Plot', 'Make It Rain', 'Shadow Ball', 'Recover'],
    teraType: 'Flying',
    notes: 'Good as Gold blocks status and pivots around; Make It Rain is a nuke. Flying Tera flips its Ground weakness.',
  },
  {
    species: 'Lucario',
    role: 'Mega mixed sweeper',
    tier: 'A',
    item: 'Lucarionite',
    ability: 'Justified',
    megaForm: 'Mega Lucario',
    megaAbility: 'Adaptability',
    nature: 'Jolly',
    evs: { atk: 252, spe: 252, hp: 4 },
    moves: ['Swords Dance', 'Close Combat', 'Meteor Mash', 'Extreme Speed'],
    teraType: 'Steel',
    notes: 'Adaptability turns Close Combat into a delete button; Extreme Speed picks off weakened threats.',
  },
  {
    species: 'Dragapult',
    role: 'Fast pivot / special breaker',
    tier: 'A',
    item: 'Choice Specs',
    ability: 'Infiltrator',
    nature: 'Timid',
    evs: { spa: 252, spe: 252, hp: 4 },
    moves: ['Draco Meteor', 'Shadow Ball', 'U-turn', 'Thunderbolt'],
    teraType: 'Ghost',
    notes: 'Fastest relevant mon in the format; Infiltrator ignores screens/Substitute.',
  },
  {
    species: 'Charizard',
    role: 'Mega X sweeper',
    tier: 'A',
    item: 'Charizardite X',
    ability: 'Blaze',
    megaForm: 'Mega Charizard X',
    megaAbility: 'Tough Claws',
    nature: 'Adamant',
    evs: { atk: 252, spe: 252, hp: 4 },
    moves: ['Dragon Dance', 'Flare Blitz', 'Dragon Claw', 'Earthquake'],
    teraType: 'Fire',
    notes: 'Tough Claws + Dragon Dance makes Flare Blitz and Dragon Claw both stab-boosted nukes.',
  },
  {
    species: 'Gengar',
    role: 'Mega special breaker',
    tier: 'A',
    item: 'Gengarite',
    ability: 'Cursed Body',
    megaForm: 'Mega Gengar',
    megaAbility: 'Shadow Tag',
    nature: 'Timid',
    evs: { spa: 252, spe: 252, hp: 4 },
    moves: ['Nasty Plot', 'Shadow Ball', 'Sludge Bomb', 'Focus Blast'],
    teraType: 'Ghost',
    notes: 'Shadow Tag traps and removes a defensive piece; pairs with Perish Song.',
  },
  {
    species: 'Scizor',
    role: 'Mega priority + pivot',
    tier: 'A',
    item: 'Scizorite',
    ability: 'Technician',
    megaForm: 'Mega Scizor',
    megaAbility: 'Technician',
    nature: 'Adamant',
    evs: { hp: 252, atk: 252, def: 4 },
    moves: ['Swords Dance', 'Bullet Punch', 'U-turn', 'Close Combat'],
    teraType: 'Steel',
    notes: 'Technician Bullet Punch is the best priority in the format; U-turn keeps momentum.',
  },
  {
    species: 'Metagross',
    role: 'Mega bulky offense',
    tier: 'A',
    item: 'Metagrossite',
    ability: 'Clear Body',
    megaForm: 'Mega Metagross',
    megaAbility: 'Tough Claws',
    nature: 'Jolly',
    evs: { atk: 252, spe: 252, hp: 4 },
    moves: ['Meteor Mash', 'Zen Headbutt', 'Earthquake', 'Bullet Punch'],
    teraType: 'Steel',
    notes: 'Tough Claws buffs every attacking move; Bullet Punch for cleanup.',
  },
  {
    species: 'Tyranitar',
    role: 'Mega sand attacker',
    tier: 'A',
    item: 'Tyranitarite',
    ability: 'Sand Stream',
    megaForm: 'Mega Tyranitar',
    megaAbility: 'Sand Stream',
    nature: 'Adamant',
    evs: { atk: 252, spe: 252, hp: 4 },
    moves: ['Dragon Dance', 'Crunch', 'Earthquake', 'Stone Edge'],
    teraType: 'Rock',
    notes: 'Sets sand for the team and sweeps with Dragon Dance; also enables Sand Rush Excadrill.',
  },
  {
    species: 'Gardevoir',
    role: 'Mega special Fairy',
    tier: 'A',
    item: 'Gardevoirite',
    ability: 'Trace',
    megaForm: 'Mega Gardevoir',
    megaAbility: 'Pixilate',
    nature: 'Timid',
    evs: { spa: 252, spe: 252, hp: 4 },
    moves: ['Calm Mind', 'Moonblast', 'Psyshock', 'Mystical Fire'],
    teraType: 'Fairy',
    notes: 'Pixilate + Fairy STAB pressures Dark/Dragon; Calm Mind turns it into a win condition.',
  },
  {
    species: 'Gyarados',
    role: 'Mega Dragon Dance + Intimidate',
    tier: 'A',
    item: 'Gyaradosite',
    ability: 'Intimidate',
    megaForm: 'Mega Gyarados',
    megaAbility: 'Mold Breaker',
    nature: 'Jolly',
    evs: { atk: 252, spe: 252, hp: 4 },
    moves: ['Dragon Dance', 'Waterfall', 'Earthquake', 'Ice Fang'],
    teraType: 'Flying',
    notes: 'Intimidate support then Mold Breaker Waterfall ignores abilities like Levitate/Water Absorb.',
  },
  {
    species: 'Blaziken',
    role: 'Mega Speed Boost sweeper',
    tier: 'A',
    item: 'Blazikenite',
    ability: 'Speed Boost',
    megaForm: 'Mega Blaziken',
    megaAbility: 'Speed Boost',
    nature: 'Adamant',
    evs: { atk: 252, spe: 252, hp: 4 },
    moves: ['Protect', 'Swords Dance', 'Flare Blitz', 'Close Combat'],
    teraType: 'Fire',
    notes: 'Speed Boost snowballs; Protect farms a turn, Swords Dance makes it unstoppable.',
  },
  {
    species: 'Mawile',
    role: 'Mega Huge Power breaker',
    tier: 'A',
    item: 'Mawilite',
    ability: 'Intimidate',
    megaForm: 'Mega Mawile',
    megaAbility: 'Huge Power',
    nature: 'Adamant',
    evs: { hp: 252, atk: 252, def: 4 },
    moves: ['Swords Dance', 'Play Rough', 'Iron Head', 'Sucker Punch'],
    teraType: 'Fairy',
    notes: 'Huge Power + Swords Dance reaches absurd attack; Sucker Punch covers its low speed.',
  },
  {
    species: 'Grimmsnarl',
    role: 'Prankster screen setter',
    tier: 'A',
    item: 'Light Clay',
    ability: 'Prankster',
    nature: 'Careful',
    evs: { hp: 252, spd: 252, def: 4 },
    moves: ['Reflect', 'Light Screen', 'Spirit Break', 'Thunder Wave'],
    teraType: 'Steel',
    notes: 'Prankster dual screens enable every setup sweeper; Spirit Break drops the opponent\u2019s SpA.',
  },
  {
    species: 'Swampert',
    role: 'Mega Swift Swim (rain)',
    tier: 'B',
    item: 'Swampertite',
    ability: 'Damp',
    megaForm: 'Mega Swampert',
    megaAbility: 'Swift Swim',
    nature: 'Adamant',
    evs: { atk: 252, spe: 252, hp: 4 },
    moves: ['Waterfall', 'Earthquake', 'Ice Punch', 'Flip Turn'],
    teraType: 'Water',
    notes: 'Swift Swim under rain makes it the fastest rain breaker; Flip Turn pivots.',
  },
  {
    species: 'Sceptile',
    role: 'Mega special attacker',
    tier: 'B',
    item: 'Sceptilite',
    ability: 'Overgrow',
    megaForm: 'Mega Sceptile',
    megaAbility: 'Lightning Rod',
    nature: 'Timid',
    evs: { spa: 252, spe: 252, hp: 4 },
    moves: ['Leaf Storm', 'Giga Drain', 'Dragon Pulse', 'Focus Blast'],
    teraType: 'Grass',
    notes: 'Lightning Rod redirects Electric (great vs Rotom-Wash/Thunder) while it fires boosted Leaf Storm.',
  },
  {
    species: 'Whimsicott',
    role: 'Prankster speed control',
    tier: 'B',
    item: 'Focus Sash',
    ability: 'Prankster',
    nature: 'Timid',
    evs: { hp: 252, spe: 252, def: 4 },
    moves: ['Tailwind', 'Taunt', 'Encore', 'Moonblast'],
    teraType: 'Fairy',
    notes: 'Priority Tailwind + Taunt/Encore disruption; the format\u2019s best speed control.',
  },
  {
    species: 'Pelipper',
    role: 'Rain setter',
    tier: 'B',
    item: 'Damp Rock',
    ability: 'Drizzle',
    nature: 'Bold',
    evs: { hp: 252, def: 252, spd: 4 },
    moves: ['Scald', 'Hurricane', 'U-turn', 'Roost'],
    teraType: 'Water',
    notes: 'Drizzle powers Swift Swim (Mega Swampert) and 100%-accurate Hurricane; U-turn pivots.',
  },
  {
    species: 'Rotom-Wash',
    role: 'Bulky pivot',
    tier: 'B',
    item: 'Sitrus Berry',
    ability: 'Levitate',
    nature: 'Bold',
    evs: { hp: 252, def: 252, spd: 4 },
    moves: ['Volt Switch', 'Hydro Pump', 'Will-O-Wisp', 'Protect'],
    teraType: 'Electric',
    notes: 'Levitate + Will-O-Wisp walls physical attackers; Volt Switch keeps momentum.',
  },
];

export const THREAT_LISTS: Record<string, ThreatList> = {
  'm-c': {
    regulation: 'm-c',
    name: 'Regulation Set M-C',
    source: 'curated',
    sourceAsOf: '2026-09-14',
    note: 'Curated editorial threat list, not usage-derived. Mega Evolution is the marquee mechanic; Legendary/Restricted Pokémon are banned.',
    threats: THREATS_M_C,
  },
};

export function getThreatList(regulation: string): ThreatList | undefined {
  const q = regulation.toLowerCase();
  return Object.values(THREAT_LISTS).find(
    (l) => l.regulation === q || l.name.toLowerCase() === q || l.regulation.replace(/[^a-z0-9]/g, '') === q.replace(/[^a-z0-9]/g, ''),
  );
}

export function findThreat(species: string, regulation?: string): { list: ThreatList; threat: Threat } | undefined {
  const lists = regulation ? [getThreatList(regulation)].filter(Boolean) as ThreatList[] : Object.values(THREAT_LISTS);
  const q = species.toLowerCase();
  for (const list of lists) {
    const t = list.threats.find((x) => x.species.toLowerCase() === q);
    if (t) return { list, threat: t };
  }
  return undefined;
}
