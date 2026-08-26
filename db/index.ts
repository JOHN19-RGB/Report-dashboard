import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type RuntimeWithDatabase = typeof globalThis & { __WORK_REPORT_DB__?: D1Database };

export function setDatabaseBinding(database: D1Database | undefined) {
  (globalThis as RuntimeWithDatabase).__WORK_REPORT_DB__ = database;
}

export function getDb() {
  const database = (globalThis as RuntimeWithDatabase).__WORK_REPORT_DB__;
  if (!database) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(database, { schema });
}
