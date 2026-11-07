/*
 * Les garde-fous des envois, sans effet de bord : d'après le réglage de la
 * plateforme et le destinataire, un message part-il, et sinon pourquoi.
 *
 * Trois modes, réglés par ENVOI_MODE — et un seul réglage pour toute la
 * plateforme (questionnaires, espace client, CRM, tâche de la veille) :
 *
 *   (absent ou autre)   désactivé : rien ne part, tout est journalisé ;
 *   ENVOI_MODE=recette  seuls partent les destinataires de la liste blanche
 *                       ENVOI_DESTINATAIRES_AUTORISES (adresses, domaines
 *                       en « @domaine.fr », numéros de téléphone) ;
 *   ENVOI_MODE=actif    tout destinataire réel reçoit.
 *
 * Par-dessus, ENVOI_BAC_A_SABLE=1 : les e-mails partent chez Brevo en bac à
 * sable (acceptés, jamais délivrés) et les SMS ne sont pas transmis du tout
 * — Brevo n'a pas de bac à sable pour les SMS.
 *
 * Et dans tous les modes, un destinataire fictif ne reçoit jamais rien : une
 * adresse d'un domaine réservé aux exemples (example.com, .example, .test…)
 * ou un compte marqué « démo » par l'appelant.
 *
 * Ce fichier n'importe rien du serveur : il se teste seul.
 */

export type ModeEnvoi = "desactive" | "recette" | "actif";
export type Canal = "email" | "sms";

export interface ListeBlanche {
  emails: string[];
  domaines: string[];
  telephones: string[];
}

export interface ReglageEnvois {
  mode: ModeEnvoi;
  bacASable: boolean;
  liste: ListeBlanche;
  /** Ce qui a été lu sans pouvoir servir, ou qui mérite d'être su : affiché au back-office. */
  avertissements: string[];
}

/** « 06 12 34 56 78 », « +33 6 12… », « 0033 6… » → « 33612345678 » : le format qu'attend Brevo. */
export function normaliserTelephone(brut: string): string {
  let t = String(brut ?? "").replace(/[^\d+]/g, "");
  if (t.startsWith("+")) t = t.slice(1);
  else if (t.startsWith("00")) t = t.slice(2);
  else if (/^0\d{9}$/.test(t)) t = `33${t.slice(1)}`;
  return t.replace(/\D/g, "");
}

export const telephoneValide = (brut: string) => /^\d{8,15}$/.test(normaliserTelephone(brut));
export const emailValide = (brut: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(brut ?? "").trim());

/**
 * Une adresse fictive : les domaines réservés aux exemples (RFC 2606 et
 * 6761 — example.com/.net/.org, les extensions .example, .test, .localhost)
 * et ceux du jeu de démonstration (.exemple, exemple.fr). Rien ne leur est
 * jamais envoyé, quel que soit le mode.
 */
export function estAdresseFictive(adresse: string): boolean {
  const a = String(adresse ?? "").trim().toLowerCase();
  return /@(example\.(com|org|net)|exemple\.fr)$/.test(a) || /@([\w-]+\.)*[\w-]+\.(example|test|localhost|exemple)$/.test(a);
}

function sansAccents(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** La liste blanche : séparée par des virgules, des points-virgules ou des retours à la ligne. */
export function lireListe(brut: string | undefined): ListeBlanche {
  const liste: ListeBlanche = { emails: [], domaines: [], telephones: [] };
  for (const morceau of String(brut ?? "").split(/[,;\n]+/)) {
    const v = morceau.trim().toLowerCase();
    if (!v) continue;
    if (v.startsWith("@") && v.length > 2) liste.domaines.push(v.slice(1));
    else if (v.includes("@")) liste.emails.push(v);
    else if (telephoneValide(v)) liste.telephones.push(normaliserTelephone(v));
  }
  return liste;
}

/** Le réglage, lu dans l'environnement. Tout ce qui n'est pas explicitement activé est désactivé. */
export function lireReglage(env: Record<string, string | undefined>): ReglageEnvois {
  const brut = (env.ENVOI_MODE ?? "").trim();
  const v = sansAccents(brut.toLowerCase());
  const mode: ModeEnvoi = v === "actif" ? "actif" : v === "recette" ? "recette" : "desactive";
  const liste = lireListe(env.ENVOI_DESTINATAIRES_AUTORISES);
  const nb = liste.emails.length + liste.domaines.length + liste.telephones.length;
  const avertissements: string[] = [];
  if (brut && mode === "desactive" && !["desactive", "off", "0"].includes(v)) {
    avertissements.push(`ENVOI_MODE="${brut}" n'est pas reconnu (actif, recette ou desactive) : l'envoi reste désactivé.`);
  }
  if (env.ESPACE_CLIENT_ENVOI) avertissements.push("ESPACE_CLIENT_ENVOI n'est plus lue : l'envoi se règle désormais par ENVOI_MODE, pour toute la plateforme.");
  if (mode === "recette" && nb === 0) avertissements.push("Recette sans liste blanche (ENVOI_DESTINATAIRES_AUTORISES) : aucun destinataire n'est autorisé.");
  if (mode === "actif" && nb > 0) avertissements.push("La liste blanche ne vaut qu'en recette : en mode actif, tout destinataire réel reçoit.");
  return { mode, bacASable: env.ENVOI_BAC_A_SABLE === "1", liste, avertissements };
}

export function dansLaListe(liste: ListeBlanche, canal: Canal, destinataire: string): boolean {
  if (canal === "sms") return liste.telephones.includes(normaliserTelephone(destinataire));
  const a = destinataire.trim().toLowerCase();
  const domaine = a.split("@")[1] ?? "";
  return liste.emails.includes(a) || liste.domaines.includes(domaine);
}

export type Decision =
  | { partir: true; bacASable: boolean }
  | { partir: false; statut: "fictif" | "journalise" | "bloque" | "echec"; motif: string };

export const MOTIFS = {
  fictif: "Destinataire fictif (jeu de démonstration) : rien ne lui est jamais envoyé.",
  journalise: "Envoi désactivé (ENVOI_MODE) : journalisé, rien n'est parti.",
  bloque: "Recette : destinataire hors de la liste blanche (ENVOI_DESTINATAIRES_AUTORISES).",
  emailInvalide: "Adresse e-mail invalide.",
  telephoneInvalide: "Numéro de téléphone invalide.",
  bacASableEmail: "Bac à sable Brevo : accepté par Brevo, jamais délivré.",
  bacASableSms: "Bac à sable : le SMS n'est pas transmis à Brevo (pas de bac à sable pour les SMS).",
} as const;

/**
 * Ce que le message a le droit de faire. L'ordre compte : un destinataire
 * fictif est écarté avant tout, même en bac à sable ; puis le mode ; puis la
 * liste blanche de la recette.
 */
export function decider(reglage: ReglageEnvois, m: { canal: Canal; destinataire: string; fictif?: boolean }): Decision {
  if (m.fictif || (m.canal === "email" && estAdresseFictive(m.destinataire))) return { partir: false, statut: "fictif", motif: MOTIFS.fictif };
  if (m.canal === "email" && !emailValide(m.destinataire)) return { partir: false, statut: "echec", motif: MOTIFS.emailInvalide };
  if (m.canal === "sms" && !telephoneValide(m.destinataire)) return { partir: false, statut: "echec", motif: MOTIFS.telephoneInvalide };
  if (reglage.mode === "desactive") return { partir: false, statut: "journalise", motif: MOTIFS.journalise };
  if (reglage.mode === "recette" && !dansLaListe(reglage.liste, m.canal, m.destinataire)) return { partir: false, statut: "bloque", motif: MOTIFS.bloque };
  return { partir: true, bacASable: reglage.bacASable };
}
