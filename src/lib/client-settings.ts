import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CustomFieldStorage = "clearid" | "supabase" | "both";

export interface ClientSettings {
  profile: string;
  defaultCustomFieldStorage: CustomFieldStorage;
}

const DEFAULT_STORAGE: CustomFieldStorage = "both";

function rowToSettings(row: {
  profile: string;
  default_custom_field_storage: string | null;
}): ClientSettings {
  const raw = (row.default_custom_field_storage ?? DEFAULT_STORAGE) as CustomFieldStorage;
  const storage: CustomFieldStorage =
    raw === "clearid" || raw === "supabase" || raw === "both" ? raw : DEFAULT_STORAGE;
  return { profile: row.profile, defaultCustomFieldStorage: storage };
}

/**
 * Configurações do cliente (profile ClearID). Uma linha por cliente,
 * compartilhada entre todos os usuários daquele cliente. Se a linha
 * ainda não existe, retorna um objeto com defaults sem falhar.
 */
export function useClientSettings(profile: string) {
  return useQuery({
    queryKey: ["client-settings", profile],
    enabled: !!profile,
    queryFn: async (): Promise<ClientSettings> => {
      const { data, error } = await supabase
        .from("client_settings")
        .select("profile,default_custom_field_storage")
        .eq("profile", profile)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return { profile, defaultCustomFieldStorage: DEFAULT_STORAGE };
      return rowToSettings(data);
    },
  });
}

/** Salva (upsert) as configurações do cliente ativo. */
export function useUpdateClientSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      profile: string;
      defaultCustomFieldStorage: CustomFieldStorage;
    }) => {
      const { error } = await supabase
        .from("client_settings")
        .upsert(
          {
            profile: input.profile,
            default_custom_field_storage: input.defaultCustomFieldStorage,
          },
          { onConflict: "profile" },
        );
      if (error) throw new Error(error.message);
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["client-settings", vars.profile] });
    },
  });
}
