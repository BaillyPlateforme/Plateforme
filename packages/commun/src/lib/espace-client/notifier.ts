import "server-only";
import { envoyerEmail, envoyerSms, type ResultatEnvoi } from "@/lib/envois";
import { adressePublique, estDemo } from "./config";
import { depot, maintenant, nouvelId } from "./depot";
import { rendreEmail } from "./emails";
import type { CanalNotification, Notification } from "./types";

/*
 * Les e-mails et les SMS de l'espace client.
 *
 * Tout message, envoyé ou non, laisse une ligne dans le journal de l'espace
 * (ec_notifications) : c'est là que l'équipe le retrouve et le prévisualise.
 * L'envoi lui-même passe par le module d'envoi de la plateforme
 * (lib/envois), et lui seul : garde-fous (envoi désactivé, recette et liste
 * blanche, bac à sable, destinataire fictif), clé d'idempotence, journal des
 * envois et appel à Brevo. Un échec d'envoi ne fait pas échouer l'action du
 * client : il se lit dans le journal.
 *
 * Deux garde-fous propres à l'espace : un message destiné à un client fictif
 * (adresse @example.com, dossier de démonstration) n'est jamais envoyé — les
 * numéros du jeu de démonstration ressemblent à de vrais numéros ; et ce qui
 * est confidentiel (le lien d'accès d'un vrai client) part dans l'e-mail
 * mais n'est gardé dans aucun journal. En démonstration en mémoire, rien ne
 * part jamais.
 */

export interface MessageSortant {
  dossier_id: string | null;
  canal: CanalNotification;
  modele: string;
  destinataire: string;
  payload: Record<string, unknown>;
}

export interface OptionsEnvoi {
  /** Les champs du message à remplacer dans le journal, une fois envoyé. */
  confidentiel?: Record<string, unknown>;
  /**
   * La clé d'idempotence du message : avec la même clé, il ne part qu'une
   * fois (la tâche de la veille relancée, un double clic). Sans clé, chaque
   * appel est un message nouveau.
   */
  cle?: string;
  /** Pièces jointes de l'e-mail (déjà en base64) : elles partent, le journal ne les garde pas. */
  piecesJointes?: { nom: string; base64: string }[];
  /** D'où part le message, pour le journal des envois : l'espace client, ou la tâche de la veille. */
  origine?: "espace_client" | "veille";
  /** Retenu quel que soit le mode, avec cette raison : il est journalisé, il ne part pas. */
  retenu?: string | null;
}

/** La ligne du journal ; `doublon` : la clé était déjà prise, rien n'a été refait ni réinscrit. */
export type NotificationEnvoyee = Notification & { doublon?: boolean };

export interface Notifier {
  envoyer(message: MessageSortant, options?: OptionsEnvoi): Promise<NotificationEnvoyee>;
}

/** Le dossier du message : sa référence pour le journal, et s'il est fictif (rien ne part alors, même avec l'envoi actif). */
async function dossierDu(m: MessageSortant): Promise<{ reference: string | null; demo: boolean }> {
  if (!m.dossier_id) return { reference: null, demo: false };
  const dossier = await depot().trouver("dossiers", m.dossier_id);
  const client = dossier && (await depot().trouver("clients", dossier.client_id));
  return { reference: dossier?.reference ?? null, demo: !!client?.demo };
}

/** Le statut du journal de l'espace (journalisee, envoyee, echec) d'après celui du module d'envoi. */
function statutDe(r: ResultatEnvoi): Notification["statut"] {
  if (r.statut === "envoye") return "envoyee";
  if (r.statut === "echec" || r.statut === "incertain") return "echec";
  return "journalisee";
}

class NotifierJournal implements Notifier {
  async envoyer(m: MessageSortant, options: OptionsEnvoi = {}): Promise<NotificationEnvoyee> {
    const base = await adressePublique();
    const id = nouvelId();
    const rendu = m.canal === "email" ? rendreEmail(m.modele, m.payload, base) : null;
    const sujet = rendu?.sujet ?? "SMS";
    let statut: Notification["statut"] = "journalisee";
    let erreur: string | null = null;

    if (estDemo()) {
      erreur = "Démonstration en mémoire : rien ne part.";
    } else {
      // Si le dossier ne se relit pas, on le tient pour fictif : mieux vaut ne rien envoyer.
      const dossier = await dossierDu(m).catch(() => ({ reference: null, demo: true }));
      const commun = {
        cle: options.cle ?? `ec:${id}`,
        origine: options.origine ?? ("espace_client" as const),
        modele: m.modele,
        reference: dossier.reference,
        fictif: dossier.demo,
        notificationId: id,
        retenu: options.retenu ?? null,
      };
      const r =
        rendu
          ? await envoyerEmail({ ...commun, a: m.destinataire, sujet: rendu.sujet, html: rendu.html, texte: rendu.texte, piecesJointes: options.piecesJointes })
          : await envoyerSms({ ...commun, a: m.destinataire, texte: String(m.payload.texte ?? "") });
      if (r.doublon) {
        // Déjà traité sous cette clé : pas de seconde ligne au journal de l'espace.
        return { id, ...m, sujet, statut: statutDe(r), erreur: `Déjà traité (clé ${r.cle}).`, sent_at: maintenant(), doublon: true };
      }
      statut = statutDe(r);
      erreur = r.statut === "envoye" ? null : r.motif;
    }

    const masque = options.confidentiel && Object.keys(options.confidentiel).length > 0;
    const payload = masque ? { ...m.payload, ...options.confidentiel, confidentiel: true } : m.payload;
    const n: Notification = { id, ...m, payload, sujet, statut, erreur, sent_at: maintenant() };
    await depot().inserer("notifications", n);
    return n;
  }
}

export const notifier: Notifier = new NotifierJournal();
