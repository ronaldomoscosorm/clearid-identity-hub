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

/** Chave do mapa de layouts por CLIENTE (perfil ClearID) dentro de preferences. */
const BY_CLIENT_KEY = "formLayoutsByClient";
/** Chave legada: layouts por site (mantida só para migração/fallback de leitura). */
const BY_SITE_KEY = "formLayoutsBySite";
/**
 * Cliente dono dos layouts LEGADOS (por-site e global). Antes da separação por
 * cliente existia só o RM, então esses dados pertencem a ele — e SÓ ele os
 * herda. Os demais clientes começam do layout padrão.
 */
const LEGACY_PROFILE = "RM";

/**
 * Extrai o raw de layout para um cliente. Ordem: layout do cliente → (só para o
 * RM, compat.) layout do site-semente no formato antigo por-site → global antigo
 * → documento único. Outros clientes sem layout próprio começam do padrão.
 */
function rawForClient(
  prefs: Record<string, unknown>,
  profile: string | null | undefined,
  seedSiteId?: string | null,
): unknown {
  const byClient = (prefs[BY_CLIENT_KEY] ?? {}) as Record<string, unknown>;
  if (profile && byClient[profile]) return byClient[profile];
  // Só o cliente legado (RM) herda os layouts antigos (por-site/global). Assim,
  // trocar para Corteva/Vylor não mostra os layouts do RM.
  if (profile === LEGACY_PROFILE) {
    const bySite = (prefs[BY_SITE_KEY] ?? {}) as Record<string, unknown>;
    if (seedSiteId && bySite[seedSiteId]) return bySite[seedSiteId];
    if (prefs.formLayouts) return prefs.formLayouts;
    if (prefs.formLayout) {
      const fl = prefs.formLayout as { groups?: FormLayoutGroup[] };
      return { layouts: [{ id: DEFAULT_LAYOUT_ID, name: "Padrão", groups: fl.groups ?? [] }], links: {} };
    }
  }
  return null;
}

async function fetchConfig(
  profile: string | null | undefined,
  seedSiteId?: string | null,
): Promise<FormLayoutConfig> {
  // Lê a MESMA linha que saveFormLayoutConfig grava: a do usuário técnico
  // (auth.getUser). Antes usava `.limit(1)` sem user_id, o que pegava uma linha
  // arbitrária quando `settings` tinha mais de uma → o formulário abria com o
  // layout padrão em vez do configurado.
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  const { data, error } = await supabase
    .from("settings")
    .select("preferences")
    .eq("user_id", userId ?? "")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
  return normalizeConfig(rawForClient(prefs, profile, seedSiteId));
}

/**
 * Config de layout do CLIENTE (perfil). `seedSiteId` é usado apenas como
 * semente de compatibilidade quando o cliente ainda não tem layout próprio.
 */
export function useFormLayoutConfig(profile?: string | null, seedSiteId?: string | null) {
  // staleTime 0 + refetchOnMount garantem que o formulário sempre traga o layout
  // mais recente ao abrir, mesmo em navegação SPA logo após salvar no designer.
  const query = useQuery({
    queryKey: ["form-layout", profile ?? null],
    queryFn: () => fetchConfig(profile, seedSiteId),
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

/** Persiste a config de layout de UM CLIENTE preservando as demais preferences. */
export async function saveFormLayoutConfig(
  profile: string | null | undefined,
  config: FormLayoutConfig,
): Promise<void> {
  if (!profile) throw new Error("Cliente não definido para salvar o layout.");
  const { userId, prefs } = await loadPrefs();
  const byClient = { ...((prefs[BY_CLIENT_KEY] ?? {}) as Record<string, unknown>) };
  byClient[profile] = config;
  prefs[BY_CLIENT_KEY] = byClient;
  delete prefs.formLayout; // remove o formato legado (documento único)
  await persistPrefs(userId, prefs);
}

/** Copia a config de layout para outros clientes. */
export async function exportFormLayoutToClients(
  config: FormLayoutConfig,
  targetProfiles: string[],
): Promise<void> {
  const targets = targetProfiles.filter(Boolean);
  if (targets.length === 0) return;
  const { userId, prefs } = await loadPrefs();
  const byClient = { ...((prefs[BY_CLIENT_KEY] ?? {}) as Record<string, unknown>) };
  for (const p of targets) byClient[p] = config;
  prefs[BY_CLIENT_KEY] = byClient;
  await persistPrefs(userId, prefs);
}
