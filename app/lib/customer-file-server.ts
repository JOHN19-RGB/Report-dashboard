import { listCustomerSiteEdits } from "../../db/customer-sites";
import type { SiteEditRecord } from "./customer-file";

export async function loadCustomerSiteEdits(): Promise<SiteEditRecord[]> {
  const rows = await listCustomerSiteEdits();
  return rows.flatMap(row => {
    try {
      return [{ id: row.id, payload: JSON.parse(row.payload), updatedAt: row.updatedAt, updatedBy: row.updatedBy }];
    } catch {
      console.error(`Customer site edit ${row.id} has an unreadable payload`);
      return [];
    }
  });
}
