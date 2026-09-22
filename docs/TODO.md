# Music Library Manager — TODO

## 1. Improve testing

- [x] Add a complete e2e test suite using Playwright and cucumber *(the 9-task progress tracker below is fully complete: 103 e2e scenarios, all passing as of this session's final verification)*
- [x] I want to have the cucumber files so the test scenarios are human-readable and easily updated when needed
- [x] scripts to launch e2e tests should contain both headless and headed browser mode
- [x] tester agent should run the e2e test suite (in headless mode, headed mode is for human review only)
- [ ] tester and/or reviewer agent should identify critical failure path and make sure its cover with test *(ongoing — each per-area task keeps finding and closing gaps)*
- [x] Run complete audit on test coverage, ensure all feature are covered, e2e tests run relevant scenarios *(Task 9 below — audit itself is complete; the gaps it found are tracked as the "Task 9 follow-ups" list below, not blockers on this line)*
- [x] Full regression tests path should be implemented (either with unit tests, playwright e2e tests or both) *(closed out by the frontend unit-test initiative — see the tracker below: 181 backend unit tests, 278 frontend component/hook unit tests, 68 e2e scenarios, 459 tests total)*
- [x] if test data files or folder have to be moved around make sure the test suite cleans them out afterward

## 2. Make this app a desktop app

Create a desktop application from this existing application while preserving the existing React frontend, Node.js backend, and SQLite data layer.
Do not rewrite working application logic unnecessarily.
First analyze the current architecture and identify what must change for packaging, filesystem paths, database persistence, development mode, production builds, and OS-specific behavior.
Then implement the migration incrementally and test each layer.
I want this desktop app to be a different build target, so we will still be able to run it as it is, as a simple web app
Prepare a plan to achieve this, let me review your decision, ask question to clarify choices 

- Make the architect run an audit to bundle this app into a desktop app
- Assess the complexity, come up with a good approach to do it (including assessing framework to achieve it, Electron maybe?)
- The goal is the app to continue running fine as a web app as well as a desktop app
- What about the data base? it would be nice to have the same database when running the app in web mode (localhost) than running in desktop mode
- Architect creates a report on all these questions, come up with a plan that could be passed to the rest of the /dev-loop afterwards

### Progress log

**Architect investigation complete (2 passes, planning-only, no code written yet).**

**Pass 1 findings:**
- **Framework: Electron**, chosen over Tauri/NW.js/Neutralino/PWA because "reuse the existing Express+better-sqlite3+AppleScript backend as-is" is a hard requirement — Electron's main process is Node.js, so `createServer(db)` runs unchanged with no sidecar/IPC bridge. Tauri was the closest alternative (smaller install size) but would need the whole backend packaged as a separate sidecar binary — a real option to revisit later if bundle size becomes a concern, not a starting point.
- **Shared database**: WAL mode (already enabled) safely supports multiple local processes on one file, but "same DB" should mean *the same file path, used by whichever mode is active at a time* — not live simultaneous dual-write as a designed feature. A packaged app can't reliably auto-detect a dev checkout's DB location (different process, unpredictable cwd), so this needs to be an explicit user setting.
- **Real bug found** (unrelated in origin, but blocks packaging regardless): `npm start` is currently broken — `tsconfig.json`'s output layout puts the compiled server at `dist/src/api/server.js`, but `package.json`'s `start` script points at the nonexistent `dist/api/server.js`.
- **Also found**: there is no static-file serving in Express today — `npm run build`'s frontend output isn't served by anything, so "production web mode" as a single deployable unit doesn't actually work yet either.
- Full report (framework tradeoffs, macOS Automation/Full-Disk-Access permission implications, original 9-item task list) not reproduced here — see this session's transcript if needed; superseded by the refined list below.

**Decisions made by the user, in discussion (before any code):**
1. Desktop-mode default port: **same as web-mode's (5175)**, deliberately — so running both modes at once fails loudly (port conflict) rather than silently risking concurrent writes to the same DB file.
2. "Same database" UX: **user-set data location** — desktop app defaults to its own DB location; a settings screen lets the user point it at an existing `data/library.db` if they want literal sharing. No auto-detection.
3. Platform scope: **macOS AND Windows AND Linux** (not macOS-only as originally assumed) — requires a cross-platform abstraction for `TrashService`/`FinderService`/`FolderPickerService` (currently 100% AppleScript). Existing plain web-mode server keeps its current AppleScript-only behavior completely unchanged.
4. Distribution scope: **plan to share/distribute to others** — proper code-signing/notarization is in scope from the start, not deferred.

**Pass 2 — refined, granular task breakdown (Architect, incorporating the 4 decisions above):**

Key architecture calls: (a) service selection (AppleScript vs. Electron-native) is decided by *which script launches the process* (dependency injection at server-creation time), never `process.platform`/Electron-detection sniffing inside shared code; (b) Electron production mode loads via `loadURL("http://127.0.0.1:5175")` against its own embedded Express server (not `loadFile` on static HTML), because `frontend/src/api/client.ts` uses relative `/api` fetches that need same-origin serving — this makes static frontend serving (task 2) a hard prerequisite for Electron production loading (task 11); (c) the desktop DB-location override lives in a standalone JSON prefs file (`app.getPath('userData')/desktop-prefs.json`), read *before* `openDb()` — it can't live in the app's own KV settings table (chicken-and-egg, that table is inside the very DB file being relocated); changing it requires an app relaunch, not a hot DB-handle swap; (d) packaging tool: **electron-builder** (mature multi-target config, built-in notarization hook, native `better-sqlite3` rebuild handling); (e) Linux: ship **both AppImage and `.deb`**.

**Prerequisite fixes (independent of desktop work, do first):**
1. ~~Fix the broken `npm start` entrypoint (`dist/api/server.js` → `dist/src/api/server.js`).~~ **Done.** Also fixed a second instance of the same `dist`/`dist/src` mismatch in `build:backend`'s migration-copy step (was blocking `npm start` from booting at all, ENOENT on migrations). Tester+Reviewer confirmed via a real build+boot+curl against a scratch DB, plus a genuine revert-and-confirm proof that the migration-path bug was pre-existing (already in the last commit), not self-introduced. `tsc`/`test:backend` (581/581) clean. Not yet committed.
2. ~~Add static frontend serving (`express.static` + root route serving `dist/frontend/index.html`) to `src/api/server.ts`, guarded so dev mode/existing tests are unaffected. No SPA-fallback routing needed (no client-side router in the app).~~ **Done.** New `tests/staticFrontendServing.test.ts` (7 tests). Registered after all `/api/*` routes — Tester proved via mutation testing (reordering before API routes) that this genuinely prevents request-shadowing, not just incidentally. Confirmed via real `vite.config.ts` build config that no sensitive files (`.env`, sourcemaps) can land in `dist/frontend`. Real build+boot+curl sanity check passed independently by Developer, Tester, and Reviewer. `tsc`/`test:backend` (588/588) clean. Not yet committed.
3. ~~Add a `busy_timeout` pragma to `openDb` (`src/database/db.ts`) so concurrent writers get a bounded retry instead of an immediate `SQLITE_BUSY` — prove via a real concurrent-writer repro, not just a pragma-value assertion.~~ **Done.** New `tests/dbBusyTimeout.test.ts`: a real cross-process (two `tsx` child processes) holder/writer contention test. Interesting finding along the way: `better-sqlite3`'s constructor already defaults to a 5000ms busy timeout independent of any pragma, so the literal "gap" didn't exist in practice — but a from-scratch proof (temporarily forcing `{ timeout: 0 }` on the constructor) confirmed the pragma is a real, authoritative override that always wins regardless of the constructor's value, so it's not redundant/fragile, just currently coincidental with the default. Kept the pragma (self-documenting, consistent with this file's existing `journal_mode`/`foreign_keys` pragma idiom, and a safety net if a future better-sqlite3 version changes its default) and the test (a genuine regression test for "writers wait-then-retry under contention" generally). Test's hold window bumped from 1500ms→2500ms for extra safety margin per Reviewer's suggestion. `tsc`/`test:backend` (589/589) clean. Not yet committed.

**Prerequisite fixes section: closed.** All 3 items done, each independently Tester+Reviewer verified. `docs/REQUIREMENTS.md`/`docs/COVERAGE.md` checked for staleness across the whole section — neither makes any claim about production build/start flow, static serving, or DB concurrency, so nothing needed updating there.

**Trash/Finder/FolderPicker cross-platform abstraction:**
4. Refactor `createServer` (`src/api/server.ts`) to accept injected `finderService`/`trashService`/`folderPickerService`/`fileOpsService` instead of constructing `Mac*Service` classes internally; web-mode's own entrypoint keeps constructing `Mac*Service` classes explicitly, unchanged. Full existing backend suite must stay green unmodified as proof.
5. Add `ElectronFolderPickerService` (`dialog.showOpenDialog`), kept out of the plain web server's module graph (never import `electron` from code reachable by the non-Electron entrypoint).
6. Add `ElectronTrashService` (`shell.trashItem`), reusing the existing `isWithinRoot` containment guard.
7. Add `ElectronFinderService` (`shell.showItemInFolder`), same containment guard.

**Electron scaffolding:**
8. Add Electron tooling (`electron`, `electron-builder`, `wait-on` devDependencies), `electron-builder.yml` skeleton (no signing yet), `tsconfig.electron.json`.
9. Main process entry + dev-mode window loading (`electron/main.ts`), using `wait-on` to wait for the existing `npm run dev` servers, new `dev:electron` script.
10. Native module rebuild wiring for `better-sqlite3` via `@electron/rebuild` — can only be verified by actually launching Electron and opening a real DB, not via vitest.
11. Production build wiring: main process calls the same `createServer`/`openDb` as web mode (with `Electron*Service`s from tasks 5-7), binds to loopback:5175, loads via `loadURL`. Depends on task 2.
12. Window lifecycle: graceful DB/server shutdown on quit, `app.requestSingleInstanceLock()` so a second launch focuses the existing window instead of crashing on the port collision task 1's decision relies on — include a clear user-facing error if the port is held by a stray process (e.g. forgotten web-mode instance), not just an unhandled crash.

**Desktop data-location setting:**
13. Add `src/config/desktopPrefs.ts` (pure `getDbPathOverride`/`setDbPathOverride` functions, explicit prefs-file-path parameter, unit-testable without real Electron).
14. Wire Electron main-process startup to resolve the effective DB path via `desktopPrefs` before calling `openDb()` (default: `app.getPath('userData')/library.db`). Depends on tasks 9/11/13.
15. Add `runtimeMode: "web"|"desktop"` to `GET /api/config`, plus `GET`/`PUT /api/config/db-location` (desktop-only, 400/404 in web mode); `PUT` triggers `app.relaunch()`+`app.exit()` rather than a hot DB-handle swap. Add `DbFilePickerService`/`ElectronDbFilePickerService` (a *file* picker, distinct from the folder picker — desktop-only, no web-mode counterpart).
16. Add a "Data Location" section to `SettingsPanel.tsx`, shown only when `runtimeMode === "desktop"`. Depends on task 15.
17. Add startup validation + recovery for a corrupt/inaccessible overridden DB path: catch `openDb()` throwing, show an error dialog offering "reset to default location" rather than crash-looping. (Does not cover a DB that opens successfully but is semantically wrong, e.g. a `.db` file from an unrelated app — `runMigrations`'s `CREATE TABLE IF NOT EXISTS` pattern would likely silently hybridize it; flagged as a follow-up question, not solved here.)

**Signing & packaging:**
18. macOS Developer ID signing + notarization (`electron-builder.yml`'s `mac` target, `@electron/notarize` `afterSign` hook). **Needs the user to hold/obtain an active Apple Developer Program membership ($99/yr)** — open question, task cannot complete without it.
19. Windows code-signing. **Open question**: purchase a certificate (OV ~$100-300/yr, or EV with hardware-token enrollment) vs. ship unsigned with an accepted SmartScreen warning — needs the user's decision before this task is scoped.
20. Linux packaging: AppImage + `.deb` via `electron-builder.yml`'s `linux` target — no signing needed for either.

**Open questions/risks carried forward, not yet resolved:**
- Windows signing-certificate decision (task 19) — needs user input.
- macOS Developer Program membership assumption (task 18) — needs user confirmation.
- Task 17 doesn't cover a DB that opens successfully but is semantically wrong (wrong schema/unrelated file) — needs a Reviewer call once task 17's diff exists.
- Task 15 (relaunch on DB-location change) and task 17 (corrupt-DB recovery) are written independently and both touch startup-failure handling — Reviewer should confirm the boundary between them is clean once both diffs exist, since neither task should need to solve the other's problem inline.
- Task 20's AppImage+`.deb` formats have no signing/repository-distribution story (e.g. an APT PPA) — explicitly out of scope for this pass.

**Next step**: user will kick off a `/dev-loop` cycle to start implementing from task 1.

## 3. Code quality and accessibility audit

- Perform an complete audit of the code, the goal is to identify if everything as been implemented with respect to good coding practice and maintainability
- Choose which agent is best to perform this task (probably reviewer with its findings being fed to the developer in next loop)
- additionally make sure the UI implement complete accessibility guidelines  

## 4. Improve the REQUIREMENTS.md document and create README.md documentation

- I want this document to be a complete source of truth of want is implemented
- Remove all reference to this document being retro-engineering
- If needed run the reviewer to make sure REQUIREMENTS.md is accurate to what is present in the source code
- If anything is missing or has inaccuracy list these items in report findings and let's discuss it for further /dev-loop 
- Then create a full README.md documentation file explaining all the features and how to run them
- Keep each feature explanation short and concise
- This README.md will be 

## 6.  I now want to share this repository, making it open source, public and usable by others

- Perform audit on the whole codebase for any cyber-security risk
- Potential risk includes but not limited to credential stealing, API keys left in the codebase, dependency vulnerabilities
- Perform all checks such as npm audit and other vulnerability checks
- If issues are found come up with a plan to resolve them
- Then improve the .gitignore file to not include any potentially dangerous or private files
- If things that should not be commited are there, git rm --cache the files and clean the commit history
so the public repository is safe to be shared online
 
