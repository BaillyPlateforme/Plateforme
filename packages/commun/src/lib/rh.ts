import "server-only";
import { baseCrm, type Lire } from "@/lib/base-crm";
import { slugifier, type EspacePro } from "@/lib/espaces";
import { TEL_AGENCE } from "@/lib/messaging";
import {
  ETAPE_RH,
  FORMULES_RH,
  aUnEspaceRh,
  etapeDeDemande,
  etapeDeDossier,
  formuleRh,
  villeDeLAdresse,
  type ContactRh,
  type FactureRh,
  type JalonRh,
  type MobiliteRh,
  type MontantRh,
  type PayeurRh,
} from "@/lib/rh-modele";
import { createServiceClient } from "@/lib/supabase/server";
import type { RequestRow, SettingsRow } from "@/lib/types";

/*
 * Les comptes RH et ce qu'ils voient.
 *
 * Un compte RH est un compte d'authentification ordinaire, marqué côté serveur
 * (`app_metadata`) : son rôle, et l'espace pro auquel il est rattaché. Pas de
 * table à part — donc pas de migration : le rattachement voyage dans le jeton
 * de session, où le navigateur ne peut pas le modifier.
 */

export interface CompteRh {
  id: string;
  email: string;
  nom: string;
  cree_le: string;
  derniere_connexion: string | null;
}

type Marque = { role?: string; espace_id?: string };

/** Tous les comptes RH d'un espace. */
export async function listerComptesRh(espaceId: string): Promise<CompteRh[]> {
  const { data, error } = await createServiceClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`Lecture des comptes impossible : ${error.message}`);
  return data.users
    .filter((u) => {
      const m = (u.app_metadata ?? {}) as Marque;
      return m.role === "rh" && m.espace_id === espaceId;
    })
    .map((u) => ({
      id: u.id,
      email: u.email ?? "",
      nom: String((u.user_metadata as { nom?: string } | null)?.nom ?? ""),
      cree_le: u.created_at,
      derniere_connexion: u.last_sign_in_at ?? null,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

const MOT_DE_PASSE_MIN = 10;

export async function creerCompteRh(
  espaceId: string,
  entree: { email: string; nom?: string; motDePasse: string },
): Promise<CompteRh> {
  const email = entree.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Adresse e-mail invalide.");
  if (entree.motDePasse.length < MOT_DE_PASSE_MIN) throw new Error(`Le mot de passe doit compter au moins ${MOT_DE_PASSE_MIN} caractères.`);
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email,
    password: entree.motDePasse,
    // Le compte est créé par l'équipe pour quelqu'un qu'elle connaît : pas de mail de confirmation.
    email_confirm: true,
    app_metadata: { role: "rh", espace_id: espaceId },
    user_metadata: { nom: (entree.nom ?? "").trim() },
  });
  if (error || !data.user) {
    if (/already|registered|exists/i.test(error?.message ?? "")) throw new Error("Un compte existe déjà avec cette adresse.");
    throw new Error(`Création du compte impossible : ${error?.message ?? "réponse vide"}`);
  }
  return { id: data.user.id, email, nom: (entree.nom ?? "").trim(), cree_le: data.user.created_at, derniere_connexion: null };
}

/** Vérifie qu'un compte est bien un compte RH avant d'y toucher : on ne supprime pas un membre de l'équipe par ici. */
async function compteRh(id: string) {
  const admin = createServiceClient().auth.admin;
  const { data, error } = await admin.getUserById(id);
  if (error || !data.user) throw new Error("Compte introuvable.");
  if (((data.user.app_metadata ?? {}) as Marque).role !== "rh") throw new Error("Ce compte n'est pas un compte RH.");
  return admin;
}

export async function supprimerCompteRh(id: string) {
  const admin = await compteRh(id);
  const { error } = await admin.deleteUser(id);
  if (error) throw new Error(`Suppression impossible : ${error.message}`);
}

export async function changerMotDePasseRh(id: string, motDePasse: string) {
  if (motDePasse.length < MOT_DE_PASSE_MIN) throw new Error(`Le mot de passe doit compter au moins ${MOT_DE_PASSE_MIN} caractères.`);
  const admin = await compteRh(id);
  const { error } = await admin.updateUserById(id, { password: motDePasse });
  if (error) throw new Error(`Changement impossible : ${error.message}`);
}

/* ═══════════════════════════ Ce que voient les RH ═══════════════════════════ */

/*
 * Le périmètre d'une entreprise — la seule règle qui décide de ce qu'un compte
 * RH voit. Tout part de l'espace pro, jamais d'un paramètre du navigateur :
 *
 *  1. les demandes arrivées par son espace pro (public.requests, qui retient
 *     l'identifiant de l'espace, ou son nom de lien pour les toutes premières) ;
 *  2. au CRM, les dossiers issus de ces demandes (crm.dossiers.request_id) ;
 *  3. au CRM, les dossiers dont le client OU le payeur est un client rattaché
 *     à l'entreprise par l'équipe (crm.clients.espace_pro_id = l'identifiant
 *     de l'espace, posé depuis la fiche du client). Aucun rapprochement par
 *     le nom : un client non rattaché n'ouvre rien ;
 *  4. les factures que l'entreprise paie : celles dont le payeur est un client
 *     rattaché, ou, sans payeur sur la facture, celles d'un dossier qu'elle
 *     paie (voir payeurDuDossier).
 *
 * Chaque requête porte ces identifiants en paramètres : aucune ne lit une
 * ligne hors du périmètre. On ne lit que les colonnes montrées : ni l'adresse,
 * ni l'inventaire, ni les observations ou les notes de l'équipe ne quittent la
 * base par ce chemin.
 */

type EspaceRh = Pick<EspacePro, "id" | "slug" | "nom" | "rh_couts">;

const COLONNES =
  "id,status,client_nom,client_email,client_tel,depart_ville,depart_code_postal,arrivee_ville,arrivee_code_postal,date_souhaitee,flexibilite,volume_m3,distance_km,formule,estimation_prix,created_at,updated_at";

type Demande = Pick<
  RequestRow,
  | "id" | "status" | "client_nom" | "client_email" | "client_tel" | "depart_ville" | "depart_code_postal" | "arrivee_ville" | "arrivee_code_postal"
  | "date_souhaitee" | "flexibilite" | "volume_m3" | "distance_km" | "formule" | "estimation_prix" | "created_at" | "updated_at"
>;
type DevisSite = { request_id: string; reference: string; montant_ht: number; montant_ttc: number; valid_until: string | null; created_at: string };
type Evenement = { request_id: string; type: string; payload: { status?: string } | null; created_at: string };

type Dossier = {
  id: number; ref: string; statut: string; request_id: string | null; client_id: number; payeur_client_id: number | null; commercial_id: number | null;
  date_chargement: string | null; date_livraison: string | null; mois: string | null; periode: string | null; volume: number;
  cree_le: Date | string; maj_le: Date | string; archive: boolean;
  prenom: string | null; nom: string | null; societe: string | null; email: string | null; telephone: string | null;
  depart: string | null; arrivee: string | null;
};
type DevisCrm = { dossier_id: number; numero: string; formule: string; statut: "envoye" | "signe"; ttc: number; ht: number; envoye_le: Date | null; signe_le: Date | null; validite: string | null; distance_km: number | null };
type FactureCrm = {
  id: number; dossier_id: number | null; numero: string; objet: string; genre: FactureRh["genre"]; statut: FactureRh["statut"];
  emise_le: string; echeance_le: string | null; payee_le: string | null; ttc: number; ht: number | null; reste: number | null;
  /** Le payeur figé sur la facture (colonne, ou client du payeur enregistré), s'il y en a un. */
  payeur_id: number | null;
};
type Visite = { dossier_id: number; type: "phys" | "visio"; debut: Date };

const enIso = (v: Date | string | null | undefined) => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));
const arrondi = (n: number) => Math.round(n * 100) / 100;

export { aUnEspaceRh };

/** Les demandes arrivées par l'espace pro de l'entreprise. */
async function demandesDeLEspace(espace: EspaceRh): Promise<Demande[]> {
  const { data, error } = await createServiceClient()
    .from("requests")
    .select(COLONNES)
    // L'identifiant et le nom de lien d'un espace sont des slugs (a-z, 0-9, tirets) : rien à échapper.
    .or(`raw_payload->espace->>id.eq.${espace.id},raw_payload->espace->>slug.eq.${espace.slug}`)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`Lecture des demandes impossible : ${error.message}`);
  return (data ?? []) as unknown as Demande[];
}

/** Le nom du collaborateur d'un dossier : la personne, pas la société — sauf si le client est la société elle-même. */
function nomCollaborateur(d: Pick<Dossier, "prenom" | "nom" | "societe">): string {
  const personne = [d.prenom, d.nom].filter((x) => x && x.trim()).join(" ").trim();
  if (d.nom && d.societe && slugifier(d.nom) === slugifier(d.societe)) return d.prenom?.trim() || d.societe;
  return personne || d.societe || "—";
}

/**
 * Les clients du CRM rattachés à l'entreprise. Tant que l'app interne n'a pas
 * posé la colonne (elle le fait à son démarrage), aucun : l'espace montre
 * alors les seuls dossiers issus de ses demandes.
 */
async function clientsRattaches(lire: Lire, espace: EspaceRh): Promise<number[]> {
  try {
    return (await lire<{ id: number }>(`select id from crm.clients where espace_pro_id = $1`, [espace.id])).map((c) => c.id);
  } catch (e) {
    if ((e as { code?: string }).code === "42703") {
      console.warn("Espace RH : crm.clients.espace_pro_id manque encore (schéma du CRM pas encore appliqué)");
      return [];
    }
    throw e;
  }
}

/**
 * Qui paie un dossier, pour l'entreprise : son payeur s'il en a un, sinon son
 * client. Rattaché à l'entreprise, c'est elle ; sinon, c'est le salarié.
 */
export function payeurDuDossier(d: { client_id: number; payeur_client_id: number | null }, rattaches: Set<number>): PayeurRh {
  return rattaches.has(d.payeur_client_id ?? d.client_id) ? "entreprise" : "salarie";
}

/** Ce que le CRM sait de l'entreprise : ses dossiers, leurs devis, factures et visites, et son interlocuteur. */
async function lireCrm(lire: Lire, espace: EspaceRh, idsDemandes: string[]) {
  const rattaches = await clientsRattaches(lire, espace);
  const lies = new Set(rattaches);
  if (rattaches.length === 0 && idsDemandes.length === 0)
    return { dossiers: [] as Dossier[], devis: [] as DevisCrm[], factures: [] as FactureCrm[], visites: [] as Visite[], avecPdf: new Set<number>(), contact: null, rattaches: lies };

  const dossiers = await lire<Dossier>(
    `select d.id, d.ref, d.statut, d.request_id::text as request_id, d.client_id, d.payeur_client_id, d.commercial_id,
        to_char(d.date_chargement, 'YYYY-MM-DD') as date_chargement, to_char(d.date_livraison, 'YYYY-MM-DD') as date_livraison,
        to_char(d.mois_ca, 'YYYY-MM') as mois, d.periode, d.volume::float8 as volume, d.cree_le, d.maj_le, d.archive_le is not null as archive,
        c.prenom, c.nom, c.societe, c.email, c.telephone,
        (select adresse from crm.etapes_trajet where dossier_id = d.id and genre = 'depart' order by ordre limit 1) as depart,
        (select adresse from crm.etapes_trajet where dossier_id = d.id and genre = 'arrivee' order by ordre desc limit 1) as arrivee
       from crm.dossiers d join crm.clients c on c.id = d.client_id
      where d.client_id = any($1::int[]) or d.payeur_client_id = any($1::int[]) or d.request_id = any($2::uuid[])
      order by d.cree_le desc`,
    [rattaches, idsDemandes],
  );
  const ids = dossiers.map((d) => d.id);
  const parId = new Map(dossiers.map((d) => [d.id, d]));

  const [devis, toutesFactures, visites] = await Promise.all([
    ids.length
      ? lire<DevisCrm>(
          `select v.dossier_id, v.numero, v.formule, v.statut, v.montant::float8 as ttc,
              coalesce(v.montant_ht, round(v.montant / 1.2, 2))::float8 as ht, v.envoye_le, v.signe_le,
              to_char(v.validite, 'YYYY-MM-DD') as validite, v.distance_km
             from crm.devis v
            where v.dossier_id = any($1::int[]) and v.retire_le is null and v.statut in ('envoye', 'signe')
            order by v.cree_le`,
          [ids],
        )
      : Promise.resolve([] as DevisCrm[]),
    lire<FactureCrm>(
      `select * from (
         select f.id, f.dossier_id, f.numero, f.objet, f.genre, f.statut,
            to_char(f.emise_le, 'YYYY-MM-DD') as emise_le, to_char(f.echeance_le, 'YYYY-MM-DD') as echeance_le,
            to_char(f.payee_le, 'YYYY-MM-DD') as payee_le, f.montant::float8 as ttc, f.montant_ht::float8 as ht, s.reste::float8 as reste,
            coalesce(f.payeur_client_id, case when f.payeur->>'clientId' ~ '^[0-9]+$' then (f.payeur->>'clientId')::int end) as payeur_id
           from crm.factures f left join crm.factures_soldes s on s.id = f.id
       ) x
        where x.dossier_id = any($1::int[]) or x.payeur_id = any($2::int[])
        order by x.emise_le desc, x.id desc`,
      [ids, rattaches],
    ),
    ids.length
      ? lire<Visite>(`select dossier_id, type, debut from crm.rendez_vous where dossier_id = any($1::int[]) and type in ('phys', 'visio') order by debut`, [ids])
      : Promise.resolve([] as Visite[]),
  ]);

  // Seules les factures que l'entreprise paie : son payeur sur la facture, ou, sans payeur, un dossier qu'elle paie.
  const factures = toutesFactures.filter((f) => {
    if (f.payeur_id != null) return lies.has(f.payeur_id);
    const d = f.dossier_id != null ? parId.get(f.dossier_id) : undefined;
    return !!d && payeurDuDossier(d, lies) === "entreprise";
  });

  // Les factures qui ont leur version dans l'espace client du collaborateur : c'est elle qui se télécharge.
  const avecPdf = factures.length
    ? new Set(
        (await lire<{ id: number }>(`select crm_facture_id as id from public.ec_factures where crm_facture_id = any($1::int[])`, [factures.map((f) => f.id)])).map(
          (r) => r.id,
        ),
      )
    : new Set<number>();

  // L'interlocuteur : le commercial du dossier en cours le plus récent, sinon du plus récent.
  const enCours = dossiers.filter((d) => !d.archive && !["termine", "perdu"].includes(d.statut));
  const commercial = (enCours[0] ?? dossiers[0])?.commercial_id ?? null;
  const [contact] = commercial
    ? await lire<{ nom: string; email: string | null; c_prenom: string | null; c_nom: string | null; c_email: string | null; c_tel: string | null }>(
        `select u.nom, u.email, c.prenom as c_prenom, c.nom as c_nom, c.email as c_email, c.telephone as c_tel
           from crm.utilisateurs u left join public.ec_conseillers c on c.crm_utilisateur_id = u.id
          where u.id = $1 limit 1`,
        [commercial],
      )
    : [];

  return { dossiers, devis, factures, visites, avecPdf, contact: contact ?? null, rattaches: lies };
}

/** Le dernier d'une liste selon une date. */
function dernier<T>(liste: T[], date: (x: T) => Date | string | null | undefined): T | undefined {
  return [...liste].sort((a, b) => (enIso(date(b)) ?? "").localeCompare(enIso(date(a)) ?? ""))[0];
}

export interface LectureRh {
  mobilites: MobiliteRh[];
  factures: FactureRh[];
  contact: ContactRh;
  sources: { demandes: number; dossiers: number; clients: number; crm: boolean };
}

/**
 * Tout ce que voient les RH d'une entreprise : ses mobilités (demandes et
 * dossiers fondus en une seule liste), ses factures, son interlocuteur.
 * Sans accès aux coûts (`rh_couts`), ni montant ni facture ne sortent.
 */
export async function lireEspaceRh(espace: EspaceRh, settings: Pick<SettingsRow, "entreprise_email">): Promise<LectureRh> {
  const supabase = createServiceClient();
  const couts = espace.rh_couts;
  const demandes = await demandesDeLEspace(espace);
  const idsDemandes = demandes.map((r) => r.id);

  const [{ data: devisSite }, { data: evenements }] = await Promise.all([
    idsDemandes.length
      ? supabase
          .from("devis")
          .select("request_id,reference,montant_ht,montant_ttc,valid_until,created_at")
          .in("request_id", idsDemandes)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    idsDemandes.length
      ? supabase
          .from("request_events")
          .select("request_id,type,payload,created_at")
          .in("request_id", idsDemandes)
          .in("type", ["completed", "status_changed"])
          .order("created_at")
      : Promise.resolve({ data: [] }),
  ]);
  // Le plus récent devis de chaque demande.
  const devisParDemande = new Map<string, DevisSite>();
  for (const d of (devisSite ?? []) as DevisSite[]) if (!devisParDemande.has(d.request_id)) devisParDemande.set(d.request_id, d);
  const evenementsParDemande = new Map<string, Evenement[]>();
  for (const e of (evenements ?? []) as Evenement[]) evenementsParDemande.set(e.request_id, [...(evenementsParDemande.get(e.request_id) ?? []), e]);

  // Le CRM : par la petite connexion des modules partagés. S'il ne répond pas, l'espace montre les demandes seules, et le dit.
  let crm: Awaited<ReturnType<typeof lireCrm>> | null = null;
  let crmLu = false;
  const lire = baseCrm();
  if (lire && aUnEspaceRh(espace)) {
    try {
      crm = await lireCrm(lire, espace, idsDemandes);
      crmLu = true;
    } catch (e) {
      console.error("Espace RH : lecture du CRM impossible", e instanceof Error ? e.message : e);
    }
  }

  /* ── Une demande : ses jalons, son montant ── */
  const montantDemande = (r: Demande): MontantRh | null => {
    if (!couts) return null;
    const d = devisParDemande.get(r.id);
    const nature: MontantRh["nature"] = r.status === "won" ? "signe" : r.status === "quoted" ? "devis" : "estimation";
    if (d) return { ht: Number(d.montant_ht), ttc: Number(d.montant_ttc), nature, reference: d.reference, valide_jusqu: d.valid_until?.slice(0, 10) ?? null };
    // Sans devis, l'estimation affichée (TTC) ; le HT comme le CRM le déduit d'un ancien devis : TTC ÷ 1,2.
    if (r.estimation_prix != null) return { ht: arrondi(Number(r.estimation_prix) / 1.2), ttc: Number(r.estimation_prix), nature, reference: null, valide_jusqu: null };
    return null;
  };
  const jalonsDemande = (r: Demande): JalonRh[] => {
    const j: JalonRh[] = [{ date: r.created_at, libelle: "Demande envoyée par le collaborateur" }];
    for (const e of evenementsParDemande.get(r.id) ?? []) {
      if (e.type === "completed") j.push({ date: e.created_at, libelle: "Demande complétée par le collaborateur" });
      // Seules les étapes qui parlent à un employeur : le devis, la signature, la fin.
      const etape = e.type === "status_changed" && e.payload?.status ? etapeDeDemande(e.payload.status) : null;
      if (etape && ["devis", "signe", "sans_suite", "cloturee"].includes(etape)) j.push({ date: e.created_at, libelle: ETAPE_RH[etape].label });
    }
    const d = devisParDemande.get(r.id);
    if (d) j.push({ date: d.created_at, libelle: "Estimation établie", detail: d.reference });
    return j;
  };

  const absorbees = new Map<string, Demande>();
  const mobilites: MobiliteRh[] = [];
  const parDossier = new Map<number, string>();

  /* ── Les dossiers du CRM ── */
  if (crm) {
    const demandesParId = new Map(demandes.map((r) => [r.id, r]));
    for (const d of crm.dossiers) {
      const demande = d.request_id ? demandesParId.get(d.request_id) : undefined;
      if (demande) absorbees.set(demande.id, demande);
      const id = `dossier:${d.id}`;
      parDossier.set(d.id, id);
      const sesDevis = crm.devis.filter((v) => v.dossier_id === d.id);
      const signe = dernier(sesDevis.filter((v) => v.statut === "signe"), (v) => v.signe_le);
      const envoye = dernier(sesDevis.filter((v) => v.statut === "envoye"), (v) => v.envoye_le);
      const retenu = signe ?? envoye;
      const sesFactures = crm.factures.filter((f) => f.dossier_id === d.id && f.statut !== "annulee");
      const depart = villeDeLAdresse(d.depart);
      const arrivee = villeDeLAdresse(d.arrivee);

      const jalons: JalonRh[] = demande ? jalonsDemande(demande) : [];
      jalons.push({ date: enIso(d.cree_le)!, libelle: "Dossier ouvert chez Bailly", detail: d.ref });
      for (const v of crm.visites.filter((x) => x.dossier_id === d.id))
        jalons.push({ date: enIso(v.debut)!, libelle: v.type === "visio" ? "Visite technique en visio" : "Visite technique sur place" });
      for (const v of sesDevis) {
        const formule = formuleRh(v.formule);
        if (v.envoye_le) jalons.push({ date: enIso(v.envoye_le)!, libelle: "Devis envoyé", detail: `${formule ? `Formule ${FORMULES_RH[formule]} · ` : ""}${v.numero}` });
        if (v.signe_le) jalons.push({ date: enIso(v.signe_le)!, libelle: "Devis signé", detail: v.numero });
      }
      if (d.date_chargement) jalons.push({ date: d.date_chargement, libelle: "Chargement" });
      if (d.date_livraison) jalons.push({ date: d.date_livraison, libelle: "Livraison" });
      if (couts)
        for (const f of sesFactures) {
          jalons.push({ date: f.emise_le, libelle: f.genre === "avoir" ? `Avoir ${f.numero}` : `Facture ${f.numero} émise` });
          if (f.payee_le) jalons.push({ date: f.payee_le, libelle: `Facture ${f.numero} réglée` });
        }

      // Le prix d'un déménagement que le salarié règle lui-même ne regarde que lui : ni montant, ni facture.
      const payeur: PayeurRh = payeurDuDossier(d, crm.rattaches);
      const montantDemandeAbsorbee = demande ? montantDemande(demande) : null;
      const montant: MontantRh | null =
        !couts || payeur !== "entreprise"
          ? null
          : retenu
            ? { ht: retenu.ht, ttc: retenu.ttc, nature: signe ? "signe" : "devis", reference: retenu.numero, valide_jusqu: retenu.validite }
            : montantDemandeAbsorbee;
      mobilites.push({
        id,
        origine: "dossier",
        reference: d.ref,
        nom: nomCollaborateur(d),
        email: d.email,
        tel: d.telephone,
        depart: depart.ville,
        depart_cp: depart.cp,
        arrivee: arrivee.ville,
        arrivee_cp: arrivee.cp,
        date: d.date_chargement ?? demande?.date_souhaitee ?? null,
        date_fixee: !!d.date_chargement,
        mois: d.mois,
        periode: d.periode ?? demande?.flexibilite ?? null,
        volume_m3: d.volume > 0 ? d.volume : (demande?.volume_m3 ?? null),
        distance_km: retenu?.distance_km ?? demande?.distance_km ?? null,
        formule: formuleRh(retenu?.formule) ?? formuleRh(demande?.formule),
        etape: etapeDeDossier(d.statut, d.archive),
        payeur,
        cree_le: demande?.created_at ?? enIso(d.cree_le)!,
        maj_le: enIso(d.maj_le)!,
        montant,
        // Les factures lues sont déjà celles que l'entreprise paie (lireCrm).
        facture_ttc: couts ? arrondi(sesFactures.reduce((s, f) => s + (f.genre === "avoir" ? -Math.abs(f.ttc) : f.ttc), 0)) : 0,
        chronologie: jalons.sort((a, b) => a.date.localeCompare(b.date)),
      });
    }
  }

  /* ── Les demandes qui n'ont pas (encore) de dossier ── */
  for (const r of demandes) {
    if (absorbees.has(r.id)) continue;
    mobilites.push({
      id: `demande:${r.id}`,
      origine: "demande",
      reference: null,
      nom: r.client_nom ?? "—",
      email: r.client_email,
      tel: r.client_tel,
      depart: r.depart_ville,
      depart_cp: r.depart_code_postal,
      arrivee: r.arrivee_ville,
      arrivee_cp: r.arrivee_code_postal,
      date: r.date_souhaitee?.slice(0, 10) ?? null,
      date_fixee: false,
      mois: null,
      periode: r.flexibilite,
      volume_m3: r.volume_m3 != null ? Number(r.volume_m3) : null,
      distance_km: r.distance_km != null ? Number(r.distance_km) : null,
      formule: formuleRh(r.formule),
      etape: etapeDeDemande(r.status),
      // Sans dossier au CRM, personne n'a encore dit qui paie : hors budget tant que ce n'est pas confirmé.
      payeur: "a_confirmer",
      cree_le: r.created_at,
      maj_le: r.updated_at,
      montant: montantDemande(r),
      facture_ttc: 0,
      chronologie: jalonsDemande(r).sort((a, b) => a.date.localeCompare(b.date)),
    });
  }
  mobilites.sort((a, b) => b.cree_le.localeCompare(a.cree_le));

  /* ── Les factures ── */
  const factures: FactureRh[] =
    couts && crm
      ? crm.factures.map((f) => {
          const mobilite = f.dossier_id != null ? (parDossier.get(f.dossier_id) ?? null) : null;
          return {
            id: f.id,
            numero: f.numero,
            objet: f.objet,
            genre: f.genre,
            emise_le: f.emise_le,
            echeance_le: f.echeance_le,
            ht: f.ht,
            ttc: f.ttc,
            reste: f.reste,
            statut: f.statut,
            mobilite,
            collaborateur: mobilite ? (mobilites.find((m) => m.id === mobilite)?.nom ?? null) : null,
            pdf: crm!.avecPdf.has(f.id),
          };
        })
      : [];

  /* ── L'interlocuteur ── */
  const c = crm?.contact;
  const contact: ContactRh = c
    ? {
        nom: [c.c_prenom, c.c_nom].filter(Boolean).join(" ") || c.nom,
        qualite: "conseiller",
        email: c.c_email || c.email || settings.entreprise_email || null,
        tel: c.c_tel || TEL_AGENCE,
      }
    : { nom: null, qualite: "agence", email: settings.entreprise_email || null, tel: TEL_AGENCE };

  return {
    mobilites,
    factures,
    contact,
    sources: { demandes: demandes.length, dossiers: crm?.dossiers.length ?? 0, clients: crm?.rattaches.size ?? 0, crm: crmLu },
  };
}
