-- Tempo OS — Plan de Marketing por canción (PDF) · Storage (v0.69.0-alpha)
-- Bucket PRIVADO 'marketing-plans': el PDF del plan de marketing de cada track.
-- El cliente sube a `{team_id}/{trackId}/{ts}-{archivo}.pdf` y lo sirve por SIGNED URL.
-- RLS scopeada por equipo: el primer segmento del path es el team_id.
-- Correr en Supabase → SQL Editor. Idempotente. Requiere is_member/is_editor (setup base del equipo).

-- 1) Bucket privado (no public: se sirve por signed URL de 1h).
insert into storage.buckets (id, name, public)
values ('marketing-plans', 'marketing-plans', false)
on conflict (id) do nothing;

-- 2) RLS sobre storage.objects, acotada al bucket + team_id = primer folder del path.
--    (storage.foldername(name))[1] = 'team_id' → is_member/is_editor lo validan.

drop policy if exists "mkt_plans read" on storage.objects;
create policy "mkt_plans read" on storage.objects for select
  using (bucket_id = 'marketing-plans'
    and is_member(((storage.foldername(name))[1])::uuid));

drop policy if exists "mkt_plans insert" on storage.objects;
create policy "mkt_plans insert" on storage.objects for insert
  with check (bucket_id = 'marketing-plans'
    and is_editor(((storage.foldername(name))[1])::uuid));

drop policy if exists "mkt_plans update" on storage.objects;
create policy "mkt_plans update" on storage.objects for update
  using      (bucket_id = 'marketing-plans' and is_editor(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'marketing-plans' and is_editor(((storage.foldername(name))[1])::uuid));

drop policy if exists "mkt_plans delete" on storage.objects;
create policy "mkt_plans delete" on storage.objects for delete
  using (bucket_id = 'marketing-plans'
    and is_editor(((storage.foldername(name))[1])::uuid));

-- NOTA: si un path no es un uuid válido en el 1er folder (p.ej. modo 'local' sin equipo),
-- la conversión ::uuid fallaría; por eso el cliente solo sube cuando authed() (hay _teamId real).
