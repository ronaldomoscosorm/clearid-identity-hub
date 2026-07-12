// Sincronização das configurações (conexão Argus + branding) com o Supabase.
//
// O localStorage continua sendo a fonte síncrona lida por `getConfig()` dentro
// do `argusFetch`. Este módulo apenas:
//   - hidrata o localStorage a partir da tabela `settings` no login;
//   - envia (upsert) o estado local para o Supabase quando o usuário salva.
//
// Falhas de rede nunca quebram a UI — apenas logam e propagam quando o chamador
// quiser tratar.
import { supabase } from "@/integrations/supabase/client";
import { getConfig, saveConfig } from "./argus-env";
import { getBranding, saveBranding, applyBranding } from "./branding";
import {
  getDefaultSiteId,
  setDefaultSiteId,
  getSystemObjectId,
  setSystemObjectId,
  getAccountId,
  setAccountId,
} from "./argus-client";

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Envia o estado local (config + branding) para a tabela `settings`. */
export async function pushSettings(): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;

  const cfg = getConfig();
  const branding = getBranding();

  const row = {
    user_id: userId,
    argus_base_url: cfg.baseUrl,
    argus_api_key: cfg.apiKey || null,
    default_site_id: getDefaultSiteId() ?? cfg.defaultSiteId ?? null,
    default_site_name: cfg.defaultSiteName ?? null,
    default_rule_id: cfg.defaultRuleId ?? null,
    default_rule_name: cfg.defaultRuleName ?? null,
    system_object_id: getSystemObjectId() ?? null,
    account_id: getAccountId() ?? null,
    client_name: branding.clientName,
    client_logo: branding.clientLogo,
    primary_color: branding.primaryColor,
    accent_color: branding.accentColor,
  };

  const { error } = await supabase.from("settings").upsert(row, { onConflict: "user_id" });
  if (error) {
    console.error("[settings] falha ao salvar no Supabase:", error.message);
    throw error;
  }
}

/**
 * Carrega a linha de `settings` do usuário e popula o localStorage.
 * Usa os setters locais (não reenvia ao Supabase), evitando loop.
 */
export async function hydrateSettings(): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;

  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[settings] falha ao carregar do Supabase:", error.message);
    return;
  }
  if (!data) return;

  const cfg = getConfig();
  saveConfig({
    ...cfg,
    baseUrl: data.argus_base_url ?? cfg.baseUrl,
    apiKey: data.argus_api_key ?? "",
    defaultSiteId: data.default_site_id ?? undefined,
    defaultSiteName: data.default_site_name ?? undefined,
    defaultRuleId: data.default_rule_id ?? undefined,
    defaultRuleName: data.default_rule_name ?? undefined,
  });
  setDefaultSiteId(data.default_site_id ?? null);
  setSystemObjectId(data.system_object_id ?? null);
  setAccountId(data.account_id ?? null);

  const branding = {
    clientName: data.client_name ?? "",
    clientLogo: data.client_logo ?? "",
    primaryColor: data.primary_color ?? "#1e3a5f",
    accentColor: data.accent_color ?? "#3b6fa0",
  };
  saveBranding(branding);
  applyBranding(branding);
}
