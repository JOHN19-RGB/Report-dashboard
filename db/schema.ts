import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const clickUpSnapshots = sqliteTable("clickup_snapshots", {
  id: integer("id").primaryKey(),
  payload: text("payload").notNull(),
  syncedAt: text("synced_at").notNull(),
});

// Manual additions and edits to the imported Customer file; `payload` holds the full edited site as JSON.
export const customerSiteEdits = sqliteTable("customer_site_edits", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by"),
});
