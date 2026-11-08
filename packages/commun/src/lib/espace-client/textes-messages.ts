/*
 * Les textes modifiables des messages de l'espace client au client.
 *
 * Ce sont ceux qui étaient écrits dans emails.ts, repris mot pour mot, avec
 * leurs variables entre accolades ({salutation}, {montant}…). Ils servent de
 * texte de départ : la ligne correspondante de crm.modeles_messages (clé
 * `ec_<modèle>`, rapprochée par le catalogue de « Courriers et SMS ») est la
 * source de vérité dès qu'elle existe, et l'équipe la modifie depuis l'écran.
 * La mise en page (photo, logo, encadré, bouton) reste celle du code.
 *
 * Pur : aucun import du serveur, il sert aussi à l'aperçu.
 */

export type TexteEspace = {
  /** La clé de la ligne de crm.modeles_messages. */
  cle: string;
  /** Le modèle de l'espace client (emails.ts). */
  modele: string;
  canal: "email" | "sms";
  objet: string | null;
  corps: string;
  /** Les variables que le message connaît, à insérer dans le texte. */
  variables: string[];
};

export const TEXTES_ESPACE: TexteEspace[] = [
  {
    cle: "ec_document_depose",
    modele: "document_depose",
    canal: "email",
    objet: "Un nouveau document a été déposé dans votre espace client",
    corps: "Bonjour {salutation},\n\nUn nouveau document a été déposé dans votre espace client : {document}.",
    variables: ["salutation", "document"],
  },
  {
    cle: "ec_creneau_cartons",
    modele: "creneau_cartons",
    canal: "email",
    objet: "Livraison de vos cartons demain entre {debut} et {fin}",
    corps: "Bonjour {salutation},\n\nVos {nb} cartons seront livrés demain, {jour}, entre {debut} et {fin}.\n\nAdresse : {adresse}\nPersonne présente : {contact}\n\nUn empêchement ? Appelez-nous au {telephone}.",
    variables: ["salutation", "nb", "jour", "debut", "fin", "adresse", "contact", "telephone"],
  },
  {
    cle: "ec_creneau_cartons_sms",
    modele: "creneau_cartons",
    canal: "sms",
    objet: null,
    corps: "Bailly Déménagement : bonjour {prenom}, vos {nb} cartons seront livrés demain entre {debut} et {fin} au {adresse}. Présence requise : {contact}. Un empêchement ? {telephone}",
    variables: ["prenom", "nb", "debut", "fin", "adresse", "contact", "telephone"],
  },
  {
    cle: "ec_paiement_confirme",
    modele: "paiement_confirme",
    canal: "email",
    objet: "Paiement reçu — {libelle}",
    corps: "Bonjour {salutation},\n\nNous avons bien reçu votre paiement de {montant} pour : {libelle}.\n\nRéférence de la transaction : {reference}.",
    variables: ["salutation", "montant", "libelle", "reference"],
  },
  {
    cle: "ec_avarie_recue",
    modele: "avarie_recue",
    canal: "email",
    objet: "Votre déclaration d'avarie a bien été reçue",
    corps: "Bonjour {salutation},\n\nVotre déclaration {numero} concernant {objets} est bien enregistrée. Votre conseiller revient vers vous pour la suite.",
    variables: ["salutation", "numero", "objets"],
  },
  {
    cle: "ec_demande_avis",
    modele: "demande_avis",
    canal: "email",
    objet: "Votre déménagement {trajet} : votre avis compte",
    corps: "Bonjour {salutation},\n\nVotre déménagement {trajet} est terminé. Merci de votre confiance !\n\nVotre avis nous aide à progresser et guide les prochains clients. Il ne vous prendra qu'une minute.",
    variables: ["salutation", "trajet"],
  },
  // La discussion de l'espace client (novembre 2026) : l'équipe a répondu au client depuis le CRM.
  // Texte proposé par la plateforme, à valider par Bailly : la carte de « Courriers et SMS » le marque ainsi.
  {
    cle: "ec_reponse_conseiller",
    modele: "reponse_conseiller",
    canal: "email",
    objet: "Votre conseiller vous a répondu",
    corps: "Bonjour {salutation},\n\n{conseiller} vous a répondu dans votre espace client, au sujet de votre dossier {dossier}.\n\nRetrouvez sa réponse, et toute votre discussion, dans la rubrique « Mon conseiller » de votre espace.",
    variables: ["salutation", "conseiller", "dossier"],
  },
];

export const texteEspace = (modele: string, canal: "email" | "sms") => TEXTES_ESPACE.find((t) => t.modele === modele && t.canal === canal) ?? null;

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Le texte, variables remplacées, en texte brut (objet, SMS). */
export function remplirTexte(t: string, vars: Record<string, unknown>): string {
  return t.replace(/\{([a-z_]+)\}/gi, (m, k: string) => (vars[k] == null ? "" : String(vars[k])));
}

/**
 * Le corps en paragraphes HTML : une ligne vide sépare deux paragraphes, un
 * retour à la ligne devient <br>. Tout est échappé ; les valeurs des
 * variables sont en gras, comme dans les e-mails d'origine (sauf la
 * salutation).
 */
export function paragraphesHtml(t: string, vars: Record<string, unknown>, p: (html: string) => string): string {
  return t
    .trim()
    .split(/\n\s*\n/)
    .map((bloc) =>
      p(
        bloc
          .split("\n")
          .map((ligne) =>
            esc(ligne).replace(/\{([a-z_]+)\}/gi, (m, k: string) => {
              const v = vars[k];
              if (v == null) return "";
              return k === "salutation" ? esc(v) : `<b>${esc(v)}</b>`;
            }),
          )
          .join("<br>"),
      ),
    )
    .join("");
}
