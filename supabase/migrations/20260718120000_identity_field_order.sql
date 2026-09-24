-- Ordem de exibição dos campos no formulário de identity (designer de layout).
-- Reaproveita a tabela de apelidos/visibilidade. NULL = sem posição definida.
alter table public.identity_field_labels
  add column if not exists display_order integer;
