import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  // Conexão com o Supabase feita nos bastidores: cria uma sessão anônima
  // (authenticated) sem exibir tela de login. Necessário para o RLS liberar
  // as tabelas. Requer 'Anonymous sign-ins' habilitado no projeto Supabase.
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) {
        console.error(
          "[auth] Não foi possível criar sessão anônima no Supabase. " +
            "Habilite 'Anonymous sign-ins' em Authentication → Providers. Detalhe:",
          error.message,
        );
      }
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
