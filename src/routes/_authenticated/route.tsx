import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/components/AuthGuard";
import { ensureTechnicalSession } from "@/lib/tech-auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Sessão técnica do Supabase (acesso a DADOS). A auth de USUÁRIO (Portal
    // Argus) é verificada no AuthGuard abaixo.
    await ensureTechnicalSession();
  },
  component: () => (
    <AuthGuard>
      <AppShell>
        <Outlet />
      </AppShell>
    </AuthGuard>
  ),
});
