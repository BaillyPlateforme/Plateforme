import "server-only";
import { currentUser } from "@/crm/lib/auth";
import { activiteRecente, aPlanifier, relancesDevis } from "@/crm/lib/data";
import { gmEnRetard } from "@/crm/lib/data2";
import { ilYa, nomClient } from "@/crm/lib/format";
import { compterNouvelles } from "@/lib/requests";
import { alertesRdv } from "@/crm/rdv/sms";
import { enAttenteDeReponse } from "@/crm/discussion/donnees";
import { membreConnecte } from "@/lib/droits";
import { lireMasques } from "@/crm/onglets/donnees";
import { masquesPour, roleMenu } from "@/crm/onglets/regles";
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

export async function contexteCoque(): Promise<{ utilisateur: Utilisateur; alertes: Alerte[]; nouvelles: number; masques: string[] }> {
  const user = await currentUser();
  const [activite, relances, aPlanifierListe, gardeMeuble, nouvelles, rdvSms, messagesClients, membre, lignesMasquees] = await Promise.all([
    activiteRecente(8),
    relancesDevis(),
    aPlanifier(),
    gmEnRetard(),
    compterNouvelles().catch(() => 0),
    // Les réponses aux SMS de rendez-vous : annulé par le client, ou sans réponse la veille (src/crm/rdv).
    alertesRdv(),
    // Les messages des clients sans réponse, écrits depuis leur espace (src/crm/discussion).
    enAttenteDeReponse(),
    // Les onglets du menu masqués pour le rôle du membre (src/crm/onglets) ; le super admin voit tout.
    membreConnecte().catch(() => null),
    lireMasques(),
  ]);
  const alertes: Alerte[] = [
    ...rdvSms.map((a) => ({ ...a, aFaire: true })),
    ...messagesClients.map((c) => ({
      id: `m${c.dossierId}`,
      aFaire: true,
      titre: `${c.nonLus > 1 ? `${c.nonLus} messages` : "Message"} de ${c.client}`,
      sous: c.extrait ? `« ${c.extrait.slice(0, 80)}${c.extrait.length > 80 ? "…" : ""} »` : `Espace client · ${c.reference}`,
      quand: c.dernierLe ? ilYa(c.dernierLe) : undefined,
      href: `/dashboard/espace-client/messages?dossier=${c.dossierId}`,
    })),
    ...(nouvelles > 0
      ? [{ id: "site", aFaire: true, titre: `${nouvelles} demande${nouvelles > 1 ? "s" : ""} du site à ouvrir`, sous: "Venues des questionnaires", href: "/demandes?vue=liste&statut=new" }]
      : []),
    ...gardeMeuble.map((g) => ({
      id: `g${g.id}`,
      aFaire: true,
      titre: `Garde-meuble non facturé : ${g.client}`,
      sous: `Échéance dépassée de ${g.retard} jours`,
      href: "/garde-meuble",
    })),
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
    masques: masquesPour(lignesMasquees, roleMenu(membre?.role)),
  };
}
