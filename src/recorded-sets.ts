/**
 * Per-user record of the sets the reasoning produced.
 *
 * The usage-derived meta lives in exactly one place: `src/threats.data.ts`,
 * regenerated from live tournament data by `scripts/build-threats.mjs` and never
 * edited by hand. A set that came out of the reasoning — solved from battle
 * observations, or proposed for a team — has no sample and no rank, so filing it
 * there would make every consumer that sorts by usage assert both. It is filed
 * here instead: one JSON-Lines file per user, outside the bundle, written only by
 * `record_set` and read back only when a caller explicitly asks (`get_set` with
 * `includeRecorded`).
 *
 * The file is append-only and every line is a whole record, so a torn final line
 * is skipped rather than fatal. Records are keyed by a canonical hash of the set
 * itself: re-recording an identical set is a no-op, while a changed spread, item
 * or move set becomes a new record — the timeline of what was generated.
 *
 * The spread is canonicalized into Champions stat points before hashing, because
 * the same spread can arrive in either scale (`evs` 0-252 or `championsPoints`
 * 0-32); points are what the game itself trains in, so that is the identity.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { STATS, evsToChampionsPoints } from './dex.js';
import { getChampionsDex } from './champions.js';
import type { ParsedSet } from './tools/team.js';

/** Why a recorded set exists. Neither value is measured usage, and neither is ever blended with it. */
export type RecordedBasis = 'inferred' | 'proposed';

interface RecordedSet {
  /** Canonical id: a hash of the set itself, so the same set is one record. */
  id: string;
  /** Base species the record is filed under; forms collapse as they do in the usage data. */
  species: string;
  /** ISO timestamp of the write. */
  recordedAt: string;
  /** How the set was arrived at. */
  basis: RecordedBasis;
  /** Which part of the reasoning produced it. */
  origin: { tool: string; note?: string };
  /** Regulation the set was generated for, when one was named. */
  regulation?: string;
  /** The set itself, in the canonical shape every tool consumes. */
  set: ParsedSet;
}

/** A record to file; the id, species and timestamp are derived. */
interface NewRecordedSet {
  set: ParsedSet;
  basis: RecordedBasis;
  origin: { tool: string; note?: string };
  regulation?: string;
}

/** `GETCOMPETITIVE_STORE`, or one file per user under the home directory. */
function storePath(): string {
  return process.env.GETCOMPETITIVE_STORE ?? join(homedir(), '.getcompetitive', 'sets.jsonl');
}

/** The key a species is filed and matched under: its base species, as usage collapses forms. */
function speciesKey(name: string): string {
  const dex = getChampionsDex();
  const sp = dex.species.get(name);
  const base = sp.exists ? sp.baseSpecies || sp.name : name;
  return base.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** The id a set files under: same species, item, ability, nature, spread and moves means one record. */
function recordedSetId(set: ParsedSet, regulation?: string): string {
  // Identity is the Champions point spread, because the same spread arrives in
  // either scale (`evs` 0-252 or `championsPoints` 0-32) and points are what the
  // game itself trains in.
  const points = set.championsPoints ?? evsToChampionsPoints(set.evs ?? {});
  const spread = STATS.filter((s) => points[s]).map((s) => `${s}${points[s]}`).join('/');
  const parts = [
    set.species,
    regulation ?? '',
    set.item ?? '',
    set.ability ?? '',
    set.nature ?? '',
    spread,
    (set.moves ?? []).join('>'),
  ];
  return `gc_${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 12)}`;
}

/** Every record on file; `skipped` counts lines that were not whole records. */
function readRecordedSets(): { sets: RecordedSet[]; skipped: number } {
  const path = storePath();
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { sets: [], skipped: 0 };
    throw new Error(`Could not read the recorded-set store at ${path}: ${(e as Error).message}.`);
  }

  const sets: RecordedSet[] = [];
  let skipped = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as RecordedSet;
      if (row && typeof row === 'object' && typeof row.id === 'string' && row.set) sets.push(row);
      else skipped++;
    } catch {
      skipped++;
    }
  }
  return { sets, skipped };
}

/**
 * The records filed under one species, optionally scoped to a regulation. A record
 * that named no regulation matches any scope: it never claimed one.
 */
export function findRecordedSets(species: string, regulation?: string): { sets: RecordedSet[]; skipped: number } {
  const key = speciesKey(species);
  const scope = regulation?.toLowerCase().replace(/[^a-z0-9]/g, '');
  const { sets, skipped } = readRecordedSets();
  return {
    skipped,
    sets: sets.filter(
      (r) =>
        speciesKey(r.set.species) === key &&
        (!scope || !r.regulation || r.regulation.toLowerCase().replace(/[^a-z0-9]/g, '') === scope),
    ),
  };
}

/** Append one record; an identical set is already on file, so it is returned rather than written twice. */
export function recordSet(
  input: NewRecordedSet,
  now: Date = new Date(),
): { record: RecordedSet; created: boolean; path: string; stored: number; skipped: number } {
  const path = storePath();
  const existing = readRecordedSets();
  const id = recordedSetId(input.set, input.regulation);
  const prior = existing.sets.find((r) => r.id === id);
  if (prior) return { record: prior, created: false, path, stored: existing.sets.length, skipped: existing.skipped };

  const dex = getChampionsDex();
  const sp = dex.species.get(input.set.species);
  const record: RecordedSet = {
    id,
    species: sp.exists ? sp.baseSpecies || sp.name : input.set.species,
    recordedAt: now.toISOString(),
    basis: input.basis,
    origin: input.origin,
    ...(input.regulation ? { regulation: input.regulation } : {}),
    set: input.set,
  };

  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(record)}\n`, 'utf8');
  } catch (e) {
    throw new Error(
      `Could not write the recorded-set store at ${path}: ${(e as Error).message}. ` +
        'Set GETCOMPETITIVE_STORE to a writable path; a stateless runtime with no filesystem (the hosted endpoint) has none.',
    );
  }
  return { record, created: true, path, stored: existing.sets.length + 1, skipped: existing.skipped };
}
