"use client";

import { CreditCard, Gift, Globe2, Layers, Plug, Wallet } from "lucide-react";
import { useMemo } from "react";
import {
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

export default function CustomerFilePayments() {
  const { payments: allPayments } = useCustomerData();
  const [params, updateQuery] = useQueryState();
  const providerParam = params.provider && CATEGORIES.some(category => category.providers.some(provider => provider.key === params.provider)) ? params.provider : null;
  const categoryKey = providerParam ? categoryOf(providerParam) : CATEGORIES.some(category => category.key === params.category) ? params.category : DEFAULT_CATEGORY;
  const providerKey = providerParam;
  const scope: "all" | "active" = params.scope === "active" ? "active" : "all";
  const { drawer, openPayment } = useSiteDrawer();

  const payments = useMemo(() => scope === "active" ? allPayments.filter(payment => paymentStatus(payment) === "Active") : allPayments, [allPayments, scope]);
  const stats = useMemo(() => paymentCategoryStats(CATEGORIES, payments), [payments]);
  const category = stats.find(item => item.key === categoryKey) ?? stats[0];
  const provider = category.providers.find(item => item.key === providerKey) ?? null;
  const matching = useMemo(() => payments
    .filter(payment => provider ? payment.methods.includes(provider.key) : payment.methods.some(method => categoryOf(method) === category.key))
    .sort((a, b) => paymentMethodCount(CATEGORIES, b) - paymentMethodCount(CATEGORIES, a) || paymentLabel(a).localeCompare(paymentLabel(b))), [payments, category.key, provider]);

  const [page, setPage] = usePageFor(`${scope}|${category.key}|${provider?.key ?? ""}`);
  const linked = payments.filter(payment => payment.site).length;
  const average = payments.reduce((sum, payment) => sum + paymentMethodCount(CATEGORIES, payment), 0) / Math.max(1, payments.length);
  const installment = stats.find(item => item.key === "installment")?.sites ?? 0;
  const erp = stats.find(item => item.key === "erp")?.sites ?? 0;
  const maxProvider = Math.max(1, ...category.providers.map(item => item.sites));
  const extras: Array<[string, number, typeof Gift]> = [
    ["Store credit", payments.filter(payment => payment.storeCredit).length, CreditCard],
    ["Gift card", payments.filter(payment => payment.giftCard).length, Gift],
    ["Wallet", payments.filter(payment => payment.wallet).length, Wallet],
  ];

  const selectCategory = (key: string) => updateQuery({ category: key === DEFAULT_CATEGORY ? null : key, provider: null });
  const selectProvider = (key: string) => updateQuery({ provider: key === providerKey ? null : key, category: null });
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
        <div className="customer-extras summary">{extras.map(([label, count, Icon]) => <span key={label} className={count ? "on" : ""}><Icon size={13} />{label}<b>{count}</b></span>)}</div>
      </header>
      <div className="customer-category-grid" role="tablist" aria-label="Төлбөрийн ангилал">{stats.map(item => <button type="button" role="tab" key={item.key} aria-selected={item.key === category.key} className={`${item.key === category.key ? "selected" : ""}${item.kind === "erp" ? " erp" : ""}`} onClick={() => selectCategory(item.key)}>
        <span className="customer-category-top"><b>{item.label}</b>{item.kind === "erp" && <Plug size={14} />}</span>
        <strong>{percent(item.sites, payments.length)}%</strong>
        <i><em style={{ width: `${percent(item.sites, payments.length)}%` }} /></i>
        <small>{item.sites} сайт · {item.top ? item.top.label : "ашиглаагүй"}</small>
      </button>)}</div>
    </section>

    <div className="customer-payment-detail">
      <section className="dev-panel customer-panel" aria-labelledby="customer-provider-title">
        <header><div><span className="all-project-section-kicker">STEP 2 · PROVIDER</span><h2 id="customer-provider-title">{category.label}</h2><p>Хэрэгсэл дээр дарж ашигладаг сайтуудыг шүүнэ</p></div></header>
        <div className="customer-provider-list">{category.providers.map(item => <button type="button" key={item.key} disabled={!item.sites} aria-pressed={item.key === provider?.key} className={item.key === provider?.key ? "selected" : ""} onClick={() => selectProvider(item.key)}>
          <span>{item.label}</span>
          <i><em style={{ width: `${item.sites / maxProvider * 100}%` }} /></i>
          <strong>{item.sites}</strong>
        </button>)}</div>
      </section>

      <section className="dev-panel customer-panel" aria-labelledby="customer-payment-sites-title">
        <header><div><span className="all-project-section-kicker">STEP 3 · SITES</span><h2 id="customer-payment-sites-title">{provider ? provider.label : category.label} · {matching.length} сайт</h2><p>{provider ? "Сонгосон хэрэгслийг ашигладаг" : "Ангиллын аль нэг хэрэгслийг ашигладаг"} · мөр дээр дарж дэлгэрэнгүйг харна</p></div>{provider && <button type="button" className="customer-clear-chip" onClick={clearProvider}>Бүх {category.label}</button>}</header>
        <div className="customer-payment-sites">{matching.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(payment => {
          const inCategory = payment.methods.filter(method => categoryOf(method) === category.key).length;
          return <button type="button" key={payment.id} onClick={() => openPayment(payment.id)}>
            <span className="customer-site-icon"><Globe2 size={15} /></span>
            <span className="customer-payment-site-copy"><strong>{paymentLabel(payment)}</strong><small>{payment.site ? payment.site.company : <em>Site info-д бүртгэлгүй</em>}</small></span>
            <StatusChip status={paymentStatus(payment)} />
            <span className="customer-cell-owner">{payment.site?.specialist ? <><i>{initials(payment.site.specialist)}</i>{payment.site.specialist}</> : <em>—</em>}</span>
            <span className="customer-payment-count" title={`${category.label}: ${inCategory} хэрэгсэл · нийт ${paymentMethodCount(CATEGORIES, payment)}`}><b>{inCategory}</b><small>/ {paymentMethodCount(CATEGORIES, payment)} нийт</small></span>
          </button>;
        })}{!matching.length && <p className="dev-no-results">Энэ ангиллын хэрэгсэл ашигладаг сайт алга.</p>}</div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={matching.length} onChange={setPage} label="Төлбөрийн сайтууд" />
      </section>
    </div>
    {drawer}
  </CustomerFileShell>;
}
