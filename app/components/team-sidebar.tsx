"use client";

import Link from "next/link";
import { X } from "lucide-react";

type SidebarPage = "master" | "all-project";

export default function TeamSidebar({
  team,
  page = "master",
  open,
  onClose,
}: {
  team: "cx" | "b2c";
  page?: SidebarPage;
  open: boolean;
  onClose: () => void;
}) {
  return <>
    <aside className={`sidebar team-sidebar ${open ? "mobile-open" : ""}`} aria-label="Баг сонгох">
      <div className="brand"><span className="brand-logo-wrap"><img className="brand-logo" src="/cody-logo.svg" alt="Cody" width="151" height="59" /></span><button className="team-menu-close" aria-label="Цэс хаах" onClick={onClose}><X size={20} /></button></div>
      <nav className="nav-list" aria-label="Багууд">
        <span className="team-nav-label">БАГУУД</span>
        <section className={`sidebar-section ${team === "cx" ? "active" : ""}`} aria-labelledby="dev-section-title">
          <h2 className="sidebar-section-title" id="dev-section-title">Dev</h2>
          <div className="sidebar-subnav">
            <Link href="/" className={`nav-item ${team === "cx" && page === "master" ? "active" : ""}`} aria-current={team === "cx" && page === "master" ? "page" : undefined} onClick={onClose}>Dev.Master</Link>
            <Link href="/clickup" className={`nav-item ${team === "cx" && page === "all-project" ? "active" : ""}`} aria-current={team === "cx" && page === "all-project" ? "page" : undefined} onClick={onClose}>Dev.All project</Link>
          </div>
        </section>
        <section className={`sidebar-section ${team === "b2c" ? "active" : ""}`} aria-labelledby="b2c-section-title">
          <h2 className="sidebar-section-title" id="b2c-section-title">B2C</h2>
          <div className="sidebar-subnav">
            <Link href="/b2c" className={`nav-item ${team === "b2c" ? "active" : ""}`} aria-current={team === "b2c" ? "page" : undefined} onClick={onClose}>B2C.Master</Link>
          </div>
        </section>
      </nav>
      <div className="sidebar-footer">Cody · Ажлын тайлан</div>
    </aside>
    {open && <button className="menu-backdrop" onClick={onClose} aria-label="Цэс хаах" />}
  </>;
}
