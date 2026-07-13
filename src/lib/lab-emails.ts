// Templates de mails pour le Lab (tests bout-en-bout). Client-safe.

export type LabCategory = "devis" | "autre";

export interface LabTemplate {
  id: string;
  name: string;
  category: LabCategory;
  tag: string;
  from: string;
  subject: string;
  text: string;
}

export const LAB_TEMPLATES: LabTemplate[] = [
  // ---------- Demandes de devis complètes ----------
  {
    id: "devis-complet-1",
    name: "Devis complet — T3 Lyon→Toulouse",
    category: "devis",
    tag: "complet",
    from: "camille.durand@email.fr",
    subject: "Demande de devis déménagement",
    text: `Bonjour,

Je souhaite un devis pour mon déménagement. Je quitte un T3 à Lyon (69003) pour un appartement à Toulouse. Le volume est d'environ 30 m³.
Vous pouvez me joindre au 06 12 34 56 78.

Merci d'avance,
Camille Durand`,
  },
  {
    id: "devis-complet-2",
    name: "Devis complet — Maison Nantes→Rennes",
    category: "devis",
    tag: "complet",
    from: "famille.leroy@email.fr",
    subject: "Déménagement maison en septembre",
    text: `Bonjour,

Nous déménageons notre maison de Nantes vers Rennes courant septembre. Il y a environ 55 m³ à déménager (maison de 5 pièces).
Contact : Marc Leroy, 07 88 55 44 33.

Cordialement`,
  },
  // ---------- Demandes SANS volume ----------
  {
    id: "devis-sans-volume-1",
    name: "Sans volume — Paris→Bordeaux",
    category: "devis",
    tag: "sans volume",
    from: "julien.petit@email.fr",
    subject: "Devis déménagement Paris Bordeaux",
    text: `Bonjour,

Je déménage de Paris à Bordeaux le mois prochain. Pouvez-vous me faire un devis ?
Mon numéro : 06 45 67 89 10.

Julien Petit`,
  },
  {
    id: "devis-sans-volume-2",
    name: "Sans volume — vague",
    category: "devis",
    tag: "sans volume",
    from: "sophie.martin@email.fr",
    subject: "Projet de déménagement",
    text: `Bonjour,
Je prépare mon déménagement de Lille vers Strasbourg. Combien cela coûterait environ ?
Merci, Sophie`,
  },
  // ---------- Demandes SANS adresse ----------
  {
    id: "devis-sans-adresse-1",
    name: "Sans ville d'arrivée",
    category: "devis",
    tag: "sans adresse",
    from: "kevin.moreau@email.fr",
    subject: "Besoin d'un devis",
    text: `Bonjour,
Je pars de Marseille, j'ai à peu près 20 m³ à déménager. Je ne sais pas encore exactement où j'arrive (région parisienne).
Pouvez-vous m'aider ? Kevin, 06 33 22 11 00.`,
  },
  {
    id: "devis-sans-adresse-2",
    name: "Sans ville de départ",
    category: "devis",
    tag: "sans adresse",
    from: "nadia.benali@email.fr",
    subject: "Déménagement vers Lyon",
    text: `Bonjour,
Je viens habiter à Lyon, environ 15 m³ (studio). Merci de me recontacter.
Nadia`,
  },
  // ---------- Entreprise / cas particuliers ----------
  {
    id: "devis-entreprise",
    name: "Entreprise — bureaux",
    category: "devis",
    tag: "entreprise",
    from: "contact@techsolutions.fr",
    subject: "Transfert de nos bureaux",
    text: `Bonjour,
Notre société TechSolutions transfère ses bureaux de Lyon Part-Dieu vers Villeurbanne. Environ 40 m³ de mobilier de bureau.
Merci de nous adresser une proposition. Service généraux, 04 78 00 00 00.`,
  },
  {
    id: "devis-piano",
    name: "Objet lourd — piano",
    category: "devis",
    tag: "complet",
    from: "helene.girard@email.fr",
    subject: "Déménagement avec piano",
    text: `Bonjour,
Déménagement d'un T2 (18 m³) de Nice à Cannes, avec un piano droit à transporter. 3e étage sans ascenseur au départ.
Hélène Girard, 06 99 88 77 66.`,
  },
  {
    id: "devis-studio",
    name: "Petit — studio étudiant",
    category: "devis",
    tag: "complet",
    from: "lucas.bernard@email.fr",
    subject: "Petit déménagement étudiant",
    text: `Salut,
Je déménage mon studio (environ 8 m³) de Grenoble à Chambéry. Pas beaucoup d'affaires.
Lucas 06 12 00 34 56`,
  },

  // ---------- Mails "autres" (à qualifier / ignorer) ----------
  {
    id: "autre-newsletter",
    name: "Newsletter marketing",
    category: "autre",
    tag: "newsletter",
    from: "news@promo-shopping.com",
    subject: "🔥 -50% ce week-end seulement !",
    text: `Ne manquez pas nos soldes exceptionnelles ! Jusqu'à -50% sur toute la boutique. Cliquez vite avant la fin du stock.
Se désabonner.`,
  },
  {
    id: "autre-spam",
    name: "Spam / arnaque",
    category: "autre",
    tag: "spam",
    from: "winner@lottery-intl.biz",
    subject: "You have WON $1,000,000",
    text: `Congratulations! Your email was selected. Send your bank details to claim your prize immediately.`,
  },
  {
    id: "autre-facture",
    name: "Facture fournisseur",
    category: "autre",
    tag: "fournisseur",
    from: "comptabilite@carburant-pro.fr",
    subject: "Facture n°2026-0042",
    text: `Bonjour,
Veuillez trouver ci-joint la facture de carburant du mois. Montant : 842,50 € TTC. Règlement à 30 jours.
Cordialement, le service comptabilité.`,
  },
  {
    id: "autre-question",
    name: "Question sans rapport",
    category: "autre",
    tag: "divers",
    from: "curieux@email.fr",
    subject: "Vous faites aussi le nettoyage ?",
    text: `Bonjour, est-ce que votre entreprise propose des services de ménage à domicile ? Merci.`,
  },
  {
    id: "autre-candidature",
    name: "Candidature spontanée",
    category: "autre",
    tag: "RH",
    from: "jean.dupuis@email.fr",
    subject: "Candidature déménageur",
    text: `Bonjour,
Je me permets de vous adresser ma candidature au poste de déménageur. Vous trouverez mon CV en pièce jointe.
Cordialement, Jean Dupuis.`,
  },
  {
    id: "autre-partenariat",
    name: "Démarchage commercial",
    category: "autre",
    tag: "démarchage",
    from: "sales@refonte-seo.io",
    subject: "Améliorez votre référencement Google",
    text: `Bonjour, nous pouvons faire remonter votre site en 1ère page de Google. Seriez-vous disponible pour un appel de 15 min cette semaine ?`,
  },
];
