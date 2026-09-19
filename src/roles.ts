/**
 * Role taxonomy: the competitive roles a team can be built from, detected
 * deterministically from the dataset — learnsets for Fake Out, Tailwind, Trick
 * Room, redirection, pivoting, priority and spread moves; the ability pool for
 * Intimidate; base stats for anchors and cleaners. This is the vocabulary
 * `optimize_team` objectives are expressed in.
 */
import { getChampionsDex } from './champions.js';
import { learnableMoveIds } from './dex.js';
import { toID } from './dex.js';

export const ROLES = [
  'fake_out',
  'tailwind',
  'trick_room',
  'redirection',
  'priority',
  'intimidate',
  'pivoting',
  'spread',
  'anchor',
  'cleaner',
] as const;
export type Role = (typeof ROLES)[number];

const MOVE_SETS: Record<Role, string[] | undefined> = {
  fake_out: ['fakeout'],
  tailwind: ['tailwind'],
  trick_room: ['trickroom'],
  redirection: ['followme', 'ragepowder'],
  priority: undefined,
  intimidate: undefined,
  pivoting: ['uturn', 'voltswitch', 'flipturn', 'partingshot'],
  spread: undefined,
  anchor: undefined,
  cleaner: undefined,
};

const roleCache = new Map<string, Role[]>();

/** The competitive roles a species can fill, from learnset, abilities and stats. */
export async function detectRoles(speciesName: string): Promise<Role[]> {
  const key = toID(speciesName);
  const cached = roleCache.get(key);
  if (cached) return cached;

  const dex = getChampionsDex();
  const sp = dex.species.get(speciesName);
  const roles = new Set<Role>();
  if (sp.exists) {
    for (const ability of Object.values(sp.abilities)) {
      if (ability.toLowerCase() === 'intimidate') roles.add('intimidate');
    }
    const stats = sp.baseStats;
    if (stats.hp + stats.def + stats.spd >= 270) roles.add('anchor');
    if (stats.spe >= 95 && (stats.atk >= 110 || stats.spa >= 110)) roles.add('cleaner');
  }

  const learnable = sp.exists ? await learnableMoveIds(dex, sp) : new Set<string>();
  for (const role of ROLES) {
    const wanted = MOVE_SETS[role];
    if (!wanted) continue;
    if (wanted.some((id) => learnable.has(id))) roles.add(role);
  }
  for (const id of learnable) {
    const m = dex.moves.get(id);
    if (!m.exists || !(m.basePower || 0)) continue;
    if ((m.priority ?? 0) > 0) roles.add('priority');
    if (m.target === 'allAdjacentFoes' && m.basePower >= 60) roles.add('spread');
  }

  const out = [...roles];
  roleCache.set(key, out);
  return out;
}
