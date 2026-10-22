import { defineConfig } from "vitest/config";

// Root config: runs the backend and frontend suites as two projects (`--project backend` /
// `--project frontend` selects one).
export default defineConfig({
  test: {
    projects: ["./vitest.backend.config.ts", "./vitest.frontend.config.ts"],
  },
});
