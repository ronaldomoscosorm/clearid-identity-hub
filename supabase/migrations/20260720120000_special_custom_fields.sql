-- Campos customizáveis "especiais": dropdown para campos do ClearID.
-- O ClearID não tem tipo lista/dropdown; esta tabela define uma lista de opções
-- (value + label) e vincula a UM campo customizável do ClearID (String). No
-- cadastro, o campo passa a renderizar como select e grava no ClearID a string
-- do `value` escolhido. Opções globais (valem para todos os sites).
create table if not exists public.special_custom_fields (
  id                uuid primary key default gen_random_uuid(),
  custom_field_name text not null unique,                 -- custom_field_definitions.custom_field_name (armazenamento)
  label             text,                                 -- nome de identificação do dropdown
  options           jsonb not null default '[]'::jsonb,   -- [{ "value": "...", "label": "..." }]
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.special_custom_fields enable row level security;
create policy "spcf_all" on public.special_custom_fields
  for all to authenticated using (true) with check (true);
