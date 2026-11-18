import "server-only";
import { randomUUID } from "node:crypto";
import { createAuthClient } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { baseConfiguree, modeDonnees, type ModeDonnees } from "./config";
import { amorcer, VERSION_DONNEES } from "./seed";
import type { Donnees } from "./types";

/*
 * Où vivent les données de l'espace client.
 *
 * Une seule interface, deux réalisations, choisies par ESPACE_CLIENT_DONNEES :
 *
 * - la base (par défaut) : les tables ec_* de Supabase (migration 0011).
 *   Deux lectures, et elles ne se confondent jamais :
 *     · `lireClient()` passe par la clé publique et la session du client :
 *       c'est la RLS qui ne rend que SES lignes. Aucune page du client ne lit
 *       autrement ;
 *     · `lire()` passe par la clé de service : tout, pour l'équipe (déjà
 *       authentifiée par son app) et pour les tâches du serveur.
 *   Les écritures passent toutes par la clé de service, ligne à ligne, une
 *   fois que l'action a fait ses propres contrôles (session, propriété du
 *   dossier, schéma).
 *
 * - la démonstration (ESPACE_CLIENT_DONNEES=demo) : un document en mémoire,
 *   amorcé par les profils A à D de la v0, pour développer sans base. Il
 *   repart de zéro au redémarrage, ou sur « Réinitialiser la démo ». Elle ne
 *   touche jamais Supabase.
 */

/** Une liste du document, c'est-à-dire une table : `dossiers` ↔ `ec_dossiers`. */
export type Table = Exclude<keyof Donnees, "version">;
export type Ligne<K extends Table> = Donnees[K][number];

export const TABLES: Table[] = [
  "conseillers", "clients", "dossiers", "devis", "factures", "document_requirements", "modeles_pieces", "documents", "acceptations",
  "declarations_valeurs", "conditions_livraison", "livraisons_cartons", "sav_declarations", "tutos", "services",
  "notifications", "sessions_paiement", "creneaux", "visites",
];

export const nomTable = (t: Table) => `ec_${t}`;

/** Les tables dont les lignes portent un numéro de série, et la colonne qui le porte. */
export type TableNumerotee = "dossiers" | "factures" | "sav_declarations";
const COLONNE_NUMERO: Record<TableNumerotee, "reference" | "numero"> = { dossiers: "reference", factures: "numero", sav_declarations: "numero" };

/** Le plus grand numéro d'une série parmi des numéros existants : « FA-2026-0468 » → 468. */
function plusGrand(numeros: string[], prefixe: string) {
  return numeros
    .filter((n) => n.startsWith(prefixe) && /^\d+$/.test(n.slice(prefixe.length)))
    .reduce((m, n) => Math.max(m, Number(n.slice(prefixe.length))), 0);
}

export interface DepotDonnees {
  readonly mode: ModeDonnees;
  /** Tout le document : pour l'équipe et les tâches du serveur, jamais pour une page du client. */
  lire(): Promise<Donnees>;
  /**
   * Ce que le client connecté a le droit de lire. En base, la RLS en décide
   * (session Supabase du client) ; `clientId` ne sert qu'à revérifier.
   */
  lireClient(clientId: string): Promise<Donnees>;
  /**
   * Les mêmes lignes, mais par la clé de service : pour le serveur qui agit
   * au nom d'un client hors de sa session (l'e-mail d'accès, le webhook de
   * paiement). Jamais pour une page.
   */
  lireDuClient(clientId: string): Promise<Donnees>;
  /** Une ligne, par son identifiant (clé de service). */
  trouver<K extends Table>(table: K, id: string): Promise<Ligne<K> | null>;
  inserer<K extends Table>(table: K, lignes: Ligne<K> | Ligne<K>[]): Promise<void>;
  /**
   * Modifie une ligne. Avec `attendu`, seulement si elle a encore ces valeurs
   * — en une seule requête : deux demandes simultanées ne font pas deux fois
   * la même chose. Rend vrai si la ligne a changé.
   */
  modifier<K extends Table>(table: K, id: string, champs: Partial<Ligne<K>>, attendu?: Partial<Ligne<K>>): Promise<boolean>;
  supprimer<K extends Table>(table: K, id: string): Promise<void>;
  /**
   * Le numéro suivant d'une série — « BD-2026- » donne BD-2026-0164 —, jamais
   * deux fois le même, même sous des demandes simultanées.
   */
  prochainNumero(table: TableNumerotee, prefixe: string, largeur: number): Promise<string>;
  reinitialiser(): Promise<void>;
}

const DELAI = 8_000;

/** Supabase qui ne répond pas ne doit pas figer la page : passé le délai, on abandonne. */
export function avecDelai<T>(promesse: PromiseLike<T>, ms = DELAI, message = "La base ne répond pas."): Promise<T> {
  return new Promise<T>((ok, ko) => {
    const minuteur = setTimeout(() => ko(new Error(message)), ms);
    Promise.resolve(promesse).then(
      (v) => {
        clearTimeout(minuteur);
        ok(v);
      },
      (e) => {
        clearTimeout(minuteur);
        ko(e);
      },
    );
  });
}

export function donneesVides(): Donnees {
  return {
    version: VERSION_DONNEES,
    conseillers: [], clients: [], dossiers: [], devis: [], factures: [], document_requirements: [], modeles_pieces: [], documents: [],
    acceptations: [], declarations_valeurs: [], conditions_livraison: [], livraisons_cartons: [], sav_declarations: [], tutos: [],
    services: [], notifications: [], sessions_paiement: [], creneaux: [], visites: [],
  };
}

/**
 * Ce qu'un client peut voir du document : la même règle que les politiques
 * RLS de la migration 0011. En base, c'est une seconde vérification ; en
 * démonstration, c'est la seule.
 */
export function restreindre(d: Donnees, clientId: string): Donnees {
  const client = d.clients.find((c) => c.id === clientId);
  if (!client) return { ...donneesVides(), version: d.version };
  const dossiers = new Set(d.dossiers.filter((x) => x.client_id === clientId).map((x) => x.id));
  const du = <T extends { dossier_id: string }>(l: T[]) => l.filter((x) => dossiers.has(x.dossier_id));
  // Les modèles des pièces de tous les segments et de celui du client (la politique de la migration 0021).
  const pieces = new Set(d.document_requirements.filter((r) => !r.segment || r.segment === client.type).map((r) => r.id));
  return {
    version: d.version,
    conseillers: d.conseillers.filter((c) => c.id === client.conseiller_id),
    clients: [client],
    dossiers: d.dossiers.filter((x) => dossiers.has(x.id)),
    devis: client.masquer_devis ? [] : du(d.devis),
    factures: client.masquer_factures ? [] : du(d.factures),
    document_requirements: d.document_requirements,
    modeles_pieces: (d.modeles_pieces ?? []).filter((m) => pieces.has(m.requirement_id)),
    documents: du(d.documents),
    acceptations: du(d.acceptations),
    declarations_valeurs: du(d.declarations_valeurs),
    conditions_livraison: du(d.conditions_livraison),
    livraisons_cartons: du(d.livraisons_cartons),
    sav_declarations: du(d.sav_declarations),
    tutos: d.tutos.filter((t) => t.actif),
    services: d.services.filter((s) => s.actif),
    notifications: [],
    sessions_paiement: du(d.sessions_paiement),
    creneaux: du(d.creneaux),
    visites: du(d.visites),
  };
}

// --- La démonstration, en mémoire ----------------------------------------------------------------

type Coffre = typeof globalThis & { __ecMemoire?: Donnees };
// Sur globalThis plutôt que dans une variable du module : Next charge ce
// fichier une fois pour les pages et une autre pour les routes, et deux copies
// de la mémoire ne verraient pas les mêmes dossiers.
const coffre = globalThis as Coffre;

/** Au-delà, les plus anciennes lignes du journal de démonstration s'effacent. */
const TAILLE_JOURNAL = 3000;

class DepotMemoire implements DepotDonnees {
  readonly mode = "demo" as const;

  private doc() {
    if (!coffre.__ecMemoire || coffre.__ecMemoire.version !== VERSION_DONNEES) coffre.__ecMemoire = amorcer();
    return coffre.__ecMemoire;
  }

  async lire() {
    return structuredClone(this.doc());
  }

  async lireClient(clientId: string) {
    return structuredClone(restreindre(this.doc(), clientId));
  }

  async lireDuClient(clientId: string) {
    return this.lireClient(clientId);
  }

  async trouver<K extends Table>(table: K, id: string) {
    const l = (this.doc()[table] as Ligne<K>[]).find((x) => (x as { id: string }).id === id);
    return l ? structuredClone(l) : null;
  }

  async inserer<K extends Table>(table: K, lignes: Ligne<K> | Ligne<K>[]) {
    const liste = this.doc()[table] as Ligne<K>[];
    const nouvelles = (Array.isArray(lignes) ? lignes : [lignes]).map((l) => structuredClone(l));
    if (table === "notifications") {
      liste.unshift(...nouvelles);
      if (liste.length > TAILLE_JOURNAL) liste.length = TAILLE_JOURNAL;
    } else liste.push(...nouvelles);
  }

  async modifier<K extends Table>(table: K, id: string, champs: Partial<Ligne<K>>, attendu?: Partial<Ligne<K>>) {
    const l = (this.doc()[table] as Ligne<K>[]).find((x) => (x as { id: string }).id === id) as Record<string, unknown> | undefined;
    if (!l) return false;
    if (attendu && Object.entries(attendu).some(([k, v]) => l[k] !== v)) return false;
    Object.assign(l, structuredClone(champs));
    return true;
  }

  async supprimer<K extends Table>(table: K, id: string) {
    const d = this.doc();
    (d[table] as Ligne<K>[]) = (d[table] as Ligne<K>[]).filter((x) => (x as { id: string }).id !== id);
  }

  async prochainNumero(table: TableNumerotee, prefixe: string, largeur: number) {
    const col = COLONNE_NUMERO[table];
    const numeros = (this.doc()[table] as unknown as Record<string, string>[]).map((x) => x[col]);
    return `${prefixe}${String(plusGrand(numeros, prefixe) + 1).padStart(largeur, "0")}`;
  }

  async reinitialiser() {
    coffre.__ecMemoire = amorcer();
  }
}

// --- La base : les tables ec_* ---------------------------------------------------------------------

/** Les colonnes numeric : PostgREST peut les rendre en texte, l'application veut des nombres. */
const NUMERIQUES = new Set(["volume_m3", "montant_ht", "montant_ttc", "total", "montant"]);

/**
 * Une ligne lue, aux formats de l'application : les horodatages en ISO
 * (« 2026-09-01T09:00:00.000Z », comme `maintenant()`, pour que les
 * comparaisons de textes restent justes), les montants en nombres.
 */
function normaliser<T>(ligne: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ligne)) {
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) out[k] = new Date(v).toISOString();
    else if (typeof v === "string" && NUMERIQUES.has(k)) out[k] = Number(v);
    else out[k] = v;
  }
  return out as T;
}

/** Une table se lit par lots de mille lignes : c'est le plafond d'une réponse de l'API. */
const LOT = 1000;
/** Le journal ne remonte pas au-delà : les écrans de l'équipe en montrent 400 au plus. */
const JOURNAL_MAX = 1000;

type Requeteur = ReturnType<typeof createServiceClient>;

/**
 * Les tables venues après coup : la visite technique (migration 0015), les
 * modèles des pièces (migration 0021). Tant que leur migration n'est pas
 * appliquée, elles manquent : l'espace se lit sans elles plutôt que de tomber
 * en entier.
 */
const TABLES_FACULTATIVES = new Set<Table>(["creneaux", "visites", "modeles_pieces"]);
const tableAbsente = (table: Table, e: { code?: string; message?: string }) =>
  TABLES_FACULTATIVES.has(table) && (e.code === "PGRST205" || e.code === "42P01" || /could not find the table|does not exist/i.test(e.message ?? ""));

/**
 * Les tables facultatives trouvées absentes à la dernière lecture : l'éditeur
 * des pièces dit ainsi que les modèles attendent la migration 0021, plutôt
 * que d'échouer au premier envoi. Une lecture réussie efface la marque.
 */
const absentes = new Set<Table>();
export const tableManquante = (table: Table) => absentes.has(table);

async function lireTable<K extends Table>(db: Requeteur, table: K): Promise<Ligne<K>[]> {
  const tout: Ligne<K>[] = [];
  const max = table === "notifications" ? JOURNAL_MAX : Infinity;
  for (let debut = 0; debut < max; debut += LOT) {
    let q = db.from(nomTable(table)).select("*");
    q = table === "notifications" ? q.order("sent_at", { ascending: false }) : q.order("id");
    const { data, error } = await avecDelai(q.range(debut, Math.min(debut + LOT, max) - 1));
    if (error && tableAbsente(table, error)) {
      absentes.add(table);
      return [];
    }
    if (error) throw new Error(`Lecture de ${nomTable(table)} impossible : ${error.message}`);
    absentes.delete(table);
    tout.push(...(data ?? []).map((l) => normaliser<Ligne<K>>(l)));
    if ((data ?? []).length < LOT) break;
  }
  return tout;
}

async function lireDocument(db: Requeteur, tables: Table[]): Promise<Donnees> {
  const d = donneesVides();
  const lus = await Promise.all(tables.map((t) => lireTable(db, t)));
  tables.forEach((t, i) => ((d[t] as unknown[]) = lus[i]));
  return d;
}

/** La base n'est pas réglée : on le dit, plutôt que de faire croire à un espace vide. */
function exigerBase() {
  if (!baseConfiguree()) {
    throw new Error("L'espace client n'a pas de base : réglez Supabase (NEXT_PUBLIC_SUPABASE_URL, clés), ou ESPACE_CLIENT_DONNEES=demo pour la démonstration.");
  }
}

/** Ce qu'une session de client a le droit de demander : ni le journal, ni les tables du serveur. */
const TABLES_CLIENT = TABLES.filter((t) => t !== "notifications");

class DepotBase implements DepotDonnees {
  readonly mode = "base" as const;

  private service() {
    exigerBase();
    return createServiceClient();
  }

  async lire() {
    return lireDocument(this.service(), TABLES);
  }

  async lireClient(clientId: string) {
    exigerBase();
    // La clé publique et la session du client : la RLS ne rend que ses lignes.
    const session = (await createAuthClient()) as unknown as Requeteur;
    const d = await lireDocument(session, TABLES_CLIENT);
    // Seconde vérification : même si une politique venait à s'ouvrir par erreur, rien d'autre ne sort.
    return restreindre(d, clientId);
  }

  async lireDuClient(clientId: string) {
    const db = this.service();
    const filtre = async <K extends Table>(table: K, colonne: string, valeurs: string[]): Promise<Ligne<K>[]> => {
      if (!valeurs.length) return [];
      const { data, error } = await avecDelai(db.from(nomTable(table)).select("*").in(colonne, valeurs));
      if (error && tableAbsente(table, error)) return [];
      if (error) throw new Error(`Lecture de ${nomTable(table)} impossible : ${error.message}`);
      return (data ?? []).map((l) => normaliser<Ligne<K>>(l));
    };
    const [clients, dossiers] = await Promise.all([filtre("clients", "id", [clientId]), filtre("dossiers", "client_id", [clientId])]);
    const ids = dossiers.map((x) => x.id);
    const d = donneesVides();
    d.clients = clients;
    d.dossiers = dossiers;
    [
      d.conseillers, d.devis, d.factures, d.documents, d.acceptations, d.declarations_valeurs, d.conditions_livraison,
      d.livraisons_cartons, d.sav_declarations, d.sessions_paiement, d.document_requirements, d.tutos, d.services,
      d.creneaux, d.visites, d.modeles_pieces,
    ] = await Promise.all([
      filtre("conseillers", "id", clients.map((c) => c.conseiller_id)),
      filtre("devis", "dossier_id", ids),
      filtre("factures", "dossier_id", ids),
      filtre("documents", "dossier_id", ids),
      filtre("acceptations", "dossier_id", ids),
      filtre("declarations_valeurs", "dossier_id", ids),
      filtre("conditions_livraison", "dossier_id", ids),
      filtre("livraisons_cartons", "dossier_id", ids),
      filtre("sav_declarations", "dossier_id", ids),
      filtre("sessions_paiement", "dossier_id", ids),
      lireTable(db, "document_requirements"),
      lireTable(db, "tutos"),
      lireTable(db, "services"),
      filtre("creneaux", "dossier_id", ids),
      filtre("visites", "dossier_id", ids),
      lireTable(db, "modeles_pieces"),
    ]);
    return restreindre(d, clientId);
  }

  async trouver<K extends Table>(table: K, id: string) {
    const { data, error } = await avecDelai(this.service().from(nomTable(table)).select("*").eq("id", id).maybeSingle());
    if (error) throw new Error(`Lecture de ${nomTable(table)} impossible : ${error.message}`);
    return data ? normaliser<Ligne<K>>(data) : null;
  }

  async inserer<K extends Table>(table: K, lignes: Ligne<K> | Ligne<K>[]) {
    const liste = Array.isArray(lignes) ? lignes : [lignes];
    if (!liste.length) return;
    const { error } = await avecDelai(this.service().from(nomTable(table)).insert(liste as object[]));
    if (error) throw new Error(`Enregistrement impossible (${nomTable(table)}) : ${error.message}`);
  }

  async modifier<K extends Table>(table: K, id: string, champs: Partial<Ligne<K>>, attendu?: Partial<Ligne<K>>) {
    let q = this.service().from(nomTable(table)).update(champs as object).eq("id", id);
    for (const [k, v] of Object.entries(attendu ?? {})) q = v === null ? q.is(k, null) : q.eq(k, v as string);
    const { data, error } = await avecDelai(q.select("id"));
    if (error) throw new Error(`Enregistrement impossible (${nomTable(table)}) : ${error.message}`);
    return (data ?? []).length > 0;
  }

  async supprimer<K extends Table>(table: K, id: string) {
    const { error } = await avecDelai(this.service().from(nomTable(table)).delete().eq("id", id));
    if (error) throw new Error(`Suppression impossible (${nomTable(table)}) : ${error.message}`);
  }

  async prochainNumero(table: TableNumerotee, prefixe: string, largeur: number) {
    const db = this.service();
    const col = COLONNE_NUMERO[table];
    // Le plancher : le plus grand numéro déjà en table (jeu de démonstration, saisie
    // antérieure). Le compteur de la base fait le reste, sans doublon possible.
    const { data: lus, error: e1 } = await avecDelai(db.from(nomTable(table)).select(col).like(col, `${prefixe}%`).order(col, { ascending: false }).limit(50));
    if (e1) throw new Error(`Numérotation impossible : ${e1.message}`);
    const plancher = plusGrand((lus ?? []).map((x) => String((x as Record<string, unknown>)[col])), prefixe);
    const { data, error } = await avecDelai(db.rpc("ec_numero_suivant", { p_cle: prefixe, p_plancher: plancher }));
    if (error || typeof data !== "number") throw new Error(`Numérotation impossible : ${error?.message ?? "réponse inattendue"}`);
    return `${prefixe}${String(data).padStart(largeur, "0")}`;
  }

  async reinitialiser() {
    throw new Error("Les données réelles ne se réinitialisent pas.");
  }
}

const memoire = new DepotMemoire();
const base = new DepotBase();

/** Le dépôt choisi par l'environnement. */
export function depot(): DepotDonnees {
  return modeDonnees() === "demo" ? memoire : base;
}

/** Tout le document, par la clé de service : l'équipe et les tâches du serveur. */
export const lireDonnees = () => depot().lire();

/** Un identifiant de ligne : un UUID, comme les clés des tables. */
export const nouvelId = () => randomUUID();

export const maintenant = () => new Date().toISOString();
