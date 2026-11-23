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

## 4. Supabase (`supabase/`) — from Phase 2

Install **one** Docker-compatible container runtime:

- **Rancher Desktop** (free; choose the `dockerd (moby)` engine), or
- **Podman Desktop** (free; enable Docker API compatibility), or
- **Docker Desktop** (check the licence terms for organisations above the free-use threshold).

Use the WSL 2 backend on Windows. Then:

```bash
pnpm exec supabase start        # local Postgres 17, Auth, Storage, Edge runtime, Studio
pnpm exec supabase db reset     # re-applies migrations + dev-only seed from an empty DB
pnpm exec supabase test db      # pgTAP RLS / role-matrix tests (Phase 2+)
pnpm exec supabase stop
```

Never point local tooling at production. Seeds in `supabase/seed/` are synthetic and `DEV`-labelled.

## 5. Troubleshooting

| Symptom                                 | Fix                                                                                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERR_PNPM_IGNORED_BUILDS`               | A new dependency wants to run an install script. Review it, then add it to `allowBuilds` in `pnpm-workspace.yaml` (`true`, or `false` to deny) |
| A brand-new package version is refused  | `minimumReleaseAge` (24 h) is working as intended. Wait, or add a reviewed `minimumReleaseAgeExclude` entry                                    |
| Gradle "filename too long" on Windows   | Enable long paths (section 1) or clone closer to the drive root                                                                                |
| Metro can't resolve a workspace package | Don't add `watchFolders` or `nodeModulesPaths`; Expo configures monorepos automatically. Run `pnpm install`, then `pnpm start --clear`         |
| Duplicate React error                   | `pnpm why react`. All copies must be 19.3.0 (catalog + override)                                                                               |
