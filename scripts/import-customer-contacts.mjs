// Converts the "Customer file (Contacts info)" CSV export into app/data/customer-contacts.json.
// Usage: node scripts/import-customer-contacts.mjs "<path to csv>"
// Columns: project (domain), company, site version, name, position, phone, email. The sheet's side table of Zendesk
// totals (columns J–K) is not per-contact data and is skipped. Contacts are linked to sites at runtime (see
// linkContactRecords), so a later Site info import or a manual site edit is picked up without re-importing this file.
import { readFile, writeFile } from "node:fs/promises";
import { parseCsv } from "./csv.mjs";
import { clean, parseEmails, parsePhones } from "./contact-fields.mjs";

const source = process.argv[2];
if (!source) throw new Error("CSV path is required");
const [, ...rows] = parseCsv((await readFile(source, "utf8")).replace(/^﻿/, ""));

const contacts = rows
  .filter(row => clean(row[0]))
  .map(row => ({
    domain: clean(row[0]),
    company: clean(row[1]),
    name: clean(row[3]) || null,
    position: clean(row[4]) || null,
    emails: parseEmails(row[6], row[5]),
    phones: parsePhones(row[5]),
  }))
  .filter(contact => contact.name || contact.emails.length || contact.phones.length)
  .map((contact, index) => ({ id: `contact-${String(index + 1).padStart(3, "0")}`, ...contact }));

const output = new URL("../app/data/customer-contacts.json", import.meta.url);
await writeFile(output, `${JSON.stringify({ source: source.split("/").at(-1), importedAt: new Date().toISOString().slice(0, 10), contacts })}\n`);
const emails = contacts.flatMap(contact => contact.emails);
console.log(`Wrote ${contacts.length} contacts (${emails.filter(email => email.valid).length} valid emails, ${emails.filter(email => !email.valid).length} malformed) to ${output.pathname}`);
