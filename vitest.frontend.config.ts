import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    name: "frontend",
    environment: "jsdom",
    include: ["frontend/src/**/test/*.test.{ts,tsx}"],
    setupFiles: ["./frontend/src/test-setup.ts"],
    env: { TZ: "UTC" },
  },
});
