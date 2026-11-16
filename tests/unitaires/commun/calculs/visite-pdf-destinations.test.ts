import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ContenuCompteRendu } from "@/lib/visite/regles";

/*
 * Le PDF du compte-rendu signé (retours de Céline, 16/11/2026) : avec la
 * taille de l'ascenseur, les cases libres des accès, la destination de chaque
 * objet et le volume par destination, il se produit comme avant.
 */

const contenu = (o: Partial<ContenuCompteRendu> = {}): ContenuCompteRendu => ({
  version: 1,
  dossier: { ref: "BD-2026-0001", client: "Martin", contact: null, telephone: null, email: null },
  visite: { id: 1, le: "2026-11-17T09:00:00Z", commercial: "Paul", mode: "sur_place" },
  trajet: [
    {
      genre: "depart", libelle: "Départ", adresse: "1 rue X, Paris", etage: "3", ascenseur: true, ascenseur_taille: "4", escalier: "droit",
      escalier_precision: "Marches abîmées", portage_m: null, stationnement: "autorisation", stationnement_precision: "Marché le jeudi",
      poids_lourd: null, monte_meuble: null, monte_charge: false, transbordement: false, acces: null,
    },
  ],
  pieces: [
    {
      cle: "p1", nom: "Salon", remarque: null, volume: 4.1, photos: 0,
      objets: [
        { libelle: "Canapé", quantite: 1, volume_unitaire: 2.5, volume: 2.5, demontage: false, fragile: false, note: null, destination: "Arrivée · Paris" },
        { libelle: "Buffet", quantite: 2, volume_unitaire: 0.8, volume: 1.6, demontage: true, fragile: false, note: "Plateau en verre", destination: "Garde-meuble" },
      ],
    },
  ],
  destinations: [
    { libelle: "Garde-meuble", volume: 1.6, objets: 2 },
    { libelle: "Arrivée · Paris", volume: 2.5, objets: 1 },
  ],
  volume: 4.1,
  nb_objets: 3,
  nb_photos: 0,
  options: [],
  formule: null,
  remarques: null,
  ...o,
});

/** Un tracé de signature : une image PNG d'un pixel. */
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const signature = { signataire: "Jean Martin", signeLe: "2026-11-17T10:00:00Z", empreinte: "a".repeat(64), image: PNG_1PX };

describe("pdfCompteRendu — destinations et accès du 16/11/2026", () => {
  // Les polices du PDF se lisent dans public/ de l'app qui le produit, dès le chargement du module.
  const ici = process.cwd();
  let pdfCompteRendu: typeof import("@/lib/visite/pdf").pdfCompteRendu;
  beforeAll(async () => {
    process.chdir(path.resolve(ici, "../apps/interne"));
    ({ pdfCompteRendu } = await import("@/lib/visite/pdf"));
  });
  afterAll(() => process.chdir(ici));

  it("produit un PDF avec le volume par destination, et sans (une seule destination)", async () => {
    const avec = await pdfCompteRendu(contenu(), signature);
    expect(avec.subarray(0, 5).toString()).toBe("%PDF-");
    const sans = await pdfCompteRendu(contenu({ destinations: undefined }), signature);
    expect(sans.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);
});
