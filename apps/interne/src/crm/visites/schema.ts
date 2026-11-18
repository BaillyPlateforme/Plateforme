/*
 * La visite technique (cahier des charges, §3.2), dans le schéma `crm`.
 * Appliquée au démarrage avec le reste du schéma (lib/schema.ts), en une
 * requête idempotente : on peut la rejouer autant qu'on veut.
 *
 * - propositions_visite et creneaux_visite : les créneaux que le commercial
 *   propose au client, tirés de son planning. Une proposition ouverte par
 *   dossier ; ses créneaux tiennent la place dans le planning du commercial
 *   tant qu'elle est ouverte. Le créneau choisi devient un rendez-vous
 *   (crm.rendez_vous), les autres se libèrent.
 * - visites : la saisie sur la tablette, puis le compte-rendu signé. La
 *   signature fige la ligne (contenu, empreinte, signataire, image de la
 *   signature, heure du serveur) : un déclencheur refuse toute modification
 *   ensuite. Une nouvelle visite fait un nouveau compte-rendu.
 * - pieces : les pièces du logement, pour ranger l'inventaire du dossier
 *   (crm.inventaire, qui reste l'inventaire unique : la tablette l'enrichit,
 *   elle n'en tient pas un second), y joindre une remarque et des photos.
 *   La colonne texte inventaire.piece est gardée à jour : les écrans du CRM
 *   qui regroupent par pièce n'ont pas à changer.
 * - visite_photos : les photos d'une visite, rangées par pièce, dans le seau
 *   privé « photos-chantier » (le même que l'outil terrain), sous visites/.
 * - les accès de chaque étape du trajet (escalier, portage, stationnement,
 *   accès poids lourd, monte-meuble), avec le vocabulaire du questionnaire
 *   des conditions de livraison de l'espace client.
 *
 * Le modèle d'e-mail « Rappel de visite (veille) » manquait à côté du SMS du
 * même nom : il est ajouté s'il n'existe pas, et l'équipe peut le retoucher
 * dans « Courriers et SMS ».
 */
export const SCHEMA_VISITES = `
create table if not exists crm.propositions_visite (
  id serial primary key,
  dossier_id int not null references crm.dossiers(id) on delete cascade,
  commercial_id int not null references crm.utilisateurs(id),
  type text not null default 'phys' check (type in ('phys','visio')),
  duree_min int not null default 60 check (duree_min between 15 and 480),
  statut text not null default 'ouverte' check (statut in ('ouverte','retenue','retiree')),
  autres_demandes_le timestamptz, message_client text,
  propose_par int references crm.utilisateurs(id) on delete set null,
  propose_le timestamptz not null default now(), close_le timestamptz,
  demo boolean not null default false
);
create unique index if not exists idx_propositions_visite_ouverte on crm.propositions_visite(dossier_id) where statut = 'ouverte';
create index if not exists idx_propositions_visite_commercial on crm.propositions_visite(commercial_id) where statut = 'ouverte';
create table if not exists crm.creneaux_visite (
  id serial primary key,
  proposition_id int not null references crm.propositions_visite(id) on delete cascade,
  debut timestamptz not null,
  statut text not null default 'propose' check (statut in ('propose','retenu','libere')),
  rendez_vous_id int references crm.rendez_vous(id) on delete set null
);
create index if not exists idx_creneaux_visite_proposition on crm.creneaux_visite(proposition_id);
create index if not exists idx_creneaux_visite_debut on crm.creneaux_visite(debut) where statut = 'propose';

create table if not exists crm.visites (
  id serial primary key,
  dossier_id int not null references crm.dossiers(id) on delete cascade,
  rendez_vous_id int references crm.rendez_vous(id) on delete set null,
  commercial_id int references crm.utilisateurs(id) on delete set null,
  statut text not null default 'en_cours' check (statut in ('en_cours','signee')),
  remarques text,
  options jsonb not null default '[]' check (jsonb_typeof(options) = 'array'),
  formule text check (formule in ('premium','standard','economique')),
  commencee_le timestamptz not null default now(), maj_le timestamptz not null default now(),
  contenu jsonb, empreinte text, signataire text, signature text, signe_le timestamptz, signe_ip text, signe_agent text,
  document_chemin text, document_taille int,
  demo boolean not null default false,
  check (statut = 'en_cours' or (contenu is not null and empreinte is not null and signataire is not null and signature is not null and signe_le is not null))
);
create unique index if not exists idx_visites_ouverte on crm.visites(dossier_id) where statut = 'en_cours';
create index if not exists idx_visites_dossier on crm.visites(dossier_id, commencee_le desc);
create index if not exists idx_visites_rdv on crm.visites(rendez_vous_id);

create table if not exists crm.pieces (
  id serial primary key,
  cle uuid not null unique default gen_random_uuid(),
  dossier_id int not null references crm.dossiers(id) on delete cascade,
  nom text not null, ordre double precision not null default 0, remarque text,
  cree_le timestamptz not null default now()
);
create index if not exists idx_pieces_dossier on crm.pieces(dossier_id, ordre);
alter table crm.inventaire add column if not exists cle uuid;
create unique index if not exists idx_inventaire_cle on crm.inventaire(cle);
alter table crm.inventaire add column if not exists piece_id int references crm.pieces(id) on delete cascade;
alter table crm.inventaire add column if not exists fragile boolean not null default false;
alter table crm.inventaire add column if not exists note text;
alter table crm.inventaire add column if not exists ordre double precision not null default 0;
create index if not exists idx_inventaire_dossier on crm.inventaire(dossier_id);

create table if not exists crm.visite_photos (
  id serial primary key,
  cle uuid not null unique,
  visite_id int not null references crm.visites(id) on delete cascade,
  piece_cle uuid, piece_nom text,
  chemin text not null, chemin_vignette text, type text not null, taille int not null, largeur int, hauteur int,
  auteur_id int references crm.utilisateurs(id) on delete set null,
  prise_le timestamptz not null default now(),
  demo boolean not null default false
);
create index if not exists idx_visite_photos_visite on crm.visite_photos(visite_id, prise_le);

alter table crm.etapes_trajet add column if not exists escalier text;
alter table crm.etapes_trajet add column if not exists portage_m int;
alter table crm.etapes_trajet add column if not exists stationnement text;
alter table crm.etapes_trajet add column if not exists poids_lourd text;
alter table crm.etapes_trajet add column if not exists monte_meuble text;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'crm.etapes_trajet'::regclass and conname = 'etapes_trajet_acces_visite_check') then
    alter table crm.etapes_trajet add constraint etapes_trajet_acces_visite_check check (
      (escalier is null or escalier in ('aucun','droit','colimacon','etroit'))
      and (portage_m is null or portage_m between 0 and 1000)
      and (stationnement is null or stationnement in ('facile','autorisation','reserve_client'))
      and (poids_lourd is null or poids_lourd in ('oui','non','ne_sait_pas'))
      and (monte_meuble is null or monte_meuble in ('oui','non','a_evaluer')));
  end if;
end $$;

-- Le planning commercial (audit Créagidem) : la journée entière (« journée
-- visio »), posée à midi et sans durée — elle ne chevauche aucun créneau, elle
-- informe — et la visite classée sans suite.
alter table crm.rendez_vous add column if not exists journee boolean not null default false;
alter table crm.rendez_vous add column if not exists sans_suite boolean not null default false;

-- La fenêtre de visite (audit Créagidem) : pour chaque adresse, le code
-- postal, la ville, le pays, un téléphone sur place, le monte-charge et le
-- transbordement. Le portage, le monte-meuble et la demande de stationnement
-- (stationnement = 'autorisation') existent déjà ci-dessus.
alter table crm.etapes_trajet add column if not exists code_postal text;
alter table crm.etapes_trajet add column if not exists ville text;
alter table crm.etapes_trajet add column if not exists pays text;
alter table crm.etapes_trajet add column if not exists telephone text;
alter table crm.etapes_trajet add column if not exists monte_charge boolean not null default false;
alter table crm.etapes_trajet add column if not exists transbordement boolean not null default false;
-- Retours de Céline (16/11/2026) : la fiche du premier appel et la fenêtre de visite.
alter table crm.etapes_trajet add column if not exists ascenseur_taille text;
alter table crm.etapes_trajet add column if not exists code_acces text;
alter table crm.etapes_trajet add column if not exists surface_m2 int;
alter table crm.etapes_trajet add column if not exists acces_camion text;
alter table crm.etapes_trajet add column if not exists portage boolean not null default false;
alter table crm.etapes_trajet add column if not exists escalier_precision text;
alter table crm.etapes_trajet add column if not exists stationnement_precision text;

-- Un compte-rendu signé ne se modifie plus. Seuls changent encore les liens
-- qui ne touchent pas au contenu (le rendez-vous supprimé, le commercial
-- parti) et le chemin du PDF, posé une seule fois après la signature.
create or replace function crm.visite_figee() returns trigger language plpgsql as $f$
begin
  if old.statut = 'signee' and (
       new.statut is distinct from old.statut or new.dossier_id is distinct from old.dossier_id
    or new.contenu is distinct from old.contenu or new.empreinte is distinct from old.empreinte
    or new.signataire is distinct from old.signataire or new.signature is distinct from old.signature
    or new.signe_le is distinct from old.signe_le or new.remarques is distinct from old.remarques
    or new.options is distinct from old.options or new.formule is distinct from old.formule
    or (old.document_chemin is not null and new.document_chemin is distinct from old.document_chemin)
    or (old.document_chemin is not null and new.document_taille is distinct from old.document_taille)) then
    raise exception 'Ce compte-rendu de visite est signé : il ne se modifie plus.' using errcode = 'P0001';
  end if;
  return new;
end $f$;
create or replace trigger visites_figees before update on crm.visites for each row execute function crm.visite_figee();

-- Les photos d'un compte-rendu signé non plus : ni ajout, ni retrait, ni
-- déplacement. La suppression du dossier entier les emporte (cascade).
create or replace function crm.photo_visite_figee() returns trigger language plpgsql as $f$
declare
  v int := case when tg_op = 'DELETE' then old.visite_id else new.visite_id end;
begin
  if tg_op = 'UPDATE' and new.cle = old.cle and new.chemin = old.chemin and new.visite_id = old.visite_id
     and new.piece_cle is not distinct from old.piece_cle and new.chemin_vignette is not distinct from old.chemin_vignette then
    return new;
  end if;
  if exists (select 1 from crm.visites where id = v and statut = 'signee') then
    raise exception 'Ce compte-rendu de visite est signé : ses photos ne changent plus.' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $f$;
create or replace trigger visite_photos_figees before insert or update or delete on crm.visite_photos
  for each row execute function crm.photo_visite_figee();

-- La tablette répartit l'inventaire entre les destinations du dossier (retours
-- de Céline, 16/11/2026 : garde-meuble, livraison en province, livraison à
-- Paris…). Un objet, et une pièce pour ses objets à venir, se rattachent à une
-- étape du trajet ; la colonne texte inventaire.destination suit son libellé.
-- Une étape retirée du trajet laisse l'objet sans étape, avec son dernier libellé.
alter table crm.inventaire add column if not exists etape_id int references crm.etapes_trajet(id) on delete set null;
alter table crm.pieces add column if not exists etape_id int references crm.etapes_trajet(id) on delete set null;

-- La synthèse de Dragan (18/11/2026), tablette de visite :
-- - les destinations hors adresse, sur chaque ligne et pour une pièce : à
--   laisser sur place, débarras, pris en charge par le client, à confirmer
--   (lib/visite/destinations.ts). Une destination hors adresse remplace
--   l'étape ; la colonne texte inventaire.destination suit son libellé. Le
--   volume du dossier est le volume transporté : sans « sur_place » ni
--   « client » (visites/volume.ts) ;
-- - la désignation anglaise du catalogue, gardée sur la ligne (documents
--   bilingues) ;
-- - les protections du catalogue (« Non compté ») : hors cubage, volume nul.
alter table crm.inventaire add column if not exists destination_speciale text;
alter table crm.inventaire add column if not exists libelle_en text;
alter table crm.inventaire add column if not exists hors_cubage boolean not null default false;
alter table crm.pieces add column if not exists destination_speciale text;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'crm.inventaire'::regclass and conname = 'inventaire_destination_speciale_check') then
    alter table crm.inventaire add constraint inventaire_destination_speciale_check
      check (destination_speciale is null or destination_speciale in ('sur_place','debarras','client','a_confirmer'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'crm.pieces'::regclass and conname = 'pieces_destination_speciale_check') then
    alter table crm.pieces add constraint pieces_destination_speciale_check
      check (destination_speciale is null or destination_speciale in ('sur_place','debarras','client','a_confirmer'));
  end if;
end $$;

insert into crm.modeles_messages(canal, nom, objet, corps)
select 'email', 'Rappel de visite (veille)', 'Votre visite technique de demain · {ref}',
  'Bonjour {client},

{commercial} passera chez vous demain, {date} à {heure}, pour la visite technique de votre déménagement.

Adresse : {adresse}

À demain,
{commercial}
Bailly Déménagement'
where not exists (select 1 from crm.modeles_messages where canal = 'email' and nom = 'Rappel de visite (veille)');

alter table crm.propositions_visite enable row level security;
alter table crm.creneaux_visite enable row level security;
alter table crm.visites enable row level security;
alter table crm.pieces enable row level security;
alter table crm.visite_photos enable row level security;
`;
