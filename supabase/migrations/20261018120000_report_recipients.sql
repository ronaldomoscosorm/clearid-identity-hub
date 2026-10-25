-- =====================================================================
-- Destinatários dos relatórios automáticos (por cliente, tipo de relatório e site)
--
-- Quem recebe cada relatório gerado pelas rotinas (rotina de datas: pessoas
-- desativadas/reativadas; importação; vencimentos a vencer…). Uma linha por
-- e-mail × tipo × site:
--   * profile      = cliente (perfil ClearID), ex.: Vylor, Corteva;
--   * report_type  = tipo do relatório (ver check abaixo);
--   * site_id      = site do ClearID; NULL = todos os sites do cliente;
--   * email/name   = destinatário; is_active desliga sem apagar.
--
-- Leitura/escrita pelo portal (authenticated) para a tela de configuração;
-- o serviço que envia os relatórios lê com service_role.
-- =====================================================================

create table if not exists public.report_recipients (
  id            uuid primary key default gen_random_uuid(),
  profile       text not null,
  report_type   text not null,
  site_id       uuid null,                 -- null = todos os sites do cliente
  site_name     text null,                 -- nome do site (cache para exibição)
  email         text not null,
  name          text null,
  is_active     boolean not null default true,
  notes         text null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint report_recipients_type_chk check (report_type in (
    'rotina_datas',      -- desativadas por validade/afastamento e reativadas (rotina diária)
    'vencimentos',       -- certidões/cursos a vencer nos próximos dias
    'importacao',        -- resultado das importações (criadas/atualizadas/falhas)
    'auditoria'          -- resumo de auditoria
  )),
  constraint report_recipients_email_chk check (position('@' in email) > 1)
);

-- Um destinatário por cliente × tipo × site (site nulo tratado como valor próprio).
create unique index if not exists report_recipients_uq
  on public.report_recipients (profile, report_type, coalesce(site_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(email));

create index if not exists report_recipients_lookup_idx
  on public.report_recipients (profile, report_type, is_active);

-- updated_at automático (mesma função usada nas demais tabelas, se existir).
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    execute 'drop trigger if exists report_recipients_set_updated_at on public.report_recipients';
    execute 'create trigger report_recipients_set_updated_at before update on public.report_recipients for each row execute function public.set_updated_at()';
  end if;
end $$;

alter table public.report_recipients enable row level security;

drop policy if exists "report_recipients_select_authenticated" on public.report_recipients;
create policy "report_recipients_select_authenticated"
  on public.report_recipients for select to authenticated using (true);

drop policy if exists "report_recipients_insert_authenticated" on public.report_recipients;
create policy "report_recipients_insert_authenticated"
  on public.report_recipients for insert to authenticated with check (true);

drop policy if exists "report_recipients_update_authenticated" on public.report_recipients;
create policy "report_recipients_update_authenticated"
  on public.report_recipients for update to authenticated using (true) with check (true);

drop policy if exists "report_recipients_delete_authenticated" on public.report_recipients;
create policy "report_recipients_delete_authenticated"
  on public.report_recipients for delete to authenticated using (true);

comment on table public.report_recipients is
  'Destinatários dos relatórios automáticos por cliente (profile), tipo de relatório e site (null = todos).';
comment on column public.report_recipients.report_type is
  'rotina_datas | vencimentos | importacao | auditoria';
