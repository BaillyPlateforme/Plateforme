import { describe, expect, it } from "vitest";
import { conditionRemplie, CONDITIONS_PIECES, estCondition, LISTE_CONDITIONS } from "@/lib/espace-client/pieces";
import { calculerFrise, requirementsApplicables, suiviEquipe, type DossierSnapshot } from "@/lib/espace-client/progression";
import { pieceSchema } from "@/lib/espace-client/schemas-equipe";
import { MODELES_CIMOB, MODELES_CIMOB_A_VALIDER, PIECES_PAR_DEFAUT, PIECES_PROVISOIRES_RETIREES } from "@/lib/espace-client/seed";
import type { Client, DocumentRequirement, Dossier, TypeClient } from "@/lib/espace-client/types";

/*
 * Les pièces CIMOB/DICOM de Céline (mail du 17/11/2026) : la liste, et le
 * choix des pièces selon ce que le CRM dit du dossier (projection de la
 * migration 0021) — repli, véhicule, véhicule électrique ou hybride, arrivée
 * outre-mer, Mayotte — ou ne dit pas (dossier non relié : « si vous êtes
 * concerné »).
 */

const NOW = new Date("2026-11-18T10:00:00Z");

const dossier = (o: Partial<Dossier> = {}): Dossier => ({
  id: "do-1", client_id: "cl-1", reference: "BD-2026-0200", request_id: null, ville_depart: "Toulon", ville_arrivee: "Saint-Denis",
  adresse_depart: "1 rue A", adresse_arrivee: "2 rue B", periode_debut: "2026-12-14", periode_fin: "2026-12-15",
  portee: "national", mode_transport: "route", pays_destination: "FR", statut: "en_preparation", volume_m3: 30,
  formule: "standard", logement: null, compagnie: null, numero_conteneur: null, url_tracking: null, statut_conteneur: null,
  navire: null, port_depart: null, port_arrivee: null, eta: null, cartons_non_necessaires: false, photo: "", termine_le: null,
  avis_demande_le: null, created_at: "2026-09-01T10:00:00Z", ...o,
});

/** Un dossier relié au CRM, déjà projeté : rien d'inconnu, sauf ce qu'on précise. */
const relie = (o: Partial<Dossier> = {}) =>
  dossier({ crm_dossier_id: 42, repli: false, vehicules: 0, vehicule_electrique: false, departements_om_depart: [], departements_om_arrivee: ["974"], ...o });

const client = (type: TypeClient): Client => ({
  id: "cl-1", type, civilite: "Monsieur", prenom: "Thomas", nom: "Lefort", societe: null, email: "t@example.com", telephone: "0600000000",
  masquer_devis: type === "militaire", masquer_factures: type === "militaire", conseiller_id: "co-1", auth_user_id: null,
  sessions_revoquees_le: null, demo: true, created_at: "2026-09-01T10:00:00Z",
});

const ids = (l: DocumentRequirement[]) => l.map((r) => r.id);
const pieces = (d: Dossier, segment: TypeClient = "militaire") => requirementsApplicables(d, segment, PIECES_PAR_DEFAUT);
const piece = (l: DocumentRequirement[], id: string) => l.find((r) => r.id === id);

/** Les pièces CIMOB/DICOM demandées sans condition (avec la pièce d'identité commune). */
const TOUJOURS = ["rq-id", "rq-cimob-non-cession", "rq-cimob-articles-prohibes", "rq-cimob-cerfa", "rq-cimob-mutation", "rq-cimob-domicile", "rq-cimob-imposition"];
const VEHICULE = ["rq-cimob-vehicule-valeur", "rq-cimob-carte-grise", "rq-cimob-non-gage"];

describe("la liste de Céline (seed.ts)", () => {
  const cimob = PIECES_PAR_DEFAUT.filter((p) => p.segment === "militaire");

  it("14 pièces CIMOB/DICOM : 10 de la liste (la pièce d'identité est la pièce commune) et 4 pour le véhicule", () => {
    expect(cimob).toHaveLength(14);
    expect(cimob.filter((p) => !p.condition).map((p) => p.id)).toEqual(TOUJOURS.slice(1));
    const identite = PIECES_PAR_DEFAUT.find((p) => p.id === "rq-id")!;
    expect(identite).toMatchObject({ segment: null, pays: null, obligatoire: true });
    expect(identite.condition).toBeUndefined();
  });

  it("les conditions : Mayotte, repli, outre-mer, véhicule, électrique ou hybride", () => {
    const parCondition = Object.fromEntries(LISTE_CONDITIONS.map((c) => [c.cle, cimob.filter((p) => p.condition === c.cle).map((p) => p.id)]));
    expect(parCondition).toEqual({
      repli: ["rq-cimob-valeurs-repli"],
      vehicule: VEHICULE,
      vehicule_electrique: ["rq-cimob-batterie"],
      destination_outre_mer: ["rq-cimob-valeurs-om", "rq-cimob-hebergement"],
      destination_mayotte: ["rq-cimob-residence"],
    });
  });

  it("les deux pièces provisoires ne sont plus dans la liste", () => {
    for (const p of PIECES_PROVISOIRES_RETIREES) {
      expect(PIECES_PAR_DEFAUT.some((x) => x.id === p.id || x.libelle === p.libelle)).toBe(false);
    }
  });

  it("les règles d'assurance du CIMOB, en information dans les pièces concernées", () => {
    const desc = (id: string) => PIECES_PAR_DEFAUT.find((p) => p.id === id)!.description;
    expect(desc("rq-cimob-valeurs-repli")).toMatch(/500 €\/m³ de vos droits.*0,5 %/);
    expect(desc("rq-cimob-valeurs-om")).toMatch(/500 €\/m³ de vos droits.*2,80 %/);
    expect(desc("rq-cimob-vehicule-valeur")).toMatch(/un seul véhicule.*5 000 € pour le 1er véhicule.*2,00 %/);
    expect(desc("rq-cimob-vehicule-valeur")).toMatch(/une déclaration de valeurs par véhicule/);
    expect(desc("rq-cimob-articles-prohibes")).toMatch(/aucun alcool n'est admis sans être taxé à l'arrivée \(y compris les bouteilles entamées\)/);
    expect(desc("rq-cimob-non-gage")).toContain("https://siv.interieur.gouv.fr/map-usg-ui/do/accueil_certificat");
  });

  it("chaque pièce passe le formulaire de l'éditeur (libellé, description, condition)", () => {
    for (const p of PIECES_PAR_DEFAUT) {
      const r = pieceSchema.safeParse({ ...p, pays: p.pays ?? "", segment: p.segment ?? "", condition: p.condition ?? "", ordre: String(p.ordre) });
      expect(r.success, p.id).toBe(true);
      if (r.success) expect(r.data.condition).toBe(p.condition ?? null);
    }
  });

  it("une condition inconnue est refusée par l'éditeur ; vide, la pièce n'en a pas", () => {
    const base = { pays: "", segment: "militaire", libelle: "Une pièce", description: "", obligatoire: true, ordre: "5" };
    expect(pieceSchema.safeParse({ ...base, condition: "toString" }).success).toBe(false);
    expect(pieceSchema.safeParse(base).data?.condition).toBeNull();
  });

  it("chaque modèle se rattache à une pièce de la liste, sans fichier du dépôt ni nom de personne", () => {
    for (const m of [...MODELES_CIMOB, ...MODELES_CIMOB_A_VALIDER]) {
      expect(PIECES_PAR_DEFAUT.some((p) => p.id === m.piece), m.id).toBe(true);
      expect(m.fichier).not.toMatch(/\//);
    }
    // Le CERFA a son modèle et un exemple rempli.
    expect(MODELES_CIMOB.filter((m) => m.piece === "rq-cimob-cerfa").map((m) => m.libelle)).toEqual(["Modèle", "Exemple rempli"]);
    // L'inventaire-déclaration attend Céline : pas dans les modèles posés par défaut.
    expect(MODELES_CIMOB.some((m) => /INVENTAIRE/.test(m.fichier))).toBe(false);
  });
});

describe("conditionRemplie — ce que le CRM dit du dossier", () => {
  it("non relié (rien de projeté) : on ne sait pas, quelle que soit la condition", () => {
    for (const c of LISTE_CONDITIONS) expect(conditionRemplie(c.cle, dossier(), "militaire"), c.cle).toBeNull();
  });

  it("repli : oui, non, ou fenêtre jamais enregistrée", () => {
    expect(conditionRemplie("repli", relie({ repli: true }), "militaire")).toBe(true);
    expect(conditionRemplie("repli", relie({ repli: false }), "militaire")).toBe(false);
    expect(conditionRemplie("repli", relie({ repli: null }), "militaire")).toBeNull();
  });

  it("véhicule et batterie : sans véhicule, pas de batterie ; une motorisation inconnue, on ne sait pas", () => {
    expect(conditionRemplie("vehicule", relie({ vehicules: 2 }), "militaire")).toBe(true);
    expect(conditionRemplie("vehicule", relie({ vehicules: 0 }), "militaire")).toBe(false);
    expect(conditionRemplie("vehicule_electrique", relie({ vehicules: 0, vehicule_electrique: null }), "militaire")).toBe(false);
    expect(conditionRemplie("vehicule_electrique", relie({ vehicules: 1, vehicule_electrique: true }), "militaire")).toBe(true);
    expect(conditionRemplie("vehicule_electrique", relie({ vehicules: 1, vehicule_electrique: false }), "militaire")).toBe(false);
    expect(conditionRemplie("vehicule_electrique", relie({ vehicules: 1, vehicule_electrique: null }), "militaire")).toBeNull();
    expect(conditionRemplie("vehicule_electrique", relie({ vehicules: null }), "militaire")).toBeNull();
  });

  it("outre-mer et Mayotte : l'arrivée décide ; un retour en métropole n'est pas une arrivée outre-mer", () => {
    expect(conditionRemplie("destination_outre_mer", relie({ departements_om_arrivee: ["972"] }), "militaire")).toBe(true);
    expect(conditionRemplie("destination_mayotte", relie({ departements_om_arrivee: ["972"] }), "militaire")).toBe(false);
    expect(conditionRemplie("destination_mayotte", relie({ departements_om_arrivee: ["976"] }), "militaire")).toBe(true);
    const retour = relie({ departements_om_depart: ["976"], departements_om_arrivee: [] });
    expect(conditionRemplie("destination_outre_mer", retour, "militaire")).toBe(false);
    expect(conditionRemplie("destination_mayotte", retour, "militaire")).toBe(false);
  });

  it("aucune adresse outre-mer : pour un CIMOB/DICOM, le département manque (on ne sait pas) ; pour un particulier, non", () => {
    const metropole = relie({ departements_om_depart: [], departements_om_arrivee: [] });
    expect(conditionRemplie("destination_outre_mer", metropole, "militaire")).toBeNull();
    expect(conditionRemplie("destination_mayotte", metropole, "militaire")).toBeNull();
    expect(conditionRemplie("destination_outre_mer", metropole, "particulier")).toBe(false);
  });

  it("une condition inconnue du code ne cache rien", () => {
    expect(conditionRemplie("garde_meuble", relie(), "militaire")).toBeNull();
    expect(estCondition("garde_meuble")).toBe(false);
    expect(estCondition("__proto__")).toBe(false);
    expect(estCondition("repli")).toBe(true);
    expect(Object.keys(CONDITIONS_PIECES)).toHaveLength(5);
  });
});

describe("requirementsApplicables — les pièces demandées à un dossier CIMOB/DICOM", () => {
  it("relié, sans repli ni véhicule, arrivée à La Réunion : les pièces de toujours et celles de l'outre-mer", () => {
    const l = pieces(relie());
    expect(ids(l)).toEqual([...TOUJOURS, "rq-cimob-valeurs-om", "rq-cimob-hebergement"]);
    expect(l.every((r) => r.obligatoire && !r.si_concerne)).toBe(true);
    expect(piece(l, "rq-cimob-residence")).toBeUndefined();
  });

  it("repli : sa déclaration de valeurs est demandée, obligatoire", () => {
    expect(piece(pieces(relie({ repli: true })), "rq-cimob-valeurs-repli")).toMatchObject({ obligatoire: true });
    expect(piece(pieces(relie({ repli: false })), "rq-cimob-valeurs-repli")).toBeUndefined();
  });

  it("un véhicule thermique : déclaration de valeur, carte grise, non gage — pas la fiche de la batterie", () => {
    const l = pieces(relie({ vehicules: 1, vehicule_electrique: false }));
    for (const id of VEHICULE) expect(piece(l, id), id).toMatchObject({ obligatoire: true });
    expect(piece(l, "rq-cimob-batterie")).toBeUndefined();
  });

  it("un véhicule électrique ou hybride : la fiche MSDS de la batterie en plus", () => {
    expect(piece(pieces(relie({ vehicules: 1, vehicule_electrique: true })), "rq-cimob-batterie")).toMatchObject({ obligatoire: true });
  });

  it("aucun véhicule : aucune des quatre pièces du véhicule", () => {
    const l = pieces(relie({ vehicules: 0 }));
    for (const id of [...VEHICULE, "rq-cimob-batterie"]) expect(piece(l, id), id).toBeUndefined();
  });

  it("arrivée à Mayotte : le certificat de changement de résidence, et les pièces de l'outre-mer", () => {
    const l = pieces(relie({ departements_om_arrivee: ["976"] }));
    expect(piece(l, "rq-cimob-residence")).toMatchObject({ obligatoire: true });
    expect(piece(l, "rq-cimob-valeurs-om")).toBeDefined();
  });

  it("retour en métropole : ni Mayotte, ni le lot outre-mer, ni l'hébergement à destination", () => {
    const l = pieces(relie({ departements_om_depart: ["973"], departements_om_arrivee: [] }));
    for (const id of ["rq-cimob-residence", "rq-cimob-valeurs-om", "rq-cimob-hebergement"]) expect(piece(l, id), id).toBeUndefined();
    expect(ids(l)).toEqual(TOUJOURS);
  });

  it("non relié au CRM : toutes les pièces conditionnelles restent, facultatives, « si vous êtes concerné »", () => {
    const l = pieces(dossier());
    expect(l).toHaveLength(15);
    const conditionnelles = l.filter((r) => r.condition);
    expect(conditionnelles).toHaveLength(8);
    expect(conditionnelles.every((r) => r.si_concerne && !r.obligatoire)).toBe(true);
    expect(l.filter((r) => !r.condition).every((r) => r.obligatoire && !r.si_concerne)).toBe(true);
  });

  it("relié mais repli et motorisation inconnus : ces pièces-là seules passent en « si vous êtes concerné »", () => {
    const l = pieces(relie({ repli: null, vehicules: 1, vehicule_electrique: null }));
    expect(piece(l, "rq-cimob-valeurs-repli")).toMatchObject({ si_concerne: true, obligatoire: false });
    expect(piece(l, "rq-cimob-batterie")).toMatchObject({ si_concerne: true, obligatoire: false });
    expect(piece(l, "rq-cimob-carte-grise")).toMatchObject({ obligatoire: true });
    expect(piece(l, "rq-cimob-carte-grise")?.si_concerne).toBeUndefined();
  });

  it("la liste du segment ne change pas l'objet d'origine (la pièce reste obligatoire dans le catalogue)", () => {
    pieces(dossier());
    expect(PIECES_PAR_DEFAUT.find((p) => p.id === "rq-cimob-valeurs-repli")).toMatchObject({ obligatoire: true });
    expect(PIECES_PAR_DEFAUT.some((p) => p.si_concerne)).toBe(false);
  });

  it("un particulier ou un logement social ne voit aucune pièce CIMOB/DICOM", () => {
    for (const segment of ["particulier", "grand_compte", "logement_social"] as const) {
      expect(pieces(relie({ repli: true, vehicules: 1, departements_om_arrivee: ["976"] }), segment).some((r) => r.id.startsWith("rq-cimob")), segment).toBe(false);
    }
  });
});

describe("la frise et le suivi de l'équipe, avec des pièces « si vous êtes concerné »", () => {
  const snap = (d: Dossier, documents: DossierSnapshot["documents"] = []): DossierSnapshot => ({
    client: client("militaire"), dossier: d, devis: [], factures: [], documents, requirements: requirementsApplicables(d, "militaire", PIECES_PAR_DEFAUT),
    acceptations: [], declaration: null, conditions: null, livraisons: [], sav: [], creneaux: [], visites: [],
  });
  const depot = (requirement_id: string) => ({
    id: `doc-${requirement_id}`, dossier_id: "do-1", categorie: "segment", libelle: "x", source: "client" as const, chemin: "", nom_fichier: "x.pdf",
    taille_octets: 1, mime: "application/pdf", requirement_id, created_by: "cl-1", created_at: "2026-11-10T10:00:00Z",
  });

  it("non relié : l'étape « Documents militaires » ne compte que les 6 pièces obligatoires du segment", () => {
    const f = calculerFrise(snap(dossier()), NOW);
    expect(f.find((e) => e.cle === "segment")).toMatchObject({ titre: "Documents militaires", statut: "a_faire", detail: "6 pièces à déposer" });
  });

  it("les 6 pièces déposées : l'étape est faite, même si les pièces « si concerné » ne le sont pas", () => {
    const s = snap(dossier(), TOUJOURS.slice(1).map(depot));
    expect(calculerFrise(s, NOW).find((e) => e.cle === "segment")).toMatchObject({ statut: "fait", detail: "Pièces reçues" });
    expect(suiviEquipe(s, undefined, NOW).pieces).toMatchObject({ recues: 6, demandees: 7, manquantes: ["Pièce d'identité"] });
  });

  it("relié avec repli et un véhicule : ces pièces comptent parmi les manquantes", () => {
    const s = snap(relie({ repli: true, vehicules: 1, vehicule_electrique: false }), [...TOUJOURS.map(depot)]);
    expect(suiviEquipe(s, undefined, NOW).pieces.manquantes).toEqual([
      "Déclaration de valeurs pour votre repli",
      "Déclaration de valeurs pour votre lot à destination de l'outre-mer",
      "Attestation d'hébergement à destination",
      "Déclaration de valeur de votre véhicule",
      "Copie de la carte grise de votre véhicule",
      "Certificat de non gage",
    ]);
  });
});
