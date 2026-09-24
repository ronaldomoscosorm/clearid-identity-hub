import { supabase } from "@/integrations/supabase/client";

// Conexão com o Supabase feita nos bastidores por um usuário TÉCNICO (de serviço).
// Credenciais no .env (expostas no bundle por ser app frontend — use um usuário
// dedicado, restrito pelo RLS).
const APP_EMAIL = import.meta.env.VITE_SUPABASE_APP_EMAIL as string | undefined;
const APP_PASSWORD = import.meta.env.VITE_SUPABASE_APP_PASSWORD as string | undefined;

/** Garante uma sessão do usuário técnico. Retorna true se autenticado. */
export async function ensureTechnicalSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return true;

  if (!APP_EMAIL || !APP_PASSWORD) {
    console.error(
      "[auth] Usuário técnico não configurado. Defina VITE_SUPABASE_APP_EMAIL e " +
        "VITE_SUPABASE_APP_PASSWORD no .env (usuário criado no Supabase Auth).",
    );
    return false;
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: APP_EMAIL,
    password: APP_PASSWORD,
  });
  if (error) {
    console.error("[auth] Falha ao autenticar o usuário técnico do Supabase:", error.message);
    return false;
  }
  return true;
}
