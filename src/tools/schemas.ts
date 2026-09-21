/**
 * Zod fragments shared by more than one tool module, so a parameter's meaning is
 * written once and cannot drift between tools.
 */
import { z } from 'zod';

export const evMap = z
  .record(z.string(), z.number())
  .optional()
  .describe(
    'EVs keyed by stat id (hp, atk, def, spa, spd, spe), each 0-252 in steps of 4; omitted stats are 0, and a total above 510 is rejected. Give this or `championsPoints` (the Champions 0-32 scale, 8 EVs = 1 CP, 66 total), never both.',
  );

/**
 * Pokémon Champions spends stat points rather than EVs — the spread the game's
 * training screen shows, 66 points total with at most 32 in one stat.
 */
export const championsPointsMap = z
  .record(z.string(), z.number())
  .optional()
  .describe(
    'Pok\u00e9mon Champions stat points keyed by stat id (hp, atk, def, spa, spd, spe): whole numbers, each 0-32, totalling at most 66. This is the spread the game\u2019s training screen takes, and an alternative to `evs` \u2014 give one or the other, not both. The CP economy is 8 EVs = 1 CP, so a 252 HP / 252 Atk / 4 SpD spread is 32 / 32 / 1 CP (65 of 66); a converted spread is trimmed from its largest stats to fit the 510 EV cap the calculator enforces.',
  );
