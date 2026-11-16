import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  aAccepte,
  arrhesPayees,
  avancement,
  calculerFrise,
  creneauxAChoisir,
  dernierCompteRendu,
  devisRetenu,
  estInternationalSuivi,
  factureArrhes,
  livraisonCourante,
  livraisonEffectuee,
  montantArrhes,
  piecesManquantes,
  prochaineEtape,
  requirementsApplicables,
  suiviEquipe,
  texteProchaineEtape,
  visibilite,
  visiteAVenir,
  type DossierSnapshot,
  type Etape,
} from "@/lib/espace-client/progression";
import type {
  Acceptation, Client, CreneauVisite, Devis, DocumentFichier, DocumentRequirement, Dossier, Facture, LivraisonCartons, VisiteTechnique,
} from "@/lib/espace-client/types";
import { esp } from "./_outils";

const NOW = new Date("2026-11-15T10:00:00Z");

// ── Fixtures ───────────────────────────────────────────────────────────────
const client = (o: Partial<Client> = {}): Client => ({
  id: "cl-1", type: "particulier", civilite: "Madame", prenom: "Claire", nom: "Dumont", societe: null,
  email: "claire@example.com", telephone: "0600000000", masquer_devis: false, masquer_factures: false,
  conseiller_id: "co-1", auth_user_id: null, sessions_revoquees_le: null, demo: true, created_at: "2026-09-01T10:00:00Z", ...o,
});
const dossier = (o: Partial<Dossier> = {}): Dossier => ({
  id: "do-1", client_id: "cl-1", reference: "BD-2026-0164", request_id: null, ville_depart: "Massy", ville_arrivee: "Lyon",
  adresse_depart: "1 rue A", adresse_arrivee: "2 rue B", periode_debut: "2026-12-14", periode_fin: "2026-12-15",
  portee: "national", mode_transport: "route", pays_destination: "FR", statut: "en_preparation", volume_m3: 30,
  formule: "standard", logement: null, compagnie: null, numero_conteneur: null, url_tracking: null, statut_conteneur: null,
  navire: null, port_depart: null, port_arrivee: null, eta: null, cartons_non_necessaires: false, photo: "", termine_le: null,
  avis_demande_le: null, created_at: "2026-09-01T10:00:00Z", ...o,
});
const devis = (o: Partial<Devis> = {}): Devis => ({
  id: "dv-1", dossier_id: "do-1", numero: "D-2026-0001", formule: "Standard", lignes: [], inclus: [], montant_ht: 1028.8,
  montant_ttc: 1234.56, arrhes_pourcentage: 30, statut: "envoye", emis_le: "2026-10-01", valide_jusqu_au: "2026-12-01",
  accepte_le: null, ...o,
});
const facture = (o: Partial<Facture> = {}): Facture => ({
  id: "fa-1", dossier_id: "do-1", devis_id: "dv-1", numero: "FA-1", type: "arrhes", libelle: "Arrhes", montant_ttc: 370.37,
  statut: "payee", emise_le: "2026-10-03", echeance: "2026-10-10", periode: null, payee_le: "2026-10-04", paiement_ref: null, ...o,
});
const acceptation = (type: Acceptation["type"], accepted_at: string, version = "v1"): Acceptation => ({
  id: `ac-${type}-${accepted_at}`, dossier_id: "do-1", type, version_texte: version, accepted_at, ip: "", user_agent: "",
});
const exigence = (o: Partial<DocumentRequirement>): DocumentRequirement => ({
  id: "rq", pays: null, segment: null, libelle: "Pièce", description: "", obligatoire: true, ordre: 0, ...o,
});
const document = (requirement_id: string, created_at = "2026-10-05T10:00:00Z"): DocumentFichier => ({
  id: `doc-${requirement_id}`, dossier_id: "do-1", categorie: "x", libelle: "x", source: "client", chemin: "", nom_fichier: "x.pdf",
  taille_octets: 1, mime: "application/pdf", requirement_id, created_by: "cl-1", created_at,
});
const livraison = (o: Partial<LivraisonCartons> = {}): LivraisonCartons => ({
  id: "lv-1", dossier_id: "do-1", date_samedi: "2026-11-28", adresse: "1 rue A", complement: null, code_acces: null,
  contact_nom: "Claire Dumont", contact_tel: "0600000000", nb_cartons: null, ordre_passage: null, creneau_debut: null,
  creneau_fin: null, lat: null, lng: null, statut: "demandee", creneau_envoye_le: null, created_at: "2026-11-01T10:00:00Z", ...o,
});
const creneau = (debut: string, statut: CreneauVisite["statut"] = "propose"): CreneauVisite => ({
  id: `cr-${debut}`, dossier_id: "do-1", crm_creneau_id: 1, crm_proposition_id: 1, debut, duree_min: 60, mode: "sur_place",
  statut, conseiller: "Nadia", autres_demandes_le: null,
});
const visite = (o: Partial<VisiteTechnique>): VisiteTechnique => ({
  id: "vi-1", dossier_id: "do-1", cle: "r1", crm_rendez_vous_id: 1, crm_visite_id: null, debut: null, duree_min: 60,
  mode: "sur_place", conseiller: "Nadia", statut: "planifiee", signe_le: null, signataire: null, empreinte: null,
  volume_m3: null, pieces: null, photos: null, document_id: null, ...o,
});
const snap = (o: Partial<DossierSnapshot> = {}): DossierSnapshot => ({
  client: client(), dossier: dossier(), devis: [], factures: [], documents: [], requirements: [], acceptations: [],
  declaration: null, conditions: null, livraisons: [], sav: [], creneaux: [], visites: [], ...o,
});
const conditionsValides = {
  conditions: { valide_at: "2026-10-20T10:00:00Z" } as DossierSnapshot["conditions"],
  acceptations: [acceptation("conditions_livraison", "2026-10-20T10:00:00Z")],
};
const etape = (f: Etape[], cle: Etape["cle"]) => f.find((e) => e.cle === cle);

// ── Outils ─────────────────────────────────────────────────────────────────
describe("outils de la frise", () => {
  it("estInternationalSuivi : international par mer ou par air seulement", () => {
    expect(estInternationalSuivi({ portee: "international", mode_transport: "maritime" })).toBe(true);
    expect(estInternationalSuivi({ portee: "international", mode_transport: "aerien" })).toBe(true);
    expect(estInternationalSuivi({ portee: "international", mode_transport: "route" })).toBe(false);
    expect(estInternationalSuivi({ portee: "national", mode_transport: "maritime" })).toBe(false);
  });

  it("requirementsApplicables : toutes destinations, plus celles du pays à l'international ; segment filtré ; trié par ordre", () => {
    const tous = [
      exigence({ id: "id", ordre: 3 }),
      exigence({ id: "ca", pays: "CA", ordre: 1 }),
      exigence({ id: "be", pays: "BE", ordre: 2 }),
      exigence({ id: "mil", segment: "militaire", ordre: 0 }),
    ];
    expect(requirementsApplicables(dossier({ portee: "international", pays_destination: "CA" }), "particulier", tous).map((r) => r.id)).toEqual(["ca", "id"]);
    expect(requirementsApplicables(dossier({ portee: "national", pays_destination: "CA" }), "particulier", tous).map((r) => r.id)).toEqual(["id"]);
    expect(requirementsApplicables(dossier(), "militaire", tous).map((r) => r.id)).toEqual(["mil", "id"]);
  });

  it("aAccepte : la plus récente acceptation du type ; rien sinon", () => {
    const a = [acceptation("cgv", "2026-10-01T10:00:00Z", "v1"), acceptation("cgv", "2026-10-05T10:00:00Z", "v2"), acceptation("rgpd", "2026-10-09T10:00:00Z")];
    expect(aAccepte(a, "cgv")!.version_texte).toBe("v2");
    expect(aAccepte(a, "conditions_livraison")).toBeNull();
    expect(a[0].version_texte).toBe("v1"); // la liste n'est pas réordonnée
  });

  it("devisRetenu : l'accepté le plus récent", () => {
    const d = [devis({ id: "a", statut: "accepte", emis_le: "2026-09-01" }), devis({ id: "b", statut: "accepte", emis_le: "2026-10-01" }), devis({ id: "c", statut: "envoye", emis_le: "2026-11-01" })];
    expect(devisRetenu(d)!.id).toBe("b");
    expect(devisRetenu([devis()])).toBeNull();
  });

  it("arrhes : payées si la facture d'arrhes du devis est réglée, ou s'il n'y en a pas", () => {
    const d = devis({ statut: "accepte" });
    expect(arrhesPayees(d, [facture()])).toBe(true);
    expect(arrhesPayees(d, [facture({ statut: "a_payer" })])).toBe(false);
    expect(arrhesPayees(d, [facture({ devis_id: "autre" })])).toBe(false);
    expect(arrhesPayees(d, [facture({ type: "solde" })])).toBe(false);
    expect(arrhesPayees({ ...d, arrhes_pourcentage: 0 }, [])).toBe(true);
    expect(factureArrhes(d, [facture({ statut: "a_payer" }), facture({ id: "fa-2" })])!.id).toBe("fa-2");
  });

  it("montantArrhes : TTC × pourcentage, au centime (1 234,56 × 30 % = 370,368 → 370,37)", () => {
    expect(montantArrhes(devis())).toBe(370.37);
    expect(montantArrhes(devis({ montant_ttc: 1000, arrhes_pourcentage: 0 }))).toBe(0);
    expect(montantArrhes(devis({ montant_ttc: 1000, arrhes_pourcentage: 100 }))).toBe(1000);
  });

  it("livraisonEffectuee : dossier terminé, ou dernier jour passé (à minuit)", () => {
    expect(livraisonEffectuee(dossier({ statut: "termine", periode_fin: "2099-01-01" }), NOW)).toBe(true);
    expect(livraisonEffectuee(dossier({ periode_fin: "2026-11-15" }), new Date("2026-11-15T22:58:00Z"))).toBe(false); // 23 h 58 à Paris
    expect(livraisonEffectuee(dossier({ periode_fin: "2026-11-15" }), new Date("2026-11-15T23:00:00Z"))).toBe(true); // minuit à Paris
    expect(livraisonEffectuee(dossier({ periode_fin: "2026-11-16" }), NOW)).toBe(false);
  });

  it("piecesManquantes : les obligatoires sans document, filtre facultatif", () => {
    const s = { requirements: [exigence({ id: "a" }), exigence({ id: "b" }), exigence({ id: "c", obligatoire: false }), exigence({ id: "d", pays: "CA" })], documents: [document("a")] };
    expect(piecesManquantes(s).map((r) => r.id)).toEqual(["b", "d"]);
    expect(piecesManquantes(s, (r) => r.pays !== null).map((r) => r.id)).toEqual(["d"]);
  });

  it("livraisonCourante : celle qui reste à faire, sinon la première ; rien sans livraison", () => {
    expect(livraisonCourante([livraison({ id: "x", statut: "livree" }), livraison({ id: "y" })])!.id).toBe("y");
    expect(livraisonCourante([livraison({ id: "x", statut: "livree" }), livraison({ id: "z", statut: "livree" })])!.id).toBe("x");
    expect(livraisonCourante([])).toBeNull();
  });

  it("creneauxAChoisir : les proposés à venir, du plus proche au plus lointain", () => {
    const s = { creneaux: [creneau("2026-11-20T09:00:00Z"), creneau("2026-11-18T09:00:00Z"), creneau("2026-11-10T09:00:00Z"), creneau("2026-11-19T09:00:00Z", "libere")] };
    expect(creneauxAChoisir(s, NOW).map((c) => c.debut)).toEqual(["2026-11-18T09:00:00Z", "2026-11-20T09:00:00Z"]);
  });

  it("visiteAVenir : la visite en cours d'abord, sinon la prochaine planifiée", () => {
    const planifiees = [visite({ id: "b", debut: "2026-11-25T09:00:00Z" }), visite({ id: "a", debut: "2026-11-20T09:00:00Z" }), visite({ id: "sans-date" })];
    expect(visiteAVenir({ visites: planifiees })!.id).toBe("a");
    expect(visiteAVenir({ visites: [...planifiees, visite({ id: "c", statut: "en_cours" })] })!.id).toBe("c");
    expect(visiteAVenir({ visites: [] })).toBeNull();
  });

  it("dernierCompteRendu : la visite signée la plus récente", () => {
    const v = [visite({ id: "a", statut: "signee", signe_le: "2026-10-01T10:00:00Z" }), visite({ id: "b", statut: "signee", signe_le: "2026-10-09T10:00:00Z" }), visite({ id: "c", statut: "realisee" })];
    expect(dernierCompteRendu({ visites: v })!.id).toBe("b");
  });
});

// ── La frise du client ────────────────────────────────────────────────────
describe("calculerFrise — un particulier qui commence", () => {
  const f = calculerFrise(snap(), NOW);

  it("les étapes dans l'ordre : visite, devis, conditions, valeurs, CGV, cartons, solde, réalisé", () => {
    expect(f.map((e) => e.cle)).toEqual(["visite", "devis", "conditions", "valeurs", "cgv", "cartons", "solde", "realise"]);
  });

  it("visite en attente des créneaux, sans lien", () => {
    expect(etape(f, "visite")).toMatchObject({ statut: "en_attente", detail: "Créneaux à venir", cible: null });
  });

  it("devis en préparation, conditions bloquantes à faire, cartons facultatifs", () => {
    expect(etape(f, "devis")).toMatchObject({ statut: "en_attente", detail: "Devis en préparation", cible: null });
    expect(etape(f, "conditions")).toMatchObject({ statut: "a_faire", bloquante: true, detail: "Questionnaire à compléter" });
    expect(etape(f, "cartons")).toMatchObject({ statut: "a_faire", optionnelle: true, detail: "Choisir un samedi" });
    expect(etape(f, "solde")).toMatchObject({ statut: "en_attente", detail: "Facture avant le départ", cible: null });
  });

  it("le déménagement attend les conditions de livraison (étape bloquante)", () => {
    expect(etape(f, "realise")).toMatchObject({ statut: "en_attente", detail: "Après vos conditions de livraison" });
  });

  it("prochaine étape : la première à faire ; avancement 0 sur 8", () => {
    expect(prochaineEtape(f)!.cle).toBe("conditions");
    expect(avancement(f)).toEqual({ faites: 0, total: 8, pourcent: 0 });
  });
});

describe("calculerFrise — le devis et les arrhes", () => {
  it("devis envoyé : à accepter, et l'étape de visite disparaît (dossier avancé)", () => {
    const f = calculerFrise(snap({ devis: [devis()] }), NOW);
    expect(etape(f, "devis")).toMatchObject({ statut: "a_faire", detail: "Devis à accepter", cible: "devis" });
    expect(etape(f, "visite")).toBeUndefined();
  });

  it("devis accepté, arrhes de 30 % non réglées : « Arrhes à régler »", () => {
    const f = calculerFrise(snap({ devis: [devis({ statut: "accepte", accepte_le: "2026-10-02" })] }), NOW);
    expect(etape(f, "devis")).toMatchObject({ statut: "a_faire", detail: "Arrhes à régler" });
  });

  it("arrhes réglées : fait, à la date du paiement", () => {
    const f = calculerFrise(snap({ devis: [devis({ statut: "accepte", accepte_le: "2026-10-02" })], factures: [facture({ payee_le: "2026-10-04" })] }), NOW);
    expect(etape(f, "devis")).toMatchObject({ statut: "fait", detail: "Fait le 4 octobre" });
  });

  it("devis sans arrhes : fait, à la date d'acceptation", () => {
    const f = calculerFrise(snap({ devis: [devis({ statut: "accepte", accepte_le: "2026-10-02", arrhes_pourcentage: 0 })] }), NOW);
    expect(etape(f, "devis")).toMatchObject({ statut: "fait", detail: "Fait le 2 octobre" });
  });

  it("grand compte : pas de paiement en ligne, le devis accepté suffit", () => {
    const f = calculerFrise(snap({ client: client({ type: "grand_compte" }), devis: [devis({ statut: "accepte", accepte_le: "2026-10-02" })] }), NOW);
    expect(etape(f, "devis")!.statut).toBe("fait");
  });

  it("devis masqués : « Validé avec votre entreprise »", () => {
    const f = calculerFrise(snap({ client: client({ type: "grand_compte", masquer_devis: true }) }), NOW);
    expect(etape(f, "devis")).toMatchObject({ statut: "fait", detail: "Validé avec votre entreprise" });
    expect(etape(f, "visite")).toBeUndefined();
  });

  it("militaire : prise en charge par bordereau, puis confirmée", () => {
    expect(etape(calculerFrise(snap({ client: client({ type: "militaire" }) }), NOW), "prise_en_charge")).toMatchObject({
      statut: "en_attente", detail: "Par bordereau de l'administration",
    });
    const f = calculerFrise(snap({ client: client({ type: "militaire" }), dossier: dossier({ commande_le: "2026-10-12" }) }), NOW);
    expect(etape(f, "prise_en_charge")).toMatchObject({ statut: "fait", detail: "Confirmée le 12 octobre" });
    expect(etape(f, "devis")).toBeUndefined();
  });
});

describe("calculerFrise — formulaires, pièces, cartons, solde", () => {
  it("conditions de livraison : il faut le questionnaire validé ET la certification", () => {
    expect(etape(calculerFrise(snap({ conditions: conditionsValides.conditions }), NOW), "conditions")!.statut).toBe("a_faire");
    expect(etape(calculerFrise(snap({ acceptations: conditionsValides.acceptations }), NOW), "conditions")!.statut).toBe("a_faire");
    const f = calculerFrise(snap(conditionsValides), NOW);
    expect(etape(f, "conditions")).toMatchObject({ statut: "fait", detail: "Fait le 20 octobre" });
    expect(etape(f, "realise")!.detail).toBe("Le 14 décembre");
  });

  it("déclaration de valeurs : faite une fois soumise", () => {
    const s = snap({ declaration: { statut: "soumise", soumise_at: "2026-10-21T10:00:00Z" } as DossierSnapshot["declaration"] });
    expect(etape(calculerFrise(s, NOW), "valeurs")).toMatchObject({ statut: "fait", detail: "Fait le 21 octobre" });
    const brouillon = snap({ declaration: { statut: "brouillon", soumise_at: null } as DossierSnapshot["declaration"] });
    expect(etape(calculerFrise(brouillon, NOW), "valeurs")!.statut).toBe("a_faire");
  });

  it("CGV et RGPD : les deux, datées de la CGV", () => {
    const deux = snap({ acceptations: [acceptation("cgv", "2026-10-03T10:00:00Z"), acceptation("rgpd", "2026-10-04T10:00:00Z")] });
    expect(etape(calculerFrise(deux, NOW), "cgv")).toMatchObject({ statut: "fait", detail: "Fait le 3 octobre" });
    expect(etape(calculerFrise(snap({ acceptations: [acceptation("cgv", "2026-10-03T10:00:00Z")] }), NOW), "cgv")!.statut).toBe("a_faire");
  });

  it("pièces du segment : documents militaires, puis reçues", () => {
    const mil = client({ type: "militaire" });
    const req = [exigence({ id: "om", segment: "militaire", libelle: "Ordre de mutation" }), exigence({ id: "cm", segment: "militaire", libelle: "Carte militaire" })];
    const f = calculerFrise(snap({ client: mil, requirements: req, documents: [document("om")] }), NOW);
    expect(etape(f, "segment")).toMatchObject({ titre: "Documents militaires", statut: "a_faire", detail: "1 pièce à déposer" });
    const ok = calculerFrise(snap({ client: mil, requirements: req, documents: [document("om"), document("cm")] }), NOW);
    expect(etape(ok, "segment")).toMatchObject({ statut: "fait", detail: "Pièces reçues" });
  });

  it("pas d'étape de pièces pour un particulier, ni pour un segment sans pièce propre", () => {
    expect(etape(calculerFrise(snap({ requirements: [exigence({ id: "x" })] }), NOW), "segment")).toBeUndefined();
    expect(etape(calculerFrise(snap({ client: client({ type: "militaire" }) }), NOW), "segment")).toBeUndefined();
  });

  it("documents du pays : à l'international seulement", () => {
    const inter = dossier({ portee: "international", pays_destination: "CA" });
    expect(etape(calculerFrise(snap({ dossier: inter }), NOW), "pays")).toMatchObject({ statut: "fait", detail: "Dossier Canada complet" });
    const req = [exigence({ id: "visa", pays: "CA" }), exigence({ id: "inv", pays: "CA" })];
    expect(etape(calculerFrise(snap({ dossier: inter, requirements: req }), NOW), "pays")).toMatchObject({ statut: "a_faire", detail: "2 pièces à déposer" });
    expect(etape(calculerFrise(snap(), NOW), "pays")).toBeUndefined();
  });

  it("cartons : prévus, livrés (date passée ou statut), pas besoin, sans objet", () => {
    expect(etape(calculerFrise(snap({ livraisons: [livraison()] }), NOW), "cartons")).toMatchObject({ statut: "fait", detail: "Prévus le 28 novembre" });
    expect(etape(calculerFrise(snap({ livraisons: [livraison({ date_samedi: "2026-11-14" })] }), NOW), "cartons")!.detail).toBe("Livrés le 14 novembre");
    expect(etape(calculerFrise(snap({ livraisons: [livraison({ statut: "livree" })] }), NOW), "cartons")!.detail).toBe("Livrés le 28 novembre");
    expect(etape(calculerFrise(snap({ dossier: dossier({ cartons_non_necessaires: true }) }), NOW), "cartons")).toMatchObject({ statut: "fait", detail: "Pas besoin" });
    expect(etape(calculerFrise(snap({ dossier: dossier({ statut: "termine" }) }), NOW), "cartons")).toMatchObject({ statut: "fait", detail: "Sans objet" });
  });

  it("solde : à régler avec son montant, puis réglé ; masqué avec les factures", () => {
    const solde = facture({ id: "so", type: "solde", statut: "a_payer", montant_ttc: 864.19, payee_le: null });
    const f = calculerFrise(snap({ factures: [solde] }), NOW);
    expect(etape(f, "solde")!.statut).toBe("a_faire");
    expect(esp(etape(f, "solde")!.detail)).toBe("864,19 € à régler");
    expect(etape(calculerFrise(snap({ factures: [{ ...solde, statut: "payee", payee_le: "2026-12-10" }] }), NOW), "solde")).toMatchObject({ statut: "fait", detail: "Fait le 10 décembre" });
    expect(etape(calculerFrise(snap({ client: client({ masquer_factures: true }) }), NOW), "solde")).toBeUndefined();
  });

  it("déménagement réalisé : fait à la date de fin de chantier, sinon au dernier jour", () => {
    expect(etape(calculerFrise(snap({ dossier: dossier({ statut: "termine", termine_le: "2026-12-15T17:00:00Z" }) }), NOW), "realise")).toMatchObject({ statut: "fait", detail: "Fait le 15 décembre" });
    expect(etape(calculerFrise(snap({ dossier: dossier({ statut: "termine" }) }), NOW), "realise")!.detail).toBe("Fait le 15 décembre");
  });
});

describe("calculerFrise — la visite technique", () => {
  it("visite en cours", () => {
    expect(etape(calculerFrise(snap({ visites: [visite({ statut: "en_cours" })] }), NOW), "visite")).toMatchObject({ statut: "en_attente", detail: "Visite en cours" });
  });

  it("créneaux proposés à venir : à choisir (les passés ne comptent pas)", () => {
    const s = snap({ creneaux: [creneau("2026-11-18T09:00:00Z"), creneau("2026-11-19T09:00:00Z"), creneau("2026-11-01T09:00:00Z")] });
    expect(etape(calculerFrise(s, NOW), "visite")).toMatchObject({ statut: "a_faire", detail: "2 créneaux à choisir", cible: "visite" });
  });

  it("visite planifiée : son jour et son heure à Paris", () => {
    const s = snap({ visites: [visite({ debut: "2026-11-20T09:30:00Z" })] });
    expect(etape(calculerFrise(s, NOW), "visite")).toMatchObject({ statut: "en_attente", detail: "Le 20 novembre à 10 h 30" });
  });

  it("compte-rendu signé, ou visite réalisée : fait", () => {
    expect(etape(calculerFrise(snap({ visites: [visite({ statut: "signee", signe_le: "2026-11-02T10:00:00Z" })] }), NOW), "visite")).toMatchObject({ statut: "fait", detail: "Compte-rendu signé le 2 novembre" });
    expect(etape(calculerFrise(snap({ visites: [visite({ statut: "realisee", debut: "2026-11-03T09:00:00Z" })] }), NOW), "visite")!.detail).toBe("Réalisée le 3 novembre");
    expect(etape(calculerFrise(snap({ visites: [visite({ statut: "realisee" })] }), NOW), "visite")!.detail).toBe("Réalisée");
  });

  it("une visite passée par l'outil reste montrée même quand le dossier est avancé", () => {
    const s = snap({ devis: [devis()], visites: [visite({ statut: "signee", signe_le: "2026-11-02T10:00:00Z" })] });
    expect(etape(calculerFrise(s, NOW), "visite")).toBeDefined();
  });
});

describe("calculerFrise — propriétés", () => {
  const variantes: DossierSnapshot[] = [];
  for (const type of ["particulier", "grand_compte", "militaire", "logement_social"] as const)
    for (const termine of [false, true])
      for (const masquer of [false, true])
        for (const inter of [false, true])
          variantes.push(snap({
            client: client({ type, masquer_devis: masquer, masquer_factures: masquer }),
            dossier: dossier({ statut: termine ? "termine" : "en_preparation", portee: inter ? "international" : "national", pays_destination: "CA" }),
            devis: masquer ? [] : [devis({ statut: "accepte", accepte_le: "2026-10-02" })],
          }));

  it("toujours une étape « réalisé » en dernier, et des clés uniques", () => {
    for (const s of variantes) {
      const f = calculerFrise(s, NOW);
      expect(f.at(-1)!.cle).toBe("realise");
      expect(new Set(f.map((e) => e.cle)).size).toBe(f.length);
    }
  });

  it("avancement : pourcentage arrondi des étapes faites, entre 0 et 100", () => {
    for (const s of variantes) {
      const f = calculerFrise(s, NOW);
      const a = avancement(f);
      expect(a.total).toBe(f.length);
      expect(a.pourcent).toBe(Math.round((a.faites / a.total) * 100));
      expect(a.pourcent).toBeGreaterThanOrEqual(0);
      expect(a.pourcent).toBeLessThanOrEqual(100);
    }
  });

  it("idempotente : même instantané, même frise", () => {
    for (const s of variantes) expect(calculerFrise(s, NOW)).toEqual(calculerFrise(s, NOW));
  });

  it("prochaine étape : toujours une étape « à faire », ou rien", () => {
    for (const s of variantes) {
      const p = prochaineEtape(calculerFrise(s, NOW));
      if (p) expect(p.statut).toBe("a_faire");
    }
  });
});

describe("texteProchaineEtape", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("visite : le nombre de créneaux proposés", () => {
    const s = snap({ creneaux: [creneau("2026-11-18T09:00:00Z")] });
    const e = etape(calculerFrise(s), "visite")!;
    expect(texteProchaineEtape(e, s)[1]).toContain("1 créneau :");
  });

  it("devis : « Validez votre devis » sans devis retenu, « Réglez vos arrhes » avec", () => {
    const e = { cle: "devis", titre: "Devis accepté", statut: "a_faire", detail: "", cible: "devis" } as Etape;
    expect(texteProchaineEtape(e, snap())[0]).toBe("Validez votre devis");
    expect(texteProchaineEtape(e, snap({ devis: [devis({ statut: "accepte" })] }))[0]).toBe("Réglez vos arrhes");
  });

  it("pièces du segment : la liste de ce qui manque", () => {
    const s = snap({ client: client({ type: "militaire" }), requirements: [exigence({ id: "om", segment: "militaire", libelle: "Ordre de mutation" }), exigence({ id: "cm", segment: "militaire", libelle: "Carte militaire" })] });
    const e = etape(calculerFrise(s), "segment")!;
    expect(texteProchaineEtape(e, s)).toEqual(["Déposez vos documents militaires", "Il reste : Ordre de mutation, Carte militaire. En PDF ou en photo, depuis « Mes documents »."]);
  });

  it("pays : le nom du pays", () => {
    const s = snap({ dossier: dossier({ portee: "international", pays_destination: "CA" }) });
    expect(texteProchaineEtape({ cle: "pays" } as Etape, s)[0]).toBe("Déposez vos documents pour : Canada");
  });

  it("une étape sans texte propre reprend son titre et son détail", () => {
    expect(texteProchaineEtape({ cle: "realise", titre: "Déménagement réalisé", detail: "Le 14 décembre" } as Etape, snap())).toEqual(["Déménagement réalisé", "Le 14 décembre"]);
  });
});

describe("visibilite", () => {
  it("devis et factures selon les masquages ; conteneur à l'international maritime ; SAV après la livraison", () => {
    const s = snap({ client: client({ masquer_devis: true }), dossier: dossier({ portee: "international", mode_transport: "maritime", periode_fin: "2026-11-01" }) });
    expect(visibilite(s, calculerFrise(s, NOW))).toMatchObject({ devis: false, factures: true, conteneur: true, savActif: true });
  });

  it("documents à faire : formulaires non faits + pièces obligatoires manquantes", () => {
    const s = snap({ requirements: [exigence({ id: "a" }), exigence({ id: "b" }), exigence({ id: "c", obligatoire: false })], documents: [document("a")] });
    // conditions, valeurs, CGV (3) + pièce b (1)
    expect(visibilite(s, calculerFrise(s, NOW)).documentsAFaire).toBe(4);
  });
});

// ── Le suivi de l'équipe ──────────────────────────────────────────────────
describe("suiviEquipe — le dossier vu de l'équipe", () => {
  it("arrhes à régler : le montant et le pourcentage", () => {
    const s = snap({ devis: [devis({ statut: "accepte", accepte_le: "2026-10-02" })] });
    const p = suiviEquipe(s, calculerFrise(s, NOW), NOW).points.find((x) => x.cle === "arrhes")!;
    expect(p.etat).toBe("a_faire");
    expect(esp(p.detail)).toBe("370,37 € à régler (30 %)");
  });

  it("arrhes réglées : le montant payé et sa date", () => {
    const s = snap({ devis: [devis({ statut: "accepte", accepte_le: "2026-10-02" })], factures: [facture()] });
    const p = suiviEquipe(s, calculerFrise(s, NOW), NOW).points.find((x) => x.cle === "arrhes")!;
    expect(p).toMatchObject({ etat: "fait", le: "2026-10-04" });
    expect(esp(p.detail)).toBe("370,37 € réglés");
  });

  it("pas de point arrhes pour un grand compte, un militaire, ou un devis sans arrhes", () => {
    for (const s of [
      snap({ client: client({ type: "grand_compte" }), devis: [devis({ statut: "accepte" })] }),
      snap({ client: client({ type: "militaire" }) }),
      snap({ devis: [devis({ statut: "accepte", arrhes_pourcentage: 0 })] }),
    ]) {
      expect(suiviEquipe(s, calculerFrise(s, NOW), NOW).points.some((x) => x.cle === "arrhes")).toBe(false);
    }
  });

  it("militaire : ni arrhes ni solde", () => {
    const s = snap({ client: client({ type: "militaire" }) });
    const cles = suiviEquipe(s, calculerFrise(s, NOW), NOW).points.map((x) => x.cle);
    expect(cles).not.toContain("solde");
    expect(cles).not.toContain("arrhes");
  });

  it("CGV et RGPD : ce qui manque, et la date de la dernière acceptation", () => {
    const cgv = acceptation("cgv", "2026-10-03T10:00:00Z", "CGV-3");
    const rgpd = acceptation("rgpd", "2026-10-07T10:00:00Z", "RGPD-2");
    const point = (a: Acceptation[]) => { const s = snap({ acceptations: a }); return suiviEquipe(s, calculerFrise(s, NOW), NOW).points.find((x) => x.cle === "cgv")!; };
    expect(point([cgv]).detail).toBe("Politique de confidentialité à accepter");
    expect(point([rgpd]).detail).toBe("CGV à accepter");
    expect(point([]).detail).toBe("À accepter en ligne");
    expect(point([cgv, rgpd])).toMatchObject({ etat: "fait", detail: "Acceptées (CGV-3 · RGPD-2)", le: "2026-10-07T10:00:00Z" });
  });

  it("pièces : reçues sur demandées, et les manquantes nommées", () => {
    const s = snap({ requirements: [exigence({ id: "a", libelle: "Pièce A" }), exigence({ id: "b", libelle: "Pièce B" }), exigence({ id: "c", libelle: "Pièce C" })], documents: [document("a")] });
    const r = suiviEquipe(s, calculerFrise(s, NOW), NOW);
    expect(r.pieces).toEqual({ recues: 1, demandees: 3, manquantes: ["Pièce B", "Pièce C"] });
    expect(r.points.find((x) => x.cle === "pieces")!.detail).toBe("1 sur 3 reçue · 2 manquantes");
  });

  it("pièces toutes reçues : datées du dernier dépôt", () => {
    const s = snap({ requirements: [exigence({ id: "a" }), exigence({ id: "b" })], documents: [document("a", "2026-10-05T10:00:00Z"), document("b", "2026-10-09T10:00:00Z")] });
    expect(suiviEquipe(s, calculerFrise(s, NOW), NOW).points.find((x) => x.cle === "pieces")).toMatchObject({ etat: "fait", detail: "2 pièces reçues", le: "2026-10-09T10:00:00Z" });
  });

  it("conditions : bloquant tant que non certifiées ; « commencé » si un brouillon existe", () => {
    const s = snap({ conditions: { valide_at: null } as DossierSnapshot["conditions"] });
    expect(suiviEquipe(s, calculerFrise(s, NOW), NOW).points.find((x) => x.cle === "conditions")).toMatchObject({ etat: "bloquant", detail: "Commencé, pas encore certifié" });
    const vide = snap();
    expect(suiviEquipe(vide, calculerFrise(vide, NOW), NOW).points.find((x) => x.cle === "conditions")!.detail).toBe("Questionnaire pas encore rempli");
  });

  it("l'avis client est hors du pourcentage", () => {
    const s = snap({ dossier: dossier({ avis_demande_le: "2026-12-20T10:00:00Z" }) });
    const r = suiviEquipe(s, calculerFrise(s, NOW), NOW);
    expect(r.points.find((x) => x.cle === "avis")).toMatchObject({ etat: "fait", horsTaux: true });
    expect(r.total).toBe(r.points.filter((x) => !x.horsTaux).length);
    expect(r.faits).toBe(r.points.filter((x) => !x.horsTaux && x.etat === "fait").length);
  });

  it("avis : « à demander » une fois la livraison passée, « après le déménagement » sinon", () => {
    const passe = snap({ dossier: dossier({ periode_fin: "2026-11-01" }) });
    expect(suiviEquipe(passe, calculerFrise(passe, NOW), NOW).points.find((x) => x.cle === "avis")!.detail).toBe("À demander à la fin de chantier");
    const avenir = snap();
    expect(suiviEquipe(avenir, calculerFrise(avenir, NOW), NOW).points.find((x) => x.cle === "avis")!.detail).toBe("Après le déménagement");
  });

  it("pourcentage = part des points faits, arrondie ; un dossier complet fait 100 %", () => {
    const complet = snap({
      dossier: dossier({ statut: "termine", termine_le: "2026-12-15T10:00:00Z" }),
      devis: [devis({ statut: "accepte", accepte_le: "2026-10-02" })],
      factures: [facture(), facture({ id: "so", type: "solde", statut: "payee", payee_le: "2026-12-10" })],
      acceptations: [...conditionsValides.acceptations, acceptation("cgv", "2026-10-03T10:00:00Z"), acceptation("rgpd", "2026-10-03T10:00:00Z")],
      conditions: conditionsValides.conditions,
      declaration: { statut: "soumise", soumise_at: "2026-10-21T10:00:00Z", total: 25000 } as DossierSnapshot["declaration"],
    });
    const r = suiviEquipe(complet, calculerFrise(complet, NOW), NOW);
    expect(r.pourcent).toBe(100);
    expect(r.faits).toBe(r.total);
    const vide = snap();
    const rv = suiviEquipe(vide, calculerFrise(vide, NOW), NOW);
    expect(rv.pourcent).toBe(Math.round((rv.faits / rv.total) * 100));
  });
});
