"use client";

import { CreditCard, Gift, Globe2, Layers, Plug, Search, Wallet, X } from "lucide-react";
import { useMemo } from "react";
import {
  type LinkedPayment,
  categoryOf,
  paymentCategoryStats,
  paymentLabel,
  paymentMethodCount,
  paymentStatus,
} from "../../lib/customer-file";
import { CustomerFileShell, PAYMENT_DATA, Pagination, StatusChip, initials, percent, useCustomerData, usePageFor, useQueryState } from "./shared";
import { useSiteDrawer } from "./site-drawer";

const PAGE_SIZE = 10;
const CATEGORIES = PAYMENT_DATA.categories;
const DEFAULT_CATEGORY = "installment";
// Extras are yes/no flags rather than providers; picking one replaces the category selection.
const EXTRAS = [
  { key: "storeCredit", label: "Store credit", icon: CreditCard, has: (payment: LinkedPayment) => payment.storeCredit },
  { key: "giftCard", label: "Gift card", icon: Gift, has: (payment: LinkedPayment) => payment.giftCard },
  { key: "wallet", label: "Wallet", icon: Wallet, has: (payment: LinkedPayment) => payment.wallet },
] as const;

export default function CustomerFilePayments() {
  const { payments: allPayments } = useCustomerData();
  const [params, updateQuery] = useQueryState();
  const providerParam = params.provider && CATEGORIES.some(category => category.providers.some(provider => provider.key === params.provider)) ? params.provider : null;
  const extra = providerParam ? null : EXTRAS.find(item => item.key === params.extra) ?? null;
  const categoryKey = providerParam ? categoryOf(providerParam) : CATEGORIES.some(category => category.key === params.category) ? params.category : DEFAULT_CATEGORY;
  const providerKey = providerParam;
  const scope: "all" | "active" = params.scope === "active" ? "active" : "all";
  const search = params.q ?? "";
  const { drawer, openPayment } = useSiteDrawer();

  const payments = useMemo(() => scope === "active" ? allPayments.filter(payment => paymentStatus(payment) === "Active") : allPayments, [allPayments, scope]);
  const stats = useMemo(() => paymentCategoryStats(CATEGORIES, payments), [payments]);
  const extras = useMemo(() => EXTRAS.map(item => ({ ...item, sites: payments.filter(item.has).length })), [payments]);
  // A category that no longer has any site (e.g. after switching to Active only) falls back to the default one.
  const requested = stats.find(item => item.key === categoryKey);
  const category = requested?.sites ? requested : stats.find(item => item.key === DEFAULT_CATEGORY) ?? stats[0];
  const provider = extra ? null : category.providers.find(item => item.key === providerKey) ?? null;
  const usedProviders = category.providers.filter(item => item.sites);
  const unusedProviders = category.providers.filter(item => !item.sites);
  const matching = useMemo(() => {
    const words = search.toLocaleLowerCase("mn-MN").split(/\s+/).filter(Boolean);
    return payments
      .filter(payment => extra ? extra.has(payment) : provider ? payment.methods.includes(provider.key) : payment.methods.some(method => categoryOf(method) === category.key))
      .filter(payment => !words.length || words.every(word => [payment.domain, payment.company, payment.site?.domain, payment.site?.company, payment.site?.specialist].filter(Boolean).join(" ").toLocaleLowerCase("mn-MN").includes(word)))
      .sort((a, b) => paymentMethodCount(CATEGORIES, b) - paymentMethodCount(CATEGORIES, a) || paymentLabel(a).localeCompare(paymentLabel(b)));
  }, [payments, category.key, provider, extra, search]);

  const [page, setPage] = usePageFor(`${scope}|${category.key}|${provider?.key ?? ""}|${extra?.key ?? ""}|${search}`);
  const linked = payments.filter(payment => payment.site).length;
  const average = payments.reduce((sum, payment) => sum + paymentMethodCount(CATEGORIES, payment), 0) / Math.max(1, payments.length);
  const installment = stats.find(item => item.key === "installment")?.sites ?? 0;
  const erp = stats.find(item => item.key === "erp")?.sites ?? 0;
  const maxProvider = Math.max(1, ...category.providers.map(item => item.sites));
  const maxExtra = Math.max(1, ...extras.map(item => item.sites));
  const selectionLabel = extra ? extra.label : provider ? provider.label : category.label;

  const selectCategory = (key: string) => updateQuery({ category: key === DEFAULT_CATEGORY ? null : key, provider: null, extra: null });
  const selectProvider = (key: string) => updateQuery({ provider: key === providerKey ? null : key, category: null, extra: null });
  const selectExtra = (key: string) => updateQuery(key === extra?.key ? { extra: null } : { extra: key, provider: null, category: null });
  const clearProvider = () => updateQuery({ provider: null, category: category.key === DEFAULT_CATEGORY ? null : category.key });

  return <CustomerFileShell page="payments" title="Төлбөрийн хэрэгсэл" description={<>Сайтууд ямар төлбөрийн хэрэгсэл, ERP ашиглаж буй · {PAYMENT_DATA.source.replace(/\.csv$/, "")}</>} actions={<div className="dev-view-toggle customer-scope-toggle" data-view={scope === "all" ? "list" : "card"} role="group" aria-label="Хамрах хүрээ"><button type="button" aria-pressed={scope === "all"} onClick={() => updateQuery({ scope: null })}>Бүх сайт</button><button type="button" aria-pressed={scope === "active"} onClick={() => updateQuery({ scope: "active" })}>Зөвхөн Active</button></div>}>

    <section className="dev-kpi-grid" aria-label="Төлбөрийн гол үзүүлэлтүүд">
      <article className="dev-kpi-card"><div><strong>{payments.length}</strong><span>Мэдээлэлтэй сайт</span><small><Globe2 size={12} /> {linked} нь Site info-той холбогдсон</small></div><span className="dev-kpi-art violet"><Globe2 size={28} /></span></article>
      <article className="dev-kpi-card"><div><strong>{average.toFixed(1)}</strong><span>Дундаж хэрэгсэл / сайт</span><small>{payments.filter(payment => !paymentMethodCount(CATEGORIES, payment)).length} сайтад тэмдэглээгүй</small></div><span className="dev-kpi-art green"><CreditCard size={28} /></span></article>
      <article className="dev-kpi-card"><div><strong>{percent(installment, payments.length)}%</strong><span>Хуваан төлөх ашигладаг</span><small>{installment} / {payments.length} сайт</small><span className="dev-kpi-progress"><i style={{ width: `${percent(installment, payments.length)}%` }} /></span></div><span className="dev-kpi-art amber"><Layers size={28} /></span></article>
      <article className="dev-kpi-card"><div><strong>{erp}</strong><span>ERP холболттой</span><small><Plug size={12} /> {percent(erp, payments.length)}% сайт</small></div><span className="dev-kpi-art coral"><Plug size={28} /></span></article>
    </section>

    <section className="dev-panel customer-category-panel" aria-labelledby="customer-category-title">
      <header><div><span className="all-project-section-kicker">STEP 1 · CATEGORY</span><h2 id="customer-category-title">Ангилал сонгох</h2><p>Хувь нь тухайн ангиллын дор хаяж нэг хэрэгсэл ашигладаг сайтын эзлэх хэмжээ</p></div>
        <div className="customer-extras summary" role="group" aria-label="Нэмэлт боломжоор шүүх">{extras.map(item => <button type="button" key={item.key} className={`${item.sites ? "on" : ""}${item.key === extra?.key ? " selected" : ""}`} aria-pressed={item.key === extra?.key} disabled={!item.sites} title={item.sites ? `${item.label} ашигладаг ${item.sites} сайтыг харах` : `${item.label} ашигладаг сайт алга`} onClick={() => selectExtra(item.key)}><item.icon size={13} />{item.label}<b>{item.sites}</b></button>)}</div>
      </header>
      <div className="customer-category-grid" role="tablist" aria-label="Төлбөрийн ангилал">{stats.map(item => <button type="button" role="tab" key={item.key} aria-selected={!extra && item.key === category.key} disabled={!item.sites} title={item.sites ? undefined : "Энэ ангиллын хэрэгсэл ашигладаг сайт алга"} className={`${!extra && item.key === category.key ? "selected" : ""}${item.kind === "erp" ? " erp" : ""}`} onClick={() => selectCategory(item.key)}>
        <span className="customer-category-top"><b>{item.label}</b>{item.kind === "erp" && <Plug size={14} />}</span>
        <strong>{percent(item.sites, payments.length)}%</strong>
        <i><em style={{ width: `${percent(item.sites, payments.length)}%` }} /></i>
        <small>{item.sites} сайт · {item.top ? item.top.label : "ашиглаагүй"}</small>
      </button>)}</div>
    </section>

    <div className="customer-payment-detail">
      <section className="dev-panel customer-panel" aria-labelledby="customer-provider-title">
        {extra ? <>
          <header><div><span className="all-project-section-kicker">STEP 2 · НЭМЭЛТ БОЛОМЖ</span><h2 id="customer-provider-title">Нэмэлт боломж</h2><p>Store credit, gift card, wallet ашигладаг сайтууд</p></div></header>
          <div className="customer-provider-list">{extras.map(item => <button type="button" key={item.key} disabled={!item.sites} aria-pressed={item.key === extra.key} className={item.key === extra.key ? "selected" : ""} onClick={() => selectExtra(item.key)}>
            <span>{item.label}</span>
            <i><em style={{ width: `${item.sites / maxExtra * 100}%` }} /></i>
            <strong>{item.sites}</strong>
          </button>)}</div>
        </> : <>
          <header><div><span className="all-project-section-kicker">STEP 2 · PROVIDER</span><h2 id="customer-provider-title">{category.label}</h2><p>Хэрэгсэл дээр дарж ашигладаг сайтуудыг шүүнэ</p></div></header>
          <div className="customer-provider-list">{usedProviders.map(item => <button type="button" key={item.key} aria-pressed={item.key === provider?.key} className={item.key === provider?.key ? "selected" : ""} onClick={() => selectProvider(item.key)}>
            <span>{item.label}</span>
            <i><em style={{ width: `${item.sites / maxProvider * 100}%` }} /></i>
            <strong>{item.sites}</strong>
          </button>)}</div>
          {unusedProviders.length > 0 && <p className="customer-provider-unused"><b>Ашиглаагүй:</b> {unusedProviders.map(item => item.label).join(", ")}</p>}
        </>}
      </section>

      <section className="dev-panel customer-panel" aria-labelledby="customer-payment-sites-title">
        <header><div><span className="all-project-section-kicker">STEP 3 · SITES</span><h2 id="customer-payment-sites-title">{selectionLabel} · {matching.length} сайт</h2><p>{extra ? `${extra.label} ашигладаг` : provider ? "Сонгосон хэрэгслийг ашигладаг" : "Ангиллын аль нэг хэрэгслийг ашигладаг"} · мөр дээр дарж дэлгэрэнгүйг харна</p></div></header>
        <div className="customer-payment-tools">
          <label className="dev-filter-search customer-search customer-payment-search"><Search size={15} /><input value={search} onChange={event => updateQuery({ q: event.target.value })} placeholder="Сайт, компани, хариуцагч хайх" aria-label="Төлбөрийн сайт хайх" />{search && <button type="button" className="customer-search-clear" onClick={() => updateQuery({ q: null })} aria-label="Хайлт арилгах"><X size={13} /></button>}</label>
          {(provider || extra || scope === "active") && <div className="customer-active-filters" aria-label="Идэвхтэй шүүлтүүр">
            {provider && <button type="button" onClick={clearProvider} aria-label={`${provider.label} шүүлтүүр арилгах`}><span>Хэрэгсэл:</span><b>{provider.label}</b><X size={12} /></button>}
            {extra && <button type="button" onClick={() => updateQuery({ extra: null })} aria-label={`${extra.label} шүүлтүүр арилгах`}><span>Нэмэлт:</span><b>{extra.label}</b><X size={12} /></button>}
            {scope === "active" && <button type="button" onClick={() => updateQuery({ scope: null })} aria-label="Зөвхөн Active шүүлтүүр арилгах"><span>Төлөв:</span><b>Зөвхөн Active</b><X size={12} /></button>}
          </div>}
        </div>
        <div className="customer-payment-sites">{matching.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(payment => {
          const inCategory = extra ? null : payment.methods.filter(method => categoryOf(method) === category.key).length;
          return <button type="button" key={payment.id} onClick={() => openPayment(payment.id)}>
            <span className="customer-site-icon"><Globe2 size={15} /></span>
            <span className="customer-payment-site-copy"><strong>{paymentLabel(payment)}</strong><small>{payment.site ? payment.site.company : <em>Site info-д бүртгэлгүй</em>}</small></span>
            <StatusChip status={paymentStatus(payment)} />
            <span className="customer-cell-owner">{payment.site?.specialist ? <><i>{initials(payment.site.specialist)}</i>{payment.site.specialist}</> : <em>—</em>}</span>
            {inCategory === null ? <span className="customer-payment-count" title={`Нийт ${paymentMethodCount(CATEGORIES, payment)} төлбөрийн хэрэгсэл`}><b>{paymentMethodCount(CATEGORIES, payment)}</b><small>хэрэгсэл</small></span> : <span className="customer-payment-count" title={`${category.label}: ${inCategory} хэрэгсэл · нийт ${paymentMethodCount(CATEGORIES, payment)}`}><b>{inCategory}</b><small>/ {paymentMethodCount(CATEGORIES, payment)} нийт</small></span>}
          </button>;
        })}{!matching.length && <div className="customer-empty"><p>{search ? `"${search.trim()}" хайлтад тохирох сайт олдсонгүй.` : "Энэ сонголтод тохирох сайт алга."}</p>{search && <button type="button" onClick={() => updateQuery({ q: null })}>Хайлт арилгах</button>}</div>}</div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={matching.length} onChange={setPage} label="Төлбөрийн сайтууд" />
      </section>
    </div>
    {drawer}
  </CustomerFileShell>;
}
