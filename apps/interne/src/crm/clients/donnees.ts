import "server-only";
import { q, q1, type Row } from "@/crm/lib/db";
import { listerRelances } from "@/crm/relances/moteur";
import { chiffresTelephone, normaliser, type LigneClient } from "./commun";

/*
 * Les lectures des clients du CRM : la liste (/clients) et la fiche d'un
 * client (/clients/<id>). Un client, c'est une ligne de crm.clients ; ses
 * dossiers (client_id), leurs devis, factures et règlements (les soldes de
 * la vue crm.dossiers_soldes, comme partout), ses espaces client
 * (public.ec_dossiers.crm_dossier_id), ses rendez-vous, ses demandes du site
 * (même e-mail, ou la demande d'où vient un dossier) et ses doublons
 * possibles (même e-mail ou même téléphone).
 *
 * Tout se lit ici, rien ne s'écrit : les gestes sont dans actions.ts.
 */

const iso = (d: unknown): string | null => (d == null ? null : d instanceof Date ? d.toISOString() : String(d));

/* ───────────────────────────── La liste ───────────────────────────── */

/**
 * Une ligne par client, ses dossiers résumés : le dernier (son étape, son
 * commercial), le CA signé (le devis signé de chaque dossier, rien pour un
 * dossier perdu), le reste à payer, l'espace client (ouvert, dernière
 * connexion), la dernière activité (le client créé, un dossier modifié, une
 * ligne de son fil, un message de son espace).
 */
const SQL_LISTE = `
with par_dossier as (
  select d.id, d.client_id, d.ref, d.statut, d.commercial_id, d.cree_le,
    (d.archive_le is null and d.statut not in ('termine','perdu')) as en_cours,
    coalesce(s.engage, 0)::float8 as engage,
    greatest(coalesce(s.reste, 0), 0)::float8 as reste,
    (select string_agg(e.adresse, ' | ' order by e.ordre, e.id) from etapes_trajet e where e.dossier_id = d.id and e.adresse is not null and e.genre <> 'garde_meuble') as adresses,
    greatest(d.maj_le, (select max(a.cree_le) from activite a where a.dossier_id = d.id)) as activite,
    ec.nb as espaces, ec.connexion, ec.message
  from dossiers d
  left join dossiers_soldes s on s.dossier_id = d.id
  left join lateral (
    select count(*)::int as nb,
      max((select max(se.ouverte_le) from public.ec_sessions se where se.client_id = x.client_id)) as connexion,
      max((select max(m.created_at) from public.ec_messages m where m.dossier_id = x.id)) as message
    from public.ec_dossiers x where x.crm_dossier_id = d.id
  ) ec on true
)
select c.id, c.type, c.civilite, c.prenom, c.nom, c.societe, c.email, c.telephone, c.telephone2, c.cree_le,
  count(p.id)::int as nb_dossiers,
  count(p.id) filter (where p.en_cours)::int as en_cours,
  coalesce(sum(p.engage), 0)::float8 as ca,
  coalesce(sum(p.reste), 0)::float8 as reste,
  (array_agg(p.id order by p.cree_le desc, p.id desc))[1] as dernier_id,
  (array_agg(p.ref order by p.cree_le desc, p.id desc))[1] as dernier_ref,
  (array_agg(p.statut order by p.cree_le desc, p.id desc))[1] as dernier_statut,
  (array_agg(p.commercial_id order by p.cree_le desc, p.id desc))[1] as dernier_commercial_id,
  coalesce(array_agg(p.id) filter (where p.id is not null), '{}') as dossiers,
  string_agg(p.ref, ' ') as refs,
  string_agg(p.adresses, ' | ') as adresses,
  coalesce(sum(p.espaces), 0)::int as espaces,
  max(p.connexion) as derniere_connexion,
  greatest(c.cree_le, max(p.activite), max(p.message)) as activite
from clients c
left join par_dossier p on p.client_id = c.id
group by c.id`;

/** La ville d'une adresse : « 12 rue …, 69001 Lyon » → « Lyon ». */
export function villeDe(adresse: string | null | undefined): string | null {
  const a = (adresse ?? "").trim();
  if (!a) return null;
  const m = a.match(/\b\d{5}\s+([^,]+)$/);
  if (m) return m[1].trim();
  const parts = a
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1].replace(/^\d{5}\s*/, "") || null : null;
}

/** Les dossiers dont une relance attend (en retard ou du jour). Jamais bloquant : sans le moteur, aucun. */
async function dossiersARelancer(): Promise<Set<number>> {
  try {
    const r = await listerRelances();
    return new Set(r.filter((x) => x.colonne === "retard" || x.colonne === "aujourdhui").map((x) => x.dossierId));
  } catch (e) {
    console.error("Clients : lecture des relances impossible", e instanceof Error ? e.message : e);
    return new Set();
  }
}

/** Toute la liste, avant filtres : la page filtre, trie et découpe (quelques centaines de clients). */
export async function lignesClients(): Promise<LigneClient[]> {
  const [rows, commerciaux, relancer] = await Promise.all([
    q(SQL_LISTE),
    q<{ id: number; nom: string; initiales: string }>("select id, nom, initiales from utilisateurs"),
    dossiersARelancer(),
  ]);
  const equipe = new Map(commerciaux.map((c) => [c.id, c]));
  return rows.map((r): LigneClient => {
    const adresses = String(r.adresses ?? "")
      .split(" | ")
      .filter(Boolean);
    const villes = [...new Set(adresses.map(villeDe).filter((v): v is string => !!v))];
    const dossiers = (r.dossiers as number[]) ?? [];
    return {
      id: r.id,
      type: r.type,
      civilite: r.civilite,
      prenom: r.prenom,
      nom: r.nom,
      societe: r.societe,
      email: r.email,
      telephone: r.telephone,
      telephone2: r.telephone2,
      creeLe: iso(r.cree_le)!,
      nbDossiers: r.nb_dossiers,
      enCours: r.en_cours,
      ca: Number(r.ca) || 0,
      reste: Number(r.reste) || 0,
      dernier: r.dernier_id
        ? { id: r.dernier_id, ref: r.dernier_ref, statut: r.dernier_statut, commercialId: r.dernier_commercial_id ?? null, commercial: equipe.get(r.dernier_commercial_id) ?? null }
        : null,
      villes,
      espaces: r.espaces,
      derniereConnexion: iso(r.derniere_connexion),
      activite: iso(r.activite) ?? iso(r.cree_le)!,
      aRelancer: dossiers.some((id) => relancer.has(id)),
      texte: normaliser([r.prenom, r.nom, r.societe, r.email, r.telephone, r.telephone2, r.refs, adresses.join(" "), `n° ${r.id}`].filter(Boolean).join(" ")),
      telephones: [r.telephone, r.telephone2].map(chiffresTelephone).filter(Boolean).join(" "),
    };
  });
}

/* ───────────────────────────── La fiche ───────────────────────────── */

export interface DossierClient {
  id: number;
  ref: string;
  statut: string;
  typeDemenagement: string | null;
  periode: string | null;
  moisCa: string | null;
  chargement: string | null;
  livraison: string | null;
  volume: number;
  creeLe: string;
  majLe: string;
  archiveLe: string | null;
  commercial: { id: number; nom: string; initiales: string } | null;
  depart: string | null;
  arrivee: string | null;
  requestId: string | null;
  /** Les chiffres de la facturation (crm.dossiers_soldes). */
  engage: number;
  du: number;
  facture: number;
  encaisse: number;
  reste: number;
  /** Le client n'est que le payeur de ce dossier (un compte qui règle le déménagement d'un salarié). */
  payeurSeulement: boolean;
  beneficiaire: string | null;
}

export interface EspaceClient {
  id: string;
  dossierId: number;
  ref: string;
  reference: string;
  statut: string;
  creeLe: string;
  email: string | null;
  derniereConnexion: string | null;
  connexions: number;
  messages: number;
  nonLus: number;
  dernierMessage: string | null;
}

export interface FicheClient {
  client: Row;
  contacts: Row[];
  dossiers: DossierClient[];
  devis: Row[];
  factures: Row[];
  reglements: { total: number; nombre: number; dernier: string | null };
  espaces: EspaceClient[];
  rdvs: Row[];
  demandes: Row[];
  doublons: {
    id: number;
    nom: string;
    type: string;
    email: string | null;
    telephone: string | null;
    par: ("email" | "telephone")[];
    nbDossiers: number;
    dernierRef: string | null;
  }[];
}

/** Tout ce que la fiche d'un client montre, en quelques requêtes parallèles. */
export async function ficheClient(id: number): Promise<FicheClient | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const client = await q1("select * from clients where id = $1", [id]);
  if (!client) return null;

  const dossiersRows = await q(
    `select d.id, d.ref, d.statut, d.type_demenagement, d.periode, d.mois_ca, d.date_chargement, d.date_livraison, d.volume::float8 as volume,
        d.cree_le, d.maj_le, d.archive_le, d.request_id::text as request_id, d.client_id,
        cm.id as commercial_id, cm.nom as commercial, cm.initiales,
        (select adresse from etapes_trajet where dossier_id = d.id and genre = 'depart' order by ordre, id limit 1) as depart,
        (select adresse from etapes_trajet where dossier_id = d.id and genre = 'arrivee' order by ordre desc, id desc limit 1) as arrivee,
        coalesce(s.engage, 0)::float8 as engage, coalesce(s.du, 0)::float8 as du,
        (coalesce(s.facture_demenagement, 0) + coalesce(s.facture_garde_meuble, 0))::float8 as facture,
        coalesce(s.encaisse, 0)::float8 as encaisse, coalesce(s.reste, 0)::float8 as reste,
        case when d.client_id <> $1 then coalesce(b.societe, concat_ws(' ', b.prenom, b.nom)) end as beneficiaire
       from dossiers d
       left join utilisateurs cm on cm.id = d.commercial_id
       left join dossiers_soldes s on s.dossier_id = d.id
       left join clients b on b.id = d.client_id
      where d.client_id = $1 or d.payeur_client_id = $1
      order by d.cree_le desc, d.id desc`,
    [id],
  );
  const dossiers: DossierClient[] = dossiersRows.map((r) => ({
    id: r.id,
    ref: r.ref,
    statut: r.statut,
    typeDemenagement: r.type_demenagement,
    periode: r.periode,
    moisCa: iso(r.mois_ca),
    chargement: iso(r.date_chargement),
    livraison: iso(r.date_livraison),
    volume: Number(r.volume) || 0,
    creeLe: iso(r.cree_le)!,
    majLe: iso(r.maj_le)!,
    archiveLe: iso(r.archive_le),
    commercial: r.commercial_id ? { id: r.commercial_id, nom: r.commercial, initiales: r.initiales } : null,
    depart: r.depart,
    arrivee: r.arrivee,
    requestId: r.request_id,
    engage: r.engage,
    du: r.du,
    facture: r.facture,
    encaisse: r.encaisse,
    reste: r.reste,
    payeurSeulement: r.client_id !== id,
    beneficiaire: r.beneficiaire ?? null,
  }));
  const ids = dossiers.map((d) => d.id);
  const requestIds = dossiers.map((d) => d.requestId).filter((x): x is string => !!x);
  const email =
    String(client.email ?? "")
      .trim()
      .toLowerCase() || null;
  const tel = chiffresTelephone(client.telephone).slice(-9);

  const [contacts, devis, factures, reglements, espaces, rdvs, demandes, doublons] = await Promise.all([
    q("select * from contacts where client_id = $1 order by id", [id]),
    q(
      `select v.id, v.numero, v.formule, v.montant::float8 as montant, v.statut, v.envoye_le, v.signe_le, v.cree_le, v.dossier_id, d.ref
         from devis v join dossiers d on d.id = v.dossier_id where v.dossier_id = any($1::int[])
        order by coalesce(v.signe_le, v.envoye_le, v.cree_le) desc, v.id desc`,
      [ids],
    ),
    q(
      `select f.id, f.numero, f.genre, f.objet, f.emise_le, f.echeance_le, f.dossier_id, d.ref,
          s.ttc::float8 as ttc, s.reste::float8 as reste, s.etat, s.en_retard
         from factures f join factures_soldes s on s.id = f.id left join dossiers d on d.id = f.dossier_id
        where f.dossier_id = any($1::int[]) or f.payeur_client_id = $2 or f.origine_client_id = $2
        order by f.emise_le desc, f.id desc`,
      [ids, id],
    ),
    q1<{ total: number; nombre: number; dernier: Date | null }>(
      "select coalesce(sum(montant), 0)::float8 as total, count(*)::int as nombre, max(recu_le) as dernier from paiements where dossier_id = any($1::int[])",
      [ids],
    ),
    q(
      `select x.id::text as id, x.crm_dossier_id, d.ref, x.reference, x.statut, x.created_at, ec.email,
          (select max(se.ouverte_le) from public.ec_sessions se where se.client_id = x.client_id) as connexion,
          (select count(*)::int from public.ec_sessions se where se.client_id = x.client_id) as connexions,
          (select count(*)::int from public.ec_messages m where m.dossier_id = x.id) as messages,
          (select count(*)::int from public.ec_messages m where m.dossier_id = x.id and m.auteur = 'client' and m.lu_par_equipe_le is null) as non_lus,
          (select max(m.created_at) from public.ec_messages m where m.dossier_id = x.id) as dernier_message
         from public.ec_dossiers x join dossiers d on d.id = x.crm_dossier_id left join public.ec_clients ec on ec.id = x.client_id
        where x.crm_dossier_id = any($1::int[])
        order by x.created_at desc`,
      [ids],
    ).catch((e) => {
      console.error("Clients : lecture des espaces client impossible", e instanceof Error ? e.message : e);
      return [] as Row[];
    }),
    q(
      `select r.id, r.type, r.titre, r.lieu, r.debut, r.duree_min, r.termine, r.devis_etabli, r.journee, r.sans_suite, r.dossier_id, d.ref, u.nom as commercial, u.initiales
         from rendez_vous r join dossiers d on d.id = r.dossier_id left join utilisateurs u on u.id = r.commercial_id
        where r.dossier_id = any($1::int[]) order by r.debut desc`,
      [ids],
    ),
    q(
      `select r.id::text as id, r.status, r.source, r.created_at, r.depart_ville, r.arrivee_ville, r.volume_m3::float8 as volume, r.date_souhaitee,
          r.estimation_prix::float8 as estimation, r.client_nom, r.client_email,
          (select x.id from dossiers x where x.request_id = r.id order by x.id limit 1) as dossier_id,
          (select x.ref from dossiers x where x.request_id = r.id order by x.id limit 1) as dossier_ref
         from public.requests r
        where ($1::text is not null and lower(trim(r.client_email)) = $1) or r.id = any($2::uuid[])
        order by r.created_at desc`,
      [email, requestIds],
    ).catch((e) => {
      console.error("Clients : lecture des demandes du site impossible", e instanceof Error ? e.message : e);
      return [] as Row[];
    }),
    // Les doublons possibles : un autre client au même e-mail, ou aux neuf mêmes derniers chiffres de téléphone.
    email || tel.length === 9
      ? q(
          `select c.id, c.type, c.prenom, c.nom, c.societe, c.email, c.telephone,
              ($2::text is not null and lower(trim(c.email)) = $2) as meme_email,
              ($3::text is not null and right(regexp_replace(coalesce(c.telephone, ''), '[^0-9]', '', 'g'), 9) = $3) as meme_tel,
              (select count(*)::int from dossiers d where d.client_id = c.id) as nb,
              (select d.ref from dossiers d where d.client_id = c.id order by d.cree_le desc, d.id desc limit 1) as dernier_ref
             from clients c
            where c.id <> $1
              and (($2::text is not null and lower(trim(c.email)) = $2)
                or ($3::text is not null and right(regexp_replace(coalesce(c.telephone, ''), '[^0-9]', '', 'g'), 9) = $3))
            order by c.id`,
          [id, email, tel.length === 9 ? tel : null],
        )
      : Promise.resolve([] as Row[]),
  ]);

  return {
    client,
    contacts,
    dossiers,
    devis,
    factures,
    reglements: { total: reglements?.total ?? 0, nombre: reglements?.nombre ?? 0, dernier: iso(reglements?.dernier) },
    espaces: espaces.map((e) => ({
      id: e.id,
      dossierId: e.crm_dossier_id,
      ref: e.ref,
      reference: e.reference,
      statut: e.statut,
      creeLe: iso(e.created_at)!,
      email: e.email ?? null,
      derniereConnexion: iso(e.connexion),
      connexions: e.connexions,
      messages: e.messages,
      nonLus: e.non_lus,
      dernierMessage: iso(e.dernier_message),
    })),
    rdvs,
    demandes,
    doublons: doublons.map((d) => ({
      id: d.id,
      nom: d.societe || [d.prenom, d.nom].filter(Boolean).join(" ") || "Sans nom",
      type: d.type,
      email: d.email,
      telephone: d.telephone,
      par: [d.meme_email && "email", d.meme_tel && "telephone"].filter(Boolean) as ("email" | "telephone")[],
      nbDossiers: d.nb,
      dernierRef: d.dernier_ref,
    })),
  };
}

/** Le client du CRM d'une adresse e-mail (le plus récemment actif), pour l'historique d'une demande du site. */
export async function clientParEmail(email: string): Promise<{ id: number; n: number } | null> {
  const e = email.trim().toLowerCase();
  if (!e) return null;
  const r = await q1<{ id: number; n: number }>(
    `select c.id, count(*) over ()::int as n from clients c where lower(trim(c.email)) = $1
      order by (select max(d.maj_le) from dossiers d where d.client_id = c.id) desc nulls last, c.id desc limit 1`,
    [e],
  );
  return r ?? null;
}
