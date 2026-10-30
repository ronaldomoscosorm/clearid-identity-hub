-- Regras de bloqueio por validade, por site do ClearID. Site sem linha (ou com
-- os dois desligados) não bloqueia ninguém por validade; quem já estava
-- bloqueado por validade ("Vencido: …") é desbloqueado pela rotina de datas.
-- Afastamento/férias não dependem desta configuração.
create table if not exists public.site_date_rules (
  id                       uuid primary key default gen_random_uuid(),
  profile                  text not null,                  -- cliente (perfil ClearID)
  site_id                  text not null,                  -- siteId do ClearID
  block_identity_validity  boolean not null default false, -- validades do próprio colaborador
  block_company_validity   boolean not null default false, -- validades da empresa do colaborador
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (profile, site_id)
);

create index if not exists site_date_rules_profile_idx on public.site_date_rules (profile);

alter table public.site_date_rules enable row level security;
create policy "site_date_rules_select_all" on public.site_date_rules
  for select to authenticated using (true);
create policy "site_date_rules_write_all" on public.site_date_rules
  for all to authenticated using (true) with check (true);
