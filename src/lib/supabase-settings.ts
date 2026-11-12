// Sincronização da CONEXÃO Argus (URL/token/conta) com o Supabase.
//
// A tabela `settings` é chaveada pela sessão técnica do Supabase, que é a mesma
// para todos os usuários do app — portanto só guarda o que é global. O que é do
// usuário logado fica em tabelas chaveadas pelo username:
//   - site/regra/sistema/visitas → `user_client_defaults` (lib/user-defaults)
//   - cliente padrão             → `user_defaults`        (lib/user-defaults)
//   - identidade visual          → `user_branding`        (lib/branding)
//
// O localStorage continua sendo a fonte síncrona lida por `getConfig()` dentro
// do `argusFetch`. Falhas de rede nunca quebram a UI — apenas logam e propagam
// quando o chamador quiser tratar.
import { supabase } from "@/integrations/supabase/client";
import { getConfig, saveConfig } from "./argus-env";
import { saveBranding, applyBranding } from "./branding";
import { getAccountId, setAccountId } from "./argus-client";

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Envia a conexão local (URL/token/conta) para a tabela `settings`. */
export async function pushSettings(): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;

  const cfg = getConfig();
  const row = {
    user_id: userId,
    argus_base_url: cfg.baseUrl,
    argus_api_key: cfg.apiKey || null,
    account_id: getAccountId() ?? null,
  };

  const { error } = await supabase.from("settings").upsert(row, { onConflict: "user_id" });
  if (error) {
    console.error("[settings] falha ao salvar no Supabase:", error.message);
    throw error;
  }
}

/**
 * Carrega a conexão da tabela `settings` e popula o localStorage, preservando
 * os padrões do usuário que já estão no navegador.
 *
 * `includeBranding`: só para a página pública de foto (sem usuário logado),
 * que usa a identidade visual gravada na linha compartilhada.
 */
export async function hydrateSettings(opts?: { includeBranding?: boolean }): Promise<void> {
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
  });
  setAccountId(data.account_id ?? null);

  if (opts?.includeBranding) {
    const branding = {
      clientName: data.client_name ?? "",
      clientLogo: data.client_logo ?? "",
      primaryColor: data.primary_color ?? "#1e3a5f",
      accentColor: data.accent_color ?? "#3b6fa0",
    };
    saveBranding(branding);
    applyBranding(branding);
  }
}
