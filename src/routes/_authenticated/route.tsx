import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";

// Conexão com o Supabase feita nos bastidores por um usuário TÉCNICO (de
// serviço). O app faz login automaticamente com credenciais do .env, sem tela
// de login. Necessário para o RLS liberar as tabelas.
//   VITE_SUPABASE_APP_EMAIL / VITE_SUPABASE_APP_PASSWORD
// Obs.: por ser app frontend, essas credenciais ficam expostas no bundle — use
// um usuário dedicado, sem privilégios além do necessário (RLS).
const APP_EMAIL = import.meta.env.VITE_SUPABASE_APP_EMAIL as string | undefined;
const APP_PASSWORD = import.meta.env.VITE_SUPABASE_APP_PASSWORD as string | undefined;

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return;

    if (!APP_EMAIL || !APP_PASSWORD) {
      console.error(
        "[auth] Usuário técnico não configurado. Defina VITE_SUPABASE_APP_EMAIL e " +
          "VITE_SUPABASE_APP_PASSWORD no .env (usuário criado no Supabase Auth).",
      );
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: APP_EMAIL,
      password: APP_PASSWORD,
    });
    if (error) {
      console.error("[auth] Falha ao autenticar o usuário técnico do Supabase:", error.message);
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
