"use client";

import { AlertTriangle, Check, Copy, Mail, Phone } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { contactIssues, contactRole, contactRoleMeta, type LinkedContact } from "../../lib/customer-file";

// Given name initial: "М.Цэрэнжаргал" → "Ц", so the avatar shows the person rather than the father's-name prefix.
const personInitial = (name: string | null) => (name?.split(/[.\s]+/).filter(Boolean).at(-1) ?? "").slice(0, 1).toLocaleUpperCase("mn-MN") || "?";
const telHref = (number: string) => `tel:${number.replace(/\D/g, "")}`;

// The async Clipboard API refuses when the document isn't focused (or outside a secure context); the selection-based
// copy still works there.
function copyWithSelection(text: string) {
  const area = Object.assign(document.createElement("textarea"), { value: text, readOnly: true });
  area.style.cssText = "position:fixed;top:0;left:0;opacity:0";
  document.body.append(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  return ok;
}

export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (text: string, key: string) => {
    const ok = await navigator.clipboard?.writeText(text).then(() => true, () => false) || copyWithSelection(text);
    setCopied(ok ? key : `error:${key}`);
    window.setTimeout(() => setCopied(current => current?.endsWith(key) ? null : current), 1800);
  };
  return [copied, copy] as const;
}

export function ContactRow({ contact, copied, onCopy, compact = false }: { contact: LinkedContact; copied: string | null; onCopy: (text: string, key: string) => void; compact?: boolean }) {
  const role = contactRoleMeta(contactRole(contact.position));
  const issues = contactIssues(contact);
  return <li className={`customer-contact-row${compact ? " compact" : ""}`}>
    <span className="customer-contact-person">
      <i style={{ "--role-color": role.color } as CSSProperties}>{personInitial(contact.name)}</i>
      <span><b>{contact.name ?? <em>Нэр бүртгээгүй</em>}</b><small>{contact.position ?? "Албан тушаал тодорхойгүй"}</small></span>
    </span>
    {!compact && <span className="customer-contact-role" style={{ "--role-color": role.color } as CSSProperties}>{role.label}</span>}
    <span className="customer-contact-emails">{contact.emails.length ? contact.emails.map(email => email.valid
      ? <span key={email.address} className="customer-contact-email"><a href={`mailto:${email.address}`}><Mail size={13} />{email.address}</a><button type="button" className={`customer-copy-icon${copied === `${contact.id}:${email.address}` ? " done" : ""}`} onClick={() => onCopy(email.address, `${contact.id}:${email.address}`)} aria-label={`${email.address} хуулах`} title="Хуулах">{copied === `${contact.id}:${email.address}` ? <Check size={12} /> : <Copy size={12} />}</button></span>
      : <span key={email.address} className="customer-contact-email invalid" title="Имэйлийн хэлбэр буруу — хүснэгтэд засах шаардлагатай"><AlertTriangle size={13} />{email.address}</span>)
      : <em className="customer-contact-missing">Имэйлгүй</em>}</span>
    <span className="customer-contact-phones">{contact.phones.length ? contact.phones.map(phone => <span key={phone.number} className={`customer-contact-phone${phone.valid && !phone.note ? "" : " warn"}`} title={phone.note ?? (phone.valid ? undefined : `${phone.number.length} оронтой дугаар — шалгана уу`)}>
      {phone.valid ? <a href={telHref(phone.number)}><Phone size={13} />{phone.number}</a> : <><Phone size={13} />{phone.number}</>}
      {(phone.note || !phone.valid) && <AlertTriangle size={12} />}
    </span>) : <em className="customer-contact-missing">—</em>}</span>
    {issues.length > 0 && !compact && <span className="customer-contact-issues" title={issues.join("\n")}><AlertTriangle size={12} />{issues.length}</span>}
  </li>;
}

