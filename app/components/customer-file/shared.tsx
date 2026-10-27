"use client";

import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Menu, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import customerFile from "../../data/customer-file.json";
import customerPayments from "../../data/customer-payments.json";
import {
  ACTIVITY_MAX,
  applyPaymentEdits,
  applySiteEdits,
  customerFiltersQuery,
  customerStatus,
  linkPaymentRecords,
  paymentsBySite,
  type CustomerFileData,
  type CustomerFilters,
  type CustomerPaymentData,
  type EditedSite,
  type LinkedPayment,
  type SiteEditRecord,
} from "../../lib/customer-file";
import type { EditAccess } from "../../lib/customer-edit-access";
import TeamSidebar from "../team-sidebar";

export const DATA = customerFile as CustomerFileData;
export const PAYMENT_DATA = customerPayments as CustomerPaymentData;

// editLocked: saving needs the team passcode first; passcodeLock: a passcode is in use, so the editor can lock again.
export type CustomerData = { sites: EditedSite[]; payments: LinkedPayment[]; paymentsBySite: Map<string, LinkedPayment>; editsAvailable: boolean; editLocked: boolean; passcodeLock: boolean; passcodeMissing: boolean };

const CustomerDataContext = createContext<CustomerData | null>(null);

export function buildCustomerData(edits: SiteEditRecord[], editsAvailable: boolean, editAccess: EditAccess = "open"): CustomerData {
  const sites = applySiteEdits(DATA.sites, edits);
  const payments = applyPaymentEdits(linkPaymentRecords(sites, PAYMENT_DATA.records), sites, edits);
  return { sites, payments, paymentsBySite: paymentsBySite(payments), editsAvailable, editLocked: editsAvailable && editAccess === "locked", passcodeLock: editsAvailable && editAccess === "unlocked", passcodeMissing: editAccess === "disabled" };
}

export function CustomerDataProvider({ edits, editsAvailable, editAccess, children }: { edits: SiteEditRecord[]; editsAvailable: boolean; editAccess: EditAccess; children: ReactNode }) {
  const value = useMemo(() => buildCustomerData(edits, editsAvailable, editAccess), [edits, editsAvailable, editAccess]);
  return <CustomerDataContext.Provider value={value}>{children}</CustomerDataContext.Provider>;
}

export function useCustomerData() {
  const value = useContext(CustomerDataContext);
  if (!value) throw new Error("useCustomerData must be used inside CustomerDataProvider");
  return value;
}

export type CustomerFilePage = "overview" | "sites" | "payments";

const PAGES: Array<{ key: CustomerFilePage; href: string; label: string }> = [
  { key: "overview", href: "/customer-file", label: "Тойм" },
  { key: "sites", href: "/customer-file/sites", label: "Сайтууд" },
  { key: "payments", href: "/customer-file/payments", label: "Төлбөр" },
];

export const sitesHref = (patch: Partial<CustomerFilters> = {}) => {
  const query = customerFiltersQuery(patch);
  return query ? `/customer-file/sites?${query}` : "/customer-file/sites";
};
export const editSiteHref = (id: string) => `/customer-file/sites/edit?id=${encodeURIComponent(id)}`;
export const newSiteHref = (prefill: Record<string, string> = {}) => {
  const query = new URLSearchParams(prefill).toString();
  return query ? `/customer-file/sites/new?${query}` : "/customer-file/sites/new";
};
export const paymentsHref = (provider?: string) => provider ? `/customer-file/payments?provider=${encodeURIComponent(provider)}` : "/customer-file/payments";

// Page filters live in the query string so links, refreshes and shared URLs reproduce the same view.
// In-page edits use replaceState (no history spam, no server round trip). The hook reads location.search directly and
// re-renders synchronously, so controlled inputs never lag behind the router while someone is typing.
const queryListeners = new Set<() => void>();
const subscribeQuery = (listener: () => void) => { queryListeners.add(listener); return () => { queryListeners.delete(listener); }; };
const readQuery = () => window.location.search;

export function useQueryState() {
  const searchParams = useSearchParams(); // re-renders on router navigation (links, back/forward)
  const serverQuery = searchParams.toString();
  const query = useSyncExternalStore(subscribeQuery, readQuery, () => serverQuery);
  const params = useMemo(() => Object.fromEntries(new URLSearchParams(query).entries()), [query]);
  const update = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "" || value === "all") next.delete(key);
      else next.set(key, value);
    }
    const nextQuery = next.toString();
    // Next.js ignores replaceState calls that carry its own markers (__NA/_N), which left useSearchParams stale on
    // Vercel builds; drop them so the router records the new URL too.
    const state = { ...window.history.state } as Record<string, unknown>;
    delete state.__NA;
    delete state._N;
    window.history.replaceState(state, "", `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`);
    queryListeners.forEach(listener => listener());
  }, []);
  return [params, update] as const;
}

// Pagination that falls back to the first page whenever the list it belongs to changes.
export function usePageFor(listKey: string) {
  const [state, setState] = useState({ listKey, page: 0 });
  const page = state.listKey === listKey ? state.page : 0;
  return [page, (next: number) => setState({ listKey, page: next })] as const;
}

export function useDismiss<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) close(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open, close]);
  return ref;
}

// Formatted by hand: Node and browsers ship different mn-MN locale data, and Intl output caused hydration mismatches.
export function formatDate(value: string | null) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : "—";
}

export function initials(value: string | null) {
  return value ? value.replace(/\..*$/, "").slice(0, 2).toLocaleUpperCase("mn-MN") : "—";
}

export const percent = (part: number, total: number) => total ? Math.round(part / total * 100) : 0;

export function StatusChip({ status }: { status: string }) {
  const meta = customerStatus(status);
  return <span className="customer-status-chip" style={{ "--status-color": meta.color } as CSSProperties}><i />{meta.label}</span>;
}

export function ActivityMeter({ value }: { value: number | null }) {
  if (value === null) return <span className="customer-activity empty" aria-label="Идэвх бүртгээгүй">—</span>;
  return <span className="customer-activity" aria-label={`Идэвх ${value}/${ACTIVITY_MAX}`} title={`Идэвх ${value}/${ACTIVITY_MAX}`}>
    {Array.from({ length: ACTIVITY_MAX }, (_, index) => <i key={index} className={index < value ? "on" : ""} />)}
    <b>{value}</b>
  </span>;
}

export function SelectFilter({ label, value, onChange, options, icon }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]>; icon: ReactNode }) {
  return <label className={`dev-select-filter customer-select-filter${value !== "all" ? " active" : ""}`}>
    {icon}<span>{label}:</span>
    <select value={value} onChange={event => onChange(event.target.value)} aria-label={label}>
      <option value="all">Бүгд</option>
      {options.map(([optionValue, optionLabel]) => <option value={optionValue} key={optionValue}>{optionLabel}</option>)}
    </select>
  </label>;
}

export function Pagination({ page, pageSize, total, onChange, label }: { page: number; pageSize: number; total: number; onChange: (page: number) => void; label: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return <nav className="customer-pagination" aria-label={`${label} хуудаслалт`}>
    <span>{page * pageSize + 1}–{Math.min(total, (page + 1) * pageSize)} / {total}</span>
    <div>
      <button type="button" onClick={() => onChange(page - 1)} disabled={page === 0} aria-label="Өмнөх хуудас"><ChevronLeft size={15} /></button>
      <b>{page + 1} / {pages}</b>
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= pages - 1} aria-label="Дараагийн хуудас"><ChevronRight size={15} /></button>
    </div>
  </nav>;
}

// Sidebar, topbar and page frame live in the route layout so switching tabs only swaps the page body.
export function CustomerFileFrame({ children }: { children: ReactNode }) {
  const [mobileMenu, setMobileMenu] = useState(false);
  const pathname = usePathname();
  const formTitle = pathname.endsWith("/sites/new") ? "Шинэ сайт" : pathname.endsWith("/sites/edit") ? "Засах" : null;
  const current = formTitle ? PAGES[1] : [...PAGES].reverse().find(item => pathname.startsWith(item.href)) ?? PAGES[0];
  return <div className="app-shell dev-dashboard customer-file-dashboard">
    <TeamSidebar section="customers" open={mobileMenu} onClose={() => setMobileMenu(false)} />
    <main className="main-content">
      <header className="topbar"><div className="topbar-left"><button className="icon-button menu-button" onClick={() => setMobileMenu(true)} aria-label="Цэс нээх"><Menu size={20} /></button><div className="breadcrumb"><span>Customer file</span><ArrowRight size={14} />{formTitle ? <><Link href={current.href}>{current.label}</Link><ArrowRight size={14} /><strong>{formTitle}</strong></> : <strong>{current.label}</strong>}</div></div></header>
      <div className={`content-wrap dev-dashboard-wrap${formTitle ? " customer-form-wrap" : ""}`}>{children}</div>
    </main>
  </div>;
}

// Where the underline sat on the previous page, so the next page's tab bar glides it across instead of jumping.
let lastTabIndicator: { left: number; width: number } | null = null;

function CustomerTabs({ page }: { page: CustomerFilePage }) {
  const navRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  // The clicked tab lights up immediately; the page itself swaps in once the route is ready.
  const [pending, setPending] = useState<{ from: CustomerFilePage; to: CustomerFilePage } | null>(null);
  const active = pending?.from === page ? pending.to : page;

  useLayoutEffect(() => {
    const place = (animate: boolean) => {
      const link = navRef.current?.querySelector<HTMLElement>(`[data-tab="${active}"]`);
      const bar = barRef.current;
      if (!link || !bar) return;
      const target = { left: link.offsetLeft, width: link.offsetWidth };
      const from = animate && lastTabIndicator ? lastTabIndicator : target;
      bar.style.transition = "none";
      bar.style.width = `${from.width}px`;
      bar.style.transform = `translateX(${from.left}px)`;
      void bar.offsetWidth;
      bar.style.transition = "";
      bar.style.width = `${target.width}px`;
      bar.style.transform = `translateX(${target.left}px)`;
      lastTabIndicator = target;
    };
    place(true);
    const onResize = () => place(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active]);

  return <nav ref={navRef} className="customer-tabs" aria-label="Customer file хэсгүүд">
    {PAGES.map(item => <Link key={item.key} href={item.href} prefetch data-tab={item.key} className={item.key === active ? "active" : ""} aria-current={item.key === page ? "page" : undefined} onClick={event => {
      if (item.key !== page && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) setPending({ from: page, to: item.key });
    }}>{item.label}</Link>)}
    <span ref={barRef} className="customer-tabs-indicator" aria-hidden="true" />
  </nav>;
}

export function CustomerFileShell({ page, title, description, actions, variant = "page", children }: { page: CustomerFilePage; title: string; description: ReactNode; actions?: ReactNode; variant?: "page" | "form"; children: ReactNode }) {
  const { editsAvailable } = useCustomerData();
  const current = PAGES.find(item => item.key === page)!;
  return <>
    {variant === "form" && <Link className="customer-form-back" href={current.href}><ArrowLeft size={15} />{current.label}</Link>}
    <section className="hero dev-dashboard-hero customer-hero"><div className="eyebrow"><span /> CUSTOMER FILE</div><h1>{title}<span>.</span></h1><p>{description}</p></section>
    {variant === "page" && <div className="customer-page-bar">
      <CustomerTabs page={page} />
      <div className="customer-page-actions">{actions}{editsAvailable && <Link className="customer-button primary" href={newSiteHref()}><Plus size={15} />Шинэ сайт</Link>}</div>
    </div>}
    <div className="customer-page-body">{children}</div>
  </>;
}
