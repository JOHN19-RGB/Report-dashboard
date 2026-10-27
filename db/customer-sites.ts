import { eq } from "drizzle-orm";
import { getDbOrNull } from ".";
import { customerSiteEdits } from "./schema";
import { deleteSupabaseSiteEdit, listSupabaseSiteEdits, saveSupabaseSiteEdit, supabaseConfig, type StoredSiteEdit } from "./supabase-site-edits";

export type { StoredSiteEdit };

// Supabase is the shared store (Vercel and local dev with SUPABASE_* set). Without it, the local
// Cloudflare D1 binding keeps editing usable offline; with neither, the Customer file is read-only.

// Local dev databases are not migrated automatically, so create the table on first use (no-op once it exists).
const CREATE_TABLE = "CREATE TABLE IF NOT EXISTS `customer_site_edits` (`id` text PRIMARY KEY NOT NULL, `payload` text NOT NULL, `updated_at` text NOT NULL, `updated_by` text)";
let tableReady: Promise<unknown> | null = null;

function database() {
  const db = getDbOrNull();
  if (!db) return null;
  tableReady ??= db.run(CREATE_TABLE).catch(error => { tableReady = null; throw error; });
  return { db, ready: tableReady };
}

export const customerEditsBackend = () => supabaseConfig() ? "supabase" : getDbOrNull() ? "d1" : null;
export const customerEditsAvailable = () => customerEditsBackend() !== null;

export async function listCustomerSiteEdits(): Promise<StoredSiteEdit[]> {
  const supabase = supabaseConfig();
  try {
    if (supabase) return await listSupabaseSiteEdits(supabase);
    const connection = database();
    if (!connection) return [];
    await connection.ready;
    return await connection.db.select().from(customerSiteEdits);
  } catch (error) {
    console.error("Customer site edits read failed", error);
    return [];
  }
}

export async function saveCustomerSiteEdit(edit: StoredSiteEdit) {
  const supabase = supabaseConfig();
  if (supabase) return saveSupabaseSiteEdit(supabase, edit);
  const connection = database();
  if (!connection) throw new Error("No customer edit store is configured");
  await connection.ready;
  await connection.db.insert(customerSiteEdits).values(edit).onConflictDoUpdate({
    target: customerSiteEdits.id,
    set: { payload: edit.payload, updatedAt: edit.updatedAt, updatedBy: edit.updatedBy },
  });
}

export async function deleteCustomerSiteEdit(id: string) {
  const supabase = supabaseConfig();
  if (supabase) return deleteSupabaseSiteEdit(supabase, id);
  const connection = database();
  if (!connection) throw new Error("No customer edit store is configured");
  await connection.ready;
  await connection.db.delete(customerSiteEdits).where(eq(customerSiteEdits.id, id));
}
