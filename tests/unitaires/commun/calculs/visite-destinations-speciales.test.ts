import { describe, expect, it } from "vitest";
import {
  CLES_NON_TRANSPORTEES, DESTINATIONS_SPECIALES, bilanVolumes, choixDe, choixDuMenu, estTransporte, libelleDuChoix, patchDuChoix, specialeDuTexte,
  volumesParDestination,
} from "@/lib/visite/destinations";
import { designation } from "@/lib/visite/regles";

/*
 * Les destinations hors adresse de la tablette (Dragan Plavsic, 18/11/2026) :
 * à laisser sur place, débarras, pris en charge par le client, à confirmer —
 * et le volume transporté, distingué de ce qui ne l'est pas. Règles par
 * défaut, à valider : sur place et client hors du transporté ; débarras et
 * à confirmer dedans.
 */

const d = [
  { id: 4, genre: "garde_meuble", libelle: "Garde-meuble" },
  { id: 5, genre: "arrivee", libelle: "Arrivée · Lyon" },
  { id: 6, genre: "arrivee", libelle: "Arrivée · Paris" },
];

describe("les destinations hors adresse — les mots de Dragan", () => {
  it("quatre choix, dans l'ordre de son mail ; seuls « sur place » et « client » sortent du transporté", () => {
    expect(DESTINATIONS_SPECIALES.map((x) => x.libelle)).toEqual(["À laisser sur place", "Débarras", "Pris en charge par le client", "À confirmer"]);
    expect(CLES_NON_TRANSPORTEES).toEqual(["sur_place", "client"]);
  });

  it("le menu : les adresses du trajet (garde-meuble compris), puis les quatre", () => {
    expect(choixDuMenu(d).map((c) => c.libelle)).toEqual(["Garde-meuble", "Arrivée · Lyon", "Arrivée · Paris", "À laisser sur place", "Débarras", "Pris en charge par le client", "À confirmer"]);
    // Même sans aucune adresse au trajet, le menu existe.
    expect(choixDuMenu([]).map((c) => c.valeur)).toEqual(["s:sur_place", "s:debarras", "s:client", "s:a_confirmer"]);
  });

  it("choixDe, patchDuChoix, libelleDuChoix : l'une remplace l'autre", () => {
    expect(choixDe({ destination: 5 }, d)).toBe("e5");
    expect(choixDe({ destination: 5, speciale: "debarras" }, d)).toBe("s:debarras");
    expect(choixDe({ destination: 99 }, d)).toBeNull();
    expect(patchDuChoix("s:client", d)).toEqual({ destination: null, speciale: "client", destinationLibre: null });
    expect(patchDuChoix("e4", d)).toEqual({ destination: 4, speciale: null, destinationLibre: null });
    expect(patchDuChoix("e99", d)).toBeNull();
    expect(patchDuChoix("s:pirate", d)).toBeNull();
    expect(libelleDuChoix("s:sur_place", d)).toBe("À laisser sur place");
    expect(libelleDuChoix("e6", d)).toBe("Arrivée · Paris");
  });

  it("un libellé de la fiche retrouve sa clé (« à laisser sur place » → sur_place) ; « Don » n'en est pas une", () => {
    expect(specialeDuTexte("à laisser sur place")).toBe("sur_place");
    expect(specialeDuTexte(" Débarras ")).toBe("debarras");
    expect(specialeDuTexte("Don")).toBeNull();
    expect(specialeDuTexte(null)).toBeNull();
  });
});

describe("le volume transporté", () => {
  const objets = [
    { quantite: 4, volume: 0.2, destination: 5 }, // 0,8 à Lyon
    { quantite: 2, volume: 0.2, destination: 4 }, // 0,4 au garde-meuble
    { quantite: 1, volume: 0.8, speciale: "sur_place" as const }, // 0,8 laissé
    { quantite: 1, volume: 1.2, speciale: "debarras" as const }, // 1,2 emporté (débarras)
    { quantite: 1, volume: 0.5, speciale: "client" as const }, // 0,5 emporté par le client
    { quantite: 2, volume: 0.3, speciale: "a_confirmer" as const }, // 0,6 compté par prudence
    { quantite: 1, volume: 0.3, destination: null, destinationLibre: "Don" }, // une destination libre de la fiche : transportée, comme avant
  ];

  it("sur place et client hors du transporté ; débarras et à confirmer dedans, et montrés à part", () => {
    expect(bilanVolumes(objets)).toEqual({ releve: 4.6, transporte: 3.3, nonTransporte: 1.3, debarras: 1.2, aConfirmer: 0.6 });
    const b = bilanVolumes(objets);
    expect(b.transporte + b.nonTransporte).toBeCloseTo(b.releve, 5);
  });

  it("sans destination hors adresse, le transporté est tout l'inventaire, comme avant", () => {
    const b = bilanVolumes(objets.filter((o) => !("speciale" in o)));
    expect(b.transporte).toBe(b.releve);
    expect(b.nonTransporte).toBe(0);
  });

  it("estTransporte lit aussi une ligne de la fiche (destination_speciale)", () => {
    expect(estTransporte({ destination_speciale: "sur_place" })).toBe(false);
    expect(estTransporte({ destination_speciale: "debarras" })).toBe(true);
    expect(estTransporte({ destination_speciale: null })).toBe(true);
    expect(estTransporte({})).toBe(true);
  });

  it("le volume par destination : le trajet, puis les destinations hors adresse (marquées non transportées), puis la fiche", () => {
    const v = volumesParDestination(objets, d);
    expect(v.map((x) => [x.libelle, x.volume, x.objets, x.transporte])).toEqual([
      ["Garde-meuble", 0.4, 2, true],
      ["Arrivée · Lyon", 0.8, 4, true],
      ["À laisser sur place", 0.8, 1, false],
      ["Débarras", 1.2, 1, true],
      ["Pris en charge par le client", 0.5, 1, false],
      ["À confirmer", 0.6, 2, true],
      ["Don", 0.3, 1, true],
    ]);
    // `toutes` montre les adresses vides, jamais les destinations hors adresse vides.
    expect(volumesParDestination([], d, true).map((x) => x.libelle)).toEqual(["Garde-meuble", "Arrivée · Lyon", "Arrivée · Paris"]);
  });

  it("la désignation bilingue : « Français / English », le français seul sans anglais", () => {
    expect(designation("Canapé 3 places", "Sofa 3-seater")).toBe("Canapé 3 places / Sofa 3-seater");
    expect(designation("Malle de grand-mère", null)).toBe("Malle de grand-mère");
    expect(designation("Malle", "  ")).toBe("Malle");
  });
});
