"use client";

import { ArrowRight, Building2, Check, CreditCard, FileCheck2, Globe2, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, type CSSProperties } from "react";
import {
  CUSTOMER_STATUSES,
  PACKAGES,
  SEGMENTS,
  UNASSIGNED,
  countBy,
  groupCustomerCompanies,
  paymentCategoryStats,
  paymentMethodCount,
  specialistPortfolios,
  type EditedSite,
  type LinkedPayment,
} from "../../lib/customer-file";
import { CustomerFileShell, DATA, PAYMENT_DATA, formatDate, initials, percent, sitesHref, useCustomerData } from "./shared";

function summarize(sites: EditedSite[], payments: LinkedPayment[]) {
  const companies = groupCustomerCompanies(sites);
  const portfolios = specialistPortfolios(sites);
  const statusCounts = countBy(sites, site => site.status);
  const statuses = CUSTOMER_STATUSES.filter(status => statusCounts.get(status.key));
  const matrix = countBy(sites, site => site.segment && site.package ? `${site.segment}|${site.package}` : null);
  const activeSites = sites.filter(site => site.status === "Active");
  const invoicedActive = activeSites.filter(site => site.invoiceSent).length;
  const linkedPayments = payments.filter(payment => payment.site);
  const paymentCategories = paymentCategoryStats(PAYMENT_DATA.categories.filter(category => category.kind === "payment"), linkedPayments)
    .sort((a, b) => b.sites - a.sites).slice(0, 4);
  const averageMethods = linkedPayments.reduce((sum, payment) => sum + paymentMethodCount(PAYMENT_DATA.categories, payment), 0) / Math.max(1, linkedPayments.length);

  // Each specialist's sites split by status, so the portfolio bar shows health, not just size.
  const portfolioStatus = new Map(portfolios.map(portfolio => [portfolio.key, countBy(sites.filter(site => (site.specialist ?? UNASSIGNED) === portfolio.key), site => site.status)]));

  const donutGradient = () => {
    let start = 0;
    const stops = statuses.map(status => {
      const share = statusCounts.get(status.key)! / sites.length * 100;
      const stop = `${status.color} ${start}% ${start + share}%`;
      start += share;
      return stop;
    });
    return `conic-gradient(${stops.join(", ")})`;
  };
  return { companies, portfolios, statusCounts, statuses, matrix, activeSites, invoicedActive, linkedPayments, paymentCategories, averageMethods, portfolioStatus, donut: donutGradient() };
}

export default function CustomerFileOverview() {
  const { sites, payments } = useCustomerData();
  const { companies, portfolios, statusCounts, statuses, matrix, activeSites, invoicedActive, linkedPayments, paymentCategories, averageMethods, portfolioStatus, donut } = useMemo(() => summarize(sites, payments), [sites, payments]);
  const active = statusCounts.get("Active") ?? 0;
  const maxPortfolio = Math.max(1, ...portfolios.map(portfolio => portfolio.sites));
  const maxMatrix = Math.max(1, ...matrix.values());
  const otherStatuses = statuses.filter(status => status.key !== "Active").map(status => `${statusCounts.get(status.key)} ${status.label}`).slice(0, 2).join(" · ");

  return <CustomerFileShell page="overview" title="Customer file" description={<>Харилцагчийн сайтуудын товч тойм · {sites.length} сайт · {companies.length} компани · шинэчилсэн {formatDate(DATA.importedAt)}</>}>
    <section className="dev-kpi-grid" aria-label="Customer file гол үзүүлэлтүүд">
      <article className="dev-kpi-card"><div><strong>{sites.length}</strong><span>Нийт сайт</span><small><Globe2 size={12} /> Site info хүснэгтээс</small></div><span className="dev-kpi-art violet"><Globe2 size={28} /></span></article>
      <article className="dev-kpi-card"><div><strong>{active}</strong><span>Active сайт</span><small>{percent(active, sites.length)}%{otherStatuses ? ` · ${otherStatuses}` : ""}</small><span className="dev-kpi-progress"><i style={{ width: `${percent(active, sites.length)}%` }} /></span></div><span className="dev-kpi-art green"><Check size={28} /></span></article>
      <article className="dev-kpi-card"><div><strong>{companies.length}</strong><span>Компани</span><small><Building2 size={12} /> {companies.filter(company => company.sites.length > 1).length} нь олон сайттай</small></div><span className="dev-kpi-art amber"><Building2 size={28} /></span></article>
      <article className="dev-kpi-card"><div><strong>{percent(invoicedActive, activeSites.length)}%</strong><span>Нэхэмжлэх илгээгдэж буй</span><small>{invoicedActive} / {activeSites.length} Active сайт</small><span className="dev-kpi-progress"><i style={{ width: `${percent(invoicedActive, activeSites.length)}%` }} /></span></div><span className="dev-kpi-art coral"><FileCheck2 size={28} /></span></article>
    </section>

    <div className="customer-overview-grid">
      <section className="dev-panel customer-panel" aria-labelledby="customer-status-title">
        <header><div><span className="all-project-section-kicker">STATUS</span><h2 id="customer-status-title">Төлөвийн бүтэц</h2><p>Төлөв дээр дарж тухайн сайтуудыг харна</p></div></header>
        <div className="customer-status-layout">
          <div className="customer-donut" style={{ background: donut }} role="img" aria-label={statuses.map(status => `${status.label} ${statusCounts.get(status.key)}`).join(", ")}><span><strong>{sites.length}</strong><small>сайт</small></span></div>
          <div className="customer-status-list">{statuses.map(status => {
            const count = statusCounts.get(status.key)!;
            return <Link key={status.key} href={sitesHref({ status: status.key })}>
              <span className="customer-status-name"><i style={{ background: status.color }} /><b>{status.label}</b><small>{status.description}</small></span>
              <strong>{count}</strong><small>{percent(count, sites.length)}%</small>
            </Link>;
          })}</div>
        </div>
      </section>

      <section className="dev-panel customer-panel" aria-labelledby="customer-specialist-title">
        <header><div><span className="all-project-section-kicker">ACCOUNT SPECIALIST</span><h2 id="customer-specialist-title">Хариуцагчийн портфолио</h2><p>Сайтын тоо, төлөвөөр нь өнгөөр ялгасан</p></div><span className="all-project-total-badge"><Users size={13} />{portfolios.filter(portfolio => portfolio.name).length}</span></header>
        <div className="customer-portfolio-list">{portfolios.map(portfolio => {
          const counts = portfolioStatus.get(portfolio.key)!;
          return <Link key={portfolio.key} href={sitesHref({ specialist: portfolio.key })}>
            <i className={portfolio.name ? "" : "empty"}>{portfolio.name ? initials(portfolio.name) : "?"}</i>
            <span className="customer-portfolio-copy"><b>{portfolio.name ?? "Хариуцагчгүй"}</b><small>{portfolio.active} Active · дундаж идэвх {portfolio.averageActivity === null ? "—" : portfolio.averageActivity.toFixed(1)}</small>
              <span className="customer-portfolio-stack" style={{ width: `${portfolio.sites / maxPortfolio * 100}%` }}>{statuses.map(status => counts.get(status.key) ? <em key={status.key} style={{ flexGrow: counts.get(status.key), background: status.color }} title={`${status.label}: ${counts.get(status.key)}`} /> : null)}</span>
            </span>
            <strong>{portfolio.sites}</strong>
          </Link>;
        })}</div>
        <div className="customer-legend">{statuses.map(status => <span key={status.key}><i style={{ background: status.color }} />{status.label}</span>)}</div>
      </section>

      <section className="dev-panel customer-panel" aria-labelledby="customer-matrix-title">
        <header><div><span className="all-project-section-kicker">SEGMENT × PACKAGE</span><h2 id="customer-matrix-title">Сегмент ба багц</h2><p>Нүд дээр дарж тухайн хослолын сайтуудыг харна</p></div></header>
        <div className="customer-matrix" role="group" aria-label="Сегмент ба багцын харьцаа">
          <div className="customer-matrix-head" aria-hidden="true"><span />{PACKAGES.map(value => <span key={value}>{value}</span>)}</div>
          {SEGMENTS.map(segment => <div key={segment}><span className="customer-matrix-segment">{segment}</span>{PACKAGES.map(pack => {
            const count = matrix.get(`${segment}|${pack}`) ?? 0;
            return <Link key={pack} href={sitesHref({ segment, package: pack })} style={{ "--cell-strength": count / maxMatrix } as CSSProperties} aria-label={`${segment} × ${pack}: ${count} сайт`}><strong>{count}</strong><small>{percent(count, sites.length)}%</small></Link>;
          })}</div>)}
        </div>
      </section>

      <section className="dev-panel customer-panel customer-payment-teaser" aria-labelledby="customer-payment-teaser-title">
        <header><div><span className="all-project-section-kicker">PAYMENT</span><h2 id="customer-payment-teaser-title">Төлбөрийн хэрэгсэл</h2><p>{linkedPayments.length} / {sites.length} сайтад мэдээлэлтэй · дунджаар {averageMethods.toFixed(1)} хэрэгсэл</p></div><span className="dev-kpi-art violet"><CreditCard size={22} /></span></header>
        <ul>{paymentCategories.map(category => <li key={category.key}>
          <span><b>{category.label}</b><small>{category.top ? `Түгээмэл: ${category.top.label}` : "—"}</small></span>
          <i><em style={{ width: `${percent(category.sites, linkedPayments.length)}%` }} /></i>
          <strong>{percent(category.sites, linkedPayments.length)}%</strong>
        </li>)}</ul>
        <Link className="customer-panel-link" href="/customer-file/payments">Бүх төлбөрийн хэрэгсэл харах<ArrowRight size={14} /></Link>
      </section>
    </div>
  </CustomerFileShell>;
}
