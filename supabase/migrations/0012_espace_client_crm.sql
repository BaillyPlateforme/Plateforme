-- ============================================================
-- 0012 — Un dossier, deux faces : l'espace client relié au CRM
-- ============================================================
--
-- Jusqu'ici, l'espace client (tables ec_*) et le CRM (schéma crm) tenaient
-- chacun leurs dossiers et leurs devis : un devis établi dans le CRM
-- n'apparaissait pas chez le client. Désormais, un dossier n'existe qu'une
-- fois, dans le CRM, et l'espace client en est la face tournée vers le client.
--
-- Qui tient quoi :
--   * le CRM est la source du client, des adresses, des dates, du commercial,
--     des devis, des factures et des paiements ;
--   * l'espace client garde ce qui lui est propre : les accès, les documents
--     et les pièces, les conditions de livraison, la déclaration de valeurs,
--     les CGV, les cartons, le SAV et le journal des messages.
--
-- Le mécanisme est une PROJECTION. ec_dossiers.crm_dossier_id relie un espace
-- à son dossier du CRM, et ec_projeter_dossier_crm() recopie dans les tables
-- ec_* la part du CRM que le client a le droit de voir — rien d'autre : ni le
-- prix d'achat des sous-traitants, ni les observations commerciales, ni le
-- reste du CRM. Le CRM l'appelle après chaque changement d'un dossier ; les
-- actions du client qui touchent au CRM l'appellent aussi.
--
-- Pourquoi une projection plutôt qu'une lecture du schéma crm par l'espace
-- client : le client ne lit toujours QUE les tables ec_*, avec sa propre
-- session, et la RLS de 0011 reste la seule porte — y compris pour le
-- masquage des devis et des factures, appliqué par la base. Aucune page du
-- client n'a de chemin vers le schéma crm, même côté serveur.
--
-- Dans l'autre sens, ce que fait le client et qui engage le dossier (accepter
-- un devis, régler des arrhes ou une facture) passe par les fonctions de
-- cette migration, qui écrivent dans le CRM puis projettent. Une seule règle
-- de signature pour tout le monde : un dossier n'a qu'un devis signé, qu'il
-- le soit depuis la page /signature du CRM, depuis l'espace client ou par
-- l'équipe.
--
-- Les fonctions sont SECURITY DEFINER, réservées à la clé de service et au
-- serveur du CRM (propriétaire des tables) : la clé publique ne peut ni les
-- appeler, ni lire le schéma crm, qui n'est pas exposé par l'API.
--
-- La migration ajoute aussi les deux segments du cahier des charges (§2) qui
-- manquaient à l'espace client : militaire et logement social.
--
-- Rien d'existant hors de l'espace client n'est modifié : ni les tables
-- d'origine du schéma public, ni le schéma crm, dont les colonnes nouvelles
-- (request_id, session_paiement_id, segment logement_social) sont posées
-- par apps/interne/src/crm/lib/schema.ts au démarrage du CRM. Les fonctions
-- plpgsql ne résolvent leurs tables qu'à l'exécution : elles se créent même
-- sur une base où le CRM n'a pas encore démarré.
--
-- Idempotente : elle se rejoue sans erreur et sans rien effacer.

-- ============================================================
-- 1. Les colonnes de lien
-- ============================================================

-- Le dossier du CRM d'un espace : un espace par dossier, un dossier par espace.
-- Pas de clé étrangère vers crm.dossiers (elle poserait des déclencheurs sur
-- une table du CRM) : l'identifiant est gardé tel quel, sous un index unique.
alter table public.ec_dossiers add column if not exists crm_dossier_id integer;
create unique index if not exists ec_dossiers_crm_uidx on public.ec_dossiers (crm_dossier_id);

-- Les devis, factures et paiements projetés portent l'identifiant de leur ligne du CRM.
alter table public.ec_devis add column if not exists crm_devis_id integer;
create unique index if not exists ec_devis_crm_uidx on public.ec_devis (crm_devis_id);
alter table public.ec_factures add column if not exists crm_facture_id integer;
create unique index if not exists ec_factures_crm_uidx on public.ec_factures (crm_facture_id);
-- Un paiement du CRM (les arrhes) se montre au client comme une facture réglée.
alter table public.ec_factures add column if not exists crm_paiement_id integer;
create unique index if not exists ec_factures_crm_paiement_uidx on public.ec_factures (crm_paiement_id);

-- Le conseiller présenté au client est le commercial du dossier dans le CRM.
alter table public.ec_conseillers add column if not exists crm_utilisateur_id integer;
create unique index if not exists ec_conseillers_crm_uidx on public.ec_conseillers (crm_utilisateur_id);

-- Les numéros des devis et des factures sont ceux du CRM, qui les tient
-- uniques. L'unicité de l'espace client ne vaut plus qu'entre ses propres
-- lignes (celles des dossiers d'avant le lien) : un numéro du CRM ne doit
-- pas buter contre celui d'une ancienne ligne de l'espace.
alter table public.ec_devis drop constraint if exists ec_devis_numero_key;
create unique index if not exists ec_devis_numero_natif_uidx on public.ec_devis (numero) where crm_devis_id is null;
alter table public.ec_factures drop constraint if exists ec_factures_numero_key;
create unique index if not exists ec_factures_numero_natif_uidx on public.ec_factures (numero)
  where crm_facture_id is null and crm_paiement_id is null;

-- ============================================================
-- 2. Les segments : militaire et logement social
-- ============================================================

alter table public.ec_clients drop constraint if exists ec_clients_type_check;
alter table public.ec_clients add constraint ec_clients_type_check
  check (type in ('particulier', 'grand_compte', 'militaire', 'logement_social'));

-- Les pièces à fournir se règlent aussi par segment : null, pour tous.
alter table public.ec_document_requirements add column if not exists segment text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ec_document_requirements_segment_check') then
    alter table public.ec_document_requirements add constraint ec_document_requirements_segment_check
      check (segment is null or segment in ('particulier', 'grand_compte', 'militaire', 'logement_social'));
  end if;
end;
$$;

-- Le dossier est passé en commande dans le CRM : devis signé, ou, pour un
-- militaire, prise en charge par l'administration (commande sans devis).
alter table public.ec_dossiers add column if not exists commande_le timestamptz;

-- Logement social : le bailleur, prévenu de chaque déclaration de SAV. Propre
-- à l'espace client, réglé par l'équipe depuis le back-office.
alter table public.ec_dossiers add column if not exists bailleur_nom text;
alter table public.ec_dossiers add column if not exists bailleur_email text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ec_dossiers_bailleur_email_check') then
    alter table public.ec_dossiers add constraint ec_dossiers_bailleur_email_check
      check (bailleur_email is null or (bailleur_email = lower(bailleur_email) and position('@' in bailleur_email) > 1));
  end if;
end;
$$;

-- ============================================================
-- 3. Les correspondances CRM → espace client
-- ============================================================

-- Le segment de l'espace client d'un type de client du CRM. Le partenaire (un
-- agent, un confrère) suit le parcours du grand compte : devis et factures se
-- règlent avec lui, pas avec le client final.
create or replace function public.ec_segment_du_crm(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'compte' then 'grand_compte'
    when 'partenaire' then 'grand_compte'
    when 'militaire' then 'militaire'
    when 'logement_social' then 'logement_social'
    else 'particulier'
  end
$$;

-- Le nom affiché d'une formule du CRM.
create or replace function public.ec_formule_crm(p_formule text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_formule
    when 'premium' then 'Premium'
    when 'standard' then 'Standard'
    when 'economique' then 'Économique'
    else initcap(coalesce(p_formule, ''))
  end
$$;

-- La ville d'une adresse du CRM, saisie à la main : « 12 rue de Passy, Paris
-- 16e » → « Paris », « 18 quai Saint-Vincent, 69001 Lyon » → « Lyon »,
-- « 2150 rue Saint-Denis, Montréal, Canada » → « Montréal ». On prend le
-- dernier morceau après une virgule qui n'est pas un pays, sans code postal
-- ni arrondissement.
create or replace function public.ec_ville_de(p_adresse text)
returns text
language sql
immutable
set search_path = ''
as $$
  with morceaux as (
    select btrim(m) as m, n
    from unnest(string_to_array(coalesce(p_adresse, ''), ',')) with ordinality as t(m, n)
    where btrim(m) <> ''
      and lower(btrim(m)) not in (
        'france', 'belgique', 'suisse', 'luxembourg', 'espagne', 'portugal', 'italie', 'allemagne', 'royaume-uni',
        'irlande', 'pays-bas', 'canada', 'états-unis', 'etats-unis', 'usa', 'maroc', 'tunisie', 'émirats arabes unis',
        'singapour', 'australie'
      )
  ),
  dernier as (select m from morceaux order by n desc limit 1)
  select nullif(btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace((select m from dernier), '\s*\(.*$', ''),
        '^[0-9]{4,5}\s+', ''),
      '\s+[0-9]{1,2}\s*(er|e|ème|eme)$', '', 'i')
  ), '')
$$;

-- Le conseiller de l'espace client d'un utilisateur du CRM, créé au besoin.
-- Son nom et son adresse suivent le CRM ; sa ligne directe reste vide tant
-- que l'équipe ne l'a pas donnée (l'espace affiche alors le standard).
create or replace function public.ec_conseiller_crm(p_utilisateur integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_utilisateur is null then
    return null;
  end if;
  insert into public.ec_conseillers as k (prenom, nom, email, telephone, crm_utilisateur_id)
  select split_part(btrim(u.nom), ' ', 1),
         btrim(substr(btrim(u.nom), length(split_part(btrim(u.nom), ' ', 1)) + 1)),
         lower(coalesce(u.email, '')), '', u.id
    from crm.utilisateurs u
   where u.id = p_utilisateur
  on conflict (crm_utilisateur_id) do update
    set prenom = excluded.prenom, nom = excluded.nom, email = excluded.email
  returning k.id into v_id;
  return v_id;
end;
$$;

-- ============================================================
-- 4. La projection : du CRM vers l'espace client
-- ============================================================

-- Recopie dans l'espace client la part du dossier du CRM que le client voit.
-- Sans effet sur un dossier sans espace. Rend l'identifiant de l'espace.
create or replace function public.ec_projeter_dossier_crm(p_crm integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ec            public.ec_dossiers%rowtype;
  v_type          text;
  v_civilite      text;
  v_prenom        text;
  v_nom           text;
  v_societe       text;
  v_telephone     text;
  v_statut_crm    text;
  v_mois          date;
  v_chargement    date;
  v_livraison     date;
  v_volume        numeric;
  v_commercial    integer;
  v_genre         text;
  v_segment       text;
  v_conseiller    uuid;
  v_depart        text;
  v_arrivee       text;
  v_debut         date;
  v_fin           date;
  v_statut        text;
  v_inter         boolean;
  v_signe_id      integer;
  v_signe_formule text;
  v_signe_le      timestamptz;
  v_devis_signe   uuid;
begin
  -- Une projection à la fois par dossier : le verrou de la ligne les met en file.
  select * into v_ec from public.ec_dossiers where crm_dossier_id = p_crm for update;
  if not found then
    return null;
  end if;

  select c.type, c.civilite, c.prenom, c.nom, c.societe, c.telephone, d.statut, d.mois_ca, d.date_chargement, d.date_livraison,
         d.volume, d.commercial_id, d.type_demenagement
    into v_type, v_civilite, v_prenom, v_nom, v_societe, v_telephone, v_statut_crm, v_mois, v_chargement, v_livraison,
         v_volume, v_commercial, v_genre
    from crm.dossiers d
    join crm.clients c on c.id = d.client_id
   where d.id = p_crm;
  if not found then
    -- Le dossier du CRM a disparu : l'espace reste tel quel, rien n'est effacé.
    return v_ec.id;
  end if;

  v_segment := public.ec_segment_du_crm(v_type);
  v_conseiller := public.ec_conseiller_crm(v_commercial);

  -- Le client. L'adresse e-mail n'est pas reprise : c'est l'identifiant de
  -- connexion, elle se change depuis la fiche de l'espace (qui met à jour le
  -- CRM et le compte de connexion ensemble).
  update public.ec_clients c set
    type = v_segment,
    civilite = case when v_civilite in ('Madame', 'Monsieur') then v_civilite end,
    prenom = coalesce(btrim(v_prenom), ''),
    nom = btrim(v_nom),
    societe = nullif(btrim(coalesce(v_societe, '')), ''),
    telephone = coalesce(nullif(btrim(coalesce(v_telephone, '')), ''), c.telephone),
    conseiller_id = coalesce(v_conseiller, c.conseiller_id),
    -- Particulier et logement social voient devis et factures ; un militaire
    -- jamais (prise en charge par l'administration) ; un grand compte selon
    -- le réglage de l'équipe, masqués par défaut quand il le devient.
    masquer_devis = case
      when v_segment in ('particulier', 'logement_social') then false
      when v_segment = 'militaire' then true
      when c.type <> 'grand_compte' then true
      else c.masquer_devis
    end,
    masquer_factures = case
      when v_segment in ('particulier', 'logement_social') then false
      when v_segment = 'militaire' then true
      when c.type <> 'grand_compte' then true
      else c.masquer_factures
    end
  where c.id = v_ec.client_id;

  -- Le trajet : la première adresse de départ, la dernière d'arrivée.
  select e.adresse into v_depart from crm.etapes_trajet e
   where e.dossier_id = p_crm and e.genre = 'depart' and btrim(coalesce(e.adresse, '')) <> ''
   order by e.ordre, e.id limit 1;
  select e.adresse into v_arrivee from crm.etapes_trajet e
   where e.dossier_id = p_crm and e.genre = 'arrivee' and btrim(coalesce(e.adresse, '')) <> ''
   order by e.ordre desc, e.id desc limit 1;

  -- La période : la date ferme du planning, sinon le mois prévu entier.
  if v_chargement is not null then
    v_debut := v_chargement;
    v_fin := greatest(coalesce(v_livraison, v_chargement), v_chargement);
  elsif v_mois is not null then
    v_debut := date_trunc('month', v_mois)::date;
    v_fin := (date_trunc('month', v_mois) + interval '1 month - 1 day')::date;
  else
    v_debut := v_ec.periode_debut;
    v_fin := v_ec.periode_fin;
  end if;

  -- Le statut vu du client. « Terminé » ne vient que de l'espace (la fin de
  -- chantier signée, qui déclenche la demande d'avis) : dans le CRM, un
  -- dossier se termine quand sa facture est réglée, parfois avant le départ.
  v_statut := case when v_statut_crm in ('planifie', 'termine') then 'planifie' else 'en_preparation' end;
  if v_ec.statut = 'termine' then
    v_statut := 'termine';
  elsif v_ec.statut = 'en_cours' and v_statut = 'planifie' then
    v_statut := 'en_cours';
  end if;

  select v.id, v.formule, v.signe_le into v_signe_id, v_signe_formule, v_signe_le
    from crm.devis v where v.dossier_id = p_crm and v.statut = 'signe'
   order by v.signe_le desc nulls last, v.id desc limit 1;

  v_inter := v_genre in ('international', 'maritime', 'aerien');

  update public.ec_dossiers x set
    ville_depart = coalesce(public.ec_ville_de(v_depart), x.ville_depart),
    adresse_depart = coalesce(nullif(btrim(coalesce(v_depart, '')), ''), x.adresse_depart),
    ville_arrivee = coalesce(public.ec_ville_de(v_arrivee), x.ville_arrivee),
    adresse_arrivee = coalesce(nullif(btrim(coalesce(v_arrivee, '')), ''), x.adresse_arrivee),
    periode_debut = v_debut,
    periode_fin = v_fin,
    volume_m3 = case when v_volume > 0 then v_volume else x.volume_m3 end,
    statut = v_statut,
    formule = case when v_signe_id is not null then public.ec_formule_crm(v_signe_formule) else x.formule end,
    portee = case when v_inter then 'international' else 'national' end,
    -- « International » sans plus de précision : le mode réglé dans l'espace est gardé.
    mode_transport = case
      when v_genre = 'maritime' then 'maritime'
      when v_genre = 'aerien' then 'aerien'
      when v_inter and x.portee = 'international' then x.mode_transport
      else 'route'
    end,
    -- Le pays de destination n'est pas tenu par le CRM : réglé dans l'espace.
    pays_destination = case when v_inter then x.pays_destination else 'FR' end,
    commande_le = case when v_statut_crm in ('commande', 'planifie', 'termine') then coalesce(x.commande_le, v_signe_le, now()) end
  where x.id = v_ec.id;

  -- Les devis : tout ce qui a été envoyé au client. Les brouillons restent au
  -- CRM. Une ligne « à la charge du client » n'est pas une prestation : elle
  -- ne figure pas au devis, pas plus que le prix d'achat des sous-traitants.
  -- Les montants du CRM sont TTC ; la TVA est celle du devis Bailly (20 %).
  insert into public.ec_devis as e (
    dossier_id, crm_devis_id, numero, formule, lignes, inclus, montant_ht, montant_ttc, arrhes_pourcentage, statut, emis_le, valide_jusqu_au, accepte_le
  )
  select v_ec.id, v.id, v.numero, public.ec_formule_crm(v.formule),
         coalesce((
           select jsonb_agg(
                    jsonb_build_object('libelle', l ->> 'libelle', 'montant_ht', round(coalesce((l ->> 'prix')::numeric, 0) / 1.2, 2))
                    -- Une précision écrite pour le client (« 32 m³ · équipe de 4 »), quand la ligne en porte une.
                    || case when coalesce(l ->> 'detail', '') <> '' then jsonb_build_object('detail', l ->> 'detail') else '{}'::jsonb end
                    order by o)
             from jsonb_array_elements(case when jsonb_typeof(v.lignes) = 'array' then v.lignes else '[]'::jsonb end) with ordinality as t(l, o)
            where coalesce(l ->> 'charge', 'bailly') <> 'client'
         ), '[]'::jsonb),
         '{}'::text[],
         round(v.montant / 1.2, 2),
         v.montant,
         -- Les arrhes du CRM : 30 % de la formule signée, réglées en ligne par
         -- les seuls segments qui paient eux-mêmes.
         case when v_segment in ('particulier', 'logement_social') then 30 else 0 end,
         case v.statut when 'signe' then 'accepte' when 'refuse' then 'refuse' else 'envoye' end,
         (coalesce(v.envoye_le, v.cree_le) at time zone 'Europe/Paris')::date,
         -- Sans validité inscrite, celle que le CRM donne à un devis généré : 60 jours.
         coalesce(v.validite, (coalesce(v.envoye_le, v.cree_le) at time zone 'Europe/Paris')::date + 60),
         case when v.statut = 'signe' then (coalesce(v.signe_le, now()) at time zone 'Europe/Paris')::date end
    from crm.devis v
   where v.dossier_id = p_crm and v.statut <> 'brouillon'
  on conflict (crm_devis_id) do update set
    dossier_id = excluded.dossier_id, numero = excluded.numero, formule = excluded.formule, lignes = excluded.lignes,
    montant_ht = excluded.montant_ht, montant_ttc = excluded.montant_ttc, arrhes_pourcentage = excluded.arrhes_pourcentage,
    statut = excluded.statut, emis_le = excluded.emis_le, valide_jusqu_au = excluded.valide_jusqu_au, accepte_le = excluded.accepte_le;

  delete from public.ec_devis
   where dossier_id = v_ec.id and crm_devis_id is not null
     and crm_devis_id not in (select v.id from crm.devis v where v.dossier_id = p_crm and v.statut <> 'brouillon');

  select id into v_devis_signe from public.ec_devis where crm_devis_id = v_signe_id;

  -- Les factures du CRM.
  insert into public.ec_factures as f (
    dossier_id, crm_facture_id, devis_id, numero, type, libelle, montant_ttc, statut, emise_le, echeance, periode, payee_le, paiement_ref
  )
  select v_ec.id, x.id,
         case when x.garde_meuble_id is null and x.objet !~* 'garde.?meuble' then v_devis_signe end,
         x.numero,
         case when x.garde_meuble_id is not null or x.objet ~* 'garde.?meuble' then 'garde_meubles'
              when x.objet ~* '^\s*arrhes' then 'arrhes'
              else 'solde' end,
         x.objet, x.montant,
         case x.statut when 'payee' then 'payee' when 'retard' then 'en_retard' else 'a_payer' end,
         -- Le CRM ne porte pas d'échéance : la date d'émission en tient lieu.
         x.emise_le, x.emise_le,
         case when x.garde_meuble_id is not null or x.objet ~* 'garde.?meuble' then to_char(x.emise_le, 'YYYY-MM') end,
         case when x.statut = 'payee' then coalesce(x.payee_le, x.emise_le) end,
         case when x.statut = 'payee' then 'HORS-LIGNE' end
    from crm.factures x
   where x.dossier_id = p_crm
  on conflict (crm_facture_id) do update set
    dossier_id = excluded.dossier_id, devis_id = excluded.devis_id, numero = excluded.numero, type = excluded.type,
    libelle = excluded.libelle, montant_ttc = excluded.montant_ttc, statut = excluded.statut, emise_le = excluded.emise_le,
    echeance = excluded.echeance, periode = excluded.periode, payee_le = excluded.payee_le,
    -- La référence d'un paiement en ligne, posée à la réception de l'événement, est gardée.
    paiement_ref = case when excluded.statut = 'payee' then coalesce(f.paiement_ref, excluded.paiement_ref) end;

  -- Les paiements du CRM (les arrhes), montrés comme des factures réglées.
  insert into public.ec_factures as f (
    dossier_id, crm_paiement_id, devis_id, numero, type, libelle, montant_ttc, statut, emise_le, echeance, periode, payee_le, paiement_ref
  )
  select v_ec.id, p.id, v_devis_signe,
         'RG-' || to_char(p.recu_le, 'YYYY') || '-' || lpad(p.id::text, 4, '0'),
         case when p.libelle ~* '^\s*arrhes' then 'arrhes' else 'solde' end,
         p.libelle, p.montant, 'payee', p.recu_le, p.recu_le, null, p.recu_le,
         coalesce((select s.reference from public.ec_sessions_paiement s where s.id = p.session_paiement_id), 'HORS-LIGNE')
    from crm.paiements p
   where p.dossier_id = p_crm
  on conflict (crm_paiement_id) do update set
    dossier_id = excluded.dossier_id, devis_id = excluded.devis_id, numero = excluded.numero, type = excluded.type,
    libelle = excluded.libelle, montant_ttc = excluded.montant_ttc, emise_le = excluded.emise_le, echeance = excluded.echeance,
    payee_le = excluded.payee_le, paiement_ref = excluded.paiement_ref;

  delete from public.ec_factures
   where dossier_id = v_ec.id
     and ((crm_facture_id is not null and crm_facture_id not in (select x.id from crm.factures x where x.dossier_id = p_crm))
       or (crm_paiement_id is not null and crm_paiement_id not in (select p.id from crm.paiements p where p.dossier_id = p_crm)));

  return v_ec.id;
end;
$$;

-- ============================================================
-- 5. Ouvrir l'espace d'un dossier du CRM
-- ============================================================

-- Crée l'espace lié d'un dossier du CRM : le client de l'espace (celui de son
-- adresse s'il existe déjà, sinon une nouvelle fiche), le dossier, puis la
-- projection — en une transaction. Sans effet si l'espace existe déjà. Le
-- compte de connexion et le lien d'accès sont l'affaire du serveur, ensuite.
create or replace function public.ec_ouvrir_espace_crm(p_crm integer, p_pays text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ec        uuid;
  v_ref_ec    text;
  v_client    uuid;
  v_ref       text;
  v_type      text;
  v_civilite  text;
  v_prenom    text;
  v_nom       text;
  v_societe   text;
  v_email     text;
  v_telephone text;
  v_mois      date;
  v_charg     date;
  v_livr      date;
  v_volume    numeric;
  v_com       integer;
  v_genre     text;
  v_request   uuid;
  v_segment   text;
  v_depart    text;
  v_arrivee   text;
  v_debut     date;
  v_fin       date;
  v_inter     boolean;
  v_pays      text;
begin
  -- Deux ouvertures simultanées du même dossier : une seule passe.
  perform 1 from crm.dossiers where id = p_crm for update;
  if not found then
    raise exception 'Dossier du CRM introuvable.';
  end if;

  select id, reference, client_id into v_ec, v_ref_ec, v_client from public.ec_dossiers where crm_dossier_id = p_crm;
  if found then
    return jsonb_build_object('dossier_id', v_ec, 'reference', v_ref_ec, 'client_id', v_client, 'deja', true);
  end if;

  select d.ref, c.type, c.civilite, c.prenom, c.nom, c.societe, lower(btrim(coalesce(c.email, ''))), c.telephone,
         d.mois_ca, d.date_chargement, d.date_livraison, d.volume, d.commercial_id, d.type_demenagement, d.request_id
    into v_ref, v_type, v_civilite, v_prenom, v_nom, v_societe, v_email, v_telephone,
         v_mois, v_charg, v_livr, v_volume, v_com, v_genre, v_request
    from crm.dossiers d join crm.clients c on c.id = d.client_id
   where d.id = p_crm;

  -- Les préalables, revérifiés ici quoi que dise l'écran.
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Le client n''a pas d''adresse e-mail valide : c''est son identifiant de connexion.';
  end if;
  select e.adresse into v_depart from crm.etapes_trajet e
   where e.dossier_id = p_crm and e.genre = 'depart' and btrim(coalesce(e.adresse, '')) <> '' order by e.ordre, e.id limit 1;
  select e.adresse into v_arrivee from crm.etapes_trajet e
   where e.dossier_id = p_crm and e.genre = 'arrivee' and btrim(coalesce(e.adresse, '')) <> '' order by e.ordre desc, e.id desc limit 1;
  if v_depart is null or v_arrivee is null then
    raise exception 'Renseignez les adresses de départ et d''arrivée du dossier.';
  end if;
  if v_charg is null and v_mois is null then
    raise exception 'Renseignez la période : le mois prévu, ou la date de chargement.';
  end if;
  if coalesce(v_volume, 0) <= 0 then
    raise exception 'Renseignez le volume du déménagement.';
  end if;
  if v_com is null then
    raise exception 'Choisissez le commercial du dossier : il est présenté au client comme son conseiller.';
  end if;
  if exists (select 1 from public.ec_dossiers where reference = v_ref) then
    raise exception 'La référence % est déjà celle d''un autre espace client, qui n''est pas relié au CRM.', v_ref;
  end if;
  -- Règle de 0011 : on ne se rattache jamais au compte de l'équipe ou d'un RH.
  if exists (select 1 from auth.users u where lower(u.email) = v_email and coalesce(u.raw_app_meta_data ->> 'role', '') <> 'client') then
    raise exception 'Cette adresse est celle d''un compte de l''équipe ou d''un compte RH : l''espace client ne peut pas s''y rattacher. Donnez au client une autre adresse.';
  end if;

  v_segment := public.ec_segment_du_crm(v_type);

  select id into v_client from public.ec_clients where email = v_email;
  if not found then
    insert into public.ec_clients (type, civilite, prenom, nom, societe, email, telephone, masquer_devis, masquer_factures, conseiller_id, demo)
    values (
      v_segment,
      case when v_civilite in ('Madame', 'Monsieur') then v_civilite end,
      coalesce(btrim(v_prenom), ''), btrim(v_nom), nullif(btrim(coalesce(v_societe, '')), ''), v_email, coalesce(btrim(v_telephone), ''),
      v_segment in ('grand_compte', 'militaire'), v_segment in ('grand_compte', 'militaire'),
      public.ec_conseiller_crm(v_com),
      -- Une adresse fictive est celle d'un client fictif : rien ne lui est jamais envoyé pour de vrai.
      v_email ~* '@(example\.(com|org|net)|[a-z0-9.-]+\.exemple|exemple\.fr)$'
    )
    returning id into v_client;
  end if;

  if v_charg is not null then
    v_debut := v_charg;
    v_fin := greatest(coalesce(v_livr, v_charg), v_charg);
  else
    v_debut := date_trunc('month', v_mois)::date;
    v_fin := (date_trunc('month', v_mois) + interval '1 month - 1 day')::date;
  end if;
  v_inter := v_genre in ('international', 'maritime', 'aerien');
  v_pays := case when v_inter and upper(coalesce(p_pays, '')) ~ '^[A-Z]{2}$' then upper(p_pays) else 'FR' end;

  insert into public.ec_dossiers (
    client_id, reference, crm_dossier_id, request_id, ville_depart, ville_arrivee, adresse_depart, adresse_arrivee,
    periode_debut, periode_fin, portee, mode_transport, pays_destination, statut, volume_m3, formule, photo
  ) values (
    v_client, v_ref, p_crm, v_request,
    coalesce(public.ec_ville_de(v_depart), btrim(v_depart)), coalesce(public.ec_ville_de(v_arrivee), btrim(v_arrivee)),
    btrim(v_depart), btrim(v_arrivee), v_debut, v_fin,
    case when v_inter then 'international' else 'national' end,
    case v_genre when 'maritime' then 'maritime' when 'aerien' then 'aerien' else 'route' end,
    v_pays, 'en_preparation', v_volume, 'à définir', '/espace-client/interieur-3.jpg'
  )
  returning id into v_ec;

  perform public.ec_projeter_dossier_crm(p_crm);
  return jsonb_build_object('dossier_id', v_ec, 'reference', v_ref, 'client_id', v_client, 'deja', false);
end;
$$;

-- ============================================================
-- 6. Du client vers le CRM
-- ============================================================

-- La signature d'un devis, d'où qu'elle vienne : 'lien' (la page /signature
-- du CRM), 'espace' (le bouton « Accepter » de l'espace client), 'paiement'
-- (les arrhes réglées en ligne) ou 'equipe' (« Signé par le client » dans le
-- CRM). La règle est la même pour tous : un devis ouvert (brouillon ou
-- envoyé), et aucun autre devis du dossier déjà signé. Les autres devis
-- ouverts ne sont plus retenus, le dossier passe en commande.
--
-- Rend 'signe', 'deja_signe', 'autre_signe', 'ferme' ou 'inconnu'. Avec une
-- trace (adresse IP, navigateur), l'acceptation est horodatée dans l'espace
-- client, comme ses autres engagements.
create or replace function public.ec_signer_devis_crm(
  p_devis integer,
  p_origine text,
  p_utilisateur integer default null,
  p_ip text default null,
  p_user_agent text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dossier integer;
  v_statut  text;
  v_numero  text;
  v_ec      uuid;
begin
  select dossier_id into v_dossier from crm.devis where id = p_devis;
  if not found then
    return 'inconnu';
  end if;
  -- Une signature à la fois par dossier : c'est ce verrou qui garantit un seul devis signé.
  perform 1 from crm.dossiers where id = v_dossier for update;
  select statut, numero into v_statut, v_numero from crm.devis where id = p_devis for update;

  if v_statut = 'signe' then
    return 'deja_signe';
  end if;
  if v_statut not in ('brouillon', 'envoye') then
    return 'ferme';
  end if;
  if exists (select 1 from crm.devis where dossier_id = v_dossier and id <> p_devis and statut = 'signe') then
    return 'autre_signe';
  end if;

  update crm.devis set statut = 'refuse' where dossier_id = v_dossier and id <> p_devis and statut in ('brouillon', 'envoye');
  update crm.devis set statut = 'signe', signe_le = now(), envoye_le = coalesce(envoye_le, now()) where id = p_devis;
  update crm.dossiers set statut = 'commande' where id = v_dossier and statut in ('prospect', 'visite', 'devis');
  update crm.dossiers set maj_le = now() where id = v_dossier;
  insert into crm.activite (dossier_id, utilisateur_id, libelle)
  values (v_dossier, p_utilisateur, case p_origine
    when 'lien' then 'Devis ' || v_numero || ' signé électroniquement par le client'
    when 'espace' then 'Devis ' || v_numero || ' accepté par le client dans son espace'
    when 'paiement' then 'Devis ' || v_numero || ' accepté par le client, arrhes réglées en ligne'
    else 'Devis ' || v_numero || ' signé par le client'
  end);

  perform public.ec_projeter_dossier_crm(v_dossier);

  if p_ip is not null then
    select id into v_ec from public.ec_dossiers where crm_dossier_id = v_dossier;
    if v_ec is not null then
      insert into public.ec_acceptations (dossier_id, type, version_texte, objet, ip, user_agent)
      values (v_ec, 'devis', v_numero, v_numero, left(p_ip, 100), left(coalesce(p_user_agent, 'inconnu'), 400));
    end if;
  end if;
  return 'signe';
end;
$$;

-- Les arrhes réglées en ligne : le devis est signé (s'il ne l'était pas), et
-- le paiement inscrit au CRM — une seule fois par session de paiement, même
-- si l'événement du prestataire est rejoué. Rend l'issue de la signature.
create or replace function public.ec_arrhes_crm(
  p_devis integer,
  p_session uuid,
  p_montant numeric,
  p_pourcentage integer,
  p_reference text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dossier integer;
  v_numero  text;
  v_issue   text;
  v_id      integer;
begin
  select dossier_id, numero into v_dossier, v_numero from crm.devis where id = p_devis;
  if not found then
    return 'inconnu';
  end if;
  v_issue := public.ec_signer_devis_crm(p_devis, 'paiement');

  insert into crm.paiements (dossier_id, libelle, montant, recu_le, session_paiement_id)
  values (v_dossier, 'Arrhes ' || p_pourcentage || ' % · réglées en ligne', p_montant, (now() at time zone 'Europe/Paris')::date, p_session)
  on conflict (session_paiement_id) do nothing
  returning id into v_id;

  if v_id is not null then
    insert into crm.activite (dossier_id, libelle)
    values (v_dossier, 'Arrhes de ' || replace(to_char(p_montant, 'FM9999990.00'), '.', ',') || ' € réglées en ligne par le client (' || coalesce(p_reference, '') || ')'
      || case when v_issue = 'autre_signe' then ' : attention, un autre devis du dossier était déjà signé, à régulariser' else '' end);
    update crm.dossiers set maj_le = now() where id = v_dossier;
  end if;

  perform public.ec_projeter_dossier_crm(v_dossier);
  return v_issue;
end;
$$;

-- Une facture du CRM réglée : en ligne par le client (avec la référence du
-- prestataire), ou hors ligne, marquée par l'équipe depuis le back-office.
-- Comme dans le CRM, le dossier planifié passe alors à « terminé ».
create or replace function public.ec_facture_payee_crm(p_facture integer, p_reference text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dossier integer;
  v_numero  text;
begin
  update crm.factures set statut = 'payee', payee_le = (now() at time zone 'Europe/Paris')::date
   where id = p_facture and statut <> 'payee'
  returning dossier_id, numero into v_dossier, v_numero;
  if not found then
    select dossier_id into v_dossier from crm.factures where id = p_facture;
    if not found then
      return 'inconnu';
    end if;
    perform public.ec_projeter_dossier_crm(v_dossier);
    return 'deja_payee';
  end if;
  if v_dossier is not null then
    update crm.dossiers set statut = 'termine' where id = v_dossier and statut = 'planifie';
    update crm.dossiers set maj_le = now() where id = v_dossier;
    insert into crm.activite (dossier_id, libelle)
    values (v_dossier, 'Facture ' || v_numero || case when p_reference is null or p_reference = 'HORS-LIGNE'
      then ' marquée réglée depuis l''espace client' else ' réglée en ligne par le client (' || p_reference || ')' end);
    perform public.ec_projeter_dossier_crm(v_dossier);
    if p_reference is not null then
      update public.ec_factures set paiement_ref = p_reference where crm_facture_id = p_facture;
    end if;
  end if;
  return 'payee';
end;
$$;

-- Les coordonnées du client, modifiées depuis la fiche de l'espace : elles
-- s'écrivent dans le CRM, qui les tient, puis reviennent par la projection.
create or replace function public.ec_maj_client_crm(
  p_crm integer,
  p_segment text,
  p_civilite text,
  p_prenom text,
  p_nom text,
  p_societe text,
  p_email text,
  p_telephone text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update crm.clients c set
    type = case p_segment
      when 'grand_compte' then case when c.type in ('compte', 'partenaire') then c.type else 'compte' end
      when 'militaire' then 'militaire'
      when 'logement_social' then 'logement_social'
      else 'particulier'
    end,
    civilite = nullif(p_civilite, ''),
    prenom = nullif(btrim(coalesce(p_prenom, '')), ''),
    nom = btrim(p_nom),
    societe = nullif(btrim(coalesce(p_societe, '')), ''),
    email = lower(btrim(p_email)),
    telephone = nullif(btrim(coalesce(p_telephone, '')), '')
  from crm.dossiers d
  where d.id = p_crm and c.id = d.client_id;
  perform public.ec_projeter_dossier_crm(p_crm);
end;
$$;

-- Une ligne au fil d'activité du dossier dans le CRM : ce qui se passe dans
-- l'espace client (lien envoyé, avarie déclarée, fin de chantier) se lit
-- aussi dans la fiche du dossier.
create or replace function public.ec_noter_crm(p_crm integer, p_libelle text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_crm is null or not exists (select 1 from crm.dossiers where id = p_crm) then
    return;
  end if;
  insert into crm.activite (dossier_id, libelle) values (p_crm, left(p_libelle, 300));
  update crm.dossiers set maj_le = now() where id = p_crm;
end;
$$;

-- ============================================================
-- 7. Les droits : la clé de service seulement
-- ============================================================

revoke all on function public.ec_segment_du_crm(text) from public, anon, authenticated;
revoke all on function public.ec_formule_crm(text) from public, anon, authenticated;
revoke all on function public.ec_ville_de(text) from public, anon, authenticated;
revoke all on function public.ec_conseiller_crm(integer) from public, anon, authenticated;
revoke all on function public.ec_projeter_dossier_crm(integer) from public, anon, authenticated;
revoke all on function public.ec_ouvrir_espace_crm(integer, text) from public, anon, authenticated;
revoke all on function public.ec_signer_devis_crm(integer, text, integer, text, text) from public, anon, authenticated;
revoke all on function public.ec_arrhes_crm(integer, uuid, numeric, integer, text) from public, anon, authenticated;
revoke all on function public.ec_facture_payee_crm(integer, text) from public, anon, authenticated;
revoke all on function public.ec_maj_client_crm(integer, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.ec_noter_crm(integer, text) from public, anon, authenticated;

grant execute on function public.ec_segment_du_crm(text) to service_role;
grant execute on function public.ec_formule_crm(text) to service_role;
grant execute on function public.ec_ville_de(text) to service_role;
grant execute on function public.ec_conseiller_crm(integer) to service_role;
grant execute on function public.ec_projeter_dossier_crm(integer) to service_role;
grant execute on function public.ec_ouvrir_espace_crm(integer, text) to service_role;
grant execute on function public.ec_signer_devis_crm(integer, text, integer, text, text) to service_role;
grant execute on function public.ec_arrhes_crm(integer, uuid, numeric, integer, text) to service_role;
grant execute on function public.ec_facture_payee_crm(integer, text) to service_role;
grant execute on function public.ec_maj_client_crm(integer, text, text, text, text, text, text, text) to service_role;
grant execute on function public.ec_noter_crm(integer, text) to service_role;

-- La RLS de 0011 ne change pas : les colonnes nouvelles se lisent avec leur
-- ligne, par le seul client de la ligne. Les pièces se filtrent par segment
-- dans l'application ; leur catalogue n'a rien de personnel.

-- L'API recharge son schéma pour voir les fonctions nouvelles.
notify pgrst, 'reload schema';
