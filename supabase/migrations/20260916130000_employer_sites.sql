-- Vínculo dos sites do sistema externo "Employer" (nome + código) ao siteId do
-- ClearID. Usado na importação para resolver o código/nome do site da Employer
-- para o siteId real do ClearID. Escopo por cliente (profile).
create table if not exists public.employer_sites (
  id          uuid primary key default gen_random_uuid(),
  profile     text not null,               -- cliente (perfil ClearID)
  site_id     text not null,               -- siteId do ClearID (GUID)
  nome        text,                         -- nome do site na Employer
  codigo      text,                         -- código do site na Employer
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Um código aponta para um único site por cliente (chave de resolução na importação).
create unique index if not exists employer_sites_profile_codigo
  on public.employer_sites (profile, codigo)
  where codigo is not null;

create index if not exists employer_sites_profile_idx
  on public.employer_sites (profile);

alter table public.employer_sites enable row level security;
create policy "employer_sites_select_all" on public.employer_sites
  for select to authenticated using (true);
create policy "employer_sites_write_all" on public.employer_sites
  for all to authenticated using (true) with check (true);
