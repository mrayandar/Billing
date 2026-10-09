// Applies the migrations to the test branch (TEST_DATABASE_URL), never to the main database.
// Run after every new migration: npm run db:migrate:test
import "dotenv/config";
import { spawnSync } from "node:child_process";

const test = process.env.TEST_DATABASE_URL;
if (!test) {
  console.error("TEST_DATABASE_URL is not set in .env.");
  process.exit(1);
}
const direct = test.replace("-pooler", "");
if (direct === process.env.DIRECT_URL || test === process.env.DATABASE_URL) {
  console.error("TEST_DATABASE_URL is the same as the main database. Refusing to run.");
  process.exit(1);
}
const r = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DIRECT_URL: direct },
});
process.exit(r.status ?? 1);
