-- Permite configurar, por campo personalizado, se o cadastro deve calcular o
-- vencimento (badge "Vencida") para campos do tipo data. Padrão: ligado
-- (opt-out) para preservar o comportamento atual das certidões/NRs.
alter table public.custom_field_definitions
  add column if not exists expiration_enabled boolean not null default true;
