/**
 * MatchupEvaluator: one reusable definition of what constitutes an actual
 * competitive answer. "Has a super-effective move" is not an answer; this
 * engine runs the real math both directions — each side's hardest hit and
 * damage range, level-50 Speed with priority taken into account, and a
 * conservative turn simulation — and classifies the matchup.
 *
 * Determinism contract: the classification never consults a random roll. Our
 * side is always simulated with its minimum roll and their side with its
 * maximum, so a classification of HARD_ANSWER or SOFT_ANSWER is a worst-case
 * guarantee, and SPEED_DEPENDENT/TRADE mean exactly that order or rolls can
 * flip the result.
 */
import { getChampionsDex } from './champions.js';
import { damageResult, finalStat, typeEffectiveness } from './dex.js';
import type { ModdedDex } from '@pkmn/dex';

export type AnswerClass = 'HARD_ANSWER' | 'SOFT_ANSWER' | 'REVENGE' | 'SPEED_DEPENDENT' | 'TRADE' | 'UNFAVORABLE' | 'UNKNOWN';

/** Better answers rank lower; shared by every consumer that picks the best member. */
export const ANSWER_CLASS_RANK: Record<AnswerClass, number> = {
  HARD_ANSWER: 0,
  SOFT_ANSWER: 1,
  REVENGE: 2,
  SPEED_DEPENDENT: 3,
  TRADE: 4,
  UNFAVORABLE: 5,
  UNKNOWN: 6,
};

/** One side of a matchup, as resolved by the caller (moves optional). */
export interface MatchupSide {
  species: string;
  item?: string;
  ability?: string;
  nature?: string;
  evs?: Record<string, number>;
  championsPoints?: Record<string, number>;
  moves?: string[];
}

export interface MatchupResult {
  answerClass: AnswerClass;
  ourBest: { move: string; damageRange: [number, number]; koChance?: string } | null;
  theirBest: { move: string; damageRange: [number, number]; koChance?: string } | null;
  speed: { ours: number; theirs: number; weMoveFirst: boolean };
  /** Which single fact decided the class, so the caller can quote it. */
  reason: string;
}

/** Strongest hit one side has into the other's typing, by eff x power x STAB. */
function bestMove(dex: ModdedDex, side: MatchupSide, targetTypes: string[]): { name: string; priority: number } | null {
  let best: { name: string; score: number; priority: number } | null = null;
  for (const mv of side.moves ?? []) {
    const m = dex.moves.get(mv);
    if (!m.exists || !(m.basePower || 0)) continue;
    const eff = typeEffectiveness(m.type, targetTypes, 9);
    if (eff === 0) continue;
    const stab = dex.species.get(side.species).types.includes(m.type) ? 1.5 : 1;
    const score = eff * m.basePower * stab;
    if (!best || score > best.score) best = { name: m.name, score, priority: m.priority ?? 0 };
  }
  return best ? { name: best.name, priority: best.priority } : null;
}

/**
 * Conservative two-hit race simulation: our minimum roll against their maximum,
 * alternating by Speed unless priority intervenes. Returns whether we win and
 * the share of our HP left in the worst case.
 */
function simulateRace(
  ourMove: string,
  theirMove: string,
  ourRange: [number, number],
  theirRange: [number, number],
  ourHp: number,
  theirHp: number,
  ourPriority: number,
  theirPriority: number,
  weMoveFirst: boolean,
): { weWin: boolean; hpLeftPct: number } {
  let usHp = ourHp;
  let themHp = theirHp;
  // Conservative rolls: our worst, their best.
  const ourHit = ourRange[0];
  const theirHit = theirRange[1];
  let turn = 0;
  while (usHp > 0 && themHp > 0 && turn < 12) {
    turn++;
    const ourTurn =
      ourPriority !== theirPriority
        ? ourPriority > theirPriority
        : weMoveFirst
          ? turn % 2 === 1
          : turn % 2 === 0;
    if (ourTurn) {
      themHp -= ourHit;
      if (themHp <= 0) return { weWin: true, hpLeftPct: (usHp / ourHp) * 100 };
    } else {
      usHp -= theirHit;
      if (usHp <= 0) return { weWin: false, hpLeftPct: (usHp / ourHp) * 100 };
    }
  }
  // 12 turns without a faint: effectively unwinnable by damage.
  return { weWin: false, hpLeftPct: (usHp / ourHp) * 100 };
}

/** True when the side has at least one damaging move that is not fully resisted or immune into the target. */
function canHit(dex: ModdedDex, side: MatchupSide, targetTypes: string[]): boolean {
  for (const mv of side.moves ?? []) {
    const m = dex.moves.get(mv);
    if (m.exists && (m.basePower || 0) && typeEffectiveness(m.type, targetTypes, 9) > 0) return true;
  }
  return false;
}

/**
 * Classify the matchup between two sets. Both sides must carry at least one
 * usable damaging move, else the class is UNKNOWN — a type chart is not a
 * battle.
 */
export function evaluateMatchup(us: MatchupSide, them: MatchupSide): MatchupResult {
  const dex = getChampionsDex();
  const usSp = dex.species.get(us.species);
  const themSp = dex.species.get(them.species);

  const ourMove = bestMove(dex, us, themSp.types);
  const theirMove = bestMove(dex, them, usSp.types);
  const speed = (side: MatchupSide, sp: (typeof usSp)) => {
    const nature = side.nature ?? 'Serious';
    const evs = side.championsPoints
      ? (Object.fromEntries(Object.entries(side.championsPoints).map(([k, v]) => [k, v * 8])) as Record<string, number>)
      : (side.evs ?? {});
    let s = finalStat(9, 'spe', sp.baseStats.spe, 31, evs.spe ?? 0, 50, nature);
    if (side.item === 'Choice Scarf') s = Math.floor(s * 1.5);
    return s;
  };
  const ourSpeed = speed(us, usSp);
  const theirSpeed = speed(them, themSp);
  const weMoveFirst = ourSpeed >= theirSpeed;

  const empty = {
    ourBest: null,
    theirBest: null,
    speed: { ours: ourSpeed, theirs: theirSpeed, weMoveFirst },
  };

  if (!ourMove || !theirMove) {
    const weBlocked = !ourMove && !!us.moves?.length && !canHit(dex, us, themSp.types);
    const theyBlocked = !theirMove && !!them.moves?.length && !canHit(dex, them, usSp.types);
    if (weBlocked || theyBlocked) {
      return {
        ...empty,
        answerClass: 'UNFAVORABLE',
        reason: weBlocked
          ? `every damaging move ${us.species} knows is resisted or immune into ${them.species}\u2019s typing.`
          : `every damaging move ${them.species} knows is resisted or immune into ${us.species}\u2019s typing.`,
      };
    }
    return {
      ...empty,
      answerClass: 'UNKNOWN',
      reason: !ourMove ? `no damaging move known for ${us.species}` : `no damaging move known for ${them.species}`,
    };
  }

  const ourRes = damageResult(
    9,
    { species: us.species, level: 50, nature: us.nature, evs: us.evs, championsPoints: us.championsPoints, item: us.item, ability: us.ability, moves: [ourMove.name] },
    { species: them.species, level: 50, nature: them.nature, evs: them.evs, championsPoints: them.championsPoints, item: them.item, ability: them.ability, moves: them.moves },
    ourMove.name,
  );
  const theirRes = damageResult(
    9,
    { species: them.species, level: 50, nature: them.nature, evs: them.evs, championsPoints: them.championsPoints, item: them.item, ability: them.ability, moves: [theirMove.name] },
    { species: us.species, level: 50, nature: us.nature, evs: us.evs, championsPoints: us.championsPoints, item: us.item, ability: us.ability, moves: us.moves },
    theirMove.name,
  );

  const ourHp = ourRes.attacker.stats.hp;
  const theirHp = theirRes.attacker.stats.hp;
  const ourRange: [number, number] = ourRes.damageRange;
  const theirRange: [number, number] = theirRes.damageRange;
  const base = {
    ourBest: { move: ourMove.name, damageRange: ourRange, koChance: ourRes.koChance },
    theirBest: { move: theirMove.name, damageRange: theirRange, koChance: theirRes.koChance },
    speed: { ours: ourSpeed, theirs: theirSpeed, weMoveFirst },
  };

  const ourReliableKO = ourRange[0] >= theirHp;
  const theirReliableKO = theirRange[0] >= ourHp;
  const theirPossibleKO = theirRange[1] >= ourHp;

  if (ourReliableKO && theirReliableKO) {
    return {
      ...base,
      answerClass: weMoveFirst ? 'REVENGE' : 'UNFAVORABLE',
      reason: `both sides one-shot the other; ${weMoveFirst ? `we move first (${ourSpeed} vs ${theirSpeed}), so we win on initiative only and cannot switch in` : `they move first (${theirSpeed} vs ${ourSpeed})`}.`,
    };
  }
  if (ourReliableKO) {
    if (theirPossibleKO && !weMoveFirst) {
      return {
        ...base,
        answerClass: 'TRADE',
        reason: `we one-shot reliably but move second; their best roll (${theirRange[1]} of ${ourHp}) can one-shot us, so the result rides on their roll.`,
      };
    }
    return {
      ...base,
      answerClass: 'HARD_ANSWER',
      reason: `we one-shot (${ourRange[0]}-${ourRange[1]} of ${theirHp})${theirPossibleKO ? ' and move first' : ' and survive their best hit'}.`,
    };
  }
  if (theirReliableKO) {
    return {
      ...base,
      answerClass: 'UNFAVORABLE',
      reason: `they one-shot us (${theirRange[0]}-${theirRange[1]} of ${ourHp}) and our best hit does not one-shot back.`,
    };
  }

  // Neither side one-shots: the two-hit race, simulated conservatively, and
  // re-simulated with the order flipped to see whether speed decides it.
  const worstCase = simulateRace(ourMove.name, theirMove.name, ourRange, theirRange, ourHp, theirHp, ourMove.priority, theirMove.priority, weMoveFirst);
  const flipped = simulateRace(ourMove.name, theirMove.name, ourRange, theirRange, ourHp, theirHp, ourMove.priority, theirMove.priority, !weMoveFirst);
  if (worstCase.weWin && flipped.weWin) {
    return {
      ...base,
      answerClass: worstCase.hpLeftPct >= 50 ? 'HARD_ANSWER' : 'SOFT_ANSWER',
      reason: worstCase.hpLeftPct >= 50
        ? `we win the exchange regardless of turn order, finishing above half HP (${worstCase.hpLeftPct.toFixed(0)}%).`
        : `we win the exchange regardless of turn order, but finish at ${worstCase.hpLeftPct.toFixed(0)}% HP against their best rolls.`,
    };
  }
  if (worstCase.weWin !== flipped.weWin) {
    return {
      ...base,
      answerClass: 'SPEED_DEPENDENT',
      reason: `the winner flips with turn order: both sides need at least two hits, and ${weMoveFirst ? `we move first (${ourSpeed} vs ${theirSpeed})` : `they move first (${theirSpeed} vs ${ourSpeed})`}.`,
    };
  }
  return {
    ...base,
    answerClass: 'UNFAVORABLE',
    reason: `they win the exchange on both orderings; our best is ${ourRange[0]}-${ourRange[1]} of ${theirHp}, theirs ${theirRange[0]}-${theirRange[1]} of ${ourHp}.`,
  };
}
