-- =====================================================================
-- Log de atividades dos usuários (auditoria)
--
-- Uma linha por ação de um usuário em qualquer parte da aplicação:
--   * automática: todo request que altera dados no ArgusClearId.Api
--     (POST/PUT/PATCH/DELETE), com usuário do token, cliente ativo, rota,
--     entidade e resultado (middleware);
--   * de negócio: descrição legível ("criou a identity Maria Silva…") e
--     detalhes (campos alterados) definidos pelos controllers/serviços;
--   * do front: gravações feitas direto no Supabase (empresas, configuração
--     de campos, layouts…) registradas via POST /api/audit;
--   * importação: uma linha por execução + uma por pessoa criada/alterada.
--
-- LGPD: contém dados pessoais (nome, documento). Acesso EXCLUSIVO do backend
-- (service_role): RLS ligado e sem políticas para anon/authenticated.
-- Somente inserção; a retenção é feita por rotina de limpeza (ex.: 2 anos).
-- =====================================================================

create table if not exists public.audit_log (
  id            bigint generated always as identity primary key,
  occurred_at   timestamptz not null default now(),
  profile       text,                      -- cliente ativo (ex.: Vylor)
  user_name     text not null,             -- usuário (e-mail/username do token)
  action        text not null,             -- created | updated | deleted | imported | login | logout | ...
  entity_type   text,                      -- identity | company | visit | team | custom_field | ...
  entity_id     text,
  entity_label  text,                      -- nome de exibição (ex.: "Maria Silva")
  summary       text,                      -- frase legível
  details       jsonb,                     -- campos alterados / payload resumido
  source        text not null default 'api', -- api | app | import
  method        text,
  route         text,
  status_code   integer,
  trace_id      text,                      -- correlação com o log técnico (Serilog)
  ip_address    text
);

comment on table public.audit_log is
  'Auditoria de atividades por usuário (somente inserção). Dados pessoais: acesso só pelo backend (service_role).';

create index if not exists audit_log_profile_time_idx on public.audit_log (profile, occurred_at desc);
create index if not exists audit_log_user_idx        on public.audit_log (user_name, occurred_at desc);
create index if not exists audit_log_entity_idx      on public.audit_log (entity_type, entity_id);
create index if not exists audit_log_action_idx      on public.audit_log (action);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;

-- Retenção: apaga entradas com mais de N dias (rodar via cron/pg_cron ou manualmente).
create or replace function public.audit_log_purge(retain_days integer default 730)
returns integer language plpgsql security definer as $$
declare n integer;
begin
  delete from public.audit_log where occurred_at < now() - make_interval(days => retain_days);
  get diagnostics n = row_count;
  return n;
end $$;
