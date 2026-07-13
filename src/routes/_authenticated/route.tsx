import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ensureTechnicalSession } from "@/lib/tech-auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    await ensureTechnicalSession();
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
