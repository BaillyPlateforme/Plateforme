import "server-only";
import { eur, m3, photoPour, STATUTS, TYPES } from "@/crm/lib/format";
import { ville } from "@/crm/kanban/regles";
import { resumesParcours } from "./donnees";
import { resume } from "./etapes";
import type { CarteDossier } from "./PanneauDossiers";

/** Les vues de la bande des dossiers. */
export const VUES_PANNEAU = [
  { cle: "", label: "En cours" },
  { cle: "termines", label: "Terminés" },
  { cle: "perdus", label: "Perdus" },
  { cle: "tous", label: "Tous" },
];

/** Les cartes de la bande : les dossiers de la vue, avec la photo de leur destination. */
export async function cartesPanneau(vue: string): Promise<CarteDossier[]> {
  const liste = await resumesParcours({ vue });
  return liste.map((x) => ({
    id: x.id,
    ref: x.ref,
    client: x.client,
    segment: TYPES[x.segment] ?? x.segment,
    statut: x.statut,
    statutLabel: STATUTS[x.statut]?.label ?? x.statut,
    trajet: `${ville(x.depart) ?? "Départ ?"} → ${ville(x.arrivee) ?? "Arrivée ?"}`,
    volume: x.volume > 0 ? m3(x.volume) : null,
    montant: x.montant != null ? eur(x.montant) : null,
    initiales: x.initiales,
    photo: photoPour(ville(x.arrivee), x.id),
    etapes: x.etapes.map((e) => ({ label: e.label, etat: e.etat })),
    enCours: x.statut === "perdu" ? "perdu" : resume(x.etapes).etape || "—",
  }));
}
