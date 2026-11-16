import { describe, expect, it, vi } from "vitest";

vi.mock("@/crm/lib/db", () => ({ q: vi.fn(async () => []), q1: vi.fn(async () => undefined), transaction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/visite/pdf", () => ({ pdfCompteRendu: vi.fn() }));
vi.mock("@/lib/espace-client/fichiers", () => ({ SEAU: "espace" }));
vi.mock("@/terrain/lib/photos", () => ({ SEAU: "photos" }));

import { ErreurSaisie, lireOperations } from "@/crm/visites/operations";
import { contenuDe, empreinteDe } from "@/crm/visites/compte-rendu";
import type { Saisie } from "@/crm/visites/donnees";

const U = (n: number) => `0f8fad5b-d9cb-469f-a165-${String(n).padStart(12, "0")}`;
const objet = (o: Record<string, unknown> = {}) => ({ t: "objet", cle: U(2), piece: U(1), libelle: "Canapé", quantite: 1, volume: 2.5, demontage: false, fragile: false, note: null, ...o });
const etape = (o: Record<string, unknown> = {}) => ({ t: "etape", id: 3, etage: "2", ascenseur: true, escalier: "droit", portage_m: 10, stationnement: "facile", poids_lourd: "oui", monte_meuble: "non", acces: null, ...o });
const refuse = (corps: unknown) => {
  try {
    lireOperations(corps);
  } catch (e) {
    return e instanceof ErreurSaisie ? e.statut : "autre";
  }
  return "accepté";
};

describe("visites/operations · lireOperations (corps envoyé par la tablette)", () => {
  it("lit un lot valide ; textes sans espaces autour, facultatifs vides → null, champs inconnus retirés", () => {
    const ops = lireOperations({
      ops: [
        { t: "piece", cle: U(1), nom: "  Salon  ", ordre: 1, remarque: "  " },
        objet({ note: "", pirate: "x" }),
        { t: "visite", remarques: " RAS ", formule: "standard", options: [{ libelle: "Démontage", proposee: true }] },
        etape(),
        { t: "objet-", cle: U(2) },
        { t: "piece-", cle: U(1) },
      ],
    });
    expect(ops[0]).toEqual({ t: "piece", cle: U(1), nom: "Salon", ordre: 1, remarque: null });
    expect(ops[1]).toEqual({ t: "objet", cle: U(2), piece: U(1), libelle: "Canapé", quantite: 1, volume: 2.5, demontage: false, fragile: false, note: null });
    expect(ops[2]).toMatchObject({ remarques: "RAS", formule: "standard" });
    expect(ops).toHaveLength(6);
  });
  it("refuse tout corps qui n'est pas un lot de 1 à 200 opérations (erreur 400)", () => {
    for (const c of [null, "ops", 42, [], {}, { ops: [] }, { ops: "x" }, { ops: Array.from({ length: 201 }, () => objet()) }]) expect(refuse(c)).toBe(400);
    expect(refuse({ ops: Array.from({ length: 200 }, () => objet()) })).toBe("accepté");
  });
  it("refuse une clé qui n'est pas un UUID, une opération inconnue", () => {
    for (const op of [objet({ cle: "1" }), objet({ piece: "../x" }), { t: "piece-", cle: "' or 1=1 --" }, { t: "supprimer-tout" }, { cle: U(1) }]) expect(refuse({ ops: [op] })).toBe(400);
  });
  it("bornes de l'inventaire : quantité entière de 1 à 999, volume de 0 à 99 m³", () => {
    for (const v of [1, 999]) expect(refuse({ ops: [objet({ quantite: v })] })).toBe("accepté");
    for (const v of [0, 1000, 1.5, -1, "2"]) expect(refuse({ ops: [objet({ quantite: v })] })).toBe(400);
    for (const v of [0, 99]) expect(refuse({ ops: [objet({ volume: v })] })).toBe("accepté");
    for (const v of [-0.01, 99.01, "1"]) expect(refuse({ ops: [objet({ volume: v })] })).toBe(400);
  });
  it("bornes des textes : nom de pièce 1 à 60, libellé 1 à 90, note 200", () => {
    expect(refuse({ ops: [{ t: "piece", cle: U(1), nom: "   ", ordre: 1, remarque: null }] })).toBe(400);
    expect(refuse({ ops: [{ t: "piece", cle: U(1), nom: "n".repeat(60), ordre: 1, remarque: null }] })).toBe("accepté");
    expect(refuse({ ops: [{ t: "piece", cle: U(1), nom: "n".repeat(61), ordre: 1, remarque: null }] })).toBe(400);
    expect(refuse({ ops: [objet({ libelle: "l".repeat(91) })] })).toBe(400);
    expect(refuse({ ops: [objet({ note: "n".repeat(201) })] })).toBe(400);
    expect(refuse({ ops: [objet({ libelle: "<script>alert(1)</script>" })] })).toBe("accepté"); // du texte, échappé à l'affichage
  });
  it("les accès d'une étape : valeurs connues seulement", () => {
    for (const o of [{ escalier: "toboggan" }, { stationnement: "partout" }, { poids_lourd: "peut-être" }, { monte_meuble: "oui!" }, { portage_m: 1001 }, { portage_m: -1 }, { id: 0 }, { id: 1.5 }, { ascenseur: "oui" }])
      expect(refuse({ ops: [etape(o)] })).toBe(400);
    expect(refuse({ ops: [etape({ escalier: null, portage_m: null, monte_charge: true })] })).toBe("accepté");
  });
  it("la visite : formule connue, 40 options au plus", () => {
    expect(refuse({ ops: [{ t: "visite", formule: "luxe" }] })).toBe(400);
    expect(refuse({ ops: [{ t: "visite", options: Array.from({ length: 41 }, () => ({ libelle: "x", proposee: false })) }] })).toBe(400);
    expect(refuse({ ops: [{ t: "visite", formule: null }] })).toBe("accepté");
  });
  it("le message d'erreur est celui que la tablette affiche", () => {
    expect(() => lireOperations({})).toThrow("Opérations illisibles : rechargez la page.");
  });
});

/* ---------- le compte-rendu de visite, figé à la signature ---------- */

const saisie = (o: Partial<Saisie> = {}): Saisie => ({
  visite: { id: 4, dossierId: 1, statut: "en_cours", remarques: "  Accès par la cour  ", options: [{ libelle: "Démontage", proposee: true }, { libelle: "Penderies", proposee: false }], formule: "standard", commenceeLe: "2026-11-10T09:00:00Z", majLe: "", rendezVousId: 2, commercial: "Paul", signeLe: null, signataire: null, empreinte: null, document: false },
  dossier: { id: 1, ref: "BD-2026-0001", client: "Martin", contact: null, telephone: " 06 12 34 56 78 ", email: "  ", volume: 0, type: "particulier" },
  rdv: { debut: "2026-11-10T09:00:00Z", duree_min: 90, type: "phys" },
  etapes: [
    { id: 1, genre: "depart", adresse: " 1 rue X, Lyon ", etage: "2", ascenseur: false, escalier: "droit", portage_m: 5, stationnement: "facile", poids_lourd: "oui", monte_meuble: "non", acces: "  ", monte_charge: null, transbordement: true } as never,
    { id: 2, genre: "arrivee", adresse: "   ", etage: null, ascenseur: false } as never,
  ],
  pieces: [{ cle: "p1", nom: "Salon", ordre: 1, remarque: null }, { cle: "p2", nom: "Cave", ordre: 2, remarque: "  " }, { cle: "p3", nom: "Grenier", ordre: 3, remarque: "Rien à prendre" }],
  objets: [
    { cle: "o1", piece: "p1", libelle: "Canapé", quantite: 1, volume: 2.5, demontage: true, fragile: false, note: null },
    { cle: "o2", piece: "p1", libelle: "Cartons", quantite: 12, volume: 0.07, demontage: false, fragile: false, note: null },
  ],
  photos: [{ piece: "p1" } as never, { piece: "p1" } as never, { piece: "p3" } as never],
  ...o,
});

describe("visites/compte-rendu · contenuDe", () => {
  it("les pièces vides disparaissent ; une pièce avec une remarque ou des photos reste", () => {
    const c = contenuDe(saisie());
    expect(c.pieces.map((p) => [p.nom, p.objets.length, p.photos, p.remarque])).toEqual([["Salon", 2, 2, null], ["Grenier", 0, 1, "Rien à prendre"]]);
  });
  it("volumes : par ligne, par pièce et au total ; total = somme des pièces ; objets = somme des quantités", () => {
    // Salon : 2,5 + 12 × 0,07 = 2,5 + 0,84 = 3,34
    const c = contenuDe(saisie());
    expect(c.pieces[0].objets.map((o) => o.volume)).toEqual([2.5, 0.84]);
    expect(c.pieces[0].volume).toBe(3.34);
    expect(c.volume).toBe(3.34);
    expect(c.nb_objets).toBe(13);
    expect(c.nb_photos).toBe(3);
  });
  it("propriété (volumes au centième) : le total vaut la somme des pièces, au centime près", () => {
    let g = 9;
    const r = () => ((g = (g * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 300; k++) {
      const pieces = Array.from({ length: 1 + Math.floor(r() * 6) }, (_, i) => ({ cle: `p${i}`, nom: `P${i}`, ordre: i, remarque: null }));
      const objets = Array.from({ length: Math.floor(r() * 30) }, (_, i) => ({ cle: `o${i}`, piece: `p${Math.floor(r() * pieces.length)}`, libelle: "x", quantite: 1 + Math.floor(r() * 20), volume: Math.round(r() * 300) / 100, demontage: false, fragile: false, note: null }));
      const c = contenuDe(saisie({ pieces, objets, photos: [] }));
      expect(Math.abs(c.volume - c.pieces.reduce((a, p) => a + p.volume, 0))).toBeLessThan(0.005);
      expect(c.nb_objets).toBe(c.pieces.reduce((a, p) => a + p.objets.reduce((b, o) => b + o.quantite, 0), 0));
    }
  });
  it("le trajet : seulement les étapes qui ont une adresse ; textes vides → null", () => {
    const c = contenuDe(saisie());
    expect(c.trajet).toEqual([{ genre: "depart", libelle: "Départ", adresse: "1 rue X, Lyon", etage: "2", ascenseur: false, escalier: "droit", portage_m: 5, stationnement: "facile", poids_lourd: "oui", monte_meuble: "non", monte_charge: false, transbordement: true, acces: null }]);
    expect(c.dossier).toMatchObject({ telephone: "06 12 34 56 78", email: null });
  });
  it("options proposées seulement, formule, mode et date de la visite", () => {
    const c = contenuDe(saisie());
    expect(c.options).toEqual(["Démontage"]);
    expect(c.formule).toEqual({ cle: "standard", nom: "Standard", sous: "Emballe ce qui casse" });
    expect(c.remarques).toBe("Accès par la cour");
    expect(c.visite).toEqual({ id: 4, le: "2026-11-10T09:00:00Z", commercial: "Paul", mode: "sur_place" });
    expect(contenuDe(saisie({ rdv: null })).visite.le).toBe("2026-11-10T09:00:00Z");
    expect(contenuDe(saisie({ rdv: { debut: "2026-11-11T09:00:00Z", duree_min: 60, type: "visio" } })).visite.mode).toBe("visio");
    expect(contenuDe(saisie({ visite: { ...saisie().visite, formule: null } })).formule).toBeNull();
  });
  it("l'empreinte scelle le contenu : stable, indépendante de l'ordre des clés, sensible au moindre changement", () => {
    const c = contenuDe(saisie());
    const e = empreinteDe(c);
    expect(e).toMatch(/^[0-9a-f]{64}$/);
    expect(empreinteDe(JSON.parse(JSON.stringify(c)))).toBe(e);
    const inverse = Object.fromEntries(Object.entries(c).reverse()) as typeof c;
    expect(empreinteDe(inverse)).toBe(e);
    expect(empreinteDe({ ...c, volume: c.volume + 0.01 })).not.toBe(e);
    expect(empreinteDe({ ...c, remarques: "Accès par la cour " })).not.toBe(e);
  });
});
