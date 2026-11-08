import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { envoyerLienAuClient } from "./acces";
import { AdresseDejaPrise, verifierAdresseLibre } from "./comptes";
import { estDemo } from "./config";
import { avecDelai, depot } from "./depot";
import { PAYS, periode, salutation } from "./format";
import { conseillerDe, dossiersDuClient, signatureDe, snapshotDe } from "./lectures";
import { notifier } from "./notifier";
import { photoPourVille } from "./photos";
import { avancement, calculerFrise, prochaineEtape, suiviEquipe, type Etape } from "./progression";
import { segmentDuCrm } from "./segments";
import type { Client, Dossier, Notification, StatutDossier, TypeClient } from "./types";

/*
 * Le lien entre l'espace client et le CRM — le seul module des deux apps qui
 * parle au CRM pour l'espace client. L'app externe ne peut pas importer le
 * code du CRM (@/crm) : tout passe par ici.
 *
 * Il ne lit ni n'écrit lui-même le schéma crm : il appelle les fonctions de
 * la migration 0012, réservées à la clé de service, qui le font dans une
 * transaction et projettent aussitôt le dossier vers les tables ec_*. Le
 * client, lui, ne lit jamais que les tables ec_*, par sa session et la RLS.
 *
 * En démonstration (ESPACE_CLIENT_DONNEES=demo), les données de l'espace sont
 * en mémoire : il n'y a pas de CRM à relier, et ces fonctions ne font rien
 * (ou le disent).
 */

const DELAI = 10_000;

async function rpc<T>(fonction: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await avecDelai(createServiceClient().rpc(fonction, params), DELAI, "La base ne répond pas.");
  if (error) throw new Error(error.message);
  return data as T;
}

/** Le dossier de l'espace est-il la face client d'un dossier du CRM ? */
export const estRelie = (d: Pick<Dossier, "crm_dossier_id">) => typeof d.crm_dossier_id === "number";

// --- Du CRM vers l'espace ------------------------------------------------------------------------

/** Recopie dans l'espace la part du dossier du CRM que le client voit. Sans effet sans espace lié. */
export async function projeterDossierCrm(crmDossierId: number): Promise<void> {
  if (estDemo()) return;
  await rpc("ec_projeter_dossier_crm", { p_crm: crmDossierId });
}

// --- De l'espace vers le CRM ---------------------------------------------------------------------

export type IssueSignature = "signe" | "deja_signe" | "autre_signe" | "ferme" | "inconnu";

/**
 * Le client accepte un devis du CRM depuis son espace : la règle de signature
 * du CRM s'applique (un seul devis signé par dossier) et le dossier est
 * projeté. Avec une trace, la fonction du CRM horodate aussi l'acceptation
 * dans l'espace (version : le numéro du devis) ; sans trace, l'appelant
 * l'inscrit lui-même — la page « Mes devis » y met la version des CGV cochées.
 */
export async function signerDevisCrm(crmDevisId: number, trace?: { ip: string; user_agent: string } | null): Promise<IssueSignature> {
  return rpc<IssueSignature>("ec_signer_devis_crm", { p_devis: crmDevisId, p_origine: "espace", p_ip: trace?.ip ?? null, p_user_agent: trace?.user_agent ?? null });
}

/** Les arrhes réglées en ligne : devis signé s'il ne l'était pas, paiement inscrit au CRM une seule fois. */
export async function arrhesCrm(p: { crmDevisId: number; sessionId: string; montant: number; pourcentage: number; reference: string }): Promise<IssueSignature> {
  return rpc<IssueSignature>("ec_arrhes_crm", {
    p_devis: p.crmDevisId, p_session: p.sessionId, p_montant: p.montant, p_pourcentage: p.pourcentage, p_reference: p.reference,
  });
}

/** Une facture du CRM réglée : en ligne (référence du prestataire) ou hors ligne (« HORS-LIGNE »). */
export async function facturePayeeCrm(crmFactureId: number, reference: string): Promise<"payee" | "deja_payee" | "inconnu"> {
  return rpc("ec_facture_payee_crm", { p_facture: crmFactureId, p_reference: reference });
}

/** Les coordonnées du client, modifiées depuis la fiche de l'espace : écrites dans le CRM, puis projetées. */
export async function majClientCrm(
  crmDossierId: number,
  c: Pick<Client, "type" | "civilite" | "prenom" | "nom" | "societe" | "email" | "telephone">,
): Promise<void> {
  await rpc("ec_maj_client_crm", {
    p_crm: crmDossierId, p_segment: c.type, p_civilite: c.civilite ?? "", p_prenom: c.prenom, p_nom: c.nom, p_societe: c.societe ?? "",
    p_email: c.email, p_telephone: c.telephone,
  });
}

/**
 * Une ligne au fil d'activité du dossier dans le CRM. Jamais bloquante : si
 * le CRM ne répond pas, l'action de l'espace a eu lieu quand même.
 */
export async function noterDansLeCrm(crmDossierId: number | null | undefined, libelle: string): Promise<void> {
  if (estDemo() || typeof crmDossierId !== "number") return;
  try {
    await rpc("ec_noter_crm", { p_crm: crmDossierId, p_libelle: libelle });
  } catch (e) {
    console.error("Espace client : note au CRM impossible", e instanceof Error ? e.message : e);
  }
}

// --- Ouvrir l'espace d'un dossier du CRM ---------------------------------------------------------

/** Ce que l'écran du CRM sait du dossier, pour dire ce qui manque avant d'ouvrir l'espace. */
export interface DossierCrmPourEspace {
  email: string | null;
  depart: string | null;
  arrivee: string | null;
  date_chargement: unknown;
  mois_ca: unknown;
  volume: number;
  commercial_id: number | null;
  type: string;
  type_demenagement: string | null;
}

export interface Prealable {
  cle: "email" | "trajet" | "periode" | "volume" | "commercial";
  libelle: string;
  ok: boolean;
  /** Ce qu'il faut faire, quand ce n'est pas fait. */
  aide: string;
  /** Se complète dans le formulaire d'ouverture ; sinon, dans la fiche du dossier. */
  enLigne: boolean;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Ce qu'il faut pour ouvrir un espace : une adresse e-mail (l'identifiant de
 * connexion), un trajet, une période (le mois prévu ou la date de
 * chargement), un volume, et le commercial — présenté au client comme son
 * conseiller. La fonction SQL d'ouverture revérifie chacun d'eux.
 */
export function prealablesEspace(d: DossierCrmPourEspace): Prealable[] {
  return [
    { cle: "email", libelle: "Adresse e-mail du client", ok: EMAIL.test((d.email ?? "").trim()), aide: "C'est son identifiant : le lien d'accès part à cette adresse.", enLigne: true },
    { cle: "trajet", libelle: "Adresses de départ et d'arrivée", ok: !!d.depart?.trim() && !!d.arrivee?.trim(), aide: "Renseignez-les dans « Itinéraire & période », plus haut.", enLigne: false },
    { cle: "periode", libelle: "Période du déménagement", ok: !!d.date_chargement || !!d.mois_ca, aide: "Le mois prévu, ou la date de chargement une fois planifiée.", enLigne: true },
    { cle: "volume", libelle: "Volume", ok: d.volume > 0, aide: "Renseignez l'inventaire, ou le volume estimé du dossier.", enLigne: false },
    { cle: "commercial", libelle: "Commercial du dossier", ok: !!d.commercial_id, aide: "Il est présenté au client comme son conseiller.", enLigne: true },
  ];
}

/** Un déménagement hors de France : son espace demande le pays de destination (les pièces de la douane en dépendent). */
export const estInternationalCrm = (typeDemenagement: string | null | undefined) => ["international", "maritime", "aerien"].includes(typeDemenagement ?? "");

/**
 * Ce qui manque encore pour qu'un dossier rejoigne de lui-même l'espace que
 * son client a déjà : les préalables de l'ouverture, et pour un déménagement
 * international le pays de destination, qui doit se lire dans l'adresse
 * d'arrivée (le formulaire de la fiche, lui, le demande). `pays` : celui
 * qu'on y lit.
 */
export function manqueAvantEspace(d: DossierCrmPourEspace): { manque: string[]; pays: string | null } {
  const manque = prealablesEspace(d)
    .filter((p) => !p.ok)
    .map((p) => p.libelle);
  const pays = estInternationalCrm(d.type_demenagement) ? paysDeLAdresse(d.arrivee) : null;
  if (estInternationalCrm(d.type_demenagement) && !pays) manque.push("Pays de destination");
  return { manque, pays };
}

/** Le pays d'une adresse d'arrivée, quand elle le dit : « …, Montréal, Canada » → CA. */
export function paysDeLAdresse(adresse: string | null | undefined): string | null {
  const morceaux = (adresse ?? "").split(",").map((m) => m.trim().toLowerCase());
  const noms = Object.entries(PAYS).map(([code, nom]) => [code, nom.toLowerCase()] as const);
  for (const m of morceaux.reverse()) {
    const trouve = noms.find(([, nom]) => nom === m);
    if (trouve) return trouve[0];
  }
  if (/\(qc\)|québec|quebec|montr[ée]al/i.test(adresse ?? "")) return "CA";
  return null;
}

export type IssueOuverture =
  | {
      ok: true;
      deja: boolean;
      dossierId: string;
      reference: string;
      lien: Pick<Notification, "id" | "statut"> | null;
      avertissement?: string;
      /**
       * Le client avait déjà son espace : le dossier l'a rejoint (`dossiers` :
       * combien il en réunit désormais). Aucun nouveau lien d'accès ; l'avis
       * « nouveau dossier » est journalisé (ou envoyé selon ENVOI_MODE).
       */
      ajoute?: { dossiers: number; avis: Pick<Notification, "id" | "statut"> | null };
    }
  | { ok: false; erreur: string };

/**
 * L'avis au client dont l'espace reçoit un nouveau dossier : « Un nouveau
 * dossier a été ajouté à votre espace ». Pas de lien d'accès — il se
 * connecte comme d'habitude ; le bouton mène au dossier, la connexion s'il
 * n'a plus de session. Une seule fois par dossier de l'espace (clé
 * d'idempotence). Texte de départ dans textes-messages.ts, à valider par
 * Bailly dans « Courriers et SMS ».
 */
async function annoncerNouveauDossier(client: Client, dossier: Dossier, dossiers: number): Promise<Notification> {
  const d = await depot().lireDuClient(client.id);
  return notifier.envoyer(
    {
      dossier_id: dossier.id,
      canal: "email",
      modele: "nouveau_dossier",
      destinataire: client.email,
      payload: {
        salutation: salutation(client),
        email: client.email,
        dossier: dossier.reference,
        trajet: `${dossier.ville_depart} → ${dossier.ville_arrivee}`,
        periode: periode(dossier.periode_debut, dossier.periode_fin),
        dossiers,
        chemin: `/espace-client/${encodeURIComponent(dossier.reference)}`,
        photo: dossier.photo,
        signature: signatureDe(conseillerDe(d, client.conseiller_id)),
      },
    },
    { cle: `ec:nouveau-dossier:${dossier.id}` },
  );
}

/**
 * Ouvre l'espace client d'un dossier du CRM : le client de l'espace (celui de
 * son adresse s'il existe déjà), le dossier lié et la projection du CRM — en
 * une transaction, par la fonction SQL —, puis le compte de connexion et le
 * lien d'accès, journalisé (envoyé seulement avec ENVOI_MODE=actif).
 *
 * Un client, un espace : si son adresse a déjà un espace (un autre dossier y
 * est), le dossier le rejoint — même client, même compte, aucun nouveau lien
 * d'accès ; le client reçoit l'avis « nouveau dossier » à la place.
 *
 * Sans effet si l'espace existe déjà : on rend le sien, sans renvoyer de lien.
 */
export async function ouvrirEspaceDepuisCrm(crmDossierId: number, options: { pays?: string | null } = {}): Promise<IssueOuverture> {
  if (estDemo()) return { ok: false, erreur: "L'espace client de démonstration (en mémoire) n'est pas relié au CRM." };

  // Déjà ouvert : rien à créer, aucun lien à renvoyer.
  const lu = await avecDelai(
    createServiceClient().from("ec_dossiers").select("id, reference").eq("crm_dossier_id", crmDossierId).maybeSingle(),
    DELAI,
  );
  if (lu.data) return { ok: true, deja: true, dossierId: lu.data.id, reference: lu.data.reference, lien: null };

  let ouvert: { dossier_id: string; reference: string; client_id: string; deja: boolean };
  try {
    ouvert = await rpc("ec_ouvrir_espace_crm", { p_crm: crmDossierId, p_pays: options.pays ?? null });
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : "Ouverture impossible." };
  }
  if (ouvert.deja) return { ok: true, deja: true, dossierId: ouvert.dossier_id, reference: ouvert.reference, lien: null };

  const client = await depot().trouver("clients", ouvert.client_id);
  const dossier = await depot().trouver("dossiers", ouvert.dossier_id);
  if (!client || !dossier) return { ok: false, erreur: "L'espace a été créé, mais il ne se relit pas : réessayez." };

  // La photo de la page de garde, d'après la ville d'arrivée que la projection vient de poser.
  const photo = photoPourVille(dossier.ville_arrivee);
  await depot().modifier("dossiers", dossier.id, { photo });

  // Son espace avait déjà un dossier : celui-ci le rejoint. Ni compte à créer, ni lien d'accès : l'avis « nouveau dossier ».
  const { count } = await avecDelai(
    createServiceClient().from("ec_dossiers").select("id", { count: "exact", head: true }).eq("client_id", client.id),
    DELAI,
  );
  const dossiers = count ?? 1;
  if (dossiers > 1) {
    let avis: Notification | null = null;
    try {
      avis = await annoncerNouveauDossier(client, { ...dossier, photo }, dossiers);
    } catch (e) {
      console.error("Espace client : avis « nouveau dossier » impossible", e instanceof Error ? e.message : e);
    }
    const etat = avis ? (avis.statut === "envoyee" ? "envoyé" : avis.statut === "echec" ? "en échec" : "journalisé") : "pas parti";
    await noterDansLeCrm(crmDossierId, `Ajouté à l'espace client de ${client.email} (${dossiers} dossiers) · avis « nouveau dossier » ${etat}, aucun nouveau lien d'accès`);
    return { ok: true, deja: false, dossierId: dossier.id, reference: dossier.reference, lien: null, ajoute: { dossiers, avis: avis ? { id: avis.id, statut: avis.statut } : null } };
  }

  // Le compte de connexion et le lien d'accès. L'espace existe déjà : un échec ici se rattrape par « Renvoyer le lien ».
  try {
    await verifierAdresseLibre(client.email);
    const n = await envoyerLienAuClient(client, { reference: dossier.reference });
    await noterDansLeCrm(crmDossierId, `Espace client ouvert · lien d'accès ${n.statut === "envoyee" ? "envoyé" : "journalisé"} pour ${client.email}`);
    return { ok: true, deja: false, dossierId: dossier.id, reference: dossier.reference, lien: { id: n.id, statut: n.statut } };
  } catch (e) {
    const message = e instanceof AdresseDejaPrise ? e.message : `Le lien d'accès n'est pas parti : ${e instanceof Error ? e.message : "erreur inconnue"}.`;
    await noterDansLeCrm(crmDossierId, "Espace client ouvert · lien d'accès à renvoyer");
    return { ok: true, deja: false, dossierId: dossier.id, reference: dossier.reference, lien: null, avertissement: message };
  }
}

/** Renvoie le lien d'accès du client d'un dossier du CRM (journalisé, ou envoyé avec ESPACE_CLIENT_ENVOI=1). */
export async function renvoyerLienCrm(crmDossierId: number): Promise<{ ok: true; statut: Notification["statut"]; email: string } | { ok: false; erreur: string }> {
  if (estDemo()) return { ok: false, erreur: "L'espace client de démonstration n'est pas relié au CRM." };
  const { data } = await avecDelai(createServiceClient().from("ec_dossiers").select("id, client_id, reference").eq("crm_dossier_id", crmDossierId).maybeSingle(), DELAI);
  if (!data) return { ok: false, erreur: "Ce dossier n'a pas encore d'espace client." };
  const client = await depot().trouver("clients", data.client_id);
  if (!client) return { ok: false, erreur: "Client de l'espace introuvable." };
  try {
    const n = await envoyerLienAuClient(client, { reference: data.reference });
    await noterDansLeCrm(crmDossierId, `Lien d'accès à l'espace client ${n.statut === "envoyee" ? "envoyé" : "journalisé"} pour ${client.email}`);
    return { ok: true, statut: n.statut, email: client.email };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : "Envoi impossible." };
  }
}

/**
 * Renvoie le lien d'accès d'un client de l'espace, depuis sa fiche du CRM :
 * sans dossier visé, le lien mène au choix de ses déménagements quand il en
 * a plusieurs (à son dossier s'il n'en a qu'un). Noté au fil du dossier du
 * CRM que l'e-mail présente.
 */
export async function renvoyerLienClientEc(clientId: string): Promise<{ ok: true; statut: Notification["statut"]; email: string } | { ok: false; erreur: string }> {
  if (estDemo()) return { ok: false, erreur: "L'espace client de démonstration n'est pas relié au CRM." };
  const client = await depot().trouver("clients", clientId);
  if (!client) return { ok: false, erreur: "Client de l'espace introuvable." };
  try {
    const n = await envoyerLienAuClient(client);
    const courant = n.dossier_id ? await depot().trouver("dossiers", n.dossier_id) : null;
    await noterDansLeCrm(courant?.crm_dossier_id, `Lien d'accès à l'espace client ${n.statut === "envoyee" ? "envoyé" : "journalisé"} pour ${client.email} (depuis la fiche client)`);
    return { ok: true, statut: n.statut, email: client.email };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : "Envoi impossible." };
  }
}

// --- L'état de l'espace, vu du CRM ---------------------------------------------------------------

type Db = ReturnType<typeof createServiceClient>;

/** Les connexions du client (toutes ses sessions : une session ouvre tous ses dossiers) et son dernier lien d'accès. */
async function accesDuClient(db: Db, clientId: string, email: string) {
  const [sessions, liens] = await Promise.all([
    avecDelai(db.from("ec_sessions").select("ouverte_le").eq("client_id", clientId).order("ouverte_le", { ascending: false }).limit(50), DELAI),
    avecDelai(db.from("ec_notifications").select("sent_at, statut").eq("modele", "acces").eq("destinataire", email).order("sent_at", { ascending: false }).limit(1), DELAI),
  ]);
  return {
    dernierAcces: (sessions.data?.[0]?.ouverte_le as string | undefined) ?? null,
    sessions: sessions.data?.length ?? 0,
    dernierLien: liens.data?.[0] ? { le: liens.data[0].sent_at as string, statut: liens.data[0].statut as Notification["statut"] } : null,
  };
}

export interface EtatEspace {
  dossierId: string;
  reference: string;
  segment: TypeClient;
  email: string;
  conseiller: string;
  /** La dernière session ouverte par le client, ou null s'il n'est jamais entré. */
  dernierAcces: string | null;
  sessions: number;
  /** Le dernier lien d'accès : quand, et s'il est parti ou seulement journalisé. */
  dernierLien: { le: string; statut: Notification["statut"] } | null;
  frise: Etape[];
  avancement: { faites: number; total: number; pourcent: number };
  autresDossiers: number;
  /** Les autres dossiers de son espace : un client, un espace, tous ses dossiers dedans. */
  autres: { reference: string; crmDossierId: number | null }[];
  bailleur: string | null;
}

/** L'état de l'espace d'un dossier du CRM : pour la fiche du dossier. Null s'il n'y en a pas. */
export async function etatEspaceCrm(crmDossierId: number): Promise<EtatEspace | null> {
  if (estDemo()) return null;
  const db = createServiceClient();
  const { data: lien } = await avecDelai(db.from("ec_dossiers").select("id, client_id").eq("crm_dossier_id", crmDossierId).maybeSingle(), DELAI);
  if (!lien) return null;
  const d = await depot().lireDuClient(lien.client_id);
  const s = snapshotDe(d, lien.id);
  if (!s) return null;
  const acces = await accesDuClient(db, lien.client_id, s.client.email);
  const frise = calculerFrise(s);
  const conseiller = d.conseillers.find((k) => k.id === s.client.conseiller_id);
  const autres = dossiersDuClient(d, s.client.id).filter((x) => x.id !== s.dossier.id);
  return {
    dossierId: s.dossier.id,
    reference: s.dossier.reference,
    segment: s.client.type,
    email: s.client.email,
    conseiller: conseiller ? `${conseiller.prenom} ${conseiller.nom}`.trim() : "—",
    ...acces,
    frise,
    avancement: avancement(frise),
    autresDossiers: autres.length,
    autres: autres.map((x) => ({ reference: x.reference, crmDossierId: x.crm_dossier_id ?? null })),
    bailleur: s.dossier.bailleur_nom ?? null,
  };
}

/** Un dossier de l'espace d'un client, tel que sa fiche du CRM le montre. */
export interface DossierDeLEspace {
  id: string;
  reference: string;
  crmDossierId: number | null;
  statut: StatutDossier;
  trajet: string;
  periode: string;
  /** La part des points du client faits (suiviEquipe) : le même pourcentage que la liste des espaces. */
  pourcent: number;
  /** Ce que le client a à faire ensuite, ou null si tout est fait. */
  prochaine: string | null;
  creeLe: string;
}

/** L'espace d'un client, vu de sa fiche du CRM : un espace, ses connexions, tous ses dossiers. */
export interface EspaceDuClient {
  clientId: string;
  email: string;
  dernierAcces: string | null;
  sessions: number;
  dernierLien: { le: string; statut: Notification["statut"] } | null;
  dossiers: DossierDeLEspace[];
}

/** L'espace d'un client de l'espace (ec_clients), pour la fiche client du CRM. Null s'il n'existe pas. */
export async function espaceDuClientEc(clientId: string): Promise<EspaceDuClient | null> {
  if (estDemo()) return null;
  const d = await depot().lireDuClient(clientId);
  const client = d.clients.find((c) => c.id === clientId);
  if (!client) return null;
  const acces = await accesDuClient(createServiceClient(), clientId, client.email);
  const dossiers = dossiersDuClient(d, clientId).flatMap((x): DossierDeLEspace[] => {
    const s = snapshotDe(d, x.id);
    if (!s) return [];
    const frise = calculerFrise(s);
    return [
      {
        id: x.id,
        reference: x.reference,
        crmDossierId: x.crm_dossier_id ?? null,
        statut: x.statut,
        trajet: `${x.ville_depart} → ${x.ville_arrivee}`,
        periode: periode(x.periode_debut, x.periode_fin),
        pourcent: suiviEquipe(s, frise).pourcent,
        prochaine: x.statut === "termine" ? null : (prochaineEtape(frise)?.titre ?? null),
        creeLe: x.created_at,
      },
    ];
  });
  return { clientId, email: client.email, ...acces, dossiers };
}

/** Les espaces déjà ouverts pour ces dossiers du CRM : identifiant du dossier CRM → référence et identifiant de l'espace. */
export async function espacesDesDossiersCrm(ids: number[]): Promise<Map<number, { id: string; reference: string }>> {
  const out = new Map<number, { id: string; reference: string }>();
  if (estDemo() || !ids.length) return out;
  const { data } = await avecDelai(createServiceClient().from("ec_dossiers").select("id, reference, crm_dossier_id").in("crm_dossier_id", ids), DELAI);
  for (const l of data ?? []) out.set(l.crm_dossier_id as number, { id: l.id as string, reference: l.reference as string });
  return out;
}

export { segmentDuCrm };
