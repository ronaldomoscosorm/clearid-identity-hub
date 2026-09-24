-- Configuração BÁSICA de identidade (branding) por CLIENTE (profile). Definida
-- pelo usuário administrador e aplicada a todos os usuários do cliente que não
-- tenham configuração própria (a própria fica no navegador — localStorage).
-- Resolução no login: própria → básica do cliente → padrão R&M.
create table if not exists public.client_branding (
  id            uuid primary key default gen_random_uuid(),
  profile       text not null,                        -- cliente (perfil ClearID)
  client_name   text not null default '',
  client_logo   text not null default '',             -- data URL ou http URL
  primary_color text not null default '#FD5300',
  accent_color  text not null default '#102943',
  updated_by    text,                                 -- username do admin
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Uma configuração básica por cliente.
create unique index if not exists client_branding_profile
  on public.client_branding (profile);

alter table public.client_branding enable row level security;

drop policy if exists "client_branding_select_all" on public.client_branding;
create policy "client_branding_select_all" on public.client_branding
  for select to authenticated using (true);

drop policy if exists "client_branding_write_all" on public.client_branding;
create policy "client_branding_write_all" on public.client_branding
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
