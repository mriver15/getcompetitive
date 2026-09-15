/**
 * Shared data + mechanics layer.
 *
 * Data (species/moves/items/abilities/natures/types/learnsets) comes from
 * `@pkmn/dex`, which bundles the full Pokemon Showdown competitive dataset.
 * Battle math (stat calc + damage calc) comes from `@smogon/calc`, which is
 * self-contained and generation-aware.
 */
import { Dex, toID } from '@pkmn/dex';
import type {
  ModdedDex,
  Species,
  Move,
  Item,
  Ability,
  Nature,
  Type as DexType,
  Learnset,
  MoveSource,
} from '@pkmn/dex';
import { Generations, Pokemon, Move as CalcMove, Field, Side, calculate, calcStat } from '@smogon/calc';

export { toID };

export const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
export type StatID = (typeof STATS)[number];

/** The 18 classic types (Stellar is gen-9 Terastal-only; queried separately). */
export const TYPES18 = [
  'Normal', 'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel',
  'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark', 'Fairy',
] as const;

export const NATURES = [
  'Adamant', 'Bashful', 'Bold', 'Brave', 'Calm', 'Careful', 'Docile', 'Gentle', 'Hardy',
  'Hasty', 'Impish', 'Jolly', 'Lax', 'Lonely', 'Mild', 'Modest', 'Naive', 'Naughty',
  'Quiet', 'Quirky', 'Rash', 'Relaxed', 'Sassy', 'Serious', 'Timid',
] as const;

export type GenerationNum = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

const dexCache = new Map<number, ModdedDex>();

/** Generation-scoped view of the Showdown dataset. */
export function getDex(gen: GenerationNum): ModdedDex {
  const cached = dexCache.get(gen);
  if (cached) return cached;
  const d = Dex.forGen(gen);
  dexCache.set(gen, d);
  return d;
}

/** Generation-scoped @smogon/calc generator. */
export function getCalcGen(gen: GenerationNum) {
  return Generations.get(gen);
}

export function normalizeGen(input: number | undefined): GenerationNum {
  const n = input ?? 9;
  if (!Number.isInteger(n) || n < 1 || n > 9) {
    throw new Error(`Unsupported generation ${input}; supported: 1-9 (default 9).`);
  }
  return n as GenerationNum;
}

/** Clean, JSON-safe projection of a Species for LLM consumption. */
export function speciesToObj(s: Species) {
  return {
    name: s.name,
    num: s.num,
    gen: s.gen,
    types: s.types,
    baseStats: s.baseStats,
    bst: s.bst,
    abilities: s.abilities,
    tier: s.tier,
    doublesTier: s.doublesTier,
    natDexTier: s.natDexTier,
    baseSpecies: s.baseSpecies || undefined,
    forme: s.forme || undefined,
    baseForme: s.baseForme || undefined,
    otherFormes: s.otherFormes,
    cosmeticFormes: s.cosmeticFormes,
    formeOrder: s.formeOrder,
    isCosmeticForme: s.isCosmeticForme,
    battleOnly: s.battleOnly,
    weightkg: s.weightkg,
    genderRatio: s.genderRatio,
    gender: s.gender,
    eggGroups: s.eggGroups,
    nfe: s.nfe,
    canHatch: s.canHatch,
    prevo: s.prevo || undefined,
    evos: s.evos,
    evoLevel: s.evoLevel,
    evoItem: s.evoItem,
    evoMove: s.evoMove,
    evoCondition: s.evoCondition,
    isMega: s.isMega || undefined,
    isPrimal: s.isPrimal || undefined,
    canGigantamax: s.canGigantamax,
    cannotDynamax: s.cannotDynamax,
    requiredTeraType: s.requiredTeraType,
    isNonstandard: s.isNonstandard,
    unreleasedHidden: s.unreleasedHidden || undefined,
    tags: s.tags,
  };
}

export function moveToObj(m: Move) {
  return {
    name: m.name,
    num: m.num,
    gen: m.gen,
    type: m.type,
    category: m.category,
    basePower: m.basePower,
    accuracy: m.accuracy,
    pp: m.pp,
    priority: m.priority,
    target: m.target,
    flags: m.flags,
    shortDesc: m.shortDesc,
    desc: m.desc,
    secondary: m.secondary ?? undefined,
    secondaries: m.secondaries,
    isZ: m.isZ || undefined,
    zMove: m.zMove,
    isMax: m.isMax || undefined,
    maxMove: m.maxMove,
    breaksProtect: m.breaksProtect || undefined,
    drain: m.drain,
    recoil: m.recoil,
    multihit: m.multihit,
    alwaysHit: m.alwaysHit || undefined,
    isNonstandard: m.isNonstandard,
  };
}

export function itemToObj(i: Item) {
  return {
    name: i.name,
    num: i.num,
    gen: i.gen,
    shortDesc: i.shortDesc,
    desc: i.desc,
    isBerry: i.isBerry || undefined,
    isChoice: i.isChoice || undefined,
    isGem: i.isGem || undefined,
    isPokeball: i.isPokeball || undefined,
    megaStone: i.megaStone,
    zMove: i.zMove,
    naturalGift: i.naturalGift,
    fling: i.fling,
    boosts: i.boosts || undefined,
    forcedForme: i.forcedForme,
    itemUser: i.itemUser,
    isNonstandard: i.isNonstandard,
  };
}

export function abilityToObj(a: Ability) {
  return {
    name: a.name,
    num: a.num,
    gen: a.gen,
    shortDesc: a.shortDesc,
    desc: a.desc,
    flags: a.flags,
    isNonstandard: a.isNonstandard,
  };
}

export function natureToObj(n: Nature) {
  return {
    name: n.name,
    plus: n.plus,
    minus: n.minus,
    gen: n.gen,
  };
}

/**
 * Showdown stores `Type.damageTaken[attackingType]` as an index, not a multiplier:
 * 0 = 1x, 1 = 2x, 2 = 0.5x, 3 = 0x (immune).
 */
const DAMAGE_TAKEN_MULT: Record<number, number> = { 0: 1, 1: 2, 2: 0.5, 3: 0 };

/** Offensive multiplier of `attackingType` against a defender with `defendingTypes`. */
export function typeEffectiveness(attackingType: string, defendingTypes: string[], gen: GenerationNum): number {
  const dex = getDex(gen);
  let mult = 1;
  for (const dt of defendingTypes) {
    const t = dex.types.get(dt);
    if (!t.exists) throw new Error(`Unknown type "${dt}".`);
    mult *= DAMAGE_TAKEN_MULT[t.damageTaken[attackingType] ?? 0];
  }
  return mult;
}

/** Convert a raw damageTaken table into human multipliers keyed by attacking type. */
function damageTakenToMultipliers(damageTaken: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [atk, idx] of Object.entries(damageTaken)) {
    out[atk] = DAMAGE_TAKEN_MULT[idx] ?? 1;
  }
  return out;
}

export function typeToObj(t: DexType) {
  const taken = damageTakenToMultipliers(t.damageTaken);
  const weaknesses: string[] = [];
  const resistances: string[] = [];
  const immunities: string[] = [];
  for (const [atk, mult] of Object.entries(taken)) {
    if (mult === 0) immunities.push(atk);
    else if (mult > 1) weaknesses.push(atk);
    else if (mult < 1) resistances.push(atk);
  }
  return {
    name: t.name,
    gen: t.gen,
    isNonstandard: t.isNonstandard,
    damageTaken: taken,
    weaknesses,
    resistances,
    immunities,
    HPivs: t.HPivs,
  };
}

/** Group a learnset's move sources into readable buckets. */
export function learnsetToObj(ls: Learnset) {
  const buckets: Record<string, string[]> = {};
  if (ls.learnset) {
    for (const [moveid, sources] of Object.entries(ls.learnset)) {
      const move = Dex.moves.getByID(moveid as never);
      const name = move.exists ? move.name : moveid;
      const tags = normalizeSources(sources);
      for (const tag of tags) {
        (buckets[tag] ??= []).push(name);
      }
    }
  }
  for (const k of Object.keys(buckets)) buckets[k].sort();
  return {
    exists: ls.exists,
    eventOnly: ls.eventOnly,
    eventData: ls.eventData ?? undefined,
    movesBySource: buckets,
    totalMoves: ls.learnset ? Object.keys(ls.learnset).length : 0,
  };
}

/** Collapse Showdown's terse move-source codes into human-readable method names. */
function normalizeSources(sources: MoveSource[]): string[] {
  const out = new Set<string>();
  for (const s of sources) {
    let m = s.trim();
    // Strip gen availability flags like "8L1" -> "L1"
    m = m.replace(/^\d+/, '');
    if (/^[L]\d+$/.test(m)) out.add('Level-up');
    else if (/^[M]$/.test(m)) out.add('TM');
    else if (/^[E]$/.test(m)) out.add('Egg');
    else if (/^[T]$/.test(m)) out.add('Tutor');
    else if (/^[S]\d*$/.test(m)) out.add('Event');
    else if (/^[R]$/.test(m)) out.add('Raid/Event');
    else if (/^[V]$/.test(m)) out.add('Virtual Console transfer');
    else if (/^[D]$/.test(m)) out.add('Dream World');
    else if (/^[P]$/.test(m)) out.add('Pre-evolution');
    else out.add('Other');
  }
  return [...out];
}

/**
 * Compute a single final stat for a species at a given level with IV/EV/nature.
 * Mirrors the in-game formula (nature applied to non-HP stats).
 */
export function finalStat(
  gen: GenerationNum,
  stat: StatID,
  base: number,
  iv: number,
  ev: number,
  level: number,
  nature?: string,
): number {
  return calcStat(getCalcGen(gen), stat, base, iv, ev, level, nature);
}

export interface SetInput {
  species: string;
  level?: number;
  nature?: string;
  ivs?: Record<string, number>;
  evs?: Record<string, number>;
  item?: string;
  ability?: string;
  boosts?: Record<string, number>;
  status?: string;
  teraType?: string;
  abilityOn?: boolean;
  isDynamaxed?: boolean;
  curHP?: number;
  moves?: string[];
}

function cleanMap(map: Record<string, number> | undefined, allowed: readonly string[], label: string) {
  const out: Record<string, number> = {};
  if (!map) return out;
  for (const [k, v] of Object.entries(map)) {
    const key = k.toLowerCase();
    if (!allowed.includes(key)) throw new Error(`Unknown ${label} key "${k}"; allowed: ${allowed.join(', ')}.`);
    if (!Number.isFinite(v)) throw new Error(`Invalid ${label} value for "${k}": ${v}.`);
    out[key] = v;
  }
  return out;
}

/** Build a @smogon/calc Pokemon from a user-supplied set spec. */
export function buildPokemon(gen: GenerationNum, input: SetInput): Pokemon {
  const level = input.level ?? 100;
  if (level < 1 || level > 100) throw new Error('level must be 1-100.');

  const ivs = cleanMap(input.ivs, STATS, 'IV');
  const evs = cleanMap(input.evs, STATS, 'EV');
  for (const stat of STATS) {
    if (ivs[stat] !== undefined && (ivs[stat] < 0 || ivs[stat] > 31)) {
      throw new Error(`IV "${stat}" must be 0-31.`);
    }
    if (evs[stat] !== undefined && (evs[stat] < 0 || evs[stat] > 252)) {
      throw new Error(`EV "${stat}" must be 0-252.`);
    }
  }
  const evTotal = STATS.reduce((sum, s) => sum + (evs[s] ?? 0), 0);
  if (evTotal > 510) throw new Error(`EV total ${evTotal} exceeds 510.`);

  const nature = input.nature ?? 'Serious';
  const boosts = cleanMap(input.boosts, STATS, 'boost');
  for (const stat of STATS) {
    if (boosts[stat] !== undefined && (boosts[stat] < -6 || boosts[stat] > 6)) {
      throw new Error(`Boost "${stat}" must be -6..6.`);
    }
  }

  const options: Record<string, unknown> = {
    level,
    nature,
    ivs,
    evs,
    boosts,
  };
  if (input.item) options.item = input.item;
  if (input.ability) options.ability = input.ability;
  if (input.teraType) options.teraType = input.teraType;
  if (input.status) options.status = input.status;
  if (input.abilityOn !== undefined) options.abilityOn = input.abilityOn;
  if (input.isDynamaxed !== undefined) options.isDynamaxed = input.isDynamaxed;
  if (input.curHP !== undefined) options.curHP = input.curHP;
  if (input.moves) options.moves = input.moves;

  return new Pokemon(getCalcGen(gen), input.species, options as never);
}

export interface FieldInput {
  gameType?: 'Singles' | 'Doubles';
  weather?: string;
  terrain?: string;
  attackerSide?: Record<string, unknown>;
  defenderSide?: Record<string, unknown>;
}

export function buildField(input: FieldInput = {}): Field {
  const field: Record<string, unknown> = {};
  if (input.gameType) field.gameType = input.gameType;
  if (input.weather) field.weather = input.weather;
  if (input.terrain) field.terrain = input.terrain;
  return new Field({
    ...field,
    attackerSide: new Side(input.attackerSide ?? {}),
    defenderSide: new Side(input.defenderSide ?? {}),
  } as never);
}

/** Run a full damage calculation and return a structured, LLM-friendly result. */
export function damageResult(
  gen: GenerationNum,
  attacker: SetInput,
  defender: SetInput,
  moveName: string,
  fieldInput: FieldInput = {},
) {
  const atk = buildPokemon(gen, attacker);
  const def = buildPokemon(gen, defender);
  const move = new CalcMove(getCalcGen(gen), moveName);
  const field = buildField(fieldInput);
  const result = calculate(getCalcGen(gen), atk, def, move, field);

  const atkStats = { ...atk.stats };
  const defStats = { ...def.stats };

  let desc = '';
  let kochance: { chance: number | undefined; n: number; text: string } | undefined;
  try {
    desc = result.desc();
    kochance = result.kochance();
  } catch {
    // calc's desc generator throws on 0-damage (immunity) edge cases.
    desc = `${attacker.species} ${moveName} vs. ${defender.species}: 0 damage (immune or invalid target).`;
  }

  const range = Array.isArray(result.damage)
    ? result.range()
    : ([result.damage, result.damage] as [number, number]);

  return {
    generation: gen,
    attacker: {
      species: atk.name,
      ...summarizeSet(atk),
      stats: atkStats,
    },
    defender: {
      species: def.name,
      ...summarizeSet(def),
      stats: defStats,
    },
    move: move.name,
    field: {
      gameType: field.gameType,
      weather: field.weather,
      terrain: field.terrain,
    },
    damage: result.damage,
    damageRange: range,
    koChance: kochance?.text ?? undefined,
    description: desc,
  };
}

function summarizeSet(p: Pokemon) {
  const evs: Record<string, number> = {};
  for (const s of STATS) if (p.evs[s]) evs[s] = p.evs[s];
  return {
    level: p.level,
    nature: p.nature,
    evs,
    ivs: p.ivs,
    item: p.item,
    ability: p.ability,
    teraType: p.teraType,
    status: p.status || undefined,
    boosts: p.boosts,
  };
}

/** Full 6-stat projection for a species at level/IV/EV/nature. */
export function statTable(
  gen: GenerationNum,
  base: Record<string, number>,
  level: number,
  ivs: Record<string, number>,
  evs: Record<string, number>,
  nature?: string,
) {
  const out: Record<string, number> = {};
  for (const s of STATS) {
    out[s] = finalStat(gen, s, base[s] ?? 0, ivs[s] ?? 31, evs[s] ?? 0, level, nature);
  }
  return out;
}
