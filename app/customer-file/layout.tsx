import { cookies } from "next/headers";
import { Suspense, type ReactNode } from "react";
import { customerEditsAvailable } from "../../db/customer-sites";
import { CustomerDataProvider, CustomerFileFrame } from "../components/customer-file/shared";
import { EDIT_COOKIE, editAccess } from "../lib/customer-edit-access";
import { loadCustomerSiteEdits } from "../lib/customer-file-server";

// Saved additions/edits come from Supabase (or local D1) on every request and are merged over the imported sheet on the client.
// The frame (sidebar, topbar) stays mounted across Customer file pages, so a tab switch only swaps the page body.
// One long-lived Suspense boundary (pages read the query string on the client) keeps the previous page on screen while the next one loads.
export default async function CustomerFileLayout({ children }: { children: ReactNode }) {
  const [edits, access] = await Promise.all([loadCustomerSiteEdits(), editAccess((await cookies()).get(EDIT_COOKIE)?.value)]);
  return <CustomerDataProvider edits={edits} editsAvailable={customerEditsAvailable() && access !== "disabled"} editAccess={customerEditsAvailable() ? access : "open"}><CustomerFileFrame><Suspense>{children}</Suspense></CustomerFileFrame></CustomerDataProvider>;
}
