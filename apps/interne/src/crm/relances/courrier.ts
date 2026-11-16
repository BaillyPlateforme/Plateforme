import { listeDemandes } from "@/lib/email-layout";
import { euros } from "@/lib/espace-client/format";
import { JETON_BLOC, remplir, type BlocEmail } from "@/crm/messages/rendu";
import { RELANCE_ESPACE, RELANCES, type Canal, type DemandeRelance, type ElementRelance, type TypeCourrier } from "./regles";

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
export const TEXTES_BLOC: Record<TypeCourrier, TexteBloc> = {
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
  // « Ce qui manque » : chaque point a son lien (sa page de l'espace), et le bouton ouvre l'espace.
  espace: {
    surtitre: () => "Votre espace client",
    titre: (n) => (n > 1 ? `Il vous reste ${n} étapes` : "Il vous reste une étape"),
    mot: "à faire",
    intro: (_n, lien) => (lien ? "Tout se fait en ligne, en quelques minutes, depuis votre espace client." : null),
    action: "Ouvrir mon espace client",
    lienElement: "Ouvrir",
    echeance: (jour) => `À faire avant votre déménagement du ${jour}`,
    note: NOTE,
  },
};

/** Le type de relance dont une carte de « Courriers et SMS » porte le texte, s'il y en a un. */
export function typeDeCarte(cle: string): TypeCourrier | null {
  for (const d of [...RELANCES, RELANCE_ESPACE]) if (Object.values(d.cartes).includes(cle)) return d.type;
  return null;
}

/** Les éléments retenus : ceux cochés (dans l'ordre de la relance), ou tous quand rien n'est précisé. */
export function elementsChoisis(demande: Pick<DemandeRelance, "elements">, choix: readonly string[] | null | undefined) {
  return choix ? demande.elements.filter((e) => choix.includes(e.id)) : demande.elements;
}

/** Le bloc de la relance : en HTML pour l'e-mail, en liste pour le texte brut. */
export function blocRelance(type: TypeCourrier, demande: DemandeRelance, choisis: ElementRelance[], liens: LiensRelance): BlocEmail {
  const t = TEXTES_BLOC[type];
  const n = choisis.length;
  // Plusieurs devis : un lien chacun, pas de bouton commun. Un seul : le bouton mène au sien.
  // « Ce qui manque » : chaque point mène à sa page, le bouton à l'espace.
  const parElement = (type === "devis" && n > 1) || type === "espace";
  const principal = type === "devis" ? (n === 1 ? (liens.parElement[choisis[0].id] ?? null) : null) : liens.principal;
  const total = type === "solde" && n > 1 ? euros(choisis.reduce((s, e) => s + (e.montant ?? 0), 0)) : null;
  const echeance = t.echeance && demande.avant ? t.echeance(jourLong(demande.avant)) : null;
  const faits = (type === "pieces" || type === "espace") && demande.faits && demande.faits.n > 0 ? demande.faits : null;
  const unite = type === "pieces" ? ["document", "reçu"] : ["étape", "faite"];
  const progression = faits
    ? { n: faits.n, sur: faits.sur, texte: `${faits.n} ${unite[0]}${faits.n > 1 ? "s" : ""} sur ${faits.sur} déjà ${unite[1]}${faits.n > 1 ? "s" : ""} : merci !` }
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
      lien: parElement && liens.parElement[e.id] ? { url: liens.parElement[e.id], libelle: (type === "espace" ? e.action : null) ?? t.lienElement ?? "Voir" } : null,
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
          parElement && liens.parElement[e.id] ? `  ${(type === "espace" ? e.action : null) ?? t.lienElement} : ${liens.parElement[e.id]}` : null,
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
export function varsRelance(type: TypeCourrier, base: Record<string, string>, choisis: ElementRelance[]): Record<string, string> {
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
  // « Ce qui manque » (fiche de l'espace client), 08/11/2026.
  relance_espace: {
    objet: "Votre espace client : quelques étapes à terminer",
    corps: "Bonjour {client},\n\nPour préparer votre déménagement dans les meilleures conditions, il vous reste quelques étapes à faire dans votre espace client.\n\n{elements}\n\nMerci d'avance,\n{commercial}",
  },
  relance_espace_sms: { objet: null, corps: "Bailly Déménagement : il vous reste quelques étapes dans votre espace client ({elements}). Merci !" },
};

/*
 * « Personnaliser » : l'équipe modifie le texte de CET envoi tel que le
 * client le lira — variables remplies (« Bonjour Madame Dupont »). Seule la
 * liste reste vivante : une ligne « [Ce que nous vous demandons] » marque sa
 * place, et ce sont les cases cochées qui la remplissent. À l'envoi, la
 * marque redevient {elements}, le reste part tel quel.
 */
export const MARQUE_LISTE = "[Ce que nous vous demandons]";

/** Le texte d'une carte tel que le client le lit, la liste marquée là où l'e-mail la posera. */
export function texteLisible(corps: string, vars: Record<string, string>, canal: Canal): string {
  const paras = corps.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  // Sans {elements}, l'e-mail pose la liste avant la signature (rendu.ts) : la marque le montre.
  if (canal === "email" && !/\{elements\}/i.test(corps)) paras.splice(paras.length >= 3 ? paras.length - 1 : paras.length, 0, JETON_BLOC);
  const { elements: _liste, ...autres } = vars;
  void _liste;
  return paras.map((p) => remplir(p.replace(/\{elements\}/gi, MARQUE_LISTE), autres)).join("\n\n");
}

/** Le texte de cet envoi, à composer comme une carte : la marque redevient {elements}. */
export const texteAEnvoyer = (lisible: string) => lisible.split(MARQUE_LISTE).join("{elements}");

/**
 * Le texte personnalisé, rendu à ses variables pour devenir le texte de la
 * carte (« Enregistrer aussi comme texte de la carte »). Refusé dès que le
 * retour n'est pas sûr : une valeur qui figure en toutes lettres dans le
 * texte d'origine, ou que l'équipe a écrite une fois de plus (impossible de
 * savoir laquelle est la variable), ou deux valeurs qui se recoupent.
 */
export function versTexteCarte(
  perso: { objet: string | null; corps: string },
  origine: { objet: string | null; corps: string },
  vars: Record<string, string>,
  variables: string[],
  canal: Canal,
): { ok: true; objet: string | null; corps: string } | { ok: false; raison: string } {
  const valeurs = variables
    .filter((k) => k !== "elements")
    .map((k) => ({ k, v: (vars[k] ?? "").trim() }))
    .filter((x) => x.v.length >= 3)
    .sort((a, b) => b.v.length - a.v.length);
  for (const a of valeurs) {
    for (const b of valeurs) if (a !== b && a.v.includes(b.v)) return { ok: false, raison: `{${a.k}} et {${b.k}} ont des valeurs qui se recoupent (« ${b.v} »).` };
  }
  const compter = (texte: string, v: string) => texte.split(v).length - 1;
  // Le texte d'origine tel que l'éditeur le présente (PanneauEnvoi) : objet REMPLI compris. Compté brut, une
  // variable de l'objet (« Votre règlement de {montant} … ») semblerait écrite une fois de trop.
  const { elements: _liste, ...autres } = vars;
  void _liste;
  const lisibleOrigine = [origine.objet ? remplir(origine.objet, autres) : "", texteLisible(origine.corps, vars, canal)].join("\n");
  const brutOrigine = [origine.objet ?? "", origine.corps].join("\n");
  const tout = [perso.objet ?? "", perso.corps].join("\n");
  for (const { k, v } of valeurs) {
    if (compter(brutOrigine, v) > 0) return { ok: false, raison: `« ${v} » figure en toutes lettres dans le texte d'origine : impossible de savoir où mettre {${k}}.` };
    if (compter(tout, v) > compter(lisibleOrigine, v)) return { ok: false, raison: `« ${v} » apparaît plus souvent que dans le texte d'origine : impossible de savoir lequel est la variable {${k}}.` };
  }
  const inconnue = [...tout.matchAll(/\{([a-z_]+)\}/gi)].map((x) => x[1]).find((v) => !variables.includes(v));
  if (inconnue) return { ok: false, raison: `{${inconnue}} n'est pas une variable de cette carte.` };
  const rendre = (t: string) => texteAEnvoyer(valeurs.reduce((s, { k, v }) => s.split(v).join(`{${k}}`), t));
  return { ok: true, objet: perso.objet == null ? null : rendre(perso.objet), corps: rendre(perso.corps) };
}

/** Des relances d'exemple, pour l'aperçu d'une carte dans « Courriers et SMS ». */
export const EXEMPLES: Record<TypeCourrier, DemandeRelance> = {
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
  espace: {
    espace: "BD-2026-0001", avant: "2026-12-12", faits: { n: 3, sur: 8 },
    elements: [
      { id: "point:conditions", titre: "Complétez vos conditions de livraison", court: "conditions de livraison", detail: "Étage, ascenseur, stationnement… 4 minutes pour que le jour J se passe sans surprise. Cette étape est obligatoire.", valeur: "Obligatoire", chemin: "documents#conditions", action: "Compléter le questionnaire" },
      { id: "point:cgv", titre: "Acceptez les CGV et la politique RGPD", court: "CGV et RGPD", detail: "Une case à cocher, horodatée : pas besoin d'imprimer ni de signer.", valeur: null, chemin: "documents#cgv", action: "Accepter en ligne" },
      { id: "point:pieces", titre: "Déposez les pièces demandées", court: "pièces à fournir", detail: "Il reste : Justificatif de domicile. En PDF ou en photo, depuis « Mes documents ».", valeur: null, chemin: "documents#pieces", action: "Déposer mes pièces" },
      { id: "point:valeurs", titre: "Remplissez votre déclaration de valeurs", court: "déclaration de valeurs", detail: "Elle détermine la couverture de votre assurance. Le total se calcule tout seul.", valeur: null, chemin: "documents#valeurs", action: "Remplir ma déclaration" },
    ],
  },
};
