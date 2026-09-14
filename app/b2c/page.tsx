"use client";

import { useState } from "react";
import { ArrowRight, Code2, Menu } from "lucide-react";
import TeamSidebar from "../components/team-sidebar";

export default function B2cPage() {
  const [mobileMenu, setMobileMenu] = useState(false);
  return <div className="app-shell">
    <TeamSidebar team="b2c" open={mobileMenu} onClose={() => setMobileMenu(false)} />
    <main className="main-content">
      <header className="topbar"><div className="topbar-left"><button className="icon-button menu-button" onClick={() => setMobileMenu(true)} aria-label="Цэс нээх"><Menu size={20} /></button><div className="breadcrumb"><span>B2C development team</span><ArrowRight size={14} /><strong>Тайлан</strong></div></div></header>
      <div className="content-wrap">
        <section className="hero"><div className="eyebrow"><span /> БАГИЙН ТАЙЛАН</div><h1 className="b2c-title">B2C development team<span>.</span></h1><p>Багийн ажлын гүйцэтгэл, тайлангийн хэсэг.</p></section>
        <section className="team-empty-state" aria-labelledby="b2c-empty-title"><span className="team-empty-icon"><Code2 size={34} /></span><span className="panel-kicker">B2C DEVELOPMENT TEAM</span><h2 id="b2c-empty-title">Одоогоор өгөгдөл алга</h2><p>Энэ багийн тайлан, ажлын мэдээлэл хараахан нэмэгдээгүй байна.</p><span className="team-empty-badge">Өгөгдөл хүлээж байна</span></section>
      </div>
    </main>
  </div>;
}
