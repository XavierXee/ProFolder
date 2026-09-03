import { createBdd } from "playwright-bdd";

const { BeforeAll, AfterAll } = createBdd();

// Minimal suite-level bookkeeping for now. Per-scenario Before/After hooks will be added
// once Task 4+ scenarios need shared setup/teardown against the one running app/DB instance
// — see the scenario-isolation convention documented in common.steps.ts.

BeforeAll(async () => {
  console.log("[e2e] starting suite run");
});

AfterAll(async () => {
  console.log("[e2e] suite run complete");
});
