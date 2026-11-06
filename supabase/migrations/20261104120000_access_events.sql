-- =====================================================================
-- EVENTOS DE ACESSO (portas) — estrutura baseada no relatório "Eventos"
-- exportado do Security Center (colunas: Event, Door, Side, First name,
-- Last name, Credential, Event timestamp, Credential Code, External ID,
-- Identity ID (Cardholder), Identity ID (Visitor), Areas, Home Site).
--
--   * access_event_types: catálogo dos tipos de evento, em árvore de dois
--     níveis como no filtro do Security Center (categoria "Door" → "Access
--     granted", "Access denied", ...). Novos tipos entram como linhas.
--   * access_events: uma linha por evento. "Home Site" é o site do ClearID
--     ao qual a pessoa pertence (nome como no relatório + siteId resolvido);
--     "Areas" é o nome da área no ClearID.
--
-- Escopo por cliente (profile), como as demais tabelas do ClearID.
-- LGPD: contém dados pessoais (nome, documento em external_id). Mesma
-- política das identidades (sessão autenticada); a retenção é feita por
-- rotina de limpeza (access_events_purge).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Catálogo de tipos de evento
-- ---------------------------------------------------------------------
create table if not exists public.access_event_types (
  id          uuid primary key default gen_random_uuid(),
  category    text not null,                 -- nó pai no Security Center (ex.: Door)
  name        text not null,                 -- nome como no relatório (ex.: Access granted)
  sdk_name    text,                          -- nome no SDK/ArgusSCSaaS (ex.: AccessGranted)
  sdk_code    integer,                       -- código numérico do SDK (quando conhecido)
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (category, name)
);

comment on table public.access_event_types is
  'Tipos de evento de acesso (categoria → nome), como na árvore de eventos do Security Center.';

create unique index if not exists access_event_types_sdk_name_uix
  on public.access_event_types (sdk_name)
  where sdk_name is not null;

create trigger access_event_types_set_updated_at
  before update on public.access_event_types
  for each row execute function public.set_updated_at();

insert into public.access_event_types (category, name, sdk_name, sort_order) values
  ('Door', 'Access granted', 'AccessGranted', 1),
  ('Door', 'Access denied',  'AccessDenied',  2)
on conflict (category, name) do nothing;

-- ---------------------------------------------------------------------
-- 2) Eventos
-- ---------------------------------------------------------------------
create table if not exists public.access_events (
  id                   bigint generated always as identity primary key,
  profile              text not null,                       -- cliente (perfil ClearID)
  event_type_id        uuid not null references public.access_event_types (id),
  door                 text not null,                       -- Door (ex.: Catraca Saida)
  side                 text,                                -- Side (ex.: Reader - Entrada)
  first_name           text,
  last_name            text,
  credential           text,                                -- Credential (descrição)
  event_timestamp      timestamptz not null,                -- Event timestamp
  time_zone            text,                                -- fuso de origem do horário (ex.: America/Sao_Paulo)
  credential_code      text,                                -- Credential Code (Cardholder)
  external_id          text,                                -- External ID (Cardholder): CPF/matrícula
  identity_id          text,                                -- Identity ID (Cardholder): identityId do ClearID
  visitor_identity_id  text,                                -- Identity ID (Visitor)
  area_name            text,                                -- Areas: nome da área no ClearID
  home_site_name       text,                                -- Home Site (Cardholder): nome do site no ClearID
  home_site_id         text,                                -- siteId do ClearID resolvido pelo nome
  source               text not null default 'import',      -- import | scsaas
  source_file          text,                                -- arquivo de origem (quando importado)
  imported_by          text,                                -- usuário que importou
  created_at           timestamptz not null default now()
);

comment on table public.access_events is
  'Eventos de acesso (portas) por cliente; espelho do relatório de eventos do Security Center. Dados pessoais: ver LGPD.';

-- Reimportação idempotente: o mesmo evento (tipo, porta, horário, pessoa) não duplica.
create unique index if not exists access_events_dedupe_uix
  on public.access_events (
    profile, event_type_id, door, event_timestamp,
    coalesce(identity_id, ''), coalesce(credential, '')
  );

create index if not exists access_events_profile_time_idx on public.access_events (profile, event_timestamp desc);
create index if not exists access_events_identity_idx     on public.access_events (profile, identity_id);
create index if not exists access_events_external_id_idx  on public.access_events (profile, external_id);
create index if not exists access_events_door_idx         on public.access_events (profile, door);
create index if not exists access_events_area_idx         on public.access_events (profile, area_name);
create index if not exists access_events_home_site_idx    on public.access_events (profile, home_site_id);

-- Visão achatada para relatórios (tipo e categoria resolvidos).
create or replace view public.access_events_view
  with (security_invoker = true) as
select
  e.id,
  e.profile,
  t.category        as event_category,
  t.name            as event_name,
  t.sdk_name        as event_sdk_name,
  e.door,
  e.side,
  e.first_name,
  e.last_name,
  nullif(trim(concat_ws(' ', e.first_name, e.last_name)), '') as full_name,
  e.credential,
  e.event_timestamp,
  e.time_zone,
  e.credential_code,
  e.external_id,
  e.identity_id,
  e.visitor_identity_id,
  e.area_name,
  e.home_site_name,
  e.home_site_id,
  e.source,
  e.source_file,
  e.imported_by,
  e.created_at
from public.access_events e
join public.access_event_types t on t.id = e.event_type_id;

-- Retenção: apaga eventos com mais de N dias (rodar via pg_cron ou manualmente).
create or replace function public.access_events_purge(retain_days integer default 730)
returns integer language plpgsql security definer as $$
declare n integer;
begin
  delete from public.access_events where event_timestamp < now() - make_interval(days => retain_days);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------
alter table public.access_event_types enable row level security;
create policy "access_event_types_select_all" on public.access_event_types
  for select to authenticated using (true);
create policy "access_event_types_write_all" on public.access_event_types
  for all to authenticated using (true) with check (true);

alter table public.access_events enable row level security;
create policy "access_events_select_all" on public.access_events
  for select to authenticated using (true);
create policy "access_events_write_all" on public.access_events
  for all to authenticated using (true) with check (true);
