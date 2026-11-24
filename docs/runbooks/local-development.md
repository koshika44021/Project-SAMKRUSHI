# Runbook: local development setup

Applies to Windows 11 (the primary dev machine), macOS and Linux. Toolchain decisions: ADR-0002.

## 1. Required for all work

| Tool    | Version    | Install                                                                                                                                                                                                                                                         |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git     | any recent | Enable long paths on Windows: `git config --global core.longpaths true`, and set `LongPathsEnabled=1` (admin PowerShell: `New-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force`) |
| pnpm    | 12.21.0    | `npm i -g pnpm@12.21.0`, or Corepack                                                                                                                                                                                                                            |
| Node.js | **24 LTS** | Nothing to install: pnpm downloads Node 24.22.3 for this repo automatically (`devEngines.runtime`). Check with `pnpm exec node -v`                                                                                                                              |

```bash
pnpm install          # installs everything; fails if an unreviewed install script appears
pnpm check            # lint + typecheck + unit tests for every workspace (Turborepo-cached)
pnpm build
```

Telemetry opt-out (optional): set `NEXT_TELEMETRY_DISABLED=1`, `EXPO_NO_TELEMETRY=1` and `TURBO_TELEMETRY_DISABLED=1` in your shell profile.

## 2. Admin web (`apps/admin-web`)

```bash
cp apps/admin-web/.env.example apps/admin-web/.env.local
pnpm --filter @samkrushi/admin-web dev                 # http://localhost:3000
pnpm --filter @samkrushi/admin-web exec playwright install chromium   # first time only
pnpm turbo run test:e2e --filter=@samkrushi/admin-web  # builds first, then runs Playwright
```

### Signing in to the local admin dashboard

1. Start Supabase (section 4), then write `apps/admin-web/.env.local` using the keys from `pnpm exec supabase status -o env`:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY>
   SUPABASE_SECRET_KEY=<SECRET_KEY>          # server-only
   ```

2. Create the first super admin: `pnpm bootstrap:super-admin` with `BOOTSTRAP_ADMIN_*` set (see `docs/runbooks/super-admin-bootstrap.md`). Then sign in at http://localhost:3000/login.
3. The dev seed provides a synthetic `DEV` catalog. Farmers and supply are entered through the UI.

### Edge Functions and integration tests

```bash
cp supabase/functions/.env.example supabase/functions/.env
pnpm exec supabase functions serve --env-file supabase/functions/.env   # keep running
pnpm test:integration                                                    # RPC authz + catalog API
pnpm turbo run test:e2e --filter=@samkrushi/admin-web                    # Playwright (production build)
```

The E2E/integration setups create and reuse `*@e2e.samkrushi.invalid` and `*@it.samkrushi.invalid` accounts on the LOCAL stack only.

## 3. Mobile (`apps/mobile`) — Android first

The app uses **development builds** (expo-dev-client), not Expo Go.

**Option A: EAS cloud build** (no Android SDK needed; needs an Expo account)

```bash
cd apps/mobile
pnpm dlx eas-cli@latest login
pnpm dlx eas-cli@latest init          # links the EAS project; set EAS_PROJECT_ID afterwards
pnpm build:android:dev                # installable dev-client APK
pnpm start                            # Metro for the dev client
```

**Option B: local Android build**

1. Install **JDK 17** (React Native 0.88 and EAS use 17; JDK 25 is not supported). Set `JAVA_HOME` to it.
2. Install Android Studio with SDK Platform 36, Build-Tools 36 and an emulator. Set `ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk` and add `platform-tools` to `PATH`.
3. `pnpm --filter @samkrushi/mobile android`. This runs `expo run:android`, which prebuilds `android/` (git-ignored) and installs on the emulator.

iOS builds need macOS and Xcode, so on Windows use EAS (`pnpm build:ios:dev` produces a simulator build). iOS is maintained but released after Android (ADR-0009).

Config check without a device: `APP_VARIANT=preview pnpm --filter @samkrushi/mobile exec expo config --type public`.

## 4. Supabase (`supabase/`)

Install **one** Docker-compatible container runtime: Docker Desktop (check the licence terms for organisations above the free-use threshold), Rancher Desktop (`dockerd (moby)` engine) or Podman Desktop (Docker API compatibility on). Use the WSL 2 backend on Windows, and make sure the engine is running before you start.

```bash
pnpm db:start          # first run pulls images (several minutes)
pnpm db:reset          # rebuild from an empty database: all migrations (+ dev-only seed)
pnpm db:test           # pgTAP: RLS, role matrix incl. viewer, constraints, audit, availability
pnpm db:lint
pnpm db:types          # regenerate packages/shared/src/database.types.ts after schema changes
pnpm exec supabase stop
```

Faster minimal stack (what CI uses):
`pnpm exec supabase start -x realtime,storage-api,imgproxy,mailpit,studio,edge-runtime,logflare,vector,supavisor`.
Keep `kong`: the PostgREST health check goes through it.

Local URLs: API `http://127.0.0.1:54321`, DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, Studio `http://127.0.0.1:54323`. The keys `supabase start` prints are local-only demo keys. Never point local tooling at production. Seeds in `supabase/seed/` are synthetic and `DEV`-labelled.

Schema workflow: `supabase/README.md`. Security model: ADR-0011.

## 5. Troubleshooting

| Symptom                                 | Fix                                                                                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERR_PNPM_IGNORED_BUILDS`               | A new dependency wants to run an install script. Review it, then add it to `allowBuilds` in `pnpm-workspace.yaml` (`true`, or `false` to deny) |
| A brand-new package version is refused  | `minimumReleaseAge` (24 h) is working as intended. Wait, or add a reviewed `minimumReleaseAgeExclude` entry                                    |
| Gradle "filename too long" on Windows   | Enable long paths (section 1) or clone closer to the drive root                                                                                |
| Metro can't resolve a workspace package | Don't add `watchFolders` or `nodeModulesPaths`; Expo configures monorepos automatically. Run `pnpm install`, then `pnpm start --clear`         |
| Duplicate React error                   | `pnpm why react`. All copies must be 19.3.0 (catalog + override)                                                                               |
