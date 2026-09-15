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
| `scripts/extract-regs.mjs` | Regenerates `src/regulations.data.ts` from Bulbapedia |
| `scripts/threat-scaffold.mjs` | Prints the Mega roster + emits a stub threat list for a regulation |
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
  `annotations: READ_ONLY_ANNOTATIONS` (imported from `src/result.ts`).
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

Regulation Sets change every ~2–3 months. To refresh:

```bash
node scripts/extract-regs.mjs     # regenerates the eligible/mega rosters
```

then edit the per-set metadata (name, `start`/`end` dates, `notes`) in
`src/regulations.ts`.

## Updating the threat list / standard sets

The curated threat list (`src/threats.ts`) is editorial, keyed by regulation.
When a new set drops:

```bash
node scripts/threat-scaffold.mjs m-d   # prints the Mega roster + a stub
```

then paste the stub into `src/threats.ts`, author threats (verify each set's
moves/abilities against the dex — `npm test` plus the smoke tool coverage), and
update `src/index.ts` if new tools are involved. Keep `sourceAsOf` current.

## Releasing

Releases ship to npm via CI on a version tag (see `.github/workflows/release.yml`):

```bash
npm version patch | minor | major
git push --follow-tags
```

The tag-triggered workflow runs the build, the smoke test, and `npm publish`.

### Publishing credentials

npm removed legacy and classic tokens in November 2025, so "automation token"
instructions from before then no longer apply: only **granular access tokens**
remain, and their **Bypass two-factor authentication** checkbox is off by
default. A token left at that default fails in CI with `EOTP`.

Preferred — trusted publishing, no secret at all:

```bash
npm trust github --file release.yml --allow-publish   # needs npm >= 11.15.0
```

`--allow-publish` matters: trust configurations created after 2026-09-03 allow
`npm stage publish` only unless direct publishing is opted into. The same
configuration can be made on the package's settings page at npmjs.com.

Fallback — an `NPM_TOKEN` secret holding a granular token with **Read and write
(publish and stage)** and **Bypass two-factor authentication** enabled. Treat it
as transitional: npm is removing direct publish from bypass-2FA tokens in
January 2027.

Two constraints that bite on a first release:

- A trusted publisher cannot be configured until the package exists on the
  registry, and `npm stage publish` cannot stage a brand-new package — the first
  version must be published interactively (`npm login` then `npm publish` from
  the tagged commit).
- `npm trust` requires two-factor authentication on the account and cannot be
  run with a bypass-2FA token, only from an interactive session.

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
