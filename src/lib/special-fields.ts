// Campos customizáveis "especiais": dropdowns vinculados a campos do ClearID.
// O ClearID não tem tipo lista; guardamos as opções (value + label) na tabela
// special_custom_fields e, no cadastro, o campo vira um select que grava a
// string do `value` escolhido no campo do ClearID.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DropdownOption = { value: string; label: string; isDefault?: boolean };
export type SpecialField = {
  custom_field_name: string;
  label: string;
  options: DropdownOption[];
  /** Opção pré-selecionada em cadastros novos (value), quando configurada. */
  defaultValue: string | null;
};

export function parseOptions(raw: unknown): DropdownOption[] {
  if (!Array.isArray(raw)) return [];
  const out: DropdownOption[] = [];
  for (const o of raw) {
    const v = (o as Partial<DropdownOption>)?.value;
    const l = (o as Partial<DropdownOption>)?.label;
    if (typeof v === "string" && v)
      out.push({
        value: v,
        label: typeof l === "string" && l ? l : v,
        isDefault: (o as Partial<DropdownOption>)?.isDefault === true,
      });
  }
  return out;
}

async function fetchSpecialFields(): Promise<SpecialField[]> {
  const { data, error } = await supabase
    .from("special_custom_fields")
    .select("custom_field_name, label, options");
  // Tabela ainda não criada / sem acesso → simplesmente sem dropdowns especiais.
  if (error) return [];
  return (data ?? []).map((r) => {
    const options = parseOptions(r.options);
    return {
      custom_field_name: r.custom_field_name,
      label: r.label ?? "",
      options,
      defaultValue: options.find((o) => o.isDefault)?.value ?? null,
    };
  });
}

export function useSpecialFields() {
  const query = useQuery({
    queryKey: ["special-custom-fields"],
    queryFn: fetchSpecialFields,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const list = query.data ?? [];
  const byName = new Map(list.map((s) => [s.custom_field_name, s.options]));
  const labelByName = new Map(list.map((s) => [s.custom_field_name, s.label]));
  // Só os campos com opção padrão configurada.
  const defaultByName = new Map(
    list.filter((s) => s.defaultValue).map((s) => [s.custom_field_name, s.defaultValue as string]),
  );
  return { list, byName, labelByName, defaultByName, loaded: query.isSuccess };
}
