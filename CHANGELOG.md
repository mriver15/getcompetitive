# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Pokémon Champions stat points alongside EVs.** The calculator takes 0-252 EVs
  under a 510 cap; the game spends 66 points with at most 32 in one stat. Every
  EV-taking tool now also accepts `championsPoints` — give one scale or the
  other, never both — and every tool that reports a spread reports it in both,
  so a spread read off the game's training screen can be used directly and a
  solved spread can be typed back into it. One point is worth 8 EVs; because the
  budgets differ, a spread trimmed to fit the 510 EV cap reads back a point or
  two under what was asked, and the field says so.
- **`analyze_team` reports `threatCoverage`** when given a regulation with a
  usage-derived threat list. For each of the meta's most-used sets it compares
  real Speed at level 50 — the threat's own nature, EVs, item and Mega form
  against your members' supplied spreads — and reports the best super-effective
  hit the team has, with the threats nothing hits super-effectively listed as
  the holes to fix. Team members take optional `nature`, `evs`/`championsPoints`
  and `item`, so the comparison uses the set actually run rather than base stats.

## [2.0.1] - 2026-09-17

### Changed

- Tool-selection cues. Two of the four TDQS `shadow-candidate` pairs stated
  their disjointness in only one direction: `calculate_matchups` and
  `check_legality` now point at `calculate_stats` for stat values, which
  completes the human review that CI defers on (`shadow-candidate` stays out of
  the lint gate). The 25-tool count is unchanged and deliberate; the review
  outcome is recorded in `.github/workflows/ci.yml`.

### Fixed

- **`check_legality` rejected moves a Pokémon inherits from a pre-evolution.**
  Egg and level-up moves carry up on evolution while Showdown files them
  against the species that learns them, so Rillaboom's Fake Out (Grookey's egg
  move), Sneasler's Fake Out (Hisuian Sneasel's) and Arcanine-Hisui's Head
  Smash (Hisuian Growlithe's) were all reported illegal — and `get_set` handed
  out exactly those moves, so the meta tools contradicted the legality tool. A
  move is now legal when any species in the evolution line knows it, without
  letting another form's pool leak in: Johto Sneasel's Surf stays illegal on
  Sneasler, and Mega and appliance forms keep their pre-evolution chain.
  `check_legality` and `get_learnset` now state which of the two answers
  move-legality questions, and `test/smoke.mjs` asserts both directions plus
  that every generated set passes the regulation's own check.

## [2.0.0] - 2026-09-17

### Added

- **The threat list is now usage-derived.** `list_threats` and `get_set` no
  longer serve editorial sets: `scripts/build-threats.mjs` ranks the legal
  roster by measured usage over Limitless VGC tournament teams, resolves each
  species' most-played set, takes EV spreads from the in-game ranked ladder, and
  cross-checks the ordering against Pikalytics. Every threat carries its `rank`
  and `usage`, and each list reports the `sample`, `sources`, and
  `corroboration` behind it.

### Changed

- **Breaking:** `list_threats` and `get_set` output. Threats gain `rank`,
  `usage`, and `form` (the form a set is played as when it is not the default
  one, e.g. `Arcanine-Hisui`), and drop `teraType` — Pokémon Champions has no
  Terastallization, so the field could never be populated. `tier` is a usage
  band (S = top 5, A = next 7, B = the rest) rather than an editorial judgement,
  and `role` is read off the set's ability and moves. Mega sets name the Mega
  form in Showdown spelling (`Salamence-Mega`) and report the post-Mega ability
  in `megaAbility`. Names the list cannot resolve are unchanged, but `get_set`
  now also matches forms, so `Indeedee-F` finds the Indeedee set.
- **Breaking:** tool names are now uniformly `verb_noun`. Five outliers were
  renamed to match the pattern the rest of the surface already followed:
  `search` → `search_dex`, `type_chart` → `get_type_matchup`, `calc_matchups` →
  `calculate_matchups`, `speed_check` → `check_speed`, `speed_tiers` →
  `list_speed_tiers`. Descriptions, cross-references, and the README use the new
  names; client allow-lists that pin tool names need updating.

### Removed

- `scripts/threat-scaffold.mjs`. Threat sets are generated rather than
  hand-authored, so `scripts/build-threats.mjs` replaces it.

## [1.1.1] - 2026-09-15

### Changed

- Releases publish through npm trusted publishing: the release workflow
  authenticates over OIDC (`id-token: write`) and installs npm >= 11.15, so no
  long-lived credential is involved and provenance attestations are generated
  automatically.

## [1.1.0] - 2026-09-15

### Changed

- Tool definitions rewritten against the [TDQS](https://tdqs.dev) checklist:
  every tool now declares MCP annotations and a human title, documents all of its
  top-level parameters in the schema, and states its purpose, the sibling tools
  to use instead, parameter semantics, and behaviour beyond the annotations.
- The generation input schema is shared from `src/tools/schemas.ts` rather than
  redefined in each tool module.
- CI gains a `tdqs` job that fails on any TDQS lint warning other than the
  structural `shadow-candidate` signal.

### Added

- Documented `outputSchema` on every tool, and `structuredContent` on every
  successful result alongside the existing JSON text. Error results are
  unchanged. The smoke test now exercises every optional payload shape, since
  the SDK validates results against the declared schema.

## [1.0.0] - 2026-09-15

### Added

- `calc_matchups` — batch damage calculation (one attacker vs many defenders,
  best-move selection, KO chance, speed ordering).
- `speed_check` — final Speed with nature/EV/IV/boosts/Choice Scarf, compared
  against a Regulation Set's legal roster.
- Move validation in `check_legality` — flags moves a species cannot learn.
- `optimize_evs` — EV spread solver (min EVs to survive / outspeed / guarantee a
  KO, then maximize a stat).
- Heuristic 0-100 team score in `analyze_team` (defensive, coverage, speed).
- `list_threats` / `get_set` — curated meta threat list and standard sets for
  the current Pokémon Champions regulation (M-C).
- `scripts/threat-scaffold.mjs` — scaffolds a threat list for the next regulation.
- `Dockerfile` / `.dockerignore` — container install path
  (`docker build -t getcompetitive .`), also the build spec for the Glama listing.
- `glama.json` — maintainer claim for the Glama directory listing.

## [0.1.0] - 2026-09-14

### Added

- 20 MCP tools across four domains: data, team building, battle mechanics, and
  official regulation sets.
- Full Pokémon Showdown competitive dataset access (species, forms, moves,
  items, abilities, natures, learnsets, types, tiers).
- Battle math from Smogon's calculator (stat + full damage calculation).
- Pokémon Champions / VGC Regulation Sets M-A, M-B, and M-C with legality
  checking (`list_regulations`, `get_regulation`, `check_legality`).
- Team synergy analyzer (`analyze_team`): stacked defensive weaknesses,
  offensive coverage, and speed placement.
- Curated competitive team-building archetypes (`list_archetypes`,
  `get_archetype`).
