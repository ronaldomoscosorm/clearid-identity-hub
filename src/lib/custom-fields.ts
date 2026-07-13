// Helpers compartilhados para campos personalizados (tipo, multilíngue, opções).
import type { Json } from "@/integrations/supabase/types";

export type FieldKind = "number" | "date" | "list" | "boolean" | "text";

/** Classifica o tipo do campo (ClearID) em uma categoria de UI. */
export function typeOf(t?: string | null): FieldKind {
  const s = (t ?? "").toLowerCase();
  if (/(bool|boolean|switch|toggle|checkbox)/.test(s)) return "boolean";
  if (/(number|numeric|int|decimal|float)/.test(s)) return "number";
  if (/date|time/.test(s)) return "date";
  if (/(list|enum|option|select)/.test(s)) return "list";
  return "text";
}

/** Interpreta um valor string como booleano (formato do ClearID). */
export function isTruthy(v: string | null | undefined): boolean {
  return ["true", "1", "yes", "sim"].includes((v ?? "").trim().toLowerCase());
}

/** Resolve um texto multilíngue jsonb pelo idioma, com fallback para "default". */
export function pickLang(v: Json | null | undefined, lang = "pt-BR"): string {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return String(o[lang] ?? o["default"] ?? "");
}

/** Extrai as opções de um value_range de campo tipo lista. */
export function optionsOf(v: Json | null | undefined): string[] {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return Array.isArray(o.options) ? (o.options as unknown[]).map(String) : [];
}
