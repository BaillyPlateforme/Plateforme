/*
 * L'encaissement et la facturation (audit Créagidem, §J, §P, §Q et « client
 * payeur »), dans le schéma `crm`. Appliqué au démarrage avec le reste du
 * schéma (lib/schema.ts), en une requête idempotente.
 *
 * Le modèle :
 *
 * - crm.paiements devient la table des RÈGLEMENTS, tous les encaissements :
 *   arrhes, règlements partiels ou du solde, paiements en ligne, avec leur
 *   mode, la banque, le chèque, le titulaire, le compte d'encaissement, la
 *   date prévue d'encaissement et un commentaire. `facture_id` affecte un
 *   règlement à une facture ; sans facture, il reste au crédit du dossier
 *   (des arrhes pas encore facturées, par exemple) et se réaffecte.
 * - crm.factures porte trois genres de documents : la facture (`facture`,
 *   libre ou complémentaire ; les factures d'avant ce modèle), la facture de
 *   solde (`solde`), la facture d'arrhes (`acompte`) et l'avoir (`avoir`),
 *   qui annule une facture (`facture_origine_id`). Le montant reste le TTC ;
 *   le HT et la TVA sont ceux des lignes (crm.factures_lignes), avec la TVA
 *   calculée par taux sur le total HT, comme l'exige la norme EN 16931.
 *   Le client payeur (un compte, une entreprise) et son adresse sont figés
 *   sur la facture au moment de l'émission (`payeur`), comme les mentions de
 *   l'émetteur (`mentions`).
 * - Une facture émise ne se modifie plus : on l'annule par un avoir. Un
 *   déclencheur refuse de changer le montant, le numéro ou la date d'une
 *   facture soldée ou annulée, quel que soit le code qui essaie.
 *
 * Le reste à payer est calculé en un seul endroit, les vues
 * crm.factures_soldes (par facture) et crm.dossiers_soldes (par dossier) :
 * la fiche, la page Factures, le Parcours, le Pilotage et la facture
 * imprimée lisent les mêmes chiffres.
 *
 *   dû du dossier = le plus grand du devis signé et du facturé (déménagement),
 *                   ou le facturé seul une fois la facture de solde émise,
 *                   plus les factures de garde-meuble ;
 *   encaissé      = tous les règlements, plus la part des anciennes factures
 *                   « marquées payées » sans règlement saisi ;
 *   reste         = dû − encaissé (négatif : un crédit du client).
 *
 * L'espace client (migration 0012) montre les factures et les règlements du
 * CRM. Sa projection, ec_projeter_dossier_crm, ne connaît ni les règlements
 * affectés à une facture, ni les avoirs : elle compterait deux fois ce qui
 * est payé. crm.projeter_factures_espace() réécrit donc, après elle, la part
 * factures et règlements de l'espace (rien d'autre) : une facture en partie
 * payée y apparaît pour son reste à régler (c'est ce montant que le client
 * règle en ligne), une facture soldée pour son total, sans les règlements
 * qu'elle absorbe ; une facture annulée y reste à 0 €, marquée annulée. Elle
 * est appelée par le CRM après chaque projection (lib/espace.ts) et, pour les
 * chemins de l'espace client (arrhes ou facture réglées en ligne, signature),
 * par des déclencheurs différés, qui passent au moment du commit, après la
 * projection de ces fonctions. Pour les données d'avant ce modèle, elle
 * produit exactement ce que produisait la projection.
 *
 * Un paiement en ligne devient un règlement « carte (en ligne) » : les
 * arrhes par ec_arrhes_crm (qui inscrit déjà un paiement), une facture par
 * ec_facture_payee_crm (qui ne faisait que la marquer payée : le déclencheur
 * crm.facture_reglee_en_ligne inscrit le règlement de la session payée).
 *
 * Reprise des données d'avant : une ancienne facture unique qui couvre tout
 * le devis signé absorbe les arrhes déjà reçues (elles en faisaient partie) ;
 * une ancienne facture « de solde », plus petite que le devis, les laisse à
 * part. Aucun montant n'est modifié.
 *
 * Aucun déclencheur ne bloque le CRM sur une erreur de l'espace client : la
 * projection et la recherche d'une session en ligne sont protégées.
 */
export const SCHEMA_FACTURATION = `
alter table crm.paiements add column if not exists mode text;
alter table crm.paiements add column if not exists nature text;
alter table crm.paiements add column if not exists banque text;
alter table crm.paiements add column if not exists numero_cheque text;
alter table crm.paiements add column if not exists titulaire text;
alter table crm.paiements add column if not exists compte_encaissement text;
alter table crm.paiements add column if not exists date_prevue date;
alter table crm.paiements add column if not exists commentaire text;
alter table crm.paiements add column if not exists facture_id int references crm.factures(id) on delete set null;
alter table crm.paiements add column if not exists saisi_par int references crm.utilisateurs(id) on delete set null;
alter table crm.paiements add column if not exists cree_le timestamptz default now();
create index if not exists idx_paiements_facture on crm.paiements(facture_id);
create index if not exists idx_paiements_dossier on crm.paiements(dossier_id, recu_le);
alter table crm.factures add column if not exists genre text not null default 'facture';
alter table crm.factures add column if not exists facture_origine_id int references crm.factures(id) on delete set null;
alter table crm.factures add column if not exists devis_id int references crm.devis(id) on delete set null;
alter table crm.factures add column if not exists montant_ht numeric(12,2);
alter table crm.factures add column if not exists montant_tva numeric(12,2);
alter table crm.factures add column if not exists date_mode text;
alter table crm.factures add column if not exists echeance_le date;
alter table crm.factures add column if not exists conditions_reglement text;
alter table crm.factures add column if not exists bon_commande text;
alter table crm.factures add column if not exists origine_client_id int references crm.clients(id) on delete set null;
alter table crm.factures add column if not exists payeur_client_id int references crm.clients(id) on delete set null;
alter table crm.factures add column if not exists payeur jsonb;
alter table crm.factures add column if not exists mentions jsonb;
alter table crm.factures add column if not exists motif text;
alter table crm.factures add column if not exists annulee_le date;
alter table crm.factures add column if not exists emise_par int references crm.utilisateurs(id) on delete set null;
alter table crm.factures add column if not exists cree_le timestamptz default now();
create index if not exists idx_factures_dossier on crm.factures(dossier_id);
create index if not exists idx_factures_origine on crm.factures(facture_origine_id);
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'crm.factures'::regclass and conname = 'factures_statut_check'
                 and pg_get_constraintdef(oid) like '%annulee%') then
    alter table crm.factures drop constraint if exists factures_statut_check;
    alter table crm.factures add constraint factures_statut_check check (statut in ('emise','payee','retard','annulee'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'crm.factures'::regclass and conname = 'factures_genre_check') then
    alter table crm.factures add constraint factures_genre_check check (genre in ('facture','solde','acompte','avoir'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'crm.paiements'::regclass and conname = 'paiements_mode_check') then
    alter table crm.paiements add constraint paiements_mode_check
      check (mode is null or mode in ('cheque','virement','carte','carte_en_ligne','especes','prelevement','autre'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'crm.paiements'::regclass and conname = 'paiements_nature_check') then
    alter table crm.paiements add constraint paiements_nature_check check (nature is null or nature in ('arrhes','reglement','remboursement'));
  end if;
end $$;
create table if not exists crm.factures_lignes (
  id serial primary key,
  facture_id int not null references crm.factures(id) on delete cascade,
  ordre int not null default 0,
  genre text not null default 'prestation' check (genre in ('prestation','texte','deduction')),
  libelle text not null, detail text,
  quantite numeric(12,3) not null default 1, unite text,
  prix_unitaire_ht numeric(14,4) not null default 0,
  taux_tva numeric(5,2) not null default 0,
  montant_ht numeric(12,2) not null default 0,
  montant_tva numeric(12,2) not null default 0,
  montant_ttc numeric(12,2) not null default 0,
  facture_deduite_id int references crm.factures(id) on delete set null
);
create index if not exists idx_factures_lignes on crm.factures_lignes(facture_id, ordre);
alter table crm.factures_lignes enable row level security;
-- Le client payeur : un client (souvent un compte ou une entreprise) qui paie pour un autre, et son adresse de facturation.
alter table crm.clients add column if not exists facturation_adresse text;
alter table crm.clients add column if not exists facturation_cp text;
alter table crm.clients add column if not exists facturation_ville text;
alter table crm.clients add column if not exists facturation_pays text;
alter table crm.clients add column if not exists siren text;
alter table crm.clients add column if not exists tva_intracom text;
alter table crm.dossiers add column if not exists payeur_client_id int references crm.clients(id) on delete set null;
alter table crm.dossiers add column if not exists bon_commande text;
-- Les mentions et conditions de la facture, une seule ligne, vides tant que Bailly ne les a pas données (Paramètres).
create table if not exists crm.facturation_reglages (
  id boolean primary key default true check (id),
  raison_sociale text, forme_juridique text, capital text, rcs text, siren text, tva_intracom text, code_ape text,
  adresse text, code_postal text, ville text, pays text,
  iban text, bic text, banque text,
  conditions_reglement text, delai_paiement_jours int, penalites_retard text, indemnite_recouvrement text, escompte text,
  taux_tva_defaut numeric(5,2), comptes_encaissement text, mention_pied text,
  maj_le timestamptz, maj_par text
);
alter table crm.facturation_reglages enable row level security;
-- Reprise : l'ancienne facture unique qui couvre tout le devis signé absorbe les arrhes reçues avant elle.
update crm.paiements p set facture_id = f.id
  from crm.factures f
 where p.facture_id is null and p.dossier_id = f.dossier_id and f.genre = 'facture'
   and f.garde_meuble_id is null and f.objet !~* 'garde.?meuble'
   and not exists (select 1 from crm.factures_lignes l where l.facture_id = f.id)
   and f.montant >= coalesce((select v.montant from crm.devis v where v.dossier_id = f.dossier_id and v.statut = 'signe' limit 1), 0)
   and (select count(*) from crm.factures x where x.dossier_id = f.dossier_id and x.genre <> 'avoir'
          and x.garde_meuble_id is null and x.objet !~* 'garde.?meuble') = 1
   and p.recu_le <= coalesce(f.payee_le, current_date);
-- Les règlements d'avant : leur nature (des arrhes, d'après le libellé) et le mode des paiements en ligne.
update crm.paiements set nature = case when libelle ~* '^ *arrhes' then 'arrhes' when montant < 0 then 'remboursement' else 'reglement' end where nature is null;
update crm.paiements set mode = 'carte_en_ligne' where session_paiement_id is not null and mode is null;
drop view if exists crm.dossiers_soldes;
drop view if exists crm.factures_soldes;
create view crm.factures_soldes as
select f.id, f.dossier_id, f.genre, f.statut, f.montant::numeric(12,2) as ttc,
  (f.garde_meuble_id is not null or f.objet ~* 'garde.?meuble') as garde_meuble,
  coalesce(p.affecte, 0)::numeric(12,2) as affecte,
  (case when f.genre <> 'avoir' and f.statut = 'payee' then greatest(0, f.montant - coalesce(p.affecte, 0)) else 0 end)::numeric(12,2) as non_enregistre,
  (case when f.genre = 'avoir' or f.statut in ('payee','annulee') then 0 else greatest(0, f.montant - coalesce(p.affecte, 0)) end)::numeric(12,2) as reste,
  (f.genre <> 'avoir' and f.statut not in ('payee','annulee') and (f.statut = 'retard' or f.echeance_le < current_date)) as en_retard,
  case when f.genre = 'avoir' then 'avoir' when f.statut = 'annulee' then 'annulee' when f.statut = 'payee' then 'soldee'
       when coalesce(p.affecte, 0) > 0 then 'partielle' else 'a_regler' end as etat
from crm.factures f
left join (select facture_id, sum(montant) as affecte from crm.paiements where facture_id is not null group by facture_id) p on p.facture_id = f.id;
create view crm.dossiers_soldes as
select x.*,
  ((case when x.solde_facture then x.facture_demenagement else greatest(x.engage, x.facture_demenagement) end) + x.facture_garde_meuble)::numeric(12,2) as du,
  ((case when x.solde_facture then x.facture_demenagement else greatest(x.engage, x.facture_demenagement) end) + x.facture_garde_meuble - x.encaisse)::numeric(12,2) as reste,
  ((case when x.solde_facture then 0 else greatest(0, x.engage - x.facture_demenagement) end))::numeric(12,2) as a_facturer
from (
  select d.id as dossier_id,
    (case when d.statut = 'perdu' then 0 else coalesce(sg.montant, 0) end)::numeric(12,2) as engage,
    coalesce(fs.facture_dem, 0)::numeric(12,2) as facture_demenagement,
    coalesce(fs.facture_gm, 0)::numeric(12,2) as facture_garde_meuble,
    coalesce(fs.a_solde, false) as solde_facture,
    coalesce(fs.reste_factures, 0)::numeric(12,2) as reste_factures,
    (coalesce(pa.total, 0) + coalesce(fs.non_enregistre, 0))::numeric(12,2) as encaisse,
    coalesce(pa.total, 0)::numeric(12,2) as regle,
    coalesce(pa.non_affecte, 0)::numeric(12,2) as non_affecte
  from crm.dossiers d
  left join lateral (select v.montant from crm.devis v where v.dossier_id = d.id and v.statut = 'signe'
                     order by v.signe_le desc nulls last, v.id desc limit 1) sg on true
  left join lateral (select sum(s.ttc) filter (where not s.garde_meuble and s.genre <> 'avoir' and s.statut <> 'annulee') as facture_dem,
                            sum(s.ttc) filter (where s.garde_meuble and s.genre <> 'avoir' and s.statut <> 'annulee') as facture_gm,
                            bool_or(s.genre = 'solde' and s.statut <> 'annulee') as a_solde,
                            sum(s.reste) as reste_factures, sum(s.non_enregistre) as non_enregistre
                       from crm.factures_soldes s where s.dossier_id = d.id) fs on true
  left join lateral (select sum(p.montant) as total, sum(p.montant) filter (where p.facture_id is null) as non_affecte
                       from crm.paiements p where p.dossier_id = d.id) pa on true
) x;
-- Une facture se solde d'elle-même quand ses règlements la couvrent (jamais l'inverse : une facture soldée ne se rouvre pas).
create or replace function crm.facture_recalculer(p_facture int) returns void language plpgsql as $f$
declare v record;
begin
  if p_facture is null then return; end if;
  select f.id, f.statut, f.genre, f.montant, coalesce((select sum(p.montant) from crm.paiements p where p.facture_id = f.id), 0) as affecte,
         (select max(p.recu_le) from crm.paiements p where p.facture_id = f.id) as dernier
    into v from crm.factures f where f.id = p_facture;
  if not found or v.genre = 'avoir' or v.statut in ('payee','annulee') then return; end if;
  if v.affecte >= v.montant then
    update crm.factures set statut = 'payee', payee_le = coalesce(v.dernier, current_date) where id = p_facture;
  end if;
end $f$;
create or replace function crm.reglement_defauts() returns trigger language plpgsql as $f$
begin
  if new.session_paiement_id is not null and new.mode is null then new.mode := 'carte_en_ligne'; end if;
  if new.nature is null then
    new.nature := case when new.libelle ~* '^ *arrhes' then 'arrhes' when new.montant < 0 then 'remboursement' else 'reglement' end;
  end if;
  if new.cree_le is null then new.cree_le := now(); end if;
  return new;
end $f$;
drop trigger if exists reglement_defauts on crm.paiements;
create trigger reglement_defauts before insert on crm.paiements for each row execute function crm.reglement_defauts();
create or replace function crm.reglement_apres() returns trigger language plpgsql as $f$
begin
  if tg_op <> 'DELETE' then perform crm.facture_recalculer(new.facture_id); end if;
  if tg_op <> 'INSERT' then perform crm.facture_recalculer(old.facture_id); end if;
  return null;
end $f$;
drop trigger if exists reglement_apres on crm.paiements;
create trigger reglement_apres after insert or update or delete on crm.paiements for each row execute function crm.reglement_apres();
-- Une facture soldée ou annulée est figée ; une facture annulée le reste, même si l'espace client la dit payée.
create or replace function crm.facture_figee() returns trigger language plpgsql as $f$
begin
  if old.statut in ('payee','annulee') and (new.montant is distinct from old.montant or new.numero is distinct from old.numero
      or new.emise_le is distinct from old.emise_le or new.genre is distinct from old.genre or new.objet is distinct from old.objet) then
    raise exception 'La facture % est %, elle ne se modifie plus : annulez-la par un avoir.', old.numero,
      case when old.statut = 'payee' then 'soldée' else 'annulée' end;
  end if;
  if old.statut = 'annulee' then new.statut := 'annulee'; new.payee_le := old.payee_le; end if;
  return new;
end $f$;
drop trigger if exists facture_figee on crm.factures;
create trigger facture_figee before update on crm.factures for each row execute function crm.facture_figee();
-- Une facture réglée en ligne depuis l'espace client : le règlement « carte (en ligne) » de la session payée.
create or replace function crm.facture_reglee_en_ligne() returns trigger language plpgsql as $f$
declare s record;
begin
  if to_regclass('public.ec_sessions_paiement') is null or to_regclass('public.ec_factures') is null then return null; end if;
  for s in
    select sp.id, sp.montant, sp.reference from public.ec_sessions_paiement sp
      join public.ec_factures ef on ef.id = sp.cible_id
     where sp.cible = 'facture' and sp.statut = 'payee' and ef.crm_facture_id = new.id
       and not exists (select 1 from crm.paiements p where p.session_paiement_id = sp.id)
  loop
    insert into crm.paiements(dossier_id, libelle, montant, recu_le, session_paiement_id, mode, nature, facture_id, commentaire)
    values (new.dossier_id, 'Règlement en ligne · facture ' || new.numero, s.montant, (now() at time zone 'Europe/Paris')::date, s.id,
            'carte_en_ligne', 'reglement', case when new.statut = 'annulee' or new.genre = 'avoir' then null else new.id end,
            'Payé dans l''espace client · référence ' || coalesce(s.reference, '—')
              || case when new.statut = 'annulee' then ' · la facture était annulée : montant laissé au crédit du dossier' else '' end);
  end loop;
  return null;
exception when others then
  raise warning 'BaillyCRM : règlement en ligne de la facture % non inscrit (%)', new.id, sqlerrm;
  return null;
end $f$;
drop trigger if exists facture_reglee_en_ligne on crm.factures;
create trigger facture_reglee_en_ligne after update of statut on crm.factures for each row
  when (new.statut is distinct from old.statut or old.statut = 'annulee') execute function crm.facture_reglee_en_ligne();
-- La part factures et règlements de l'espace client (voir plus haut).
create or replace function crm.projeter_factures_espace(p_crm int) returns void language plpgsql security definer set search_path = '' as $f$
declare v_ec uuid; v_devis uuid;
begin
  if p_crm is null or to_regclass('public.ec_factures') is null or to_regclass('public.ec_dossiers') is null then return; end if;
  select id into v_ec from public.ec_dossiers where crm_dossier_id = p_crm;
  if v_ec is null then return; end if;
  select e.id into v_devis from public.ec_devis e join crm.devis v on v.id = e.crm_devis_id
   where v.dossier_id = p_crm and v.statut = 'signe' limit 1;
  insert into public.ec_factures as f (dossier_id, crm_facture_id, devis_id, numero, type, libelle, montant_ttc, statut, emise_le, echeance, periode, payee_le, paiement_ref)
  select v_ec, x.id, case when not s.garde_meuble then v_devis end, x.numero,
         case when s.garde_meuble then 'garde_meubles' when x.genre = 'acompte' or x.objet ~* '^ *arrhes' then 'arrhes' else 'solde' end,
         case when x.statut = 'annulee' then x.objet || ' · annulée' || coalesce(' par l''avoir ' || (select a.numero from crm.factures a where a.facture_origine_id = x.id and a.genre = 'avoir' order by a.id limit 1), '')
              when s.reste > 0 and s.affecte > 0 then x.objet || ' · reste à régler' else x.objet end,
         case when x.statut = 'annulee' then 0 when s.reste > 0 then s.reste else x.montant end,
         case when x.statut = 'annulee' or s.reste <= 0 then 'payee' when s.en_retard then 'en_retard' else 'a_payer' end,
         x.emise_le, coalesce(x.echeance_le, x.emise_le),
         case when s.garde_meuble then to_char(x.emise_le, 'YYYY-MM') end,
         case when x.statut = 'annulee' then coalesce(x.annulee_le, x.emise_le) when s.reste <= 0 then coalesce(x.payee_le, x.emise_le) end,
         case when x.statut = 'annulee' or s.reste <= 0 then 'HORS-LIGNE' end
    from crm.factures x join crm.factures_soldes s on s.id = x.id
   where x.dossier_id = p_crm and x.genre <> 'avoir'
  on conflict (crm_facture_id) do update set
    dossier_id = excluded.dossier_id, devis_id = excluded.devis_id, numero = excluded.numero, type = excluded.type,
    libelle = excluded.libelle, montant_ttc = excluded.montant_ttc, statut = excluded.statut, emise_le = excluded.emise_le,
    echeance = excluded.echeance, periode = excluded.periode, payee_le = excluded.payee_le,
    paiement_ref = case when excluded.statut = 'payee' then coalesce(f.paiement_ref, excluded.paiement_ref) end;
  insert into public.ec_factures as f (dossier_id, crm_paiement_id, devis_id, numero, type, libelle, montant_ttc, statut, emise_le, echeance, periode, payee_le, paiement_ref)
  select v_ec, p.id, v_devis, 'RG-' || to_char(p.recu_le, 'YYYY') || '-' || lpad(p.id::text, 4, '0'),
         case when p.nature = 'arrhes' or p.libelle ~* '^ *arrhes' then 'arrhes' else 'solde' end,
         p.libelle, p.montant, 'payee', p.recu_le, p.recu_le, null, p.recu_le,
         coalesce((select sp.reference from public.ec_sessions_paiement sp where sp.id = p.session_paiement_id), 'HORS-LIGNE')
    from crm.paiements p
   where p.dossier_id = p_crm
     and not exists (select 1 from crm.factures_soldes s where s.id = p.facture_id and s.statut = 'payee' and s.genre <> 'avoir')
  on conflict (crm_paiement_id) do update set
    dossier_id = excluded.dossier_id, devis_id = excluded.devis_id, numero = excluded.numero, type = excluded.type,
    libelle = excluded.libelle, montant_ttc = excluded.montant_ttc, emise_le = excluded.emise_le, echeance = excluded.echeance,
    payee_le = excluded.payee_le, paiement_ref = excluded.paiement_ref;
  delete from public.ec_factures e
   where e.dossier_id = v_ec
     and ((e.crm_facture_id is not null and e.crm_facture_id not in (select x.id from crm.factures x where x.dossier_id = p_crm and x.genre <> 'avoir'))
       or (e.crm_paiement_id is not null and e.crm_paiement_id not in (
             select p.id from crm.paiements p where p.dossier_id = p_crm
                and not exists (select 1 from crm.factures_soldes s where s.id = p.facture_id and s.statut = 'payee' and s.genre <> 'avoir'))));
end $f$;
create or replace function crm.facturation_projeter() returns trigger language plpgsql security definer set search_path = '' as $f$
declare v_dossier int;
begin
  v_dossier := case when tg_op = 'DELETE' then old.dossier_id else new.dossier_id end;
  perform crm.projeter_factures_espace(v_dossier);
  return null;
exception when others then
  raise warning 'BaillyCRM : projection des factures du dossier % vers l''espace client impossible (%)', v_dossier, sqlerrm;
  return null;
end $f$;
-- Le déclencheur différé passe au commit, hors des fonctions « security definer » de l'espace client (sous le
-- rôle de l'API, sans accès au schéma crm) : la projection s'exécute donc avec les droits de son propriétaire.
revoke all on function crm.projeter_factures_espace(int) from public;
drop trigger if exists facturation_projeter on crm.paiements;
create constraint trigger facturation_projeter after insert or update or delete on crm.paiements
  deferrable initially deferred for each row execute function crm.facturation_projeter();
drop trigger if exists facturation_projeter on crm.factures;
create constraint trigger facturation_projeter after insert or update or delete on crm.factures
  deferrable initially deferred for each row execute function crm.facturation_projeter();
drop trigger if exists facturation_projeter on crm.devis;
create constraint trigger facturation_projeter after update of statut on crm.devis
  deferrable initially deferred for each row execute function crm.facturation_projeter();
`;
