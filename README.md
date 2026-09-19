# getcompetitive

[![npm version](https://img.shields.io/npm/v/getcompetitive)](https://www.npmjs.com/package/getcompetitive)
[![CI](https://github.com/mriver15/getcompetitive/actions/workflows/ci.yml/badge.svg)](https://github.com/mriver15/getcompetitive/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-green.svg)](#install)
[![Glama](https://glama.ai/mcp/servers/mriver15/getcompetitive/badges/score.svg)](https://glama.ai/mcp/servers/mriver15/getcompetitive)

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that gives
AI agents what they need to build, analyze, and validate **Pokémon Champions**
teams: the official Regulation Sets, the usage-derived meta, and the battle math
behind them.

Champions is the only game here. The server speaks its terms — doubles, level 50,
Mega Evolution once per battle, 66 stat points, no Terastallization — and the
Smogon-tier and archetype surface that used to sit alongside it is gone.

## What it provides

- **30 tools** across six domains: data, team analysis, team workflows (paste in, diagnose, prepare matchups, learn from replays, scout sets, fill slots), meta (usage-derived), battle mechanics, and official regulation sets
- **Six workflow prompts** — `/team-doctor`, `/matchup-prep`, `/build-around`, `/tournament-prep`, `/learn-my-team`, `/meta-report` — server-provided templates that chain the deterministic tools, so compound workflows stay discoverable without a 40-tool surface
- **Structured, agent-first definitions** — every tool declares MCP annotations and an output schema, returns `structuredContent` alongside JSON text, and documents all of its parameters; the deterministic half of the [TDQS](https://tdqs.dev) checklist is linted in CI
- Full **Pokémon Showdown** dataset — species, alternate forms, stats, moves, items, abilities, natures, learnsets, types
- **Battle math** from Smogon's calculator — stat calculation and full damage calculation (weather, terrain, boosts, items)
- **Both EV scales** — the 0-252 EVs the calculator takes and Pokémon Champions' own 66 stat points, accepted on input and reported alongside every spread
- **Official Regulation Sets** (M-A → M-C) with seasonal legal rosters and team legality checking

Built on [`@pkmn/dex`](https://github.com/pkmn/EPOKe) (Showdown data) and
[`@smogon/calc`](https://github.com/smogon/calc) (battle math).

## Tools

### Data
| Tool | Purpose |
| --- | --- |
| `get_pokemon` | Types, base stats, BST, abilities, forms, weight, gender, evolutions |
| `list_forms` | All forms of a species (alternate, cosmetic, battle-only) |
| `get_sprites` | Sprite URLs for a whole team in one call (artwork or icon), from a committed PokéAPI id table — URLs only, the server does no network I/O |
| `search_dex` | Fuzzy name search across species / moves / items / abilities / natures |
| `get_move` | Type, category, power, accuracy, PP, priority, target, secondary effects |
| `get_item` | Effect, flags, mega stone, Z-move, Fling, boosts |
| `get_ability` | Effect description, flags |
| `get_nature` | Boosts / lowers which stat |
| `get_learnset` | All learnable moves grouped by method (level-up, TM, egg, tutor, event) |
| `get_type` | Defensive weaknesses, resistances, immunities |
| `get_type_matchup` | Matchup multiplier, offensive coverage, or defensive chart (defender can be a species) |

### Team analysis
| Tool | Purpose |
| --- | --- |
| `analyze_team` | Team synergy: stacked defensive weaknesses, offensive coverage gaps, speed placement, a heuristic score, and — with a regulation — coverage against the meta's real sets, with battle-math `answerClass` verdicts from the shared MatchupEvaluator |

### Team workflows
| Tool | Purpose |
| --- | --- |
| `parse_team` | Turn a Showdown/Pokepaste block (or a `species @ item \| ability \| nature \| EVs \| moves` one-liner) into the canonical team every tool takes; unknown names become warnings, not errors |
| `format_team` | Render a canonical team back into paste text, round-tripping through `parse_team` |
| `diagnose_team` | "Fix my team": weaknesses with evidence — battle-math matchup verdicts included when sets are known — then concrete spread, move, item and member changes, each backed by exact math or usage data |
| `prepare_matchup` | "Prepare me": their likely sets by usage, speed races with margins, key damage rolls, an exhaustively scored bring-four with alternates, scored lead pairings, and win/loss conditions |
| `analyze_replay` | Post-match read of a battle log: teams, KOs with causes, observed Speed order, damage percentages, and a type-coverage read |
| `infer_set` | Reverse constraint solving: battle observations (who moved first, damage dealt/taken) narrow the opponent's likely set, ranked against the meta |
| `optimize_team` | Fill open team slots against constraints — cover these types, answer these threats — with reasons for every recommendation |

### Meta (usage-derived)
| Tool | Purpose |
| --- | --- |
| `list_threats` | Most-used Pokemon of a regulation, ranked by measured usage (role, tier, usage share) with the sample and sources behind it |
| `compare_meta` | What is changing: last 7 days of usage vs the 7 before, per species and per two-species core, from a committed build-time aggregation |
| `get_set` | Most-played set for one or several species (item, ability, nature, EVs, 4 moves), with the Mega form and ability where relevant; covers each regulation's ranked species, which `list_threats` lists |

### Regulations (Pokémon Champions / VGC)
| Tool | Purpose |
| --- | --- |
| `list_regulations` | Official Regulation Sets with dates, status, roster size, and how many species have usage-derived sets |
| `get_regulation` | Full set rules: battle rules, clauses, Mega rules, and roster sizes; the name rosters come back with `includeRoster` |
| `check_legality` | Validate a team against a set: illegal species, Species/Item Clause, illegal moves, team size, Mega eligibility |

### Battle mechanics
| Tool | Purpose |
| --- | --- |
| `calculate_stats` | Final 6 stats at a level with EVs/IVs/nature (in-game formula) |
| `calculate_damage` | Full damage calc (sets, item, ability, boosts, weather, terrain, hazards) |
| `calculate_matchups` | Batch damage: one attacker vs many defenders — best move, damage range, KO chance, who moves first |
| `check_speed` | Final Speed (nature/EV/IV/boost/Scarf) vs a regulation roster's invested/uninvested speeds |
| `optimize_evs` | EV spread solver: min EVs to survive / outspeed / guarantee a KO, then maximize a stat |

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

## Remote endpoint

The same surface runs over Streamable HTTP — the stateless remote mode, one
request per transport, safe behind a load balancer:

```bash
node dist/http-server.js            # http://127.0.0.1:3000/mcp
PORT=8080 node dist/http-server.js
```

Connect a client with the URL `http://<host>:<port>/mcp`. TLS, auth and rate
limiting are the deployer's concern: the server itself remains a pure offline
read.

## Workflow prompts

Six server-provided prompts make the compound workflows discoverable without
adding a tool per workflow — each chains the deterministic tools, and each
follows the same doctrine: the model explains, getcompetitive proves.

| Prompt | What it chains |
| --- | --- |
| `/team-doctor` | `parse_team` → `diagnose_team` → `format_team` ("fix my team") |
| `/matchup-prep` | `parse_team` → `prepare_matchup` ("here is my opponent") |
| `/build-around` | `get_set` → `analyze_team` → `diagnose_team` → `check_legality` → `format_team` |
| `/tournament-prep` | `get_regulation` → `list_threats` → `get_set` (a pre-event briefing) |
| `/learn-my-team` | `parse_team` → `analyze_team` → `diagnose_team` → `get_set` (a team guide) |
| `/meta-report` | `list_threats` → `get_set` on the top five (a data-dated meta report) |

## Verify

```bash
npm test   # builds and drives every tool over real MCP stdio, plus the HTTP entrypoint
```

## Example queries

- `get_pokemon` `{ "species": "Ogerpon-Wellspring" }`
- `get_type_matchup` `{ "attacker": "Ice", "defender": "Garchomp" }` → 4x super effective
- `calculate_stats` `{ "species": "Garchomp", "level": 50, "nature": "Jolly", "evs": { "atk": 252, "spe": 252 } }`
- `calculate_damage` `{ "attacker": { "species": "Garchomp", "level": 50, "nature": "Jolly", "evs": { "atk": 252, "spe": 252 }, "item": "Choice Band" }, "defender": { "species": "Corviknight", "level": 50, "nature": "Impish", "evs": { "hp": 252, "def": 252 } }, "move": "Dragon Claw" }`
- `check_legality` `{ "regulation": "m-c", "team": [ { "species": "Garchomp", "item": "Choice Band" } ] }`
- `analyze_team` `{ "team": [ { "species": "Garchomp", "moves": ["Earthquake", "Dragon Claw", "Rock Slide"] } ], "regulation": "m-c" }`
- `parse_team` `{ "text": "Garchomp @ Choice Scarf | Rough Skin | Jolly | 252 Atk / 252 Spe | Earthquake / Dragon Claw" }`
- `diagnose_team` `{ "team": [ { "species": "Garchomp", "nature": "Jolly", "evs": { "atk": 252, "spe": 252 } } ], "goal": "improve against the current meta" }`
- `prepare_matchup` `{ "team": [ { "species": "Garchomp" } ], "opponent": ["Sneasler", "Salamence-Mega", "Gholdengo"] }`

## Data freshness

The Showdown dataset and battle math track `@pkmn/dex` / `@smogon/calc`. Official
**Regulation Sets change seasonally**; the legal rosters are regenerated with
`node scripts/extract-regs.mjs`, the **threat list / standard sets**
(`src/threats.ts`) with `node scripts/build-threats.mjs <regulation>`, and the
**two-window usage history** behind `compare_meta` with
`node scripts/build-meta-history.mjs <regulation>` (it refuses to write unless
every tournament in the window was fetched). The **Champions game model** is
the single `getChampionsDex()` layer: `node scripts/verify-champions.mjs`
diffs base stats, types and abilities for every Champions-exclusive form, the
whole roster, and every threat species against official data and refreshes the
committed facts table, which `test/champions.mjs` pins as golden regression
tests. All generated data files are committed, so the tools stay offline at
runtime. See [CONTRIBUTING](CONTRIBUTING.md).

## Contributing

Pull requests welcome. See [CONTRIBUTING](CONTRIBUTING.md) for setup and
conventions, and [CODE_OF_CONDUCT](CODE_OF_CONDUCT.md) for community standards.

## License

[MIT](LICENSE). Data is sourced from the Pokémon Showdown ecosystem and
Bulbapedia; usage statistics come from [Limitless TCG](https://play.limitlesstcg.com/)
tournaments and the in-game ranked ladder as aggregated by
[MunchStats](https://www.munchstats.com/), cross-checked against
[Pikalytics](https://www.pikalytics.com/). Pokémon is © Nintendo / Game Freak.
