import { Suspense } from "react";
import CustomerSiteForm from "../../../components/customer-file/site-form";

export default function EditCustomerSitePage() {
  return <Suspense><CustomerSiteForm mode="edit" /></Suspense>;
}
