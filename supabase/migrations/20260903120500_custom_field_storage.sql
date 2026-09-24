-- =====================================================================
-- Coluna `storage` em custom_field_definitions.
--
-- Determina onde a definição é materializada:
--   - 'clearid'  → só no PIAM (Genetec ClearID). Valor por identidade
--                  vive no ClearID (systemData.customFields).
--   - 'supabase' → só local. Valor vive em identity_custom_fields.
--   - 'both'     → criado no ClearID e espelhado no Supabase (default
--                  histórico, compatível com o que a UI faz hoje).
--
-- Anexo (attachment) e Dropdown-Especial (special_custom_fields) não têm
-- equivalente no ClearID e continuam sempre 'supabase' — a UI trava a
-- escolha nesses tipos.
-- =====================================================================

alter table public.custom_field_definitions
  add column if not exists storage text not null default 'both'
    check (storage in ('clearid','supabase','both'));

comment on column public.custom_field_definitions.storage is
  'Onde a definição é gravada: clearid | supabase | both. Anexo e dropdown-especial ficam sempre em supabase.';

create index if not exists cfd_storage_idx
  on public.custom_field_definitions (storage);
