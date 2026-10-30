import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseEmails, parsePhones } from "../scripts/contact-fields.mjs";
import { importTs } from "./helpers/load-ts.mjs";

const {
  contactEmailDirectory,
  contactIssues,
  contactRole,
  contactsBySite,
  customerContactsCsv,
  filterContacts,
  groupContactsBySite,
  linkContactRecords,
  uniqueContactEmails,
  UNASSIGNED,
} = await importTs("app/lib/customer-file.ts");
const { sites } = JSON.parse(await readFile(new URL("../app/data/customer-file.json", import.meta.url), "utf8"));
const contactData = JSON.parse(await readFile(new URL("../app/data/customer-contacts.json", import.meta.url), "utf8"));

const site = (id, domain, company, extra = {}) => ({ id, domain, company, taxId: null, status: "Active", specialist: "Энхбат", ...extra });
const contact = (id, domain, extra = {}) => ({ id, domain, company: "", name: "Б.Болд", position: null, emails: [], phones: [], ...extra });
const NO_FILTERS = { search: "", role: "all", specialist: "all", status: "all", version: "all", issues: false };

test("email cells split into addresses, pick up emails typed into the phone cell, and flag malformed ones", () => {
  assert.deepEqual(parseEmails("buta.mkt.sls@gmail.com arvidakh.mmc@gmail.com"), [{ address: "buta.mkt.sls@gmail.com", valid: true }, { address: "arvidakh.mmc@gmail.com", valid: true }]);
  assert.deepEqual(parseEmails("underarmour@tmart.mn", "Sportspot@gmail.com"), [{ address: "underarmour@tmart.mn", valid: true }, { address: "Sportspot@gmail.com", valid: true }]);
  assert.deepEqual(parseEmails("ariunaaenkhnaran@gmailcom"), [{ address: "ariunaaenkhnaran@gmailcom", valid: false }]);
  assert.deepEqual(parseEmails("narangerelgssgroup.mn"), [{ address: "narangerelgssgroup.mn", valid: false }]);
  assert.deepEqual(parseEmails(" Baysgalan@amuulai.mn  ,baysgalan@amuulai.mn"), [{ address: "Baysgalan@amuulai.mn", valid: true }]);
  assert.deepEqual(parseEmails(""), []);
});

test("phone cells split on , | / and keep notes; non-8-digit numbers are flagged", () => {
  assert.deepEqual(parsePhones("88105730, 95053348").map(phone => phone.number), ["8810-5730", "9505-3348"]);
  assert.deepEqual(parsePhones("90999066| 99077019").map(phone => phone.number), ["9099-9066", "9907-7019"]);
  assert.deepEqual(parsePhones("88865039/85897755").map(phone => phone.number), ["8886-5039", "8589-7755"]);
  assert.deepEqual(parsePhones("9501-0188"), [{ number: "9501-0188", valid: true, note: null }]);
  assert.deepEqual(parsePhones("88108877 /буруу дугаар байна/"), [{ number: "8810-8877", valid: true, note: "буруу дугаар байна" }]);
  assert.deepEqual(parsePhones("858581935"), [{ number: "858581935", valid: false, note: null }]);
  assert.deepEqual(parsePhones("Sportspot@gmail.com"), []);
  assert.deepEqual(parsePhones("a"), []);
});

test("contacts link by domain, by the .cody.mn preview in either direction, then by a unique company name", () => {
  const list = [site("a", "baba.mn", "СИ ПИ ЭЛ ХХК"), site("b", "shop.cody.mn", "Шоп ХХК"), site("c", "urmini.mn", "ЭХИЙН СЭТГЭЛЭЭР УРЛАВ ХХК"), site("d", "x.mn", "Давхар ХХК"), site("e", "y.mn", "Давхар ХХК")];
  const linked = linkContactRecords(list, [
    contact("1", "Baba.cody.mn", { company: "СИ ПИ ЭЛ ХХК" }),
    contact("2", "https://www.shop.mn/"),
    contact("3", "urmine.mn", { company: "ЭХИЙН СЭТГЭЛЭЭР УРЛАВ ХХК" }),
    contact("4", "z.mn", { company: "Давхар ХХК" }),
    contact("5", "unknown.mn", { company: "Өөр ХХК" }),
  ]);
  assert.deepEqual(linked.map(item => [item.site?.id ?? null, item.matchedBy]), [["a", "domain"], ["b", "domain"], ["c", "company"], [null, null], [null, null]]);
  assert.deepEqual([...contactsBySite(linked).keys()], ["a", "b", "c"]);
});

test("every imported contact is linked to a Site info row", () => {
  const linked = linkContactRecords(sites, contactData.contacts);
  assert.equal(linked.length, 372);
  assert.deepEqual(linked.filter(item => !item.site).map(item => item.domain), []);
  assert.deepEqual([...new Set(linked.filter(item => item.matchedBy === "company").map(item => `${item.domain} → ${item.site.domain}`))], ["urmine.mn → urmini.mn"]);
});

test("roles: directors lead, department heads go by department, empty positions are unknown", () => {
  assert.equal(contactRole("Гүйцэтгэх захирал"), "leadership");
  assert.equal(contactRole("Маркетинг хариуцсан захирал"), "leadership");
  assert.equal(contactRole("Маркетингийн албаны дарга"), "marketing");
  assert.equal(contactRole("Жижиглэн бизнесийн газрын дарга"), "leadership");
  assert.equal(contactRole("Hягтлан"), "finance");
  assert.equal(contactRole("Захиалгын менежер"), "sales");
  assert.equal(contactRole("Вэб хариуцсан ажилтан"), "web");
  assert.equal(contactRole("Нярав"), "operations");
  assert.equal(contactRole("Төслийн менежер"), "other");
  assert.equal(contactRole(null), "unknown");
});

test("issues list malformed emails, odd phone numbers, notes and missing email", () => {
  assert.deepEqual(contactIssues(contact("1", "a.mn", { emails: [{ address: "x@gmailcom", valid: false }], phones: [{ number: "9982240", valid: false, note: null }, { number: "8810-8877", valid: true, note: "буруу дугаар" }] })),
    ["Имэйл буруу: x@gmailcom", "Утас 7 оронтой: 9982240", "8810-8877: буруу дугаар"]);
  assert.deepEqual(contactIssues(contact("2", "a.mn")), ["Имэйлгүй"]);
  assert.deepEqual(contactIssues(contact("3", "a.mn", { emails: [{ address: "a@b.mn", valid: true }] })), []);
});

test("filters search names, emails and phones (with or without the dash) and use the linked site's owner and status", () => {
  const list = [site("a", "a.mn", "А ХХК", { siteVersion: "Business Cody" }), site("b", "b.mn", "Б ХХК", { specialist: null, status: "New", siteVersion: "Backoffice" })];
  const linked = linkContactRecords(list, [
    contact("1", "a.mn", { name: "Г.Золцэцэг", position: "Захирал", emails: [{ address: "zol@a.mn", valid: true }], phones: [{ number: "9911-7744", valid: true, note: null }] }),
    contact("2", "b.mn", { name: "Ганаа", position: "Нягтлан бодогч", emails: [{ address: "bad@mailcom", valid: false }] }),
  ]);
  const ids = filters => filterContacts(linked, { ...NO_FILTERS, ...filters }).map(item => item.id);
  assert.deepEqual(ids({ search: "99117744" }), ["1"]);
  assert.deepEqual(ids({ search: "9911-7744" }), ["1"]);
  assert.deepEqual(ids({ search: "золцэцэг" }), ["1"]);
  assert.deepEqual(ids({ search: "b.mn" }), ["2"]);
  assert.deepEqual(ids({ role: "finance" }), ["2"]);
  assert.deepEqual(ids({ specialist: "Энхбат" }), ["1"]);
  assert.deepEqual(ids({ specialist: UNASSIGNED }), ["2"]);
  assert.deepEqual(ids({ status: "New" }), ["2"]);
  assert.deepEqual(ids({ issues: true }), ["2"]);
  assert.deepEqual(ids({ version: "Business Cody" }), ["1"]);
  assert.deepEqual(ids({ version: "Backoffice", role: "finance" }), ["2"]);
});

test("email lists keep each valid address once and show every site a shared inbox belongs to", () => {
  const list = [site("a", "a.mn", "А"), site("b", "b.mn", "Б")];
  const linked = linkContactRecords(list, [
    contact("1", "a.mn", { emails: [{ address: "info@inktop.mn", valid: true }, { address: "x@gmailcom", valid: false }] }),
    contact("2", "b.mn", { emails: [{ address: "INFO@inktop.mn", valid: true }, { address: "b@b.mn", valid: true }] }),
  ]);
  assert.deepEqual(uniqueContactEmails(linked), ["info@inktop.mn", "b@b.mn"]);
  const directory = contactEmailDirectory(linked);
  assert.deepEqual(directory.map(row => [row.address, row.contacts.map(item => item.id), row.sites.map(item => item.id)]), [["info@inktop.mn", ["1", "2"], ["a", "b"]], ["b@b.mn", ["2"], ["b"]]]);
  assert.deepEqual(groupContactsBySite(linked).map(group => [group.domain, group.contacts.length]), [["a.mn", 1], ["b.mn", 1]]);
});

test("contacts CSV has one row per person with the linked site's details", () => {
  const linked = linkContactRecords([site("a", "a.mn", "А, ХХК")], [contact("1", "a.mn", { position: "Захирал", emails: [{ address: "a@a.mn", valid: true }], phones: [{ number: "9911-7744", valid: true, note: null }] })]);
  assert.deepEqual(customerContactsCsv(linked).split("\n"), [
    "Domain,Company,Status,Site version,Account specialist,Name,Position,Role,Email,Phone,Issues",
    'a.mn,"А, ХХК",Active,,Энхбат,Б.Болд,Захирал,Удирдлага,a@a.mn,9911-7744,',
  ]);
});
