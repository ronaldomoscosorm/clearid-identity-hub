-- =====================================================================
-- Configurações por CLIENTE (profile: RM | Corteva | Vylor).
--
-- Tabela isolada de `public.settings` (que é por usuário). Cada linha
-- representa o "default do cliente" para novos artefatos criados por
-- qualquer usuário daquele cliente.
--
-- Primeiro caso de uso: default_custom_field_storage — pré-seleciona a
-- opção de armazenamento (ClearID / Supabase / ambos) no formulário de
-- criação de campo personalizado.
-- =====================================================================

create table if not exists public.client_settings (
  profile                        text primary key,
  default_custom_field_storage   text not null default 'both'
    check (default_custom_field_storage in ('clearid','supabase','both')),
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now()
);

comment on table  public.client_settings is
  'Configurações por cliente (profile ClearID: RM | Corteva | Vylor).';
comment on column public.client_settings.default_custom_field_storage is
  'Onde novos campos personalizados são gravados por padrão: clearid | supabase | both.';

create trigger client_settings_set_updated_at
  before update on public.client_settings
  for each row execute function public.set_updated_at();

alter table public.client_settings enable row level security;

-- Leitura liberada para qualquer usuário autenticado (default público interno).
create policy "cs_select_all" on public.client_settings
  for select to authenticated using (true);

-- Escrita liberada para qualquer autenticado (a UI de edição é
-- restringida ao perfil Administrador no frontend). Se quiser reforçar
-- por policy, adicionar cláusula com auth.jwt() -> claim de role.
create policy "cs_write_all" on public.client_settings
  for all to authenticated using (true) with check (true);

-- Seed dos clientes conhecidos.
insert into public.client_settings (profile, default_custom_field_storage) values
  ('RM','both'),
  ('Corteva','both'),
  ('Vylor','both')
on conflict (profile) do nothing;
