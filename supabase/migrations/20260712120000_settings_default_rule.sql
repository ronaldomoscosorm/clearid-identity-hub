-- Regra (team) padrão nas configurações do usuário.
alter table public.settings
  add column if not exists default_rule_id   text,
  add column if not exists default_rule_name text;
