// Converts the "Customer file (Payment type)" CSV export into app/data/customer-payments.json.
// Usage: node scripts/import-customer-payments.mjs "<path to csv>"
import { readFile, writeFile } from "node:fs/promises";
import { parseCsv } from "./csv.mjs";

// Column ranges follow the two-row header of the sheet; merged header cells only carry text in their first column.
const CATEGORIES = [
  { key: "qpay", label: "QPay ба данс", kind: "payment", columns: [6], labels: { 6: "QPay / данс" } },
  { key: "installment", label: "Хуваан төлөх", kind: "payment", columns: range(17, 24) },
  { key: "wallet", label: "Цахим хэтэвч", kind: "payment", columns: range(26, 36) },
  { key: "card", label: "Картаар төлөх", kind: "payment", columns: range(37, 43) },
  { key: "bank-app", label: "Банкны апп", kind: "payment", columns: range(7, 16) },
  { key: "loan", label: "Зээлийн нөхцөл", kind: "payment", columns: range(44, 51) },
  { key: "apple-pay", label: "Apple Pay", kind: "payment", columns: range(3, 5), labels: { 3: "TDB", 4: "Голомт", 5: "Happy pay" } },
  { key: "intl-card", label: "Олон улсын карт", kind: "payment", columns: [25], labels: { 25: "Олон улсын карт" } },
  { key: "erp", label: "ERP холболт", kind: "erp", columns: range(52, 65), labels: { 65: "Тодорхойгүй / хувийн" } },
];
const EXTRAS = { storeCredit: 66, wallet: 67, giftCard: 68 };
const STATUS = { active: "Active", new: "New", sub: "Sub" };

function range(from, to) {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

const clean = value => (value ?? "").replace(/\s+/g, " ").trim();
const slug = value => clean(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
const flag = value => ({ yes: true, no: false })[clean(value).toLowerCase()] ?? null;

const source = process.argv[2];
if (!source) throw new Error("CSV path is required");
const [, providerHeader, ...rows] = parseCsv((await readFile(source, "utf8")).replace(/^﻿/, ""));

const categories = CATEGORIES.map(category => ({
  key: category.key,
  label: category.label,
  kind: category.kind,
  providers: category.columns.map(column => {
    const label = category.labels?.[column] ?? clean(providerHeader[column]);
    return { key: `${category.key}:${slug(label)}`, label, column };
  }),
}));

const records = rows
  .filter(row => clean(row[1]))
  .map((row, index) => ({
    id: `pay-${String(index + 1).padStart(3, "0")}`,
    domain: clean(row[1]),
    company: clean(row[2]),
    status: STATUS[clean(row[0]).toLowerCase()] ?? null,
    methods: categories.flatMap(category => category.providers.filter(provider => flag(row[provider.column])).map(provider => provider.key)),
    storeCredit: flag(row[EXTRAS.storeCredit]),
    wallet: flag(row[EXTRAS.wallet]),
    giftCard: flag(row[EXTRAS.giftCard]),
  }));

const output = new URL("../app/data/customer-payments.json", import.meta.url);
const stripped = categories.map(({ providers, ...category }) => ({ ...category, providers: providers.map(({ key, label }) => ({ key, label })) }));
await writeFile(output, `${JSON.stringify({ source: source.split("/").at(-1), importedAt: new Date().toISOString().slice(0, 10), categories: stripped, records })}\n`);
console.log(`Wrote ${records.length} payment records to ${output.pathname}`);
