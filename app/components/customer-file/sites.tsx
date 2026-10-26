"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, BarChart3, Building2, Check, CreditCard, Download, FileCheck2, Globe2, Layers, LayoutGrid, List, Search, SlidersHorizontal, UserRound, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  CUSTOMER_STATUSES,
  EMPTY_CUSTOMER_FILTERS,
  PACKAGES,
  SEGMENTS,
  UNASSIGNED,
  customerSitesCsv,
  customerStatus,
  distinctValues,
  filterCustomerSites,
  groupCustomerCompanies,
  hasCustomerFilters,
  nextCustomerSort,
  parseCustomerFilters,
  paymentMethodCount,
  siteLabel,
  sortCustomerSites,
  type CustomerFilters,
  type CustomerSort,
  type CustomerSortKey,
  type EditedSite,
} from "../../lib/customer-file";
import { ActivityMeter, CustomerFileShell, PAYMENT_DATA, Pagination, SelectFilter, StatusChip, initials, useCustomerData, useDismiss, usePageFor, useQueryState } from "./shared";
import { useSiteDrawer } from "./site-drawer";

const PAGE_SIZE = 15;
const COMPANY_PAGE_SIZE = 12;
function filterOptions(sites: EditedSite[]) {
  return {
  statuses: CUSTOMER_STATUSES.filter(status => sites.some(site => site.status === status.key)).map(status => [status.key, status.label] as [string, string]),
  specialists: [...distinctValues(sites, site => site.specialist).map(name => [name, name] as [string, string]), ...(sites.some(site => !site.specialist) ? [[UNASSIGNED, "Хариуцагчгүй"] as [string, string]] : [])],
  groups: distinctValues(sites, site => site.group).map(value => [value, value] as [string, string]),
  versions: distinctValues(sites, site => site.siteVersion).map(value => [value, value] as [string, string]),
  packages: PACKAGES.filter(value => sites.some(site => site.package === value)).map(value => [value, value] as [string, string]),
  segments: SEGMENTS.filter(value => sites.some(site => site.segment === value)).map(value => [value, value] as [string, string]),
  };
}
const FILTER_LABELS: Record<keyof CustomerFilters, string> = { search: "Хайлт", status: "Төлөв", specialist: "Хариуцагч", package: "Багц", segment: "Сегмент", group: "Бүлэг", siteVersion: "Version" };
const MORE_FILTERS: Array<keyof CustomerFilters> = ["package", "segment", "group", "siteVersion"];

function filterValueLabel(key: keyof CustomerFilters, value: string) {
  if (key === "specialist" && value === UNASSIGNED) return "Хариуцагчгүй";
  if (key === "status") return customerStatus(value).label;
  return value;
}

export default function CustomerFileSites() {
  const { sites: allSites, paymentsBySite } = useCustomerData();
  const OPTIONS = useMemo(() => filterOptions(allSites), [allSites]);
  const [params, updateQuery] = useQueryState();
  const filters = useMemo(() => parseCustomerFilters(params), [params]);
  const [view, setView] = useState<"site" | "company">("site");
  const [sort, setSort] = useState<CustomerSort>({ key: "status", direction: "asc" });
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  const moreRef = useDismiss<HTMLDivElement>(moreOpen, closeMore);
  const { drawer, openSite } = useSiteDrawer();

  const sites = useMemo(() => sortCustomerSites(filterCustomerSites(allSites, filters), sort), [allSites, filters, sort]);
  const companies = useMemo(() => groupCustomerCompanies(sites), [sites]);
  const [page, setPage] = usePageFor(`${JSON.stringify(filters)}|${JSON.stringify(sort)}|${view}`);
  const filtered = hasCustomerFilters(filters);
  const moreCount = MORE_FILTERS.filter(key => filters[key] !== "all").length;
  const activeChips = (Object.keys(FILTER_LABELS) as Array<keyof CustomerFilters>).filter(key => key !== "search" && filters[key] !== EMPTY_CUSTOMER_FILTERS[key]);

  const updateFilters = (patch: Partial<CustomerFilters>) => updateQuery(patch);
  const resetFilters = () => updateQuery({ ...Object.fromEntries(Object.keys(EMPTY_CUSTOMER_FILTERS).map(key => [key, null])), saved: null });

  function download() {
    const blob = new Blob([`﻿${customerSitesCsv(sites)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href: url, download: `customer-file-${new Date().toISOString().slice(0, 10)}.csv` }).click();
    URL.revokeObjectURL(url);
  }

  function sortIcon(key: CustomerSortKey) {
    if (sort?.key !== key) return <ArrowUpDown size={13} aria-hidden="true" />;
    return sort.direction === "asc" ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />;
  }

  const columns: Array<[CustomerSortKey | null, string]> = [["domain", "Сайт / компани"], ["status", "Төлөв"], [null, "Багц · сегмент"], ["specialist", "Хариуцагч"], ["activity", "Идэвх"], [null, "Төлбөр"]];
  const visibleSites = sites.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const visibleCompanies = companies.slice(page * COMPANY_PAGE_SIZE, (page + 1) * COMPANY_PAGE_SIZE);

  return <CustomerFileShell page="sites" title="Сайтууд" description="Сайт бүрийн мэдээлэл · мөр дээр дарж хариуцагч, төлбөр, холбоотой сайтуудыг харна">
    <div className="dev-dashboard-filters customer-filters" aria-label="Сайтын шүүлтүүр">
      <label className="dev-filter-search customer-search"><Search size={16} /><input value={filters.search} onChange={event => updateFilters({ search: event.target.value })} placeholder="Домэйн, компани, ТТД, GA код хайх" aria-label="Сайт хайх" />{filters.search && <button type="button" className="customer-search-clear" onClick={() => updateFilters({ search: "" })} aria-label="Хайлт арилгах"><X size={13} /></button>}</label>
      <SelectFilter label="Төлөв" value={filters.status} onChange={status => updateFilters({ status })} icon={<FileCheck2 size={16} />} options={OPTIONS.statuses} />
      <SelectFilter label="Хариуцагч" value={filters.specialist} onChange={specialist => updateFilters({ specialist })} icon={<UserRound size={16} />} options={OPTIONS.specialists} />
      <div className="customer-more-filters" ref={moreRef}>
        <button type="button" className={`customer-more-toggle${moreCount ? " active" : ""}`} aria-expanded={moreOpen} aria-controls="customer-more-panel" onClick={() => setMoreOpen(open => !open)}><SlidersHorizontal size={16} />Нэмэлт шүүлтүүр{moreCount > 0 && <b>{moreCount}</b>}</button>
        {moreOpen && <div className="customer-more-panel" id="customer-more-panel" role="group" aria-label="Нэмэлт шүүлтүүр">
          <SelectFilter label="Багц" value={filters.package} onChange={value => updateFilters({ package: value })} icon={<Layers size={16} />} options={OPTIONS.packages} />
          <SelectFilter label="Сегмент" value={filters.segment} onChange={segment => updateFilters({ segment })} icon={<BarChart3 size={16} />} options={OPTIONS.segments} />
          <SelectFilter label="Бүлэг" value={filters.group} onChange={group => updateFilters({ group })} icon={<LayoutGrid size={16} />} options={OPTIONS.groups} />
          <SelectFilter label="Version" value={filters.siteVersion} onChange={siteVersion => updateFilters({ siteVersion })} icon={<Globe2 size={16} />} options={OPTIONS.versions} />
          <button type="button" className="customer-more-done" onClick={closeMore}>Болсон</button>
        </div>}
      </div>
      <div className="dev-dashboard-actions"><button className="icon-button dev-download-filter" type="button" onClick={download} disabled={!sites.length} aria-label="Шүүсэн жагсаалтыг CSV-ээр татах" title="Шүүсэн жагсаалтыг CSV-ээр татах"><Download size={18} /></button></div>
    </div>

    {params.saved && <div className="customer-saved-banner" role="status"><span><Check size={15} /></span><p><b>{params.saved}</b> хадгалагдлаа</p><button type="button" onClick={() => updateQuery({ saved: null })} aria-label="Хаах"><X size={14} /></button></div>}

    {activeChips.length > 0 && <div className="customer-active-filters" aria-label="Идэвхтэй шүүлтүүр">
      {activeChips.map(key => <button type="button" key={key} onClick={() => updateFilters({ [key]: "all" })} aria-label={`${FILTER_LABELS[key]} шүүлтүүр арилгах`}><span>{FILTER_LABELS[key]}:</span><b>{filterValueLabel(key, filters[key])}</b><X size={12} /></button>)}
      <button type="button" className="customer-clear-all" onClick={resetFilters}>Бүгдийг цэвэрлэх</button>
    </div>}

    <section className="dev-panel customer-directory-panel" aria-labelledby="customer-directory-title">
      <header><div><span className="all-project-section-kicker">CUSTOMER DIRECTORY</span><h2 id="customer-directory-title">{view === "site" ? `${sites.length} сайт` : `${companies.length} компани`}</h2><p>{filtered ? `Нийт ${allSites.length} сайтаас шүүсэн` : "Бүх сайт"}{view === "company" ? " · ТТД-аар бүлэглэсэн" : ""}</p></div>
        <div className="dev-view-toggle" data-view={view === "site" ? "list" : "card"} role="group" aria-label="Жагсаалтын харагдац"><button type="button" aria-pressed={view === "site"} onClick={() => setView("site")}><List size={14} />Сайт</button><button type="button" aria-pressed={view === "company"} onClick={() => setView("company")}><Building2 size={14} />Компани</button></div>
      </header>

      {view === "site" ? <div className="customer-table" role="table" aria-label="Харилцагчийн сайтууд">
        <div className="customer-table-head" role="row">{columns.map(([key, label]) => <span role="columnheader" key={label} aria-sort={key && sort?.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}>{key ? <button type="button" className={sort?.key === key ? "active" : ""} onClick={() => setSort(current => nextCustomerSort(current, key))}>{label}{sortIcon(key)}</button> : label}</span>)}</div>
        <div className="customer-table-body" role="rowgroup">{visibleSites.map(site => {
          const payment = paymentsBySite.get(site.id);
          const methods = payment ? paymentMethodCount(PAYMENT_DATA.categories, payment) : null;
          return <button type="button" role="row" className="customer-row" key={site.id} onClick={() => openSite(site.id)} aria-label={`${siteLabel(site)} дэлгэрэнгүй`}>
            <span role="cell" className="customer-cell-site"><span className="customer-site-icon"><Globe2 size={15} /></span><span><strong>{siteLabel(site)}{site.edit && <em className={`customer-edited-badge${site.edit.isNew ? " new" : ""}`}>{site.edit.isNew ? "Шинэ" : "Засварласан"}</em>}</strong><small>{site.domain ? site.company || "—" : "Домэйн бүртгээгүй"}</small></span></span>
            <span role="cell"><StatusChip status={site.status} /></span>
            <span role="cell" className="customer-cell-package"><b>{site.package || "—"}</b><small>{site.segment || "—"} · {site.siteVersion || "—"}</small></span>
            <span role="cell" className="customer-cell-owner">{site.specialist ? <><i>{initials(site.specialist)}</i>{site.specialist}</> : <em>Хариуцагчгүй</em>}</span>
            <span role="cell"><ActivityMeter value={site.activity} /></span>
            <span role="cell" className={`customer-cell-payment${methods ? "" : " empty"}`} title={methods === null ? "Payment type хүснэгтэд бүртгэлгүй" : `${methods} төлбөрийн хэрэгсэл`}><CreditCard size={13} />{methods === null ? "—" : methods}</span>
          </button>;
        })}</div>
        {!sites.length && <div className="customer-empty"><p>Сонгосон шүүлтүүрт тохирох сайт олдсонгүй.</p><button type="button" onClick={resetFilters}>Шүүлтүүр цэвэрлэх</button></div>}
      </div> : <div className="customer-company-grid">{visibleCompanies.map(company => <article className="customer-company-card" key={company.key}>
        <header><span className="customer-site-icon"><Building2 size={16} /></span><div><h3>{company.name}</h3><small>{company.taxId ? `ТТД ${company.taxId}` : "ТТД бүртгээгүй"}{company.ownerType ? ` · ${company.ownerType}` : ""}</small>{company.aliases.length > 0 && <small className="customer-alias">Гэрээний бусад нэр: {company.aliases.join(", ")}</small>}</div><b>{company.sites.length}</b></header>
        <div className="customer-company-sites">{company.sites.map(site => <button type="button" key={site.id} onClick={() => openSite(site.id)}><span>{siteLabel(site)}</span><StatusChip status={site.status} /></button>)}</div>
        <footer><UserRound size={13} />{company.specialists.length ? company.specialists.join(", ") : "Хариуцагчгүй"}</footer>
      </article>)}{!companies.length && <div className="customer-empty"><p>Сонгосон шүүлтүүрт тохирох компани олдсонгүй.</p><button type="button" onClick={resetFilters}>Шүүлтүүр цэвэрлэх</button></div>}</div>}
      <Pagination page={page} pageSize={view === "site" ? PAGE_SIZE : COMPANY_PAGE_SIZE} total={view === "site" ? sites.length : companies.length} onChange={setPage} label="Сайтын жагсаалт" />
    </section>
    {drawer}
  </CustomerFileShell>;
}
