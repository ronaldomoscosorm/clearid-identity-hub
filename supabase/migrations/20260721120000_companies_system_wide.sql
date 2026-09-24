-- Empresas passam a ser por SISTEMA (não mais por site).
-- site_id vira opcional e a unicidade passa a ser por CNPJ (tax_id) global.
alter table public.companies alter column site_id drop not null;
alter table public.companies drop constraint if exists companies_site_id_tax_id_key;
create unique index if not exists companies_tax_id_unique
  on public.companies (tax_id) where tax_id is not null;
