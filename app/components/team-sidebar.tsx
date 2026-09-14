"use client";

import Link from "next/link";
import { X } from "lucide-react";

type SidebarPage = "master" | "all-project";

export default function TeamSidebar({
  page = "master",
  open,
  onClose,
}: {
  page?: SidebarPage;
  open: boolean;
  onClose: () => void;
}) {
  return <>
    <aside className={`sidebar team-sidebar ${open ? "mobile-open" : ""}`} aria-label="Баг сонгох">
      <div className="brand"><span className="brand-logo-wrap"><img className="brand-logo" src="/cody-logo.svg" alt="Cody" width="151" height="59" /></span><button className="team-menu-close" aria-label="Цэс хаах" onClick={onClose}><X size={20} /></button></div>
      <nav className="nav-list" aria-label="Багууд">
        <span className="team-nav-label">БАГУУД</span>
        <section className="sidebar-section active" aria-labelledby="cx-section-title">
          <h2 className="sidebar-section-title" id="cx-section-title">CX</h2>
          <div className="sidebar-subnav">
            <Link href="/" className={`nav-item ${page === "master" ? "active" : ""}`} aria-current={page === "master" ? "page" : undefined} onClick={onClose}>CX.Master</Link>
            <Link href="/clickup" className={`nav-item ${page === "all-project" ? "active" : ""}`} aria-current={page === "all-project" ? "page" : undefined} onClick={onClose}>CX.All project</Link>
          </div>
        </section>
        <section className="sidebar-section sidebar-section-empty" aria-labelledby="dev-section-title">
          <h2 className="sidebar-section-title" id="dev-section-title">Dev</h2>
        </section>
      </nav>
      <div className="sidebar-footer">Cody · Ажлын тайлан</div>
    </aside>
    {open && <button className="menu-backdrop" onClick={onClose} aria-label="Цэс хаах" />}
  </>;
}
