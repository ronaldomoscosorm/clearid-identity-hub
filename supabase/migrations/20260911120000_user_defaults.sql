-- =====================================================================
-- Defaults por (USUÁRIO REAL + CLIENTE) e cliente padrão por usuário.
--
-- O app usa UMA sessão técnica compartilhada no Supabase (auth.uid() igual
-- para todos). Portanto "por usuário" é chaveado pelo IDENTIFICADOR DO
-- USUÁRIO REAL do ClearID (o `username` de /api/auth/me, ex.:
-- "ronaldo@rmtecho.com.br"), NÃO por auth.uid().
--
-- RLS aberto (como settings/client_settings) — isolamento é lógico: o app
-- sempre filtra pelo user_key do usuário logado.
-- =====================================================================

create table if not exists public.user_client_defaults (
  user_key           text not null,   -- username do usuário real (ClearID)
  profile            text not null,   -- cliente (RM | Corteva | Vylor | ...)
  default_site_id    text,
  default_site_name  text,
  default_rule_id    text,
  default_rule_name  text,
  system_object_id   text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (user_key, profile)
);

comment on table public.user_client_defaults is
  'Defaults operacionais por (usuário real do ClearID, cliente). user_key = username de /api/auth/me.';

create trigger user_client_defaults_set_updated_at
  before update on public.user_client_defaults
  for each row execute function public.set_updated_at();

alter table public.user_client_defaults enable row level security;
create policy "ucd_select_all" on public.user_client_defaults
  for select to authenticated using (true);
create policy "ucd_write_all" on public.user_client_defaults
  for all to authenticated using (true) with check (true);

create table if not exists public.user_defaults (
  user_key          text primary key,   -- username do usuário real (ClearID)
  default_profile   text,               -- cliente padrão ao logar
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.user_defaults is
  'Preferências por usuário real do ClearID. default_profile = cliente padrão ao logar.';

create trigger user_defaults_set_updated_at
  before update on public.user_defaults
  for each row execute function public.set_updated_at();

alter table public.user_defaults enable row level security;
create policy "ud_select_all" on public.user_defaults
  for select to authenticated using (true);
create policy "ud_write_all" on public.user_defaults
  for all to authenticated using (true) with check (true);
