import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const clickUpSnapshots = sqliteTable("clickup_snapshots", {
  id: integer("id").primaryKey(),
  payload: text("payload").notNull(),
  syncedAt: text("synced_at").notNull(),
});
