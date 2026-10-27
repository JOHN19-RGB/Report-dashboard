import { Suspense, type ReactNode } from "react";
import { customerEditsAvailable } from "../../db/customer-sites";
import { CustomerDataProvider, CustomerFileFrame } from "../components/customer-file/shared";
import { loadCustomerSiteEdits } from "../lib/customer-file-server";

// Saved additions/edits come from D1 on every request and are merged over the imported sheet on the client.
// The frame (sidebar, topbar) stays mounted across Customer file pages, so a tab switch only swaps the page body.
// One long-lived Suspense boundary (pages read the query string on the client) keeps the previous page on screen while the next one loads.
export default async function CustomerFileLayout({ children }: { children: ReactNode }) {
  const edits = await loadCustomerSiteEdits();
  return <CustomerDataProvider edits={edits} editsAvailable={customerEditsAvailable()}><CustomerFileFrame><Suspense>{children}</Suspense></CustomerFileFrame></CustomerDataProvider>;
}
