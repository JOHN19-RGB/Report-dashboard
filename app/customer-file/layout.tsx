import type { ReactNode } from "react";
import { customerEditsAvailable } from "../../db/customer-sites";
import { CustomerDataProvider } from "../components/customer-file/shared";
import { loadCustomerSiteEdits } from "../lib/customer-file-server";

// Saved additions/edits come from D1 on every request and are merged over the imported sheet on the client.
export default async function CustomerFileLayout({ children }: { children: ReactNode }) {
  const edits = await loadCustomerSiteEdits();
  return <CustomerDataProvider edits={edits} editsAvailable={customerEditsAvailable()}>{children}</CustomerDataProvider>;
}
