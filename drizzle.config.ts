// Kept for when the schema outgrows hand-written SQL. Phase 1 uses the plain
// migration file so there is no build step between you and the database.
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
  driver: "d1-http",
} satisfies Config;
