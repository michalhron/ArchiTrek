/** @param {import('n3').NamedNode|string} term */
export function termId(term) {
  if (typeof term === "string") return term;
  return term.id;
}

/** Last fragment after # or / */
export function localName(iri) {
  const h = iri.lastIndexOf("#");
  if (h >= 0) return iri.slice(h + 1);
  const s = iri.lastIndexOf("/");
  return s >= 0 ? iri.slice(s + 1) : iri;
}

export function relId() {
  return `rel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Escape CSV field */
export function csvEscape(s) {
  if (s == null) return "";
  const t = String(s);
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}
