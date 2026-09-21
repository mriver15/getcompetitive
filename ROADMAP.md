# North Star — getcompetitive

Adopted direction (2026-09-19). **Untracked by design**: the strategic layer, not
a commit. The executed backlog that preceded this (P0 team workflows, P1 prompts
+ HTTP entrypoint, P2 meta deltas/replay/provenance, P3 inference/optimizer) is
summarized at the bottom.

## Direction

Build getcompetitive as a **compact competitive-intelligence engine for
Pokémon Champions**, not a collection of MCP tools. Move deterministic
reasoning into TypeScript; return conclusions, evidence and assumptions.

> **The model explains. getcompetitive calculates, verifies, and proves.**

Optimize for: Champions-specific correctness, low token usage, a small MCP
surface, deterministic analysis, evidence-backed recommendations, server-side
composition, and reusable competitive intelligence.

Development filter (final): *if TypeScript can determine it reliably, don't
spend model tokens determining it* — and *expose competitive decisions through
MCP, not the implementation steps used to derive them.*

## Measured gap (2026-09-19)

| | target | today |
| --- | --- | --- |
| public tools | 6–8 compound | **30** (198,624 B of definitions) |
| response modes | compact / evidence / debug, compact default | one fixed shape per tool |
| strategic model | one shared MatchupEvaluator | "super-effective move = answer" in analyze/diagnose/prepare |
| bring-four | all 15 combinations enumerated | greedy top-4 by type score |
| data foundation | ChampionsDex + golden tests | stock gen-9 dex + unverified smogon "Future" forms |

## Fact-checked corrections to the direction doc

- **`@pkmn/mods/champions` does not exist on npm.** The registry has no such
  package. What actually exists: smogon's pokedex data (vendored by
  `@pkmn/dex`) now carries Champions forms tagged `isNonstandard: 'Future'` —
  e.g. `Golisopod-Mega` (Bug/Steel), `Raichu-Mega-Y`. The current server
  relies on that data *by accident*: nothing verifies it against the official
  regulation rosters, and no golden test pins it.
- The real verification sources available: `src/regulations.data.ts` (the
  official rosters, extracted), the official game docs, and the aggregator's
  `base_stats` field (which the threat generator already reads from).
- Phase 1's diagnosis is correct and urgent: the higher-level features all
  depend on a canonical game model that is currently unverified.

## Target surface: 8 compound tools

| tool | intent | absorbs today's |
| --- | --- | --- |
| `lookup` | one data lookup (species/move/item/ability/nature/type/learnset/sprite) | get_pokemon, list_forms, search_dex, get_move, get_item, get_ability, get_nature, get_learnset, get_type, get_type_matchup, get_sprites |
| `calculate` | one battle calc (stats/damage/matchups/speed/EV solve) | calculate_stats, calculate_damage, calculate_matchups, check_speed, optimize_evs |
| `analyze_team` | synergy + diagnosis (damage-aware) | analyze_team, diagnose_team |
| `optimize_team` | constraint-driven construction (roles, objectives) | optimize_team |
| `prepare_matchup` | pre-game plan (exhaustive bring-four, leads) | prepare_matchup |
| `analyze_battle` | replay → observations → set inference | analyze_replay, infer_set |
| `analyze_meta` | "what is changing?" | list_threats, compare_meta, get_set |
| `team_io` | paste in / paste out / legality | parse_team, format_team, check_legality, get_regulation, list_regulations |

Internal engines stay as services (ChampionsDex, DamageEngine, StatEngine,
RoleEngine, MatchupEvaluator, SetInferenceEngine, MetaEngine, ReplayEngine,
OptimizationEngine); they are **not** exposed as tools.

The consolidation is a breaking change to the public surface — a major
version with a migration note — and the exact mode/flavor names per compound
tool are design work, not renaming.

## What already matches this north star (shipped slices)

- **Server-side composition**: diagnose_team and prepare_matchup already chain
  parsing, meta lookup, damage and speed internally — the model makes one call.
- **Evidence-backed output**: every recommendation carries numbers or usage
  facts with `dataUpdated`; typing-only heuristics are labelled low-confidence.
- **Partial Phase 5**: `infer_set` exists (constraints, priors, survivor
  shares) but observations are hand-entered; no `BattleObservation`
  normalization out of `analyze_replay`.
- **Partial Phase 7**: `compare_meta` exists (usage deltas, emerging cores)
  but lacks rank deltas, set changes, association metrics and archetypes.
- **Distribution**: HTTP entrypoint, hosted MCP worker and the MCP App workspace all shipped; the App ships as one bundled resource with three Views (Team Doctor, Team Builder, Matchup Board).
- **Prompts**: six workflow prompts shipped; they simplify further as the
  compound tools absorb the orchestration.

## Phase plan (adopted, annotated)

**P0 — Foundation**
1. ChampionsDex: single game-model layer (gen-9 → verified Champions overrides
   → regulation rules → meta overlays), golden regression tests covering
   Champions-exclusive Megas, changed typings/abilities/stats, legality,
   stat-point math, representative damage rolls. `[not started — first slice]`
2. Centralized provenance/data versions (`dataRef`), Glama/registry refresh.

**P1 — Simplification**
3. compact/evidence/debug response modes, compact default.
4. Consolidate to the 8 compound tools (breaking major).
5. Keep orchestration in TypeScript.

**P1 — Competitive intelligence**
6. Shared MatchupEvaluator: HARD_ANSWER / SOFT_ANSWER / REVENGE /
   SPEED_DEPENDENT / TRADE / UNFAVORABLE / UNKNOWN from real sets, damage
   ranges, survivability, speed, priority, roles. Used by analyze_team,
   optimize_team, prepare_matchup. Never "SE move = answer".
7. Damage-aware team diagnosis.
8. Exhaustive bring-four (all 15) and lead evaluation in prepare_matchup.

**P2 — Scouting**
9. BattleObservation normalization (move_seen, item_revealed, ability_seen,
   speed_relation, damage_observed, survived_hit, form_revealed, stat_change).
10. analyze_replay → observations → SetInferenceEngine → rematch prep, one
    pipeline. `/scout-opponent`.
11. Candidate output carries observations satisfied, coverage, prior weight,
    remaining uncertainty — not generic "probability".

**P2 — Optimization**
12. Role taxonomy (Fake Out, Tailwind, Trick Room, redirection, priority,
    Intimidate, pivoting, spread, anchor, cleaner).
13. Structured objectives: locked members, required roles, excluded Pokémon,
    max changes, specific threats, playstyle. optimize_team becomes a real
    constraint solver.

**P2 — Meta**
14. Association metrics (co-occurrence lift, conditional partner probability)
    so rising usage ≠ rising synergy; rank deltas, set changes, emerging
    archetypes.

**P3 — Productization**
15. Hosted MCP at a real URL; caching; MCP App as an evidence display (the
    model converses, the app shows the proof) — **shipped 8.0.0** as the
    `ui://getcompetitive/workspace` resource with Team Doctor, Team Builder and
    Matchup Board; scouting history only if the workflows prove they need
    persistence — the per-user **recorded-set** file landed early (7.0.0) on
    exactly that principle: local, opt-in, and never blended with measured
    usage.

## What not to do (from the doc, kept verbatim in spirit)

No tool-count optimization theater; no exposing internal engines; no LLM
reproducing deterministic math; no verbose prose from tools; no generic team
builder; no opaque "AI scores" where measurable evidence exists; user-data
persistence stays local and opt-in — the meta itself is measured-only, and the
recorded-set file is one file per user that `get_set` reads only when asked.

## First execution slice (ready, awaiting the word)

**Phase 1, bounded**: build the ChampionsDex layer + golden tests.

1. Inventory what the stock dex actually gives us for Champions (species
   tagged `Future`, their typings/stats/abilities) and diff it against
   `regulations.data.ts` and the aggregator's `base_stats`.
2. Decide the layer shape: a thin `champions.ts` that wraps `getDex(9)` with
   verified overrides, so every existing tool keeps calling the same API.
3. Golden regression tests pinning: every Champions-exclusive Mega and its
   typing, the changed-ability/stat list, legality of the generated sets, the
   stat-point math, and representative damage rolls.
4. No public-surface changes in this slice — it is a foundation-only PR.

---

## Executed backlog (kept for the record)

- **P0** parse_team, format_team, diagnose_team, prepare_matchup (4.1.0)
- **get_sprites** batched sprite URLs from a committed id table (4.2.0)
- **P1** six workflow prompts + Streamable HTTP entrypoint (4.3.0)
- **P2** compare_meta (two-window usage history with a completeness gate),
  analyze_replay, dataUpdated provenance (4.4.0)
- **P3** infer_set (reverse constraint solving), optimize_team (constraint-
  based completion) (4.5.0)
- **P3 (partial)** record_set + `get_set`'s `includeRecorded` overlay: the
  per-user record of sets the reasoning generated, kept out of the usage data
  (7.0.0)
- **Champions-only payloads**: the last of the mainline-game surface — `gen`,
  `isNonstandard`, Dynamax/Z-Move/Gigantamax fields, Tera — removed from what
  `lookup` returns, with a dataset-wide guard in the golden suite (7.0.0)
- **The MCP App workspace** (8.0.0): one bundled `ui://getcompetitive/workspace`
  resource with Team Doctor, Team Builder and Matchup Board, built by
  esbuild and embedded in the server JS; the three App tools wrap
  `structuredContent` in a versioned envelope, text unchanged
