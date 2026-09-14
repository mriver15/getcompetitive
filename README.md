# getcompetitive

An MCP server for competitive Pokemon team building, decision making, and data
lookup. It exposes the full Pokemon Showdown competitive dataset (species, stats,
alternate forms, types, items, abilities, moves, learnsets, tiers), battle
mechanics (stat calculation, full damage calculation, speed tiers), curated
team-building archetypes, and the official **Pokémon Champions / VGC Regulation
Sets** (seasonal legal rosters + team legality checking).

Built on [`@pkmn/dex`](https://github.com/pkmn/EPOKe) (Showdown data) and
[`@smogon/calc`](https://github.com/smogon/calc) (battle math). Generation-aware:
every data tool accepts a `generation` parameter (1–9, default 9). Regulation
data is sourced from Bulbapedia (mirrors the official Play! Pokémon rules) and
regenerated with `node scripts/extract-regs.mjs`.

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
| `analyze_team` | Team synergy: stacked defensive weaknesses, offensive coverage gaps, speed placement vs a regulation roster |

### Regulations (Pokémon Champions / VGC)
| Tool | Purpose |
| --- | --- |
| `list_regulations` | Official Regulation Sets with dates, status, and roster size |
| `get_regulation` | Full set rules: battle rules, clauses, Mega rules, and the complete legal roster |
| `check_legality` | Validate a team against a set: illegal species, Species/Item Clause, team size, Mega eligibility |

Note the two different taxonomies: `list_tiers`/`speed_tiers` use **Smogon fan tiers**
(OU/UU/Uber — a community laddering system), while the Regulation tools use the
**official Pokémon Champions / VGC Regulation Sets** (seasonal legal rosters).

### Battle mechanics
| Tool | Purpose |
| --- | --- |
| `calculate_stats` | Final 6 stats at a level with EVs/IVs/nature (in-game formula) |
| `calculate_damage` | Full Smogon damage calc (sets, item, ability, boosts, weather, terrain, hazards) |

## Install & run

```bash
npm install
npm run build
npm start          # starts the MCP server on stdio
```

## Configure an MCP client

```json
{
  "mcpServers": {
    "getcompetitive": {
      "command": "node",
      "args": ["/absolute/path/to/getcompetitive/dist/index.js"]
    }
  }
}
```

For Claude Desktop, add the same entry under `mcpServers` in
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
- `get_archetype` `{ "name": "rain" }`
- `speed_tiers` `{ "tier": "OU", "level": 50 }`
- `list_regulations` `{}`
- `get_regulation` `{ "regulation": "M-C" }`
- `check_legality` `{ "regulation": "m-c", "team": [ { "species": "Garchomp", "item": "Choice Band" }, { "species": "Gholdengo", "item": "Leftovers" } ] }`
- `analyze_team` `{ "team": [ { "species": "Garchomp", "moves": ["Earthquake", "Dragon Claw", "Rock Slide"] }, { "species": "Gholdengo", "moves": ["Make It Rain", "Shadow Ball"] } ], "regulation": "m-c" }`

## License

MIT
