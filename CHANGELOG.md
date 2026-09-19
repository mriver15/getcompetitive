# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **The scouting pipeline** — `analyze_battle` gains a `scout` mode: replay →
  normalized battle observations → set inference → rematch preparation, one
  call. It parses the log, identifies which side is yours from your supplied
  team, and extracts what the log proves about the scouted species — Speed
  relations against your known members, the per-hit damage it took from them
  (the log reports cumulative HP; the pipeline converts it), and item and
  ability reveals — then runs the shared SetInferenceEngine. The engine moved
  into `src/inference.ts`, so hand-typed observations and replay-derived ones
  narrow candidates with identical math. A `/scout-opponent` workflow prompt
  wraps the pipeline.
- **Role taxonomy and structured objectives.** `optimize_team` accepts
  `requiredRoles` (fake_out, tailwind, trick_room, redirection, priority,
  intimidate, pivoting, spread, anchor, cleaner — detected deterministically
  from learnsets, abilities and base stats), `excludedSpecies`, and a
  `playstyle` shorthand; candidates and pairs earn score for roles the team
  still lacks, and every recommendation carries its detected roles.
- **Association metrics.** `compare_meta` now separates rising popularity
  from rising synergy: per-species `rankDelta`, per-core co-occurrence `lift`
  (1.0 = independent) for both windows, and `setChanges` — species whose
  most-played item, ability or nature moved between the windows, computed
  from the per-window teamlists the history generator already fetches.

## [6.0.0] - 2026-09-19

### Changed

- **Breaking: responses are compact by default.** Every tool accepts
  `detail: "compact" | "evidence" | "debug"` (default `"compact"`), applied by
  a declarative per-mode field-tier table — the engines are untouched. Compact
  returns conclusions and the numbers needed to reason (a 3-member
  `analyze_team` synergy read drops from 7.9 KB to 3.6 KB, `prepare_matchup`
  from 5.6 KB to 1.1 KB); `"evidence"` adds ranges, benchmarks, assumptions and
  full per-row detail; `"debug"` adds everything plus an `engine` block with
  the data version. Modes whose payload is already the answer (lookups,
  regulations, pastes) are unchanged at every level. Ask for more only when
  the reasoning actually needs it — model context is the expensive resource.

## [5.0.0] - 2026-09-19

### Changed

- **Breaking: the public surface is now eight compound tools.** The 30
  dedicated tools are re-exposed as intent-level entrypoints that dispatch on
  a `mode` field: `lookup` (species/forms/search/move/item/ability/nature/
  learnset/type/matchup/sprites), `calculate` (stats/damage/matchups/speed/
  optimize_evs), `analyze_team` (synergy/diagnose), `analyze_battle`
  (replay/infer), `analyze_meta` (threats/compare/set), `team_io`
  (parse/format/legality/regulation/regulations), plus `optimize_team` and
  `prepare_matchup` unchanged. The model picks an intent; the server does the
  orchestration. Every mode carries the same documented fields and the same
  per-mode output validation the dedicated tool had — the compound layer
  captures the existing registrations and dispatches through them, so nothing
  was reimplemented or silently changed. Clients must migrate call sites to
  the new names; the workflow prompts already speak the new surface.

## [4.6.0] - 2026-09-19

### Added

- **The shared MatchupEvaluator** — one reusable definition of what an actual
  competitive answer is, replacing "super-effective move = answer" wherever
  sets are known. It runs the real math both directions (each side's hardest
  hit and damage range, level-50 Speed with priority, a conservative turn
  simulation) and classifies the matchup: `HARD_ANSWER`, `SOFT_ANSWER`,
  `REVENGE` (wins only on initiative, cannot switch in), `SPEED_DEPENDENT`,
  `TRADE`, `UNFAVORABLE`, `UNKNOWN` — with the deciding fact quoted in every
  verdict. Deterministic by contract: our side always simulates its minimum
  roll against their maximum, so a positive class is a worst-case guarantee.
- **Damage-aware analysis.** `analyze_team`'s `threatCoverage` rows now carry
  `answerClass` and `answerBy` when members supply moves — the evaluator has
  already corrected real cases, e.g. a type-chart 2\u00d7 hit that the exchange
  math rightly calls `UNFAVORABLE`. `diagnose_team` problems agree with the
  same engine: unanswered threats are stated from battle math, and matchups
  that ride on initiative or rolls get their own problem with the reason.
- **Exhaustive bring-four.** `prepare_matchup` now scores every combination of
  four (per-member type scores plus how much of their team the four cover
  together, and a preserve bonus for sole-answer members) instead of a greedy
  top-four, and reports the two runner-up combinations plus the score so the
  cost of the pick is visible. Lead pairings are scored (Fake Out, attacker
  Speed, best hit into their team) rather than defaulting to the fastest.

## [4.5.1] - 2026-09-19

### Added

- **ChampionsDex — the verified game-model foundation.** Every gameplay tool
  now resolves through one `getChampionsDex()` layer instead of calling the raw
  dex directly. `scripts/verify-champions.mjs` diffs the bundled dataset
  against official Champions data and refreshes the committed facts table
  (`src/champions.data.ts`); `test/champions.mjs` pins it all as golden
  regression tests: exclusive-form typings and BSTs, roster integrity, the
  stat-point math contract, and representative damage rolls. Verification
  result: **266/266 species with measured usage match official base stats,
  types and abilities, zero divergences** — including 38 of the 49
  Champions-exclusive forms; the 11 unindexed forms and 63 unindexed roster
  species carry no usage data (their detail endpoints return fallback data for
  other species, e.g. Watchog returning Rillaboom's stats) and are reported as
  unverifiable rather than guessed at. No public-surface changes.

## [4.5.0] - 2026-09-18

### Added

- **`infer_set`** — reverse constraint solving, the scouting feature: the player
  reports what they saw ("it outsped my Jolly Salamence", "Close Combat did 71%
  to my Rillaboom", "it took 80% from Flare Blitz") and the engine narrows which
  set the opponent could be running, applying the same exact level-50 Speed math
  and damage rolls the forward tools use, backwards. Every observation reports
  how many candidates it eliminated, survivors are ranked by how far they are
  from the set the meta actually plays, and impossible observations empty the
  list cleanly rather than guessing. On the smoke scenario the engine recovers
  the real meta set — Adamant Grassy Seed — as its most likely survivor.
- **`optimize_team`** — constraint-based team completion: fill one or two open
  slots against "cover these types" and "answer these threats" (defaulted to
  the team's real coverage gaps and the meta's top five). Species and pairs are
  scored on the typing they add, with measured usage as a preference; Species
  Clause and roster legality hold by construction, and every recommendation
  carries its reasons.

## [4.4.0] - 2026-09-18

### Added

- **`compare_meta`** — "what is becoming popular?": per-species usage in the
  last 7 days against the 7 before, plus the species pairs gaining the most
  co-occurrence. The comparison is computed by the new
  `scripts/build-meta-history.mjs`, which aggregates full teamlists from the
  same tournament source as the threat list, buckets them into the two rolling
  windows, and refuses to write unless every tournament in the window was
  fetched — so the server stays a pure offline read and a partial fetch cannot
  ship silently. First cut: 2,091 teams vs 1,292, with Gholdengo +11.9 points,
  Raichu +8.4, and the Gholdengo+Rillaboom core nearly doubling.
- **`analyze_replay`** — a Showdown-format battle log in, a deterministic
  post-match read out: both teams, every KO with the move that caused it, the
  Speed order observed turn by turn (caveated), damage percentages per hit, and
  a type-coverage read of the matchup. Pure text parsing over the bundled
  dataset — replay URLs are fetched and pasted client-side.
- **Provenance on recommendations** — every `diagnose_team` candidate change
  now carries `dataUpdated`, the threat list's `sourceAsOf`, alongside its
  evidence and confidence, so a recommendation ages visibly instead of
  silently.

## [4.3.0] - 2026-09-18

### Added

- **Six server-provided workflow prompts** — `/team-doctor`, `/matchup-prep`,
  `/build-around`, `/tournament-prep`, `/learn-my-team`, `/meta-report` — that
  chain the deterministic tools into compound workflows without adding a tool
  per workflow. Each is a static template following one doctrine: the model
  explains, getcompetitive proves, so every number in an answer must come from
  a tool's output.
- **A Streamable HTTP entrypoint** (`node dist/http-server.js`), the
  remote-endpoint mode: the same tools and prompts over HTTP, stateless per the
  SDK's contract (one fresh transport per request, no session state), so it
  sits behind a load balancer unchanged. The stdio and HTTP entrypoints build
  from one shared `buildServer()`, so the two surfaces cannot drift. Deployment
  (TLS, auth, rate limits) is deliberately the deployer's call.

## [4.2.0] - 2026-09-18

### Added

- **`get_sprites`** — sprite URLs for a whole team in one call, because a team
  is the unit of work: pass every species at once and get one entry per member
  with the resolved name, National Dex number, URL and alt text; `size:
  "artwork"` gives the 475×475 transparent official art (default) and `"icon"`
  the 96×96 game sprite for compact rows. The response is addresses, not image
  bytes: the server stays a pure offline read by shipping a committed id table
  generated by the new `scripts/build-sprites.mjs` (one PokéAPI request, run at
  build time — PokéAPI form ids above 10000 follow neither the dex number nor
  the forme name, so the mapping is baked rather than derived), and the caller
  fetches client-side. One unresolvable name lands in `unresolved` alongside
  the rest — a bad name never fails the batch. Coverage on the current data:
  all 24 Regulation M-C threat species resolve, including the sexed pair that
  PokéAPI files only under their gendered slugs.

## [4.1.0] - 2026-09-18

### Added

- **The P0 team workflows** — four tools that turn the toolbox into a coach:
  - **`parse_team`** turns a Showdown/Pokepaste block, the server's own `get_set`
    paste, or a `species @ item | ability | nature | EVs | moves` one-liner into
    the canonical team shape every other tool takes, in one call instead of six
    hand-built objects. Parsing is forgiving: unknown species, moves, items and
    abilities become warnings carrying the supplied spelling, never errors, and
    an optional `regulation` flags species outside the legal roster. `EVs:`
    lines whose values all fit 0-32 and total at most 66 are read as Champions
    stat points, matching the server's own pastes.
  - **`format_team`** renders a canonical team back into paste text; spreads
    keep the scale they were given, so it round-trips through `parse_team`
    unchanged.
  - **`diagnose_team`** is "here is my team — fix it": weaknesses with
    evidence (unanswered top threats, matchups resting on one member, stacked
    weaknesses, losing the speed race, uncovered types), then candidate changes
    each backed by a calculation or a usage fact — spread changes computed to
    exact level-50 Speed values, learnset-legal move swaps, item changes toward
    what the meta actually plays, and member swaps flagged as typing-only
    because usage data exists only for the ranked species. `lockedMembers`
    keeps species from being swapped out; the `goal` string is carried
    verbatim. (The feedback's "Team Doctor", renamed to the `verb_noun` pattern
    the TDQS gate enforces.)
  - **`prepare_matchup`** is "here is my opponent — prepare me": their likely
    sets ordered by usage with each species' actual item, ability, nature, EVs
    and four moves; speed races with margins spelled out; real damage rolls for
    the key matchups (your hardest hit into their top threats and their hardest
    hit back); the same type-scored bring-four as `analyze_team`; lead pairings;
    win and loss conditions; and the members to preserve. Uncurated opponent
    species are estimated from base stats and say so.

## [4.0.1] - 2026-09-18

### Added

- **Coverage is now knowable before it is needed.** `get_set` only answers for
  the ranked species of a regulation, and the only way to learn that used to be a
  failed call — which, in three days of usage, was 12 of 30 `get_set` calls.
  - `list_regulations` and `get_regulation` report `threatCount`: how many
    species have a usage-derived set, present only where a list exists. Usage
    needs a closed sample window, so M-A and M-B have none — previously
    discoverable only by calling `list_threats` and reading its error.
  - A `get_set` miss names the coverage it fell outside — `No curated set for
    "Gengar"; sets exist for Regulation Set M-C's 24 ranked species only, and
    `list_threats` lists them.` — and the tool description states the limit up
    front, so a caller can check `threatCount` first.
  - Asking for a species in a regulation that has no list at all is now its own
    error. It previously reported the species as missing: the regulation scope
    filtered the list set to nothing, and the lookup could not tell that from a
    species that genuinely has no set.

## [4.0.0] - 2026-09-18

### Changed

- **Breaking: responses no longer carry fields the caller did not ask for.** A
  representative 25-call sweep over the whole surface drops from 59.0 KB to
  39.8 KB (-33%) with no capability removed — every fact is still reachable, it
  just costs a call that asks for it. Four tools changed shape:
  - **`list_threats` lists; `get_set` details.** Passing `regulation` used to
    return all 24 full sets (13.0 KB, 79% of it re-fetchable from `get_set`).
    It now returns the ranking alone — species, role, tier, usage — and
    `get_set` takes **an array of species** so one call still fetches several
    sets (responding as `sets[]`; a single species keeps the flat shape).
  - **`get_regulation` omits the two name rosters** unless `includeRoster: true`,
    which is 3.4 KB of its 4.2 KB. `eligibleCount`/`megaCount` are always
    returned, so the size is visible before deciding to ask.
  - **`calculate_matchups` rows are structured, not narrated.** The per-defender
    `description` sentence re-encoded `bestMove`, `damageRange` and `koChance`
    in prose and was 34% of a 30-defender call; `calculate_damage` still renders
    it for a single matchup. The attacker's Speed is hoisted to `attackerSpeed`
    instead of repeating an identical number in all 30 rows.
  - **`analyze_team` drops two derived fields:** `speed.fasterThreats`, a
    base-Speed list that `threatCoverage` had already superseded with real sets,
    and the per-threat `fastestSpeed` that was the same value 24 times over.
- Damage sets no longer echo defaults: `ivs` appears only when a call supplied a
  non-default one, and `boosts` only when a stage was set. Both were six fixed
  values on every set in `calculate_damage` and `calculate_matchups`.

## [3.2.0] - 2026-09-18

### Added

- **`analyze_team` plans the bring-4.** Supply `opponent` (up to six species) and
  it reports `bringFour`: every member scored on how many of theirs it hits
  super-effectively against how many hit it back, the best four to bring, the two
  left behind, and the types that leaves stacked and uncovered. The granularity is
  deliberate rather than a shortcut — team preview shows the opponent's species
  and nothing else, ranked being closed teamlist, so a type read is exactly what a
  player has to go on.

## [3.1.0] - 2026-09-18

### Added

- **`get_set` returns the set as a Showdown-format `paste`**, ready to copy into
  a team builder or paste host — `species @ item`, ability, level 50, nature, EVs
  and the four moves. EVs are written in **Champions stat points**, the scale the
  game's training screen and the community's Champions paste sites use, verified
  against a published team page rather than assumed.
- Threats now carry **both scales**: `championsPoints` (0-32 each, 66 total — the
  form the source publishes and the game takes) alongside `evs` (the 0-252 scale
  the `calculate_*` tools take). The point spread is stored rather than derived,
  so a spread trimmed to fit the calculator's 510 EV budget no longer reads back
  a point under: Rillaboom's maxed HP/Atk pair is 32/32, not 31/31.

## [3.0.0] - 2026-09-18

### Removed

- **Breaking: the server is Champions-only.** Four tools that served a different
  game's meta are gone — `list_tiers` and `list_speed_tiers` (Smogon fan tiers),
  and `list_archetypes` / `get_archetype` together with the 36 KB archetype
  library behind them, which was Smogon singles and doubles lore about hazards,
  Defog, Rapid Spin and Salt Cure, none of which exist in Champions. The surface
  goes from 25 tools to 21; the data, battle-math and regulation tools stay,
  because a Champions team cannot be built without them.
- **Breaking: `generation` is gone from every tool.** Champions is one game, so
  the 1-9 selector, the `generation` field on responses and the `normalizeGen`
  helper behind them are all removed. Responses still carry `gen` where it is a
  fact about an entry rather than a request — the generation a species, move,
  item or ability was introduced in.

### Changed

- **Breaking: Terastallization is gone.** `teraType` is removed from the set
  inputs and outputs of `calculate_damage`, `calculate_matchups` and
  `analyze_team`, and from the species profile. Champions has no Tera, so the
  field could only ever produce a calculation that cannot happen in the game.
  `analyze_team` now tallies weakness and coverage from a member's own types.
- **Breaking: species no longer carry Smogon tiers.** `tier`, `doublesTier` and
  `natDexTier` are removed from `get_pokemon`, `list_forms` and `search_dex`. The
  `tier` on a threat is unrelated and stays — that is this server's own S/A/B
  usage band.

## [2.0.2] - 2026-09-17

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
