/**
 * Official Pokémon Champions / VGC regulation sets.
 *
 * Eligible + Mega species lists are scraped from Bulbapedia (which mirrors the
 * official Play! Pokémon rules) by `scripts/extract-regs.mjs` and stored in
 * `regulations.data.json`. They are collapsed to BASE species because VGC
 * Species Clause is by National Pokédex number: every form of an eligible
 * species is legal. Metadata (dates, battle/team rules) is curated here.
 *
 * Data is seasonal and changes each Regulation Set. To update: edit METADATA,
 * then run `node scripts/extract-regs.mjs`.
 */
import raw from './regulations.data.js';

export type BattleType = 'Double Battles';

export interface BattleRules {
  battleType: BattleType;
  /** Bring 4 of a 6-Pokémon Battle Team. */
  bringPick: string;
  level: 50;
  timers: {
    gameMinutes: number;
    playerMinutes: number;
    moveSeconds: number;
    previewSeconds: number;
  };
  /** Swiss is BO1/BO3; all top cuts are best-of-three. */
  rounds: string;
}

export interface TeamRules {
  /** No two Pokémon of the same National Pokédex number. */
  speciesClause: true;
  /** No two Pokémon may hold the same item. */
  itemClause: true;
  /** Pokémon above/below level 50 are auto-levelled to 50. */
  autoLevel50: true;
  /** Any move or Ability available through normal gameplay (incl. Hidden Abilities). */
  anyMoveAbility: true;
}

export interface MegaRules {
  allowed: true;
  /** A player may Mega Evolve only once per battle. */
  perBattle: 1;
  /** Base species allowed to Mega Evolve. */
  species: string[];
}

export interface RegulationSet {
  id: string;
  name: string;
  game: 'Pokémon Champions';
  start: string;
  end: string;
  battleRules: BattleRules;
  teamRules: TeamRules;
  megaEvolution: MegaRules;
  /** Legal base species (every form of each is legal). */
  eligibleSpecies: string[];
  notes?: string;
  source: string;
  sourceAsOf: string;
}

const BATTLE_RULES: BattleRules = {
  battleType: 'Double Battles',
  bringPick: '4 of 6',
  level: 50,
  timers: {
    gameMinutes: 20,
    playerMinutes: 7,
    moveSeconds: 45,
    previewSeconds: 90,
  },
  rounds: 'BO1/BO3 Swiss, BO3 top cut',
};

const TEAM_RULES: TeamRules = {
  speciesClause: true,
  itemClause: true,
  autoLevel50: true,
  anyMoveAbility: true,
};

const SOURCE = 'https://bulbapedia.bulbagarden.net/wiki/Regulation_Sets_in_Pok%C3%A9mon_Champions';
const SOURCE_AS_OF = '2026-09-13';

interface SetMeta {
  name: string;
  start: string;
  end: string;
  notes: string;
}

const METADATA: Record<string, SetMeta> = {
  'm-a': {
    name: 'Regulation Set M-A',
    start: '2026-04-08',
    end: '2026-06-17',
    notes: 'Launch format. Mega Evolution enabled; all Legendary and Restricted Pokémon are banned.',
  },
  'm-b': {
    name: 'Regulation Set M-B',
    start: '2026-06-17',
    end: '2026-09-09',
    notes: 'Second format. Adds 22 Pokémon and 16 Mega Evolutions over M-A.',
  },
  'm-c': {
    name: 'Regulation Set M-C',
    start: '2026-09-09',
    end: '2026-12-02',
    notes: 'Current format. Adds 29 Pokémon and 6 Mega Evolutions over M-B (incl. Mega Absol Z, Mega Salamence, Mega Garchomp Z, Mega Lucario Z, Mega Golisopod, Mega Baxcalibur).',
  },
};

type Scraped = Record<string, { eligibleSpecies: string[]; megaEvolutions: string[] }>;
const scraped = raw as Scraped;

export const REGULATION_SETS: RegulationSet[] = Object.entries(METADATA).map(([id, meta]) => {
  const data = scraped[id];
  if (!data) throw new Error(`Missing scraped data for regulation set "${id}"; run scripts/extract-regs.mjs.`);
  return {
    id,
    name: meta.name,
    game: 'Pokémon Champions',
    start: meta.start,
    end: meta.end,
    battleRules: BATTLE_RULES,
    teamRules: TEAM_RULES,
    megaEvolution: { allowed: true, perBattle: 1, species: data.megaEvolutions },
    eligibleSpecies: data.eligibleSpecies,
    notes: meta.notes,
    source: SOURCE,
    sourceAsOf: SOURCE_AS_OF,
  };
});

export type SetStatus = 'past' | 'current' | 'upcoming';

export function setStatus(set: RegulationSet, today: Date = new Date()): SetStatus {
  const start = new Date(`${set.start}T00:00:00Z`);
  const end = new Date(`${set.end}T23:59:59Z`);
  if (today < start) return 'upcoming';
  if (today > end) return 'past';
  return 'current';
}

export function getRegulationSet(query: string): RegulationSet | undefined {
  const q = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  return REGULATION_SETS.find((s) => {
    const id = s.id.replace(/[^a-z0-9]/g, '');
    const name = s.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return id === q || name === q || s.name.toLowerCase() === query.toLowerCase();
  });
}
