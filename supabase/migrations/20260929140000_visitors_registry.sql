-- =====================================================================
-- Cadastro de VISITANTES (reaproveitados em novas visitas)
--
-- O ClearID guarda o visitante dentro de cada visita; para localizar quem já
-- visitou antes, o sistema mantém aqui um cadastro por cliente (profile):
-- nome completo, e-mail, documento, empresa e, quando houver, a identidade
-- do ClearID vinculada (visitante com foto).
--
-- LGPD: esta tabela contém dados pessoais. O acesso é EXCLUSIVO do backend
-- (ArgusClearId.Api, com a service_role): RLS habilitado e SEM políticas para
-- anon/authenticated — a sessão técnica do front não lê nem grava aqui.
-- =====================================================================

create table if not exists public.visitors (
  id                   uuid primary key default gen_random_uuid(),
  profile              text not null,                 -- cliente (ex.: Vylor)
  full_name            text not null,
  email                text,
  document_number      text,                          -- como informado
  document_normalized  text generated always as
                         (regexp_replace(coalesce(document_number, ''), '\D', '', 'g')) stored,
  company_id           uuid references public.companies (id) on delete set null,
  company_name         text,                          -- nome da empresa (cadastrada ou livre)
  identity_id          text,                          -- identidade do ClearID vinculada (opcional)
  visit_count          integer not null default 0,
  last_visit_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.visitors is
  'Cadastro de visitantes por cliente, para pesquisa em novas visitas. Dados pessoais: acesso só pelo backend (service_role).';

-- Um visitante por documento dentro do cliente (quando há documento).
create unique index if not exists visitors_profile_document_uix
  on public.visitors (profile, document_normalized)
  where document_normalized <> '';

create index if not exists visitors_profile_email_idx on public.visitors (profile, lower(email));
create index if not exists visitors_profile_name_idx on public.visitors (profile, lower(full_name));
create index if not exists visitors_profile_last_visit_idx on public.visitors (profile, last_visit_at desc);

-- updated_at automático.
create or replace function public.visitors_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists visitors_touch_updated_at on public.visitors;
create trigger visitors_touch_updated_at
  before update on public.visitors
  for each row execute function public.visitors_touch_updated_at();

-- RLS ligado e nenhuma política: só a service_role (backend) acessa.
alter table public.visitors enable row level security;
revoke all on public.visitors from anon, authenticated;
