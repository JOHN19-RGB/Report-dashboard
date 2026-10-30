"use client";

import { AtSign, Check, ChevronRight, Copy, Download, FileCheck2, Globe2, Layers, List, Mail, Search, ShieldAlert, UserRound, Users, X } from "lucide-react";
import { useMemo } from "react";
import {
  CONTACT_ROLES,
  CUSTOMER_STATUSES,
  UNASSIGNED,
  contactEmailDirectory,
  contactIssues,
  contactRole,
  contactRoleMeta,
  customerContactsCsv,
  distinctValues,
  filterContacts,
  groupContactsBySite,
  siteLabel,
  uniqueContactEmails,
  type ContactFilters,
  type ContactRole,
  type CustomerSite,
} from "../../lib/customer-file";
import { CONTACT_DATA, CustomerFileShell, SelectFilter, StatusChip, initials, percent, useCustomerData, useQueryState } from "./shared";
import { ContactRow, useCopy } from "./contact-row";
import { useSiteDrawer } from "./site-drawer";

const FILTER_LABELS: Record<"role" | "specialist" | "status" | "version", string> = { role: "Үүрэг", specialist: "Хариуцагч", status: "Төлөв", version: "Version" };

export default function CustomerFileContacts() {
  const { contacts: allContacts, contactsBySite, sites } = useCustomerData();
  const [params, updateQuery] = useQueryState();
  const { drawer, openSite } = useSiteDrawer();
  const [copied, copy] = useCopy();

  const filters = useMemo<ContactFilters>(() => ({
    search: params.q ?? "",
    role: CONTACT_ROLES.some(role => role.key === params.role) ? params.role : "all",
    specialist: params.specialist ?? "all",
    status: params.status ?? "all",
    version: params.version ?? "all",
    issues: params.issues === "1",
  }), [params.q, params.role, params.specialist, params.status, params.version, params.issues]);
  const view: "sites" | "emails" = params.view === "emails" ? "emails" : "sites";
  const showMissing = params.missing === "1";

  const contacts = useMemo(() => filterContacts(allContacts, filters), [allContacts, filters]);
  const groups = useMemo(() => groupContactsBySite(contacts), [contacts]);
  const directory = useMemo(() => contactEmailDirectory(contacts), [contacts]);
  const emails = useMemo(() => uniqueContactEmails(contacts), [contacts]);

  const linkedSites = useMemo(() => [...new Map(allContacts.flatMap(contact => contact.site ? [[contact.site.id, contact.site] as [string, CustomerSite]] : [])).values()], [allContacts]);
  const options = useMemo(() => ({
    roles: CONTACT_ROLES.filter(role => allContacts.some(contact => contactRole(contact.position) === role.key)).map(role => [role.key, role.label] as [string, string]),
    specialists: [...distinctValues(linkedSites, site => site.specialist).map(name => [name, name] as [string, string]), ...(linkedSites.some(site => !site.specialist) ? [[UNASSIGNED, "Хариуцагчгүй"] as [string, string]] : [])],
    statuses: CUSTOMER_STATUSES.filter(status => linkedSites.some(site => site.status === status.key)).map(status => [status.key, status.label] as [string, string]),
    versions: distinctValues(linkedSites, site => site.siteVersion).map(value => [value, value] as [string, string]),
  }), [allContacts, linkedSites]);

  // KPIs describe the whole sheet, so they stay put while filtering.
  const totalEmails = useMemo(() => contactEmailDirectory(allContacts), [allContacts]);
  const sharedEmails = totalEmails.filter(row => row.sites.length > 1).length;
  const activeSites = sites.filter(site => site.status === "Active");
  const missingSites = activeSites.filter(site => !contactsBySite.has(site.id));
  const issueCount = allContacts.filter(contact => contactIssues(contact).length).length;

  const activeChips = (Object.keys(FILTER_LABELS) as Array<keyof typeof FILTER_LABELS>).filter(key => filters[key] !== "all");
  const chipValue = (key: keyof typeof FILTER_LABELS, value: string) =>
    key === "role" ? contactRoleMeta(value as ContactRole).label
      : key === "specialist" && value === UNASSIGNED ? "Хариуцагчгүй" : value;
  const filtered = Boolean(filters.search.trim()) || activeChips.length > 0 || filters.issues;
  const resetFilters = () => updateQuery({ q: null, role: null, specialist: null, status: null, version: null, issues: null });

  function download() {
    const blob = new Blob([`﻿${customerContactsCsv(contacts)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href: url, download: `customer-contacts-${new Date().toISOString().slice(0, 10)}.csv` }).click();
    URL.revokeObjectURL(url);
  }

  const copyLabel = (key: string, idle: string) => copied === key ? "Хуулсан" : copied === `error:${key}` ? "Хуулж чадсангүй" : idle;

  return <CustomerFileShell page="contacts" title="Холбоо барих" description={<>Сайт бүрийн харилцагч ажилтан, имэйл, утас нэг дор · {CONTACT_DATA.source.replace(/\.csv$/, "")}</>}>
    <section className="dev-kpi-grid" aria-label="Холбоо барих мэдээллийн үзүүлэлт">
      <article className="dev-kpi-card"><div><strong>{allContacts.length}</strong><span>Харилцагч ажилтан</span><small><Globe2 size={12} /> {contactsBySite.size} сайтад холбогдсон</small></div><span className="dev-kpi-art violet"><Users size={28} /></span></article>
      <article className="dev-kpi-card"><div><strong>{totalEmails.length}</strong><span>Давхардаагүй имэйл хаяг</span><small>{sharedEmails} хаяг хэд хэдэн сайтад бүртгэлтэй</small></div><span className="dev-kpi-art green"><AtSign size={28} /></span></article>
      <button type="button" className={`dev-kpi-card customer-kpi-button${showMissing ? " selected" : ""}`} onClick={() => updateQuery({ missing: showMissing ? null : "1" })} aria-pressed={showMissing}><div><strong>{percent(activeSites.length - missingSites.length, activeSites.length)}%</strong><span>Active сайт холбоо барихтай</span><small>{missingSites.length} Active сайтад бүртгэл алга · харах</small><span className="dev-kpi-progress"><i style={{ width: `${percent(activeSites.length - missingSites.length, activeSites.length)}%` }} /></span></div><span className="dev-kpi-art amber"><FileCheck2 size={28} /></span></button>
      <button type="button" className={`dev-kpi-card customer-kpi-button${filters.issues ? " selected" : ""}`} onClick={() => updateQuery({ issues: filters.issues ? null : "1" })} aria-pressed={filters.issues}><div><strong>{issueCount}</strong><span>Шалгах шаардлагатай</span><small>Имэйлгүй, буруу имэйл, утас · {filters.issues ? "бүгдийг харах" : "шүүх"}</small></div><span className="dev-kpi-art coral"><ShieldAlert size={28} /></span></button>
    </section>

    {showMissing && <section className="dev-panel customer-panel customer-missing-panel" aria-labelledby="customer-missing-title">
      <header><div><span className="all-project-section-kicker">COVERAGE</span><h2 id="customer-missing-title">Холбоо барих мэдээлэлгүй {missingSites.length} Active сайт</h2><p>Contacts info хүснэгтэд нэмэх шаардлагатай · сайт дээр дарж дэлгэрэнгүйг харна</p></div><button type="button" className="icon-button" onClick={() => updateQuery({ missing: null })} aria-label="Хаах"><X size={16} /></button></header>
      <div className="customer-missing-sites">{missingSites.map(site => <button type="button" key={site.id} onClick={() => openSite(site.id)}><span>{siteLabel(site)}</span><small>{site.specialist ?? "Хариуцагчгүй"}</small><ChevronRight size={14} /></button>)}{!missingSites.length && <p className="customer-muted">Бүх Active сайт холбоо барих мэдээлэлтэй.</p>}</div>
    </section>}

    <div className="dev-dashboard-filters customer-filters" aria-label="Холбоо барих шүүлтүүр">
      <label className="dev-filter-search customer-search"><Search size={16} /><input value={filters.search} onChange={event => updateQuery({ q: event.target.value })} placeholder="Нэр, имэйл, утас, сайт хайх" aria-label="Холбоо барих хайх" />{filters.search && <button type="button" className="customer-search-clear" onClick={() => updateQuery({ q: null })} aria-label="Хайлт арилгах"><X size={13} /></button>}</label>
      <SelectFilter label="Үүрэг" value={filters.role} onChange={role => updateQuery({ role })} icon={<UserRound size={16} />} options={options.roles} />
      <SelectFilter label="Хариуцагч" value={filters.specialist} onChange={specialist => updateQuery({ specialist })} icon={<Users size={16} />} options={options.specialists} />
      <SelectFilter label="Version" value={filters.version} onChange={version => updateQuery({ version })} icon={<Layers size={16} />} options={options.versions} />
      <SelectFilter label="Төлөв" value={filters.status} onChange={status => updateQuery({ status })} icon={<FileCheck2 size={16} />} options={options.statuses} />
    </div>

    {(activeChips.length > 0 || filters.issues) && <div className="customer-active-filters" aria-label="Идэвхтэй шүүлтүүр">
      {activeChips.map(key => <button type="button" key={key} onClick={() => updateQuery({ [key]: null })} aria-label={`${FILTER_LABELS[key]} шүүлтүүр арилгах`}><span>{FILTER_LABELS[key]}:</span><b>{chipValue(key, filters[key])}</b><X size={12} /></button>)}
      {filters.issues && <button type="button" onClick={() => updateQuery({ issues: null })} aria-label="Шалгах шаардлагатай шүүлтүүр арилгах"><span>Харах:</span><b>Шалгах шаардлагатай</b><X size={12} /></button>}
      <button type="button" className="customer-clear-all" onClick={resetFilters}>Бүгдийг цэвэрлэх</button>
    </div>}

    <section className="dev-panel customer-directory-panel customer-contacts-panel" aria-labelledby="customer-contacts-title">
      <header><div><span className="all-project-section-kicker">CONTACT DIRECTORY</span><h2 id="customer-contacts-title">{view === "sites" ? `${contacts.length} харилцагч · ${groups.length} сайт` : `${directory.length} имэйл хаяг`}</h2><p>{filtered ? `Нийт ${allContacts.length} харилцагчаас шүүсэн` : "Бүх харилцагч"} · {view === "sites" ? "сайтын нэр дээр дарж дэлгэрэнгүйг харна" : "имэйл бүр нэг удаа, хамаарах ажилтан, сайтын хамт"}</p></div>
        <div className="customer-contact-actions">
          <button type="button" className={`customer-button primary customer-copy-all${copied === "all" ? " done" : ""}`} disabled={!emails.length} onClick={() => void copy(emails.join(", "), "all")} title="Шүүсэн жагсаалтын имэйлүүдийг таслалаар тусгаарлан хуулна (To/BCC талбарт шууд буулгана)">{copied === "all" ? <Check size={15} /> : <Copy size={15} />}{copyLabel("all", "Имэйл хуулах")}<b>{emails.length}</b></button>
          <button className="icon-button dev-download-filter" type="button" onClick={download} disabled={!contacts.length} aria-label="Шүүсэн жагсаалтыг CSV-ээр татах" title="Шүүсэн жагсаалтыг CSV-ээр татах"><Download size={18} /></button>
          <div className="dev-view-toggle" data-view={view === "sites" ? "list" : "card"} role="group" aria-label="Жагсаалтын харагдац"><button type="button" aria-pressed={view === "sites"} onClick={() => updateQuery({ view: null })}><Globe2 size={14} />Сайтаар</button><button type="button" aria-pressed={view === "emails"} onClick={() => updateQuery({ view: "emails" })}><List size={14} />Имэйлүүд</button></div>
        </div>
      </header>

      {view === "sites" ? <div className="customer-contact-groups">{groups.map(group => {
        const groupEmails = uniqueContactEmails(group.contacts);
        return <article className="customer-contact-group" key={group.key}>
          <header>
            <button type="button" className="customer-contact-site" disabled={!group.site} onClick={() => group.site && openSite(group.site.id)} title={group.site ? `${group.domain} дэлгэрэнгүй` : "Site info-д бүртгэлгүй"}>
              <span className="customer-site-icon"><Globe2 size={15} /></span>
              <span><strong>{group.domain}{group.site?.siteVersion && <em className="customer-version-tag">{group.site.siteVersion}</em>}</strong><small>{group.company}</small></span>
            </button>
            {group.site && <StatusChip status={group.site.status} />}
            <span className="customer-cell-owner">{group.site?.specialist ? <><i>{initials(group.site.specialist)}</i>{group.site.specialist}</> : <em>Хариуцагчгүй</em>}</span>
            {groupEmails.length > 0 && <button type="button" className={`customer-copy-chip${copied === group.key ? " done" : ""}`} onClick={() => void copy(groupEmails.join(", "), group.key)} title={`${group.domain}-ийн ${groupEmails.length} имэйлийг хуулах`}>{copied === group.key ? <Check size={12} /> : <Copy size={12} />}{copyLabel(group.key, `${groupEmails.length} имэйл`)}</button>}
          </header>
          <ul>{group.contacts.map(contact => <ContactRow key={contact.id} contact={contact} copied={copied} onCopy={copy} />)}</ul>
        </article>;
      })}</div> : <div className="customer-email-table" role="table" aria-label="Имэйл хаягууд">
        <div className="customer-email-head" role="row"><span role="columnheader">Имэйл</span><span role="columnheader">Ажилтан</span><span role="columnheader">Сайт</span></div>
        {directory.map(row => <div className="customer-email-row" role="row" key={row.address}>
          <span role="cell" className="customer-email-cell"><Mail size={14} /><a href={`mailto:${row.address}`}>{row.address}</a><button type="button" className={`customer-copy-icon${copied === row.address ? " done" : ""}`} onClick={() => void copy(row.address, row.address)} aria-label={`${row.address} хуулах`} title="Хуулах">{copied === row.address ? <Check size={13} /> : <Copy size={13} />}</button></span>
          <span role="cell" className="customer-email-people">{row.contacts.map(contact => <span key={contact.id}><b>{contact.name ?? "Нэргүй"}</b>{contact.position && <small>{contact.position}</small>}</span>)}</span>
          <span role="cell" className="customer-email-sites">{row.sites.map(site => <button type="button" key={site.id} onClick={() => openSite(site.id)}>{siteLabel(site)}<StatusChip status={site.status} /></button>)}</span>
        </div>)}
      </div>}

      {!contacts.length && <div className="customer-empty"><p>{filters.search.trim() ? `"${filters.search.trim()}" хайлтад тохирох харилцагч олдсонгүй.` : "Сонгосон шүүлтүүрт тохирох харилцагч алга."}</p><button type="button" onClick={resetFilters}>Шүүлтүүр цэвэрлэх</button></div>}
    </section>
    {drawer}
  </CustomerFileShell>;
}
