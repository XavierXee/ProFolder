# Music Library Manager — TODO


1 - Add Gitlab runner - build docker image - run unit tests - run e2e test - show coverage (GitHub Actions plan below)
2 - Make installer that create the data base or make the app do it on first start

---

## Item 1 — CI plan (GitHub Actions)

Nothing implemented yet. The repo is on GitHub (`XavierXee/MusicProdFolderManager`), so this uses GitHub Actions rather than GitLab CI.

### What the repo means for CI

- **The e2e suite needs a macOS runner as things stand.** `e2e/features/file-ops/delete.feature` goes through the real `MacTrashService`, which runs `osascript`, and that doesn't exist on Linux. The unit tests are fine on Linux, because the one real-Trash test already skips itself when not on macOS (`tests/trashService.test.ts`, `describe.skipIf(process.platform !== "darwin")`).
- **Port 5173 is always free on a runner**, so `reuseExistingServer: false` in `playwright.config.ts` won't cause trouble in CI. Keep using `npm run test:e2e` rather than calling Playwright directly, because it sets `E2E_RUN_ID`.
- **Packaging needs macOS.** `electron-builder.yml` builds a `.dmg`, and a `.dmg` can only be built on a Mac.
- **`npm ci` downloads the Electron binary** (around 100MB) even though only the packaging job uses it. The other jobs can skip it with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`.

### How GitLab concepts map to GitHub Actions

| GitLab | GitHub Actions |
|---|---|
| `.gitlab-ci.yml` | `.github/workflows/*.yml` (you can have several) |
| `stages:` | jobs run in parallel by default; order them with `needs:` |
| `image:` / runner `tags:` | `runs-on: ubuntu-latest` / `macos-latest` |
| `cache:` | `actions/setup-node` with `cache: npm` |
| `artifacts:` | `actions/upload-artifact` / `actions/download-artifact` |
| `rules:` / `only: tags` | `on:` triggers plus `if:` on a job |
| CI/CD variables (masked/protected) | repository **Secrets** and **Variables**, optionally scoped to an **Environment** |
| `interruptible:` | `concurrency:` with `cancel-in-progress` |

### Pipeline shape

```
push / PR ─┬─ unit (ubuntu) ─┐
           ├─ e2e (macOS) ───┼─▶ (all green) ─▶ package (macOS, only on v* tags) ─▶ GitHub Release with the .dmg
           └─ build (ubuntu) ┘
```

### Example: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
    tags: ["v*"]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: 24
  ELECTRON_SKIP_BINARY_DOWNLOAD: "1"   # only the package job needs Electron itself

jobs:
  unit:
    name: Unit tests (backend + frontend)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "${{ env.NODE_VERSION }}", cache: npm }
      - run: npm ci
      - name: Typecheck
        run: |
          npx tsc -p tsconfig.json --noEmit
          npx tsc -p tsconfig.frontend.json --noEmit
          npm run typecheck:e2e
      - run: npm test          # both vitest projects (backend + frontend)

  e2e:
    name: E2E tests (Playwright + Cucumber)
    runs-on: macos-latest      # the delete scenario uses the real macOS Trash
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "${{ env.NODE_VERSION }}", cache: npm }
      - run: npm ci
      - run: npx playwright install chromium
      - run: npm run test:e2e
      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14

  build:
    name: Build web app
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "${{ env.NODE_VERSION }}", cache: npm }
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: web-dist
          path: dist/

  package:
    name: Bundle macOS release
    if: startsWith(github.ref, 'refs/tags/v')
    needs: [unit, e2e, build]
    runs-on: macos-latest
    permissions:
      contents: write          # needed to create the GitHub Release
    env:
      ELECTRON_SKIP_BINARY_DOWNLOAD: ""     # this job does need Electron
      CSC_IDENTITY_AUTO_DISCOVERY: "false"  # unsigned build until certificates are added
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "${{ env.NODE_VERSION }}", cache: npm }
      - run: npm ci
      - run: npm run dist:mac
      - uses: actions/upload-artifact@v4
        with:
          name: macos-dmg
          path: release/*.dmg
      - name: Publish GitHub Release
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh release create "${{ github.ref_name }}" release/*.dmg --generate-notes
```

**Making a release:** `git tag v1.1.0 && git push origin v1.1.0`. All four jobs run, and the `.dmg` is attached to a GitHub Release.

### Decisions to make

1. **Where the e2e job runs.** Start with `macos-latest`. If the repo is private, macOS runner minutes are billed at a much higher rate than Linux minutes. The cheaper option is to tag the delete scenario (e.g. `@macos-only`), skip it on Linux, and run e2e on `ubuntu-latest` with `npx playwright install --with-deps chromium`. That needs a small code change.
2. **Mac architecture.** `macos-latest` is Apple Silicon, so `dist:mac` produces an arm64 `.dmg`. For Intel Macs too, either pass `--universal` to electron-builder or use a matrix over `macos-latest` and `macos-13`.
3. **Code signing and notarization.** Without them, macOS Gatekeeper will warn users when they open the app. To sign, add these repository secrets and remove `CSC_IDENTITY_AUTO_DISCOVERY`; electron-builder reads them automatically:
   - `CSC_LINK`: your Developer ID `.p12` certificate, base64-encoded
   - `CSC_KEY_PASSWORD`
   - `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`, for notarization

   Put them in a `release` Environment so only tagged builds can use them, the way protected variables work in GitLab.
4. **Docker image (optional fifth job).** A `docker` job on tags could build the `Dockerfile` and push to GitHub's container registry (`ghcr.io/xavierxee/...`) using `docker/login-action` and `docker/build-push-action`. Only the built-in `GITHUB_TOKEN` (with `packages: write`) is needed.
5. **Branch protection.** In the repo settings, require `unit`, `e2e` and `build` to pass before merging to `main`. This is like GitLab's "Pipelines must succeed" setting.
6. **Coverage (from the original item).** Not in the example yet. Add `@vitest/coverage-v8`, run `npx vitest run --coverage` in the `unit` job, upload `coverage/` as an artifact, and optionally post a summary to the job page (`$GITHUB_STEP_SUMMARY`) or a service such as Codecov.

### Rollout order

1. Add `ci.yml` with only `unit` and `build`, push, and check both are green on Linux.
2. Add `e2e` and watch the first run's time and flakiness (load-dependent flakes are known), and consider `retries: process.env.CI ? 1 : 0` in `playwright.config.ts`.
3. Add `package` and test it with a throwaway tag such as `v0.0.0-ci-test`, then delete that release.
4. Add signing secrets, the Docker job and coverage when you want them.
