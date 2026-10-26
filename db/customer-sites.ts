import { eq } from "drizzle-orm";
import { getDbOrNull } from ".";
import { customerSiteEdits } from "./schema";

export type StoredSiteEdit = { id: string; payload: string; updatedAt: string; updatedBy: string | null };

// Local dev databases are not migrated automatically, so create the table on first use (no-op once it exists).
const CREATE_TABLE = "CREATE TABLE IF NOT EXISTS `customer_site_edits` (`id` text PRIMARY KEY NOT NULL, `payload` text NOT NULL, `updated_at` text NOT NULL, `updated_by` text)";
let tableReady: Promise<unknown> | null = null;

function database() {
  const db = getDbOrNull();
  if (!db) return null;
  tableReady ??= db.run(CREATE_TABLE).catch(error => { tableReady = null; throw error; });
  return { db, ready: tableReady };
}

export const customerEditsAvailable = () => getDbOrNull() !== null;

export async function listCustomerSiteEdits(): Promise<StoredSiteEdit[]> {
  const connection = database();
  if (!connection) return [];
  try {
    await connection.ready;
    return await connection.db.select().from(customerSiteEdits);
  } catch (error) {
    console.error("Customer site edits read failed", error);
    return [];
  }
}

export async function saveCustomerSiteEdit(edit: StoredSiteEdit) {
  const connection = database();
  if (!connection) throw new Error("D1 database is unavailable");
  await connection.ready;
  await connection.db.insert(customerSiteEdits).values(edit).onConflictDoUpdate({
    target: customerSiteEdits.id,
    set: { payload: edit.payload, updatedAt: edit.updatedAt, updatedBy: edit.updatedBy },
  });
}

export async function deleteCustomerSiteEdit(id: string) {
  const connection = database();
  if (!connection) throw new Error("D1 database is unavailable");
  await connection.ready;
  await connection.db.delete(customerSiteEdits).where(eq(customerSiteEdits.id, id));
}
