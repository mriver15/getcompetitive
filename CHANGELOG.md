# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `calc_matchups` — batch damage calculation (one attacker vs many defenders,
  best-move selection, KO chance, speed ordering).
- `speed_check` — final Speed with nature/EV/IV/boosts/Choice Scarf, compared
  against a Regulation Set's legal roster.
- Move validation in `check_legality` — flags moves a species cannot learn.

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
