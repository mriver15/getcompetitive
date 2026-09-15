# getcompetitive

[![npm version](https://img.shields.io/npm/v/getcompetitive)](https://www.npmjs.com/package/getcompetitive)
[![CI](https://github.com/mriver15/getcompetitive/actions/workflows/ci.yml/badge.svg)](https://github.com/mriver15/getcompetitive/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-green.svg)](#install)
[![Glama](https://glama.ai/mcp/servers/mriver15/getcompetitive/badges/score.svg)](https://glama.ai/mcp/servers/mriver15/getcompetitive)

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that gives
AI agents everything needed to build, analyze, and validate competitive Pokémon
teams — including **Pokémon Champions / VGC** regulations.

## What it provides

- **25 tools** across five domains: data, team building, meta (curated), battle mechanics, and official regulation sets
- Full **Pokémon Showdown** competitive dataset — species, alternate forms, stats, moves, items, abilities, natures, learnsets, types, tiers
- **Battle math** from Smogon's calculator — stat calculation and full damage calculation (weather, terrain, boosts, items, Tera)
- **Official Regulation Sets** (M-A → M-C) with seasonal legal rosters and team legality checking
- Generation-aware data (1–9, default 9)

Built on [`@pkmn/dex`](https://github.com/pkmn/EPOKe) (Showdown data) and
[`@smogon/calc`](https://github.com/smogon/calc) (battle math).

## Tools

### Data
| Tool | Purpose |
| --- | --- |
| `get_pokemon` | Types, base stats, BST, abilities, tiers, forms, weight, gender, evolutions |
| `list_forms` | All forms of a species (alternate, cosmetic, battle-only) |
| `search` | Fuzzy name search across species / moves / items / abilities / natures |
| `get_move` | Type, category, power, accuracy, PP, priority, target, secondary effects |
| `get_item` | Effect, flags, mega stone, Z-move, Fling, boosts |
| `get_ability` | Effect description, flags |
| `get_nature` | Boosts / lowers which stat |
| `get_learnset` | All learnable moves grouped by method (level-up, TM, egg, tutor, event) |
| `get_type` | Defensive weaknesses, resistances, immunities |
| `type_chart` | Matchup multiplier, offensive coverage, or defensive chart (defender can be a species) |

### Team building
| Tool | Purpose |
| --- | --- |
| `list_archetypes` | Recognized archetypes (Hyper Offense, Rain, Stall, Trick Room, …) with roles + members |
| `get_archetype` | Full detail: description, roles, members, strengths, weaknesses, counters, tips |
| `list_tiers` | All legal Pokemon grouped by competitive tier (singles/doubles) |
| `speed_tiers` | Speed of every Pokemon in a tier at common investment levels, sorted |
| `analyze_team` | Team synergy: stacked defensive weaknesses, offensive coverage gaps, speed placement, and a heuristic 0-100 score |

### Meta (curated)
| Tool | Purpose |
| --- | --- |
| `list_threats` | Curated meta threat list for a regulation (role, tier, standard set) |
| `get_set` | Standard set for a species (item, ability, nature, EVs, 4 moves, Tera) |

### Regulations (Pokémon Champions / VGC)
| Tool | Purpose |
| --- | --- |
| `list_regulations` | Official Regulation Sets with dates, status, and roster size |
| `get_regulation` | Full set rules: battle rules, clauses, Mega rules, and the complete legal roster |
| `check_legality` | Validate a team against a set: illegal species, Species/Item Clause, illegal moves, team size, Mega eligibility |

### Battle mechanics
| Tool | Purpose |
| --- | --- |
| `calculate_stats` | Final 6 stats at a level with EVs/IVs/nature (in-game formula) |
| `calculate_damage` | Full damage calc (sets, item, ability, boosts, weather, terrain, hazards) |
| `calc_matchups` | Batch damage: one attacker vs many defenders — best move, damage range, KO chance, who moves first |
| `speed_check` | Final Speed (nature/EV/IV/boost/Scarf) vs a regulation roster's invested/uninvested speeds |
| `optimize_evs` | EV spread solver: min EVs to survive / outspeed / guarantee a KO, then maximize a stat |

> **Two taxonomies.** `list_tiers` / `speed_tiers` use **Smogon fan tiers**
> (OU/UU/Uber — a community laddering system). The Regulation tools use the
> **official Pokémon Champions / VGC Regulation Sets** (seasonal legal rosters).

## Install

### npm

```bash
npm install -g getcompetitive   # or: npx getcompetitive
```

### Docker

No Node.js or npm install required — the image builds the server from source:

```bash
docker build -t getcompetitive .
docker run -i --rm getcompetitive   # speaks MCP over stdio
```

### From source

```bash
git clone https://github.com/mriver15/getcompetitive.git
cd getcompetitive
npm install
npm run build
npm start                       # starts the MCP server on stdio
```

## Configure an MCP client

With npm:

```json
{
  "mcpServers": {
    "getcompetitive": {
      "command": "npx",
      "args": ["getcompetitive"]
    }
  }
}
```

With Docker (after `docker build -t getcompetitive .`):

```json
{
  "mcpServers": {
    "getcompetitive": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "getcompetitive"]
    }
  }
}
```

For Claude Desktop, add one of the same entries under `mcpServers` in
`claude_desktop_config.json`.

## Verify

```bash
npm test   # builds and drives every tool over real MCP stdio
```

## Example queries

- `get_pokemon` `{ "species": "Ogerpon-Wellspring" }`
- `type_chart` `{ "attacker": "Ice", "defender": "Garchomp" }` → 4x super effective
- `calculate_stats` `{ "species": "Garchomp", "level": 50, "nature": "Jolly", "evs": { "atk": 252, "spe": 252 } }`
- `calculate_damage` `{ "attacker": { "species": "Garchomp", "level": 50, "nature": "Jolly", "evs": { "atk": 252, "spe": 252 }, "item": "Choice Band" }, "defender": { "species": "Corviknight", "level": 50, "nature": "Impish", "evs": { "hp": 252, "def": 252 } }, "move": "Dragon Claw" }`
- `check_legality` `{ "regulation": "m-c", "team": [ { "species": "Garchomp", "item": "Choice Band" } ] }`
- `analyze_team` `{ "team": [ { "species": "Garchomp", "moves": ["Earthquake", "Dragon Claw", "Rock Slide"] } ], "regulation": "m-c" }`

## Data freshness

The Showdown dataset and battle math track `@pkmn/dex` / `@smogon/calc`. Official
**Regulation Sets change seasonally**; the legal rosters are regenerated with
`node scripts/extract-regs.mjs`, and the curated **threat list / standard sets**
(`src/threats.ts`) are keyed by regulation — scaffold a new one with
`node scripts/threat-scaffold.mjs <regulation>`. See [CONTRIBUTING](CONTRIBUTING.md).

## Contributing

Pull requests welcome. See [CONTRIBUTING](CONTRIBUTING.md) for setup and
conventions, and [CODE_OF_CONDUCT](CODE_OF_CONDUCT.md) for community standards.

## License

[MIT](LICENSE). Data is sourced from the Pokémon Showdown ecosystem and
Bulbapedia; Pokémon is © Nintendo / Game Freak.
