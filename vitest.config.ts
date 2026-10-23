import { defineConfig } from "vitest/config";

// Root config: runs the backend and frontend suites as two projects (`--project backend` /
// `--project frontend` selects one).
export default defineConfig({
  test: {
    projects: ["./vitest.backend.config.ts", "./vitest.frontend.config.ts"],
    // Only collected with `--coverage` (`npm run test:coverage`); one combined report for both projects.
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "frontend/src/**/*.{ts,tsx}", "electron/**/*.ts"],
      exclude: ["**/test/**", "**/*.test.{ts,tsx}", "**/*.d.ts", "frontend/src/test-setup.ts"],
      reporter: ["text-summary", "html", "json-summary"],
      reportsDirectory: "coverage",
    },
  },
});
