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
