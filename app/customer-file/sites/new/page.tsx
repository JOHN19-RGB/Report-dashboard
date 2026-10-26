import { Suspense } from "react";
import CustomerSiteForm from "../../../components/customer-file/site-form";

export default function NewCustomerSitePage() {
  return <Suspense><CustomerSiteForm mode="new" /></Suspense>;
}
