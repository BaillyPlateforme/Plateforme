import { describe, expect, it, vi } from "vitest";

vi.mock("@/crm/lib/db", () => ({ q: vi.fn(async () => []), q1: vi.fn(async () => undefined), transaction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/visite/pdf", () => ({ pdfCompteRendu: vi.fn() }));
vi.mock("@/lib/espace-client/fichiers", () => ({ SEAU: "espace" }));
vi.mock("@/terrain/lib/photos", () => ({ SEAU: "photos" }));

import type { Operation } from "@/lib/visite/regles";
import { appliquerOp, enfiler, type EtatSaisie } from "@/crm/visites/tablette/etat";
import { TAILLE_LOT, decrireOperation, etatDeDepart, issueEnvoi, prochainLot, remettreEnTete } from "@/crm/visites/tablette/file";
import { ErreurSaisie, lireOperations } from "@/crm/visites/operations";
import { contenuDe } from "@/crm/visites/compte-rendu";
import type { Saisie } from "@/crm/visites/donnees";

/*
 * Le travail hors connexion de la tablette (retours de Céline, 16/11/2026) :
 * la file des gestes part dans l'ordre, sans doublon, et un conflit a une
 * issue définie. On simule le serveur (operations.ts l'applique en « insérer
 * ou remplacer » par clé) et un réseau qui tombe, perd des réponses, revient.
 */

const U = (n: number) => `0f8fad5b-d9cb-469f-a165-${String(n).padStart(12, "0")}`;
const vide = (): EtatSaisie => ({ pieces: [], objets: [], etapes: [{ id: 7, genre: "depart", adresse: "1 rue X", etage: null, ascenseur: false, escalier: null, portage_m: null, stationnement: null, poids_lourd: null, monte_meuble: null, acces: null }], remarques: null, options: [], formule: null });
const piece = (n: number, nom = `Pièce ${n}`): Operation => ({ t: "piece", cle: U(n), nom, ordre: n, remarque: null });
const objet = (n: number, pieceN: number, o: Partial<Extract<Operation, { t: "objet" }>> = {}): Operation => ({
  t: "objet", cle: U(1000 + n), piece: U(pieceN), libelle: `Objet ${n}`, quantite: 1, volume: 0.5, demontage: false, fragile: false, note: null, ...o,
});

/** Un serveur en mémoire : la même règle que operations.ts — chaque clé est insérée ou remplacée, un objet sans sa pièce est ignoré. */
function serveur() {
  const etat = { pieces: new Map<string, string>(), objets: new Map<string, { piece: string; quantite: number; libelle: string }>(), recus: 0, lots: 0 };
  return {
    etat,
    recevoir(ops: Operation[]) {
      etat.lots++;
      for (const op of ops) {
        etat.recus++;
        if (op.t === "piece") etat.pieces.set(op.cle, op.nom);
        if (op.t === "piece-") {
          etat.pieces.delete(op.cle);
          for (const [k, o] of etat.objets) if (o.piece === op.cle) etat.objets.delete(k);
        }
        if (op.t === "objet" && etat.pieces.has(op.piece)) etat.objets.set(op.cle, { piece: op.piece, quantite: op.quantite, libelle: op.libelle });
        if (op.t === "objet-") etat.objets.delete(op.cle);
      }
    },
  };
}

describe("tablette/file · l'ordre des envois", () => {
  it("les lots partent du plus ancien geste au plus récent, 100 opérations au plus", () => {
    const file = Array.from({ length: 250 }, (_, i) => objet(i, 1));
    const [l1, r1] = prochainLot(file);
    const [l2, r2] = prochainLot(r1);
    const [l3, r3] = prochainLot(r2);
    expect([l1.length, l2.length, l3.length, r3.length]).toEqual([TAILLE_LOT, TAILLE_LOT, 50, 0]);
    expect([...l1, ...l2, ...l3]).toEqual(file);
  });

  it("après un lot refusé, les opérations partent une à une", () => {
    const [l, r] = prochainLot([piece(1), objet(1, 1), objet(2, 1)], true);
    expect(l).toEqual([piece(1)]);
    expect(r).toHaveLength(2);
  });

  it("un lot qui n'a pas abouti repart en tête, avant les gestes faits entre-temps", () => {
    const lot = [piece(1), objet(1, 1)];
    const apres = [objet(2, 1), piece(2)];
    expect(remettreEnTete(lot, apres)).toEqual([piece(1), objet(1, 1), objet(2, 1), piece(2)]);
  });

  it("un geste fait entre-temps sur le même objet remplace l'ancien, à sa place : la pièce reste devant ses objets", () => {
    const lot = [piece(1, "Salon"), objet(1, 1, { quantite: 1 })];
    const apres = [objet(1, 1, { quantite: 3 }), piece(1, "Séjour")];
    const f = remettreEnTete(lot, apres);
    expect(f.map((o) => o.t)).toEqual(["piece", "objet"]);
    expect(f[0]).toMatchObject({ nom: "Séjour" });
    expect(f[1]).toMatchObject({ quantite: 3 });
  });

  it("en file, une frappe par lettre ne fait qu'une opération par objet (la dernière valeur)", () => {
    let f: Operation[] = [];
    for (const nom of ["S", "Sa", "Sal", "Salo", "Salon"]) f = enfiler(f, piece(1, nom));
    for (let q = 1; q <= 5; q++) f = enfiler(f, objet(1, 1, { quantite: q }));
    expect(f).toEqual([piece(1, "Salon"), objet(1, 1, { quantite: 5 })]);
  });
});

describe("tablette/file · l'issue d'un envoi (conflits compris)", () => {
  it("chaque réponse du serveur a une issue définie", () => {
    expect([200, 201].map(issueEnvoi)).toEqual(["ok", "ok"]);
    expect([null, 0].map(issueEnvoi)).toEqual(["reseau", "reseau"]);
    expect([409, 404].map(issueEnvoi)).toEqual(["fige", "fige"]);
    expect([401, 403].map(issueEnvoi)).toEqual(["session", "session"]);
    expect([400, 413, 422].map(issueEnvoi)).toEqual(["illisible", "illisible", "illisible"]);
    expect([500, 502, 503].map(issueEnvoi)).toEqual(["serveur", "serveur", "serveur"]);
  });

  it("ce qui n'a pas pu entrer se lit en clair, pour le transmettre au bureau", () => {
    const e = { ...vide(), pieces: [{ cle: U(1), nom: "Salon", ordre: 1, remarque: null }], objets: [{ cle: U(1001), piece: U(1), libelle: "Buffet", quantite: 1, volume: 0.8, demontage: false, fragile: false, note: null }] };
    expect(decrireOperation(objet(5, 1, { libelle: "Table basse", quantite: 2, volume: 0.4 }), e)).toBe("Salon : 2 × Table basse (0,8 m³)");
    expect(decrireOperation({ t: "objet-", cle: U(1001) }, e)).toBe("Objet retiré : Buffet");
    expect(decrireOperation({ t: "piece-", cle: U(1) }, e)).toBe("Pièce retirée : Salon");
    expect(decrireOperation({ t: "visite", remarques: "Piano au 3e" }, e)).toBe("Remarques : Piano au 3e");
    expect(decrireOperation({ t: "etape", id: 7, etage: "3", ascenseur: true, escalier: null, portage_m: null, stationnement: null, poids_lourd: null, monte_meuble: null, acces: null }, e)).toBe(
      "Accès de l'adresse 1 (1 rue X)",
    );
  });
});

describe("tablette/file · hors connexion de bout en bout : dans l'ordre, sans doublon", () => {
  it("le réseau tombe, des réponses se perdent, des lots repartent : le serveur finit exactement comme la tablette", () => {
    const srv = serveur();
    let local = vide();
    let attente: Operation[] = [];
    const geste = (op: Operation) => {
      local = appliquerOp(local, op);
      attente = enfiler(attente, op);
    };
    // Un réseau capricieux, mais reproductible : coupé, réponse perdue (le serveur a bien reçu), ou correct.
    let g = 42;
    const hasard = () => (g = (g * 16807) % 2147483647) / 2147483647;
    const envoyerUnLot = () => {
      if (!attente.length) return;
      const [lot, reste] = prochainLot(attente);
      attente = reste;
      const r = hasard();
      if (r < 0.3) attente = remettreEnTete(lot, attente); // coupé : rien n'est arrivé
      else if (r < 0.55) {
        srv.recevoir(lot); // arrivé, mais la réponse s'est perdue : il repart
        attente = remettreEnTete(lot, attente);
      } else srv.recevoir(lot);
    };
    for (let p = 1; p <= 6; p++) {
      geste(piece(p, `Pièce ${p}`));
      for (let o = 0; o < 40; o++) {
        geste(objet(p * 100 + o, p, { quantite: 1 + Math.floor(hasard() * 4) }));
        if (hasard() < 0.1) geste(objet(p * 100 + o, p, { quantite: 7 })); // corrigé aussitôt
        if (hasard() < 0.05) envoyerUnLot();
      }
      if (p === 3) geste({ t: "piece-", cle: U(2) }); // une pièce retirée en route
    }
    for (let k = 0; k < 500 && attente.length; k++) envoyerUnLot();
    expect(attente).toEqual([]);
    // Le serveur a exactement ce que la tablette montre : mêmes pièces, mêmes objets, mêmes quantités, aucun en double.
    expect([...srv.etat.pieces.keys()].sort()).toEqual(local.pieces.map((x) => x.cle).sort());
    expect(srv.etat.objets.size).toBe(local.objets.length);
    for (const o of local.objets) expect(srv.etat.objets.get(o.cle)).toEqual({ piece: o.piece, quantite: o.quantite, libelle: o.libelle });
    // Des lots ont bien été reçus deux fois : c'est l'idempotence qui a évité les doublons.
    expect(srv.etat.recus).toBeGreaterThan(local.objets.length + local.pieces.length);
  });

  it("rejouer deux fois les mêmes opérations ne change rien (reprise après fermeture de l'onglet)", () => {
    const ops = [piece(1), objet(1, 1), objet(2, 1, { quantite: 4 }), { t: "objet-", cle: U(1001) } as Operation, { t: "visite", remarques: "RAS" } as Operation];
    const une = ops.reduce(appliquerOp, vide());
    expect(ops.reduce(appliquerOp, une)).toEqual(une);
  });
});

describe("tablette/etat · la destination d'une pièce", () => {
  it("une opération sans destination garde celle que la pièce avait (comme le serveur)", () => {
    let e = appliquerOp(vide(), { ...piece(1, "Chambre"), destination: 12 } as Operation);
    expect(e.pieces[0].destination).toBe(12);
    e = appliquerOp(e, piece(1, "Chambre 1"));
    expect(e.pieces[0]).toMatchObject({ nom: "Chambre 1", destination: 12 });
    e = appliquerOp(e, { ...piece(1, "Chambre 1"), destination: null } as Operation);
    expect(e.pieces[0].destination).toBeNull();
  });
});

describe("tablette/hors-ligne · les visites gardées pour être rouvertes sans réseau", () => {
  /** Un localStorage en mémoire, le temps d'un test. */
  function stockage(initial: Record<string, unknown> = {}) {
    const m = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
    const s = {
      get length() {
        return m.size;
      },
      key: (i: number) => [...m.keys()][i] ?? null,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
    vi.stubGlobal("localStorage", s);
    return m;
  }
  const inst = (utilisateur: number, le: number) => ({ v: 1, etat: vide(), majLe: "2026-11-16T10:00:00.000Z", le, utilisateur, entete: { dossier: { ref: "X" } } });
  const maintenant = Date.parse("2026-11-16T12:00:00Z");

  it("seulement celles du compte qui tenait la tablette, de moins de trois jours, ou avec des modifications en attente", async () => {
    const { visitesGardees } = await import("@/crm/visites/tablette/hors-ligne");
    stockage({
      "bailly-visite-1-instantane": inst(7, maintenant - 3600_000),
      "bailly-visite-2-instantane": inst(8, maintenant - 3600_000), // un autre compte
      "bailly-visite-3-instantane": inst(7, maintenant - 5 * 86400_000), // trop ancienne
      "bailly-visite-4-instantane": inst(7, maintenant - 5 * 86400_000), // ancienne, mais des modifications attendent
      "bailly-visite-4-file": { ops: [{ t: "visite", remarques: "x" }] },
    });
    expect(visitesGardees(7, maintenant).map((v) => [v.id, v.enAttente])).toEqual([[1, 0], [4, 1]]);
    expect(visitesGardees(null, maintenant)).toEqual([]);
    vi.unstubAllGlobals();
  });

  it("à l'écran de connexion, les vues gardées sont oubliées ; les modifications en attente, jamais", async () => {
    const { oublierVuesGardees, CLE_UTILISATEUR } = await import("@/crm/visites/tablette/hors-ligne");
    const m = stockage({
      [CLE_UTILISATEUR]: 7,
      "bailly-visite-1-instantane": inst(7, maintenant),
      "bailly-visite-1-file": { ops: [{ t: "visite", remarques: "x" }] },
      "bailly-visite-1-non-enregistrees": [{ description: "x" }],
    });
    oublierVuesGardees(null, maintenant);
    expect([...m.keys()].sort()).toEqual(["bailly-visite-1-file", "bailly-visite-1-non-enregistrees"]);
    vi.unstubAllGlobals();
  });

  it("à l'ouverture d'une visite, celles d'un autre compte et les trop anciennes s'en vont", async () => {
    const { oublierVuesGardees } = await import("@/crm/visites/tablette/hors-ligne");
    const m = stockage({ "bailly-visite-1-instantane": inst(7, maintenant), "bailly-visite-2-instantane": inst(8, maintenant), "bailly-visite-3-instantane": inst(7, maintenant - 4 * 86400_000) });
    oublierVuesGardees(7, maintenant);
    expect([...m.keys()]).toEqual(["bailly-visite-1-instantane"]);
    vi.unstubAllGlobals();
  });
});

describe("tablette/file · l'état de départ d'une page", () => {
  const serveurEtat = { ...vide(), remarques: "serveur" };
  const tablette = { ...vide(), remarques: "tablette" };
  const restes: Operation[] = [{ t: "visite", formule: "premium" }];

  it("page à jour : l'état du serveur, et les gestes restés en file rejoués par-dessus", () => {
    const d = etatDeDepart(serveurEtat, "2026-11-16T10:00:00.000Z", { etat: tablette, majLe: "2026-11-16T10:00:00.000Z" }, restes);
    expect(d.origine).toBe("serveur");
    expect(d.etat).toMatchObject({ remarques: "serveur", formule: "premium" });
  });

  it("page plus ancienne que ce que la tablette savait (servie sans réseau) : la vue de la tablette l'emporte", () => {
    const d = etatDeDepart(serveurEtat, "2026-11-16T09:00:00.000Z", { etat: tablette, majLe: "2026-11-16T10:00:00.000Z" }, restes);
    expect(d).toEqual({ etat: tablette, origine: "tablette" });
    expect(etatDeDepart(serveurEtat, null, { etat: tablette, majLe: "2026-11-16T10:00:00.000Z" }, []).origine).toBe("tablette");
  });

  it("sans vue gardée, ou une vue plus ancienne que la page : le serveur", () => {
    expect(etatDeDepart(serveurEtat, "2026-11-16T10:00:00.000Z", null, []).origine).toBe("serveur");
    expect(etatDeDepart(serveurEtat, "2026-11-16T11:00:00.000Z", { etat: tablette, majLe: "2026-11-16T10:00:00.000Z" }, []).etat.remarques).toBe("serveur");
  });
});

describe("visites/operations · les champs du 16/11/2026", () => {
  const refuse = (corps: unknown) => {
    try {
      lireOperations(corps);
    } catch (e) {
      return e instanceof ErreurSaisie ? e.statut : "autre";
    }
    return "accepté";
  };
  const etape = (o: Record<string, unknown> = {}) => ({ t: "etape", id: 3, etage: "2", ascenseur: true, escalier: "droit", portage_m: 10, stationnement: "facile", poids_lourd: "oui", monte_meuble: "non", acces: null, ...o });

  it("taille d'ascenseur et cases libres : textes bornés, vides → null, absents → inchangés", () => {
    const [op] = lireOperations({ ops: [etape({ ascenseur_taille: " 4 ", escalier_precision: "  ", stationnement_precision: "Livraisons le matin" })] });
    expect(op).toMatchObject({ ascenseur_taille: "4", escalier_precision: null, stationnement_precision: "Livraisons le matin" });
    const [ancien] = lireOperations({ ops: [etape()] });
    expect(ancien).not.toHaveProperty("ascenseur_taille");
    expect(refuse({ ops: [etape({ ascenseur_taille: "x".repeat(31) })] })).toBe(400);
    expect(refuse({ ops: [etape({ escalier_precision: "x".repeat(201) })] })).toBe(400);
    expect(refuse({ ops: [etape({ stationnement_precision: 12 })] })).toBe(400);
  });

  it("la destination d'un objet ou d'une pièce : un identifiant d'étape, ou rien", () => {
    const o = { t: "objet", cle: U(2), piece: U(1), libelle: "Canapé", quantite: 1, volume: 2.5, demontage: false, fragile: false, note: null };
    expect(lireOperations({ ops: [{ ...o, destination: 12, destinationLibre: "Don" }] })[0]).toEqual({ ...o, destination: 12 });
    expect(refuse({ ops: [{ ...o, destination: null }] })).toBe("accepté");
    for (const d of [0, -1, 1.5, "12", "Garde-meuble"]) expect(refuse({ ops: [{ ...o, destination: d }] })).toBe(400);
    expect(refuse({ ops: [{ t: "piece", cle: U(1), nom: "Salon", ordre: 1, remarque: null, destination: 4 }] })).toBe("accepté");
    expect(refuse({ ops: [{ t: "piece", cle: U(1), nom: "Salon", ordre: 1, remarque: null, destination: "4" }] })).toBe(400);
  });
});

describe("visites/compte-rendu · destinations et accès du 16/11/2026", () => {
  const base = (o: Partial<Saisie> = {}): Saisie => ({
    visite: { id: 4, dossierId: 1, statut: "en_cours", remarques: null, options: [], formule: null, commenceeLe: "2026-11-10T09:00:00Z", majLe: "", rendezVousId: null, commercial: "Paul", signeLe: null, signataire: null, empreinte: null, document: false },
    dossier: { id: 1, ref: "BD-2026-0001", client: "Martin", contact: null, telephone: null, email: null, volume: 0, type: "particulier" },
    rdv: null,
    etapes: [
      { id: 1, genre: "depart", adresse: "1 rue X, Paris", etage: "3", ascenseur: true, ascenseur_taille: "4", escalier: "droit", escalier_precision: "Marches glissantes", portage_m: null, stationnement: "facile", stationnement_precision: null, poids_lourd: null, monte_meuble: null, acces: null },
      { id: 2, genre: "garde_meuble", adresse: "Garde-meuble Gennevilliers", etage: null, ascenseur: false, ascenseur_taille: "6", escalier: null, portage_m: null, stationnement: null, poids_lourd: null, monte_meuble: null, acces: null },
      { id: 3, genre: "arrivee", adresse: "8 av. Carnot, 78110 Le Vésinet", etage: null, ascenseur: false, escalier: null, portage_m: null, stationnement: null, poids_lourd: null, monte_meuble: null, acces: null },
    ],
    destinations: [
      { id: 2, genre: "garde_meuble", libelle: "Garde-meuble" },
      { id: 3, genre: "arrivee", libelle: "Arrivée" },
    ],
    pieces: [{ cle: "p1", nom: "Salon", ordre: 1, remarque: null }],
    objets: [
      { cle: "o1", piece: "p1", libelle: "Canapé", quantite: 1, volume: 2.5, demontage: false, fragile: false, note: null, destination: 3 },
      { cle: "o2", piece: "p1", libelle: "Buffet", quantite: 2, volume: 0.8, demontage: false, fragile: false, note: null, destination: 2 },
      { cle: "o3", piece: "p1", libelle: "Vélo", quantite: 1, volume: 0.3, demontage: false, fragile: false, note: null, destination: null, destinationLibre: "Don" },
    ],
    photos: [],
    ...o,
  });

  it("plusieurs destinations : chaque objet porte la sienne, et le volume par destination suit l'ordre du trajet", () => {
    const c = contenuDe(base());
    expect(c.pieces[0].objets.map((o) => o.destination)).toEqual(["Arrivée", "Garde-meuble", "Don"]);
    expect(c.destinations).toEqual([
      { libelle: "Garde-meuble", volume: 1.6, objets: 2 },
      { libelle: "Arrivée", volume: 2.5, objets: 1 },
      { libelle: "Don", volume: 0.3, objets: 1 },
    ]);
    expect(c.destinations!.reduce((n, d) => n + d.volume, 0)).toBeCloseTo(c.volume, 5);
  });

  it("une seule destination : le contenu reste celui d'avant (ni destination par objet, ni répartition)", () => {
    const c = contenuDe(base({ destinations: [{ id: 3, genre: "arrivee", libelle: "Arrivée" }] }));
    expect(c.destinations).toBeUndefined();
    expect(c.pieces[0].objets[0]).not.toHaveProperty("destination");
  });

  it("la taille de l'ascenseur (s'il y en a un) et les cases libres figurent au trajet", () => {
    const c = contenuDe(base());
    expect(c.trajet[0]).toMatchObject({ ascenseur_taille: "4", escalier_precision: "Marches glissantes" });
    expect(c.trajet[0]).not.toHaveProperty("stationnement_precision");
    expect(c.trajet[1]).not.toHaveProperty("ascenseur_taille"); // pas d'ascenseur : la taille ne compte pas
  });
});
