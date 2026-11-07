-- ============================================================
-- 0015 — La visite technique, du CRM à l'espace client
-- ============================================================
--
-- Cahier des charges, §3.2 : le client reçoit une proposition de créneaux
-- tirés du planning des commerciaux, réserve, est rappelé la veille ; le
-- commercial saisit la visite sur sa tablette, le client signe le
-- compte-rendu, qui rejoint le dossier et la frise.
--
-- Le CRM reste la source (schéma crm, tables posées par
-- apps/interne/src/crm/visites/schema.ts) : propositions et créneaux,
-- rendez-vous, visites et comptes-rendus. L'espace client en reçoit, par
-- PROJECTION comme le reste du dossier (migration 0012), ce que le client a
-- le droit de voir — et rien d'autre : ni le titre ni les notes internes du
-- rendez-vous, ni l'inventaire de travail, ni les observations du commercial.
--
--   * ec_creneaux : les créneaux proposés au client, à choisir ;
--   * ec_visites : ses visites (prévue, en cours, réalisée, compte-rendu
--     signé), avec le résumé du compte-rendu signé ;
--   * ec_documents : le PDF du compte-rendu signé y entre comme un document
--     déposé par l'équipe (colonne crm_visite_id), servi comme les autres par
--     un lien signé de courte durée.
--
-- Dans l'autre sens, le choix d'un créneau et la demande d'autres créneaux
-- passent par les fonctions de cette migration, qui écrivent dans le CRM
-- sous verrou, puis projettent. La règle de réservation est la même pour le
-- client et pour le commercial qui réserve depuis le CRM : pas de
-- chevauchement avec un rendez-vous du commercial, ni avec un créneau qu'il
-- propose à un autre client.
--
-- Fonctions SECURITY DEFINER, réservées à la clé de service et au serveur du
-- CRM. La clé publique ne lit que ses lignes (RLS, comme en 0011) et
-- n'écrit rien.
--
-- Rien d'existant n'est modifié hors de l'espace client : une colonne
-- s'ajoute à ec_documents, deux tables et cinq fonctions sont créées.
-- Idempotente : elle se rejoue sans erreur et sans rien effacer.

-- ============================================================
-- 1. Les tables
-- ============================================================

create table if not exists public.ec_creneaux (
  id                  uuid primary key default gen_random_uuid(),
  dossier_id          uuid not null references public.ec_dossiers (id) on delete cascade,
  -- Le créneau et la proposition du CRM qu'il projette.
  crm_creneau_id      integer not null,
  crm_proposition_id  integer not null,
  debut               timestamptz not null,
  duree_min           integer not null check (duree_min > 0),
  mode                text not null check (mode in ('sur_place', 'visio')),
  statut              text not null check (statut in ('propose', 'retenu', 'libere')),
  -- Le nom du commercial qui viendra.
  conseiller          text not null default '',
  -- Le client a demandé d'autres créneaux : quand.
  autres_demandes_le  timestamptz
);
create unique index if not exists ec_creneaux_crm_uidx on public.ec_creneaux (crm_creneau_id);
create index if not exists ec_creneaux_dossier_idx on public.ec_creneaux (dossier_id);

create table if not exists public.ec_visites (
  id                  uuid primary key default gen_random_uuid(),
  dossier_id          uuid not null references public.ec_dossiers (id) on delete cascade,
  -- « r12 » : le rendez-vous 12 du CRM ; « v7 » : la visite 7, saisie sans rendez-vous.
  cle                 text not null,
  crm_rendez_vous_id  integer,
  crm_visite_id       integer,
  debut               timestamptz,
  duree_min           integer,
  mode                text not null check (mode in ('sur_place', 'visio')),
  conseiller          text not null default '',
  statut              text not null check (statut in ('planifiee', 'en_cours', 'realisee', 'signee')),
  -- Le compte-rendu signé : quand, par qui, l'empreinte du contenu, et son résumé.
  signe_le            timestamptz,
  signataire          text,
  empreinte           text,
  volume_m3           numeric(7, 2),
  pieces              integer,
  photos              integer,
  document_id         uuid references public.ec_documents (id) on delete set null
);
create unique index if not exists ec_visites_cle_uidx on public.ec_visites (cle);
create index if not exists ec_visites_dossier_idx on public.ec_visites (dossier_id);

-- Le PDF d'un compte-rendu signé, rangé parmi les documents du dossier.
alter table public.ec_documents add column if not exists crm_visite_id integer;
create unique index if not exists ec_documents_crm_visite_uidx on public.ec_documents (crm_visite_id);

-- ============================================================
-- 2. La projection : du CRM vers l'espace client
-- ============================================================

-- Recopie les créneaux proposés, les visites et les comptes-rendus signés du
-- dossier du CRM. Sans effet sur un dossier sans espace.
create or replace function public.ec_projeter_visites_crm(p_crm integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ec uuid;
begin
  select id into v_ec from public.ec_dossiers where crm_dossier_id = p_crm for update;
  if not found or not exists (select 1 from crm.dossiers where id = p_crm) then
    return;
  end if;

  -- Les créneaux de la proposition ouverte, à venir.
  insert into public.ec_creneaux as e (dossier_id, crm_creneau_id, crm_proposition_id, debut, duree_min, mode, statut, conseiller, autres_demandes_le)
  select v_ec, c.id, p.id, c.debut, p.duree_min,
         case p.type when 'visio' then 'visio' else 'sur_place' end,
         c.statut, coalesce(u.nom, ''), p.autres_demandes_le
    from crm.creneaux_visite c
    join crm.propositions_visite p on p.id = c.proposition_id
    left join crm.utilisateurs u on u.id = p.commercial_id
   where p.dossier_id = p_crm and p.statut = 'ouverte' and c.statut = 'propose' and c.debut > now()
  on conflict (crm_creneau_id) do update set
    dossier_id = excluded.dossier_id, crm_proposition_id = excluded.crm_proposition_id, debut = excluded.debut,
    duree_min = excluded.duree_min, mode = excluded.mode, statut = excluded.statut, conseiller = excluded.conseiller,
    autres_demandes_le = excluded.autres_demandes_le;

  delete from public.ec_creneaux e
   where e.dossier_id = v_ec
     and e.crm_creneau_id not in (
       select c.id from crm.creneaux_visite c join crm.propositions_visite p on p.id = c.proposition_id
        where p.dossier_id = p_crm and p.statut = 'ouverte' and c.statut = 'propose' and c.debut > now());

  -- Le PDF de chaque compte-rendu signé, parmi les documents déposés par l'équipe.
  insert into public.ec_documents as d (dossier_id, categorie, libelle, source, chemin, nom_fichier, taille_octets, mime, requirement_id, created_by, created_at, crm_visite_id)
  select v_ec, 'visite', 'Compte-rendu de visite technique', 'equipe', v.document_chemin,
         'compte-rendu-visite-' || dos.ref || '-' || to_char(v.signe_le at time zone 'Europe/Paris', 'YYYY-MM-DD') || '.pdf',
         coalesce(v.document_taille, 0), 'application/pdf', null, coalesce(u.nom, 'Bailly Déménagement'), v.signe_le, v.id
    from crm.visites v
    join crm.dossiers dos on dos.id = v.dossier_id
    left join crm.utilisateurs u on u.id = v.commercial_id
   where v.dossier_id = p_crm and v.statut = 'signee' and v.document_chemin is not null
  on conflict (crm_visite_id) do update set
    dossier_id = excluded.dossier_id, chemin = excluded.chemin, nom_fichier = excluded.nom_fichier,
    taille_octets = excluded.taille_octets, created_at = excluded.created_at;

  delete from public.ec_documents d
   where d.dossier_id = v_ec and d.crm_visite_id is not null
     and d.crm_visite_id not in (select v.id from crm.visites v where v.dossier_id = p_crm and v.statut = 'signee' and v.document_chemin is not null);

  -- Les visites : chaque rendez-vous de visite du dossier (sur place ou en
  -- visio), avec la dernière visite saisie pour lui, signée d'abord.
  insert into public.ec_visites as e (
    dossier_id, cle, crm_rendez_vous_id, crm_visite_id, debut, duree_min, mode, conseiller, statut,
    signe_le, signataire, empreinte, volume_m3, pieces, photos, document_id
  )
  select v_ec, 'r' || r.id, r.id, v.id, r.debut, r.duree_min,
         case r.type when 'visio' then 'visio' else 'sur_place' end,
         coalesce(u.nom, ''),
         case
           when v.statut = 'signee' then 'signee'
           when v.statut = 'en_cours' then 'en_cours'
           when r.termine or r.debut + make_interval(mins => r.duree_min) < now() then 'realisee'
           else 'planifiee'
         end,
         v.signe_le, v.signataire, v.empreinte,
         case when v.statut = 'signee' then (v.contenu ->> 'volume')::numeric end,
         case when v.statut = 'signee' then jsonb_array_length(coalesce(v.contenu -> 'pieces', '[]'::jsonb)) end,
         case when v.statut = 'signee' then (v.contenu ->> 'nb_photos')::integer end,
         (select d.id from public.ec_documents d where d.crm_visite_id = v.id)
    from crm.rendez_vous r
    left join crm.utilisateurs u on u.id = r.commercial_id
    left join lateral (
      select x.* from crm.visites x where x.rendez_vous_id = r.id
       order by (x.statut = 'signee') desc, x.commencee_le desc limit 1
    ) v on true
   where r.dossier_id = p_crm and r.type in ('phys', 'visio')
  on conflict (cle) do update set
    dossier_id = excluded.dossier_id, crm_rendez_vous_id = excluded.crm_rendez_vous_id, crm_visite_id = excluded.crm_visite_id,
    debut = excluded.debut, duree_min = excluded.duree_min, mode = excluded.mode, conseiller = excluded.conseiller,
    statut = excluded.statut, signe_le = excluded.signe_le, signataire = excluded.signataire, empreinte = excluded.empreinte,
    volume_m3 = excluded.volume_m3, pieces = excluded.pieces, photos = excluded.photos, document_id = excluded.document_id;

  -- Et les visites saisies sans rendez-vous.
  insert into public.ec_visites as e (
    dossier_id, cle, crm_rendez_vous_id, crm_visite_id, debut, duree_min, mode, conseiller, statut,
    signe_le, signataire, empreinte, volume_m3, pieces, photos, document_id
  )
  select v_ec, 'v' || v.id, null, v.id, coalesce(v.signe_le, v.commencee_le), null, 'sur_place', coalesce(u.nom, ''),
         case when v.statut = 'signee' then 'signee' else 'en_cours' end,
         v.signe_le, v.signataire, v.empreinte,
         case when v.statut = 'signee' then (v.contenu ->> 'volume')::numeric end,
         case when v.statut = 'signee' then jsonb_array_length(coalesce(v.contenu -> 'pieces', '[]'::jsonb)) end,
         case when v.statut = 'signee' then (v.contenu ->> 'nb_photos')::integer end,
         (select d.id from public.ec_documents d where d.crm_visite_id = v.id)
    from crm.visites v
    left join crm.utilisateurs u on u.id = v.commercial_id
   where v.dossier_id = p_crm and v.rendez_vous_id is null
  on conflict (cle) do update set
    dossier_id = excluded.dossier_id, crm_visite_id = excluded.crm_visite_id, debut = excluded.debut,
    conseiller = excluded.conseiller, statut = excluded.statut, signe_le = excluded.signe_le, signataire = excluded.signataire,
    empreinte = excluded.empreinte, volume_m3 = excluded.volume_m3, pieces = excluded.pieces, photos = excluded.photos,
    document_id = excluded.document_id;

  delete from public.ec_visites e
   where e.dossier_id = v_ec
     and e.cle not in (
       select 'r' || r.id from crm.rendez_vous r where r.dossier_id = p_crm and r.type in ('phys', 'visio')
       union all
       select 'v' || v.id from crm.visites v where v.dossier_id = p_crm and v.rendez_vous_id is null);
end;
$$;

-- ============================================================
-- 3. Réserver une visite : une seule règle, sous verrou
-- ============================================================

-- Pose le rendez-vous de visite d'un dossier dans le planning du commercial.
-- `p_creneau` : le créneau proposé qu'on retient (le choix du client, ou du
-- commercial pour lui) ; sans lui, une réservation directe. Rend
-- { issue, rendez_vous_id } : 'reserve', 'pris' (le commercial n'est plus
-- libre), 'passe' (l'heure est passée), 'ferme' (proposition close) ou
-- 'inconnu'.
create or replace function public.ec_poser_visite_crm(
  p_dossier integer,
  p_commercial integer,
  p_type text,
  p_debut timestamptz,
  p_duree integer,
  p_creneau integer,
  p_origine text,
  p_utilisateur integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prop    integer;
  v_statut  text;
  v_ouverte text;
  v_titre   text;
  v_lieu    text;
  v_rdv     integer;
  v_fin     timestamptz := p_debut + make_interval(mins => coalesce(p_duree, 60));
  v_nom     text;
begin
  if p_type not in ('phys', 'visio') or coalesce(p_duree, 0) not between 15 and 480 then
    return jsonb_build_object('issue', 'inconnu');
  end if;
  perform 1 from crm.dossiers where id = p_dossier for update;
  if not found or not exists (select 1 from crm.utilisateurs where id = p_commercial) then
    return jsonb_build_object('issue', 'inconnu');
  end if;
  -- Un planning à la fois par commercial : deux réservations simultanées ne prennent pas la même heure.
  perform pg_advisory_xact_lock(hashtext('bailly.crm.planning'), p_commercial);

  if p_creneau is not null then
    select c.statut, c.proposition_id, p.statut into v_statut, v_prop, v_ouverte
      from crm.creneaux_visite c join crm.propositions_visite p on p.id = c.proposition_id
     where c.id = p_creneau and p.dossier_id = p_dossier
     for update of c, p;
    if not found then
      return jsonb_build_object('issue', 'inconnu');
    end if;
    if v_statut <> 'propose' or v_ouverte <> 'ouverte' then
      return jsonb_build_object('issue', 'ferme');
    end if;
  end if;

  if p_debut <= now() then
    return jsonb_build_object('issue', 'passe');
  end if;

  -- Le commercial est-il libre ? Aucun rendez-vous, aucune tâche, aucune
  -- règle perso ne chevauche le créneau…
  if exists (
    select 1 from crm.rendez_vous r
     where r.commercial_id = p_commercial
       and tstzrange(r.debut, r.debut + make_interval(mins => r.duree_min)) && tstzrange(p_debut, v_fin)
  ) then
    return jsonb_build_object('issue', 'pris');
  end if;
  -- … ni un créneau qu'il propose encore à un autre client.
  if exists (
    select 1 from crm.creneaux_visite c join crm.propositions_visite p on p.id = c.proposition_id
     where p.commercial_id = p_commercial and p.statut = 'ouverte' and c.statut = 'propose' and p.dossier_id <> p_dossier
       and tstzrange(c.debut, c.debut + make_interval(mins => p.duree_min)) && tstzrange(p_debut, v_fin)
  ) then
    return jsonb_build_object('issue', 'pris');
  end if;

  -- Le titre du rendez-vous, comme ceux du planning : « M. Dupuis », « Mme Marino », la société.
  select case
           when btrim(coalesce(c.societe, '')) <> '' then btrim(c.societe)
           when c.civilite = 'Madame' then 'Mme ' || btrim(c.nom)
           when c.civilite = 'Monsieur' then 'M. ' || btrim(c.nom)
           else btrim(coalesce(c.prenom, '') || ' ' || c.nom)
         end
    into v_titre
    from crm.dossiers d join crm.clients c on c.id = d.client_id where d.id = p_dossier;
  select e.adresse into v_lieu from crm.etapes_trajet e
   where e.dossier_id = p_dossier and e.genre = 'depart' and btrim(coalesce(e.adresse, '')) <> ''
   order by e.ordre, e.id limit 1;

  insert into crm.rendez_vous (commercial_id, dossier_id, type, titre, lieu, debut, duree_min, notes)
  values (p_commercial, p_dossier, p_type, v_titre, case when p_type = 'visio' then 'Visio' else v_lieu end, p_debut, p_duree,
          case when p_origine = 'espace' then 'Créneau choisi par le client dans son espace.' end)
  returning id into v_rdv;

  if p_creneau is not null then
    update crm.creneaux_visite set statut = 'retenu', rendez_vous_id = v_rdv where id = p_creneau;
    update crm.creneaux_visite set statut = 'libere' where proposition_id = v_prop and id <> p_creneau and statut = 'propose';
    update crm.propositions_visite set statut = 'retenue', close_le = now() where id = v_prop;
  else
    -- Réservé directement : la proposition ouverte du dossier, s'il y en a une, n'a plus d'objet.
    update crm.creneaux_visite c set statut = 'libere'
      from crm.propositions_visite p
     where p.id = c.proposition_id and p.dossier_id = p_dossier and p.statut = 'ouverte' and c.statut = 'propose';
    update crm.propositions_visite set statut = 'retiree', close_le = now() where dossier_id = p_dossier and statut = 'ouverte';
  end if;

  update crm.dossiers set statut = 'visite' where id = p_dossier and statut = 'prospect';
  update crm.dossiers set maj_le = now() where id = p_dossier;
  select nom into v_nom from crm.utilisateurs where id = p_commercial;
  insert into crm.activite (dossier_id, utilisateur_id, libelle)
  values (p_dossier, p_utilisateur,
          case when p_origine = 'espace' then 'Visite technique réservée par le client dans son espace : ' else 'Visite technique réservée : ' end
          || to_char(p_debut at time zone 'Europe/Paris', 'DD/MM/YYYY') || ' à ' || to_char(p_debut at time zone 'Europe/Paris', 'HH24"h"MI')
          || case when p_type = 'visio' then ' (visio)' else '' end || coalesce(' avec ' || v_nom, ''));

  perform public.ec_projeter_visites_crm(p_dossier);
  return jsonb_build_object('issue', 'reserve', 'rendez_vous_id', v_rdv);
end;
$$;

-- ============================================================
-- 4. Ce que fait le client
-- ============================================================

-- Le client choisit l'un des créneaux proposés. `p_client` : le client de la
-- session, déjà vérifié par le serveur, revérifié ici. Rend l'issue de la
-- réservation. Un créneau devenu indisponible entre-temps est retiré de la
-- proposition : le client voit aussitôt ceux qui restent.
create or replace function public.ec_choisir_creneau_crm(p_creneau uuid, p_client uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_crm_creneau integer;
  v_dossier     integer;
  v_commercial  integer;
  v_type        text;
  v_duree       integer;
  v_debut       timestamptz;
  v_issue       text;
begin
  select e.crm_creneau_id into v_crm_creneau
    from public.ec_creneaux e join public.ec_dossiers d on d.id = e.dossier_id
   where e.id = p_creneau and d.client_id = p_client;
  if not found then
    return 'inconnu';
  end if;
  select p.dossier_id, p.commercial_id, p.type, p.duree_min, c.debut
    into v_dossier, v_commercial, v_type, v_duree, v_debut
    from crm.creneaux_visite c join crm.propositions_visite p on p.id = c.proposition_id
   where c.id = v_crm_creneau;
  if not found then
    return 'inconnu';
  end if;

  v_issue := public.ec_poser_visite_crm(v_dossier, v_commercial, v_type, v_debut, v_duree, v_crm_creneau, 'espace', null) ->> 'issue';
  if v_issue in ('pris', 'passe') then
    update crm.creneaux_visite set statut = 'libere' where id = v_crm_creneau and statut = 'propose';
    insert into crm.activite (dossier_id, libelle)
    values (v_dossier, 'Le client a choisi un créneau de visite devenu indisponible : '
            || to_char(v_debut at time zone 'Europe/Paris', 'DD/MM/YYYY') || ' à ' || to_char(v_debut at time zone 'Europe/Paris', 'HH24"h"MI'));
    perform public.ec_projeter_visites_crm(v_dossier);
  end if;
  return v_issue;
end;
$$;

-- Aucun créneau ne convient : la demande est notée sur la proposition et au
-- fil d'activité du dossier. Rend 'demande', ou 'sans_proposition' si aucune
-- proposition n'est ouverte (la demande est alors notée au fil seulement).
create or replace function public.ec_demander_creneaux_crm(p_dossier uuid, p_client uuid, p_message text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_crm     integer;
  v_prop    integer;
  v_message text := nullif(left(btrim(coalesce(p_message, '')), 600), '');
begin
  select d.crm_dossier_id into v_crm from public.ec_dossiers d where d.id = p_dossier and d.client_id = p_client;
  if v_crm is null or not exists (select 1 from crm.dossiers where id = v_crm) then
    return 'inconnu';
  end if;
  update crm.propositions_visite set autres_demandes_le = now(), message_client = v_message
   where dossier_id = v_crm and statut = 'ouverte'
  returning id into v_prop;
  insert into crm.activite (dossier_id, libelle)
  values (v_crm, left('Le client demande d''autres créneaux de visite' || coalesce(' : « ' || v_message || ' »', ''), 300));
  update crm.dossiers set maj_le = now() where id = v_crm;
  perform public.ec_projeter_visites_crm(v_crm);
  return case when v_prop is null then 'sans_proposition' else 'demande' end;
end;
$$;

-- ============================================================
-- 5. Les droits
-- ============================================================

revoke all on function public.ec_projeter_visites_crm(integer) from public, anon, authenticated;
revoke all on function public.ec_poser_visite_crm(integer, integer, text, timestamptz, integer, integer, text, integer) from public, anon, authenticated;
revoke all on function public.ec_choisir_creneau_crm(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ec_demander_creneaux_crm(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.ec_projeter_visites_crm(integer) to service_role;
grant execute on function public.ec_poser_visite_crm(integer, integer, text, timestamptz, integer, integer, text, integer) to service_role;
grant execute on function public.ec_choisir_creneau_crm(uuid, uuid) to service_role;
grant execute on function public.ec_demander_creneaux_crm(uuid, uuid, text) to service_role;

-- Les tables : la clé publique n'a rien ; un client connecté lit ses lignes, et n'écrit rien.
revoke all on table public.ec_creneaux, public.ec_visites from anon, authenticated;
grant select on table public.ec_creneaux, public.ec_visites to authenticated;
alter table public.ec_creneaux enable row level security;
alter table public.ec_visites enable row level security;

create or replace function pg_temp.ec_lecture_visite(p_table text)
returns void
language plpgsql
as $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = p_table and policyname = p_table || '_lecture_client'
  ) then
    execute format(
      'create policy %I on public.%I as permissive for select to authenticated using (dossier_id in (select public.ec_dossiers_courants()))',
      p_table || '_lecture_client', p_table
    );
  end if;
end;
$$;
select pg_temp.ec_lecture_visite('ec_creneaux');
select pg_temp.ec_lecture_visite('ec_visites');

-- L'API recharge son schéma pour voir les tables et les fonctions nouvelles.
notify pgrst, 'reload schema';
