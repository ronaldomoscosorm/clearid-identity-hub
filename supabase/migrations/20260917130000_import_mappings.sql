-- Mapeamentos de importação salvos, por cliente (profile). Cada mapeamento tem
-- uma descrição (ex.: "Importação Employer", "Importação Colaborador"), o
-- de→para coluna→campo (jsonb) e um tipo de trabalhador padrão (usado quando a
-- planilha não traz o tipo).
create table if not exists public.import_mappings (
  id                     uuid primary key default gen_random_uuid(),
  profile                text not null,
  name                   text not null,                 -- descrição do mapeamento
  mapping                jsonb not null default '{}'::jsonb, -- { coluna: alvo }
  default_worker_type_id uuid references public.worker_types(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Uma descrição única por cliente.
create unique index if not exists import_mappings_profile_name
  on public.import_mappings (profile, lower(name));

create index if not exists import_mappings_profile_idx
  on public.import_mappings (profile);

alter table public.import_mappings enable row level security;

drop policy if exists "import_mappings_select_all" on public.import_mappings;
create policy "import_mappings_select_all" on public.import_mappings
  for select to authenticated using (true);

drop policy if exists "import_mappings_write_all" on public.import_mappings;
create policy "import_mappings_write_all" on public.import_mappings
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
