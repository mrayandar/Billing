import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Three kinds of run:
//   npm test           fast tests (no database) + the database tests of the current step
//   npm run test:all   every test, including all database tests (run before merging)
//   test files named *.db.test.ts need the Neon test branch; all others are pure and instant.
const current: { globs: string[] } = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "vitest.current-step.json"), "utf8"));

const shared = {
  setupFiles: ["./vitest.setup.ts"],
  testTimeout: 60_000,
  hookTimeout: 60_000,
  environment: "node" as const,
};

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    projects: [
      { extends: true, test: { ...shared, name: "fast", include: ["src/**/*.test.ts"], exclude: ["**/*.db.test.ts", "**/node_modules/**"] } },
      { extends: true, test: { ...shared, name: "current", include: current.globs } },
      { extends: true, test: { ...shared, name: "db", include: ["src/**/*.db.test.ts"] } },
    ],
  },
});
