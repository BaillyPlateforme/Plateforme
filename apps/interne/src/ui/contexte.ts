import "server-only";
import { currentUser } from "@/crm/lib/auth";
import { activiteRecente, aPlanifier, relancesDevis } from "@/crm/lib/data";
import { ilYa, nomClient } from "@/crm/lib/format";
import { compterNouvelles } from "@/lib/requests";
import type { Alerte, Utilisateur } from "./Coque";

/*
 * Ce que la coque affiche, calculé côté serveur une fois par page : la fiche
 * de l'utilisateur, les notifications du CRM, le nombre de demandes du site
 * pas encore ouvertes. Les deux mises en page racines (CRM, sections) s'en
 * servent : la cloche et le menu disent la même chose partout.
 */
const ROLES: Record<string, string> = {
  direction: "Direction",
  commercial: "Commercial",
  exploitation: "Exploitation",
  compta: "Comptabilité",
};

export async function contexteCoque(): Promise<{ utilisateur: Utilisateur; alertes: Alerte[]; nouvelles: number }> {
  const user = await currentUser();
  const [activite, relances, aPlanifierListe, nouvelles] = await Promise.all([
    activiteRecente(8),
    relancesDevis(),
    aPlanifier(),
    compterNouvelles().catch(() => 0),
  ]);
  const alertes: Alerte[] = [
    ...(nouvelles > 0
      ? [{ id: "site", aFaire: true, titre: `${nouvelles} demande${nouvelles > 1 ? "s" : ""} du site à ouvrir`, sous: "Venues des questionnaires", href: "/dashboard?statut=new" }]
      : []),
    ...aPlanifierListe.map((r) => ({
      id: `p${r.id}`,
      aFaire: true,
      titre: `Planifier ${nomClient(r as never)}`,
      sous: "Devis signé : confirmer la date au planning",
      href: `/dossiers/${r.id}`,
    })),
    ...relances.map((r) => ({
      id: `r${r.id}`,
      aFaire: true,
      titre: `Relancer ${nomClient(r as never)}`,
      sous: `Devis envoyé il y a ${r.jours} jours, sans réponse`,
      href: `/dossiers/${r.id}`,
    })),
    ...activite.map((a, i) => ({
      id: `a${i}`,
      aFaire: false,
      titre: a.nom ? nomClient(a as never) : "Agence",
      sous: a.libelle,
      quand: ilYa(a.cree_le),
      href: a.dossier_id ? `/dossiers/${a.dossier_id}` : "/",
    })),
  ];
  return {
    utilisateur: { nom: user.nom, initiales: user.initiales, role: ROLES[user.role] ?? "Équipe" },
    alertes,
    nouvelles,
  };
}
