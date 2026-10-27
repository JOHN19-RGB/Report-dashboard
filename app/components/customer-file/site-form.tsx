"use client";

import { ArrowLeft, Check, Globe2, LoaderCircle, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ACTIVITY_MAX,
  CUSTOMER_STATUSES,
  EDITABLE_STATUSES,
  GA_STATUSES,
  PACKAGES,
  SEGMENTS,
  distinctValues,
  parseSiteEditInput,
  type EditedSite,
  type GaStatus,
  type PaymentEdit,
  type SiteEditPayload,
  type SiteFormErrors,
} from "../../lib/customer-file";
import { CustomerFileShell, PAYMENT_DATA, StatusChip, initials, sitesHref, useCustomerData } from "./shared";

type FormSite = SiteEditPayload["site"];
const PROVIDER_KEYS = new Set(PAYMENT_DATA.categories.flatMap(category => category.providers.map(provider => provider.key)));
const OWNER_TYPES = ["Байгууллага", "Иргэн", "Гадны төсөл"];
const CLOSING_STATUSES = new Set(["Inactive", "Cancel"]);

const EMPTY_SITE: FormSite = {
  domain: "", company: "", taxId: null, status: "New", siteVersion: "Business Cody", package: null, segment: null,
  ownerType: "Байгууллага", businessModel: "B2C", type: "Online Store", group: null, industry: null, activity: null,
  specialist: null, invoiceSent: false, closeReason: null, ga: { code: null, status: null, newCode: null },
};
const EMPTY_PAYMENT: PaymentEdit = { methods: [], storeCredit: null, giftCard: null, wallet: null };

function pickSite(site: EditedSite): FormSite {
  const { domain, company, taxId, status, siteVersion, package: pack, segment, ownerType, businessModel, type, group, industry, activity, specialist, invoiceSent, closeReason, ga } = site;
  return { domain, company, taxId, status, siteVersion, package: pack, segment, ownerType, businessModel, type, group, industry, activity, specialist, invoiceSent, closeReason, ga: { ...ga } };
}

function Field({ label, hint, error, required, children, wide }: { label: string; hint?: string; error?: string; required?: boolean; children: ReactNode; wide?: boolean }) {
  return <label className={`customer-field${wide ? " wide" : ""}${error ? " invalid" : ""}`}>
    <span className="customer-field-label">{label}{required && <b aria-hidden="true">*</b>}</span>
    {children}
    {error ? <small className="customer-field-error" role="alert">{error}</small> : hint ? <small>{hint}</small> : null}
  </label>;
}

function Segmented<T extends string>({ label, value, options, onChange, allowEmpty }: { label: string; value: T | null; options: Array<[T, string]>; onChange: (value: T | null) => void; allowEmpty?: boolean }) {
  return <div className="customer-segmented" role="radiogroup" aria-label={label}>
    {options.map(([option, text]) => <button type="button" role="radio" key={option} aria-checked={value === option} onClick={() => onChange(allowEmpty && value === option ? null : option)}>{text}</button>)}
  </div>;
}

function FormSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="customer-form-section">
    <header><h2>{title}</h2><p>{description}</p></header>
    <div className="customer-form-grid">{children}</div>
  </section>;
}

// Shown instead of the form until this browser has entered the team passcode.
function EditUnlock() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    if (!passcode.trim()) { setError("Passcode оруулна уу."); return; }
    setBusy(true);
    const response = await fetch("/api/customer-sites/unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passcode }) }).catch(() => null);
    const result = await response?.json().catch(() => null);
    if (!response?.ok) { setBusy(false); setError(result?.error ?? "Холбогдож чадсангүй. Дахин оролдоно уу."); return; }
    router.refresh();
  }

  return <form className="customer-unlock" onSubmit={event => void unlock(event)} noValidate>
    <span className="customer-unlock-icon"><Lock size={20} /></span>
    <h2>Засварлах эрх шаардлагатай</h2>
    <p>Customer file-д сайт нэмэх, засах, устгахын тулд багийн passcode оруулна уу. Энэ хөтөч 30 хоног сануулна.</p>
    <label className={`customer-field${error ? " invalid" : ""}`}>
      <span className="customer-field-label">Passcode</span>
      <input type="password" value={passcode} onChange={event => { setPasscode(event.target.value); setError(null); }} autoComplete="current-password" autoFocus />
      {error && <small className="customer-field-error" role="alert">{error}</small>}
    </label>
    <button type="submit" className="customer-button primary" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={15} />Шалгаж байна</> : "Нээх"}</button>
  </form>;
}

async function lockEditing(router: ReturnType<typeof useRouter>) {
  await fetch("/api/customer-sites/unlock", { method: "DELETE" }).catch(() => null);
  router.refresh();
}

export default function CustomerSiteForm({ mode }: { mode: "new" | "edit" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { sites, payments, paymentsBySite, editsAvailable, editLocked, passcodeLock } = useCustomerData();
  const id = mode === "edit" ? searchParams.get("id") : null;
  const original = id ? sites.find(site => site.id === id) ?? null : null;

  const initial = useMemo(() => {
    if (original) {
      const payment = paymentsBySite.get(original.id);
      return { site: pickSite(original), payment: payment ? { methods: [...payment.methods], storeCredit: payment.storeCredit, giftCard: payment.giftCard, wallet: payment.wallet } : EMPTY_PAYMENT };
    }
    // "Сайт болгон нэмэх" from the payment page pre-fills the domain, company and known payment methods.
    const source = payments.find(payment => payment.id === searchParams.get("from"));
    return {
      site: { ...EMPTY_SITE, domain: searchParams.get("domain") ?? "", company: searchParams.get("company") ?? "" },
      payment: source ? { methods: [...source.methods], storeCredit: source.storeCredit, giftCard: source.giftCard, wallet: source.wallet } : EMPTY_PAYMENT,
    };
  }, [original, paymentsBySite, payments, searchParams]);

  const [site, setSite] = useState<FormSite>(initial.site);
  const [payment, setPayment] = useState<PaymentEdit>(initial.payment);
  const [errors, setErrors] = useState<SiteFormErrors>({});
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify({ site, payment }) !== JSON.stringify(initial);

  const suggestions = useMemo(() => ({
    specialists: distinctValues(sites, item => item.specialist),
    versions: distinctValues(sites, item => item.siteVersion),
    models: distinctValues(sites, item => item.businessModel),
    types: distinctValues(sites, item => item.type),
    groups: distinctValues(sites, item => item.group),
    industries: distinctValues(sites, item => item.industry),
  }), [sites]);

  useEffect(() => {
    if (!dirty || saving) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);

  const update = (patch: Partial<FormSite>) => { setSite(current => ({ ...current, ...patch })); setErrors({}); };
  const updateGa = (patch: Partial<FormSite["ga"]>) => update({ ga: { ...site.ga, ...patch } });
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => new Set(initial.payment.methods.length ? [] : ["qpay"]));
  const toggleCategory = (key: string) => setOpenCategories(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const toggleMethod = (key: string) => setPayment(current => ({ ...current, methods: current.methods.includes(key) ? current.methods.filter(item => item !== key) : [...current.methods, key] }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const body = { id: original?.id, site, payment };
    const local = parseSiteEditInput(body, PROVIDER_KEYS);
    if (!local.ok) { setErrors(local.errors); return; }
    setSaving(true);
    const response = await fetch("/api/customer-sites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const result = await response?.json().catch(() => null);
    if (!response?.ok) {
      setSaving(false);
      setErrors(result?.errors ?? { form: result?.error ?? "Хадгалж чадсангүй. Дахин оролдоно уу." });
      if (result?.locked) router.refresh();
      return;
    }
    // Navigating re-renders the server layout, which reloads the saved edits from the store.
    router.push(`${sitesHref({ search: local.value.site.domain ?? "" })}&saved=${encodeURIComponent(local.value.site.domain ?? "")}`);
  }

  if (mode === "edit" && !original) {
    return <CustomerFileShell page="sites" variant="form" title="Сайт олдсонгүй" description="Холбоос хуучирсан эсвэл сайт устгагдсан байж магадгүй.">
      <Link className="customer-form-back" href="/customer-file/sites"><ArrowLeft size={15} />Сайтууд руу буцах</Link>
    </CustomerFileShell>;
  }

  const methodCount = payment.methods.filter(key => !key.startsWith("erp:")).length;
  const title = mode === "new" ? "Шинэ сайт" : `${original!.domain ?? original!.company} засах`;

  return <CustomerFileShell page="sites" variant="form" title={title} description={mode === "new" ? "Customer file-д шинэ харилцагчийн сайт бүртгэх" : "Өөрчлөлт Site info-гийн импортыг дарж хадгалагдана · хүссэн үедээ анхны утга руу буцааж болно"}>
    {editLocked ? <EditUnlock /> : <>
    {!editsAvailable && <p className="customer-form-banner" role="alert">Өгөгдлийн сан холбогдоогүй байна. Өөрчлөлтийг хадгалах боломжгүй.</p>}
    <form className="customer-form" onSubmit={event => void submit(event)} noValidate>
      <div className="customer-form-main">
        <FormSection title="Үндсэн мэдээлэл" description="Сайтын домэйн болон гэрээ байгуулсан этгээд">
          <Field label="Домэйн" required error={errors.domain} hint="https:// болон www-гүйгээр">
            <input value={site.domain ?? ""} onChange={event => update({ domain: event.target.value })} placeholder="shop.mn" autoComplete="off" spellCheck={false} autoFocus={mode === "new"} />
          </Field>
          <Field label="Гэрээний компани" required error={errors.company}>
            <input value={site.company} onChange={event => update({ company: event.target.value })} placeholder="ЖИШЭЭ ХХК" />
          </Field>
          <Field label="ТТД" error={errors.taxId}>
            <input value={site.taxId ?? ""} onChange={event => update({ taxId: event.target.value || null })} inputMode="numeric" placeholder="1234567" />
          </Field>
          <Field label="Харилцагчийн төрөл">
            <Segmented label="Харилцагчийн төрөл" value={site.ownerType} options={OWNER_TYPES.map(value => [value, value])} onChange={ownerType => update({ ownerType })} />
          </Field>
        </FormSection>

        <FormSection title="Төлөв ба багц" description="Гэрээний төлөв, багц болон ангилал">
          <Field label="Төлөв" required error={errors.status} wide>
            <div className="customer-status-picker" role="radiogroup" aria-label="Төлөв">{EDITABLE_STATUSES.map(key => {
              const meta = CUSTOMER_STATUSES.find(status => status.key === key)!;
              return <button type="button" role="radio" key={key} aria-checked={site.status === key} style={{ "--status-color": meta.color } as React.CSSProperties} onClick={() => update({ status: key })}><i />{meta.label}</button>;
            })}</div>
          </Field>
          <Field label="Багц"><Segmented label="Багц" value={site.package} options={PACKAGES.map(value => [value, value])} onChange={value => update({ package: value })} allowEmpty /></Field>
          <Field label="Сегмент"><Segmented label="Сегмент" value={site.segment} options={SEGMENTS.map(value => [value, value])} onChange={segment => update({ segment })} allowEmpty /></Field>
          <Field label="Site version"><input list="customer-versions" value={site.siteVersion ?? ""} onChange={event => update({ siteVersion: event.target.value || null })} /></Field>
          <Field label="Бизнес модел"><input list="customer-models" value={site.businessModel ?? ""} onChange={event => update({ businessModel: event.target.value || null })} /></Field>
          <Field label="Төрөл"><input list="customer-types" value={site.type ?? ""} onChange={event => update({ type: event.target.value || null })} /></Field>
          <Field label="Бүлэг"><input list="customer-groups" value={site.group ?? ""} onChange={event => update({ group: event.target.value || null })} placeholder="Fashion" /></Field>
          <Field label="Салбар"><input list="customer-industries" value={site.industry ?? ""} onChange={event => update({ industry: event.target.value || null })} placeholder="Beauty" /></Field>
          {CLOSING_STATUSES.has(site.status) && <Field label="Түр зогсоох / хаах санал" wide><input value={site.closeReason ?? ""} onChange={event => update({ closeReason: event.target.value || null })} placeholder="Харилцагчийн санаачлагаар" /></Field>}
        </FormSection>

        <FormSection title="Хариуцагч ба идэвх" description="Account specialist, сайтын идэвх, нэхэмжлэх">
          <Field label="Account specialist" error={errors.specialist} hint={original?.specialist && site.specialist !== original.specialist ? `Өмнөх хариуцагч ${original.specialist} түүхэнд хадгалагдана` : "Жагсаалтаас сонгох эсвэл шинэ нэр бичих"}>
            <input list="customer-specialists" value={site.specialist ?? ""} onChange={event => update({ specialist: event.target.value || null })} placeholder="Хариуцагчгүй" />
          </Field>
          <Field label="Идэвх" error={errors.activity}>
            <div className="customer-activity-picker" role="radiogroup" aria-label="Идэвх">
              {Array.from({ length: ACTIVITY_MAX + 1 }, (_, value) => <button type="button" role="radio" key={value} aria-checked={site.activity === value} className={site.activity !== null && value <= site.activity ? "on" : ""} onClick={() => update({ activity: site.activity === value ? null : value })}>{value}</button>)}
            </div>
          </Field>
          <Field label="Нэхэмжлэх илгээгдэж байгаа эсэх" wide>
            <button type="button" role="switch" aria-checked={Boolean(site.invoiceSent)} className="customer-switch" onClick={() => update({ invoiceSent: !site.invoiceSent })}><i />{site.invoiceSent ? "Тийм, илгээгдэж байна" : "Үгүй"}</button>
          </Field>
        </FormSection>

        <FormSection title="Төлбөрийн хэрэгсэл" description="Сайт дээр холбогдсон төлбөр, хуваан төлөх, ERP">
          <div className="customer-method-groups">{PAYMENT_DATA.categories.map(category => {
            const selected = category.providers.filter(provider => payment.methods.includes(provider.key));
            const expanded = openCategories.has(category.key);
            return <div key={category.key} className={expanded ? "expanded" : ""}>
              <span>{category.label}{selected.length > 0 && <b>{selected.length}</b>}</span>
              <div>
                {(expanded ? category.providers : selected).map(provider => <button type="button" key={provider.key} aria-pressed={payment.methods.includes(provider.key)} className={category.kind === "erp" ? "erp" : ""} onClick={() => toggleMethod(provider.key)}>{payment.methods.includes(provider.key) && <Check size={12} />}{provider.label}</button>)}
                <button type="button" className="customer-method-more" aria-expanded={expanded} onClick={() => toggleCategory(category.key)}>{expanded ? "Хураах" : selected.length ? "Өөрчлөх" : "+ Нэмэх"}</button>
              </div>
            </div>;
          })}
            <div><span>Нэмэлт</span><div>{([["storeCredit", "Store credit"], ["giftCard", "Gift card"], ["wallet", "Wallet"]] as const).map(([key, label]) => <button type="button" key={key} aria-pressed={Boolean(payment[key])} onClick={() => setPayment(current => ({ ...current, [key]: !current[key] }))}>{payment[key] && <Check size={12} />}{label}</button>)}</div></div>
          </div>
          {errors.payment && <small className="customer-field-error" role="alert">{errors.payment}</small>}
        </FormSection>

        <FormSection title="Google Analytics" description="GA4 хэмжилтийн код ба шалгалтын үр дүн">
          <Field label="GA код" error={errors.gaCode}><input value={site.ga.code ?? ""} onChange={event => updateGa({ code: event.target.value || null })} placeholder="G-XXXXXXXXXX" spellCheck={false} /></Field>
          <Field label="Шалгалт">
            <select value={site.ga.status ?? ""} onChange={event => updateGa({ status: (event.target.value || null) as GaStatus | null })}>
              <option value="">Шалгаагүй</option>
              {(Object.keys(GA_STATUSES) as GaStatus[]).map(key => <option key={key} value={key}>{GA_STATUSES[key].label}</option>)}
            </select>
          </Field>
          {site.ga.status === "change" && <Field label="Шинэ GA код" error={errors.gaNewCode}><input value={site.ga.newCode ?? ""} onChange={event => updateGa({ newCode: event.target.value || null })} placeholder="G-XXXXXXXXXX" spellCheck={false} /></Field>}
        </FormSection>
      </div>

      <aside className="customer-form-preview" aria-label="Урьдчилан харах">
        <small>Урьдчилан харах</small>
        <div className="customer-preview-head"><span className="customer-site-icon"><Globe2 size={16} /></span><div><strong>{site.domain || "домэйн.mn"}</strong><span>{site.company || "Компанийн нэр"}</span></div></div>
        <div className="customer-preview-tags"><StatusChip status={site.status} />{site.package && <span className="customer-tag">{site.package}</span>}{site.segment && <span className="customer-tag">{site.segment}</span>}</div>
        <dl>
          <div><dt>Хариуцагч</dt><dd>{site.specialist ? <><i>{initials(site.specialist)}</i>{site.specialist}</> : "—"}</dd></div>
          <div><dt>Идэвх</dt><dd>{site.activity ?? "—"}{site.activity !== null && ` / ${ACTIVITY_MAX}`}</dd></div>
          <div><dt>Төлбөр</dt><dd>{methodCount} хэрэгсэл</dd></div>
          <div><dt>Нэхэмжлэх</dt><dd>{site.invoiceSent ? "Илгээгдэж байна" : "Үгүй"}</dd></div>
        </dl>
      </aside>

      <div className="customer-form-bar">
        {errors.form ? <span className="customer-field-error" role="alert">{errors.form}</span> : Object.keys(errors).length ? <span className="customer-field-error" role="alert">Улаанаар тэмдэглэсэн талбарыг засна уу</span> : <span>{dirty ? "Хадгалаагүй өөрчлөлт байна" : mode === "new" ? "Заавал бөглөх: домэйн, компани, төлөв" : "Өөрчлөлт алга"}</span>}
        <div>
          {passcodeLock && <button type="button" className="customer-button ghost customer-lock-button" onClick={() => void lockEditing(router)} title="Энэ хөтөч дээр засварлах эрхийг хаах"><Lock size={14} />Түгжих</button>}
          <Link href="/customer-file/sites" className="customer-button ghost">Цуцлах</Link>
          <button type="submit" className="customer-button primary" disabled={saving || !editsAvailable || (mode === "edit" && !dirty)}>{saving ? <><LoaderCircle className="spin" size={15} />Хадгалж байна</> : mode === "new" ? "Сайт нэмэх" : "Хадгалах"}</button>
        </div>
      </div>

      <datalist id="customer-specialists">{suggestions.specialists.map(value => <option key={value} value={value} />)}</datalist>
      <datalist id="customer-versions">{suggestions.versions.map(value => <option key={value} value={value} />)}</datalist>
      <datalist id="customer-models">{suggestions.models.map(value => <option key={value} value={value} />)}</datalist>
      <datalist id="customer-types">{suggestions.types.map(value => <option key={value} value={value} />)}</datalist>
      <datalist id="customer-groups">{suggestions.groups.map(value => <option key={value} value={value} />)}</datalist>
      <datalist id="customer-industries">{suggestions.industries.map(value => <option key={value} value={value} />)}</datalist>
    </form>
    </>}
  </CustomerFileShell>;
}
