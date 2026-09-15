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

The tag-triggered workflow runs the build and `npm publish`. Requires an
`NPM_TOKEN` secret in the repository settings.

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
