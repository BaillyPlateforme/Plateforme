/*
 * Les textes que le client accepte. Chaque acceptation enregistre la version
 * exacte qu'il a lue : toute modification d'un texte impose donc une nouvelle
 * version, sans quoi on ne saurait plus ce qui a été accepté.
 *
 * Contenus provisoires, repris de la v0 : les textes définitifs (CGV, politique
 * de confidentialité, procédure SAV) sont à fournir par Bailly.
 */

export const VERSIONS = {
  cgv: "CGV-2026.1",
  // 2026.2 : ajout de « Mesure d'ouverture des e-mails » (suivi des e-mails, lib/suivi-envois) — texte à valider par Bailly.
  rgpd: "RGPD-2026.2",
  conditions_livraison: "COND-LIV-2026.1",
  declaration_valeurs: "DECL-VAL-2026.1",
} as const;

export const CGV = [
  { titre: "Article 1 — Objet", texte: "Les présentes conditions régissent les prestations de déménagement, de garde-meubles et les services associés proposés par Bailly Déménagement aux particuliers et aux entreprises." },
  { titre: "Article 2 — Devis et commande", texte: "Le devis détaille le volume, les prestations et le prix. La commande est ferme à l'acceptation du devis et, pour les particuliers, au versement des arrhes." },
  { titre: "Article 3 — Obligations du client", texte: "Le client déclare les conditions d'accès au chargement et à la livraison. Toute contrainte non signalée (étage, stationnement, rue étroite…) peut entraîner un supplément ou un report." },
  { titre: "Article 4 — Déclaration de valeurs", texte: "La déclaration de valeurs fixe la limite d'indemnisation en cas de perte ou d'avarie. Elle est obligatoire avant le chargement." },
  { titre: "Article 5 — Réserves et réclamations", texte: "Les réserves sont portées sur la lettre de voiture le jour de la livraison. À défaut, le client dispose d'un délai légal pour adresser une réclamation motivée." },
  { titre: "Article 6 — Paiement", texte: "Le solde est exigible avant le déchargement, sauf conditions particulières. Les paiements en ligne sont traités par un prestataire agréé ; Bailly Déménagement ne conserve aucune donnée bancaire." },
];

export const RGPD = [
  { titre: "Responsable du traitement", texte: "Bailly Déménagement traite vos données pour organiser votre déménagement, gérer votre espace client et respecter ses obligations légales." },
  { titre: "Données traitées", texte: "Identité, coordonnées, adresses, informations d'accès, documents déposés, déclaration de valeurs, historique des paiements (sans données bancaires)." },
  { titre: "Durée de conservation", texte: "Les données du dossier sont conservées pendant la durée de la relation puis archivées selon les délais légaux." },
  // À VALIDER par Bailly (et son conseil) : la mention du suivi des e-mails (lib/suivi-envois), ajoutée en novembre 2026.
  {
    titre: "Mesure d'ouverture des e-mails",
    texte:
      "Les e-mails que nous vous envoyons au sujet de votre dossier contiennent une image invisible et des liens qui nous indiquent s'ils ont été ouverts et quels liens ont été suivis, ainsi que les pages de votre espace client consultées. Nous l'utilisons uniquement pour le suivi de votre dossier, sans conserver votre adresse IP, et ces informations sont effacées au bout de 13 mois. Bloquer l'affichage des images dans votre messagerie suffit à empêcher la mesure d'ouverture.",
  },
  { titre: "Vos droits", texte: "Vous pouvez demander l'accès, la rectification, l'effacement ou la portabilité de vos données en écrivant à votre conseiller." },
];

export const TEXTE_CERTIFICATION_LIVRAISON =
  "Je certifie l'exactitude de ces informations et m'engage à signaler toute modification à Bailly Déménagement avant le jour de la livraison.";

export const TEXTE_CERTIFICATION_VALEURS =
  "Je certifie sincère et véritable la présente déclaration de valeurs, qui fixe la limite d'indemnisation en cas de sinistre.";

/** Les deux parcours du SAV. Texte provisoire, à faire valider par Bailly (atelier SAV prévu au devis). */
export const PARCOURS_SAV = {
  avec: {
    titre: "Oui, j'ai émis des réserves",
    aide: "Elles figurent sur la lettre de voiture signée avec le chef d'équipe.",
    etapes: [
      ["Confirmez vos réserves", "Elles figurent déjà sur la lettre de voiture : elles font foi."],
      ["Ajoutez vos photos", "Une vue d'ensemble et un gros plan du dommage."],
      ["Votre conseiller vous recontacte", "Il ouvre le dossier et vous propose réparation ou indemnisation."],
    ],
  },
  sans: {
    titre: "Non, je l'ai découvert après",
    aide: "En déballant, quelques jours après la livraison.",
    etapes: [
      ["Déclarez le dommage sans attendre", "Le délai de réclamation court depuis la livraison : ce formulaire fait foi de la date."],
      ["Décrivez et photographiez", "L'objet concerné, la nature du dommage, les circonstances de la découverte."],
      ["Expertise éventuelle", "Selon la valeur déclarée, un expert peut être mandaté."],
    ],
  },
} as const;
