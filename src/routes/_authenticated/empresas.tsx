import { createFileRoute, Outlet } from "@tanstack/react-router";

// Empresas: lista (index), cadastro (/nova) e edição (/$id) em páginas completas.
export const Route = createFileRoute("/_authenticated/empresas")({
  component: () => <Outlet />,
});
