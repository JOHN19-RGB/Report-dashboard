// Converts the "Customer file (Site info)" CSV export into app/data/customer-file.json.
// Usage: node scripts/import-customer-file.mjs "<path to csv>"
import { readFile, writeFile } from "node:fs/promises";
import { parseCsv } from "./csv.mjs";


const clean = value => (value ?? "").replace(/\s+/g, " ").trim();
const pick = (map, value) => map[value.toLowerCase()] ?? value;

// Columns are located by header text so the sheet can gain, lose or reorder columns.
// Each entry lists header aliases; "Status" appears twice (site status first, owner type second).
const HEADERS = {
  taxId: ["tax id"], status: ["status"], project: ["project"], company: ["company name by contract"],
  siteVersion: ["site version"], package: ["package"], segment: ["segment"], projectKind: ["төслийн"],
  ownerType: ["status#2"], businessModel: ["business models"], type: ["type"], group: ["group"],
  industry: ["industry"], activity: ["идэвх"], specialistNew: ["account specialist new", "account specialist"],
  closedDate: ["closed date"], closeReason: ["түр зогсоох/ хаах санал", "түр зогсоох/хаах санал"],
  invoiceSent: ["нэхэмжлэх төлбөр илгээгдэж байгаа эсэх"], specialistV2: ["account specialist v2"],
  specialistV1: ["account specialist v1"], createdDate: ["created date"], testSiteDate: ["test site date"],
  launchDate: ["launch date"], plan: ["plan"], gaCode: ["google analytic gcode"],
};
const REQUIRED = ["project", "company", "status"];

function columnIndex(header) {
  const seen = new Map();
  const names = header.map(cell => {
    const name = clean(cell).toLowerCase();
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    return count > 1 ? `${name}#${count}` : name;
  });
  const index = Object.fromEntries(Object.entries(HEADERS).map(([key, aliases]) => [key, aliases.map(alias => names.indexOf(alias)).find(position => position >= 0) ?? -1]));
  const missing = REQUIRED.filter(key => index[key] < 0);
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}`);
  // The GA check result and replacement code sit in the two unlabeled columns right after the GA code.
  index.gaStatus = index.gaCode >= 0 ? index.gaCode + 1 : -1;
  index.gaNewCode = index.gaCode >= 0 ? index.gaCode + 2 : -1;
  return index;
}

const STATUS = { active: "Active", new: "New", inactive: "Inactive", cancel: "Cancel", b2b: "B2B", internal: "Internal", headless: "Headless", sub: "Sub" };
const SITE_VERSION = { "business cody": "Business Cody", backoffice: "Backoffice", bc2: "BC2", both: "Both", ur: "UR" };
const TYPE = { "online store": "Online Store", marketplace: "Marketplace", "intro web": "Intro Web" };
const INDUSTRY = { fashoin: "Fashion", tech: "Tech", "baby diapers": "Baby diapers", "intro web": "Intro Web" };
const PLAN = { multi: "Multi", single: "Single", custom: "Custom", "in-house": "In-house" };
const GA_STATUS = { new: "new", correct: "correct", "old: correct": "correct", change: "change", chnage: "change", "not launch": "not-launched" };
const CLOSE_REASON = { "харилцагчын санаачлгаар": "Харилцагчийн санаачлагаар" };

// Placeholder values ("0", "-", sheet tallies, "Headless") are not people.
const specialist = value => {
  const name = clean(value);
  return /^[\p{L}][\p{L}.\s]*$/u.test(name) && name !== "Headless" ? name : null;
};

// Ids must survive re-imports because saved edits are keyed by them: prefer the domain, then the company name.
function siteId(domain, company, index) {
  const key = (domain || company || `row-${index + 1}`).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[^\p{L}\p{N}.-]+/gu, "-").replace(/^-|-$/g, "");
  return domain ? `d:${key}` : `c:${key}`;
}

function isoDate(value) {
  const text = clean(value);
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return text;
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match || match[3] === "1900") return null;
  return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

const source = process.argv[2];
if (!source) throw new Error("CSV path is required");
const [header, ...rows] = parseCsv((await readFile(source, "utf8")).replace(/^﻿/, ""));
const COLUMN = columnIndex(header);

const sites = rows
  .map(row => Object.fromEntries(Object.entries(COLUMN).map(([key, index]) => [key, index >= 0 ? clean(row[index]) : ""])))
  .filter(row => row.project || row.company)
  .map((row, index) => {
    const history = [row.specialistV1, row.specialistV2, row.specialistNew].map(specialist).filter(Boolean)
      .filter((name, position, list) => name !== list[position - 1]);
    const closeReason = pick(CLOSE_REASON, row.closeReason);
    return {
      id: siteId(row.project, row.company, index),
      taxId: row.taxId || null,
      domain: row.project || null,
      company: row.company,
      status: pick(STATUS, row.status) || "Unknown",
      siteVersion: pick(SITE_VERSION, row.siteVersion) || null,
      package: row.package || null,
      segment: row.segment || null,
      projectKind: row.projectKind || null,
      ownerType: row.ownerType || null,
      businessModel: row.businessModel || null,
      type: pick(TYPE, row.type) || null,
      group: row.group || null,
      industry: pick(INDUSTRY, row.industry) || null,
      activity: /^[0-4]$/.test(row.activity) ? Number(row.activity) : null,
      specialist: specialist(row.specialistNew) ?? specialist(row.specialistV2) ?? specialist(row.specialistV1),
      specialistHistory: history,
      invoiceSent: row.invoiceSent === "TRUE" ? true : row.invoiceSent === "FALSE" ? false : null,
      closeReason: /санаачлага|шилжсэн/i.test(closeReason) ? closeReason : null,
      plan: pick(PLAN, row.plan) || null,
      dates: { created: isoDate(row.createdDate), testSite: isoDate(row.testSiteDate), launch: isoDate(row.launchDate), closed: isoDate(row.closedDate) },
      ga: { code: row.gaCode || null, status: GA_STATUS[row.gaStatus.toLowerCase()] ?? null, newCode: /^G-/.test(row.gaNewCode) ? row.gaNewCode : null },
    };
  });

const output = new URL("../app/data/customer-file.json", import.meta.url);
await writeFile(output, `${JSON.stringify({ source: source.split("/").at(-1), importedAt: new Date().toISOString().slice(0, 10), sites })}\n`);
console.log(`Wrote ${sites.length} sites to ${output.pathname}`);
