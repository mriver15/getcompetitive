/**
 * Zod fragments shared by more than one tool module, so a parameter's meaning is
 * written once and cannot drift between tools.
 */
import { z } from 'zod';

export const genSchema = z
  .number()
  .int()
  .min(1)
  .max(9)
  .default(9)
  .describe(
    'Generation whose data to use, 1-9 (default 9). Earlier generations omit moves, items, abilities, and forms that did not exist yet.',
  );
