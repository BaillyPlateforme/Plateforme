-- Les plafonds du jour, quelle que soit l'adresse du visiteur (audit de sécurité du 13/11/2026).
--
-- Un compteur par clé et par jour calendaire (heure de Paris) : « gemini:photos » compte les photos
-- analysées par Gemini, tous visiteurs confondus. Gardé en base, il tient aux redémarrages du serveur,
-- contrairement aux limites par adresse IP, gardées en mémoire.
--
-- reserver_compteur_jour(cle, n, max) ajoute n au compteur du jour si le total reste <= max, en une
-- seule requête (deux appels simultanés ne dépassent pas le plafond), et dit si c'est réservé.
-- Réservée à la clé de service : ni anon ni authenticated ne la voient.

create table if not exists public.compteurs_jour (
  cle text not null,
  jour date not null,
  n integer not null default 0,
  primary key (cle, jour)
);

alter table public.compteurs_jour enable row level security;
revoke all on public.compteurs_jour from anon, authenticated;

create or replace function public.reserver_compteur_jour(p_cle text, p_n integer, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_total integer;
begin
  insert into public.compteurs_jour (cle, jour, n) values (p_cle, v_jour, 0)
  on conflict (cle, jour) do nothing;
  update public.compteurs_jour
     set n = n + p_n
   where cle = p_cle and jour = v_jour and n + p_n <= p_max
  returning n into v_total;
  return v_total is not null;
end;
$$;

revoke all on function public.reserver_compteur_jour(text, integer, integer) from public, anon, authenticated;
grant execute on function public.reserver_compteur_jour(text, integer, integer) to service_role;
