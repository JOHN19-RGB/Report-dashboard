"use client";

import Link from "next/link";
import { X } from "lucide-react";

type SidebarPage = "master" | "all-project";

export default function TeamSidebar({
  section = "cx",
  page = "master",
  open,
  onClose,
}: {
  section?: "cx" | "dev";
  page?: SidebarPage;
  open: boolean;
  onClose: () => void;
}) {
  return <>
    <aside className={`sidebar team-sidebar ${open ? "mobile-open" : ""}`} aria-label="Баг сонгох">
      <div className="brand"><span className="brand-logo-wrap"><img className="brand-logo" src="/cody-logo.svg" alt="Cody" width="151" height="59" /></span><button className="team-menu-close" aria-label="Цэс хаах" onClick={onClose}><X size={20} /></button></div>
      <nav className="nav-list" aria-label="Багууд">
        <span className="team-nav-label">БАГУУД</span>
        <section className={`sidebar-section ${section === "cx" ? "active" : ""}`} aria-label="CX">
          <Link href="/" className="sidebar-section-title sidebar-section-link" aria-current={section === "cx" ? "page" : undefined} onClick={onClose}>CX</Link>
        </section>
        <section className={`sidebar-section ${section === "dev" ? "active" : ""}`} aria-labelledby="dev-section-title">
          <h2 className="sidebar-section-title" id="dev-section-title">Dev</h2>
          <div className="sidebar-subnav">
            <Link href="/dev/master" className={`nav-item ${section === "dev" && page === "master" ? "active" : ""}`} aria-current={section === "dev" && page === "master" ? "page" : undefined} onClick={onClose}>Dev.Master</Link>
            <Link href="/dev/all-project" className={`nav-item ${section === "dev" && page === "all-project" ? "active" : ""}`} aria-current={section === "dev" && page === "all-project" ? "page" : undefined} onClick={onClose}>Dev.All project</Link>
          </div>
        </section>
      </nav>
      <div className="sidebar-footer">Cody · Ажлын тайлан</div>
    </aside>
    {open && <button className="menu-backdrop" onClick={onClose} aria-label="Цэс хаах" />}
  </>;
}

export function CxReportNav({ active }: { active: "overview" | "tasks" }) {
  return <nav className="team-report-nav" aria-label="CX team тайлан">
    <Link href="/" className={active === "overview" ? "active" : ""} aria-current={active === "overview" ? "page" : undefined}>Гүйцэтгэлийн тайлан</Link>
    <Link href="/clickup" className={active === "tasks" ? "active" : ""} aria-current={active === "tasks" ? "page" : undefined}>ClickUp таск</Link>
  </nav>;
}
