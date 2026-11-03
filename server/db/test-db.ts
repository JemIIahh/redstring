import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { boardMigrations } from "./migrations.js";
import * as schema from "./schema.js";

/** In-memory Postgres with this app's migrations applied, for store tests. */
export async function createTestDb() {
  const client = new PGlite();
  for (const migration of boardMigrations) {
    await client.exec(migration.sql);
  }
  const testDb = drizzle(client, { schema });
  return { client, testDb };
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;
