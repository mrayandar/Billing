// Tests must never touch the main database. They run on a separate Neon branch whose
// connection string is TEST_DATABASE_URL in .env. If it is missing, or points at the same
// database as the app, the database tests refuse to run.
import "dotenv/config";

const hostAndDb = (url?: string) => (url ?? "").replace(/^[a-z]+:\/\/[^@]*@/, "").replace(/-pooler/, "").split("?")[0];

const test = process.env.TEST_DATABASE_URL;
const main = process.env.DATABASE_URL;

if (test && hostAndDb(test) !== hostAndDb(main) && hostAndDb(test) !== hostAndDb(process.env.DIRECT_URL)) {
  process.env.DATABASE_URL = test;
} else {
  process.env.DATABASE_URL = "postgresql://tests-disabled:none@127.0.0.1:1/none";
  process.env.TEST_DB_PROBLEM = test
    ? "TEST_DATABASE_URL points at the same database as the app. Create a separate Neon branch for tests."
    : "TEST_DATABASE_URL is not set in .env. Create a Neon branch for tests and paste its connection string there.";
}
