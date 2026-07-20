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

/**
 * Catálogo dos campos padrão do formulário de identity, na ordem default.
 * `required` = obrigatório (não pode ser removido do formulário no designer).
 * As `key`s casam com identity_field_labels.field_key (apelido/visibilidade/ordem).
 */
export type StandardIdentityField = { key: string; required: boolean };
export const STANDARD_IDENTITY_FIELDS: StandardIdentityField[] = [
  { key: "company_worker_type_code", required: true },
  { key: "first_name", required: true },
  { key: "display_name", required: false },
  { key: "email", required: true },
  { key: "company_site_id", required: true },
  { key: "company_id", required: false },
  { key: "middle_name", required: false },
  { key: "description", required: false },
  { key: "country_code", required: false },
  { key: "culture", required: false },
  { key: "private_birthday", required: false },
  { key: "private_employee_number", required: false },
  { key: "private_secondary_email", required: false },
  { key: "private_city_of_residence", required: false },
  { key: "private_state_of_residence", required: false },
  { key: "private_zip_code", required: false },
  { key: "private_phone_primary", required: false },
  { key: "private_phone_secondary", required: false },
  { key: "company_name", required: false },
  { key: "company_job_title", required: false },
  { key: "company_department_name", required: false },
  { key: "company_supervisor_name", required: false },
];

const DEFAULT_INDEX = new Map(STANDARD_IDENTITY_FIELDS.map((f, i) => [f.key, i]));

export function useIdentityFieldLabels(lang = "pt-BR") {
  const query = useQuery({
    queryKey: ["identity-field-labels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("identity_field_labels")
        .select("field_key, alias, is_visible, display_order");
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

  /**
   * Visibilidade do campo. Sem apelido cadastrado → visível (mostra tudo).
   * Só oculta quando existe um apelido com is_visible = false.
   */
  const isVisible = (fieldKey: string): boolean => {
    const row = map.get(fieldKey);
    return row ? row.is_visible : true;
  };

  /** Posição do campo: display_order do banco, ou a ordem default do catálogo. */
  const orderOf = (fieldKey: string): number => {
    const row = map.get(fieldKey) as { display_order?: number | null } | undefined;
    if (row && row.display_order != null) return row.display_order;
    return DEFAULT_INDEX.get(fieldKey) ?? 999;
  };

  /** Ordena uma lista de field keys pela posição configurada. */
  const orderKeys = (keys: string[]): string[] =>
    [...keys].sort((a, b) => orderOf(a) - orderOf(b));

  return { alias, isVisible, orderOf, orderKeys, labels: query.data ?? [], loaded: query.isSuccess };
}
