-- =====================================================================
-- Tipo de trabalhador (worker_types) + vínculo em site_custom_fields
--
-- - worker_types: Empregado, Visitante, Terceiro (com mapeamento para o
--   workerTypeCode aceito pelo Argus: 'Terceiros' | 'Colaborador').
-- - site_custom_fields ganha worker_type_id: cada campo do site é associado
--   a um tipo de trabalhador. A unicidade passa a considerar o tipo, para o
--   mesmo campo poder valer em mais de um tipo.
-- =====================================================================

create table public.worker_types (
  id                      uuid primary key default gen_random_uuid(),
  code                    text not null unique,          -- interno: EMP | VIS | TER
  name                    text not null,                 -- rótulo exibido (pt-BR)
  argus_worker_type_code  text,                          -- mapeamento p/ Argus: Terceiros | Colaborador
  display_index           integer,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.worker_types is 'Tipos de trabalhador (com mapeamento para o workerTypeCode do Argus).';

create trigger worker_types_set_updated_at
  before update on public.worker_types
  for each row execute function public.set_updated_at();

alter table public.worker_types enable row level security;
create policy "wt_all" on public.worker_types for all to authenticated using (true) with check (true);

-- Seed inicial (mapeamento ajustável depois).
insert into public.worker_types (code, name, argus_worker_type_code, display_index) values
  ('EMP', 'Empregado', 'Colaborador', 1),
  ('VIS', 'Visitante',  'Terceiros',   2),
  ('TER', 'Terceiro',   'Terceiros',   3);

-- ---------------------------------------------------------------------
-- Vínculo em site_custom_fields
-- ---------------------------------------------------------------------
alter table public.site_custom_fields
  add column worker_type_id uuid references public.worker_types (id) on delete restrict;

-- Atribui um tipo padrão às linhas já existentes (o de menor ordem) antes de
-- tornar a coluna obrigatória.
update public.site_custom_fields
set worker_type_id = (select id from public.worker_types order by display_index, code limit 1)
where worker_type_id is null;

alter table public.site_custom_fields
  alter column worker_type_id set not null;

-- Unicidade agora inclui o tipo de trabalhador.
alter table public.site_custom_fields
  drop constraint if exists site_custom_fields_site_id_definition_id_key;
alter table public.site_custom_fields
  add constraint site_custom_fields_site_def_wt_key unique (site_id, definition_id, worker_type_id);

create index scf_worker_type_idx on public.site_custom_fields (worker_type_id);
