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
