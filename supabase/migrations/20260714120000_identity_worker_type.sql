-- ---------------------------------------------------------------------
-- Persiste o tipo do trabalhador EXATO (worker_types) por identidade.
--
-- Motivo: no Argus, o workerTypeCode só distingue "Colaborador" e "Terceiros"
-- (Visitante e Terceiro colidem em "Terceiros"). Ao recarregar, o reverse-lookup
-- era ambíguo e exibia o tipo errado. Guardamos o worker_type_id aqui para o
-- round-trip exato na tela de edição.
-- ---------------------------------------------------------------------
alter table public.identities
  add column if not exists worker_type_id uuid
    references public.worker_types (id) on delete set null;
