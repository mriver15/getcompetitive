# Contributing

Thanks for considering contributing to getcompetitive.

## Development setup

Requires Node.js >= 20.

```bash
git clone https://github.com/mriver15/getcompetitive.git
cd getcompetitive
npm install
npm run build
npm test          # builds + drives every tool over real MCP stdio
```

## Project layout

| Path | Purpose |
| --- | --- |
| `src/` | Server entry, shared dex/calc layer, and tool modules |
| `src/regulations.data.ts` | Generated regulation rosters — **do not edit by hand** |
| `src/regulations.ts` | Regulation metadata (dates, rules, notes) — curated |
| `src/threats.data.ts` | Generated usage-derived threat list — **do not edit by hand** |
| `src/threats.ts` | Types and accessors over the generated threat list |
| `scripts/extract-regs.mjs` | Regenerates `src/regulations.data.ts` from official event pages + Bulbapedia megas |
| `scripts/build-threats.mjs` | Regenerates `src/threats.data.ts` from live usage data |
| `test/smoke.mjs` | End-to-end smoke test (spawns the real server over stdio) |

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm test` | Build + smoke test |
| `npm start` | Run the server on stdio |
| `node scripts/extract-regs.mjs` | Refresh regulation rosters |
| `docker build -t getcompetitive .` | Build the container image (same `Dockerfile` Glama builds) |

## Conventions

- TypeScript, strict mode. Reuse existing patterns; don't introduce a second
  convention beside an existing one.
- Every new tool lives in `src/tools/`, is registered in `src/index.ts`, and is
  exercised in `test/smoke.mjs`.
- Tools return JSON text; user-facing errors are returned as `isError` results
  rather than thrown past the handler (see the `wrap` helper in `src/result.ts`).

### Tool definitions

Tool definitions are the agent's only interface to this server, so they are held
to the [TDQS](https://tdqs.dev) checklist and linted in CI:

- `title` (a human label longer than the tool name) and
  `annotations: READ_ONLY_ANNOTATIONS` (imported from `src/result.ts`) — every
  tool is a read over committed data except `record_set`, which declares
  `WRITE_ANNOTATIONS` and states in its description exactly what it writes and
  where.
- `.describe(...)` on **every** top-level parameter — the deterministic score
  signal only counts schema descriptions, and the description text is not a
  substitute for them.
- A description that states, in this order: what the tool does (verb + resource
  + scope); which sibling tools to use instead and when; parameter semantics the
  schema cannot carry (accepted formats, ranges, defaults, interactions); and
  behaviour the annotations cannot carry (determinism, offline data, error
  results). Aim for 45–90 words, front-loaded, and never restate the schema.
- Never claim behaviour the handler does not implement, and never let a
  description contradict its annotations.

`npx mcp-tdqs@0.2.0 lint --command "node dist/index.js"` must report no warnings
other than `shadow-candidate`, which flags schema cost asymmetry for review —
the CI `tdqs` job enforces exactly that.

## Updating regulation data

Regulation Sets change every ~2–3 months and are cumulative: each new set
contains the previous set's rosters, and `src/regulations.data.ts` stores M-A
in full plus each later set's additions (the full lists are derived at load).
To ingest a new set, e.g. M-D:

1. Add the set to `SETS` in `scripts/extract-regs.mjs` — the `official` URL is
   the Pokémon Champions event page linked from the M-D announcement on
   https://news.pokemon-home.com/en/ ("Eligible Pokémon").
2. Add the `'m-d'` entry to `METADATA` in `src/regulations.ts` (name,
   `start`/`end` dates, `notes`).
3. Run:

```bash
node scripts/extract-regs.mjs     # verifies against official pages, writes rosters
npm test                          # golden pins: sizes, no-drops, Kingambit regression
```

The extractor fails without writing if the new set drops a carried-over species
or disagrees with the official roster.

## Updating the threat list / standard sets

The threat list (`src/threats.data.ts`) is generated and usage-derived — never
hand-edited. `scripts/build-threats.mjs` ranks the legal roster by measured
usage over tournament teams, resolves each species' most-played set, cross-checks
the ordering against a second source, and writes the file. Nothing else belongs
in it: a set the reasoning generated goes to the per-user record via
`record_set`, not to the usage list, where it would be read as measured and
would break every consumer that sorts or ranks by usage. When a new set drops:

```bash
node scripts/build-threats.mjs m-d    # writes src/threats.data.ts
```

Options: `--top=N` for the list length (default 24) and `--min-players=N` for the
tournament size floor (default 25). Check the printed ranking and the
corroboration line before committing — a source changing shape fails loudly
rather than writing a partial list. The types and accessors live in
`src/threats.ts`; `get_set` and `list_threats` are the tools that read them.

Provenance: usage and sets come from Limitless TCG online tournaments (read
through MunchStats' aggregator, which mirrors them and adds regulation tags),
EV spreads from MunchStats' in-game ladder, and the ordering is cross-checked
against Pikalytics. The generator's header records the raw Limitless API to fall
back to if the aggregator changes.

## Releasing

Releases ship to npm via CI on a version tag (see `.github/workflows/release.yml`):

```bash
npm version patch | minor | major
git push --follow-tags
```

The tag-triggered workflow runs the build, the smoke test, and `npm publish`
using [trusted publishing](https://docs.npmjs.com/trusted-publishers) — OIDC
only, no stored credential.

### One-time setup

1. **Publish the first version interactively.** A trusted publisher can only be
   configured for a package that already exists on the registry, and
   `npm stage publish` cannot stage a brand-new package, so the first release
   cannot come from CI:

   ```bash
   npm login          # browser + one-time password
   npm publish
   ```

2. **Register this repository as the package's trusted publisher** (npm ≥ 11.15,
   interactive 2FA required; run from the repo root so the package name and
   `repository.url` come from `package.json`):

   ```bash
   npm trust github --file release.yml --allow-publish
   npm trust list
   ```

   On npmjs.com the same configuration lives at *package → Settings → Trusted
   publishing → GitHub Actions*: organization or user `mriver15`, repository
   `getcompetitive`, workflow filename `release.yml` (filename only, and
   case-sensitive), environment blank, and **Allow `npm publish`** enabled.
   Configurations created after 2026-09-03 default to `npm stage publish` only.

3. **Lock it down once a tagged release has published successfully**: *package →
   Settings → Publishing access → Require two-factor authentication and disallow
   tokens*, then remove any unused tokens from the account.

The workflow filename, the repository, and `repository.url` in `package.json`
must match the configuration exactly — npm does not validate it on save, and a
mismatch only surfaces at publish time as `ENEEDAUTH`. Self-hosted runners are
not supported by trusted publishing.

## Directory listings (Glama)

Two install paths are surfaced by directory sites: the npm package and the
container image built from this repo's `Dockerfile`. Glama only lists a server as
usable once it has built and tested that image, which requires a one-time setup:

1. Claim the listing (GitHub sign-in as a user in `glama.json`):
   https://glama.ai/mcp/servers/mriver15/getcompetitive/admin
2. On the admin Dockerfile page, paste `Dockerfile` so Glama builds and tests it.
3. After README or tool changes, request a re-sync from the same admin page — the
   listing body is a snapshot of this README.

Claims without `glama.json` also work for the repository owner's account, but the
file keeps the listing claimable if the repo ever moves to an organisation.
