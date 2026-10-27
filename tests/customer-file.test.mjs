import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/lib/customer-file.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const {
  EMPTY_CUSTOMER_FILTERS,
  UNASSIGNED,
  applyPaymentEdits,
  applySiteEdits,
  customerFiltersQuery,
  customerSiteId,
  parseSiteEditInput,
  customerSitesCsv,
  filterCustomerSites,
  linkPaymentRecords,
  parseCustomerFilters,
  paymentCategoryStats,
  paymentMethodCount,
  groupCustomerCompanies,
  nextCustomerSort,
  relatedCustomerSites,
  sortCustomerSites,
  specialistPortfolios,
} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const { sites } = JSON.parse(await readFile(new URL("../app/data/customer-file.json", import.meta.url), "utf8"));
const paymentData = JSON.parse(await readFile(new URL("../app/data/customer-payments.json", import.meta.url), "utf8"));

const site = (overrides) => ({
  id: "s", taxId: null, domain: null, company: "", status: "Active", siteVersion: null, package: null, segment: null, projectKind: null,
  ownerType: null, businessModel: null, type: null, group: null, industry: null, activity: null, specialist: null, specialistHistory: [],
  invoiceSent: null, closeReason: null, plan: null, dates: { created: null, testSite: null, launch: null, closed: null },
  ga: { code: null, status: null, newCode: null }, ...overrides,
});
const fixtures = [
  site({ id: "a", taxId: "1", domain: "a.mn", company: "А ХХК", specialist: "Мишээл", activity: 4, group: "Fashion", dates: { created: null, testSite: null, launch: "2024-01-01", closed: null } }),
  site({ id: "b", taxId: "1", domain: "b.mn", company: "А ХХК", status: "Cancel", specialist: "Энхбат", activity: 1, group: "Fashion" }),
  site({ id: "c", domain: "c.mn", company: "С ХХК", specialist: "Мишээл", activity: 2, ga: { code: "G-ABC", status: "correct", newCode: null } }),
  site({ id: "d", domain: "d.mn", company: "Д ХХК" }),
];

test("imported customer file keeps every site with normalized values", () => {
  assert.equal(sites.length, 118);
  assert.equal(new Set(sites.map(item => item.id)).size, sites.length);
  assert.ok(sites.every(item => item.domain || item.company));
  assert.ok(!sites.some(item => ["InActive", "New ", "sub"].includes(item.status)));
  assert.ok(!sites.some(item => item.industry === "Fashoin"));
  assert.ok(sites.every(item => Object.values(item.dates).every(date => date === null || /^\d{4}-\d{2}-\d{2}$/.test(date))));
  assert.ok(sites.every(item => item.specialist === null || !/^\d+$|^-$/.test(item.specialist)));
  const apteka = sites.find(item => item.domain === "apteka.mn");
  assert.equal(apteka.specialist, "Мишээл");
  assert.equal(apteka.ga.status, "correct");
  // GA status and replacement code are read from the unlabeled columns right after the GA code.
  assert.equal(sites.find(item => item.domain === "take.mn").ga.newCode, "G-V5ERBFHV0G");
});

test("filters combine search, status and specialist including unassigned sites", () => {
  assert.deepEqual(filterCustomerSites(fixtures, { ...EMPTY_CUSTOMER_FILTERS, search: "g-abc" }).map(item => item.id), ["c"]);
  assert.deepEqual(filterCustomerSites(fixtures, { ...EMPTY_CUSTOMER_FILTERS, specialist: "Мишээл", status: "Active" }).map(item => item.id), ["a", "c"]);
  assert.deepEqual(filterCustomerSites(fixtures, { ...EMPTY_CUSTOMER_FILTERS, specialist: UNASSIGNED }).map(item => item.id), ["d"]);
});

test("companies group by tax ID and expose sibling sites", () => {
  const companies = groupCustomerCompanies(fixtures);
  assert.equal(companies.length, 3);
  assert.deepEqual(companies[0].sites.map(item => item.id), ["a", "b"]);
  assert.deepEqual(companies[0].specialists, ["Мишээл", "Энхбат"]);
  const related = relatedCustomerSites(fixtures[0], fixtures);
  assert.deepEqual(related.sameCompany.map(item => item.id), ["b"]);
  assert.equal(related.sameSpecialist, 1);
  assert.equal(related.sameGroup, 1);
});

test("specialist portfolios count active sites and keep unassigned last", () => {
  const portfolios = specialistPortfolios(fixtures);
  assert.deepEqual(portfolios.map(item => item.key), ["Мишээл", "Энхбат", UNASSIGNED]);
  assert.equal(portfolios[0].active, 2);
  assert.equal(portfolios[0].averageActivity, 3);
});

test("sorting cycles and keeps empty values at the bottom", () => {
  const first = nextCustomerSort(null, "activity");
  assert.deepEqual(first, { key: "activity", direction: "desc" });
  assert.deepEqual(nextCustomerSort(first, "activity"), { key: "activity", direction: "asc" });
  assert.equal(nextCustomerSort({ key: "activity", direction: "asc" }, "activity"), null);
  assert.deepEqual(sortCustomerSites(fixtures, first).map(item => item.id), ["a", "c", "b", "d"]);
  assert.deepEqual(sortCustomerSites(fixtures, { key: "launch", direction: "asc" }).map(item => item.id).slice(0, 1), ["a"]);
});

test("CSV export escapes values and keeps the specialist chain", () => {
  const csv = customerSitesCsv([site({ domain: "x.mn", company: 'Нэр, "Х"', specialistHistory: ["А", "Б"] })]).split("\n");
  assert.match(csv[0], /^Domain,Company,Tax ID/);
  assert.match(csv[1], /^x\.mn,"Нэр, ""Х""",/);
  assert.match(csv[1], /А → Б/);
});

test("payment sheet links to Site info by domain, including *.cody.mn preview domains", () => {
  const linked = linkPaymentRecords(sites, paymentData.records);
  assert.equal(linked.length, 104);
  assert.equal(linked.find(item => item.domain === "luminarc.mn").site.domain, "luminarc.cody.mn");
  assert.ok(linked.filter(item => !item.site).some(item => item.domain === "eshop.summit.mn"));
  assert.equal(new Set(linked.filter(item => item.site).map(item => item.site.id)).size, linked.filter(item => item.site).length);
});

test("payment categories count sites, not ticks, and ERP is excluded from method totals", () => {
  const linked = linkPaymentRecords(sites, paymentData.records);
  const stats = paymentCategoryStats(paymentData.categories, linked);
  const wallet = stats.find(item => item.key === "wallet");
  assert.equal(wallet.providers.find(item => item.label === "Toki").sites, 23);
  assert.ok(wallet.sites <= linked.length && wallet.sites >= wallet.providers[0].sites);
  const primeat = linked.find(item => item.domain === "primeat.mn");
  assert.ok(primeat.methods.includes("erp:тодорхойгүй-хувийн"));
  assert.equal(paymentMethodCount(paymentData.categories, primeat), primeat.methods.length - 1);
});

test("site filters round-trip through the URL and ignore unknown keys", () => {
  const query = customerFiltersQuery({ specialist: "Мишээл", status: "all", segment: "Top" });
  assert.equal(query, "specialist=%D0%9C%D0%B8%D1%88%D1%8D%D1%8D%D0%BB&segment=Top");
  const parsed = parseCustomerFilters({ ...Object.fromEntries(new URLSearchParams(query)), evil: "x" });
  assert.deepEqual(parsed, { ...EMPTY_CUSTOMER_FILTERS, specialist: "Мишээл", segment: "Top" });
  // The search box is controlled by the parsed value, so a just-typed space must survive the round trip.
  assert.equal(parseCustomerFilters({ search: "Номин " }).search, "Номин ");
  assert.equal(parseCustomerFilters({ search: "   " }).search, "");
  assert.equal(parseCustomerFilters({ status: " Active " }).status, "Active");
});

const providerKeys = new Set(paymentData.categories.flatMap(category => category.providers.map(provider => provider.key)));
const validInput = { site: { domain: " https://www.New-Shop.mn/ ", company: "  ШИНЭ   ХХК ", status: "New", activity: "3", specialist: "Мишээл", ga: { code: "g-abc1234567" } }, payment: { methods: ["qpay:qpay-данс"], storeCredit: true } };

test("site edit input is normalized and validated", () => {
  const parsed = parseSiteEditInput(validInput, providerKeys);
  assert.ok(parsed.ok);
  assert.equal(parsed.value.site.domain, "new-shop.mn");
  assert.equal(parsed.value.site.company, "ШИНЭ ХХК");
  assert.equal(parsed.value.site.activity, 3);
  assert.equal(parsed.value.site.ga.code, "G-ABC1234567");
  assert.deepEqual(parsed.value.payment, { methods: ["qpay:qpay-данс"], storeCredit: true, giftCard: null, wallet: null });

  const invalid = parseSiteEditInput({ site: { domain: "not a domain", company: "", status: "Deleted", activity: 9, specialist: "123", ga: { code: "UA-1" } }, payment: { methods: ["nope:x"] } }, providerKeys);
  assert.equal(invalid.ok, false);
  assert.deepEqual(Object.keys(invalid.errors).sort(), ["activity", "company", "domain", "gaCode", "payment", "specialist", "status"]);
});

test("saved edits override imported sites, add new ones and extend the specialist history", () => {
  const parsed = parseSiteEditInput(validInput, providerKeys).value;
  const base = [fixtures[0], fixtures[1]];
  const edits = [
    { id: "a", payload: { isNew: false, ...parsed, site: { ...parsed.site, domain: "a.mn", specialist: "Энхбат" } }, updatedAt: "2026-10-26T10:00:00Z", updatedBy: null },
    { id: customerSiteId("new-shop.mn", "ШИНЭ ХХК"), payload: { isNew: true, ...parsed }, updatedAt: "2026-10-26T11:00:00Z", updatedBy: "me@example.com" },
    { id: "ghost", payload: { isNew: false, ...parsed }, updatedAt: "2026-10-26T11:00:00Z", updatedBy: null },
  ];
  const merged = applySiteEdits(base, edits);
  assert.equal(merged.length, 3, "edits for missing imported sites are ignored");
  assert.equal(merged[0].specialist, "Энхбат");
  assert.deepEqual(merged[0].specialistHistory, ["Энхбат"]);
  assert.equal(merged[0].edit.isNew, false);
  assert.equal(merged[1].edit, undefined);
  assert.equal(merged[2].id, "d:new-shop.mn");
  assert.equal(merged[2].dates.created, "2026-10-26");
  assert.equal(merged[2].edit.updatedBy, "me@example.com");

  const payments = applyPaymentEdits([{ id: "p1", domain: "a.mn", company: "А ХХК", status: "Active", methods: ["wallet:toki"], storeCredit: null, giftCard: null, wallet: null, site: base[0] }], merged, edits);
  assert.deepEqual(payments.find(item => item.id === "p1").methods, ["qpay:qpay-данс"]);
  assert.equal(payments.find(item => item.site?.id === "d:new-shop.mn").storeCredit, true);
});

test("manually added ids match the importer's ids for the same domain", () => {
  assert.equal(customerSiteId("https://www.Apteka.mn", "АЗИФАРМА ХХК"), "d:apteka.mn");
  assert.ok(sites.some(item => item.id === customerSiteId(item.domain, item.company)));
  assert.ok(sites.every(item => item.id === customerSiteId(item.domain, item.company) || !item.domain));
});
