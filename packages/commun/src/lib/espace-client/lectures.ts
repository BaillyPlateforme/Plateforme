import "server-only";
import { TEL_AGENCE } from "@/lib/messaging";
import { requirementsApplicables, type DossierSnapshot } from "./progression";
import type { Conseiller, Donnees } from "./types";

/*
 * Les lectures du document de données. Celles qui servent au client ne
 * rendent QUE ce qui est rattaché à son dossier, et appliquent les masquages
 * des grands comptes avant de rendre la main : une page ne peut pas afficher
 * un devis qu'elle n'a jamais reçu. (En base, la RLS a déjà retenu ces
 * lignes-là ; ces filtres en sont la seconde vérification.)
 */

export function snapshotDe(d: Donnees, dossierId: string): DossierSnapshot | null {
  const dossier = d.dossiers.find((x) => x.id === dossierId);
  if (!dossier) return null;
  const client = d.clients.find((c) => c.id === dossier.client_id);
  if (!client) return null;
  const du = <T extends { dossier_id: string }>(lignes: T[]) => lignes.filter((l) => l.dossier_id === dossierId);
  return {
    client,
    dossier,
    devis: du(d.devis).sort((a, b) => b.emis_le.localeCompare(a.emis_le)),
    factures: du(d.factures).sort((a, b) => b.emise_le.localeCompare(a.emise_le)),
    documents: du(d.documents).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    requirements: requirementsApplicables(dossier, d.document_requirements),
    acceptations: du(d.acceptations),
    declaration: du(d.declarations_valeurs)[0] ?? null,
    conditions: du(d.conditions_livraison)[0] ?? null,
    livraisons: du(d.livraisons_cartons).sort((a, b) => b.date_samedi.localeCompare(a.date_samedi)),
    sav: du(d.sav_declarations).sort((a, b) => b.created_at.localeCompare(a.created_at)),
  };
}

/** Le dossier d'une référence, seulement s'il appartient à ce client ; masquages appliqués. */
export function snapshotClient(d: Donnees, clientId: string, reference: string): DossierSnapshot | null {
  const dossier = d.dossiers.find((x) => x.reference === reference && x.client_id === clientId);
  if (!dossier) return null;
  const s = snapshotDe(d, dossier.id);
  if (!s) return null;
  if (s.client.masquer_devis) s.devis = [];
  if (s.client.masquer_factures) s.factures = [];
  return s;
}

/** Les dossiers d'un client : le plus proche d'abord, les terminés à la fin. */
export function dossiersDuClient(d: Donnees, clientId: string) {
  return d.dossiers
    .filter((x) => x.client_id === clientId)
    .sort((a, b) => Number(a.statut === "termine") - Number(b.statut === "termine") || b.periode_debut.localeCompare(a.periode_debut));
}

export function conseillerDe(d: Donnees, conseillerId: string): Conseiller {
  return (
    d.conseillers.find((c) => c.id === conseillerId) ?? {
      id: "",
      prenom: "Service",
      nom: "clients",
      email: "",
      telephone: TEL_AGENCE,
      demo: false,
    }
  );
}

/** La signature des e-mails envoyés au nom du conseiller. */
export const signatureDe = (c: Conseiller) => ({ nom: `${c.prenom} ${c.nom}`, role: "Votre contact", telephone: c.telephone });
