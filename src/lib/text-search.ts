/** Normaliza para busca: minúsculas, sem acentos e sem espaços nas pontas. */
export function normalizeForSearch(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** true quando todos os termos da busca (separados por espaço) aparecem em algum dos campos. */
export function matchesSearch(query: string, ...fields: (string | null | undefined)[]): boolean {
  const terms = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = fields.map(normalizeForSearch).join(" ");
  return terms.every((term) => haystack.includes(term));
}
