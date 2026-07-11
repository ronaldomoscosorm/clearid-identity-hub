// Apelidos multilíngues dos campos de identity (tabela identity_field_labels).
// Usado para relabelizar os campos no frontend conforme o idioma.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { pickLang } from "./custom-fields";

/** Chaves de campo sugeridas (para o editor de apelidos). */
export const IDENTITY_FIELD_KEYS = [
  "first_name",
  "last_name",
  "middle_name",
  "display_name",
  "email",
  "identity_type",
  "status",
  "description",
  "country_code",
  "culture",
  "company_name",
  "company_job_title",
  "company_department_name",
  "company_supervisor_name",
  "company_site_id",
  "company_worker_type_code",
  "private_birthday",
  "private_employee_number",
  "private_secondary_email",
  "private_phone_primary",
  "private_phone_secondary",
  "system_external_id",
] as const;

export function useIdentityFieldLabels(lang = "pt-BR") {
  const query = useQuery({
    queryKey: ["identity-field-labels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("identity_field_labels")
        .select("field_key, alias, is_visible");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const map = new Map((query.data ?? []).map((r) => [r.field_key, r]));

  /** Retorna o apelido do campo no idioma ativo, com fallback para o texto padrão. */
  const alias = (fieldKey: string, fallback: string): string => {
    const row = map.get(fieldKey);
    if (!row) return fallback;
    return pickLang(row.alias, lang) || fallback;
  };

  return { alias, labels: query.data ?? [] };
}
