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

- **8 compound tools**: `lookup`, `calculate`, `analyze_team`, `optimize_team`, `prepare_matchup`, `analyze_battle`, `analyze_meta`, `team_io` — intent-level entrypoints that dispatch on a `mode`, so the model picks an intent and the server does the orchestration
- **Six workflow prompts** — `/team-doctor`, `/matchup-prep`, `/build-around`, `/tournament-prep`, `/learn-my-team`, `/meta-report` — server-provided templates that chain the eight tools, so compound workflows stay discoverable without widening the surface
- **Structured, agent-first definitions** — every tool declares MCP annotations and an output schema, returns `structuredContent` alongside JSON text, and documents all of its parameters; the deterministic half of the [TDQS](https://tdqs.dev) checklist is linted in CI
- Full **Pokémon Showdown** dataset — species, alternate forms, stats, moves, items, abilities, natures, learnsets, types
- **Battle math** from Smogon's calculator — stat calculation and full damage calculation (weather, terrain, boosts, items)
- **Both EV scales** — the 0-252 EVs the calculator takes and Pokémon Champions' own 66 stat points, accepted on input and reported alongside every spread
- **Official Regulation Sets** (M-A → M-C) with seasonal legal rosters and team legality checking

Built on [`@pkmn/dex`](https://github.com/pkmn/EPOKe) (Showdown data) and
[`@smogon/calc`](https://github.com/smogon/calc) (battle math).

## Tools

Eight compound tools; each dispatches on a `mode` field where the name alone is ambiguous, and each accepts `detail: "compact" | "evidence" | "debug"` — compact by default, so responses carry conclusions and the numbers needed to reason, and you ask for ranges, benchmarks and provenance only when the reasoning needs them.

| Tool | Purpose | Modes |
| --- | --- | --- |
| `lookup` | One data lookup | species, forms, search, move, item, ability, nature, learnset, type, matchup, sprites |
| `calculate` | One battle calc | stats, damage, matchups, speed, optimize_evs |
| `analyze_team` | Team analysis | synergy, diagnose |
| `optimize_team` | Fill open team slots against constraints | — |
| `prepare_matchup` | Pre-game dossier: likely sets, speed races, damage rolls, exhaustive bring-four with alternates, scored leads, win/loss conditions | — |
| `analyze_battle` | Post-game and scouting | replay, infer |
| `analyze_meta` | The meta, measured | threats, compare, set |
| `team_io` | Team import/export and validation | parse, format, legality, regulation, regulations |

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
read. Browsing `http://<host>:<port>/` serves the **evidence app** — the model
converses, the page displays the proof (bring-four, threat matrix, key rolls).

### Hosted MCP

`dist/worker.js` is a serverless fetch handler over the same surface — deploy
it and clients need nothing but a URL:

```bash
npx wrangler deploy            # with wrangler.toml
# connect clients to https://<your-worker>.workers.dev/mcp
```

The worker is stateless per request, so it scales without session storage;
TLS and rate limiting come from the platform.

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

- `lookup` `{ "mode": "species", "species": "Ogerpon-Wellspring" }`
- `lookup` `{ "mode": "matchup", "attacker": "Ice", "defender": "Garchomp" }` → 4x super effective
- `calculate` `{ "mode": "stats", "species": "Garchomp", "level": 50, "nature": "Jolly", "evs": { "atk": 252, "spe": 252 } }`
- `calculate` `{ "mode": "damage", "attacker": { "species": "Garchomp", "level": 50, "nature": "Jolly", "evs": { "atk": 252, "spe": 252 }, "item": "Choice Band" }, "defender": { "species": "Corviknight", "level": 50, "nature": "Impish", "evs": { "hp": 252, "def": 252 } }, "move": "Dragon Claw" }`
- `team_io` `{ "mode": "legality", "regulation": "m-c", "team": [ { "species": "Garchomp", "item": "Choice Band" } ] }`
- `analyze_team` `{ "mode": "synergy", "team": [ { "species": "Garchomp", "moves": ["Earthquake", "Dragon Claw", "Rock Slide"] } ], "regulation": "m-c" }`
- `analyze_team` `{ "mode": "synergy", "team": [...], "regulation": "m-c", "detail": "evidence" }` → adds the per-type tables; `"debug"` adds the `engine` provenance block
- `team_io` `{ "mode": "parse", "text": "Garchomp @ Choice Scarf | Rough Skin | Jolly | 252 Atk / 252 Spe | Earthquake / Dragon Claw" }`
- `analyze_team` `{ "mode": "diagnose", "team": [ { "species": "Garchomp", "nature": "Jolly", "evs": { "atk": 252, "spe": 252 } } ], "goal": "improve against the current meta" }`
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
