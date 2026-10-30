export type CustomerStatus = "Active" | "New" | "Inactive" | "Cancel" | "B2B" | "Internal" | "Headless" | "Sub" | "Unknown";
export type GaStatus = "new" | "correct" | "change" | "not-launched";

export type CustomerSite = {
  id: string;
  taxId: string | null;
  domain: string | null;
  company: string;
  status: CustomerStatus;
  siteVersion: string | null;
  package: string | null;
  segment: string | null;
  projectKind: string | null;
  ownerType: string | null;
  businessModel: string | null;
  type: string | null;
  group: string | null;
  industry: string | null;
  activity: number | null;
  specialist: string | null;
  specialistHistory: string[];
  invoiceSent: boolean | null;
  closeReason: string | null;
  plan: string | null;
  dates: { created: string | null; testSite: string | null; launch: string | null; closed: string | null };
  ga: { code: string | null; status: GaStatus | null; newCode: string | null };
};

export type CustomerFileData = { source: string; importedAt: string; sites: CustomerSite[] };

export type CustomerCompany = {
  key: string;
  taxId: string | null;
  name: string;
  aliases: string[];
  ownerType: string | null;
  sites: CustomerSite[];
  activeSites: number;
  specialists: string[];
};

export type CustomerFilters = {
  search: string;
  status: string;
  specialist: string;
  package: string;
  segment: string;
  group: string;
  siteVersion: string;
};

export type CustomerSortKey = "domain" | "status" | "specialist" | "activity" | "launch";
export type CustomerSort = { key: CustomerSortKey; direction: "asc" | "desc" } | null;

export const EMPTY_CUSTOMER_FILTERS: CustomerFilters = { search: "", status: "all", specialist: "all", package: "all", segment: "all", group: "all", siteVersion: "all" };
export const UNASSIGNED = "__unassigned";

export const CUSTOMER_STATUSES: Array<{ key: CustomerStatus; label: string; description: string; color: string }> = [
  { key: "Active", label: "Active", description: "Идэвхтэй ажиллаж буй", color: "#1fa978" },
  { key: "New", label: "New", description: "Шинээр нэгдсэн", color: "#2676e8" },
  { key: "Sub", label: "Sub", description: "Дэд сайт", color: "#5aa9e6" },
  { key: "B2B", label: "B2B", description: "B2B харилцагч", color: "#7c5cff" },
  { key: "Headless", label: "Headless", description: "Headless шийдэл", color: "#14a3b8" },
  { key: "Internal", label: "Internal", description: "Дотоод төсөл", color: "#64748b" },
  { key: "Inactive", label: "Inactive", description: "Түр идэвхгүй", color: "#f0a820" },
  { key: "Cancel", label: "Cancel", description: "Гэрээ цуцалсан", color: "#ff6b4a" },
  { key: "Unknown", label: "Тодорхойгүй", description: "Төлөв бүртгээгүй", color: "#b4bac6" },
];

export const GA_STATUSES: Record<GaStatus, { label: string; tone: string }> = {
  correct: { label: "Зөв холбогдсон", tone: "good" },
  new: { label: "Шинээр нэмсэн", tone: "info" },
  change: { label: "Солих шаардлагатай", tone: "warn" },
  "not-launched": { label: "Нээгдээгүй", tone: "muted" },
};

export const ACTIVITY_MAX = 4;
export const SEGMENTS = ["Top", "Medium", "Small"];
export const PACKAGES = ["Enterprise", "Turbo"];
// Choices offered in the site form. Older rows may hold other values (Both, UR, Intro Web); those are kept as they are.
export const SITE_VERSIONS = ["Business Cody", "Backoffice", "BC2"];
export const BUSINESS_MODELS = ["B2C", "B2B"];

export function customerStatus(key: string) {
  return CUSTOMER_STATUSES.find(status => status.key === key) ?? CUSTOMER_STATUSES.at(-1)!;
}

export const companyKey = (site: CustomerSite) => site.taxId ? `tax:${site.taxId}` : `name:${site.company || site.domain || site.id}`;
export const siteLabel = (site: CustomerSite) => site.domain || site.company || "Нэргүй сайт";

const collator = new Intl.Collator("mn-MN", { sensitivity: "base", numeric: true });

export function distinctValues(sites: CustomerSite[], read: (site: CustomerSite) => string | null) {
  return [...new Set(sites.map(read).filter((value): value is string => Boolean(value)))].sort(collator.compare);
}

export function countBy<T extends string>(sites: CustomerSite[], read: (site: CustomerSite) => T | null) {
  const counts = new Map<T, number>();
  for (const site of sites) {
    const value = read(site);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function matchesSearch(site: CustomerSite, query: string) {
  if (!query) return true;
  const haystack = [site.domain, site.company, site.taxId, site.ga.code, site.ga.newCode, site.industry, site.group, ...site.specialistHistory]
    .filter(Boolean).join(" ").toLocaleLowerCase("mn-MN");
  return query.toLocaleLowerCase("mn-MN").split(/\s+/).filter(Boolean).every(part => haystack.includes(part));
}

export function filterCustomerSites<T extends CustomerSite>(sites: T[], filters: CustomerFilters): T[] {
  const query = filters.search.trim();
  return sites.filter(site =>
    matchesSearch(site, query)
    && (filters.status === "all" || site.status === filters.status)
    && (filters.specialist === "all" || (filters.specialist === UNASSIGNED ? !site.specialist : site.specialist === filters.specialist))
    && (filters.package === "all" || site.package === filters.package)
    && (filters.segment === "all" || site.segment === filters.segment)
    && (filters.group === "all" || site.group === filters.group)
    && (filters.siteVersion === "all" || site.siteVersion === filters.siteVersion));
}

export function hasCustomerFilters(filters: CustomerFilters) {
  return (Object.keys(EMPTY_CUSTOMER_FILTERS) as Array<keyof CustomerFilters>).some(key => filters[key] !== EMPTY_CUSTOMER_FILTERS[key]);
}

const STATUS_ORDER = new Map(CUSTOMER_STATUSES.map((status, index) => [status.key, index]));

export function sortCustomerSites<T extends CustomerSite>(sites: T[], sort: CustomerSort): T[] {
  if (!sort) return sites;
  const sign = sort.direction === "asc" ? 1 : -1;
  const read: Record<CustomerSortKey, (site: CustomerSite) => string | number | null> = {
    domain: site => siteLabel(site),
    status: site => STATUS_ORDER.get(site.status) ?? 99,
    specialist: site => site.specialist,
    activity: site => site.activity,
    launch: site => site.dates.launch,
  };
  return [...sites].sort((left, right) => {
    const a = read[sort.key](left), b = read[sort.key](right);
    // Empty values always sink to the bottom, whichever direction is active.
    if (a === null || a === "") return b === null || b === "" ? 0 : 1;
    if (b === null || b === "") return -1;
    return sign * (typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b)));
  });
}

export function nextCustomerSort(current: CustomerSort, key: CustomerSortKey): CustomerSort {
  if (current?.key !== key) return { key, direction: key === "activity" || key === "launch" ? "desc" : "asc" };
  const first = key === "activity" || key === "launch" ? "desc" : "asc";
  return current.direction === first ? { key, direction: first === "asc" ? "desc" : "asc" } : null;
}

export function groupCustomerCompanies(sites: CustomerSite[]): CustomerCompany[] {
  const companies = new Map<string, CustomerCompany>();
  for (const site of sites) {
    const key = companyKey(site);
    const company = companies.get(key) ?? { key, taxId: site.taxId, name: site.company || siteLabel(site), aliases: [], ownerType: site.ownerType, sites: [], activeSites: 0, specialists: [] };
    company.sites.push(site);
    if (site.status === "Active") company.activeSites++;
    if (site.company && site.company !== company.name && !company.aliases.includes(site.company)) company.aliases.push(site.company);
    if (site.specialist && !company.specialists.includes(site.specialist)) company.specialists.push(site.specialist);
    companies.set(key, company);
  }
  return [...companies.values()].sort((a, b) => b.sites.length - a.sites.length || b.activeSites - a.activeSites || collator.compare(a.name, b.name));
}

export function specialistPortfolios(sites: CustomerSite[]) {
  const portfolios = new Map<string, { name: string | null; sites: number; active: number; activityTotal: number; activityCount: number; invoiced: number }>();
  for (const site of sites) {
    const key = site.specialist ?? UNASSIGNED;
    const portfolio = portfolios.get(key) ?? { name: site.specialist, sites: 0, active: 0, activityTotal: 0, activityCount: 0, invoiced: 0 };
    portfolio.sites++;
    if (site.status === "Active") portfolio.active++;
    if (site.invoiceSent) portfolio.invoiced++;
    if (site.activity !== null) { portfolio.activityTotal += site.activity; portfolio.activityCount++; }
    portfolios.set(key, portfolio);
  }
  return [...portfolios.entries()]
    .map(([key, portfolio]) => ({ key, ...portfolio, averageActivity: portfolio.activityCount ? portfolio.activityTotal / portfolio.activityCount : null }))
    .sort((a, b) => Number(a.key === UNASSIGNED) - Number(b.key === UNASSIGNED) || b.sites - a.sites);
}

export function relatedCustomerSites(site: CustomerSite, sites: CustomerSite[]) {
  const key = companyKey(site);
  return {
    sameCompany: sites.filter(other => other.id !== site.id && companyKey(other) === key),
    sameSpecialist: site.specialist ? sites.filter(other => other.id !== site.id && other.specialist === site.specialist).length : 0,
    sameGroup: site.group ? sites.filter(other => other.id !== site.id && other.group === site.group).length : 0,
  };
}

const CSV_COLUMNS: Array<[string, (site: CustomerSite) => string | number | boolean | null]> = [
  ["Domain", site => site.domain], ["Company", site => site.company], ["Tax ID", site => site.taxId], ["Status", site => site.status],
  ["Site version", site => site.siteVersion], ["Package", site => site.package], ["Segment", site => site.segment], ["Plan", site => site.plan],
  ["Business model", site => site.businessModel], ["Type", site => site.type], ["Group", site => site.group], ["Industry", site => site.industry],
  ["Activity", site => site.activity], ["Account specialist", site => site.specialist], ["Specialist history", site => site.specialistHistory.join(" → ")],
  ["Invoice sent", site => site.invoiceSent], ["Created", site => site.dates.created], ["Test site", site => site.dates.testSite],
  ["Launch", site => site.dates.launch], ["Closed", site => site.dates.closed], ["Close reason", site => site.closeReason],
  ["GA code", site => site.ga.code], ["GA status", site => site.ga.status], ["GA new code", site => site.ga.newCode],
];

export function customerSitesCsv(sites: CustomerSite[]) {
  const escape = (value: string | number | boolean | null) => {
    const text = value === null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [CSV_COLUMNS.map(([label]) => label), ...sites.map(site => CSV_COLUMNS.map(([, read]) => read(site)))]
    .map(row => row.map(escape).join(",")).join("\n");
}

export type PaymentProvider = { key: string; label: string };
export type PaymentCategory = { key: string; label: string; kind: "payment" | "erp"; providers: PaymentProvider[] };
export type PaymentRecord = {
  id: string;
  domain: string;
  company: string;
  status: CustomerStatus | null;
  methods: string[];
  storeCredit: boolean | null;
  wallet: boolean | null;
  giftCard: boolean | null;
};
export type CustomerPaymentData = { source: string; importedAt: string; categories: PaymentCategory[]; records: PaymentRecord[] };
export type LinkedPayment = PaymentRecord & { site: CustomerSite | null };

const domainKey = (domain: string | null) => (domain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");

// The payment sheet sometimes lists the production domain while Site info keeps the *.cody.mn preview domain.
export function linkPaymentRecords(sites: CustomerSite[], records: PaymentRecord[]): LinkedPayment[] {
  const exact = new Map(sites.filter(site => site.domain).map(site => [domainKey(site.domain), site]));
  const preview = new Map(sites.filter(site => site.domain).map(site => [domainKey(site.domain).replace(/\.cody\.mn$/, ".mn"), site]));
  return records.map(record => {
    const key = domainKey(record.domain);
    return { ...record, site: exact.get(key) ?? preview.get(key) ?? null };
  });
}

export function paymentsBySite(payments: LinkedPayment[]) {
  return new Map(payments.filter(payment => payment.site).map(payment => [payment.site!.id, payment]));
}

export const paymentStatus = (payment: LinkedPayment) => payment.site?.status ?? payment.status ?? "Unknown";
export const paymentLabel = (payment: LinkedPayment) => payment.site ? siteLabel(payment.site) : payment.domain;
export const categoryOf = (methodKey: string) => methodKey.slice(0, methodKey.indexOf(":"));

export function paymentCategoryStats(categories: PaymentCategory[], payments: LinkedPayment[]) {
  return categories.map(category => {
    const providers = category.providers
      .map(provider => ({ ...provider, sites: payments.filter(payment => payment.methods.includes(provider.key)).length }))
      .sort((a, b) => b.sites - a.sites || collator.compare(a.label, b.label));
    const sites = payments.filter(payment => payment.methods.some(method => categoryOf(method) === category.key)).length;
    return { ...category, providers, sites, top: providers[0]?.sites ? providers[0] : null };
  });
}

export function groupPaymentMethods(categories: PaymentCategory[], methods: string[]) {
  return categories
    .map(category => ({ ...category, providers: category.providers.filter(provider => methods.includes(provider.key)) }))
    .filter(category => category.providers.length);
}

export const paymentMethodCount = (categories: PaymentCategory[], payment: PaymentRecord) => {
  const paymentKinds = new Set(categories.filter(category => category.kind === "payment").map(category => category.key));
  return payment.methods.filter(method => paymentKinds.has(categoryOf(method))).length;
};

const FILTER_KEYS = Object.keys(EMPTY_CUSTOMER_FILTERS) as Array<keyof CustomerFilters>;

export function customerFiltersQuery(patch: Partial<CustomerFilters>) {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = patch[key];
    if (value && value !== EMPTY_CUSTOMER_FILTERS[key]) params.set(key, value);
  }
  return params.toString();
}

export function parseCustomerFilters(params: Record<string, string | string[] | undefined>): CustomerFilters {
  const filters = { ...EMPTY_CUSTOMER_FILTERS };
  for (const key of FILTER_KEYS) {
    const value = params[key];
    const text = Array.isArray(value) ? value[0] : value;
    // Search keeps its spaces: the box is controlled by this value, so trimming would eat the space someone just typed.
    if (text?.trim()) filters[key] = (key === "search" ? text : text.trim()).slice(0, 120);
  }
  return filters;
}

// ---- Manual additions and edits -------------------------------------------------------------

export type PaymentEdit = { methods: string[]; storeCredit: boolean | null; giftCard: boolean | null; wallet: boolean | null };
export type SiteEditPayload = {
  isNew: boolean;
  site: Pick<CustomerSite, "domain" | "company" | "taxId" | "status" | "siteVersion" | "package" | "segment" | "ownerType" | "businessModel" | "type" | "group" | "industry" | "activity" | "specialist" | "invoiceSent" | "closeReason" | "ga">;
  payment: PaymentEdit | null;
};
export type SiteEditRecord = { id: string; payload: SiteEditPayload; updatedAt: string; updatedBy: string | null };
export type EditedSite = CustomerSite & { edit?: { isNew: boolean; updatedAt: string; updatedBy: string | null } };
export type SiteFormErrors = Partial<Record<"domain" | "company" | "taxId" | "status" | "activity" | "specialist" | "gaCode" | "gaNewCode" | "payment" | "form", string>>;

export const EDITABLE_STATUSES: CustomerStatus[] = ["Active", "New", "Inactive", "Sub", "Cancel", "B2B", "Internal", "Headless"];
const GA_STATUS_KEYS = Object.keys(GA_STATUSES) as GaStatus[];

// Mirrors scripts/import-customer-file.mjs so a manually added domain lines up with a later import of the same site.
export function customerSiteId(domain: string | null, company: string) {
  const key = (domain || company).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[^\p{L}\p{N}.-]+/gu, "-").replace(/^-|-$/g, "");
  return domain ? `d:${key}` : `c:${key}`;
}

export function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

const text = (value: unknown, max: number) => typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ").slice(0, max) : null;
const oneOf = <T extends string>(value: unknown, options: readonly T[]) => options.includes(value as T) ? value as T : null;
const flag = (value: unknown) => typeof value === "boolean" ? value : null;

export function parseSiteEditInput(input: unknown, providerKeys: Set<string>): { ok: true; value: Omit<SiteEditPayload, "isNew"> } | { ok: false; errors: SiteFormErrors } {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const site = (body.site && typeof body.site === "object" ? body.site : {}) as Record<string, unknown>;
  const ga = (site.ga && typeof site.ga === "object" ? site.ga : {}) as Record<string, unknown>;
  const errors: SiteFormErrors = {};

  const domain = typeof site.domain === "string" && site.domain.trim() ? normalizeDomain(site.domain) : null;
  if (!domain) errors.domain = "Домэйн оруулна уу";
  else if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) || domain.length > 120) errors.domain = "Домэйн буруу байна (жишээ: shop.mn)";
  const company = text(site.company, 160);
  if (!company) errors.company = "Гэрээний компанийн нэр оруулна уу";
  const taxId = text(site.taxId, 20);
  if (taxId && !/^[\p{L}\p{N}]+$/u.test(taxId)) errors.taxId = "ТТД зөвхөн үсэг, тоо агуулна";
  const status = oneOf(site.status, EDITABLE_STATUSES);
  if (!status) errors.status = "Төлөв сонгоно уу";
  const activity = site.activity === null || site.activity === undefined || site.activity === "" ? null : Number(site.activity);
  if (activity !== null && !(Number.isInteger(activity) && activity >= 0 && activity <= ACTIVITY_MAX)) errors.activity = `Идэвх 0–${ACTIVITY_MAX} байна`;
  const specialist = text(site.specialist, 60);
  if (specialist && !/^[\p{L}][\p{L}.\s-]*$/u.test(specialist)) errors.specialist = "Нэр зөвхөн үсэг агуулна";
  const gaCode = text(ga.code, 20)?.toUpperCase() ?? null;
  if (gaCode && !/^G-[A-Z0-9]{6,12}$/.test(gaCode)) errors.gaCode = "GA код G-XXXXXXXXXX хэлбэртэй";
  const gaNewCode = text(ga.newCode, 20)?.toUpperCase() ?? null;
  if (gaNewCode && !/^G-[A-Z0-9]{6,12}$/.test(gaNewCode)) errors.gaNewCode = "GA код G-XXXXXXXXXX хэлбэртэй";

  let payment: PaymentEdit | null = null;
  if (body.payment && typeof body.payment === "object") {
    const raw = body.payment as Record<string, unknown>;
    const methods = Array.isArray(raw.methods) ? [...new Set(raw.methods.filter((key): key is string => typeof key === "string"))] : [];
    if (methods.some(key => !providerKeys.has(key))) errors.payment = "Үл мэдэгдэх төлбөрийн хэрэгсэл";
    payment = { methods: methods.filter(key => providerKeys.has(key)), storeCredit: flag(raw.storeCredit), giftCard: flag(raw.giftCard), wallet: flag(raw.wallet) };
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      site: {
        domain, company: company!, taxId, status: status!,
        siteVersion: text(site.siteVersion, 60), package: oneOf(site.package, PACKAGES), segment: oneOf(site.segment, SEGMENTS),
        ownerType: text(site.ownerType, 60), businessModel: text(site.businessModel, 60), type: text(site.type, 60),
        group: text(site.group, 60), industry: text(site.industry, 60), activity, specialist, invoiceSent: flag(site.invoiceSent),
        closeReason: text(site.closeReason, 200),
        ga: { code: gaCode, status: oneOf(ga.status, GA_STATUS_KEYS), newCode: gaNewCode },
      },
      payment,
    },
  };
}

export function applySiteEdits(base: CustomerSite[], edits: SiteEditRecord[]): EditedSite[] {
  const byId = new Map(edits.map(edit => [edit.id, edit]));
  const merged: EditedSite[] = base.map(site => {
    const edit = byId.get(site.id);
    if (!edit) return site;
    byId.delete(site.id);
    const specialist = edit.payload.site.specialist;
    // A changed owner is appended to the hand-over chain so the drawer keeps showing who held the site before.
    const history = specialist && site.specialistHistory.at(-1) !== specialist ? [...site.specialistHistory, specialist] : site.specialistHistory;
    return { ...site, ...edit.payload.site, specialistHistory: history, edit: { isNew: false, updatedAt: edit.updatedAt, updatedBy: edit.updatedBy } };
  });
  for (const edit of byId.values()) {
    if (!edit.payload.isNew) continue;
    merged.push({
      id: edit.id, projectKind: null, plan: null, dates: { created: edit.updatedAt.slice(0, 10), testSite: null, launch: null, closed: null },
      ...edit.payload.site, specialistHistory: edit.payload.site.specialist ? [edit.payload.site.specialist] : [],
      edit: { isNew: true, updatedAt: edit.updatedAt, updatedBy: edit.updatedBy },
    });
  }
  return merged;
}

export function applyPaymentEdits(payments: LinkedPayment[], sites: CustomerSite[], edits: SiteEditRecord[]): LinkedPayment[] {
  const siteById = new Map(sites.map(site => [site.id, site]));
  const overrides = new Map(edits.filter(edit => edit.payload.payment).map(edit => [edit.id, edit.payload.payment!]));
  const result = payments.map(payment => {
    const site = payment.site ? siteById.get(payment.site.id) ?? payment.site : null;
    const override = site ? overrides.get(site.id) : undefined;
    if (site) overrides.delete(site.id);
    return { ...payment, site, ...(override ?? {}) };
  });
  for (const [siteId, override] of overrides) {
    const site = siteById.get(siteId);
    if (site) result.push({ id: `pay-${siteId}`, domain: site.domain ?? site.company, company: site.company, status: site.status, site, ...override });
  }
  return result;
}

// ---- Contacts ------------------------------------------------------------------------------------

export type ContactEmail = { address: string; valid: boolean };
export type ContactPhone = { number: string; valid: boolean; note: string | null };
export type ContactRecord = { id: string; domain: string; company: string; name: string | null; position: string | null; emails: ContactEmail[]; phones: ContactPhone[] };
export type CustomerContactData = { source: string; importedAt: string; contacts: ContactRecord[] };
// matchedBy "company": the sheet's domain is a typo or old name (urmine.mn → urmini.mn), so the site was found by company.
export type LinkedContact = ContactRecord & { site: CustomerSite | null; matchedBy: "domain" | "company" | null };

export type ContactRole = "leadership" | "marketing" | "finance" | "sales" | "web" | "operations" | "other" | "unknown";
export const CONTACT_ROLES: Array<{ key: ContactRole; label: string; color: string }> = [
  { key: "leadership", label: "Удирдлага", color: "#7c5cff" },
  { key: "marketing", label: "Маркетинг", color: "#ec5f9b" },
  { key: "finance", label: "Санхүү", color: "#1fa978" },
  { key: "sales", label: "Борлуулалт", color: "#2676e8" },
  { key: "web", label: "Онлайн & веб", color: "#14a3b8" },
  { key: "operations", label: "Үйл ажиллагаа", color: "#f0a820" },
  { key: "other", label: "Бусад", color: "#64748b" },
  { key: "unknown", label: "Тодорхойгүй", color: "#b4bac6" },
];
// First match wins: a director is Leadership whatever they direct, a department head ("Маркетингийн албаны дарга") goes
// by department, and "дарга" alone only counts as Leadership when nothing more specific matched.
const ROLE_PATTERNS: Array<[ContactRole, RegExp]> = [
  ["leadership", /захирал|ceo|coo|director|head of|founder|owner|эзэмшигч|үүсгэн/i],
  ["marketing", /маркетинг|marketing|брэнд|бренд|brand|контент|content|сошиал|social|ссм|smm|digital|дижитал|эвэнт|event|\bpr\b/i],
  ["finance", /ягтлан|санхүү|сахүү|finance|account|кассир|cashier/i],
  ["web", /веб|вэб|web|дизайн|design|ui\/ux|\bit\b|cto|технологи|хөгжүүлэгч|developer|программ|систем|онлайн|online|коммерс|commerce/i],
  ["sales", /борлуулалт|захиалг|худалдаа|sales|export|харилцагч|хэрэглэгч|үйлчилгээ|order|зөвлөх|бизнес хөгжл/i],
  ["operations", /үйл ажиллагаа|operation|ерөнхий менежер|салбар|дэлгүүр|агуулах|нярав|логистик|ложистик|хангамж|supply|захиргаа|админ|хүний нөөц|бараа|мерчин/i],
  ["leadership", /дарга|тэргүүн|удирдлага/i],
];

export function contactRole(position: string | null): ContactRole {
  if (!position) return "unknown";
  return ROLE_PATTERNS.find(([, pattern]) => pattern.test(position))?.[0] ?? "other";
}

export const contactRoleMeta = (key: ContactRole) => CONTACT_ROLES.find(role => role.key === key)!;

const companyNameKey = (name: string) => name.toLocaleUpperCase("mn-MN").replace(/\b(ХХК|ХК|LLC)\b/gu, "").replace(/[^\p{L}\p{N}]+/gu, "");

// Same domain rules as payments, in both directions (the sheet may hold the *.cody.mn preview or the live .mn domain),
// then a company-name match when exactly one site has that name.
export function linkContactRecords(sites: CustomerSite[], records: ContactRecord[]): LinkedContact[] {
  const byDomain = new Map<string, CustomerSite>();
  for (const site of sites) {
    if (!site.domain) continue;
    const key = domainKey(site.domain);
    byDomain.set(key, site);
    if (key.endsWith(".cody.mn") && !byDomain.has(key.replace(/\.cody\.mn$/, ".mn"))) byDomain.set(key.replace(/\.cody\.mn$/, ".mn"), site);
  }
  const byCompany = new Map<string, CustomerSite | null>();
  for (const site of sites) {
    const key = site.company ? companyNameKey(site.company) : "";
    if (key) byCompany.set(key, byCompany.has(key) && byCompany.get(key)?.id !== site.id ? null : site);
  }
  return records.map(record => {
    const key = domainKey(record.domain);
    const site = byDomain.get(key) ?? byDomain.get(key.replace(/\.cody\.mn$/, ".mn")) ?? null;
    if (site) return { ...record, site, matchedBy: "domain" };
    const companySite = record.company ? byCompany.get(companyNameKey(record.company)) ?? null : null;
    return { ...record, site: companySite, matchedBy: companySite ? "company" : null };
  });
}

export function contactsBySite(contacts: LinkedContact[]) {
  const result = new Map<string, LinkedContact[]>();
  for (const contact of contacts) {
    if (!contact.site) continue;
    result.set(contact.site.id, [...(result.get(contact.site.id) ?? []), contact]);
  }
  return result;
}

export const contactIssues = (contact: ContactRecord) => [
  ...contact.emails.filter(email => !email.valid).map(email => `Имэйл буруу: ${email.address}`),
  ...contact.phones.filter(phone => !phone.valid).map(phone => `Утас ${phone.number.length} оронтой: ${phone.number}`),
  ...contact.phones.filter(phone => phone.note).map(phone => `${phone.number}: ${phone.note}`),
  ...(contact.emails.length ? [] : ["Имэйлгүй"]),
];

export type ContactFilters = { search: string; role: string; specialist: string; status: string; version: string; issues: boolean };

export function filterContacts(contacts: LinkedContact[], filters: ContactFilters) {
  const words = filters.search.toLocaleLowerCase("mn-MN").split(/\s+/).filter(Boolean);
  return contacts.filter(contact => {
    const site = contact.site;
    if (filters.role !== "all" && contactRole(contact.position) !== filters.role) return false;
    if (filters.specialist !== "all" && (filters.specialist === UNASSIGNED ? site?.specialist : site?.specialist !== filters.specialist)) return false;
    if (filters.status !== "all" && (site?.status ?? "Unknown") !== filters.status) return false;
    if (filters.version !== "all" && site?.siteVersion !== filters.version) return false;
    if (filters.issues && !contactIssues(contact).length) return false;
    if (!words.length) return true;
    const haystack = [contact.name, contact.position, contact.domain, contact.company, site?.domain, site?.company, site?.specialist, ...contact.emails.map(email => email.address), ...contact.phones.map(phone => phone.number)]
      .filter(Boolean).join(" ").toLocaleLowerCase("mn-MN");
    return words.every(word => haystack.includes(word) || haystack.replace(/-/g, "").includes(word));
  });
}

/** Valid addresses, each once (case-insensitive), in list order: what "copy emails" puts on the clipboard. */
export function uniqueContactEmails(contacts: ContactRecord[]) {
  const seen = new Map<string, string>();
  for (const contact of contacts) for (const email of contact.emails) {
    if (email.valid && !seen.has(email.address.toLowerCase())) seen.set(email.address.toLowerCase(), email.address);
  }
  return [...seen.values()];
}

/** One row per valid email address with everyone and every site it belongs to (shared inboxes cover several sites). */
export function contactEmailDirectory(contacts: LinkedContact[]) {
  const rows = new Map<string, { address: string; contacts: LinkedContact[]; sites: CustomerSite[] }>();
  for (const contact of contacts) for (const email of contact.emails) {
    if (!email.valid) continue;
    const key = email.address.toLowerCase();
    const row = rows.get(key) ?? { address: email.address, contacts: [], sites: [] };
    row.contacts.push(contact);
    if (contact.site && !row.sites.some(site => site.id === contact.site!.id)) row.sites.push(contact.site);
    rows.set(key, row);
  }
  return [...rows.values()];
}

export function groupContactsBySite(contacts: LinkedContact[]) {
  const groups = new Map<string, { key: string; site: CustomerSite | null; domain: string; company: string; contacts: LinkedContact[] }>();
  for (const contact of contacts) {
    const key = contact.site?.id ?? `sheet:${domainKey(contact.domain)}`;
    const group = groups.get(key) ?? { key, site: contact.site, domain: contact.site ? siteLabel(contact.site) : contact.domain, company: contact.site?.company || contact.company, contacts: [] };
    group.contacts.push(contact);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => (STATUS_ORDER.get(a.site?.status ?? "Unknown") ?? 99) - (STATUS_ORDER.get(b.site?.status ?? "Unknown") ?? 99) || collator.compare(a.domain, b.domain));
}

const CONTACT_CSV_COLUMNS: Array<[string, (contact: LinkedContact) => string | null]> = [
  ["Domain", contact => contact.site?.domain ?? contact.domain], ["Company", contact => contact.site?.company || contact.company],
  ["Status", contact => contact.site?.status ?? null], ["Site version", contact => contact.site?.siteVersion ?? null], ["Account specialist", contact => contact.site?.specialist ?? null],
  ["Name", contact => contact.name], ["Position", contact => contact.position], ["Role", contact => contactRoleMeta(contactRole(contact.position)).label],
  ["Email", contact => contact.emails.map(email => email.address).join("; ")], ["Phone", contact => contact.phones.map(phone => phone.number).join("; ")],
  ["Issues", contact => contactIssues(contact).join("; ")],
];

export function customerContactsCsv(contacts: LinkedContact[]) {
  const escape = (value: string | null) => {
    const text = value ?? "";
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [CONTACT_CSV_COLUMNS.map(([label]) => label), ...contacts.map(contact => CONTACT_CSV_COLUMNS.map(([, read]) => read(contact)))]
    .map(row => row.map(escape).join(",")).join("\n");
}
