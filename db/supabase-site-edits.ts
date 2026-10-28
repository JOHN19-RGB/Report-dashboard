// Customer file additions/edits stored in Supabase (table `customer_site_edits`).
import { supabaseDelete, supabaseSelect, supabaseUpsert, type SupabaseConfig } from "./supabase";

export { supabaseConfig } from "./supabase";

export type StoredSiteEdit = { id: string; payload: string; updatedAt: string; updatedBy: string | null };

type Row = { id: string; payload: unknown; updated_at: string; updated_by: string | null };

const TABLE = "customer_site_edits";

export async function listSupabaseSiteEdits(config: SupabaseConfig): Promise<StoredSiteEdit[]> {
  const rows = await supabaseSelect<Row>(config, `${TABLE}?select=id,payload,updated_at,updated_by&order=updated_at.asc`);
  return rows.map(row => ({
    id: row.id,
    payload: typeof row.payload === "string" ? row.payload : JSON.stringify(row.payload),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }));
}

export async function saveSupabaseSiteEdit(config: SupabaseConfig, edit: StoredSiteEdit) {
  await supabaseUpsert(config, TABLE, { id: edit.id, payload: JSON.parse(edit.payload), updated_at: edit.updatedAt, updated_by: edit.updatedBy }, "id");
}

export async function deleteSupabaseSiteEdit(config: SupabaseConfig, id: string) {
  await supabaseDelete(config, `${TABLE}?id=eq.${encodeURIComponent(id)}`);
}
