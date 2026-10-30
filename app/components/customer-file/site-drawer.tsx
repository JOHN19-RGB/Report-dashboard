"use client";

import { BarChart3, Check, ChevronRight, Copy, CreditCard, ExternalLink, Gift, Globe2, Layers, Pencil, Plus, Trash2, Undo2, UsersRound, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GA_STATUSES, groupPaymentMethods, relatedCustomerSites, siteLabel, uniqueContactEmails, type CustomerSite, type EditedSite, type LinkedPayment } from "../../lib/customer-file";
import { ContactRow, useCopy } from "./contact-row";
import { ActivityMeter, PAYMENT_DATA, StatusChip, contactsHref, editSiteHref, formatDate, initials, newSiteHref, paymentsHref, sitesHref, useCustomerData } from "./shared";

export type DrawerTarget = { siteId: string } | { paymentId: string } | null;

export function useSiteDrawer() {
  const { sites, payments, paymentsBySite } = useCustomerData();
  const [target, setTarget] = useState<DrawerTarget>(null);
  const close = useCallback(() => setTarget(null), []);
  const site = target && "siteId" in target ? sites.find(item => item.id === target.siteId) ?? null : target && "paymentId" in target ? payments.find(item => item.id === target.paymentId)?.site ?? null : null;
  const payment = site ? paymentsBySite.get(site.id) ?? null : target && "paymentId" in target ? payments.find(item => item.id === target.paymentId) ?? null : null;
  // Portaled to <body> so no animated or overflow-clipped ancestor can trap the fixed drawer (it only opens on click, so
  // document is always available here).
  const drawer = site || payment ? createPortal(<div className="dev-dashboard customer-file-dashboard customer-drawer-layer"><SiteDrawer site={site} payment={payment} onClose={close} onOpenSite={siteId => setTarget({ siteId })} /></div>, document.body) : null;
  return { drawer, openSite: (siteId: string) => setTarget({ siteId }), openPayment: (paymentId: string) => setTarget({ paymentId }) };
}

function PaymentSection({ payment }: { payment: LinkedPayment | null }) {
  if (!payment) return <section className="customer-drawer-section"><h3>Төлбөрийн хэрэгсэл</h3><p className="customer-muted">Payment type хүснэгтэд энэ сайт бүртгэгдээгүй.</p></section>;
  const groups = groupPaymentMethods(PAYMENT_DATA.categories, payment.methods);
  const extras: Array<[string, boolean | null, typeof Gift]> = [["Store credit", payment.storeCredit, CreditCard], ["Gift card", payment.giftCard, Gift], ["Wallet", payment.wallet, Wallet]];
  return <section className="customer-drawer-section">
    <h3>Төлбөрийн хэрэгсэл</h3>
    {groups.length ? <div className="customer-payment-groups">{groups.map(group => <div key={group.key} className={group.kind === "erp" ? "erp" : ""}>
      <small>{group.label}</small>
      <div>{group.providers.map(provider => <Link key={provider.key} href={paymentsHref(provider.key)} title={`${provider.label} ашигладаг бусад сайт`}>{provider.label}</Link>)}</div>
    </div>)}</div> : <p className="customer-muted">Төлбөрийн хэрэгсэл тэмдэглээгүй байна.</p>}
    <div className="customer-extras">{extras.map(([label, value, Icon]) => <span key={label} className={value ? "on" : ""} title={value ? `${label} ашигладаг` : `${label} ашигладаггүй`}><Icon size={13} />{label}{value && <Check size={12} />}</span>)}</div>
  </section>;
}

function SiteDrawer({ site, payment, onClose, onOpenSite }: { site: EditedSite | null; payment: LinkedPayment | null; onClose: () => void; onOpenSite: (id: string) => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const domain = site?.domain ?? payment?.domain ?? null;
  const company = site?.company || payment?.company || "Компанийн нэр бүртгээгүй";
  const status = site?.status ?? payment?.status ?? "Unknown";

  return <>
    <button className="customer-drawer-backdrop" onClick={onClose} aria-label="Дэлгэрэнгүйг хаах" />
    <aside className="customer-drawer" role="dialog" aria-modal="true" aria-labelledby="customer-drawer-title">
      <header className="customer-drawer-head">
        <div className="customer-drawer-title">
          <span className="customer-site-icon large"><Globe2 size={20} /></span>
          <div>
            <small>{company}</small>
            <h2 id="customer-drawer-title">{site ? siteLabel(site) : domain}</h2>
            <div className="customer-drawer-tags"><StatusChip status={status} />{site?.taxId && <span className="customer-tag">ТТД {site.taxId}</span>}{domain && <a className="customer-tag link" href={`https://${domain.toLowerCase()}`} target="_blank" rel="noreferrer">Сайт нээх<ExternalLink size={11} /></a>}</div>
          </div>
        </div>
        <div className="customer-drawer-actions">
          {site && <Link className="customer-edit-button" href={editSiteHref(site.id)} onClick={onClose}><Pencil size={14} />Засах</Link>}
          <button className="icon-button customer-drawer-close" onClick={onClose} aria-label="Хаах"><X size={18} /></button>
        </div>
      </header>
      {site?.edit && <EditNotice site={site} onDone={onClose} />}

      <div className="customer-drawer-body" onClick={event => { if ((event.target as HTMLElement).closest("a[href^='/']")) onClose(); }}>
        {site ? <SiteSections site={site} payment={payment} onOpenSite={onOpenSite} /> : <>
          <div className="customer-drawer-warning"><p>Энэ сайт Site info хүснэгтэд бүртгэлгүй тул зөвхөн төлбөрийн мэдээллийг харуулж байна.</p>{payment && <Link href={newSiteHref({ domain: payment.domain, company: payment.company, from: payment.id })}><Plus size={14} />Сайт болгон нэмэх</Link>}</div>
          <PaymentSection payment={payment} />
        </>}
      </div>
    </aside>
  </>;
}

function EditNotice({ site, onDone }: { site: EditedSite; onDone: () => void }) {
  const router = useRouter();
  const { editsAvailable, editLocked } = useCustomerData();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edit = site.edit!;

  async function discard() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/customer-sites?id=${encodeURIComponent(site.id)}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      const result = await response?.json().catch(() => null);
      setError(result?.error ?? "Үйлдэл амжилтгүй боллоо. Дахин оролдоно уу.");
      if (result?.locked) router.refresh();
      return;
    }
    onDone();
    router.refresh();
  }

  return <div className={`customer-edit-notice${edit.isNew ? " new" : ""}`}>
    <span><Pencil size={13} />{edit.isNew ? "Гараар нэмсэн сайт" : "Гараар засварласан"} · {formatDate(edit.updatedAt.slice(0, 10))}{edit.updatedBy ? ` · ${edit.updatedBy}` : ""}</span>
    {editsAvailable && !editLocked && (confirming ? <span className="customer-confirm">
      {edit.isNew ? "Устгах уу?" : "Анхны утга руу буцаах уу?"}
      <button type="button" className="danger" disabled={busy} onClick={() => void discard()}>{busy ? "..." : "Тийм"}</button>
      <button type="button" disabled={busy} onClick={() => setConfirming(false)}>Үгүй</button>
    </span> : <button type="button" onClick={() => setConfirming(true)}>{edit.isNew ? <><Trash2 size={13} />Устгах</> : <><Undo2 size={13} />Анхны утга руу буцаах</>}</button>)}
    {error && <em role="alert">{error}</em>}
  </div>;
}

const DRAWER_CONTACTS = 4;

function ContactsSection({ site }: { site: CustomerSite }) {
  const { contactsBySite } = useCustomerData();
  const [copied, copy] = useCopy();
  const [expanded, setExpanded] = useState(false);
  const contacts = contactsBySite.get(site.id) ?? [];
  const emails = uniqueContactEmails(contacts);
  const visible = expanded ? contacts : contacts.slice(0, DRAWER_CONTACTS);
  return <section className="customer-drawer-section">
    <div className="customer-drawer-section-head">
      <h3>Холбоо барих{contacts.length > 0 && ` · ${contacts.length}`}</h3>
      {emails.length > 0 && <button type="button" className={`customer-copy-chip${copied === "drawer" ? " done" : ""}`} onClick={() => void copy(emails.join(", "), "drawer")} title="Энэ сайтын бүх имэйлийг хуулах">{copied === "drawer" ? <Check size={12} /> : <Copy size={12} />}{copied === "drawer" ? "Хуулсан" : `${emails.length} имэйл хуулах`}</button>}
    </div>
    {contacts.length ? <ul className="customer-contact-list">{visible.map(contact => <ContactRow key={contact.id} contact={contact} copied={copied} onCopy={(text, key) => void copy(text, key)} compact />)}</ul>
      : <p className="customer-muted">Contacts info хүснэгтэд энэ сайтын харилцагч бүртгэгдээгүй.</p>}
    {contacts.length > DRAWER_CONTACTS && <button type="button" className="customer-contact-more" aria-expanded={expanded} onClick={() => setExpanded(open => !open)}>{expanded ? "Хураах" : `Бүгдийг харах (${contacts.length})`}<ChevronRight size={13} style={{ transform: `rotate(${expanded ? -90 : 90}deg)` }} /></button>}
    {contacts.some(contact => contact.matchedBy === "company") && <p className="customer-note">Хүснэгтэд <b>{contacts.find(contact => contact.matchedBy === "company")!.domain}</b> гэж бичигдсэн тул компанийн нэрээр холбосон.</p>}
    {contacts.length > 0 && site.domain && <div className="customer-related-links"><Link href={contactsHref(site.domain)}><UsersRound size={14} />Холбоо барих хуудсанд харах</Link></div>}
  </section>;
}

function SiteSections({ site, payment, onOpenSite }: { site: CustomerSite; payment: LinkedPayment | null; onOpenSite: (id: string) => void }) {
  const { sites } = useCustomerData();
  const related = relatedCustomerSites(site, sites);
  const ga = site.ga.status ? GA_STATUSES[site.ga.status] : null;
  const timeline: Array<[string, string | null]> = [["Бүртгэсэн", site.dates.created], ["Тест сайт", site.dates.testSite], ["Launch", site.dates.launch], ["Хаагдсан", site.dates.closed]];
  const hasTimeline = timeline.some(([, value]) => value) || Boolean(site.closeReason);
  // Only show attributes the sheet actually fills in, so sparse rows stay short.
  const facts = ([
    ["Site version", site.siteVersion], ["Багц", site.package], ["Сегмент", site.segment], ["Plan", site.plan],
    ["Харилцагчийн төрөл", site.ownerType], ["Бизнес модел", site.businessModel], ["Төрөл", site.type], ["Бүлэг", site.group], ["Салбар", site.industry],
  ] as Array<[string, string | null]>).filter(([, value]) => value);

  return <>
    <section className="customer-drawer-section customer-drawer-owner">
      <div>
        <h3>Хариуцагч</h3>
        {site.specialist ? <Link className="customer-owner-card" href={sitesHref({ specialist: site.specialist })} title={`${site.specialist}-ийн хариуцсан бүх сайт`}>
          <i>{initials(site.specialist)}</i><span><b>{site.specialist}</b><small>{related.sameSpecialist + 1} сайт хариуцдаг</small></span><ChevronRight size={15} />
        </Link> : <p className="customer-muted">Account specialist бүртгээгүй.</p>}
        {site.specialistHistory.length > 1 && <ol className="customer-handover compact">{site.specialistHistory.map((name, index) => <li key={`${name}-${index}`} className={index === site.specialistHistory.length - 1 ? "current" : ""}><span>{name}</span></li>)}</ol>}
      </div>
      <div>
        <h3>Идэвх & нэхэмжлэх</h3>
        <div className="customer-mini-stat"><ActivityMeter value={site.activity} /></div>
        <div className={`customer-invoice ${site.invoiceSent ? "yes" : "no"}`}>{site.invoiceSent ? <Check size={13} /> : <X size={13} />}{site.invoiceSent ? "Нэхэмжлэх илгээгдэж байна" : "Нэхэмжлэх илгээгдээгүй"}</div>
      </div>
    </section>

    <ContactsSection site={site} />

    <PaymentSection payment={payment} />

    {facts.length > 0 && <section className="customer-drawer-section">
      <h3>Үндсэн мэдээлэл</h3>
      <dl className="customer-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </section>}

    {hasTimeline && <section className="customer-drawer-section">
      <h3>Сайтын мөчлөг</h3>
      <ol className="customer-timeline">{timeline.map(([label, value]) => <li key={label} className={value ? "done" : ""}><i /><span>{label}</span><time dateTime={value || undefined}>{formatDate(value)}</time></li>)}</ol>
      {site.closeReason && <p className="customer-note">Хаах санал: <b>{site.closeReason}</b></p>}
    </section>}

    <section className="customer-drawer-section">
      <h3>Google Analytics</h3>
      <div className="customer-ga-row">
        <code className="customer-ga-code">{site.ga.code || "Код бүртгээгүй"}</code>
        {ga && <span className={`customer-ga-status ${ga.tone}`}>{ga.label}</span>}
      </div>
      {site.ga.newCode && <p className="customer-note">Шинэ код: <code>{site.ga.newCode}</code></p>}
    </section>

    {(related.sameCompany.length > 0 || site.group || (site.segment && site.package)) && <section className="customer-drawer-section">
      <h3>Холбоотой</h3>
      {related.sameCompany.length > 0 && <div className="customer-related-sites">
        <small>{site.company} · бусад {related.sameCompany.length} сайт</small>
        {related.sameCompany.map(other => <button type="button" key={other.id} onClick={() => onOpenSite(other.id)}><Globe2 size={14} /><span>{siteLabel(other)}</span><StatusChip status={other.status} /><ChevronRight size={14} /></button>)}
      </div>}
      <div className="customer-related-links">
        {site.group && <Link href={sitesHref({ group: site.group })}><Layers size={14} />{site.group} бүлэг · {related.sameGroup + 1} сайт</Link>}
        {site.segment && site.package && <Link href={sitesHref({ segment: site.segment, package: site.package })}><BarChart3 size={14} />{site.segment} × {site.package}</Link>}
      </div>
    </section>}
  </>;
}
