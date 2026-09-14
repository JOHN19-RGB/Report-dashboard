"use client";

import { ArrowRight, Menu } from "lucide-react";
import TeamSidebar from "./team-sidebar";
import { useState } from "react";

export default function DevEmptyPage({ page }: { page: "master" | "all-project" }) {
  const [mobileMenu, setMobileMenu] = useState(false);
  const label = page === "master" ? "Dev.Master" : "Dev.All project";

  return <div className="app-shell">
    <TeamSidebar section="dev" page={page} open={mobileMenu} onClose={() => setMobileMenu(false)} />
    <main className="main-content">
      <header className="topbar">
        <div className="topbar-left">
          <button className="icon-button menu-button" onClick={() => setMobileMenu(true)} aria-label="Цэс нээх"><Menu size={20} /></button>
          <div className="breadcrumb"><span>Dev</span><ArrowRight size={14} /><strong>{label}</strong></div>
        </div>
      </header>
      <div className="content-wrap">
        <section className="hero">
          <div className="eyebrow"><span /> DEV TEAM</div>
          <h1>{label}<span>.</span></h1>
          <p>Dev багийн ажлын тайлангийн хэсэг.</p>
        </section>
        <section className="team-empty-state" aria-labelledby="dev-empty-title">
          <span className="panel-kicker">DEV TEAM</span>
          <h2 id="dev-empty-title">Одоогоор өгөгдөл алга</h2>
          <p>{label} хэсэгт тайлан болон төслийн мэдээлэл хараахан нэмэгдээгүй байна.</p>
          <span className="team-empty-badge">Өгөгдөл хүлээж байна</span>
        </section>
      </div>
    </main>
  </div>;
}
