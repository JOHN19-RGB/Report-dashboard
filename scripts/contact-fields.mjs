// Cell parsing for the "Customer file (Contacts info)" sheet, kept separate from the import script so it can be tested.

const EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
const EMAIL_LIKE = /\S+@\S+|\S+\.(?:mn|com|net|org)\b/gi;

export const clean = value => (value ?? "").replace(/\s+/g, " ").trim();

/** Emails from the email cell plus any that were typed into the phone cell; malformed ones are kept and flagged. */
export function parseEmails(emailCell, phoneCell = "") {
  const tokens = [
    ...clean(emailCell).split(/[\s,;]+/),
    ...(clean(phoneCell).match(/\S+@\S+/g) ?? []),
  ].map(token => token.replace(/^[<(]+|[>),.]+$/g, "")).filter(Boolean);
  const seen = new Set();
  return tokens.flatMap(address => {
    const key = address.toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ address, valid: EMAIL.test(address) }];
  });
}

/**
 * Numbers in a phone cell ("88105730, 95053348", "90999066| 99077019", "94811776 /ашиглалтанд байхгү/").
 * Mongolian numbers have 8 digits; other lengths are kept as typed and flagged. Words next to the numbers become a note.
 */
export function parsePhones(phoneCell) {
  const text = clean(phoneCell).replace(EMAIL_LIKE, " ");
  const numbers = text.match(/\d[\d-]*\d/g) ?? [];
  if (!numbers.length) return [];
  const note = clean((text.match(/\p{L}[\p{L}\s]*\p{L}/gu) ?? []).join(", ")) || null;
  return numbers.map(raw => {
    const digits = raw.replace(/\D/g, "");
    const valid = digits.length === 8;
    return { number: valid ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits, valid, note };
  });
}
