import { Suspense } from "react";
import CustomerFileSites from "../../components/customer-file/sites";

export default function CustomerFileSitesPage() {
  // Filters are read from the query string on the client; Suspense keeps static builds valid.
  return <Suspense><CustomerFileSites /></Suspense>;
}
