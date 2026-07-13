-- Vínculo da identidade com uma empresa (para herdar valores de campos
-- relacionados). company_id é conceito do Supabase (não existe no ClearID).
alter table public.identities
  add column if not exists company_id uuid references public.companies (id) on delete set null;
create index if not exists identities_company_idx on public.identities (company_id);
