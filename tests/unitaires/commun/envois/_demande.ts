import type { RequestRow } from "@/lib/types";

/** Une demande du site, complète, à compléter ou à abîmer champ par champ. */
export function demande(champs: Partial<RequestRow> = {}): RequestRow {
  return {
    id: "8d0c4a8e-1111-4222-8333-444455556666", source: "form", status: "new",
    client_nom: "Claire Dumont", client_email: "claire@gmail.com", client_tel: "06 12 34 56 78",
    depart_adresse: "12 rue de la Paix", depart_code_postal: "75002", depart_ville: "Paris", depart_etage: 3, depart_ascenseur: true,
    arrivee_adresse: "4 place Bellecour", arrivee_code_postal: "69002", arrivee_ville: "Lyon", arrivee_etage: 0, arrivee_ascenseur: false,
    date_souhaitee: "2026-12-05", flexibilite: null, volume_m3: 32, volume_method: "list",
    type_logement_depart: "appartement", type_logement_arrivee: "maison", distance_km: 465.4, formule: "standard", services: {},
    estimation_prix: null, grid_id: null, score_potentiel: null, score_difficulte: null, score_notes: null, completion_token: null,
    raw_payload: {}, created_at: "2026-11-15T09:00:00Z", updated_at: "2026-11-15T09:00:00Z",
    ...champs,
  } as RequestRow;
}
