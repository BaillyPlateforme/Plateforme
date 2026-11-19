/*
 * Le devis complet, à la manière de Créagidem (audit du 08/11/2026, sections
 * H à K) : ajouts idempotents au schéma `crm`, rejoués à chaque démarrage
 * (voir lib/schema.ts, qui les ajoute en fin de requête).
 *
 * Les devis d'avant gardent leurs colonnes et leurs lignes : `lignes` reste
 * le tableau que lisent la fiche, le Kanban, le Parcours et la projection
 * vers l'espace client (libellé, `prix` TTC, `charge`). Les lignes du
 * nouveau chiffrage y ajoutent leurs champs (quantité, prix unitaire, TVA…)
 * et gardent `prix`, recalculé à chaque enregistrement.
 *
 * - `saisie` : 'ttc' pour les devis d'avant (prix saisis TTC), 'ht' pour les
 *   nouveaux (prix unitaires HT, comme Créagidem) ;
 * - `mode` : 'forfait' (un prix global imprimé) ou 'postes' (lignes
 *   détaillées) ; les devis d'avant sont détaillés ;
 * - `origine` : d'où vient le devis ('formules' pour le générateur des trois
 *   formules, 'libre', 'copie') ; le générateur ne remplace que les siens.
 *   Un devis du générateur enregistré dans la fenêtre Devis passe à 'ajuste'
 *   (retours de Céline, 16/11/2026 : « nous adaptons nos prix à chaque
 *   client ») : ses prix saisis à la main ne sont plus jamais remplacés.
 * - Aucune valeur métier n'est inventée : taux, conditions et CGV sont vides
 *   tant que Bailly ne les a pas fournis (table crm.devis_parametres).
 */
export const SCHEMA_DEVIS = `
do $$ begin
  if exists (select 1 from pg_constraint where conrelid = 'crm.devis'::regclass and conname = 'devis_formule_check'
             and pg_get_constraintdef(oid) not like '%libre%') then
    alter table crm.devis drop constraint devis_formule_check;
    alter table crm.devis add constraint devis_formule_check check (formule in ('premium','standard','economique','libre'));
  end if;
end $$;
alter table crm.devis add column if not exists titre text;
alter table crm.devis add column if not exists origine text;
alter table crm.devis add column if not exists copie_de int;
alter table crm.devis add column if not exists saisie text not null default 'ttc';
alter table crm.devis add column if not exists mode text not null default 'postes';
alter table crm.devis add column if not exists remise_pct numeric(5,2) not null default 0;
alter table crm.devis add column if not exists montant_ht numeric(10,2);
alter table crm.devis add column if not exists montant_tva numeric(10,2);
alter table crm.devis add column if not exists commercial_id int references crm.utilisateurs(id) on delete set null;
alter table crm.devis add column if not exists date_devis date;
alter table crm.devis add column if not exists date_visite date;
alter table crm.devis add column if not exists poids_lourds text;
alter table crm.devis add column if not exists arrhes_pct numeric(5,2);
alter table crm.devis add column if not exists reglement_solde text;
alter table crm.devis add column if not exists commentaire_interne text;
alter table crm.devis add column if not exists ref_interne text;
alter table crm.devis add column if not exists categorie_specifique boolean not null default false;
alter table crm.devis add column if not exists categorie_libelle text;
alter table crm.devis add column if not exists assurance jsonb not null default '{}';
alter table crm.devis add column if not exists achats jsonb not null default '[]';
alter table crm.devis add column if not exists moyens jsonb not null default '{}';
alter table crm.devis add column if not exists international jsonb not null default '{}';
alter table crm.devis add column if not exists validation jsonb;
alter table crm.devis add column if not exists retire_le timestamptz;
alter table crm.devis add column if not exists maj_le timestamptz;
alter table crm.dossiers add column if not exists origine_demande text;
create table if not exists crm.devis_parametres (
  cle text primary key, valeur jsonb not null, maj_le timestamptz not null default now(), maj_par text
);
alter table crm.devis_parametres enable row level security;
-- La preuve d'une signature par le lien de l'e-mail : le jour, l'adresse IP, l'appareil, la case cochée et les CGV lues.
alter table crm.devis add column if not exists signature_trace jsonb;

-- Le devis tel que le client le voit dans son espace (public.ec_devis) suit
-- le devis du CRM, quelle que soit la fonction qui l'y écrit (projection du
-- dossier, signature, paiement des arrhes) :
--   - les arrhes : celles du devis (onglet Données contractuelles), sinon
--     celles des paramètres du devis, sinon 30 % — et seulement pour les
--     clients qui les règlent en ligne (la projection met 0 aux autres) ;
--   - le hors-taxes de chaque ligne, à son propre taux de TVA (l'assurance au
--     sien), et le total HT enregistré par le CRM ;
--   - « Ce qui est inclus » : les prestations que Bailly assure ;
--   - la garantie sous son nom (« Assurance … » jusqu'au 16/11/2026, retours
--     de Céline) : les lignes automatiques des devis d'avant sont renommées ;
--   - la validité : celle du devis, sinon un mois après son émission.
-- Une erreur ici ne bloque jamais la projection : la ligne garde ses valeurs.
create or replace function crm.ec_devis_du_crm() returns trigger language plpgsql security definer set search_path = '' as $f$
declare
  v record;
  p_arrhes numeric;
  p_tva numeric;
  p_tva_ass numeric;
begin
  if new.crm_devis_id is null then return new; end if;
  begin
    select d.arrhes_pct, d.montant_ht, d.lignes, d.prestations, d.validite into v from crm.devis d where d.id = new.crm_devis_id;
    if not found then return new; end if;
    select case when jsonb_typeof(valeur) = 'number' then (valeur #>> '{}')::numeric end into p_arrhes from crm.devis_parametres where cle = 'arrhesPct';
    select case when jsonb_typeof(valeur) = 'number' then (valeur #>> '{}')::numeric end into p_tva from crm.devis_parametres where cle = 'tvaDefaut';
    select case when jsonb_typeof(valeur) = 'number' then (valeur #>> '{}')::numeric end into p_tva_ass from crm.devis_parametres where cle = 'tvaAssurance';
    if new.arrhes_pourcentage > 0 then
      new.arrhes_pourcentage := least(100, greatest(0, round(coalesce(v.arrhes_pct, p_arrhes, 30))))::smallint;
    end if;
    new.lignes := coalesce((
      select jsonb_agg(
               jsonb_build_object('libelle', case when l ->> 'auto' = 'assurance' then regexp_replace(l ->> 'libelle', '^Assurance', 'Garantie') else l ->> 'libelle' end, 'montant_ht', round(coalesce((l ->> 'prix')::numeric, 0)
                 / (1 + coalesce(case when jsonb_typeof(l -> 'tva') = 'number' then (l ->> 'tva')::numeric end,
                                 case when l ->> 'auto' = 'assurance' then coalesce(p_tva_ass, p_tva) end, p_tva, 20) / 100), 2))
               || case when coalesce(l ->> 'detail', '') <> '' then jsonb_build_object('detail', l ->> 'detail') else '{}'::jsonb end
               order by o)
        from jsonb_array_elements(case when jsonb_typeof(v.lignes) = 'array' then v.lignes else '[]'::jsonb end) with ordinality as t(l, o)
       where coalesce(l ->> 'charge', 'bailly') <> 'client'
    ), '[]'::jsonb);
    if v.montant_ht is not null and v.montant_ht > 0 then new.montant_ht := v.montant_ht; end if;
    if new.emis_le is not null then new.valide_jusqu_au := coalesce(v.validite, (new.emis_le + interval '1 month')::date); end if;
    new.inclus := coalesce((
      select array_agg(btrim(x ->> 'libelle') order by o)
        from jsonb_array_elements(case when jsonb_typeof(v.prestations) = 'array' then v.prestations else '[]'::jsonb end) with ordinality as t(x, o)
       where x ->> 'charge' = 'bailly' and btrim(coalesce(x ->> 'libelle', '')) <> ''
    ), '{}'::text[]);
  exception when others then
    raise warning 'BaillyCRM : devis % de l''espace client non aligné sur le CRM (%)', new.crm_devis_id, sqlerrm;
  end;
  return new;
end $f$;
do $$ begin
  if to_regclass('public.ec_devis') is not null then
    drop trigger if exists ec_devis_du_crm on public.ec_devis;
    create trigger ec_devis_du_crm before insert or update on public.ec_devis for each row execute function crm.ec_devis_du_crm();
    -- Les devis déjà dans les espaces : alignés une fois (la mise à jour passe par le déclencheur).
    if not exists (select 1 from crm.devis_parametres where cle = '_ec_devis_aligne_v1') then
      update public.ec_devis set crm_devis_id = crm_devis_id where crm_devis_id is not null;
      insert into crm.devis_parametres(cle, valeur, maj_par) values ('_ec_devis_aligne_v1', 'true', 'démarrage') on conflict (cle) do nothing;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Retours de Céline (16/11/2026) : le devis.
-- ---------------------------------------------------------------------------

-- Les devis du générateur déjà enregistrés dans la fenêtre Devis (montant HT
-- posé par l'enregistrement) portent les prix de l'équipe : « Générer les
-- devis » ne les remplace plus (origine 'ajuste', voir devis/actions.ts).
update crm.devis set origine = 'ajuste' where coalesce(origine, 'formules') = 'formules' and montant_ht is not null;

-- La validité d'un devis passe à un mois (jusqu'à la même date le mois
-- suivant). Les brouillons encore à la règle d'avant (60 jours) la suivent,
-- une seule fois, sauf si Bailly a fixé une validité dans les paramètres.
-- Un devis déjà envoyé garde la date que le client a reçue.
do $$ begin
  if not exists (select 1 from crm.devis_parametres where cle = '_validite_un_mois_v1') then
    if not exists (select 1 from crm.devis_parametres where cle = 'validiteJours' and jsonb_typeof(valeur) = 'number') then
      update crm.devis set validite = (coalesce(date_devis, (cree_le at time zone 'Europe/Paris')::date) + interval '1 month')::date
       where statut = 'brouillon' and validite is not null
         and validite in (coalesce(date_devis, (cree_le at time zone 'Europe/Paris')::date) + 60, cree_le::date + 60);
    end if;
    insert into crm.devis_parametres(cle, valeur, maj_par) values ('_validite_un_mois_v1', 'true', 'démarrage') on conflict (cle) do nothing;
  end if;
end $$;

-- Les clients CIMOB/DICOM (clients.type = 'militaire') : le client ne voit
-- que ses droits, le volume accordé par son administration
-- (dossiers.volume_droits) ; son volume réel reste consultable au CRM et
-- n'est jamais mentionné au client, comme le prix d'un client compte. Quelle
-- que soit la fonction qui écrit le dossier de l'espace (ouverture,
-- projection), son volume est celui des droits ; sans droits, l'espace ne
-- s'ouvre pas, et un espace déjà ouvert garde le volume qu'il montrait.
create or replace function crm.ec_dossier_volume_droits() returns trigger language plpgsql security definer set search_path = '' as $f$
declare
  v_type text;
  v_droits numeric;
  v_reel numeric;
begin
  if new.crm_dossier_id is null then return new; end if;
  select c.type, d.volume_droits, d.volume into v_type, v_droits, v_reel
    from crm.dossiers d join crm.clients c on c.id = d.client_id where d.id = new.crm_dossier_id;
  if not found or v_type is distinct from 'militaire' then return new; end if;
  if coalesce(v_droits, 0) > 0 then
    new.volume_m3 := v_droits;
  elsif tg_op = 'INSERT' then
    raise exception 'Renseignez les droits du client CIMOB/DICOM (le volume accordé par son administration) : c''est le seul volume montré au client.';
  elsif new.volume_m3 is distinct from old.volume_m3 and new.volume_m3 = v_reel then
    new.volume_m3 := old.volume_m3;
  end if;
  return new;
end $f$;
do $$ begin
  if to_regclass('public.ec_dossiers') is not null then
    drop trigger if exists ec_dossier_volume_droits on public.ec_dossiers;
    create trigger ec_dossier_volume_droits before insert or update on public.ec_dossiers for each row execute function crm.ec_dossier_volume_droits();
  end if;
end $$;

-- Le compte-rendu signé d'un client CIMOB/DICOM : son volume relevé n'est
-- pas recopié dans l'espace client, où le client lit ses droits (le volume de
-- son dossier, ci-dessus) ; le CRM garde le volume réel. Les lignes déjà
-- recopiées sont effacées au passage.
create or replace function crm.ec_visite_sans_volume_cimob() returns trigger language plpgsql security definer set search_path = '' as $f$
begin
  if new.volume_m3 is not null and exists (
    select 1 from public.ec_dossiers x join crm.dossiers d on d.id = x.crm_dossier_id join crm.clients c on c.id = d.client_id
     where x.id = new.dossier_id and c.type = 'militaire'
  ) then
    new.volume_m3 := null;
  end if;
  return new;
end $f$;
do $$ begin
  if to_regclass('public.ec_visites') is not null then
    drop trigger if exists ec_visite_sans_volume_cimob on public.ec_visites;
    create trigger ec_visite_sans_volume_cimob before insert or update on public.ec_visites for each row execute function crm.ec_visite_sans_volume_cimob();
    update public.ec_visites e set volume_m3 = null
      from public.ec_dossiers x join crm.dossiers d on d.id = x.crm_dossier_id join crm.clients c on c.id = d.client_id
     where x.id = e.dossier_id and c.type = 'militaire' and e.volume_m3 is not null;
  end if;
end $$;
`;
