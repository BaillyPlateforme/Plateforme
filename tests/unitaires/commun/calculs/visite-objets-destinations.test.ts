import { describe, expect, it } from "vitest";
import { CATALOG } from "@/lib/catalog";
import { destinationParDefaut, destinationsDuTrajet, resoudreDestination, villeDeLAdresse, volumesParDestination } from "@/lib/visite/destinations";
import { normaliser, objetsConnus, rechercherObjets, type ObjetConnu } from "@/lib/visite/objets";
import { resumeAcces, tailleAscenseur, type EtapeAcces } from "@/lib/visite/regles";

/*
 * Les retours de Céline (16/11/2026) sur la tablette de visite : la saisie
 * automatique des objets (« si on tape "ta" que cela propose table,
 * tableaux, table basse… »), la répartition de l'inventaire entre les
 * destinations, la taille de l'ascenseur et les cases libres des accès.
 */

const catalogue = objetsConnus(CATALOG, [], []);
const libelles = (l: ObjetConnu[]) => l.map((o) => o.label);

describe("rechercherObjets — la saisie automatique", () => {
  it("« ta » propose les tables, le tapis, le tabouret ; rien sans frappe", () => {
    const l = libelles(rechercherObjets("ta", catalogue, 20));
    for (const x of ["Table basse", "Table à manger", "Table de chevet", "Table de jardin", "Tapis", "Tabouret de bar"]) expect(l).toContain(x);
    expect(l).not.toContain("Canapé 2 places");
    expect(rechercherObjets("", catalogue)).toEqual([]);
    expect(rechercherObjets("   ", catalogue)).toEqual([]);
  });

  it("chaque lettre resserre : « tab » écarte le tapis, « table b » ne garde que la table basse", () => {
    expect(libelles(rechercherObjets("tab", catalogue, 20))).not.toContain("Tapis");
    expect(libelles(rechercherObjets("table b", catalogue))).toEqual(["Table basse"]);
    // Chaque mot tapé commence un mot du libellé : « ta ba » trouve la table basse, et le tabouret de bar.
    expect(libelles(rechercherObjets("ta ba", catalogue))).toEqual(["Table basse", "Tabouret de bar"]);
  });

  it("sans accents ni majuscules, sur le début de n'importe quel mot", () => {
    expect(libelles(rechercherObjets("REFRI", catalogue))).toEqual(["Réfrigérateur"]);
    expect(libelles(rechercherObjets("chev", catalogue))).toEqual(["Table de chevet"]);
    expect(libelles(rechercherObjets("seche", catalogue))).toEqual(["Sèche-linge"]);
    expect(libelles(rechercherObjets("linge", catalogue))).toEqual(expect.arrayContaining(["Lave-linge", "Sèche-linge"]));
    expect(rechercherObjets("able", catalogue)).toEqual([]); // le milieu d'un mot ne compte pas
  });

  it("l'ordre : le libellé qui commence par la frappe d'abord, puis le plus court", () => {
    const l = libelles(rechercherObjets("lit", catalogue));
    expect(l[0]).toBe("Lit simple");
    expect(l).toEqual(expect.arrayContaining(["Lit double (+ matelas)", "Lit superposé"]));
  });

  it("les objets du dossier passent devant, puis le catalogue, puis le vocabulaire de l'équipe ; un libellé n'apparaît qu'une fois", () => {
    const connus = objetsConnus(CATALOG, [{ label: "Tableaux", volume: 0.1 }, { label: "table basse", volume: 0.9 }], [{ libelle: "Table basse", volume: 0.5 }]);
    const r = rechercherObjets("ta", connus, 20);
    expect(r.filter((o) => normaliser(o.label) === "table basse")).toEqual([{ label: "Table basse", volume: 0.5, source: "dossier" }]);
    expect(r.find((o) => o.label === "Tableaux")).toEqual({ label: "Tableaux", volume: 0.1, source: "historique" });
    expect(libelles(rechercherObjets("tablea", connus))).toEqual(["Tableaux"]);
  });

  it("objetsConnus écarte les volumes nuls ou aberrants, et l'historique déjà au catalogue", () => {
    const c = objetsConnus([{ label: "A", volume: 0 }, { label: "B", volume: 1 }], [{ label: "b", volume: 2 }, { label: "C", volume: 120 }, { label: " ", volume: 1 }], [{ libelle: "D", volume: -1 }]);
    expect(c).toEqual([{ label: "B", volume: 1, groupe: undefined, source: "catalogue" }]);
  });

  it("au plus « limite » suggestions", () => {
    expect(rechercherObjets("c", catalogue, 3)).toHaveLength(3);
  });
});

describe("destinationsDuTrajet — les destinations du dossier", () => {
  it("le départ n'en est pas une ; un seul genre : son nom seul", () => {
    const d = destinationsDuTrajet([
      { id: 1, genre: "depart", adresse: "12 rue de Passy, Paris 16e" },
      { id: 2, genre: "garde_meuble", adresse: "Garde-meuble Gennevilliers" },
      { id: 3, genre: "arrivee", adresse: "8 av. Carnot, 78110 Le Vésinet" },
    ]);
    expect(d).toEqual([
      { id: 2, genre: "garde_meuble", libelle: "Garde-meuble" },
      { id: 3, genre: "arrivee", libelle: "Arrivée" },
    ]);
    expect(destinationParDefaut(d)).toBe(3);
  });

  it("deux livraisons (province et Paris) : la ville les distingue, lue dans la colonne ou dans l'adresse", () => {
    const d = destinationsDuTrajet([
      { id: 1, genre: "depart", adresse: "x" },
      { id: 4, genre: "garde_meuble", adresse: "GM Bailly" },
      { id: 5, genre: "arrivee", adresse: "3 rue Neuve", ville: "Lyon" },
      { id: 6, genre: "arrivee", adresse: "10 rue de Rivoli, 75004 Paris" },
    ]);
    expect(d.map((x) => x.libelle)).toEqual(["Garde-meuble", "Arrivée · Lyon", "Arrivée · Paris"]);
  });

  it("libellés toujours uniques, même pour deux adresses de la même ville", () => {
    const d = destinationsDuTrajet([
      { id: 5, genre: "arrivee", adresse: "1 rue A, 75001 Paris" },
      { id: 6, genre: "arrivee", adresse: "2 rue B, 75002 Paris" },
    ]);
    expect(new Set(d.map((x) => x.libelle.toLowerCase())).size).toBe(2);
  });

  it("villeDeLAdresse : après le code postal, sinon la dernière partie", () => {
    expect(villeDeLAdresse("8 av. Carnot, 78110 Le Vésinet")).toBe("Le Vésinet");
    expect(villeDeLAdresse("Garde-meuble, Gennevilliers")).toBe("Gennevilliers");
    expect(villeDeLAdresse("  ")).toBeNull();
  });

  it("resoudreDestination : un objet rangé depuis la fiche retrouve son étape par son libellé", () => {
    const d = [
      { id: 4, genre: "garde_meuble", libelle: "Garde-meuble" },
      { id: 5, genre: "arrivee", libelle: "Arrivée · Lyon" },
      { id: 6, genre: "arrivee", libelle: "Arrivée · Paris" },
    ];
    expect(resoudreDestination("Arrivée · Paris", d)).toBe(6);
    expect(resoudreDestination("Arrivée", d)).toBe(5);
    expect(resoudreDestination("garde-meuble", d)).toBe(4);
    expect(resoudreDestination("Don", d)).toBeNull();
    expect(resoudreDestination(null, d)).toBeNull();
  });

  it("volumesParDestination : la somme par destination, puis les destinations hors trajet", () => {
    const d = [
      { id: 4, genre: "garde_meuble", libelle: "Garde-meuble" },
      { id: 5, genre: "arrivee", libelle: "Arrivée" },
    ];
    const v = volumesParDestination(
      [
        { quantite: 2, volume: 0.4, destination: 5 },
        { quantite: 1, volume: 1.2, destination: 4 },
        { quantite: 3, volume: 0.1, destination: 5 },
        { quantite: 1, volume: 0.3, destination: null, destinationLibre: "Don" },
        { quantite: 1, volume: 0.2, destination: 99 },
      ],
      d,
    );
    expect(v.map((x) => [x.libelle, x.volume, x.objets])).toEqual([
      ["Garde-meuble", 1.2, 1],
      ["Arrivée", 1.1, 5],
      ["Don", 0.3, 1],
      ["Sans destination", 0.2, 1],
    ]);
    expect(volumesParDestination([], d)).toEqual([]);
    expect(volumesParDestination([], d, true).map((x) => x.volume)).toEqual([0, 0]);
  });
});

describe("accès : la taille de l'ascenseur et les cases libres", () => {
  const etape: Omit<EtapeAcces, "id" | "genre" | "adresse"> = { etage: null, ascenseur: false, escalier: null, portage_m: null, stationnement: null, poids_lourd: null, monte_meuble: null, acces: null };

  it("tailleAscenseur : un nombre devient des personnes, un texte reste tel quel", () => {
    expect(tailleAscenseur("4")).toBe("4 personnes");
    expect(tailleAscenseur("1")).toBe("1 personne");
    expect(tailleAscenseur(" 6 pers. ")).toBe("6 pers.");
    expect(tailleAscenseur("")).toBeNull();
    expect(tailleAscenseur(null)).toBeNull();
  });

  it("resumeAcces : la taille suit l'ascenseur, les précisions suivent l'escalier et le stationnement", () => {
    expect(
      resumeAcces({ ...etape, etage: "4", ascenseur: true, ascenseur_taille: "4", escalier: "etroit", escalier_precision: " Rampe fragile ", stationnement: "autorisation", stationnement_precision: "Marché le jeudi" }),
    ).toBe("4e étage · ascenseur 4 personnes · escalier étroit (moins de 80 cm) · escalier : Rampe fragile · demande de stationnement (autorisation de voirie) · stationnement : Marché le jeudi");
    // Sans ascenseur, la taille ne compte pas ; des précisions vides ne s'écrivent pas.
    expect(resumeAcces({ ...etape, etage: "2", ascenseur_taille: "4", escalier_precision: "  ", stationnement_precision: "" })).toBe("2e étage · sans ascenseur");
  });
});
