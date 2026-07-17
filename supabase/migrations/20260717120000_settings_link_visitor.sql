-- Opção (em Configurações) para vincular o visitante da visita a uma identidade.
-- Off por padrão. Sincronizada com o localStorage via supabase-settings.
alter table public.settings
  add column if not exists link_visitor_to_identity boolean not null default false;
