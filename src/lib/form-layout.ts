// Layouts do formulário de identity: coleção de layouts NOMEADOS, cada um com
// grupos (seções) e ordem dos campos. Cada tipo de trabalhador pode ser
// vinculado a um layout; ao selecionar o tipo no cadastro, o formulário passa a
// usar o layout vinculado.
//
// Guardado em settings.preferences.formLayouts (jsonb já existente — sem alterar
// schema). O app usa um único usuário técnico, então a linha de settings é
// efetivamente global. Os apelidos (rótulos) continuam vindo de
// identity_field_labels; aqui definimos ONDE, EM QUE ORDEM e EM QUAL LAYOUT cada
// campo aparece.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { STANDARD_IDENTITY_FIELDS } from "./identity-labels";

export type FormLayoutGroup = { name: string; fields: string[] };
export type FormLayout = { id: string; name: string; groups: FormLayoutGroup[] };
export type FormLayoutConfig = {
  layouts: FormLayout[];
  links: Record<string, string>; // workerTypeId -> layoutId
};

const ALL_KEYS = STANDARD_IDENTITY_FIELDS.map((f) => f.key);
const ALL_SET = new Set(ALL_KEYS);
export const REQUIRED_KEYS = STANDARD_IDENTITY_FIELDS.filter((f) => f.required).map((f) => f.key);

/** Prefixo das chaves de campos customizáveis (ex.: "cf:Vylor_CPF"). */
export const CF_PREFIX = "cf:";
/** Aceita chaves padrão do catálogo ou campos customizáveis (cf:...). */
const isValidKey = (k: unknown): k is string =>
  typeof k === "string" && (ALL_SET.has(k) || k.startsWith(CF_PREFIX));

export const DEFAULT_LAYOUT_ID = "default";

/** Layout default: um único grupo com todos os campos padrão, na ordem do catálogo. */
export function defaultLayout(name = "Padrão"): FormLayout {
  return { id: DEFAULT_LAYOUT_ID, name, groups: [{ name: "", fields: [...ALL_KEYS] }] };
}

/** Normaliza os grupos de um layout: descarta chaves inválidas/duplicadas e garante os obrigatórios. */
function normalizeGroups(groups: unknown): FormLayoutGroup[] {
  const seen = new Set<string>();
  const out: FormLayoutGroup[] = [];
  if (Array.isArray(groups)) {
    for (const g of groups) {
      const src = g as Partial<FormLayoutGroup> | null;
      const fields: string[] = [];
      for (const k of Array.isArray(src?.fields) ? src!.fields : []) {
        if (!isValidKey(k) || seen.has(k)) continue;
        seen.add(k);
        fields.push(k);
      }
      out.push({ name: typeof src?.name === "string" ? src.name : "", fields });
    }
  }
  if (out.length === 0) out.push({ name: "", fields: [] });
  const missing = REQUIRED_KEYS.filter((k) => !seen.has(k));
  if (missing.length) out[0].fields.push(...missing);
  return out;
}

/** Normaliza a config completa: garante ao menos um layout e vínculos válidos. */
export function normalizeConfig(raw: unknown): FormLayoutConfig {
  const obj = (raw ?? {}) as { layouts?: unknown; links?: unknown };
  let layouts: FormLayout[] = [];
  if (Array.isArray(obj.layouts)) {
    layouts = obj.layouts.map((l, i) => {
      const src = l as Partial<FormLayout> | null;
      return {
        id: typeof src?.id === "string" && src.id ? src.id : `layout-${i}`,
        name: typeof src?.name === "string" ? src.name : "",
        groups: normalizeGroups(src?.groups),
      };
    });
  }
  if (layouts.length === 0) layouts = [defaultLayout()];
  const ids = new Set(layouts.map((l) => l.id));
  const links: Record<string, string> = {};
  const rawLinks = (obj.links ?? {}) as Record<string, unknown>;
  for (const [wt, lid] of Object.entries(rawLinks)) {
    if (typeof lid === "string" && ids.has(lid)) links[wt] = lid;
  }
  return { layouts, links };
}

/** Retorna o layout vinculado ao tipo de trabalhador, ou o primeiro (default). */
export function layoutForWorkerType(
  config: FormLayoutConfig,
  workerTypeId: string | null | undefined,
): FormLayout {
  if (workerTypeId) {
    const lid = config.links[workerTypeId];
    const found = lid ? config.layouts.find((l) => l.id === lid) : undefined;
    if (found) return found;
  }
  return config.layouts[0] ?? defaultLayout();
}

/** Chave do mapa de layouts por site dentro de preferences. */
const BY_SITE_KEY = "formLayoutsBySite";

/** Extrai o raw de layout para um site: por-site → legado global → formato antigo. */
function rawForSite(prefs: Record<string, unknown>, siteId: string | null | undefined): unknown {
  const bySite = (prefs[BY_SITE_KEY] ?? {}) as Record<string, unknown>;
  if (siteId && bySite[siteId]) return bySite[siteId];
  // Compatibilidade: layout global antigo (formLayouts) vale como padrão para
  // sites que ainda não têm layout próprio.
  if (prefs.formLayouts) return prefs.formLayouts;
  if (prefs.formLayout) {
    const fl = prefs.formLayout as { groups?: FormLayoutGroup[] };
    return { layouts: [{ id: DEFAULT_LAYOUT_ID, name: "Padrão", groups: fl.groups ?? [] }], links: {} };
  }
  return null;
}

async function fetchConfig(siteId: string | null | undefined): Promise<FormLayoutConfig> {
  const { data, error } = await supabase
    .from("settings")
    .select("preferences")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
  return normalizeConfig(rawForSite(prefs, siteId));
}

export function useFormLayoutConfig(siteId?: string | null) {
  // staleTime 0 + refetchOnMount garantem que o formulário sempre traga o layout
  // mais recente ao abrir, mesmo em navegação SPA logo após salvar no designer.
  const query = useQuery({
    queryKey: ["form-layout", siteId ?? null],
    queryFn: () => fetchConfig(siteId),
    staleTime: 0,
    refetchOnMount: "always",
  });
  return { config: query.data ?? normalizeConfig(null), loaded: query.isSuccess };
}

/** Lê as preferences atuais do usuário técnico (para gravação). */
async function loadPrefs(): Promise<{ userId: string; prefs: Record<string, unknown> }> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Sem usuário autenticado.");
  const { data: cur } = await supabase
    .from("settings")
    .select("preferences")
    .eq("user_id", userId)
    .maybeSingle();
  return { userId, prefs: { ...((cur?.preferences ?? {}) as Record<string, unknown>) } };
}

async function persistPrefs(userId: string, prefs: Record<string, unknown>): Promise<void> {
  const { error } = await supabase
    .from("settings")
    .upsert({ user_id: userId, preferences: prefs as unknown as Json }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

/** Persiste a config de layouts de UM SITE preservando as demais preferences. */
export async function saveFormLayoutConfig(
  siteId: string | null | undefined,
  config: FormLayoutConfig,
): Promise<void> {
  if (!siteId) throw new Error("Selecione um site para salvar o layout.");
  const { userId, prefs } = await loadPrefs();
  const bySite = { ...((prefs[BY_SITE_KEY] ?? {}) as Record<string, unknown>) };
  bySite[siteId] = config;
  prefs[BY_SITE_KEY] = bySite;
  delete prefs.formLayout; // remove o formato legado (documento único)
  await persistPrefs(userId, prefs);
}

/** Copia a config de layouts para outros sites (exportação entre sites). */
export async function exportFormLayoutToSites(
  config: FormLayoutConfig,
  targetSiteIds: string[],
): Promise<void> {
  const targets = targetSiteIds.filter(Boolean);
  if (targets.length === 0) return;
  const { userId, prefs } = await loadPrefs();
  const bySite = { ...((prefs[BY_SITE_KEY] ?? {}) as Record<string, unknown>) };
  for (const sid of targets) bySite[sid] = config;
  prefs[BY_SITE_KEY] = bySite;
  await persistPrefs(userId, prefs);
}
