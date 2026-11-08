/*
 * Les sources du Feed : chaque historique de la plateforme, ramené à une même
 * ligne, pour qu'une seule requête (UNION ALL) les lise ensemble, du plus
 * récent au plus ancien. Voir donnees.ts pour la lecture, phrases.ts pour
 * les phrases.
 *
 * Une ligne :
 *   src, id          la source et l'identifiant dans la source (le détail se relit par eux) ;
 *   quand            l'heure de l'événement ; sans_heure quand la source ne garde qu'une date ;
 *   cote             client, staff ou les_deux (une demande reçue : le client l'envoie, l'équipe la reçoit) ;
 *   genres           les types d'événement (filtre « Tous les types ») : le premier donne l'icône ;
 *   acteur_*         qui : staff (un membre de l'équipe), client, auto (une règle, une tâche) ;
 *   dossier_id, request_id, ec_dossier_id   le dossier du CRM, la demande du site, l'espace client ;
 *   texte            ce que la recherche lit ;
 *   d                les champs dont la phrase a besoin (jamais le texte d'un message).
 *
 * Chaque événement n'apparaît qu'une fois : quand deux historiques gardent le
 * même geste, la source la moins précise s'efface (« not exists ») devant
 * l'autre — le fil du dossier devant les dates du devis, le journal des
 * envois devant les anciens journaux, le journal des gestes devant la ligne
 * du fil qu'il décrit. Chaque règle est écrite à côté de sa source.
 */

export type Cote = "client" | "staff" | "les_deux";
export type TypeActeur = "staff" | "client" | "auto";

export const GENRES = [
  { cle: "demande", libelle: "Demandes du site" },
  { cle: "message", libelle: "E-mails et SMS" },
  { cle: "devis", libelle: "Devis" },
  { cle: "facture", libelle: "Factures et paiements" },
  { cle: "rdv", libelle: "Rendez-vous et visites" },
  { cle: "espace", libelle: "Espace client" },
  { cle: "exploitation", libelle: "Exploitation" },
  { cle: "dossier", libelle: "Dossiers" },
  { cle: "relance", libelle: "Relances et alertes" },
  { cle: "suppression", libelle: "Suppressions" },
  { cle: "reglage", libelle: "Réglages et équipe" },
] as const;
export type Genre = (typeof GENRES)[number]["cle"];

export interface Source {
  cle: string;
  /** Ce que la source peut produire : une source qui ne peut rien donner pour les filtres choisis n'est pas lue. */
  cotes: Cote[];
  genres: Genre[];
  acteurs: TypeActeur[];
  sql: string;
}

/** Les colonnes de chaque source, dans cet ordre. */
export const COLONNES = "src, id, quand, sans_heure, cote, genres, acteur_type, acteur_email, acteur_nom, acteur_id, dossier_id, request_id, ec_dossier_id, texte, d";

/** Le nom d'un client du CRM (c.*), comme nomClient(). */
const NOM_CRM = (c: string) => `coalesce(nullif(btrim(${c}.societe), ''), nullif(btrim(concat_ws(' ', ${c}.prenom, ${c}.nom)), ''))`;
/** Le nom d'un client de l'espace client (ec_clients). */
const NOM_EC = (c: string) => `coalesce(nullif(btrim(${c}.societe), ''), nullif(btrim(concat_ws(' ', ${c}.prenom, ${c}.nom)), ''), ${c}.email)`;
/** Le dossier du CRM né d'une demande du site. */
const DOSSIER_DE_DEMANDE = (r: string) => `(select x.id from crm.dossiers x where x.request_id = ${r} order by x.id limit 1)`;
/** La demande du site désignée par une référence d'envoi (un uuid), sinon rien. */
const DEMANDE_DE_REFERENCE = (ref: string) => `case when ${ref} ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then ${ref}::uuid end`;

/** Le type d'événement d'une ligne du fil d'un dossier (crm.activite), d'après sa phrase. */
const GENRES_ACTIVITE = `case
  when a.libelle ~* '(supprim|retirée? (de|du|des)|abandonnée)' then array['suppression', 'dossier']
  when a.libelle ~* '(relance|ne pas relancer)' then array['relance']
  when a.libelle ~* '(^sms|sms de|par sms|par e-mail|courriers et sms|message de la veille|rappel de visite)' and a.libelle !~* 'devis' then array['message']
  when a.libelle ~* 'devis' then array['devis']
  when a.libelle ~* '(factur|arrhes|règlement|réglée?s?|paiement|encaiss|avoir )' then array['facture']
  when a.libelle ~* '(visite|rendez-vous|visio|créneau)' then array['rdv']
  when a.libelle ~* '(espace client|lien d.accès)' then array['espace']
  when a.libelle ~* '(lettre|conteneur|garde-meuble|exploitation|litige|chantier|tournée|avarie|planning|dispatch)' then array['exploitation']
  else array['dossier'] end`;

/** Une ligne du fil écrite par le client lui-même (espace client, signature, réponse à un SMS). */
const PAR_LE_CLIENT = `(a.utilisateur_id is null and a.libelle ~* '(par le client|^le client )')`;

/** Le type d'événement d'une ligne du journal des gestes, d'après son objet. */
const GENRES_JOURNAL = `(case when j.action ~ '\\.(supprime|retire|supprimes|retires)$' then array['suppression'] else array[]::text[] end) || array[case
  when j.objet_type in ('message', 'discussion') then 'message'
  when j.objet_type in ('demande', 'rappel', 'devis_questionnaire') then 'demande'
  when j.objet_type in ('devis', 'devis_espace') then 'devis'
  when j.objet_type in ('reglement', 'facture', 'facture_espace') then 'facture'
  when j.objet_type in ('rdv', 'proposition_visite', 'visite', 'photo_visite') then 'rdv'
  when j.objet_type in ('document_espace', 'acces_espace', 'sessions_espace', 'dossier_espace', 'client_espace', 'piece_requise', 'conseiller', 'sav') then 'espace'
  when j.objet_type in ('conteneur', 'conteneur_client', 'commentaire_conteneur', 'plan_dispatch', 'ligne_dispatch', 'colonne_dispatch', 'lettre_voiture',
                        'operation', 'contrat_garde_meuble', 'caisse', 'photo_caisse', 'litige', 'photo_chantier', 'partenaire', 'contact_partenaire') then 'exploitation'
  when j.objet_type in ('exclusion_relance', 'destinataire_alerte') then 'relance'
  when j.objet_type in ('regle_alerte', 'modele_courrier', 'membre_equipe', 'photo_bibliotheque', 'espace_pro', 'logo_espace_pro', 'compte_rh', 'modele_dossier') then 'reglage'
  else 'dossier' end]`;

/** Une date sans heure (émission d'une facture, réception d'un règlement) : midi, heure de Paris. */
const MIDI = (jour: string) => `((${jour} + time '12:00') at time zone 'Europe/Paris')`;
/**
 * L'heure d'une facture ou d'un règlement : la colonne cree_le a été ajoutée
 * après coup, et remplie pour les lignes d'avant à l'heure de l'ajout — la
 * même pour toutes. Elle ne vaut donc que si elle suit la date de près et
 * n'est partagée avec aucune autre ligne ; sinon, la date seule.
 */
const HEURE_FIABLE = (t: string, table: string, jour: string) =>
  `(${t}.cree_le is not null and ${t}.cree_le::date between ${jour} - 1 and ${jour} + 1
    and not exists (select 1 from ${table} x where x.cree_le = ${t}.cree_le and x.id <> ${t}.id))`;

export const SOURCES: Source[] = [
  // ── Les demandes du site : envoyées par le client, reçues par l'équipe (David les veut aussi côté Staff).
  {
    cle: "demande",
    cotes: ["les_deux"],
    genres: ["demande"],
    acteurs: ["client"],
    sql: `select 'demande' as src, r.id::text as id, r.created_at as quand, false as sans_heure, 'les_deux' as cote, array['demande'] as genres,
      'client' as acteur_type, null::text as acteur_email, r.client_nom as acteur_nom, null::int as acteur_id,
      ${DOSSIER_DE_DEMANDE("r.id")} as dossier_id, r.id as request_id, null::uuid as ec_dossier_id,
      concat_ws(' ', r.client_nom, r.client_email, r.depart_ville, r.arrivee_ville, er.sujet) as texte,
      jsonb_build_object('source', r.source, 'depart', r.depart_ville, 'arrivee', r.arrivee_ville, 'volume', r.volume_m3, 'sujet', er.sujet,
        'espace', r.raw_payload->'espace'->>'nom') as d
    from public.requests r
    left join lateral (select e.sujet from public.emails_recus e where e.request_id = r.id order by e.created_at limit 1) er on true`,
  },
  // Un e-mail reçu qui n'a pas fait de demande.
  {
    cle: "courriel",
    cotes: ["client"],
    genres: ["message"],
    acteurs: ["client"],
    sql: `select 'courriel', e.id::text, e.created_at, false, 'client', array['message'],
      'client', null::text, coalesce(e.client_nom, e.expediteur), null::int, null::int, null::uuid, null::uuid,
      concat_ws(' ', e.client_nom, e.expediteur, e.sujet), jsonb_build_object('sujet', e.sujet, 'expediteur', e.expediteur)
    from public.emails_recus e where e.request_id is null`,
  },
  // ── L'historique des demandes (hors messages, et hors création : la demande elle-même la dit).
  {
    cle: "evt",
    cotes: ["client", "staff"],
    genres: ["demande"],
    acteurs: ["client", "staff", "auto"],
    // Un rappel est demandé par le client (« Être rappelé »), ou par l'équipe (Demandes, « À rappeler ») : il porte alors `par`.
    sql: `select 'evt', e.id::text, e.created_at, false,
      case when e.type = 'completed' or (e.type = 'rappel' and coalesce(e.payload->>'par', '') = '') then 'client' else 'staff' end, array['demande'],
      case when e.type = 'completed' or (e.type = 'rappel' and coalesce(e.payload->>'par', '') = '') then 'client'
           when e.type in ('status_changed', 'note', 'scored', 'estimated', 'suivi', 'rappel') then 'staff' else 'auto' end,
      lower(nullif(e.payload->>'par', '')),
      case when e.type = 'completed' or (e.type = 'rappel' and coalesce(e.payload->>'par', '') = '') then r.client_nom end, null::int,
      ${DOSSIER_DE_DEMANDE("e.request_id")}, e.request_id, null::uuid,
      concat_ws(' ', r.client_nom, r.depart_ville, r.arrivee_ville),
      jsonb_build_object('type', e.type, 'p', e.payload - 'lines' - 'note', 'note', e.payload ? 'note' and coalesce(e.payload->>'note', '') <> '')
    from public.request_events e left join public.requests r on r.id = e.request_id
    where e.type not in ('message', 'created')`,
  },
  // ── Les envois : le journal unifié (public.envois), la source de référence. Les messages de
  // l'espace client y sont reliés par notification_id : ils se lisent depuis ec_notifications.
  // Un e-mail envoyé à la main est signé au journal des gestes (message.envoye) : celui-ci le montre.
  {
    cle: "envoi",
    cotes: ["staff"],
    genres: ["message"],
    acteurs: ["staff", "auto"],
    sql: `select 'envoi', v.id::text, v.cree_le, false, 'staff', array['message'],
      case when v.origine = 'veille' or v.origine = 'espace_client' or (v.origine = 'questionnaires' and coalesce(v.modele, '') like 'Alerte :%') then 'auto' else 'staff' end,
      null::text, null::text, null::int,
      (select x.id from crm.dossiers x where x.ref = v.reference limit 1), ${DEMANDE_DE_REFERENCE("v.reference")}, null::uuid,
      concat_ws(' ', v.destinataire, v.sujet, v.modele, v.reference),
      jsonb_build_object('canal', v.canal, 'origine', v.origine, 'modele', v.modele, 'destinataire', v.destinataire, 'sujet', v.sujet,
        'statut', v.statut, 'motif', v.motif, 'reference', v.reference)
    from public.envois v
    where v.notification_id is null
      and not exists (select 1 from crm.journal j where j.action = 'message.envoye' and j.details->>'destinataire' = v.destinataire
                        and j.quand between v.cree_le and v.cree_le + interval '2 minutes')`,
  },
  // Les messages de l'espace client : ceux que le client écrit (au conseiller, une demande de
  // service) sont ses gestes ; les autres partent vers lui, automatiquement. Le statut est celui
  // du journal des envois quand il y est. Le lien d'accès envoyé par l'équipe est déjà au journal des gestes.
  {
    cle: "notif",
    cotes: ["client", "staff"],
    genres: ["message", "espace"],
    acteurs: ["client", "auto"],
    sql: `select 'notif', n.id::text, n.sent_at, false,
      case when n.modele in ('message_conseiller', 'service_demande') then 'client' else 'staff' end,
      case when n.modele in ('message_conseiller', 'service_demande') then array['espace', 'message'] else array['message'] end,
      case when n.modele in ('message_conseiller', 'service_demande') then 'client' else 'auto' end,
      null::text, case when n.modele in ('message_conseiller', 'service_demande') then coalesce(n.payload->>'client', ${NOM_EC("c")}) end, null::int,
      ed.crm_dossier_id, ed.request_id, n.dossier_id,
      concat_ws(' ', n.destinataire, n.sujet, ed.reference, n.payload->>'client', n.payload->>'service'),
      jsonb_build_object('canal', n.canal, 'modele', n.modele, 'destinataire', n.destinataire, 'sujet', n.sujet,
        'statut', coalesce(v.statut, n.statut), 'motif', coalesce(v.motif, n.erreur), 'service', n.payload->>'service', 'reference', ed.reference)
    from public.ec_notifications n
    left join public.ec_dossiers ed on ed.id = n.dossier_id
    left join public.ec_clients c on c.id = ed.client_id
    left join lateral (select v.statut, v.motif from public.envois v where v.notification_id = n.id order by v.cree_le desc limit 1) v on true
    where not exists (select 1 from crm.journal j where j.details->>'notification_id' = n.id::text)`,
  },
  // Les messages des règles des questionnaires, tracés à l'historique de la demande : seuls ceux
  // qui ne sont pas au journal des envois (d'avant lui, ou jamais partis : modèle ou adresse manquants).
  {
    cle: "rem",
    cotes: ["staff"],
    genres: ["message"],
    acteurs: ["auto"],
    sql: `select 'rem', e.id::text, e.created_at, false, 'staff', array['message'], 'auto', null::text, null::text, null::int,
      ${DOSSIER_DE_DEMANDE("e.request_id")}, e.request_id, null::uuid,
      concat_ws(' ', r.client_nom, e.payload->>'to', e.payload->>'template', e.payload->>'rule', m.sujet),
      jsonb_build_object('canal', e.payload->>'channel', 'modele', e.payload->>'template', 'regle', e.payload->>'rule', 'destinataire', e.payload->>'to',
        'statut', e.payload->>'status', 'motif', e.payload->>'erreur', 'sujet', m.sujet, 'client', r.client_nom)
    from public.request_events e
    left join public.requests r on r.id = e.request_id
    left join lateral (select em.sujet from public.emails em where em.destinataire = e.payload->>'to'
                         and em.created_at between e.created_at - interval '10 seconds' and e.created_at + interval '10 seconds'
                       order by em.created_at desc limit 1) m on true
    where e.type = 'message'
      and not exists (select 1 from public.envois v where v.origine = 'questionnaires' and v.canal = e.payload->>'channel'
                        and v.cree_le between e.created_at - interval '2 minutes' and e.created_at + interval '5 seconds'
                        and (v.reference = e.request_id::text or v.destinataire = e.payload->>'to'))`,
  },
  // L'ancien journal des e-mails des questionnaires : seuls les messages qu'aucun autre journal ne garde.
  {
    cle: "mail",
    cotes: ["staff"],
    genres: ["message"],
    acteurs: ["staff", "auto"],
    sql: `select 'mail', em.id::text, em.created_at, false, 'staff', array['message'],
      case when coalesce(em.template, '') like 'Alerte :%' then 'auto' else 'staff' end, null::text, null::text, null::int,
      null::int, null::uuid, null::uuid,
      concat_ws(' ', em.destinataire, em.sujet, em.template),
      jsonb_build_object('canal', case when em.sujet like '[SMS]%' then 'sms' else 'email' end, 'modele', em.template, 'destinataire', em.destinataire,
        'sujet', em.sujet, 'statut', em.status::text, 'motif', em.erreur)
    from public.emails em
    where not exists (select 1 from public.request_events e where e.type = 'message' and e.payload->>'to' = em.destinataire
                        and e.created_at between em.created_at - interval '10 seconds' and em.created_at + interval '10 seconds')
      and not exists (select 1 from public.envois v where v.destinataire = em.destinataire
                        and v.cree_le between em.created_at - interval '2 minutes' and em.created_at + interval '5 seconds')
      and not exists (select 1 from crm.journal j where j.action = 'message.envoye' and j.details->>'destinataire' = em.destinataire
                        and j.quand between em.created_at and em.created_at + interval '2 minutes')`,
  },
  // ── Le fil des dossiers du CRM : les gestes de l'équipe, des clients (espace, signature,
  // réponse à un SMS) et des tâches. Une ligne décrite par le journal des gestes s'efface devant lui.
  {
    cle: "activite",
    cotes: ["client", "staff"],
    genres: ["suppression", "dossier", "relance", "message", "devis", "facture", "rdv", "espace", "exploitation"],
    acteurs: ["client", "staff", "auto"],
    sql: `select 'activite', a.id::text, a.cree_le, false,
      case when ${PAR_LE_CLIENT} then 'client' else 'staff' end, ${GENRES_ACTIVITE},
      case when a.utilisateur_id is not null then 'staff' when ${PAR_LE_CLIENT} then 'client' else 'auto' end,
      lower(u.email), coalesce(u.nom, case when ${PAR_LE_CLIENT} then ${NOM_CRM("c")} end), a.utilisateur_id,
      a.dossier_id, d.request_id, null::uuid,
      concat_ws(' ', a.libelle, d.ref, c.nom, c.prenom, c.societe),
      jsonb_build_object('libelle', a.libelle)
    from crm.activite a
    left join crm.utilisateurs u on u.id = a.utilisateur_id
    left join crm.dossiers d on d.id = a.dossier_id
    left join crm.clients c on c.id = d.client_id
    where not exists (select 1 from crm.journal j where j.activite_id = a.id)
      and not (a.utilisateur_id is null and a.dossier_id is not null and exists (
        select 1 from crm.journal j where j.dossier_id = a.dossier_id and j.action in ('acces_espace.envoye', 'dossier_espace.realise')
          and j.quand between a.cree_le - interval '1 minute' and a.cree_le + interval '1 minute'))`,
  },
  // ── Le journal des gestes : suppressions, gestes hors dossier, gestes de l'espace équipe.
  {
    cle: "journal",
    cotes: ["client", "staff"],
    genres: ["suppression", "message", "demande", "devis", "facture", "rdv", "espace", "exploitation", "relance", "reglage", "dossier"],
    acteurs: ["client", "staff", "auto"],
    sql: `select 'journal', j.id::text, j.quand, false, case j.acteur_type when 'client' then 'client' else 'staff' end, ${GENRES_JOURNAL},
      j.acteur_type, coalesce(lower(u.email), j.acteur_email), coalesce(u.nom, j.acteur_nom), u.id,
      j.dossier_id, coalesce(j.request_id, d.request_id), null::uuid,
      concat_ws(' ', j.libelle, j.acteur_nom, d.ref),
      jsonb_build_object('action', j.action, 'libelle', j.libelle, 'objet_type', j.objet_type, 'objet_id', j.objet_id,
        'statut', j.details->>'statut', 'canal', j.details->>'canal')
    from crm.journal j
    left join lateral (select u.* from crm.utilisateurs u
                        where u.id = j.acteur_id or (j.acteur_id is null and j.acteur_email is not null and lower(u.email) = j.acteur_email)
                        order by (u.id = j.acteur_id) desc limit 1) u on true
    left join crm.dossiers d on d.id = j.dossier_id`,
  },
  // ── Les devis du CRM : envoyés (l'équipe) et signés (le client), quand le fil du dossier ne le dit pas déjà.
  {
    cle: "devis_envoye",
    cotes: ["staff"],
    genres: ["devis"],
    acteurs: ["staff"],
    sql: `select 'devis_envoye', v.id::text, v.envoye_le, false, 'staff', array['devis'], 'staff', null::text, null::text, null::int,
      v.dossier_id, d.request_id, null::uuid,
      concat_ws(' ', v.numero, d.ref, c.nom, c.prenom, c.societe),
      jsonb_build_object('numero', v.numero, 'formule', v.formule, 'montant', v.montant, 'titre', v.titre)
    from crm.devis v join crm.dossiers d on d.id = v.dossier_id join crm.clients c on c.id = d.client_id
    where v.envoye_le is not null
      and not exists (select 1 from crm.activite a where a.dossier_id = v.dossier_id and a.libelle ~* 'devis' and a.libelle ~* '(envoy|sign|accept)'
                        and a.cree_le between v.envoye_le - interval '5 minutes' and v.envoye_le + interval '5 minutes')`,
  },
  {
    cle: "devis_signe",
    cotes: ["client"],
    genres: ["devis"],
    acteurs: ["client"],
    sql: `select 'devis_signe', v.id::text, v.signe_le, false, 'client', array['devis'], 'client', null::text, ${NOM_CRM("c")}, null::int,
      v.dossier_id, d.request_id, null::uuid,
      concat_ws(' ', v.numero, d.ref, c.nom, c.prenom, c.societe),
      jsonb_build_object('numero', v.numero, 'formule', v.formule, 'montant', v.montant, 'titre', v.titre)
    from crm.devis v join crm.dossiers d on d.id = v.dossier_id join crm.clients c on c.id = d.client_id
    where v.signe_le is not null
      and not exists (select 1 from crm.activite a where a.dossier_id = v.dossier_id and a.libelle ~* 'devis' and a.libelle ~* '(sign|accept)'
                        and a.cree_le between v.signe_le - interval '5 minutes' and v.signe_le + interval '5 minutes')`,
  },
  // ── Factures et règlements, quand le fil du dossier ne les dit pas déjà (les plus anciens n'ont que leur date).
  {
    cle: "facture",
    cotes: ["staff"],
    genres: ["facture"],
    acteurs: ["staff"],
    sql: `select 'facture', f.id::text, case when h.fiable then f.cree_le else ${MIDI("f.emise_le")} end, not h.fiable,
      'staff', array['facture'], 'staff', lower(u.email), u.nom, f.emise_par,
      f.dossier_id, d.request_id, null::uuid,
      concat_ws(' ', f.numero, f.objet, d.ref, c.nom, c.prenom, c.societe),
      jsonb_build_object('numero', f.numero, 'objet', f.objet, 'montant', f.montant, 'genre', f.genre, 'garde_meuble_id', f.garde_meuble_id)
    from crm.factures f
    cross join lateral (select ${HEURE_FIABLE("f", "crm.factures", "f.emise_le")} as fiable) h
    left join crm.dossiers d on d.id = f.dossier_id left join crm.clients c on c.id = d.client_id
    left join crm.utilisateurs u on u.id = f.emise_par
    where not (h.fiable and exists (
      select 1 from crm.activite a where a.dossier_id = f.dossier_id and a.libelle ~* '(factur|avoir)'
        and a.cree_le between f.cree_le - interval '5 minutes' and f.cree_le + interval '5 minutes'))`,
  },
  {
    cle: "paiement",
    cotes: ["client", "staff"],
    genres: ["facture"],
    acteurs: ["client", "staff"],
    sql: `select 'paiement', p.id::text, case when h.fiable then p.cree_le else ${MIDI("p.recu_le")} end, not h.fiable,
      case when p.session_paiement_id is not null then 'client' else 'staff' end, array['facture'],
      case when p.session_paiement_id is not null then 'client' else 'staff' end, lower(u.email),
      coalesce(u.nom, case when p.session_paiement_id is not null then ${NOM_CRM("c")} end), p.saisi_par,
      p.dossier_id, d.request_id, null::uuid,
      concat_ws(' ', p.libelle, d.ref, c.nom, c.prenom, c.societe),
      jsonb_build_object('libelle', p.libelle, 'montant', p.montant, 'mode', p.mode, 'nature', p.nature)
    from crm.paiements p
    cross join lateral (select ${HEURE_FIABLE("p", "crm.paiements", "p.recu_le")} as fiable) h
    left join crm.dossiers d on d.id = p.dossier_id left join crm.clients c on c.id = d.client_id
    left join crm.utilisateurs u on u.id = p.saisi_par
    where not (h.fiable and exists (
      select 1 from crm.activite a where a.dossier_id = p.dossier_id and a.libelle ~* '(règlement|arrhes|encaiss|réglé|paiement)'
        and a.cree_le between p.cree_le - interval '5 minutes' and p.cree_le + interval '5 minutes'))`,
  },
  // ── Les dossiers du CRM créés sans ligne « Dossier créé » au fil (reprise, import).
  {
    cle: "dossier",
    cotes: ["staff"],
    genres: ["dossier"],
    acteurs: ["staff"],
    sql: `select 'dossier', d.id::text, d.cree_le, false, 'staff', array['dossier'], 'staff', lower(u.email), u.nom, d.cree_par_id,
      d.id, d.request_id, null::uuid,
      concat_ws(' ', d.ref, c.nom, c.prenom, c.societe),
      jsonb_build_object('ref', d.ref, 'type', c.type)
    from crm.dossiers d join crm.clients c on c.id = d.client_id left join crm.utilisateurs u on u.id = d.cree_par_id
    where not exists (select 1 from crm.activite a where a.dossier_id = d.id
                        and (a.libelle like 'Dossier créé%' or a.libelle like 'Dossier dupliqué%' or a.libelle like 'Dossier fictif semé%'))`,
  },
  // Les litiges ouverts sans ligne au fil (les plus anciens) : une date, sans heure.
  {
    cle: "litige",
    cotes: ["staff"],
    genres: ["exploitation"],
    acteurs: ["staff"],
    sql: `select 'litige', l.id::text, ${MIDI("l.ouvert_le")}, true, 'staff', array['exploitation'], 'staff', null::text, null::text, null::int,
      l.dossier_id, d.request_id, null::uuid,
      concat_ws(' ', l.objet, d.ref, c.nom, c.prenom, c.societe),
      jsonb_build_object('objet', l.objet, 'montant', l.montant)
    from crm.litiges l join crm.dossiers d on d.id = l.dossier_id join crm.clients c on c.id = d.client_id
    where not exists (select 1 from crm.activite a where a.dossier_id = l.dossier_id and a.libelle ~* 'litige ouvert')`,
  },
  // ── Exploitation : l'historique des conteneurs, leurs commentaires, le dispatch.
  {
    cle: "conteneur",
    cotes: ["staff"],
    genres: ["exploitation"],
    acteurs: ["staff", "auto"],
    sql: `select 'conteneur', h.id::text, h.cree_le, false, 'staff', array['exploitation'],
      case when h.utilisateur_id is null then 'auto' else 'staff' end, lower(u.email), u.nom, h.utilisateur_id,
      null::int, null::uuid, null::uuid,
      concat_ws(' ', h.libelle, k.numero, k.destination),
      jsonb_build_object('libelle', h.libelle, 'numero', k.numero, 'conteneur_id', k.id)
    from crm.conteneur_historique h join crm.conteneurs k on k.id = h.conteneur_id left join crm.utilisateurs u on u.id = h.utilisateur_id
    where not (h.libelle like 'Client retiré%' and exists (
      select 1 from crm.journal j where j.action = 'conteneur_client.retire' and j.quand between h.cree_le - interval '1 minute' and h.cree_le + interval '1 minute'))`,
  },
  {
    cle: "commentaire",
    cotes: ["staff"],
    genres: ["exploitation"],
    acteurs: ["staff"],
    sql: `select 'commentaire', m.id::text, m.cree_le, false, 'staff', array['exploitation'], 'staff', lower(u.email), coalesce(u.nom, m.auteur), m.utilisateur_id,
      null::int, null::uuid, null::uuid,
      concat_ws(' ', k.numero, k.destination, m.auteur),
      jsonb_build_object('numero', k.numero, 'conteneur_id', k.id)
    from crm.conteneur_commentaires m join crm.conteneurs k on k.id = m.conteneur_id left join crm.utilisateurs u on u.id = m.utilisateur_id`,
  },
  {
    cle: "dispatch",
    cotes: ["staff"],
    genres: ["exploitation"],
    acteurs: ["staff", "auto"],
    sql: `select 'dispatch', h.id::text, h.cree_le, false, 'staff', array['exploitation'],
      case when h.utilisateur_id is null then 'auto' else 'staff' end, lower(u.email), u.nom, h.utilisateur_id,
      l.dossier_id, null::uuid, null::uuid,
      concat_ws(' ', h.libelle, p.nom),
      jsonb_build_object('libelle', h.libelle, 'plan', p.nom, 'plan_id', p.id)
    from crm.dispatch_historique h join crm.dispatch_plans p on p.id = h.plan_id
    left join crm.dispatch_lignes l on l.id = h.ligne_id
    left join crm.utilisateurs u on u.id = h.utilisateur_id
    where not exists (select 1 from crm.journal j where j.objet_type in ('ligne_dispatch', 'colonne_dispatch') and j.libelle = h.libelle
                        and j.quand between h.cree_le - interval '1 minute' and h.cree_le + interval '1 minute')`,
  },
  // ── Relances et alertes : les règles de relance changées, les alertes de l'équipe envoyées.
  // (Les relances parties et les exclusions sont au fil des dossiers.)
  {
    cle: "regle_relance",
    cotes: ["staff"],
    genres: ["relance", "reglage"],
    acteurs: ["staff"],
    sql: `select 'regle_relance', r.id::text, r.cree_le, false, 'staff', array['relance', 'reglage'], 'staff', lower(u.email), coalesce(u.nom, r.par), u.id,
      null::int, null::uuid, null::uuid,
      concat_ws(' ', r.resume, r.par), jsonb_build_object('resume', r.resume, 'type', r.type)
    from crm.relances_journal r
    left join lateral (select u.* from crm.utilisateurs u where u.nom = r.par or lower(u.email) = lower(r.par) limit 1) u on true
    where r.action = 'regle'`,
  },
  {
    cle: "alerte",
    cotes: ["staff"],
    genres: ["relance"],
    acteurs: ["auto"],
    sql: `select 'alerte', a.id::text, a.cree_le, false, 'staff', array['relance'], 'auto', null::text, null::text, null::int,
      (select x.id from crm.dossiers x where x.ref = a.reference limit 1), null::uuid, null::uuid,
      concat_ws(' ', a.alerte, a.reference, a.resume),
      jsonb_build_object('alerte', a.alerte, 'reference', a.reference, 'destinataires', a.destinataires, 'resume', a.resume)
    from crm.alertes_evenements a`,
  },
  // ── L'espace client : connexions, pièces, acceptations, déclarations, cartons, paiements.
  {
    cle: "session",
    cotes: ["client"],
    genres: ["espace"],
    acteurs: ["client"],
    sql: `select 'session', s.session_id::text, s.ouverte_le, false, 'client', array['espace'], 'client', null::text, ${NOM_EC("c")}, null::int,
      ed.crm_dossier_id, ed.request_id, ed.id,
      concat_ws(' ', c.prenom, c.nom, c.societe, c.email, ed.reference),
      jsonb_build_object('reference', ed.reference, 'demo', c.demo)
    from public.ec_sessions s join public.ec_clients c on c.id = s.client_id
    left join lateral (select x.id, x.reference, x.crm_dossier_id, x.request_id from public.ec_dossiers x where x.client_id = c.id order by x.created_at desc limit 1) ed on true`,
  },
  {
    cle: "document",
    cotes: ["client", "staff"],
    genres: ["espace"],
    acteurs: ["client", "staff"],
    sql: `select 'document', x.id::text, x.created_at, false, case when x.source = 'client' then 'client' else 'staff' end, array['espace'],
      case when x.source = 'client' then 'client' else 'staff' end,
      case when x.created_by ~ '@' then lower(x.created_by) end,
      case when x.source = 'client' then ${NOM_EC("c")} when x.created_by !~* '^[0-9a-f-]{36}$' and x.created_by !~ '@' then x.created_by end, null::int,
      ed.crm_dossier_id, ed.request_id, ed.id,
      concat_ws(' ', x.libelle, x.nom_fichier, ed.reference, c.nom, c.prenom, c.societe),
      jsonb_build_object('libelle', x.libelle, 'categorie', x.categorie, 'reference', ed.reference)
    from public.ec_documents x join public.ec_dossiers ed on ed.id = x.dossier_id join public.ec_clients c on c.id = ed.client_id
    where x.crm_visite_id is null`,
  },
  {
    cle: "acceptation",
    cotes: ["client"],
    genres: ["espace", "devis"],
    acteurs: ["client"],
    sql: `select 'acceptation', a.id::text, a.accepted_at, false, 'client', case when a.type = 'devis' then array['devis', 'espace'] else array['espace'] end,
      'client', null::text, ${NOM_EC("c")}, null::int,
      ed.crm_dossier_id, ed.request_id, ed.id,
      concat_ws(' ', a.type, a.objet, ed.reference, c.nom, c.prenom, c.societe),
      jsonb_build_object('type', a.type, 'objet', a.objet, 'total', dv.total, 'reference', ed.reference)
    from public.ec_acceptations a join public.ec_dossiers ed on ed.id = a.dossier_id join public.ec_clients c on c.id = ed.client_id
    left join public.ec_declarations_valeurs dv on a.type = 'declaration_valeurs' and dv.dossier_id = a.dossier_id
    where not (a.type = 'devis' and (
      exists (select 1 from crm.devis v where v.numero = a.objet and v.signe_le between a.accepted_at - interval '5 minutes' and a.accepted_at + interval '5 minutes')
      or (ed.crm_dossier_id is not null and exists (select 1 from crm.activite x where x.dossier_id = ed.crm_dossier_id and x.libelle ~* '(sign|accept)'
            and x.cree_le between a.accepted_at - interval '5 minutes' and a.accepted_at + interval '5 minutes'))))`,
  },
  {
    cle: "sav",
    cotes: ["client"],
    genres: ["espace", "exploitation"],
    acteurs: ["client"],
    sql: `select 'sav', s.id::text, s.created_at, false, 'client', array['espace', 'exploitation'], 'client', null::text, ${NOM_EC("c")}, null::int,
      ed.crm_dossier_id, ed.request_id, ed.id,
      concat_ws(' ', s.numero, s.objets, ed.reference, c.nom, c.prenom, c.societe),
      jsonb_build_object('numero', s.numero, 'reference', ed.reference)
    from public.ec_sav_declarations s join public.ec_dossiers ed on ed.id = s.dossier_id join public.ec_clients c on c.id = ed.client_id
    where not (ed.crm_dossier_id is not null and exists (
      select 1 from crm.activite x where x.dossier_id = ed.crm_dossier_id and x.libelle like '%' || s.numero || '%'))`,
  },
  {
    cle: "cartons",
    cotes: ["client"],
    genres: ["espace"],
    acteurs: ["client"],
    sql: `select 'cartons', k.id::text, k.created_at, false, 'client', array['espace'], 'client', null::text, ${NOM_EC("c")}, null::int,
      ed.crm_dossier_id, ed.request_id, ed.id,
      concat_ws(' ', ed.reference, c.nom, c.prenom, c.societe, k.adresse),
      jsonb_build_object('nb', k.nb_cartons, 'samedi', k.date_samedi, 'reference', ed.reference)
    from public.ec_livraisons_cartons k join public.ec_dossiers ed on ed.id = k.dossier_id join public.ec_clients c on c.id = ed.client_id`,
  },
  {
    cle: "paiement_en_ligne",
    cotes: ["client"],
    genres: ["facture", "espace"],
    acteurs: ["client"],
    sql: `select 'paiement_en_ligne', p.id::text, p.created_at, false, 'client', array['facture', 'espace'], 'client', null::text, ${NOM_EC("c")}, null::int,
      ed.crm_dossier_id, ed.request_id, ed.id,
      concat_ws(' ', p.libelle, p.reference, ed.reference, c.nom, c.prenom, c.societe),
      jsonb_build_object('libelle', p.libelle, 'montant', p.montant, 'statut', p.statut, 'reference', ed.reference)
    from public.ec_sessions_paiement p join public.ec_dossiers ed on ed.id = p.dossier_id join public.ec_clients c on c.id = ed.client_id`,
  },
  // ── Le suivi des e-mails au client (src/crm/suivi, public.envois_evenements), regroupé pour ne pas noyer le fil :
  // une ligne à la PREMIÈRE ouverture de chaque e-mail (certaine, sinon probable), une par lien cliqué et par jour,
  // et une par jour de visite du portail (pages vues et gestes clés). Le client en est l'auteur.
  {
    cle: "ouverture",
    cotes: ["client"],
    genres: ["message"],
    acteurs: ["client"],
    sql: `select 'ouverture', 'o-' || x.envoi_id::text, x.quand, false, 'client', array['message'], 'client', null::text, dd.nom, null::int,
      dd.id, coalesce(dd.request_id, ${DEMANDE_DE_REFERENCE("v.reference")}), null::uuid,
      concat_ws(' ', v.destinataire, v.sujet, v.modele, v.reference, dd.nom),
      jsonb_build_object('sujet', v.sujet, 'modele', v.modele, 'destinataire', v.destinataire, 'reference', v.reference, 'automatique', x.auto, 'n', x.n)
    from (select e.envoi_id, coalesce(min(e.cree_le) filter (where not e.automatique), min(e.cree_le)) as quand, bool_and(e.automatique) as auto,
                 count(*) filter (where not e.automatique)::int as n
            from public.envois_evenements e where e.type = 'ouverture' and e.envoi_id is not null group by e.envoi_id) x
    join public.envois v on v.id = x.envoi_id
    left join lateral (select d.id, d.request_id, ${NOM_CRM("c")} as nom from crm.dossiers d join crm.clients c on c.id = d.client_id where d.ref = v.reference limit 1) dd on true`,
  },
  {
    cle: "clic",
    cotes: ["client"],
    genres: ["message"],
    acteurs: ["client"],
    sql: `select 'clic', 'c-' || x.envoi_id::text || '-' || x.lien_indice || '-' || x.jour, x.quand, false, 'client', array['message'], 'client', null::text, dd.nom, null::int,
      dd.id, coalesce(dd.request_id, ${DEMANDE_DE_REFERENCE("v.reference")}), null::uuid,
      concat_ws(' ', v.destinataire, v.sujet, x.libelle, v.reference, dd.nom),
      jsonb_build_object('sujet', v.sujet, 'modele', v.modele, 'lien', x.libelle, 'destination', x.destination, 'reference', v.reference, 'automatique', x.auto, 'n', x.n)
    from (select e.envoi_id, e.lien_indice, to_char(e.cree_le at time zone 'Europe/Paris', 'YYYYMMDD') as jour, min(e.cree_le) as quand,
                 max(e.lien_libelle) as libelle, max(e.lien_url) as destination, count(*)::int as n, bool_and(e.automatique) as auto
            from public.envois_evenements e where e.type = 'clic' and e.envoi_id is not null group by 1, 2, 3) x
    join public.envois v on v.id = x.envoi_id
    left join lateral (select d.id, d.request_id, ${NOM_CRM("c")} as nom from crm.dossiers d join crm.clients c on c.id = d.client_id where d.ref = v.reference limit 1) dd on true`,
  },
  {
    cle: "portail",
    cotes: ["client"],
    genres: ["espace"],
    acteurs: ["client"],
    sql: `select 'portail', 'p-' || x.cle || '-' || x.jour, x.quand, false, 'client', array['espace'], 'client', null::text,
      coalesce(dd.nom, ${NOM_EC("ec")}), null::int,
      coalesce(x.crm_dossier_id, ed.crm_dossier_id), coalesce(dd.request_id, ed.request_id), x.ec_dossier_id,
      concat_ws(' ', x.reference, dd.nom, ec.nom, ec.prenom, ec.societe, ec.email),
      jsonb_build_object('pages', x.pages, 'gestes', x.gestes, 'reference', x.reference, 'depuis_email', x.depuis_email)
    from (select coalesce(e.crm_dossier_id::text, e.ec_dossier_id::text) as cle, to_char(e.cree_le at time zone 'Europe/Paris', 'YYYYMMDD') as jour,
                 min(e.cree_le) as quand, max(e.crm_dossier_id) as crm_dossier_id, (array_agg(e.ec_dossier_id) filter (where e.ec_dossier_id is not null))[1] as ec_dossier_id,
                 max(e.reference) as reference, coalesce(array_agg(distinct e.page) filter (where e.type = 'portail'), '{}') as pages,
                 coalesce(array_agg(distinct e.page) filter (where e.type = 'action'), '{}') as gestes, bool_or(e.envoi_id is not null) as depuis_email
            from public.envois_evenements e where e.type in ('portail', 'action') and coalesce(e.crm_dossier_id::text, e.ec_dossier_id::text) is not null
           group by 1, 2) x
    left join public.ec_dossiers ed on ed.id = x.ec_dossier_id
    left join public.ec_clients ec on ec.id = ed.client_id
    left join lateral (select d.id, d.request_id, ${NOM_CRM("c")} as nom from crm.dossiers d join crm.clients c on c.id = d.client_id
                        where d.id = coalesce(x.crm_dossier_id, ed.crm_dossier_id) limit 1) dd on true`,
  },
];

// ── La requête ─────────────────────────────────────────────────────────────────────────────────

export interface Filtres {
  /** La section : null = Tout ; client et staff gardent aussi ce qui est des deux côtés. */
  cote: "client" | "staff" | null;
  /** Le début de la période (ISO), ou rien. */
  depuis: string | null;
  genre: Genre | null;
  /** Un membre de l'équipe (son adresse, en minuscules), ou « auto » pour les envois et tâches automatiques. */
  acteur: string | null;
  /** Un dossier ou une demande : leurs identifiants dans les trois mondes (CRM, demandes du site, espace client). */
  objet: { dossiers: number[]; demandes: string[]; espaces: string[] } | null;
  recherche: string | null;
  /** Le fil des seules demandes du site (Demandes › Feed) : voir DU_FIL_DES_DEMANDES. */
  demandes?: boolean;
}

/** Les sources qui disent la vie d'une demande : sa réception, son historique, ses messages, ses gestes, son dossier. */
const SOURCES_DES_DEMANDES = ["demande", "evt", "rem", "envoi", "journal", "activite", "dossier"];
/**
 * Ce qui, dans ces sources, parle de la demande et non du dossier qu'elle est
 * devenue : sa réception, son historique (complétée, incomplète, analysée,
 * rappel, changements d'étape, notes), les messages envoyés à son sujet, les
 * gestes du journal qui la visent, et sa naissance en dossier (« Dossier créé
 * depuis une demande du site »). La suite de la vie du dossier reste au Feed.
 */
const DU_FIL_DES_DEMANDES = `s.request_id is not null and (
  s.src in ('demande', 'evt', 'rem', 'dossier')
  or (s.src = 'envoi' and s.dossier_id is null)
  or (s.src = 'journal' and (s.dossier_id is null or s.d->>'objet_type' in ('demande', 'rappel', 'devis_questionnaire')))
  or (s.src = 'activite' and s.d->>'libelle' like 'Dossier créé depuis une demande%'))`;

export interface Curseur {
  quand: string;
  cle: string;
}

const NOMS = `s(${COLONNES})`;

/** Les sources qui peuvent répondre aux filtres (les autres ne sont pas lues). */
function sourcesUtiles(f: Filtres, avecCote: boolean): Source[] {
  return SOURCES.filter((s) => {
    if (f.demandes && !SOURCES_DES_DEMANDES.includes(s.cle)) return false;
    if (avecCote && f.cote && !s.cotes.some((c) => c === f.cote || c === "les_deux")) return false;
    if (f.genre && !s.genres.includes(f.genre)) return false;
    if (f.acteur === "auto" && !s.acteurs.includes("auto")) return false;
    if (f.acteur && f.acteur !== "auto" && !s.acteurs.includes("staff")) return false;
    return true;
  });
}

/** Les conditions communes, et leurs paramètres. */
function conditions(f: Filtres, params: unknown[], avecCote: boolean): string[] {
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const w = ["s.quand is not null"];
  if (avecCote && f.cote) w.push(`s.cote in (${p(f.cote)}, 'les_deux')`);
  if (f.depuis) w.push(`s.quand >= ${p(f.depuis)}::timestamptz`);
  if (f.genre) w.push(`${p(f.genre)} = any(s.genres)`);
  if (f.acteur === "auto") w.push("s.acteur_type = 'auto'");
  else if (f.acteur) w.push(`s.acteur_type = 'staff' and s.acteur_email = ${p(f.acteur)}`);
  if (f.objet) {
    w.push(
      `(s.dossier_id = any(${p(f.objet.dossiers)}::int[]) or s.request_id = any(${p(f.objet.demandes)}::uuid[]) or s.ec_dossier_id = any(${p(f.objet.espaces)}::uuid[]))`,
    );
  }
  if (f.demandes) w.push(DU_FIL_DES_DEMANDES);
  if (f.recherche) w.push(`s.texte ilike ${p(`%${f.recherche.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)}`);
  return w;
}

/**
 * Une page du fil : chaque source lue jusqu'à `limite` lignes avant le curseur
 * (du plus récent au plus ancien), puis fusionnées. Une ligne de plus que la
 * page dit s'il y a une suite.
 */
export function requetePage(f: Filtres, limite: number, curseur: Curseur | null): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const w = conditions(f, params, true);
  if (curseur) {
    params.push(curseur.quand, curseur.cle);
    w.push(`(s.quand, s.src || ':' || s.id) < ($${params.length - 1}::timestamptz, $${params.length})`);
  }
  params.push(limite + 1);
  const n = `$${params.length}`;
  const parties = sourcesUtiles(f, true).map(
    (s) => `(select * from (${s.sql}) as ${NOMS} where ${w.join(" and ")} order by s.quand desc, s.src || ':' || s.id desc limit ${n})`,
  );
  if (!parties.length) return { sql: "select null::text as src where false", params: [] };
  return { sql: `select * from (${parties.join("\nunion all\n")}) u order by u.quand desc, u.src || ':' || u.id desc limit ${n}`, params };
}

/** Le nombre d'événements de chaque côté, pour les mêmes filtres (hors section). */
export function requeteComptes(f: Filtres): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const w = conditions(f, params, false);
  const parties = sourcesUtiles(f, false).map((s) => `select s.cote from (${s.sql}) as ${NOMS} where ${w.join(" and ")}`);
  if (!parties.length) return { sql: "select null::text as cote, 0 as n where false", params: [] };
  return { sql: `select u.cote, count(*)::int as n from (${parties.join("\nunion all\n")}) u group by u.cote`, params };
}
