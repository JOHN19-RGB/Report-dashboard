"use client";

import { LayoutGrid, List } from "lucide-react";
import { useState } from "react";
import { DEV_TEAM_ASSIGNEES, memberTaskDistribution, type DevMemberProductivity } from "../lib/dev-report";

const MEMBER_COLORS = ["#7468ff", "#35b5ec", "#ff9577", "#35c8ac", "#f3be48"];

function colorFor(name: string) {
  const index = DEV_TEAM_ASSIGNEES.findIndex(member => member.toLowerCase() === name.trim().toLowerCase());
  return MEMBER_COLORS[Math.max(0, index)];
}

function duration(value: number) {
  const minutes = Math.round(value / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes}m`;
}

function initials(name: string) {
  return name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join("");
}

function piePath(start: number, share: number) {
  const point = (percentage: number) => {
    const angle = (percentage / 100 * 360 - 90) * Math.PI / 180;
    return `${100 + 88 * Math.cos(angle)},${100 + 88 * Math.sin(angle)}`;
  };
  return `M100,100 L${point(start)} A88,88 0 ${share > 50 ? 1 : 0},1 ${point(start + share)} Z`;
}

export default function DevTeamProductivity({ team, taskCount, loading }: { team: DevMemberProductivity[]; taskCount: number; loading: boolean }) {
  const [view, setView] = useState<"list" | "card">("card");
  const [activeMember, setActiveMember] = useState<string | null>(null);
  const distribution = memberTaskDistribution(team);
  const active = distribution.members.find(member => member.id === activeMember);
  const pieMembers = distribution.members.map((member, index) => ({ ...member, start: distribution.members.slice(0, index).reduce((sum, previous) => sum + previous.share, 0) })).filter(member => member.totalTasks > 0);

  return <section className="dev-panel dev-table-panel dev-productivity-panel">
    <header><div><h2>Ажилчдын гүйцэтгэлийн тайлан</h2><p>{taskCount}</p></div><div className="dev-view-toggle" data-view={view} role="group" aria-label="Productivity харагдац"><button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={14} />List</button><button type="button" aria-pressed={view === "card"} onClick={() => setView("card")}><LayoutGrid size={14} />Card</button></div></header>
    {view === "list" ? <div className="dev-table-wrap"><table><thead><tr><th>Position</th><th>Ажилтан</th><th>Completion</th><th>Зарцуулсан хугацаа</th><th>Нийт таск</th><th>Гүйцэтгэсэн таск</th></tr></thead><tbody>{team.map(member => <tr key={member.id} data-member={member.id}><td><span className="dev-role-dot" />{member.position}</td><td>{member.name}</td><td>{member.completion}%</td><td>{duration(member.estimateMs)}</td><td><span className="dev-count total">{member.totalTasks}</span></td><td><span className={`dev-count done ${member.doneTasks === member.totalTasks && member.totalTasks ? "complete" : ""}`}>{member.doneTasks}</span></td></tr>)}</tbody></table></div> : <div className="dev-member-cards">{team.map(member => <article className="dev-member-card" key={member.id} data-member={member.id}>
      <div className="dev-member-identity"><span className="dev-member-avatar" style={{ color: colorFor(member.name), background: `${colorFor(member.name)}16` }} aria-hidden="true">{initials(member.name)}</span><div><h3>{member.name}</h3><span>{member.position}</span></div></div>
      <div className="dev-member-completion"><span>Completion</span><strong>{member.completion}%</strong><i><b style={{ width: `${member.completion}%`, background: colorFor(member.name) }} /></i></div>
      <dl><div><dt>Time Estimate</dt><dd>{duration(member.estimateMs)}</dd></div><div><dt>Total Tasks</dt><dd><span className="dev-count total">{member.totalTasks}</span></dd></div><div><dt>Done Tasks</dt><dd><span className={`dev-count done ${member.doneTasks === member.totalTasks && member.totalTasks ? "complete" : ""}`}>{member.doneTasks}</span></dd></div></dl>
    </article>)}</div>}
    {!team.length && !loading && <p className="dev-no-results">Тохирох assignee бүхий ажил олдсонгүй.</p>}
    <div className="dev-productivity-distribution">
      <div className="dev-distribution-heading"><h3>Total Tasks · Team Distribution</h3><p>Хүн бүрийн Total Tasks тоонд эзлэх хувь</p></div>
      <div className="dev-member-pie-layout">
        <div className="dev-member-pie-visual">
          <svg viewBox="0 0 200 200" className="dev-member-pie" role="group" aria-label="Таван ажилтны Total Tasks хуваарилалт">
            {!distribution.total && <circle cx="100" cy="100" r="88" fill="#edf0f6" />}
            {pieMembers.map(member => {
              const props = { fill: colorFor(member.name), "data-member": member.id, "data-count": member.totalTasks, "data-share": member.share, className: activeMember === member.id ? "active" : undefined, role: "button", tabIndex: 0, "aria-label": `${member.name}: ${member.totalTasks} tasks, ${member.share.toFixed(1)}%`, "aria-pressed": activeMember === member.id, onPointerEnter: () => setActiveMember(member.id), onPointerLeave: () => setActiveMember(null), onFocus: () => setActiveMember(member.id), onBlur: () => setActiveMember(null), onClick: () => setActiveMember(member.id), onKeyDown: (event: React.KeyboardEvent<SVGElement>) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActiveMember(member.id); } if (event.key === "Escape") setActiveMember(null); } };
              return member.share >= 100 ? <circle key={member.id} cx="100" cy="100" r="88" {...props}><title>{props["aria-label"]}</title></circle> : <path key={member.id} d={piePath(member.start, member.share)} {...props}><title>{props["aria-label"]}</title></path>;
            })}
          </svg>
          <div className="dev-pie-caption" aria-live="polite"><strong>{active ? active.totalTasks : distribution.total}</strong><span>{active ? `${active.name} · ${active.share.toFixed(1)}%` : "Нийт task хуваарилалт"}</span></div>
        </div>
        <div className="dev-member-pie-legend">{distribution.members.map(member => <button key={member.id} type="button" className={activeMember === member.id ? "active" : ""} onPointerEnter={() => setActiveMember(member.id)} onPointerLeave={() => setActiveMember(null)} onFocus={() => setActiveMember(member.id)} onBlur={() => setActiveMember(null)} onClick={() => setActiveMember(member.id)} aria-label={`${member.name}: ${member.totalTasks} tasks, ${member.share.toFixed(1)}%`}><i style={{ background: colorFor(member.name) }} /><span>{member.name}<small>{member.share.toFixed(1)}% of total tasks</small></span><b>{member.totalTasks}</b></button>)}</div>
      </div>
      <p className="dev-distribution-note">Нэг ажил олон ажилтантай бол хүн бүрийн Total Tasks-д тооцогдоно. Тиймээс хуваарилалтын нийлбэр ({distribution.total}) нь давхардалгүй ажлын тооноос ({taskCount}) ялгаатай байж болно.</p>
    </div>
  </section>;
}
