-- =====================================================================
-- Vincula o tipo de trabalhador ao CLIENTE (perfil ClearID).
--
-- Antes: worker_types era global (code UNIQUE em toda a tabela).
-- Agora: cada tipo pertence a um cliente (RM | Corteva | Vylor), a
-- unicidade de `code` passa a valer POR cliente, e as telas listam apenas
-- os tipos do cliente ativo.
--
-- Backfill: as linhas existentes (criadas no contexto RM) recebem 'RM'.
-- =====================================================================

alter table public.worker_types
  add column if not exists profile text not null default 'RM';

comment on column public.worker_types.profile is
  'Cliente (perfil ClearID: RM | Corteva | Vylor) dono deste tipo de trabalhador.';

-- Unicidade de `code` agora é por cliente (o mesmo code pode existir em
-- clientes diferentes).
alter table public.worker_types
  drop constraint if exists worker_types_code_key;
alter table public.worker_types
  add constraint worker_types_profile_code_key unique (profile, code);

create index if not exists worker_types_profile_idx
  on public.worker_types (profile);
