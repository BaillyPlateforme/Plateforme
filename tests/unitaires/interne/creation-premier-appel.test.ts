import { describe, expect, it } from "vitest";
import { ACCES_CAMION_DEFAUT, ADRESSE_VIDE, adresseDepuisEtape, cpVilleDe, lireLieux } from "@/crm/creation/commun";
import { colonnesTelephones, nettoyerTelephones, telEnSaisie, telephoneEtLibelle, telephonesDuClient, telephonesDuFormulaire, telLisible } from "@/crm/clients/telephones";
import { TYPES, TYPES_PLURIEL } from "@/crm/lib/format";
import { lienCarte, lienPanorama } from "@/ui/LienStreetView";

/*
 * La fiche du premier appel (retours de Céline, 16/11/2026) : les libellés
 * des segments, les téléphones (par paires, plusieurs, chacun son libellé),
 * les adresses de chargement et de livraison relues par le serveur, le lien
 * Street View.
 */

describe("segments : les mots de Céline", () => {
  it("« CIMOB/DICOM » et « Client compte », valeurs en base inchangées", () => {
    expect(TYPES.militaire).toBe("CIMOB/DICOM");
    expect(TYPES.compte).toBe("Client compte");
    expect(TYPES_PLURIEL.compte).toBe("Clients compte");
  });
});

describe("téléphones", () => {
  it("par paires pendant la frappe, pour un numéro français", () => {
    expect(telEnSaisie("0606060606")).toBe("06 06 06 06 06");
    expect(telEnSaisie("06060")).toBe("06 06 0");
    expect(telEnSaisie("06.12.34")).toBe("06 12 34");
    expect(telEnSaisie("06 1")).toBe("06 1");
  });
  it("un indicatif, un numéro étranger ou un texte restent tels quels", () => {
    expect(telEnSaisie("+33 6 12")).toBe("+33 6 12");
    expect(telEnSaisie("bureau")).toBe("bureau");
    expect(telEnSaisie("061234567890")).toBe("061234567890");
  });
  it("à l'affichage : par paires, « +33 » compris", () => {
    expect(telLisible("+33612345678")).toBe("06 12 34 56 78");
    expect(telLisible(null)).toBe("");
  });
  it("le premier dans telephone, le deuxième dans telephone2, les suivants à part", () => {
    const c = colonnesTelephones([
      { numero: "06 11 11 11 11", libelle: "M." },
      { numero: "06 22 22 22 22", libelle: "Mme" },
      { numero: "01 69 10 35 35", libelle: "Travail" },
    ]);
    expect(c).toEqual({
      telephone: "06 11 11 11 11", telephone_libelle: "M.", telephone2: "06 22 22 22 22", telephone2_libelle: "Mme",
      telephones_autres: JSON.stringify([{ numero: "01 69 10 35 35", libelle: "Travail" }]),
    });
    expect(colonnesTelephones([])).toEqual({ telephone: null, telephone_libelle: null, telephone2: null, telephone2_libelle: null, telephones_autres: "[]" });
  });
  it("relus dans l'ordre, sans les numéros vides, chacun avec son libellé", () => {
    const l = telephonesDuClient({ telephone: "0611111111", telephone_libelle: "M.", telephone2: null, telephones_autres: [{ numero: "0622222222", libelle: "Mme" }, { numero: " ", libelle: "x" }, "n'importe quoi"] });
    expect(l).toEqual([{ numero: "06 11 11 11 11", libelle: "M." }, { numero: "06 22 22 22 22", libelle: "Mme" }]);
    expect(l.map(telephoneEtLibelle)).toEqual(["06 11 11 11 11 (M.)", "06 22 22 22 22 (Mme)"]);
    expect(nettoyerTelephones("pas une liste")).toEqual([]);
  });
  it("lus dans le formulaire : les champs répétés, dans l'ordre de l'écran", () => {
    const f = new FormData();
    for (const [n, l] of [["0611111111", "Portable"], ["", "vide"], ["0133333333", ""]]) {
      f.append("tel_numero", n);
      f.append("tel_libelle", l);
    }
    expect(telephonesDuFormulaire(f)).toEqual([{ numero: "06 11 11 11 11", libelle: "Portable" }, { numero: "01 33 33 33 33", libelle: "" }]);
  });
});

describe("adresses de chargement et de livraison", () => {
  it("« Accès en camion » noté d'office « Facile aux poids lourds »", () => {
    expect(ADRESSE_VIDE.acces_camion).toBe(ACCES_CAMION_DEFAUT);
    expect(ACCES_CAMION_DEFAUT).toBe("Facile aux poids lourds");
  });
  it("le code postal et la ville lus à la fin d'une adresse", () => {
    expect(cpVilleDe("12 Rue de la Paix, 75002 Paris")).toEqual({ code_postal: "75002", ville: "Paris" });
    expect(cpVilleDe("Lyon")).toBeNull();
  });
  it("relues par le serveur : départs puis livraisons, complément devant, valeurs bornées", () => {
    const e = lireLieux(JSON.stringify([
      { genre: "arrivee", adresse: "5 Place Bellecour, 69002 Lyon", ascenseur: false, ascenseur_taille: "4", monte_meuble: true, surface: "80" },
      { genre: "depart", adresse: "12 Rue de la Paix, 75002 Paris", complement: "Bât. B", etage: "3", ascenseur: true, ascenseur_taille: "4", portage: true, code_acces: "A123 / interphone Dupont", surface: "72,5", acces_camion: "Facile aux poids lourds", lat: 48.87, lon: 2.33 },
      { genre: "depart", adresse: "", complement: "", etage: "2" },
      { genre: "depart", adresse: "8 Avenue de Paris, 94300 Vincennes" },
      { genre: "inconnu", adresse: "x" },
    ]));
    expect(e.map((x) => x.genre)).toEqual(["depart", "depart", "arrivee"]);
    expect(e[0]).toMatchObject({
      adresse: "Bât. B, 12 Rue de la Paix, 75002 Paris", code_postal: "75002", ville: "Paris", etage: "3", ascenseur: true, ascenseur_taille: "4",
      monte_meuble: "non", portage: true, code_acces: "A123 / interphone Dupont", surface_m2: 73, lat: 48.87, lon: 2.33,
    });
    expect(e[1].adresse).toBe("8 Avenue de Paris, 94300 Vincennes");
    // À la livraison : ni surface habitable, ni taille d'un ascenseur absent.
    expect(e[2]).toMatchObject({ monte_meuble: "oui", surface_m2: null, ascenseur_taille: null, ville: "Lyon" });
  });
  it("toujours un départ et une arrivée, même vides ; une saisie illisible n'en fait pas plus", () => {
    expect(lireLieux("{pas du json").map((x) => [x.genre, x.adresse])).toEqual([["depart", null], ["arrivee", null]]);
    expect(lireLieux(Array.from({ length: 20 }, (_, i) => ({ genre: "depart", adresse: `${i} rue X` }))).filter((x) => x.genre === "depart")).toHaveLength(6);
  });
  it("une étape d'un dossier passé redevient une adresse de la fiche", () => {
    const a = adresseDepuisEtape({ adresse: "5 Place Bellecour, 69002 Lyon", etage: "2", ascenseur: true, acces: null, monte_meuble: "oui", surface_m2: 90, acces_camion: null }, true);
    expect(a).toMatchObject({ adresse: "5 Place Bellecour, 69002 Lyon", etage: "2", ascenseur: true, monte_meuble: true, surface: "90", acces_camion: ACCES_CAMION_DEFAUT });
  });
});

describe("Street View", () => {
  it("un lien Google Maps sans clé : le panorama au point, sinon l'adresse", () => {
    expect(lienPanorama(48.8698, 2.3311)).toBe("https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=48.869800,2.331100");
    expect(lienCarte("12 Rue de la Paix, 75002 Paris")).toBe("https://www.google.com/maps/search/?api=1&query=12%20Rue%20de%20la%20Paix%2C%2075002%20Paris");
  });
});
