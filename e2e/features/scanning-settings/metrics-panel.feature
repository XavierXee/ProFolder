@scan-lock
Feature: Metrics panel — real scan-run persistence reaches the UI

  # The backend layers (scan-run
  # repository, scanner integration, HTTP route `GET /api/scan/last`) are already fully tested —
  # this is the missing UI-layer proof that a real, persisted scan run actually reaches the user's
  # screen via the header's Metrics panel (MetricsPanel.tsx).
  #
  # MetricsPanel.test.tsx (frontend unit-test harness) already covers all three of the panel's
  # display branches given `lastScanChanges` directly as a prop ("No scans yet" / "No changes" /
  # "+N changed") — that file is deliberately not duplicated here. What nothing tests yet is the
  # REAL wiring behind that prop: App.tsx's mount-effect calls `api.getLastScan()` (`GET
  # /api/scan/last`), sums `newFiles + modifiedFiles + removedFiles`, and passes the total down.
  #
  # "No scans yet" is not reachable here and isn't attempted: globalSetup.ts always runs one real
  # seed scan before any scenario in this suite starts, so a persisted scan run always already
  # exists (see globalSetup.ts's own doc comment) — that branch stays covered solely by the unit
  # test's `lastScanChanges: null` case.
  #
  # Deliberately reloads the page (see the "reload, not just re-check" step below) rather than
  # asserting on the Metrics panel immediately after the scan completes: ScanFolderPanel.tsx's
  # `onScanComplete` callback (App.tsx's `handleScanComplete`) sets `lastScanChanges` directly from
  # the `POST /api/scan` response body, client-side — that path alone would make this scenario
  # pass even if `GET /api/scan/last` (or its underlying persistence) were completely broken, since
  # it never actually exercises that endpoint. A full reload forces App.tsx's mount effect to
  # re-fetch `lastScanChanges` from the server from scratch, which is the only way to actually
  # prove the persisted-round-trip wiring this task is about — the same "reload, don't just
  # re-open" persistence-proof pattern used by root-path-control.feature and
  # exclusion-toggles.feature's own "Select All and Unselect All" scenario.
  #
  # Exact count, not a regex: a single fixture file ("Metrics E2E New File.wav", created fresh by
  # this scenario's own `Given` step, directly under the scratch music root — never checked into
  # e2e/support/fixtures/music-root, so globalSetup.ts's seed scan never sees it) is the only
  # filesystem change introduced between the moment this scenario acquires the scan lock and the
  # scan it triggers. Every other real-scan scenario in the suite is also `@scan-lock`-tagged and
  # restores its own toggle/exclusion state to its starting baseline before releasing the lock (see
  # scan-settings.feature's and exclusion-toggles.feature's own comments) — this scenario's own
  # fixture file is deliberately NOT deleted afterward, but that's fine: it doesn't affect the +1
  # invariant either way, since a later repeat of this same scenario just re-copies over the same
  # path (see the mtime-bump reasoning below). So by the time this scenario's scan runs, that one
  # fixture file is guaranteed to be the only diff — the resulting
  # `newFiles + modifiedFiles + removedFiles` total is therefore always exactly 1, letting the
  # assertion below be an exact match rather than a `/^\+\d+ changed$/` fallback.
  #
  # That exact-count guarantee also relies on scanner.ts's removedFileIds computation only
  # (re-)marking and counting files that were genuinely newly removed by THIS scan, not every
  # already-soft-removed row left over in loadFingerprints() (which deliberately still includes
  # them, for the reactivation path). Before that fix, an already-removed row from any earlier
  # scan in the DB's history — not just this scenario's own fixture diff — would be re-counted as
  # "removed" on every subsequent scan, inflating this total past 1 regardless of fixture
  # isolation. So the "one fixture file is the only diff" argument above is necessary but was not
  # sufficient on its own; the exact count this scenario reads back is only reliable with that
  # scanner-side fix in place.
  #
  # `@scan-lock`, no `@mode:serial`: this file has only one scenario, so there is nothing within
  # this file for `@mode:serial` to serialize against — but `@scan-lock` is still required, for the
  # same reason it's required on root-path-control.feature: this scenario triggers a real `POST
  # /api/scan` (via the same "Prod Folder" scan settings panel flow every other scan-lock file
  # uses) and reads back a GLOBAL, unscoped `GET /api/scan/last` result — a concurrently-running
  # scan from any other file's scenario (all of which are also `@scan-lock`-tagged) would otherwise
  # be able to interleave its own scan in between this scenario's fixture-file creation and its own
  # scan, or complete its own scan afterward and overwrite the "last scan" row with ITS OWN change
  # count before this scenario reloads and reads it back.

  Scenario: Triggering a real scan and reloading shows its exact change count in the Metrics panel
    Given a new audio file exists in the production folder
    And I open the app
    When I open the production folder scan settings panel
    And I start a scan from the scan settings panel
    Then I should see a scan complete banner
    When I reload the page
    And I open the metrics panel
    Then the metrics panel should show "+1 changed" for the last scan
