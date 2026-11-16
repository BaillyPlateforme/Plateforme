import "server-only";
import { q, q1, transaction, type Db } from "@/crm/lib/db";
import { nomClient } from "@/crm/lib/format";
import { PRESTATIONS } from "@/crm/lib/tarif";
import { destinationsDuTrajet, resoudreDestination, type Destination } from "@/lib/visite/destinations";
import { instantParis, jourParis, lendemain, type CleFormule, type EtapeAcces, type ObjetSaisi, type OptionSaisie, type PieceSaisie } from "@/lib/visite/regles";

/*
 * Les lectures de la visite technique, et l'ouverture d'une visite.
 *
 * Une visite s'ouvre sur un dossier, depuis un rendez-vous du planning ou
 * sans. Une seule visite en cours par dossier : rouvrir la tablette reprend
 * celle-là. À l'ouverture, l'inventaire du dossier est rangé en pièces —
 * chaque objet saisi depuis la fiche rejoint la pièce de son nom, créée au
 * besoin — et chaque objet reçoit sa clé : la tablette reprend l'inventaire
 * existant, elle ne repart pas d'une page blanche.
 */

export type PhotoVisite = { id: number; cle: string; piece: string | null; pieceNom: string | null; vignette: boolean; priseLe: string };

export interface Saisie {
  visite: {
    id: number;
    dossierId: number;
    statut: "en_cours" | "signee";
    remarques: string | null;
    options: OptionSaisie[];
    formule: CleFormule | null;
    commenceeLe: string;
    majLe: string;
    rendezVousId: number | null;
    commercial: string | null;
    signeLe: string | null;
    signataire: string | null;
    empreinte: string | null;
    document: boolean;
  };
  dossier: { id: number; ref: string; client: string; contact: string | null; telephone: string | null; email: string | null; volume: number; type: string };
  rdv: { debut: string; duree_min: number; type: string } | null;
  etapes: EtapeAcces[];
  /** Les destinations du dossier (étapes hors départ), pour répartir l'inventaire. */
  destinations: Destination[];
  pieces: PieceSaisie[];
  objets: ObjetSaisi[];
  photos: PhotoVisite[];
}

/** Les options d'une visite nouvelle : les prestations du devis détaillé, aucune encore proposée. */
export const optionsParDefaut = (): OptionSaisie[] => PRESTATIONS.map((libelle) => ({ libelle, proposee: false }));

/** Range l'inventaire du dossier en pièces, et donne une clé à chaque objet qui n'en a pas. */
export async function preparerPieces(db: Db, dossierId: number) {
  const noms = await db.query<{ piece: string }>(
    "select distinct coalesce(nullif(btrim(piece), ''), 'Divers') as piece from inventaire where dossier_id = $1 and piece_id is null",
    [dossierId],
  );
  for (const { piece } of noms) {
    let [p] = await db.query<{ id: number; nom: string }>(
      "select id, nom from pieces where dossier_id = $1 and lower(nom) = lower($2) order by ordre, id limit 1",
      [dossierId, piece],
    );
    if (!p) {
      [p] = await db.query<{ id: number; nom: string }>(
        "insert into pieces (dossier_id, nom, ordre) values ($1, $2, coalesce((select max(ordre) + 1 from pieces where dossier_id = $1), 0)) returning id, nom",
        [dossierId, piece],
      );
    }
    await db.query(
      "update inventaire set piece_id = $3, piece = $4 where dossier_id = $1 and piece_id is null and coalesce(nullif(btrim(piece), ''), 'Divers') = $2",
      [dossierId, piece, p.id, p.nom],
    );
  }
  await db.query("update inventaire set cle = gen_random_uuid() where dossier_id = $1 and cle is null", [dossierId]);
}

/**
 * Ouvre la visite d'un dossier (ou reprend celle qui est en cours). Rend son
 * identifiant, et si elle vient d'être créée.
 */
export async function ouvrirVisite(dossierId: number, rendezVousId: number | null, utilisateurId: number): Promise<{ id: number; nouvelle: boolean }> {
  return transaction(async (db) => {
    const [d] = await db.query<{ id: number }>("select id from dossiers where id = $1 for update", [dossierId]);
    if (!d) throw new Error("Dossier introuvable.");
    const rdv = rendezVousId
      ? (await db.query<{ id: number; commercial_id: number }>("select id, commercial_id from rendez_vous where id = $1 and dossier_id = $2", [rendezVousId, dossierId]))[0]
      : undefined;
    const [ouverte] = await db.query<{ id: number; rendez_vous_id: number | null }>(
      "select id, rendez_vous_id from visites where dossier_id = $1 and statut = 'en_cours'",
      [dossierId],
    );
    if (ouverte) {
      if (rdv && !ouverte.rendez_vous_id) await db.query("update visites set rendez_vous_id = $2 where id = $1", [ouverte.id, rdv.id]);
      await preparerPieces(db, dossierId);
      return { id: ouverte.id, nouvelle: false };
    }
    const [v] = await db.query<{ id: number }>(
      "insert into visites (dossier_id, rendez_vous_id, commercial_id, options) values ($1, $2, $3, $4) returning id",
      [dossierId, rdv?.id ?? null, rdv?.commercial_id ?? utilisateurId, JSON.stringify(optionsParDefaut())],
    );
    await preparerPieces(db, dossierId);
    await db.query("insert into activite (dossier_id, utilisateur_id, libelle) values ($1, $2, $3)", [dossierId, utilisateurId, "Visite technique commencée sur la tablette"]);
    return { id: v.id, nouvelle: true };
  });
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

/** Tout ce que la tablette affiche d'une visite. */
export async function chargerSaisie(visiteId: number): Promise<Saisie | null> {
  if (!Number.isSafeInteger(visiteId) || visiteId <= 0) return null;
  const v = await q1(
    `select v.*, u.nom as commercial, d.ref, d.volume::float8 as volume, c.type, c.civilite, c.prenom, c.nom, c.societe, c.email, c.telephone,
            r.debut as rdv_debut, r.duree_min as rdv_duree, r.type as rdv_type
       from visites v join dossiers d on d.id = v.dossier_id join clients c on c.id = d.client_id
       left join utilisateurs u on u.id = v.commercial_id left join rendez_vous r on r.id = v.rendez_vous_id
      where v.id = $1`,
    [visiteId],
  );
  if (!v) return null;
  const [lignesEtapes, pieces, lignesObjets, photos] = await Promise.all([
    q<EtapeAcces & { ville: string | null; code_postal: string | null }>(
      `select id, genre, adresse, etage, ascenseur, escalier, portage_m, stationnement, poids_lourd, monte_meuble, monte_charge, transbordement, acces,
              ascenseur_taille, escalier_precision, stationnement_precision, ville, code_postal
         from etapes_trajet where dossier_id = $1 order by ordre, id`,
      [v.dossier_id],
    ),
    q<PieceSaisie>("select cle::text as cle, nom, ordre, remarque, etape_id as destination from pieces where dossier_id = $1 order by ordre, id", [v.dossier_id]),
    q<ObjetSaisi & { etape_id: number | null; texte_destination: string | null }>(
      `select i.cle::text as cle, p.cle::text as piece, i.libelle, i.quantite, i.volume::float8 as volume, i.demontage, i.fragile, i.note,
              i.etape_id, i.destination as texte_destination
         from inventaire i join pieces p on p.id = i.piece_id where i.dossier_id = $1 and i.cle is not null order by i.ordre, i.id`,
      [v.dossier_id],
    ),
    q<PhotoVisite>(
      `select id, cle::text as cle, piece_cle::text as piece, piece_nom as "pieceNom", chemin_vignette is not null as vignette,
              to_char(prise_le at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "priseLe"
         from visite_photos where visite_id = $1 order by prise_le, id`,
      [visiteId],
    ),
  ]);
  const contact = [v.civilite, v.prenom, v.nom].filter(Boolean).join(" ");
  const destinations = destinationsDuTrajet(lignesEtapes);
  const etapes: EtapeAcces[] = lignesEtapes.map((e) => {
    const { ville: _ville, code_postal: _cp, ...acces } = e;
    void _ville;
    void _cp;
    return acces;
  });
  // Un objet rangé avant la tablette (sans étape) : sa destination se lit sur son libellé (« Arrivée » → la première arrivée).
  const connues = new Set(destinations.map((d) => d.id));
  const objets: ObjetSaisi[] = lignesObjets.map(({ etape_id, texte_destination, ...o }) => {
    const destination = etape_id != null && connues.has(etape_id) ? etape_id : resoudreDestination(texte_destination, destinations);
    return { ...o, destination, destinationLibre: destination == null ? texte_destination?.trim() || null : null };
  });
  return {
    visite: {
      id: v.id, dossierId: v.dossier_id, statut: v.statut, remarques: v.remarques, options: v.options ?? [], formule: v.formule,
      commenceeLe: iso(v.commencee_le)!, majLe: iso(v.maj_le)!, rendezVousId: v.rendez_vous_id, commercial: v.commercial,
      signeLe: iso(v.signe_le), signataire: v.signataire, empreinte: v.empreinte, document: !!v.document_chemin,
    },
    dossier: {
      id: v.dossier_id, ref: v.ref, client: nomClient(v), contact: contact && contact !== nomClient(v) ? contact : null,
      telephone: v.telephone, email: v.email, volume: v.volume, type: v.type,
    },
    rdv: v.rdv_debut ? { debut: iso(v.rdv_debut)!, duree_min: v.rdv_duree, type: v.rdv_type } : null,
    etapes,
    destinations,
    pieces,
    objets,
    photos,
  };
}

/**
 * Le vocabulaire de l'équipe, pour la saisie automatique des objets : les
 * libellés déjà saisis dans au moins deux dossiers, avec leur volume le plus
 * courant. Une faute de frappe isolée n'y entre donc pas.
 */
export async function objetsDejaSaisis(limite = 300): Promise<{ label: string; volume: number }[]> {
  return q<{ label: string; volume: number }>(
    `select label, volume from (
       select min(btrim(libelle)) as label, mode() within group (order by volume)::float8 as volume, count(distinct dossier_id) as dossiers
         from inventaire where btrim(libelle) <> '' and volume > 0 and volume <= 99
        group by lower(btrim(libelle))
     ) x where dossiers >= 2 order by dossiers desc, label limit $1`,
    [limite],
  );
}

// --- La tablette : les visites du jour ---------------------------------------------------------------

export interface VisiteDuJour {
  rdvId: number | null;
  dossierId: number;
  ref: string;
  client: string;
  adresse: string | null;
  debut: string | null;
  duree: number | null;
  type: string;
  commercial: string | null;
  commercialId: number | null;
  volume: number;
  visiteId: number | null;
  statut: "a_faire" | "en_cours" | "signee";
}

/**
 * Les visites d'aujourd'hui (et de demain, pour préparer) : les rendez-vous
 * de visite du planning, et les visites en cours sans rendez-vous. Un
 * commercial voit les siennes ; la direction et l'exploitation, toutes.
 */
export async function visitesDuJour(commercialId: number | null, maintenant = new Date()) {
  const auj = jourParis(maintenant);
  const de = instantParis(auj, "00:00").toISOString();
  const a = instantParis(lendemain(auj, 2), "00:00").toISOString();
  const lignes = await q(
    `select r.id as rdv_id, d.id as dossier_id, d.ref, c.nom, c.prenom, c.societe, r.debut, r.duree_min, r.type, u.nom as commercial, r.commercial_id,
            d.volume::float8 as volume,
            (select e.adresse from etapes_trajet e where e.dossier_id = d.id and e.genre = 'depart' order by e.ordre, e.id limit 1) as adresse,
            v.id as visite_id, v.statut as visite_statut
       from rendez_vous r join dossiers d on d.id = r.dossier_id join clients c on c.id = d.client_id join utilisateurs u on u.id = r.commercial_id
       left join lateral (select x.id, x.statut from visites x where x.rendez_vous_id = r.id or (x.dossier_id = d.id and x.statut = 'en_cours')
                           order by (x.statut = 'en_cours') desc, x.commencee_le desc limit 1) v on true
      where r.type in ('phys', 'visio') and r.debut >= $1 and r.debut < $2 and ($3::int is null or r.commercial_id = $3)
     union all
     select null, d.id, d.ref, c.nom, c.prenom, c.societe, null, null, 'phys', u.nom, v.commercial_id, d.volume::float8,
            (select e.adresse from etapes_trajet e where e.dossier_id = d.id and e.genre = 'depart' order by e.ordre, e.id limit 1),
            v.id, v.statut
       from visites v join dossiers d on d.id = v.dossier_id join clients c on c.id = d.client_id left join utilisateurs u on u.id = v.commercial_id
      where v.statut = 'en_cours' and v.rendez_vous_id is null and ($3::int is null or v.commercial_id = $3)
      order by 7 nulls first`,
    [de, a, commercialId],
  );
  const vues = new Set<number>();
  const uniques = lignes.filter((l) => {
    if (!l.visite_id) return true;
    if (vues.has(l.visite_id)) return false;
    vues.add(l.visite_id);
    return true;
  });
  const liste: VisiteDuJour[] = uniques.map((l) => ({
    rdvId: l.rdv_id, dossierId: l.dossier_id, ref: l.ref, client: nomClient(l), adresse: l.adresse, debut: iso(l.debut), duree: l.duree_min,
    type: l.type, commercial: l.commercial, commercialId: l.commercial_id, volume: l.volume, visiteId: l.visite_id,
    statut: l.visite_statut === "signee" ? "signee" : l.visite_statut === "en_cours" ? "en_cours" : "a_faire",
  }));
  const demain = lendemain(auj);
  return {
    aujourdhui: liste.filter((x) => !x.debut || jourParis(x.debut) === auj),
    demain: liste.filter((x) => x.debut && jourParis(x.debut) === demain),
    jour: auj,
    jourDemain: demain,
  };
}

// --- La fiche du dossier --------------------------------------------------------------------------------

export interface EtatVisites {
  proposition: {
    id: number; commercial: string; commercialId: number; type: string; duree: number; proposeLe: string;
    autresDemandesLe: string | null; message: string | null;
    creneaux: { id: number; debut: string; statut: string }[];
  } | null;
  rdvs: { id: number; debut: string; duree: number; type: string; commercial: string; termine: boolean; visiteId: number | null; visiteStatut: string | null }[];
  visites: { id: number; statut: string; commenceeLe: string; signeLe: string | null; signataire: string | null; empreinte: string | null; volume: number | null; document: boolean; commercial: string | null; rdvId: number | null }[];
  client: { email: string | null; telephone: string | null; notes: string | null };
}

export async function etatVisites(dossierId: number): Promise<EtatVisites> {
  const [prop, rdvs, visites, client] = await Promise.all([
    q1(
      `select p.id, p.type, p.duree_min, p.propose_le, p.autres_demandes_le, p.message_client, p.commercial_id, u.nom as commercial
         from propositions_visite p join utilisateurs u on u.id = p.commercial_id where p.dossier_id = $1 and p.statut = 'ouverte'`,
      [dossierId],
    ),
    q(
      `select r.id, r.debut, r.duree_min, r.type, r.termine, u.nom as commercial,
              (select x.id from visites x where x.rendez_vous_id = r.id order by (x.statut = 'signee') desc, x.commencee_le desc limit 1) as visite_id,
              (select x.statut from visites x where x.rendez_vous_id = r.id order by (x.statut = 'signee') desc, x.commencee_le desc limit 1) as visite_statut
         from rendez_vous r join utilisateurs u on u.id = r.commercial_id
        where r.dossier_id = $1 and r.type in ('phys', 'visio') order by r.debut desc`,
      [dossierId],
    ),
    q(
      `select v.id, v.statut, v.commencee_le, v.signe_le, v.signataire, v.empreinte, (v.contenu ->> 'volume')::float8 as volume,
              v.document_chemin is not null as document, u.nom as commercial, v.rendez_vous_id
         from visites v left join utilisateurs u on u.id = v.commercial_id where v.dossier_id = $1 order by v.commencee_le desc`,
      [dossierId],
    ),
    q1<{ email: string | null; telephone: string | null; notes: string | null }>(
      "select c.email, c.telephone, c.notes from dossiers d join clients c on c.id = d.client_id where d.id = $1",
      [dossierId],
    ),
  ]);
  const creneaux = prop
    ? await q<{ id: number; debut: Date; statut: string }>("select id, debut, statut from creneaux_visite where proposition_id = $1 order by debut", [prop.id])
    : [];
  return {
    proposition: prop
      ? {
          id: prop.id, commercial: prop.commercial, commercialId: prop.commercial_id, type: prop.type, duree: prop.duree_min, proposeLe: iso(prop.propose_le)!,
          autresDemandesLe: iso(prop.autres_demandes_le), message: prop.message_client,
          creneaux: creneaux.map((c) => ({ id: c.id, debut: iso(c.debut)!, statut: c.statut })),
        }
      : null,
    rdvs: rdvs.map((r) => ({
      id: r.id, debut: iso(r.debut)!, duree: r.duree_min, type: r.type, commercial: r.commercial, termine: r.termine, visiteId: r.visite_id, visiteStatut: r.visite_statut,
    })),
    visites: visites.map((v) => ({
      id: v.id, statut: v.statut, commenceeLe: iso(v.commencee_le)!, signeLe: iso(v.signe_le), signataire: v.signataire, empreinte: v.empreinte,
      volume: v.volume, document: v.document, commercial: v.commercial, rdvId: v.rendez_vous_id,
    })),
    client: client ?? { email: null, telephone: null, notes: null },
  };
}

// --- La page Visites ---------------------------------------------------------------------------------------

export async function tableauVisites(maintenant = new Date()) {
  const auj = jourParis(maintenant);
  const debutJour = instantParis(auj, "00:00").toISOString();
  const [propositions, aVenir, comptesRendus, enCours, passees, prevus] = await Promise.all([
    q(
      `select p.id, p.dossier_id, d.ref, c.nom, c.prenom, c.societe, u.nom as commercial, p.type, p.duree_min, p.propose_le, p.autres_demandes_le, p.message_client,
              (select json_agg(json_build_object('debut', x.debut, 'statut', x.statut) order by x.debut) from creneaux_visite x where x.proposition_id = p.id) as creneaux
         from propositions_visite p join dossiers d on d.id = p.dossier_id join clients c on c.id = d.client_id join utilisateurs u on u.id = p.commercial_id
        where p.statut = 'ouverte' order by p.autres_demandes_le desc nulls last, p.propose_le desc`,
    ),
    q(
      `select r.id, r.dossier_id, d.ref, c.nom, c.prenom, c.societe, c.email, c.telephone, c.notes, u.nom as commercial, r.debut, r.duree_min, r.type, r.termine,
              r.devis_etabli, r.sans_suite, d.statut as dossier_statut,
              exists (select 1 from visites x where x.rendez_vous_id = r.id and x.statut = 'signee') as compte_rendu_signe,
              (select e.adresse from etapes_trajet e where e.dossier_id = d.id and e.genre = 'depart' order by e.ordre, e.id limit 1) as adresse,
              (select x.id from visites x where x.rendez_vous_id = r.id order by (x.statut = 'signee') desc, x.commencee_le desc limit 1) as visite_id,
              (select x.statut from visites x where x.rendez_vous_id = r.id order by (x.statut = 'signee') desc, x.commencee_le desc limit 1) as visite_statut
         from rendez_vous r join dossiers d on d.id = r.dossier_id join clients c on c.id = d.client_id join utilisateurs u on u.id = r.commercial_id
        where r.type in ('phys', 'visio') and not r.journee and r.debut >= $1 and r.debut < $1::timestamptz + interval '15 days'
        order by r.debut`,
      [debutJour],
    ),
    q(
      `select v.id, v.dossier_id, d.ref, c.nom, c.prenom, c.societe, u.nom as commercial, v.signe_le, v.signataire, v.empreinte,
              (v.contenu ->> 'volume')::float8 as volume, jsonb_array_length(coalesce(v.contenu -> 'pieces', '[]'::jsonb)) as pieces,
              (v.contenu ->> 'nb_photos')::int as photos, v.document_chemin is not null as document
         from visites v join dossiers d on d.id = v.dossier_id join clients c on c.id = d.client_id left join utilisateurs u on u.id = v.commercial_id
        where v.statut = 'signee' order by v.signe_le desc limit 12`,
    ),
    q(
      `select v.id, v.dossier_id, d.ref, c.nom, c.prenom, c.societe, u.nom as commercial, v.commencee_le, v.maj_le
         from visites v join dossiers d on d.id = v.dossier_id join clients c on c.id = d.client_id left join utilisateurs u on u.id = v.commercial_id
        where v.statut = 'en_cours' order by v.maj_le desc`,
    ),
    // Les visites des trente derniers jours, pour suivre leur cycle (effectuée, devis établi, sans suite).
    q(
      `select r.id, r.dossier_id, d.ref, c.nom, c.prenom, c.societe, u.nom as commercial, r.debut, r.duree_min, r.type, r.termine,
              r.devis_etabli, r.sans_suite, d.statut as dossier_statut,
              exists (select 1 from visites x where x.rendez_vous_id = r.id and x.statut = 'signee') as compte_rendu_signe
         from rendez_vous r join dossiers d on d.id = r.dossier_id join clients c on c.id = d.client_id join utilisateurs u on u.id = r.commercial_id
        where r.type in ('phys', 'visio') and not r.journee and r.debut < $1 and r.debut >= $1::timestamptz - interval '30 days'
        order by r.debut desc limit 40`,
      [debutJour],
    ),
    // Les dossiers qui ont déjà une visite à venir : ils ne sont plus « à planifier ».
    q<{ id: number }>(
      `select distinct dossier_id as id from rendez_vous where type in ('phys', 'visio') and not journee and dossier_id is not null and debut >= now()
       union select dossier_id from propositions_visite where statut = 'ouverte'`,
    ),
  ]);
  return { propositions, aVenir, comptesRendus, enCours, passees, dejaPrevus: new Set(prevus.map((x) => x.id)), jour: auj };
}

// --- Le planning commercial -----------------------------------------------------------------------------

/** Les créneaux proposés et encore ouverts de la semaine : ils tiennent la place au planning. */
export const creneauxProposesSemaine = (lundi: Date, commercialId?: number | null) => {
  const fin = new Date(lundi);
  fin.setDate(fin.getDate() + 7);
  return q<{ id: number; debut: Date; duree_min: number; type: string; dossier_id: number; ref: string; nom: string; prenom: string | null; societe: string | null; commercial_id: number; initiales: string }>(
    `select c.id, c.debut, p.duree_min, p.type, p.dossier_id, d.ref, cl.nom, cl.prenom, cl.societe, p.commercial_id, u.initiales
       from creneaux_visite c join propositions_visite p on p.id = c.proposition_id join dossiers d on d.id = p.dossier_id
       join clients cl on cl.id = d.client_id join utilisateurs u on u.id = p.commercial_id
      where p.statut = 'ouverte' and c.statut = 'propose' and c.debut >= $1 and c.debut < $2 and ($3::int is null or p.commercial_id = $3)
      order by c.debut`,
    [lundi.toISOString(), fin.toISOString(), commercialId ?? null],
  );
};

/** Les coordonnées des clients des rendez-vous, pour dire si le rappel de la veille est prévu. */
export const contactsDesDossiers = (ids: number[]) =>
  ids.length
    ? q<{ id: number; email: string | null; telephone: string | null; notes: string | null }>(
        "select d.id, c.email, c.telephone, c.notes from dossiers d join clients c on c.id = d.client_id where d.id = any($1::int[])",
        [ids],
      )
    : Promise.resolve([]);
