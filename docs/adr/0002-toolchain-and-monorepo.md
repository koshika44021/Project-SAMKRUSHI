# ADR-0002: Toolchain and monorepo configuration

- **Status:** Accepted
- **Date:** 2026-11-23
- **Deciders:** Founders (Node.js 24 LTS, Docker-compatible runtime, efficient pnpm) and engineering (versions and settings)

## Context

Master §2.1 asks for one monorepo with a Next.js admin app, one Expo app for Android and iOS, shared TypeScript/Zod packages and Supabase. The phase 0 inspection found a greenfield repository with no stack to preserve. The founders asked for:

- Node.js 24 LTS only;
- an efficient pnpm configuration;
- a Docker-compatible container runtime for local Supabase.

Versions were checked against the npm registry on 2026-11-23.

## Decision

### Runtime and package manager

- **Node.js 24 LTS (24.22.3)**, pinned three ways:
  - `devEngines.runtime` (`onFail: download`): pnpm downloads and runs Node 24 for every script, even when the machine's default `node` is another version;
  - `.nvmrc` for CI and editors;
  - `engines.node: ">=24 <25"` with `engineStrict`.
- EAS builds pin `node: 24.22.3` and `pnpm: 12.21.0` in `apps/mobile/eas.json`.
- **pnpm 12.21.0**, pinned through `packageManager`.
- **Turborepo 2.11** for task orchestration and caching (`build`, `lint`, `typecheck`, `test`, `test:e2e`, `dev`).

### pnpm configuration (`pnpm-workspace.yaml`)

| Setting                                      | Value                                                                                       | Why                                                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalog`                                    | Shared versions: react, react-dom, @types/react, typescript, zod, eslint, vitest, prettier… | One place to bump shared versions. Workspaces reference them with `catalog:`                                                                          |
| `overrides`                                  | `react`, `react-dom` → `catalog:`                                                           | Exactly one React (19.3.0, Expo SDK 58's pin) in the whole graph. Duplicate React breaks React Native at runtime                                      |
| `nodeLinker`                                 | `isolated` (default)                                                                        | Strict symlinked layout, so code can't use undeclared ("phantom") dependencies; content-addressed store saves disk. Expo SDK 54+ and Metro support it |
| `dedupePeerDependents`                       | `true`                                                                                      | One copy of packages whose peers resolve identically                                                                                                  |
| `autoInstallPeers` / `linkWorkspacePackages` | `true`                                                                                      | Fewer manual peer installs; workspace packages always linked                                                                                          |
| `engineStrict`                               | `true`                                                                                      | Refuse installs on unsupported Node                                                                                                                   |
| `minimumReleaseAge`                          | `1440`                                                                                      | Supply-chain delay: no package version younger than 24 hours                                                                                          |
| `trustPolicy`                                | `no-downgrade`                                                                              | Fail if a package's publish provenance weakens                                                                                                        |
| `blockExoticSubdeps` / `strictDepBuilds`     | `true`                                                                                      | Transitive deps come from the registry only; unreviewed install scripts fail the install                                                              |
| `allowBuilds`                                | `esbuild`, `sharp`, `supabase`, `unrs-resolver` allowed; `@parcel/watcher` denied           | Every install script is an explicit, reviewed decision. `@parcel/watcher` ships prebuilt binaries, so its fallback build is unnecessary               |

`catalogMode` stays at its default (manual): `prefer` was tried and rejected because it adds every new dependency to the shared catalog, including single-workspace ones such as `expo-dev-client`.

### Languages, frameworks and tools (verified 2026-11-23)

| Area       | Choice                                                                                                     | Notes                                                                                                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript | `~6.0.3`                                                                                                   | TS 7.0 (npm `latest`) is not yet supported by typescript-eslint (`<6.1.0`) or the Expo SDK 58 template. TS 6 defaults `types` to `[]`, so each tsconfig lists its ambient types                                     |
| Web        | Next.js 16.4.6 (App Router, Turbopack), Tailwind CSS 4                                                     | `transpilePackages: ['@samkrushi/shared']`, typed routes, baseline security headers                                                                                                                                 |
| Mobile     | Expo SDK 58 (React Native 0.88.1, expo-router 58), expo-dev-client                                         | Development builds from day one, not Expo Go. Versions checked with `expo install --check`                                                                                                                          |
| Validation | Zod 4.6                                                                                                    | Single version across web, mobile and Edge Functions                                                                                                                                                                |
| Lint       | ESLint 9.39 (flat config)                                                                                  | ESLint 10 is current, but `eslint-config-next` and `eslint-config-expo` depend on `eslint-plugin-react` / `eslint-plugin-import`, which support only up to ESLint 9. Move to ESLint 10 when both presets support it |
| Format     | Prettier 3 + `prettier-plugin-tailwindcss`                                                                 |                                                                                                                                                                                                                     |
| Tests      | Vitest 5 (shared, web), jest-expo 58 + React Native Testing Library 14 (mobile), Playwright 1.65 (web E2E) | pgTAP via `supabase test db` from Phase 2                                                                                                                                                                           |
| Backend    | Supabase CLI 3.2.0 pinned as a workspace dev dependency                                                    | `pnpm exec supabase …`. Postgres 17 locally                                                                                                                                                                         |

### Shared package strategy

- `packages/shared` is **source-only TypeScript**: `exports` point at `.ts` files, with no build step.
- Relative imports use explicit `.ts` extensions (`allowImportingTsExtensions`), so the same files load unchanged in Next.js/Turbopack, Metro/Hermes, Vitest and the Deno Edge runtime.
- It must stay runtime-agnostic: no DOM, React Native or Node built-ins.
- Formatting avoids `Intl`, so V8, Hermes and Deno produce identical strings.
- Edge Functions will import it through a Deno import map that maps `zod` to `npm:zod` (Phase 3).

### Local Supabase

- Local development uses a **Docker-compatible container runtime**: Docker Desktop (check licensing for the organisation's size), Rancher Desktop or Podman Desktop.
- Without one, `supabase start`, `db reset`, `test db` and `functions serve` do not run. Supabase's container-free mode does not support Windows.
- Setup: `docs/runbooks/local-development.md`.

## Consequences

- Developers need only pnpm installed. pnpm supplies Node 24, and there's one lockfile.
- Bumping React or the Expo SDK is a deliberate catalog change, validated with `expo install --check`.
- On Windows, Android Gradle builds need long-path support (`git config core.longpaths true`, `LongPathsEnabled`). Isolated `node_modules` paths are deep.
- Local Android builds need JDK 17 and the Android SDK. EAS cloud builds don't, and iOS builds always run on EAS, because Xcode is macOS-only.
- Framework telemetry is disabled in CI (`NEXT_TELEMETRY_DISABLED`, `EXPO_NO_TELEMETRY`, `TURBO_TELEMETRY_DISABLED`). The root `.env.example` documents the local opt-out.

## References

- Master spec §2.1, §11 (items 6–7, 11), §13.13
- ADR-0009 (mobile release configuration)
