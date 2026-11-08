import { listeDemandes } from "@/lib/email-layout";
import { euros } from "@/lib/espace-client/format";
import type { BlocEmail } from "@/crm/messages/rendu";
import type { DemandeRelance, ElementRelance, TypeRelance } from "./regles";

/*
 * Le courrier d'une relance, sans rien du serveur : la liste de ce qu'elle
 * demande (les éléments cochés), mise en page en bloc pour l'e-mail et en
 * liste pour le texte brut, et les variables qui en dépendent ({elements},
 * {pieces}, {montant}). L'envoi (moteur.ts), l'écran d'envoi (dans le
 * navigateur) et l'aperçu de « Courriers et SMS » composent tous par ici :
 * ce que l'équipe voit est ce que le client reçoit.
 *
 * Les phrases du bloc sont À VALIDER par Bailly (08/11/2026). Celles marquées
 * « reprise » viennent de l'espace client (progression.ts, textes-messages.ts).
 */

/** Les liens d'une relance : composés par le serveur, qui connaît les adresses. */
export interface LiensRelance {
  /** Le lien propre à un élément : la page de signature d'un devis. */
  parElement: Record<string, string>;
  /** Le lien du bouton : l'espace client (pièces, conditions, factures), le dépôt d'avis. */
  principal: string | null;
}

/** « A, B et C ». */
export function enListe(mots: string[]) {
  return mots.length > 1 ? `${mots.slice(0, -1).join(", ")} et ${mots.at(-1)}` : (mots[0] ?? "");
}

const jourLong = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

interface TexteBloc {
  surtitre: (n: number) => string;
  titre: (n: number) => string;
  /** Le mot de la pastille ; sans lui, pas de pastille (un seul élément possible). */
  mot?: string;
  intro: (n: number, lien: boolean) => string | null;
  /** Le bouton, quand il y a un lien principal. */
  action: string;
  /** Le lien propre à chaque élément, quand il y en a plusieurs (un devis chacun). */
  lienElement?: string;
  echeance?: (jour: string) => string;
  note: string;
}

const NOTE = "Une question ? Répondez simplement à ce message.";

/** Les phrases du bloc, type par type. À valider. */
export const TEXTES_BLOC: Record<TypeRelance, TexteBloc> = {
  devis: {
    surtitre: (n) => (n > 1 ? "Vos devis" : "Votre devis"),
    titre: (n) => (n > 1 ? `Vos ${n} devis attendent votre réponse` : "Votre devis attend votre réponse"),
    mot: "à signer",
    intro: (n) => (n > 1 ? "Comparez-les, puis signez en ligne celui qui vous convient." : "Vous pouvez le consulter et le signer en ligne, en quelques clics."),
    // « Signer le devis » : reprise du devis prêt (envoyerDevisParEmail).
    action: "Signer le devis",
    lienElement: "Voir et signer ce devis",
    note: NOTE,
  },
  pieces: {
    surtitre: () => "Vos documents",
    titre: (n) => (n > 1 ? `Il nous manque ${n} documents` : "Il nous manque un document"),
    mot: "à déposer",
    // Reprise : la prochaine étape de l'espace client (« En PDF ou en photo, depuis « Mes documents » »).
    intro: (_n, lien) => (lien ? "En PDF ou en photo, depuis « Mes documents » de votre espace client." : "En PDF ou en photo."),
    action: "Déposer mes documents",
    echeance: (jour) => `À nous transmettre avant le ${jour}`,
    note: NOTE,
  },
  conditions: {
    surtitre: () => "Votre livraison",
    // Reprise : la prochaine étape de l'espace client.
    titre: () => "Complétez vos conditions de livraison",
    intro: () => "4 minutes pour que le jour J se passe sans surprise. Cette étape est obligatoire.",
    action: "Compléter mes conditions de livraison",
    echeance: (jour) => `À compléter avant le ${jour}`,
    note: NOTE,
  },
  solde: {
    surtitre: () => "Votre règlement",
    titre: (n) => (n > 1 ? `${n} factures restent à régler` : "Une facture reste à régler"),
    mot: "à régler",
    // Reprise : la prochaine étape de l'espace client (« Réglez le solde »).
    intro: (_n, lien) => (lien ? "Paiement en ligne sécurisé, reçu immédiat par e-mail." : null),
    action: "Régler en ligne",
    note: "Déjà réglé ? Merci de ne pas tenir compte de ce message.",
  },
  avis: {
    surtitre: () => "Votre avis",
    // Reprise : la demande d'avis (« votre avis compte », « Donner mon avis »).
    titre: () => "Votre avis compte",
    intro: () => "Votre avis nous aide à progresser et guide les prochains clients.",
    action: "Donner mon avis",
    note: NOTE,
  },
};

/** Les éléments retenus : ceux cochés (dans l'ordre de la relance), ou tous quand rien n'est précisé. */
export function elementsChoisis(demande: Pick<DemandeRelance, "elements">, choix: readonly string[] | null | undefined) {
  return choix ? demande.elements.filter((e) => choix.includes(e.id)) : demande.elements;
}

/** Le bloc de la relance : en HTML pour l'e-mail, en liste pour le texte brut. */
export function blocRelance(type: TypeRelance, demande: DemandeRelance, choisis: ElementRelance[], liens: LiensRelance): BlocEmail {
  const t = TEXTES_BLOC[type];
  const n = choisis.length;
  // Plusieurs devis : un lien chacun, pas de bouton commun. Un seul : le bouton mène au sien.
  const parElement = type === "devis" && n > 1;
  const principal = type === "devis" ? (n === 1 ? (liens.parElement[choisis[0].id] ?? null) : null) : liens.principal;
  const total = type === "solde" && n > 1 ? euros(choisis.reduce((s, e) => s + (e.montant ?? 0), 0)) : null;
  const echeance = t.echeance && demande.avant ? t.echeance(jourLong(demande.avant)) : null;
  const faits = type === "pieces" && demande.faits && demande.faits.n > 0 ? demande.faits : null;
  const progression = faits
    ? { n: faits.n, sur: faits.sur, texte: `${faits.n} document${faits.n > 1 ? "s" : ""} sur ${faits.sur} déjà reçu${faits.n > 1 ? "s" : ""} : merci !` }
    : null;
  const intro = t.intro(n, !!principal);

  const html = listeDemandes({
    surtitre: t.surtitre(n),
    titre: t.titre(n),
    compte: t.mot && n > 1 ? { n, mot: t.mot } : null,
    echeance,
    progression,
    intro,
    elements: choisis.map((e) => ({
      titre: e.titre,
      detail: e.detail || null,
      valeur: e.valeur,
      lien: parElement && liens.parElement[e.id] ? { url: liens.parElement[e.id], libelle: t.lienElement ?? "Voir" } : null,
    })),
    total: total ? ["Total à régler", total] : null,
    action: principal ? { libelle: t.action, url: principal } : null,
    note: t.note,
  });

  const texte = [
    [t.titre(n), echeance, intro].filter(Boolean).join("\n"),
    choisis
      .map((e) =>
        [
          `– ${e.titre}${e.valeur ? ` : ${e.valeur}` : ""}`,
          e.detail ? `  ${e.detail}` : null,
          parElement && liens.parElement[e.id] ? `  ${t.lienElement} : ${liens.parElement[e.id]}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n"),
    total ? `Total à régler : ${total}` : null,
    principal ? `${t.action} : ${principal}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { html, texte };
}

/**
 * Les variables qui dépendent des éléments cochés : {elements} (la liste
 * courte), et celles d'avant la liste — {pieces} (les pièces retenues) et
 * {montant} (le total des factures retenues).
 */
export function varsRelance(type: TypeRelance, base: Record<string, string>, choisis: ElementRelance[]): Record<string, string> {
  const out: Record<string, string> = { ...base, elements: enListe(choisis.map((e) => e.court)) };
  if (type === "pieces") out.pieces = choisis.map((e) => e.titre).join(", ");
  if (type === "solde") out.montant = euros(choisis.reduce((s, e) => s + (e.montant ?? 0), 0));
  return out;
}

/** Le dossier, en surtitre de l'en-tête de l'e-mail d'une relance. */
export const surtitreRelance = (ref: string) => `Votre dossier ${ref}`;

/*
 * Les textes PROPOSÉS des cartes de relance encore vides dans « Courriers et
 * SMS » — À VALIDER par Bailly. Ils ne partent jamais d'eux-mêmes : une carte
 * vide reste « texte à valider » et sa relance ne part pas (moteur.ts). Ils
 * servent à l'aperçu, marqués comme tels, et de point de départ dans
 * l'éditeur de la carte (« Partir du texte proposé »), qui ne les enregistre
 * que sur « Enregistrer le texte ».
 */
export const TEXTES_PROPOSES: Record<string, { objet: string | null; corps: string }> = {
  relance_pieces: {
    objet: "Il nous manque quelques documents pour votre déménagement",
    corps: "Bonjour {client},\n\nPour préparer votre déménagement dans les meilleures conditions, il nous manque encore quelques documents.\n\n{elements}\n\nMerci d'avance,\n{commercial}",
  },
  relance_conditions: {
    objet: "Vos conditions de livraison à compléter",
    corps: "Bonjour {client},\n\nPour préparer le jour J, nous avons besoin de connaître les conditions d'accès à votre nouveau logement.\n\n{elements}\n\nMerci d'avance,\n{commercial}",
  },
  relance_solde: {
    objet: "Votre règlement de {montant} reste à effectuer",
    corps: "Bonjour {client},\n\nSauf erreur de notre part, {montant} restent à régler pour votre dossier {ref}.\n\n{elements}\n\nBien cordialement,\n{commercial}",
  },
  relance_avis: {
    objet: "Votre avis compte pour nous",
    corps: "Bonjour {client},\n\nVotre déménagement est terminé : merci encore de votre confiance.\n\n{elements}\n\nBien cordialement,\n{commercial}",
  },
  devis_relance_sms: { objet: null, corps: "Bailly Déménagement : votre devis {elements} attend votre réponse. Vous pouvez le signer en ligne depuis notre e-mail. {commercial}" },
  relance_pieces_sms: { objet: null, corps: "Bailly Déménagement : il nous manque encore {elements} pour votre déménagement. Déposez-les depuis votre espace client. Merci !" },
  relance_conditions_sms: { objet: null, corps: "Bailly Déménagement : pensez à compléter vos conditions de livraison dans votre espace client avant votre déménagement. Merci !" },
  relance_solde_sms: { objet: null, corps: "Bailly Déménagement : sauf erreur, {montant} restent à régler pour votre déménagement ({elements}). Merci !" },
  relance_avis_sms: { objet: null, corps: "Bailly Déménagement : merci de votre confiance ! Votre avis sur votre déménagement nous aiderait beaucoup." },
};

/** Des relances d'exemple, pour l'aperçu d'une carte dans « Courriers et SMS ». */
export const EXEMPLES: Record<TypeRelance, DemandeRelance> = {
  devis: {
    espace: null, avant: null, faits: null,
    elements: [
      { id: "devis:1", titre: "Devis DV-2026-0001 · Formule Standard", court: "DV-2026-0001", detail: "Envoyé le 3 novembre, valable jusqu'au 3 décembre.", valeur: "1 950,00 € TTC", montant: 1950, jeton: "x" },
      { id: "devis:2", titre: "Devis DV-2026-0002 · Formule Premium", court: "DV-2026-0002", detail: "Envoyé le 3 novembre, valable jusqu'au 3 décembre.", valeur: "2 480,00 € TTC", montant: 2480, jeton: "y" },
    ],
  },
  pieces: {
    espace: "BD-2026-0001", avant: "2026-12-12", faits: { n: 1, sur: 3 },
    elements: [
      { id: "piece:1", titre: "Justificatif de domicile", court: "votre justificatif de domicile", detail: "De moins de trois mois : facture d'électricité, de gaz ou d'eau.", valeur: null },
      { id: "piece:2", titre: "Attestation d'assurance habitation", court: "votre attestation d'assurance", detail: "Celle de votre futur logement.", valeur: null },
    ],
  },
  conditions: {
    espace: "BD-2026-0001", avant: "2026-12-12", faits: null,
    elements: [{ id: "conditions", titre: "Questionnaire des conditions de livraison", court: "vos conditions de livraison", detail: "Étage, ascenseur, stationnement, accès du camion.", valeur: null }],
  },
  solde: {
    espace: "BD-2026-0001", avant: null, faits: null,
    elements: [
      { id: "facture:1", titre: "Facture FA-2026-0001 · Solde du déménagement", court: "FA-2026-0001 (1 234,00 €)", detail: "Émise le 12 décembre.", valeur: "1 234,00 €", montant: 1234 },
      { id: "facture:2", titre: "Facture FA-2026-0002 · Garde-meuble", court: "FA-2026-0002 (96,00 €)", detail: "Émise le 12 décembre.", valeur: "96,00 €", montant: 96 },
    ],
  },
  avis: {
    espace: null, avant: null, faits: null,
    elements: [{ id: "avis", titre: "Votre avis sur votre déménagement", court: "votre avis", detail: "Il ne vous prendra qu'une minute.", valeur: null }],
  },
};
