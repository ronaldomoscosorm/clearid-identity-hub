// Defaults amarrados ao USUÁRIO REAL do ClearID (username de /api/auth/me) e ao
// CLIENTE. Como o Supabase usa uma sessão técnica compartilhada, a chave é o
// `user_key` (username), não auth.uid(). Isolamento é lógico (o app sempre
// filtra pelo usuário logado); RLS fica aberto (padrão do projeto).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UserClientDefaults {
  defaultSiteId: string | null;
  defaultSiteName: string | null;
  defaultRuleId: string | null;
  defaultRuleName: string | null;
  systemObjectId: string | null;
}

const EMPTY: UserClientDefaults = {
  defaultSiteId: null,
  defaultSiteName: null,
  defaultRuleId: null,
  defaultRuleName: null,
  systemObjectId: null,
};

/** Defaults do usuário logado NAQUELE cliente (site/regra/system). */
export function useUserClientDefaults(userKey: string | undefined, profile: string) {
  return useQuery({
    queryKey: ["user-client-defaults", userKey ?? "", profile],
    enabled: !!userKey && !!profile,
    queryFn: async (): Promise<UserClientDefaults> => {
      const { data, error } = await supabase
        .from("user_client_defaults")
        .select(
          "default_site_id,default_site_name,default_rule_id,default_rule_name,system_object_id",
        )
        .eq("user_key", userKey!)
        .eq("profile", profile)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return EMPTY;
      return {
        defaultSiteId: data.default_site_id ?? null,
        defaultSiteName: data.default_site_name ?? null,
        defaultRuleId: data.default_rule_id ?? null,
        defaultRuleName: data.default_rule_name ?? null,
        systemObjectId: data.system_object_id ?? null,
      };
    },
  });
}

/** Salva (upsert) os defaults do usuário logado naquele cliente. */
export function useUpdateUserClientDefaults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      userKey: string;
      profile: string;
      defaults: UserClientDefaults;
    }) => {
      const { error } = await supabase.from("user_client_defaults").upsert(
        {
          user_key: input.userKey,
          profile: input.profile,
          default_site_id: input.defaults.defaultSiteId,
          default_site_name: input.defaults.defaultSiteName,
          default_rule_id: input.defaults.defaultRuleId,
          default_rule_name: input.defaults.defaultRuleName,
          system_object_id: input.defaults.systemObjectId,
        },
        { onConflict: "user_key,profile" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({
        queryKey: ["user-client-defaults", vars.userKey, vars.profile],
      });
    },
  });
}

/** Cliente padrão do usuário logado (onde ele aterrissa ao logar). */
export function useUserDefaultProfile(userKey: string | undefined) {
  return useQuery({
    queryKey: ["user-defaults", userKey ?? ""],
    enabled: !!userKey,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("user_defaults")
        .select("default_profile")
        .eq("user_key", userKey!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.default_profile ?? null;
    },
  });
}

/** Salva (upsert) o cliente padrão do usuário logado. */
export function useUpdateUserDefaultProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userKey: string; defaultProfile: string }) => {
      const { error } = await supabase.from("user_defaults").upsert(
        { user_key: input.userKey, default_profile: input.defaultProfile },
        { onConflict: "user_key" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["user-defaults", vars.userKey] });
    },
  });
}
