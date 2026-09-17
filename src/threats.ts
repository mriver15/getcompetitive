/**
 * Usage-derived meta threat list + standard sets for Pokémon Champions regulations.
 *
 * Nothing in here is hand-authored. The threat list is generated from live
 * competitive data by `scripts/build-threats.mjs`, which ranks the legal roster
 * by measured usage, resolves each species' most-played set, and writes
 * `src/threats.data.ts`:
 *
 *   * species, item, ability, nature and moves — Limitless VGC online
 *     tournaments (at least 25 players), aggregated per regulation
 *   * ranking and `usage` — share of the sampled teams carrying the species,
 *     summed across its forms because Species Clause is per National Pokédex
 *     number
 *   * EV spreads — the in-game ranked ladder
 *
 * To refresh a regulation: `node scripts/build-threats.mjs m-c`. See the
 * generator for the derivation rules (tier bands, role labels, the EV
 * conversion from Champions stat points).
 */
import raw from './threats.data.js';

export type ThreatTier = 'S' | 'A' | 'B';

export interface Threat {
  /** Base species name (Showdown). Forms are collapsed by National Pokédex number. */
  species: string;
  /** Non-Mega form the set is played as, e.g. "Arcanine-Hisui"; absent for the default form. */
  form?: string;
  /** Mega form the set evolves into, e.g. "Salamence-Mega"; absent for non-Mega sets. */
  megaForm?: string;
  /** Role read off the set's ability and moves, e.g. "Rain setter". */
  role: string;
  /** Usage band: S is the top 5, A the next 7, B the rest of the list. */
  tier: ThreatTier;
  /** Position by usage in this list; 1 is the most used. */
  rank: number;
  /** Share of the sampled teams carrying this species, in percent. */
  usage: number;
  /** Most-played held item. */
  item: string;
  /** Most-played ability on the form that was led, i.e. before Mega Evolving. */
  ability: string;
  /** Ability after Mega Evolving; absent for non-Mega sets. */
  megaAbility?: string;
  /** Most-played nature. */
  nature: string;
  /** Most-played spread, in the 0-252 scale the calculate_* tools take. */
  evs?: Record<string, number>;
  /** The four most-played moves. */
  moves: string[];
  /** Usage figures behind the set, e.g. "54.2% usage across 2,994 teams …". */
  notes?: string;
}

/** Size and window of the sample a list was derived from. */
export interface ThreatSample {
  /** Teams sampled. */
  teams: number;
  /** Tournaments those teams came from. */
  tournaments: number;
  /** Minimum players per tournament for inclusion. */
  minPlayers: number;
  /** How far back the source looked, in days. */
  windowDays: number;
  /** ISO date of the newest tournament in the sample. */
  through: string;
}

export interface ThreatSource {
  name: string;
  url: string;
  /** Which fields of a threat this source supplies. */
  scope: string;
}

/** Independent second ranking used to sanity-check the ordering. */
export interface ThreatCorroboration {
  source: string;
  url: string;
  /** The source's own data-revision label, which lags the regulation itself. */
  dataDate: string;
  /** How many of this list's top 10 that source also ranks in its top 10. */
  top10Overlap: number;
}

export interface ThreatList {
  regulation: string;
  name: string;
  /** How the list was produced: measured usage, not editorial judgement. */
  source: 'usage';
  /** ISO date of the newest data point behind the list. */
  sourceAsOf: string;
  /** Standing description of the data and its limits. */
  note: string;
  sample: ThreatSample;
  sources: ThreatSource[];
  corroboration?: ThreatCorroboration;
  threats: Threat[];
}

// `raw` is generated JSON: its literals widen `tier` to `string` and give every
// `evs` object its own optional-key shape, so neither overlaps the declared types.
export const THREAT_LISTS: Record<string, ThreatList> = raw as unknown as Record<string, ThreatList>;

export function getThreatList(regulation: string): ThreatList | undefined {
  const q = regulation.toLowerCase().replace(/[^a-z0-9]/g, '');
  return Object.values(THREAT_LISTS).find((l) =>
    [l.regulation, l.name].map((alias) => alias.toLowerCase().replace(/[^a-z0-9]/g, '')).includes(q),
  );
}

/**
 * Look up one species' set, optionally scoped to a regulation. Matches the base
 * species, the form it is played as, and its Mega form, so "Indeedee-F" and
 * "Salamence-Mega" find the same entries as "Indeedee" and "Salamence".
 */
export function findThreat(species: string, regulation?: string): { list: ThreatList; threat: Threat } | undefined {
  const q = species.toLowerCase().replace(/[^a-z0-9]/g, '');
  const lists = regulation
    ? ([getThreatList(regulation)].filter(Boolean) as ThreatList[])
    : Object.values(THREAT_LISTS);
  for (const list of lists) {
    const threat = list.threats.find((t) =>
      [t.species, t.form, t.megaForm]
        .map((alias) => alias?.toLowerCase().replace(/[^a-z0-9]/g, ''))
        .includes(q),
    );
    if (threat) return { list, threat };
  }
  return undefined;
}
