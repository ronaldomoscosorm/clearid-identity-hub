// Status de conexão com o Supabase (projeto ativo + saúde + contagem das tabelas).
// Usado no Diagnóstico. As contagens respeitam o RLS do usuário autenticado.
import { supabase } from "@/integrations/supabase/client";

const DOMAIN_TABLES = [
  "identities",
  "companies",
  "custom_field_definitions",
  "site_custom_fields",
  "identity_custom_fields",
  "company_custom_fields",
  "identity_field_labels",
  "settings",
] as const;

export type TableCount = { table: string; count: number | null };

export type SupabaseStatus = {
  projectId: string;
  url: string;
  reachable: boolean;
  authenticated: boolean;
  tables: TableCount[];
  error?: string;
};

export async function getSupabaseStatus(): Promise<SupabaseStatus> {
  const projectId =
    (import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined) ?? "—";
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "—";

  const { data: userData } = await supabase.auth.getUser();
  const authenticated = Boolean(userData.user?.id);

  const results = await Promise.all(
    DOMAIN_TABLES.map(async (table): Promise<TableCount> => {
      const { count, error } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true });
      return { table, count: error ? null : (count ?? 0) };
    }),
  );

  const reachable = results.some((r) => r.count !== null);
  const firstError = results.find((r) => r.count === null);

  return {
    projectId,
    url,
    reachable,
    authenticated,
    tables: results,
    error: reachable ? undefined : firstError ? "Falha ao consultar as tabelas" : undefined,
  };
}
