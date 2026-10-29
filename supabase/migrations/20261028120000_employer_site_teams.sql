-- Regras de acesso (teams do ClearID) vinculadas a cada site da Employer.
-- Na importação Employer, cada pessoa é incluída nas regras do site resolvido
-- para a sua linha (siteId). Um vínculo pode ter N regras.
create table if not exists public.employer_site_teams (
  id               uuid primary key default gen_random_uuid(),
  employer_site_id uuid not null references public.employer_sites(id) on delete cascade,
  profile          text not null,               -- cliente (perfil ClearID)
  team_id          text not null,               -- teamId da regra no ClearID
  team_name        text,                        -- nome da regra (exibição)
  created_at       timestamptz not null default now()
);

create unique index if not exists employer_site_teams_site_team
  on public.employer_site_teams (employer_site_id, team_id);

create index if not exists employer_site_teams_profile_idx
  on public.employer_site_teams (profile);

alter table public.employer_site_teams enable row level security;
create policy "employer_site_teams_select_all" on public.employer_site_teams
  for select to authenticated using (true);
create policy "employer_site_teams_write_all" on public.employer_site_teams
  for all to authenticated using (true) with check (true);
