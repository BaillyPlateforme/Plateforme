/** Titre et sous-titre de chaque écran : la barre du haut les porte désormais. */
export const META: Record<string, { titre: string; sous?: string }> = {
  "/dashboard": { titre: "Demandes", sous: "Tout ce qui arrive, du formulaire comme des mails" },
  "/dashboard/tableau-de-bord": { titre: "Tableau de bord", sous: "L'activité en un coup d'œil" },
  "/dashboard/devis": { titre: "Devis", sous: "Chiffrages établis et envoyés" },
  "/dashboard/clients": { titre: "Clients", sous: "Historique par adresse e-mail" },
  "/dashboard/agenda": { titre: "Agenda", sous: "Interventions et disponibilités" },
  "/dashboard/statistiques": { titre: "Statistiques", sous: "Analyse complète du flux de demandes" },
  "/dashboard/simulateur": { titre: "Simulateur de chiffrage", sous: "Le moteur qui chiffre les demandes, en direct" },
  "/dashboard/campagne": {
    titre: "Campagne de test",
    sous: "Tirer des devis au hasard et vérifier ce que la grille produit",
  },
  "/dashboard/messagerie": { titre: "Messagerie", sous: "Mails entrants rattachés aux demandes" },
  "/dashboard/workflow": { titre: "Workflow", sous: "Le parcours d'une demande, étape par étape" },
  "/dashboard/playground": { titre: "Playground & Lab", sous: "Analyse d'image et chaîne complète, en test" },
  "/dashboard/equipe": { titre: "Équipe", sous: "Profils et accès" },
  "/dashboard/configuration": { titre: "Configuration", sous: "Grille, photos, analyse d'image, qualification" },
  "/dashboard/parametres": { titre: "Paramètres", sous: "Entreprise, devis, envois" },
};

export function metaDe(pathname: string): { titre: string; sous?: string } {
  if (META[pathname]) return META[pathname];
  if (pathname.startsWith("/dashboard/clients/")) return { titre: "Client", sous: "Historique et devis" };
  if (/^\/dashboard\/[0-9a-f-]{8,}/.test(pathname)) return { titre: "Demande", sous: "Fiche complète" };
  const cle = Object.keys(META).find((k) => k !== "/dashboard" && pathname.startsWith(k));
  return cle ? META[cle] : META["/dashboard"];
}
