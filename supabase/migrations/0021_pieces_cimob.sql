-- ============================================================
-- 0021 — Les pièces CIMOB/DICOM : pièces conditionnelles et modèles à télécharger
-- ============================================================
--
-- Céline (directrice du service national, mail du 17/11/2026) a donné la
-- liste des pièces réclamées aux clients CIMOB/DICOM — militaires mutés de
-- ou vers l'outre-mer, segment « militaire » de l'espace client — et les
-- modèles qu'ils doivent remplir. Il manquait trois choses à l'espace :
--
--   1. des pièces CONDITIONNELLES (colonne ec_document_requirements.condition) :
--      la déclaration de valeurs du repli n'est demandée qu'à qui fait un
--      repli ; la déclaration de valeur, la carte grise et le certificat de
--      non gage, qu'à qui fait transporter un véhicule ; la fiche de sécurité
--      de la batterie, qu'à un véhicule électrique ou hybride ; le certificat
--      de changement de résidence, qu'à une arrivée à Mayotte ; la
--      déclaration du lot et l'attestation d'hébergement, qu'à une arrivée
--      outre-mer ;
--
--   2. de quoi en juger. Ces faits vivent dans le CRM (crm.replis,
--      crm.vehicules, crm.dossiers.vehicule, crm.etapes_trajet.departement_om,
--      posés au démarrage du CRM par apps/interne/src/crm/cimob/schema.ts).
--      L'espace client ne lit jamais le schéma crm : ec_projeter_situation_crm()
--      les PROJETTE sur ec_dossiers, comme la migration 0012 projette le reste
--      du dossier, et le CRM l'appelle après chaque changement
--      (apps/interne/src/crm/lib/espace.ts). Une colonne restée null veut dire
--      « le CRM ne le dit pas » : la pièce est alors demandée « si vous êtes
--      concerné », facultative, jamais cachée (packages/commun/src/lib/
--      espace-client/pieces.ts) ;
--
--   3. des MODÈLES à télécharger (table ec_modeles_pieces) : une pièce peut en
--      avoir plusieurs — le CERFA a son modèle et un exemple rempli. Les
--      fichiers vont dans un seau privé, « espace-client-modeles », jamais
--      dans le dépôt Git (public) ; le serveur les sert comme les documents
--      des dossiers : lien signé de cinq minutes, session vérifiée, puis URL
--      signée du seau valable 60 secondes. Un seau à part, parce que les
--      modèles ne sont à aucun dossier et que leurs formats (Word…) ne sont
--      pas ceux qu'un client peut déposer dans le seau « espace-client ».
--
-- La liste des pièces n'est pas ici : elle vit dans le code
-- (packages/commun/src/lib/espace-client/seed.ts) et se pose sur une base,
-- avec les modèles, par scripts/pieces-cimob.mjs. Le code tourne sans cette
-- migration : sans condition, chaque pièce est demandée à tous les dossiers
-- de son pays et de son segment ; sans table des modèles, aucun lien.
--
-- Cloisonnement : un client connecté lit les modèles des pièces communes et
-- de son segment, rien d'autre, et n'écrit rien. Le seau n'a aucune
-- politique : la clé publique n'y lit ni n'y écrit rien. Les fonctions sont
-- réservées à la clé de service et au serveur du CRM.
--
-- Rien d'existant n'est modifié hors de l'espace client, et aucune ligne :
-- deux tables gagnent des colonnes ; une table, un seau et deux fonctions
-- sont créés. Idempotente : elle se rejoue sans erreur et sans rien effacer.
-- Après 0020, par scripts/appliquer-migrations.mjs ; puis
-- scripts/pieces-cimob.mjs.

-- ============================================================
-- 1. La condition d'une pièce
-- ============================================================

-- null : demandée à tous les dossiers de son pays et de son segment.
alter table public.ec_document_requirements add column if not exists condition text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ec_document_requirements_condition_check') then
    alter table public.ec_document_requirements add constraint ec_document_requirements_condition_check
      check (condition is null or condition in ('repli', 'vehicule', 'vehicule_electrique', 'destination_outre_mer', 'destination_mayotte'));
  end if;
end;
$$;

-- ============================================================
-- 2. La situation du dossier, projetée du CRM
-- ============================================================

-- null partout : le CRM ne le dit pas (dossier non relié, pas encore projeté).
-- Un repli est prévu ; null : la fenêtre « Repli et véhicules » n'a jamais été enregistrée.
alter table public.ec_dossiers add column if not exists repli boolean;
-- Le nombre de véhicules transportés ; 0 : aucun.
alter table public.ec_dossiers add column if not exists vehicules integer;
-- Au moins un véhicule électrique ou hybride ; null : une motorisation n'est pas renseignée.
alter table public.ec_dossiers add column if not exists vehicule_electrique boolean;
-- Les départements ou collectivités d'outre-mer (971…988) des adresses de départ et d'arrivée.
alter table public.ec_dossiers add column if not exists departements_om_depart text[];
alter table public.ec_dossiers add column if not exists departements_om_arrivee text[];
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ec_dossiers_vehicules_check') then
    alter table public.ec_dossiers add constraint ec_dossiers_vehicules_check check (vehicules is null or vehicules >= 0);
  end if;
end;
$$;

-- Le département d'outre-mer d'une adresse du CRM : le code saisi (« IMPÉRATIF »
-- dans le mail de Céline), sinon celui du code postal — 97200 → 972 ;
-- Saint-Barthélemy (97133) et Saint-Martin (97150) ont gardé un code postal
-- de la Guadeloupe. La règle de departementDepuisCodePostal
-- (apps/interne/src/crm/cimob/commun.ts).
create or replace function public.ec_departement_om(p_code text, p_code_postal text)
returns text
language sql
immutable
set search_path = ''
as $$
  with x as (
    select nullif(btrim(coalesce(p_code, '')), '') as code,
           regexp_replace(coalesce(p_code_postal, ''), '\s', '', 'g') as cp,
           array['971', '972', '973', '974', '975', '976', '977', '978', '986', '987', '988'] as codes
  )
  select case
    when x.code = any (x.codes) then x.code
    when x.cp = '97133' then '977'
    when x.cp = '97150' then '978'
    when x.cp ~ '^9[78][0-9]{3}$' and left(x.cp, 3) = any (x.codes) then left(x.cp, 3)
  end
  from x
$$;

-- Recopie sur l'espace client ce que le CRM dit du repli, des véhicules et
-- de l'outre-mer d'un dossier. Sans effet sur un dossier sans espace. Rend
-- l'identifiant de l'espace.
create or replace function public.ec_projeter_situation_crm(p_crm integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ec          uuid;
  v_vehicule    boolean;
  v_repli       boolean;
  v_lignes      integer;
  v_electrique  boolean;
  v_inconnue    boolean;
  v_depart      text[];
  v_arrivee     text[];
begin
  -- Une projection à la fois par dossier : le verrou de ec_projeter_dossier_crm.
  select id into v_ec from public.ec_dossiers where crm_dossier_id = p_crm for update;
  if not found then
    return null;
  end if;

  select coalesce(d.vehicule, false) into v_vehicule from crm.dossiers d where d.id = p_crm;
  if not found then
    -- Le dossier du CRM a disparu : l'espace reste tel quel, rien n'est effacé.
    return v_ec;
  end if;

  -- Le repli : la ligne de la fenêtre « Repli et véhicules ». Sans ligne, elle n'a jamais été enregistrée.
  select r.repli into v_repli from crm.replis r where r.dossier_id = p_crm;

  -- Les véhicules : « Véhicule » Oui ou Non sur le dossier, puis la liste avec la motorisation de chacun.
  select count(*)::integer,
         coalesce(bool_or(v.motorisation in ('electrique', 'hybride')), false),
         coalesce(bool_or(v.motorisation is null), false)
    into v_lignes, v_electrique, v_inconnue
    from crm.vehicules v
   where v.dossier_id = p_crm;

  -- Les départements d'outre-mer du départ et de l'arrivée.
  select coalesce(array_agg(distinct x.code order by x.code) filter (where x.genre = 'depart' and x.code is not null), '{}'),
         coalesce(array_agg(distinct x.code order by x.code) filter (where x.genre = 'arrivee' and x.code is not null), '{}')
    into v_depart, v_arrivee
    from (
      select e.genre, public.ec_departement_om(e.departement_om, e.code_postal) as code
        from crm.etapes_trajet e
       where e.dossier_id = p_crm and e.genre in ('depart', 'arrivee')
    ) x;

  update public.ec_dossiers x set
    repli = v_repli,
    -- « Oui » sans liste : un véhicule, dont on ne sait rien d'autre.
    vehicules = case when v_vehicule then greatest(v_lignes, 1) else 0 end,
    vehicule_electrique = case
      when not v_vehicule then false
      when v_electrique then true
      when v_lignes = 0 or v_inconnue then null
      else false
    end,
    departements_om_depart = v_depart,
    departements_om_arrivee = v_arrivee
  where x.id = v_ec;

  return v_ec;
end;
$$;

revoke all on function public.ec_departement_om(text, text) from public, anon, authenticated;
revoke all on function public.ec_projeter_situation_crm(integer) from public, anon, authenticated;
grant execute on function public.ec_departement_om(text, text) to service_role;
grant execute on function public.ec_projeter_situation_crm(integer) to service_role;

-- ============================================================
-- 3. Les modèles à télécharger
-- ============================================================

create table if not exists public.ec_modeles_pieces (
  id              uuid primary key default gen_random_uuid(),
  -- La pièce qui le propose ; une pièce retirée emporte ses modèles (leurs
  -- fichiers sont retirés du seau par l'action de l'équipe, avant).
  requirement_id  uuid not null references public.ec_document_requirements (id) on delete cascade,
  -- « Modèle », « Exemple rempli » : ce que le client lit sur le lien.
  libelle         text not null default 'Modèle',
  -- Le chemin dans le seau privé « espace-client-modeles ».
  chemin          text not null unique,
  nom_fichier     text not null,
  mime            text not null,
  taille_octets   bigint not null default 0,
  ordre           integer not null default 0,
  created_by      text not null default '',
  created_at      timestamptz not null default now()
);
create index if not exists ec_modeles_pieces_requirement_idx on public.ec_modeles_pieces (requirement_id, ordre);

-- La clé publique n'a rien ; un client connecté lit, et n'écrit rien.
revoke all on table public.ec_modeles_pieces from anon, authenticated;
grant select on table public.ec_modeles_pieces to authenticated;
alter table public.ec_modeles_pieces enable row level security;

-- Le client connecté (par une session du registre, comme en 0011) lit les
-- modèles des pièces de tous les segments et de son segment. Ce sont des
-- formulaires vierges, sans donnée de personne : la destination et la
-- condition ne sont pas revérifiées ici, le serveur le fait avant de servir
-- un fichier (modeles.ts).
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'ec_modeles_pieces' and policyname = 'ec_modeles_pieces_lecture_client'
  ) then
    create policy ec_modeles_pieces_lecture_client on public.ec_modeles_pieces as permissive for select to authenticated
      using (
        (select public.ec_client_courant()) is not null
        and requirement_id in (
          select r.id from public.ec_document_requirements r
           where r.segment is null
              or r.segment = (select c.type from public.ec_clients c where c.id = (select public.ec_client_courant()))
        )
      );
  end if;
end;
$$;

-- Le seau : privé, aucune politique sur storage.objects. 10 Mo par fichier,
-- et les seuls formats d'un modèle (packages/commun/src/lib/espace-client/
-- modeles-schema.ts) : PDF, Word, LibreOffice, Excel, JPEG, PNG.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'espace-client-modeles', 'espace-client-modeles', false, 10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.oasis.opendocument.spreadsheet',
    'image/jpeg',
    'image/png'
  ]
)
on conflict (id) do nothing;

-- ============================================================
-- 4. Le rattrapage : les espaces déjà reliés au CRM
-- ============================================================

-- Une fois, pour ne pas attendre la prochaine action du CRM sur chaque
-- dossier. Si les tables CIMOB/DICOM du CRM manquent encore (le CRM les pose
-- à son démarrage), on s'arrête là sans échouer : la projection se fera à la
-- prochaine action du CRM.
do $$
declare
  v_crm integer;
begin
  for v_crm in select crm_dossier_id from public.ec_dossiers where crm_dossier_id is not null order by crm_dossier_id loop
    begin
      perform public.ec_projeter_situation_crm(v_crm);
    exception when undefined_table or undefined_column or invalid_schema_name then
      raise notice '0021 : les tables CIMOB/DICOM du CRM manquent encore ; la situation des dossiers se projettera à la prochaine action du CRM.';
      exit;
    end;
  end loop;
end;
$$;

-- L'API recharge son schéma pour voir la table, les colonnes et les fonctions nouvelles.
notify pgrst, 'reload schema';
