// Helpers de seções de campos personalizados no Supabase e união com as
// seções vindas do Genetec ClearID (via /api/custom-fields/sections do backend
// .NET). O `storage` da seção segue o mesmo enum de custom_field_definitions:
// clearid | supabase | both.
import { supabase } from "@/integrations/supabase/client";
import type { CustomFieldSectionSummary } from "@/lib/argus-client";
import type { CustomFieldStorage } from "@/lib/client-settings";

export interface SupabaseSectionRow {
  id: string;
  sectionName: string;
  displayName: string;
  displayIndex: number;
  storage: CustomFieldStorage;
}

/** Lista seções gravadas no Supabase para um cliente. */
export async function listSupabaseSections(profile: string): Promise<SupabaseSectionRow[]> {
  const { data, error } = await supabase
    .from("custom_field_sections")
    .select("id, section_name, display_name, display_index, storage")
    .eq("profile", profile)
    .order("display_index", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    sectionName: r.section_name,
    displayName: r.display_name,
    displayIndex: r.display_index,
    storage: (r.storage as CustomFieldStorage) ?? "both",
  }));
}

export interface UpsertSectionInput {
  profile: string;
  sectionName: string;
  displayName: string;
  displayIndex: number;
  storage: CustomFieldStorage;
}

export async function upsertSupabaseSection(input: UpsertSectionInput): Promise<void> {
  const { error } = await supabase.from("custom_field_sections").upsert(
    {
      profile: input.profile,
      section_name: input.sectionName,
      display_name: input.displayName,
      display_index: input.displayIndex,
      storage: input.storage,
    },
    { onConflict: "profile,section_name" },
  );
  if (error) throw new Error(error.message);
}

export async function deleteSupabaseSection(
  profile: string,
  sectionName: string,
): Promise<void> {
  const { error } = await supabase
    .from("custom_field_sections")
    .delete()
    .eq("profile", profile)
    .eq("section_name", sectionName);
  if (error) throw new Error(error.message);
}

/**
 * Combina as seções do ClearID (via listCustomFieldSections) com as seções que
 * só existem no Supabase (storage='supabase'), deduplicando por sectionName.
 *
 * A intenção de storage vem da linha do Supabase quando presente; para seções
 * que só chegam do ClearID e não têm linha local, assume 'clearid'.
 */
export interface UnifiedSection extends CustomFieldSectionSummary {
  storage: CustomFieldStorage;
}

export function unifySections(
  clearIdSections: CustomFieldSectionSummary[],
  supaSections: SupabaseSectionRow[],
): UnifiedSection[] {
  const bySupaName = new Map(supaSections.map((s) => [s.sectionName, s]));
  const seen = new Set<string>();
  const out: UnifiedSection[] = [];

  for (const s of clearIdSections) {
    const supa = bySupaName.get(s.sectionName);
    out.push({ ...s, storage: supa?.storage ?? "clearid" });
    seen.add(s.sectionName);
  }
  for (const s of supaSections) {
    if (seen.has(s.sectionName)) continue;
    // Seção só no Supabase: sintetiza um summary vazio (sem fields do ClearID).
    out.push({
      sectionName: s.sectionName,
      displayName: s.displayName,
      index: s.displayIndex,
      eTag: null,
      fields: [],
      storage: s.storage,
    });
  }
  return out;
}
