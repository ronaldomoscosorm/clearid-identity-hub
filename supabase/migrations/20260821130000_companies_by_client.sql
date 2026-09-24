-- =====================================================================
-- Vincula a EMPRESA ao CLIENTE (perfil ClearID).
--
-- Antes: companies era por sistema (CNPJ único global).
-- Agora: cada empresa pertence a um cliente (RM | Corteva | Vylor), a
-- unicidade do CNPJ (tax_id) passa a valer POR cliente, e as telas listam
-- apenas as empresas do cliente ativo.
--
-- Backfill: as linhas existentes (criadas no contexto RM) recebem 'RM'.
-- =====================================================================

alter table public.companies
  add column if not exists profile text not null default 'RM';

comment on column public.companies.profile is
  'Cliente (perfil ClearID: RM | Corteva | Vylor) dono desta empresa.';

-- Unicidade do CNPJ agora é por cliente (o mesmo CNPJ pode existir em
-- clientes diferentes).
drop index if exists public.companies_tax_id_unique;
create unique index if not exists companies_profile_tax_id_unique
  on public.companies (profile, tax_id) where tax_id is not null;

create index if not exists companies_profile_idx
  on public.companies (profile);
