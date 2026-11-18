import { describe, expect, it, vi } from "vitest";

vi.mock("@/crm/lib/db", () => ({ q: vi.fn(async () => []), q1: vi.fn(async () => undefined), transaction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/visite/pdf", () => ({ pdfCompteRendu: vi.fn() }));
vi.mock("@/lib/espace-client/fichiers", () => ({ SEAU: "espace" }));
vi.mock("@/terrain/lib/photos", () => ({ SEAU: "photos" }));

import { bilanVolumes, choixDe, type Destination } from "@/lib/visite/destinations";
import type { ObjetSaisi, Operation } from "@/lib/visite/regles";
import { appliquerOp, enfiler, type EtatSaisie } from "@/crm/visites/tablette/etat";
import { prochainLot, remettreEnTete, decrireOperation } from "@/crm/visites/tablette/file";
import { nomLibre, opsDupliquerLigne, opsDupliquerPiece, opsRepartir } from "@/crm/visites/tablette/gestes";
import { informationsManquantes } from "@/crm/visites/tablette/manques";
import { ErreurSaisie, lireOperations, trancher } from "@/crm/visites/operations";
import { volumeTransporteSql } from "@/crm/visites/volume";
import { contenuDe } from "@/crm/visites/compte-rendu";
import type { Saisie } from "@/crm/visites/donnees";

/*
 * La synthèse de Dragan (18/11/2026) sur la tablette : les
 * destinations hors adresse, le volume transporté, répartir, dupliquer une
 * ligne ou une pièce, les informations manquantes, le compte-rendu bilingue
 * — et le travail hors connexion avec ces gestes nouveaux : tout arrive au
 * serveur, une seule fois.
 */

const U = (n: number) => `0f8fad5b-d9cb-469f-a165-${String(n).padStart(12, "0")}`;
const D: Destination[] = [
  { id: 4, genre: "garde_meuble", libelle: "Garde-meuble" },
  { id: 5, genre: "arrivee", libelle: "Arrivée · Lyon" },
  { id: 6, genre: "arrivee", libelle: "Arrivée · Paris" },
];
const objet = (n: number, o: Partial<ObjetSaisi> = {}): ObjetSaisi => ({
  cle: U(1000 + n), piece: U(1), libelle: `Objet ${n}`, quantite: 1, volume: 0.5, demontage: false, fragile: false, note: null, destination: 5, speciale: null, ...o,
});
/** Des clés neuves, prévisibles. */
const cles = (depart = 5000) => {
  let i = depart;
  return () => U(i++);
};
const vide = (): EtatSaisie => ({
  pieces: [{ cle: U(1), nom: "Salle à manger", ordre: 1, remarque: "Parquet fragile" }, { cle: U(2), nom: "Cuisine", ordre: 2, remarque: null }],
  objets: [],
  etapes: [],
  remarques: null,
  options: [],
  formule: null,
});

describe("répartir les exemplaires d'une ligne entre des destinations", () => {
  const chaises = objet(1, { libelle: "Chaise standard", quantite: 6, volume: 0.2, libelleEn: "Chair standard" });

  it("6 chaises : 2 partent au garde-meuble, 4 restent à Lyon — sans ressaisir la référence", () => {
    const ops = opsRepartir(chaises, 2, "e4", [chaises], D, cles());
    expect(ops).toEqual([
      { t: "objet", ...chaises, quantite: 4 },
      { t: "objet", ...chaises, cle: U(5000), quantite: 2, destination: 4, speciale: null, destinationLibre: null },
    ]);
    const e = ops.reduce(appliquerOp, { ...vide(), objets: [chaises] });
    expect(e.objets.map((o) => [o.libelle, o.quantite, choixDe(o, D), o.libelleEn])).toEqual([
      ["Chaise standard", 4, "e5", "Chair standard"],
      ["Chaise standard", 2, "e4", "Chair standard"],
    ]);
    expect(bilanVolumes(e.objets).transporte).toBe(1.2);
  });

  it("vers une destination hors adresse : 1 laissé sur place sort du volume transporté", () => {
    const e = opsRepartir(chaises, 1, "s:sur_place", [chaises], D, cles()).reduce(appliquerOp, { ...vide(), objets: [chaises] });
    expect(bilanVolumes(e.objets)).toMatchObject({ transporte: 1, nonTransporte: 0.2 });
  });

  it("les exemplaires rejoignent la ligne identique qui va déjà là ; tous : la ligne change seulement de destination", () => {
    const deja = objet(2, { libelle: "Chaise standard", quantite: 1, volume: 0.2, destination: 4, libelleEn: "Chair standard" });
    expect(opsRepartir(chaises, 2, "e4", [chaises, deja], D, cles())).toEqual([
      { t: "objet", ...chaises, quantite: 4 },
      { t: "objet", ...deja, quantite: 3 },
    ]);
    expect(opsRepartir(chaises, 6, "s:debarras", [chaises], D, cles())).toEqual([{ t: "objet", ...chaises, destination: null, speciale: "debarras", destinationLibre: null }]);
  });

  it("un geste sans objet ne fait rien : 0, plus que la ligne, une destination inconnue, la même destination", () => {
    for (const [n, c] of [[0, "e4"], [7, "e4"], [1.5, "e4"], [2, "e99"], [2, "s:pirate"], [2, "e5"]] as const) expect(opsRepartir(chaises, n, c, [chaises], D, cles())).toEqual([]);
  });
});

describe("dupliquer une ligne, dupliquer une pièce", () => {
  it("la ligne dupliquée est la même, avec une clé neuve", () => {
    const o = objet(1, { libelle: "Armoire 2 portes", volume: 1.2, demontage: true, note: "Fronton à part" });
    expect(opsDupliquerLigne(o, D, cles())).toEqual([{ t: "objet", ...o, cle: U(5000) }]);
  });

  it("une ligne à destination libre de la fiche (« Don ») : sa copie va à la destination par défaut", () => {
    const o = objet(1, { destination: null, destinationLibre: "Don" });
    expect(opsDupliquerLigne(o, D, cles())[0]).toMatchObject({ destination: 5, destinationLibre: null });
  });

  it("la pièce dupliquée : « Salle à manger 2 », juste après, même destination, copie des objets ; ni photos ni remarque", () => {
    const e0 = { ...vide(), pieces: [{ ...vide().pieces[0], speciale: "debarras" as const }, vide().pieces[1]], objets: [objet(1), objet(2, { quantite: 3 }), objet(3, { piece: U(2) })] };
    const { cle, ops } = opsDupliquerPiece(e0.pieces[0], e0.pieces, e0.objets, D, cles());
    expect(ops[0]).toEqual({ t: "piece", cle, nom: "Salle à manger 2", ordre: 1.5, remarque: null, destination: null, speciale: "debarras" });
    expect(ops.slice(1).map((o) => (o.t === "objet" ? [o.piece, o.libelle, o.quantite] : null))).toEqual([
      [cle, "Objet 1", 1],
      [cle, "Objet 2", 3],
    ]);
    const e = ops.reduce(appliquerOp, e0);
    expect(e.pieces.map((p) => p.nom)).toEqual(["Salle à manger", "Salle à manger 2", "Cuisine"]);
    expect(new Set(e.objets.map((o) => o.cle)).size).toBe(5);
    // Dupliquer la copie : « Salle à manger 3 ».
    expect(opsDupliquerPiece(e.pieces[1], e.pieces, e.objets, D, cles(6000)).ops[0]).toMatchObject({ nom: "Salle à manger 3" });
  });

  it("nomLibre ne dépasse jamais le plafond du serveur (60)", () => {
    const long = "x".repeat(60);
    const n = nomLibre(long, [{ nom: long }]);
    expect(n.length).toBeLessThanOrEqual(60);
    expect(n.endsWith(" 2")).toBe(true);
  });
});

describe("informations manquantes avant le compte-rendu (proposition)", () => {
  const etape = (o: Record<string, unknown>) => ({ id: 1, genre: "depart", adresse: "1 rue X", etage: null, ascenseur: false, escalier: null, portage_m: null, stationnement: null, poids_lourd: null, monte_meuble: null, acces: null, ...o });

  it("adresses, inventaire, destinations, formule : chaque manque mène où le compléter", () => {
    const e: EtatSaisie = {
      ...vide(),
      etapes: [etape({}), etape({ id: 2, genre: "arrivee", adresse: "8 av. Carnot", etage: "3", stationnement: "facile" }), etape({ id: 3, genre: "garde_meuble", adresse: null })] as EtatSaisie["etapes"],
      objets: [
        objet(1, { libelle: "Caisse vaisselle", volume: 0 }),
        objet(2, { libelle: "Bullpack", volume: 0, horsCubage: true }),
        objet(3, { libelle: "Chaise", quantite: 2, destination: null, speciale: "a_confirmer" }),
        objet(4, { libelle: "Vélo", destination: null }),
        objet(5, { libelle: "Banc", destination: null, destinationLibre: "Don" }),
      ],
    };
    const g = informationsManquantes(e, D, (p) => (p === U(1) ? 2 : 0));
    const textes = Object.fromEntries(g.map((x) => [x.titre, x.manques.map((m) => m.texte)]));
    expect(textes["Adresses et accès"]).toEqual([
      "Départ (1 rue X) : accès non renseignés",
      "Arrivée (8 av. Carnot) : escalier non renseigné",
      "Garde-meuble : adresse à préciser dans la fiche du CRM",
    ]);
    expect(textes.Inventaire).toEqual(["« Salle à manger » : Caisse vaisselle — volume à saisir", "« Cuisine » : aucun objet", "« Cuisine » : aucune photo"]);
    expect(textes.Destinations).toEqual(["« Salle à manger » : 2 × Chaise — destination à confirmer", "« Salle à manger » : Vélo — sans destination"]);
    expect(textes.Options).toEqual(["Formule envisagée non choisie"]);
    expect(g.find((x) => x.titre === "Inventaire")!.manques[1].vue).toEqual({ genre: "piece", cle: U(2) });
  });

  it("une saisie complète : rien à signaler ; aucune pièce : on le dit", () => {
    const complet: EtatSaisie = {
      ...vide(),
      pieces: [vide().pieces[0]],
      etapes: [etape({ etage: "RDC", stationnement: "facile" })] as EtatSaisie["etapes"],
      objets: [objet(1)],
      formule: "standard",
    };
    expect(informationsManquantes(complet, D, () => 1)).toEqual([]);
    expect(informationsManquantes({ ...complet, pieces: [], objets: [] }, D, () => 1)[0].manques[0]).toEqual({ texte: "Aucune pièce relevée", vue: { genre: "nouvelle-piece" } });
    expect(informationsManquantes(complet, [], () => 1)[0].manques[0].texte).toMatch(/^Aucune livraison ni garde-meuble/);
  });
});

describe("le serveur : opérations, destination, volume transporté", () => {
  const refuse = (corps: unknown) => {
    try {
      lireOperations(corps);
    } catch (e) {
      return e instanceof ErreurSaisie ? e.statut : "autre";
    }
    return "accepté";
  };
  const o = { t: "objet", cle: U(2), piece: U(1), libelle: "Canapé 3 places", quantite: 1, volume: 2.1, demontage: false, fragile: false, note: null };

  it("la destination hors adresse : une des quatre clés ; l'anglais borné ; le hors-cubage un booléen", () => {
    expect(lireOperations({ ops: [{ ...o, speciale: "sur_place", libelleEn: " Sofa 3-seater ", horsCubage: false }] })[0]).toEqual({ ...o, speciale: "sur_place", libelleEn: "Sofa 3-seater", horsCubage: false });
    for (const sp of ["debarras", "client", "a_confirmer", null]) expect(refuse({ ops: [{ ...o, speciale: sp }] })).toBe("accepté");
    for (const sp of ["pirate", 1, "Débarras"]) expect(refuse({ ops: [{ ...o, speciale: sp }] })).toBe(400);
    expect(refuse({ ops: [{ ...o, libelleEn: "x".repeat(91) }] })).toBe(400);
    expect(refuse({ ops: [{ ...o, horsCubage: "oui" }] })).toBe(400);
    expect(refuse({ ops: [{ t: "piece", cle: U(1), nom: "Cave", ordre: 1.5, remarque: null, speciale: "debarras" }] })).toBe("accepté");
    // Une ancienne tablette, sans ces champs : acceptée, ils restent absents (inchangés en base).
    expect(lireOperations({ ops: [o] })[0]).not.toHaveProperty("speciale");
  });

  it("trancher : une destination hors adresse remplace l'étape, une étape l'efface ; absente, rien ne change", () => {
    expect(trancher("debarras", 5)).toEqual({ speciale: "debarras", etape: null });
    expect(trancher(undefined, 5)).toEqual({ speciale: null, etape: 5 });
    expect(trancher(null, 5)).toEqual({ speciale: null, etape: 5 });
    expect(trancher(undefined, undefined)).toEqual({ speciale: undefined, etape: undefined });
    expect(trancher(undefined, null)).toEqual({ speciale: undefined, etape: null });
  });

  it("le volume du dossier (SQL) est le volume transporté : sans « sur place » ni « client »", () => {
    expect(volumeTransporteSql("$1")).toBe("coalesce((select sum(quantite * volume) from inventaire where dossier_id = $1 and coalesce(destination_speciale, '') not in ('sur_place', 'client')), 0)");
  });

  it("côté tablette, la pièce suit la même règle que le serveur", () => {
    let e = appliquerOp(vide(), { t: "piece", cle: U(1), nom: "Cave", ordre: 1, remarque: null, destination: 5 });
    e = appliquerOp(e, { t: "piece", cle: U(1), nom: "Cave", ordre: 1, remarque: null, speciale: "debarras" });
    expect(e.pieces.find((p) => p.cle === U(1))).toMatchObject({ destination: null, speciale: "debarras" });
    e = appliquerOp(e, { t: "piece", cle: U(1), nom: "Cave", ordre: 1, remarque: null });
    expect(e.pieces.find((p) => p.cle === U(1))).toMatchObject({ destination: null, speciale: "debarras" });
    e = appliquerOp(e, { t: "piece", cle: U(1), nom: "Cave", ordre: 1, remarque: null, destination: 4 });
    expect(e.pieces.find((p) => p.cle === U(1))).toMatchObject({ destination: 4, speciale: null });
  });

  it("ce qui n'a pas pu entrer dit la destination hors adresse", () => {
    expect(decrireOperation({ ...o, t: "objet", speciale: "debarras" } as Operation, vide())).toBe("Salle à manger : Canapé 3 places (2,1 m³) → Débarras");
  });
});

describe("le compte-rendu : volume transporté et désignations bilingues", () => {
  const base = (o: Partial<Saisie> = {}): Saisie => ({
    visite: { id: 4, dossierId: 1, statut: "en_cours", remarques: null, options: [], formule: null, commenceeLe: "2026-11-19T09:00:00Z", majLe: "", rendezVousId: null, commercial: "Dragan", signeLe: null, signataire: null, empreinte: null, document: false },
    dossier: { id: 1, ref: "BD-2026-0001", client: "Martin", contact: null, telephone: null, email: null, volume: 0, type: "particulier" },
    rdv: null,
    etapes: [],
    destinations: [{ id: 5, genre: "arrivee", libelle: "Arrivée" }],
    pieces: [{ cle: "p1", nom: "Salon", ordre: 1, remarque: null }],
    objets: [
      { cle: "o1", piece: "p1", libelle: "Canapé 3 places", libelleEn: "Sofa 3-seater", quantite: 1, volume: 2.1, demontage: false, fragile: false, note: null, destination: 5 },
      { cle: "o2", piece: "p1", libelle: "Fauteuil classique", libelleEn: "Armchair standard", quantite: 1, volume: 0.7, demontage: false, fragile: false, note: null, destination: null, speciale: "sur_place" },
      { cle: "o3", piece: "p1", libelle: "Bullpack", libelleEn: "Bubble wrap", quantite: 3, volume: 0, demontage: false, fragile: false, note: null, destination: 5, horsCubage: true },
      { cle: "o4", piece: "p1", libelle: "Vieux buffet", quantite: 1, volume: 1, demontage: false, fragile: false, note: "Pied cassé", destination: null, speciale: "debarras" },
    ],
    photos: [],
    ...o,
  });

  it("une seule adresse, mais des destinations hors adresse : chaque objet porte la sienne, le volume est le transporté", () => {
    const c = contenuDe(base());
    expect(c.volume).toBe(3.1);
    expect(c.volume_non_transporte).toBe(0.7);
    expect(c.volume_debarras).toBe(1);
    expect(c).not.toHaveProperty("volume_a_confirmer");
    expect(c.pieces[0].objets.map((o) => [o.libelle, o.libelle_en, o.destination])).toEqual([
      ["Canapé 3 places", "Sofa 3-seater", "Arrivée"],
      ["Fauteuil classique", "Armchair standard", "À laisser sur place"],
      ["Bullpack", "Bubble wrap", "Arrivée"],
      ["Vieux buffet", undefined, "Débarras"],
    ]);
    expect(c.pieces[0].objets[2].hors_cubage).toBe(true);
    expect(c.destinations).toEqual([
      { libelle: "Arrivée", volume: 2.1, objets: 4 },
      { libelle: "À laisser sur place", volume: 0.7, objets: 1, non_transporte: true },
      { libelle: "Débarras", volume: 1, objets: 1 },
    ]);
  });

  it("sans destination hors adresse ni catalogue : le contenu reste celui d'avant (même empreinte)", () => {
    const c = contenuDe(base({ objets: [{ cle: "o1", piece: "p1", libelle: "Canapé", quantite: 1, volume: 2.5, demontage: false, fragile: false, note: null, destination: 5 }] }));
    expect(c.volume).toBe(2.5);
    for (const k of ["volume_non_transporte", "volume_debarras", "volume_a_confirmer", "destinations"]) expect(c).not.toHaveProperty(k);
    expect(Object.keys(c.pieces[0].objets[0]).sort()).toEqual(["demontage", "fragile", "libelle", "note", "quantite", "volume", "volume_unitaire"]);
  });
});

describe("hors connexion : répartir, dupliquer, destinations hors adresse — tout arrive une fois", () => {
  /** Un serveur en mémoire, la règle d'operations.ts : chaque clé est insérée ou remplacée, un objet sans sa pièce est ignoré. */
  function serveur() {
    const etat = { pieces: new Map<string, { nom: string; speciale: string | null }>(), objets: new Map<string, ObjetSaisi>(), recus: 0 };
    return {
      etat,
      recevoir(ops: Operation[]) {
        for (const op of ops) {
          etat.recus++;
          if (op.t === "piece") etat.pieces.set(op.cle, { nom: op.nom, speciale: trancher(op.speciale, op.destination).speciale ?? etat.pieces.get(op.cle)?.speciale ?? null });
          if (op.t === "piece-") {
            etat.pieces.delete(op.cle);
            for (const [k, o] of etat.objets) if (o.piece === op.cle) etat.objets.delete(k);
          }
          if (op.t === "objet" && etat.pieces.has(op.piece)) {
            const { t: _t, ...o } = op;
            void _t;
            etat.objets.set(op.cle, { ...o, volume: o.horsCubage ? 0 : o.volume });
          }
          if (op.t === "objet-") etat.objets.delete(op.cle);
        }
      },
    };
  }

  it("le réseau tombe et revient au milieu des gestes nouveaux : le serveur finit exactement comme la tablette, sans doublon", () => {
    const srv = serveur();
    let local: EtatSaisie = { ...vide(), pieces: [], objets: [] };
    let attente: Operation[] = [];
    const geste = (op: Operation) => {
      local = appliquerOp(local, op);
      attente = enfiler(attente, op);
    };
    let g = 7;
    const hasard = () => (g = (g * 16807) % 2147483647) / 2147483647;
    const envoyerUnLot = () => {
      if (!attente.length) return;
      const [lot, reste] = prochainLot(attente);
      attente = reste;
      const r = hasard();
      if (r < 0.35) attente = remettreEnTete(lot, attente); // coupé
      else if (r < 0.6) {
        srv.recevoir(lot); // reçu, réponse perdue : il repart
        attente = remettreEnTete(lot, attente);
      } else srv.recevoir(lot);
    };
    const nouvelle = cles(9000);
    for (let p = 1; p <= 4; p++) {
      geste({ t: "piece", cle: U(p), nom: `Chambre ${p}`, ordre: p, remarque: null, destination: 5, speciale: null });
      for (let k = 0; k < 8; k++) {
        geste({ t: "objet", ...objet(p * 100 + k, { piece: U(p), quantite: 2 + (k % 5), libelle: `Meuble ${k}` }) });
        if (hasard() < 0.15) envoyerUnLot();
      }
      const lignes = () => local.objets.filter((o) => o.piece === U(p));
      // Répartir, dupliquer une ligne, une destination hors adresse, puis dupliquer toute la pièce.
      for (const op of opsRepartir(lignes()[0], 1, "e4", lignes(), D, nouvelle)) geste(op);
      for (const op of opsRepartir(lignes()[1], 2, "s:a_confirmer", lignes(), D, nouvelle)) geste(op);
      for (const op of opsDupliquerLigne(lignes()[2], D, nouvelle)) geste(op);
      geste({ t: "objet", ...lignes()[3], destination: null, speciale: "sur_place" });
      geste({ t: "objet", ...objet(p * 100 + 50, { piece: U(p), libelle: "Bullpack", volume: 0, horsCubage: true, quantite: 4 }) });
      if (p % 2 === 0) for (const op of opsDupliquerPiece(local.pieces.find((x) => x.cle === U(p))!, local.pieces, local.objets, D, nouvelle).ops) geste(op);
      envoyerUnLot();
    }
    for (let k = 0; k < 800 && attente.length; k++) envoyerUnLot();
    expect(attente).toEqual([]);
    expect([...srv.etat.pieces.keys()].sort()).toEqual(local.pieces.map((x) => x.cle).sort());
    expect(srv.etat.objets.size).toBe(local.objets.length);
    for (const o of local.objets) expect(srv.etat.objets.get(o.cle), o.libelle).toEqual(o);
    // Le même volume transporté des deux côtés, et des lots bien reçus deux fois (l'idempotence a évité les doublons).
    expect(bilanVolumes([...srv.etat.objets.values()])).toEqual(bilanVolumes(local.objets));
    expect(bilanVolumes(local.objets).nonTransporte).toBeGreaterThan(0);
    expect(srv.etat.recus).toBeGreaterThan(local.objets.length + local.pieces.length);
    // Chaque pièce dupliquée suit son original, sous le premier numéro libre au moment du geste (ici, les pièces
    // sont nommées par le test, pas par nomLibre : « Chambre 3 » est créée après la copie de « Chambre 2 »).
    expect(local.pieces.map((x) => x.nom)).toEqual(["Chambre 1", "Chambre 2", "Chambre 3", "Chambre 3", "Chambre 4", "Chambre 5"]);
  });
});
