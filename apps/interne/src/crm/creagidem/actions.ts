"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/crm/lib/auth";
import { journaliser } from "@/crm/lib/journal";
import { transmettreACreagidem } from "@/lib/creagidem";

/**
 * « Envoyer dans Créagidem », sur la page d'une demande : prépare la fiche et
 * l'envoie si le garde-fou le permet (lib/creagidem) — en dev, jamais. Sert
 * aussi à renvoyer une fiche refusée ou déjà envoyée.
 */
export async function envoyerDansCreagidem(requestId: string) {
  const u = await currentUser();
  const ev = await transmettreACreagidem(requestId, { origine: "manuel", par: u.nom });
  if (ev) {
    const libelle =
      ev.statut === "envoyee" ? "Demande envoyée dans Créagidem" : ev.statut === "echec" ? "Envoi dans Créagidem refusé" : "Fiche Créagidem préparée (non envoyée)";
    await journaliser({ action: `creagidem.${ev.statut}`, libelle, objet: { type: "demande", id: requestId }, requestId, details: { statut: ev.statut, motif: ev.motif, environnement: ev.environnement } }).catch(() => undefined);
  }
  revalidatePath(`/dashboard/${requestId}`);
}
