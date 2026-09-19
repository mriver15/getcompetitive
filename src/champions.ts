/**
 * ChampionsDex: the single canonical game model every gameplay system reads
 * from. The bundled gen-9 dataset is verified against official Champions data
 * by `scripts/verify-champions.mjs`, which diffs base stats, types and
 * abilities for every Champions-exclusive form, the whole regulation roster,
 * and every threat species; the verified facts are committed in
 * `champions.data.ts` and pinned by `test/champions.mjs`.
 *
 * `getChampionsDex()` is currently a passthrough because verification found no
 * divergence. If an override ever becomes necessary, it lands here — exactly
 * once, in front of every tool — instead of being sprinkled across call sites.
 */
import { getDex } from './dex.js';
import raw from './champions.data.js';

export const CHAMPIONS_VERIFIED_AS_OF: string = raw.verifiedAsOf;
export const CHAMPIONS_SOURCE: string = raw.source;

/** Champions-exclusive forms with the typing and BST they were verified to have. */
export const CHAMPIONS_EXCLUSIVE_FORMS: readonly { species: string; types: readonly string[]; bst: number }[] = raw.forms;

/** The canonical Champions game model; the only dex access gameplay tools should use. */
export function getChampionsDex() {
  return getDex(9);
}
