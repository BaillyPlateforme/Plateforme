import "server-only";
import { q1 } from "@/crm/lib/db";

/*
 * Céline, 17/11/2026 : un client CIMOB/DICOM (clients.type = 'militaire') ne
 * reçoit jamais de devis — Bailly remplit le document Excel de son
 * administration, et le dossier passe en commande sans devis. La fiche du
 * dossier, le kanban et la page des devis le montrent ; ce garde le tient
 * côté serveur, dans chaque action qui crée ou envoie un devis, et dans
 * l'envoi de l'e-mail lui-même.
 */

export const MOTIF_CIMOB = "Dossier CIMOB/DICOM : pas de devis.";

/** Le dossier est-il celui d'un client CIMOB/DICOM ? */
export async function estDossierCimob(dossierId: number): Promise<boolean> {
  const r = await q1<{ cimob: boolean }>(
    "select c.type = 'militaire' as cimob from dossiers d join clients c on c.id = d.client_id where d.id = $1",
    [dossierId],
  );
  return !!r?.cimob;
}

/** Le dossier du devis, s'il est celui d'un client CIMOB/DICOM ; null sinon. */
export async function dossierCimobDuDevis(devisId: number): Promise<number | null> {
  const r = await q1<{ dossier_id: number; cimob: boolean }>(
    "select v.dossier_id, c.type = 'militaire' as cimob from devis v join dossiers d on d.id = v.dossier_id join clients c on c.id = d.client_id where v.id = $1",
    [devisId],
  );
  return r?.cimob ? r.dossier_id : null;
}
