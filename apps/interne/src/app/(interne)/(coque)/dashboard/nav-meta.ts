import { SECTIONS } from "@/crm/sections";

/** Titre et sous-titre de chaque écran : la barre du haut les porte désormais. */
export const META: Record<string, { titre: string; sous?: string }> = {
  "/dashboard": { titre: "Demandes", sous: "Tout ce qui arrive, du formulaire comme des mails" },
  "/dashboard/tableau-de-bord": { titre: "Tableau de bord", sous: "L'activité en un coup d'œil" },
  "/dashboard/leads": { titre: "Suivi des leads", sous: "Chaque demande du site, du premier contact au chiffre d'affaires" },
  "/dashboard/espace-client": { titre: "Espace client", sous: "Les dossiers de vos clients, de la visite au SAV" },
  "/dashboard/devis": { titre: "Devis", sous: "Chiffrages établis et envoyés" },
  "/dashboard/clients": { titre: "Clients", sous: "Historique par adresse e-mail" },
  "/dashboard/espaces-pro": { titre: "Espaces pro", sous: "Un lien et un parcours par entreprise" },
  "/dashboard/rappels": { titre: "Rappels", sous: "Les clients qui demandent qu'on les rappelle" },
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
  "/dashboard/envois": { titre: "Envois et veille", sous: "Ce qui part vraiment, et la tâche de la veille" },
};

export function metaDe(pathname: string): { titre: string; sous?: string } {
  if (META[pathname]) return META[pathname];
  // Les pages de l'espace client (cartons, SAV, pièces…) : le titre de leur onglet du menu, plutôt que
  // « Espace client » partout ; la phrase reste celle de la section.
  const onglet = SECTIONS[1].onglets.find((o) => o.href !== "/dashboard/espace-client" && pathname.startsWith(o.href));
  if (onglet) return { titre: onglet.label, sous: META["/dashboard/espace-client"].sous };
  if (pathname.startsWith("/dashboard/clients/")) return { titre: "Client", sous: "Historique et devis" };
  if (/^\/dashboard\/[0-9a-f-]{8,}/.test(pathname)) return { titre: "Demande", sous: "Fiche complète" };
  const cle = Object.keys(META).find((k) => k !== "/dashboard" && pathname.startsWith(k));
  return cle ? META[cle] : META["/dashboard"];
}
