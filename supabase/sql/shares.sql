-- TEMPO — Links de solo-lectura (compartir el plan de contenido con el artista/externos)
-- Modelo "secret link" (como Google Docs "cualquiera con el enlace"): token largo y aleatorio.
-- Seguridad: anon NO puede leer ni listar la tabla. El visor (ver.html) lee SOLO vía la función
-- get_share(token) (security definer), que devuelve únicamente el share cuyo token coincide
-- (no enumera otros, no toca lanzamientos/finanzas/otros equipos). Read-only. Revocable/expirable.
-- Correr en Supabase → SQL Editor. Idempotente.

create table if not exists public.shares (
  token       text primary key,                 -- token aleatorio (en el cliente: 'sh_' + UUIDs)
  team_id     uuid references public.teams(id) on delete cascade,
  release_id  text,
  title       text,
  html        text not null,                     -- snapshot autocontenido del plan (mismo doc que "Exportar HTML")
  created_by  uuid,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,                       -- opcional
  revoked     boolean not null default false
);
create index if not exists shares_team_idx on public.shares (team_id);

alter table public.shares enable row level security;

-- El EQUIPO (autenticado, miembro) puede crear y gestionar sus propios links (listar/revocar a futuro).
drop policy if exists "shares insert" on public.shares;
create policy "shares insert" on public.shares
  for insert to authenticated with check (is_editor(team_id));

drop policy if exists "shares manage" on public.shares;
create policy "shares manage" on public.shares
  for select to authenticated using (is_member(team_id));

drop policy if exists "shares update" on public.shares;
create policy "shares update" on public.shares
  for update to authenticated using (is_editor(team_id)) with check (is_editor(team_id));

drop policy if exists "shares delete" on public.shares;
create policy "shares delete" on public.shares
  for delete to authenticated using (is_editor(team_id));

-- ⚠️ NO hay política de SELECT para anon: el público NO puede leer ni enumerar la tabla.
-- La lectura pública pasa SOLO por esta función, que devuelve el share por token exacto:
create or replace function public.get_share(p_token text)
returns table (title text, html text)
language sql
security definer
set search_path = public
as $$
  select s.title, s.html
  from public.shares s
  where s.token = p_token
    and s.revoked = false
    and (s.expires_at is null or s.expires_at > now())
$$;

grant execute on function public.get_share(text) to anon, authenticated;

-- NOTA: requiere is_member/is_editor (helpers existentes). El token es la única credencial del link.
