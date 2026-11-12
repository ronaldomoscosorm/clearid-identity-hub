-- =====================================================================
-- Configurações por USUÁRIO LOGADO e campos especiais por CLIENTE.
--
-- Antes: site/regra/sistema/visitas e a identidade visual eram gravados na
-- linha única de `public.settings` (sessão técnica compartilhada), valendo
-- para TODOS os usuários. Os dropdowns de `special_custom_fields` eram
-- globais (todos os clientes viam os de todos).
--
-- Agora:
--   1. user_client_defaults ganha `link_visitor_to_identity` (visitas).
--   2. user_branding: identidade visual própria por (usuário, cliente).
--   3. special_custom_fields passa a ser por cliente (profile).
--   4. Limpa da linha compartilhada os padrões que deixaram de ser globais.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Visitas por (usuário, cliente)
-- ---------------------------------------------------------------------
alter table public.user_client_defaults
  add column if not exists link_visitor_to_identity boolean not null default false;

comment on column public.user_client_defaults.link_visitor_to_identity is
  'Permite vincular o visitante a uma identidade no cadastro de visita (preferência do usuário naquele cliente).';

-- ---------------------------------------------------------------------
-- 2) Identidade visual própria por (usuário, cliente)
--    Resolução: própria (esta tabela) → básica do cliente (client_branding)
--    → padrão R&M.
-- ---------------------------------------------------------------------
create table if not exists public.user_branding (
  user_key      text not null,   -- username do usuário real (ClearID)
  profile       text not null,   -- cliente (perfil ClearID)
  client_name   text not null default '',
  client_logo   text not null default '',   -- data URL ou http URL
  primary_color text not null default '#FD5300',
  accent_color  text not null default '#102943',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_key, profile)
);

comment on table public.user_branding is
  'Identidade visual própria por (usuário real do ClearID, cliente). user_key = username de /api/auth/me.';

drop trigger if exists user_branding_set_updated_at on public.user_branding;
create trigger user_branding_set_updated_at
  before update on public.user_branding
  for each row execute function public.set_updated_at();

alter table public.user_branding enable row level security;

drop policy if exists "ub_select_all" on public.user_branding;
create policy "ub_select_all" on public.user_branding
  for select to authenticated using (true);

drop policy if exists "ub_write_all" on public.user_branding;
create policy "ub_write_all" on public.user_branding
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- 3) Campos especiais (dropdowns) por cliente
--    Backfill: usa o cliente da definição de mesmo nome; sem definição
--    catalogada, 'Vylor' (dono de todos os registros existentes).
-- ---------------------------------------------------------------------
alter table public.special_custom_fields
  add column if not exists profile text;

update public.special_custom_fields s
   set profile = coalesce(
         (select d.profile
            from public.custom_field_definitions d
           where lower(d.custom_field_name) = lower(s.custom_field_name)
           order by d.profile
           limit 1),
         'Vylor')
 where s.profile is null;

alter table public.special_custom_fields
  alter column profile set not null;

comment on column public.special_custom_fields.profile is
  'Cliente (perfil ClearID) dono deste dropdown.';

alter table public.special_custom_fields
  drop constraint if exists special_custom_fields_custom_field_name_key;
alter table public.special_custom_fields
  drop constraint if exists special_custom_fields_profile_name_key;
alter table public.special_custom_fields
  add constraint special_custom_fields_profile_name_key
    unique (profile, custom_field_name);

-- ---------------------------------------------------------------------
-- 4) Linha compartilhada: remove os padrões que agora são por usuário.
--    (Conexão — URL/token — e account_id continuam nela.)
-- ---------------------------------------------------------------------
update public.settings
   set default_site_id          = null,
       default_site_name        = null,
       default_rule_id          = null,
       default_rule_name        = null,
       system_object_id         = null,
       link_visitor_to_identity = false;

notify pgrst, 'reload schema';
