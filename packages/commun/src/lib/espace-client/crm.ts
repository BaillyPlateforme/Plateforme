import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { envoyerLienAuClient } from "./acces";
import { AdresseDejaPrise, verifierAdresseLibre } from "./comptes";
import { estDemo } from "./config";
import { avecDelai, depot } from "./depot";
import { PAYS } from "./format";
import { dossiersDuClient, snapshotDe } from "./lectures";
import { photoPourVille } from "./photos";
import { avancement, calculerFrise, type Etape } from "./progression";
import { segmentDuCrm } from "./segments";
import type { Client, Dossier, Notification, TypeClient } from "./types";

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
  | { ok: true; deja: boolean; dossierId: string; reference: string; lien: Pick<Notification, "id" | "statut"> | null; avertissement?: string }
  | { ok: false; erreur: string };

/**
 * Ouvre l'espace client d'un dossier du CRM : le client de l'espace (celui de
 * son adresse s'il existe déjà), le dossier lié et la projection du CRM — en
 * une transaction, par la fonction SQL —, puis le compte de connexion et le
 * lien d'accès, journalisé (envoyé seulement avec ESPACE_CLIENT_ENVOI=1).
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
  await depot().modifier("dossiers", dossier.id, { photo: photoPourVille(dossier.ville_arrivee) });

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

// --- L'état de l'espace, vu du CRM ---------------------------------------------------------------

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
  const [sessions, liens] = await Promise.all([
    avecDelai(db.from("ec_sessions").select("ouverte_le").eq("client_id", lien.client_id).order("ouverte_le", { ascending: false }).limit(50), DELAI),
    avecDelai(db.from("ec_notifications").select("sent_at, statut").eq("modele", "acces").eq("destinataire", s.client.email).order("sent_at", { ascending: false }).limit(1), DELAI),
  ]);
  const frise = calculerFrise(s);
  const conseiller = d.conseillers.find((k) => k.id === s.client.conseiller_id);
  return {
    dossierId: s.dossier.id,
    reference: s.dossier.reference,
    segment: s.client.type,
    email: s.client.email,
    conseiller: conseiller ? `${conseiller.prenom} ${conseiller.nom}`.trim() : "—",
    dernierAcces: (sessions.data?.[0]?.ouverte_le as string | undefined) ?? null,
    sessions: sessions.data?.length ?? 0,
    dernierLien: liens.data?.[0] ? { le: liens.data[0].sent_at as string, statut: liens.data[0].statut as Notification["statut"] } : null,
    frise,
    avancement: avancement(frise),
    autresDossiers: dossiersDuClient(d, s.client.id).length - 1,
    bailleur: s.dossier.bailleur_nom ?? null,
  };
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
