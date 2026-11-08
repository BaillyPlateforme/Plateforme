import "server-only";
import { randomUUID } from "node:crypto";
import { brevoConfigure, posterEmail, posterSms, type ReponseBrevo } from "./brevo";
import { decider, lireReglage, MOTIFS, type Canal, type ModeEnvoi, type ReglageEnvois } from "./garde-fous";
import { conclure, reserver, type LigneEnvoi, type OrigineEnvoi, type StatutEnvoi } from "./journal";
import { equiperEmail } from "@/lib/suivi-envois";

/*
 * Le module d'envoi de la plateforme : TOUT e-mail et TOUT SMS passe par
 * `envoyerEmail` ou `envoyerSms` — les questionnaires, l'espace client, le
 * CRM, la tâche de la veille. Chaque message suit le même chemin :
 *
 *   1. sa clé d'idempotence est réservée au journal (public.envois) : une
 *      clé déjà prise ne repart pas — jamais deux envois pour la même clé ;
 *   1 bis. un e-mail au client est équipé pour le suivi (lib/suivi-envois : pixel
 *      d'ouverture, liens suivis), avec l'identifiant de sa ligne — même s'il
 *      ne part pas ; un échec du suivi le laisse partir tel quel ;
 *   2. les garde-fous décident (garde-fous.ts) : destinataire fictif, envoi
 *      désactivé, recette et liste blanche, bac à sable ;
 *   3. s'il a le droit de partir, Brevo est appelé, et sa réponse (son
 *      identifiant, ou l'erreur) est inscrite au journal.
 *
 * Si le journal ne répond pas, rien ne part : sans clé réservée, on ne
 * saurait pas garantir qu'un message ne parte pas deux fois.
 *
 * Les fonctions ne lèvent jamais : elles rendent le statut du message, que
 * l'appelant affiche ou consigne.
 */

export type { Canal, ModeEnvoi, LigneEnvoi, OrigineEnvoi, StatutEnvoi };

interface Commun {
  /** La clé d'idempotence : deux appels avec la même clé n'envoient qu'une fois. Sans clé, une clé unique. */
  cle?: string | null;
  origine: OrigineEnvoi;
  /** Le modèle ou l'événement, pour s'y retrouver dans le journal. */
  modele?: string | null;
  /** Le dossier, la demande… : ce qui permet de retrouver le message. */
  reference?: string | null;
  /** Le destinataire est un compte de démonstration : il ne reçoit jamais rien. */
  fictif?: boolean;
  /** La ligne du journal de l'espace client (ec_notifications) qui porte ce message. */
  notificationId?: string | null;
  /**
   * Le message est retenu par l'appelant, quel que soit le mode : il est
   * journalisé avec cette raison et ne part pas (une demande d'avis sans lien
   * de dépôt d'avis, par exemple).
   */
  retenu?: string | null;
}

export interface EmailSortant extends Commun {
  a: string;
  sujet: string;
  html: string;
  texte?: string;
  expediteur?: { nom?: string | null; email?: string | null };
  repondreA?: string | null;
  piecesJointes?: { nom: string; base64: string }[];
  /**
   * Le suivi de l'e-mail (lib/suivi-envois : pixel d'ouverture, liens suivis). Par
   * défaut, tout e-mail au client ; jamais les alertes de l'équipe, les
   * messages à l'équipe ou au bailleur, ni les tests des Paramètres.
   */
  suivi?: boolean;
}

export interface SmsSortant extends Commun {
  a: string;
  texte: string;
  /** L'expéditeur affiché (11 caractères alphanumériques au plus). */
  expediteur?: string | null;
}

export interface ResultatEnvoi {
  /** « en_cours » seulement pour un doublon dont le premier passage n'a pas fini. */
  statut: StatutEnvoi;
  motif: string | null;
  brevoId: string | null;
  cle: string;
  /** La clé était déjà prise : rien n'a été refait, le statut est celui du premier passage. */
  doublon: boolean;
  journalId: string | null;
  bacASable: boolean;
}

/** Le réglage en vigueur (lu à chaque envoi : un changement de variable vaut au redémarrage). */
export const reglageEnvois = (): ReglageEnvois => lireReglage(process.env);

/** L'expéditeur par défaut, quand l'appelant n'en donne pas : celui de toujours, réglable. */
function expediteurParDefaut() {
  return {
    nom: process.env.ENVOI_EXPEDITEUR_NOM || "Bailly Déménagement",
    email: process.env.ENVOI_EXPEDITEUR_EMAIL || "no-reply@bailly.fr",
  };
}

const cleDe = (cle: string | null | undefined) => (cle?.trim() || `auto:${randomUUID()}`).slice(0, 300);

/**
 * L'alerte de l'équipe « Envoi bloqué par les garde-fous » (recette, hors
 * liste blanche), à ses abonnés. Jamais pour une alerte elle-même (pas de
 * boucle), jamais bloquante ; chargée à la demande (le module des alertes
 * envoie par celui-ci).
 */
function signalerBlocage(b: { cle: string; modele: string | null; reference: string | null; destinataire: string; motif: string }) {
  if (b.cle.startsWith("alerte:")) return;
  void import("@/lib/alertes-equipe")
    .then((a) => a.alerterEquipe("envoi_bloque", { evenement: b.cle, reference: b.reference, vars: { modele: b.modele ?? "message", reference: b.reference ?? "—", destinataire: b.destinataire, motif: b.motif } }))
    .catch(() => undefined);
}

/** Un e-mail est-il suivi par défaut ? Seulement s'il va au client. */
const HORS_CLIENT = /(_equipe$|^avarie_bailleur$|^Alerte équipe)/;
const suiviParDefaut = (m: Pick<EmailSortant, "origine" | "cle" | "modele">) =>
  m.origine !== "test" && !String(m.cle ?? "").startsWith("alerte:") && !HORS_CLIENT.test(m.modele ?? "");

async function envoyer(
  canal: Canal,
  m: Commun & { a: string; sujet: string | null; apercu: string | null },
  appeler: (bacASable: boolean) => Promise<ReponseBrevo>,
  /** Juste après la réservation, avant tout : l'e-mail est équipé pour le suivi avec l'identifiant de sa ligne (lib/suivi-envois). */
  preparer?: (envoiId: string) => Promise<void>,
): Promise<ResultatEnvoi> {
  const reglage = reglageEnvois();
  const cle = cleDe(m.cle);
  const destinataire = m.a.trim();
  const base = { cle, brevoId: null, doublon: false, journalId: null, bacASable: reglage.bacASable };

  let r: { reservee: boolean; ligne: LigneEnvoi };
  try {
    r = await reserver({
      cle, canal, origine: m.origine, modele: m.modele ?? null, destinataire, sujet: m.sujet, apercu: m.apercu,
      reference: m.reference ?? null, notification_id: m.notificationId ?? null, mode: reglage.mode, bac_a_sable: reglage.bacASable,
    });
  } catch (e) {
    console.error("Envois : journal indisponible, rien n'est parti", e instanceof Error ? e.message : e);
    return { ...base, statut: "echec", motif: `Journal des envois indisponible : rien n'est parti (${e instanceof Error ? e.message : "erreur"}).` };
  }
  if (!r.reservee) {
    return { ...base, statut: r.ligne.statut, motif: r.ligne.motif, brevoId: r.ligne.brevo_id, doublon: true, journalId: r.ligne.id, bacASable: r.ligne.bac_a_sable };
  }

  // Même journalisé ou retenu, l'e-mail est équipé : ses liens se retrouvent, et le suivi s'éprouve sans rien envoyer.
  if (preparer) await preparer(r.ligne.id);

  const finir = async (statut: Exclude<StatutEnvoi, "en_cours">, motif: string | null, brevoId: string | null = null): Promise<ResultatEnvoi> => {
    try {
      await conclure(r.ligne.id, { statut, motif, brevo_id: brevoId });
    } catch (e) {
      // Le message est traité ; seule sa ligne n'a pas pu être mise à jour (elle reste « en cours »).
      console.error(`Envois : statut « ${statut} » non inscrit pour ${cle}`, e instanceof Error ? e.message : e);
    }
    return { ...base, statut, motif, brevoId, journalId: r.ligne.id };
  };

  const decision = decider(reglage, { canal, destinataire, fictif: m.fictif });
  if (!decision.partir) {
    if (decision.statut === "bloque") signalerBlocage({ cle, modele: m.modele ?? null, reference: m.reference ?? null, destinataire, motif: decision.motif });
    return finir(decision.statut, decision.motif);
  }
  if (m.retenu) return finir("journalise", m.retenu);

  // Le SMS en bac à sable ne quitte pas la plateforme.
  if (decision.bacASable && canal === "sms") return finir("bac_a_sable", MOTIFS.bacASableSms);
  if (!brevoConfigure()) return finir("echec", "Clé Brevo absente (BREVO_API_KEY) : rien n'est parti.");

  const rep = await appeler(decision.bacASable);
  if (rep.ok) return finir(decision.bacASable ? "bac_a_sable" : "envoye", decision.bacASable ? MOTIFS.bacASableEmail : null, rep.id);
  return finir(rep.definitif ? "echec" : "incertain", rep.definitif ? rep.message : `${rep.message} — Brevo a peut-être accepté le message : il n'est pas renvoyé tout seul.`);
}

export function envoyerEmail(m: EmailSortant): Promise<ResultatEnvoi> {
  const defaut = expediteurParDefaut();
  // Le corps qui part : celui de l'appelant, équipé pour le suivi une fois la ligne du journal réservée (lib/suivi-envois).
  let html = m.html;
  const equiper = (m.suivi ?? suiviParDefaut(m))
    ? async (envoiId: string) => {
        html = await equiperEmail(envoiId, m.html);
      }
    : undefined;
  return envoyer(
    "email",
    { ...m, sujet: m.sujet, apercu: null },
    (bacASable) =>
      posterEmail({
        a: m.a.trim(),
        sujet: m.sujet,
        html,
        texte: m.texte,
        expediteur: { nom: m.expediteur?.nom || defaut.nom, email: m.expediteur?.email || defaut.email },
        repondreA: m.repondreA,
        piecesJointes: m.piecesJointes,
        bacASable,
      }),
    equiper,
  );
}

export function envoyerSms(m: SmsSortant): Promise<ResultatEnvoi> {
  return envoyer("sms", { ...m, sujet: null, apercu: m.texte.slice(0, 640) }, () => posterSms({ a: m.a, texte: m.texte, expediteur: m.expediteur }));
}

/** Le message est-il vraiment parti chez son destinataire ? */
export const estParti = (r: Pick<ResultatEnvoi, "statut">) => r.statut === "envoye";

/** Le statut, dit en quelques mots : pour un fil d'activité ou un message à l'équipe. */
export function libelleStatut(r: Pick<ResultatEnvoi, "statut" | "doublon">): string {
  if (r.doublon) return r.statut === "envoye" ? "déjà envoyé" : "déjà traité";
  switch (r.statut) {
    case "envoye":
      return "envoyé";
    case "journalise":
      return "journalisé (envoi désactivé)";
    case "bloque":
      return "bloqué (recette, hors liste blanche)";
    case "fictif":
      return "non envoyé (destinataire fictif)";
    case "bac_a_sable":
      return "bac à sable (non délivré)";
    case "incertain":
      return "incertain (à vérifier chez Brevo)";
    case "echec":
      return "échec";
    default:
      return "en cours";
  }
}

export interface EtatEnvois {
  mode: ModeEnvoi;
  /** « Désactivé », « Recette (liste blanche) », « Actif ». */
  libelle: string;
  detail: string;
  bacASable: boolean;
  liste: string[];
  brevo: boolean;
  avertissements: string[];
}

/** L'état des envois, pour le back-office : ce qui part vraiment, et vers qui. */
export function etatEnvois(): EtatEnvois {
  const r = reglageEnvois();
  const liste = [...r.liste.emails, ...r.liste.domaines.map((d) => `@${d}`), ...r.liste.telephones.map((t) => `+${t}`)];
  const libelle = r.mode === "actif" ? "Actif" : r.mode === "recette" ? "Recette (liste blanche)" : "Désactivé";
  const detail =
    r.mode === "actif"
      ? "Les e-mails et les SMS partent par Brevo vers tous les destinataires réels."
      : r.mode === "recette"
        ? `Seuls les destinataires de la liste blanche reçoivent (${liste.length} entrée${liste.length > 1 ? "s" : ""}) ; les autres messages sont bloqués et journalisés.`
        : "Rien ne part : chaque e-mail et chaque SMS est journalisé, sans appel à Brevo.";
  const avertissements = [...r.avertissements];
  if (r.mode !== "desactive" && !brevoConfigure()) avertissements.push("Aucune clé Brevo (BREVO_API_KEY) : les messages autorisés échoueront.");
  return {
    mode: r.mode,
    libelle: r.bacASable && r.mode !== "desactive" ? `${libelle} · bac à sable` : libelle,
    detail: r.bacASable && r.mode !== "desactive" ? `${detail} Bac à sable : les e-mails sont acceptés par Brevo sans être délivrés, les SMS ne sont pas transmis.` : detail,
    bacASable: r.bacASable,
    liste,
    brevo: brevoConfigure(),
    avertissements,
  };
}
