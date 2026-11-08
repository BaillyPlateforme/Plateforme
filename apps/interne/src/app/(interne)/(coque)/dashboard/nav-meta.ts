/** Les pages de l'espace client vu de l'équipe, et leur titre. */
const PAGES_ESPACE: Record<string, string> = {
  "/dashboard/espace-client/nouveau": "Ouvrir un espace",
  "/dashboard/espace-client/cartons": "Cartons du samedi",
  "/dashboard/espace-client/sav": "SAV",
  "/dashboard/espace-client/destinations": "Pièces à fournir",
  "/dashboard/espace-client/journal": "Journal des messages",
  "/dashboard/espace-client/reglages": "Réglages de l'espace client",
};

/** Titre et sous-titre de chaque écran : la barre du haut les porte désormais. */
export const META: Record<string, { titre: string; sous?: string }> = {
  "/dashboard": { titre: "Demandes", sous: "Tout ce qui arrive, du formulaire comme des mails" },
  "/dashboard/espace-client": { titre: "Espace client", sous: "Les dossiers de vos clients, de la visite au SAV" },
  "/dashboard/espaces-pro": { titre: "Espaces pro", sous: "Un lien et un parcours par entreprise" },
  "/dashboard/rappels": { titre: "Rappels", sous: "Les clients qui demandent qu'on les rappelle" },
  "/dashboard/simulateur": { titre: "Simulateur de chiffrage", sous: "Le moteur qui chiffre les demandes, en direct" },
  "/dashboard/campagne": {
    titre: "Campagne de test",
    sous: "Tirer des devis au hasard et vérifier ce que la grille produit",
  },
  "/dashboard/playground": { titre: "Playground & Lab", sous: "Analyse d'image et chaîne complète, en test" },
  "/dashboard/equipe": { titre: "Équipe", sous: "Profils et accès" },
  "/dashboard/configuration": { titre: "Configuration", sous: "Grille, photos, analyse d'image, qualification" },
  "/dashboard/parametres": { titre: "Paramètres", sous: "Entreprise, devis, envois" },
  "/dashboard/envois": { titre: "Envois et veille", sous: "Ce qui part vraiment, et la tâche de la veille" },
};

export function metaDe(pathname: string): { titre: string; sous?: string } {
  if (META[pathname]) return META[pathname];
  // Les pages de l'espace client (cartons, SAV, pièces…) : leur propre titre plutôt que « Espace client »
  // partout ; la phrase reste celle de la section.
  const ec = Object.keys(PAGES_ESPACE).find((k) => pathname.startsWith(k));
  if (ec) return { titre: PAGES_ESPACE[ec], sous: META["/dashboard/espace-client"].sous };
  if (pathname.startsWith("/dashboard/clients/")) return { titre: "Client", sous: "Historique et devis" };
  if (/^\/dashboard\/[0-9a-f-]{8,}/.test(pathname)) return { titre: "Demande", sous: "Fiche complète" };
  const cle = Object.keys(META).find((k) => k !== "/dashboard" && pathname.startsWith(k));
  return cle ? META[cle] : META["/dashboard"];
}
