import { describe, expect, it } from "vitest";
import {
  clientSchema,
  conseillerSchema,
  conteneurSchema,
  devisSchema,
  dossierLieSchema,
  dossierSchema,
  factureSchema,
  lireLignes,
  pieceSchema,
  serviceSchema,
  tutoSchema,
} from "@/lib/espace-client/schemas-equipe";

/* Les formulaires de l'équipe : vérifiés dans le navigateur, revérifiés par l'action. */

describe("clientSchema", () => {
  const client = (modif: Record<string, unknown> = {}) =>
    clientSchema.safeParse({
      civilite: "Madame", prenom: "Céline", nom: "Dupont", email: "Celine.Dupont@Exemple.fr", telephone: "06 12 34 56 78",
      type: "particulier", societe: "", masquer_devis: false, masquer_factures: false, conseiller_id: "c-1", ...modif,
    });

  it("met l'e-mail en minuscules et la société vide à null", () => {
    const r = client();
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe("celine.dupont@exemple.fr");
      expect(r.data.societe).toBeNull();
    }
  });

  it("refuse une civilité, un type ou un e-mail hors liste", () => {
    expect(client({ civilite: "Docteur" }).success).toBe(false);
    expect(client({ type: "super_admin" }).success).toBe(false);
    expect(client({ email: "celine@exemple.fr\r\nBcc: x@y.fr" }).success).toBe(false);
  });

  it("borne prénom et nom à 60 caractères, société à 120", () => {
    expect(client({ prenom: "a".repeat(61) }).success).toBe(false);
    expect(client({ nom: "a".repeat(100_000) }).success).toBe(false);
    expect(client({ societe: "a".repeat(121) }).success).toBe(false);
    expect(client({ nom: "   " }).success).toBe(false);
  });

  it("exige des booléens véritables pour masquer devis et factures", () => {
    expect(client({ masquer_devis: "true" }).success).toBe(false);
  });
});

describe("dossierSchema et dossierLieSchema", () => {
  const dossier = (modif: Record<string, unknown> = {}) =>
    dossierSchema.safeParse({
      ville_depart: "Paris", ville_arrivee: "Lyon", adresse_depart: "12 rue A", adresse_arrivee: "3 rue B",
      periode_debut: "2026-12-01", periode_fin: "2026-12-03", portee: "national", mode_transport: "route",
      pays_destination: "fr", statut: "planifie", volume_m3: "30", formule: "Standard", logement: "", photo: "salon.jpg", request_id: "", ...modif,
    });

  it("accepte un dossier, code pays mis en capitales, demande vide à null", () => {
    const r = dossier();
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.pays_destination).toBe("FR");
      expect(r.data.request_id).toBeNull();
      expect(r.data.volume_m3).toBe(30);
    }
  });

  it("refuse une fin avant le début et un national hors de France", () => {
    expect(dossier({ periode_fin: "2026-11-30" }).success).toBe(false);
    expect(dossier({ pays_destination: "CA" }).success).toBe(false);
    expect(dossier({ portee: "international", pays_destination: "CA" }).success).toBe(true);
  });

  it.each(["FRA", "F", "F1", "<s", "f r", ""])("refuse le code pays %j", (pays_destination) => {
    expect(dossier({ portee: "international", pays_destination }).success).toBe(false);
  });

  it("refuse une demande liée qui n'est pas un UUID (injection dans un filtre)", () => {
    expect(dossier({ request_id: "1 OR 1=1" }).success).toBe(false);
    expect(dossier({ request_id: "123e4567-e89b-12d3-a456-426614174000,id.neq.0" }).success).toBe(false);
    expect(dossier({ request_id: "123e4567-e89b-12d3-a456-426614174000" }).success).toBe(true);
  });

  it("borne le volume de 1 à 500 m³, refuse NaN", () => {
    expect(dossier({ volume_m3: "0" }).success).toBe(false);
    expect(dossier({ volume_m3: "501" }).success).toBe(false);
    expect(dossier({ volume_m3: "abc" }).success).toBe(false);
  });

  it("dossierLieSchema : e-mail du bailleur normalisé, vide à null, hostile refusé", () => {
    const lie = (bailleur_email: string) =>
      dossierLieSchema.safeParse({ pays_destination: "fr", mode_transport: "route", logement: "", photo: "x.jpg", bailleur_nom: "", bailleur_email });
    const ok = lie("  Bailleur@Exemple.FR ");
    expect(ok.success && ok.data.bailleur_email).toBe("bailleur@exemple.fr");
    const vide = lie("   ");
    expect(vide.success && vide.data.bailleur_email).toBeNull();
    expect(lie("bailleur@exemple.fr\nBcc: x@y.fr").success).toBe(false);
  });
});

describe("conteneurSchema — le lien de suivi de la compagnie", () => {
  const conteneur = (url_tracking: string) =>
    conteneurSchema.safeParse({ compagnie: "", numero_conteneur: "", url_tracking, statut_conteneur: "", navire: "", port_depart: "", port_arrivee: "", eta: "" });

  it("accepte un lien https, et rien", () => {
    expect(conteneur("https://www.maersk.com/tracking/123").success).toBe(true);
    const vide = conteneur("");
    expect(vide.success && vide.data.url_tracking).toBeNull();
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "http://www.maersk.com",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "//evil.com",
    "https://",
    "maersk.com",
  ])("refuse %j", (url) => {
    expect(conteneur(url).success).toBe(false);
  });
});

describe("tutoSchema — la vidéo d'un tutoriel", () => {
  const tuto = (url_video: string, etapes = "Ouvrir\nCliquer") =>
    tutoSchema.safeParse({ titre: "Déposer une pièce", resume: "Comment déposer", categorie: "Pièces", etapes, url_video });

  it("accepte un lien https, une vidéo hébergée, ou rien", () => {
    expect(tuto("https://www.youtube-nocookie.com/embed/abc").success).toBe(true);
    expect(tuto("/espace-client/tutos/deposer-une-piece.mp4").success).toBe(true);
    const vide = tuto("");
    expect(vide.success && vide.data.url_video).toBeNull();
  });

  it.each([
    "/espace-client/tutos/../../api/secret.mp4",
    "/espace-client/tutos/a/b.mp4",
    "/espace-client/tutos/VIDEO.mp4",
    "/espace-client/tutos/x.mp4?redir=//evil.com",
    "/espace-client/tutos/x.mp4\n<script>",
    "//evil.com/espace-client/tutos/x.mp4",
    "/autre/x.mp4",
    "javascript:alert(1)",
    "http://evil.com/x.mp4",
  ])("refuse %j", (url) => {
    expect(tuto(url).success).toBe(false);
  });

  it("découpe les étapes par ligne et exige au moins une étape", () => {
    const r = tuto("", "  Ouvrir  \n\n  Cliquer\n");
    expect(r.success && r.data.etapes).toEqual(["Ouvrir", "Cliquer"]);
    expect(tuto("", "\n \n").success).toBe(false);
  });
});

describe("lireLignes et devisSchema", () => {
  it("lit « Libellé ; montant HT ; détail », virgule décimale et espaces de milliers compris", () => {
    expect(lireLignes("Transport ; 1 200,50 ; camion 20 m³\n\n Emballage;300")).toEqual([
      { libelle: "Transport", montant_ht: 1200.5, detail: "camion 20 m³" },
      { libelle: "Emballage", montant_ht: 300 },
    ]);
  });

  it("garde les points-virgules du détail (chaque morceau débarrassé de ses blancs)", () => {
    expect(lireLignes("A ; 10 ; un ; deux")[0].detail).toBe("un;deux");
  });

  it("un montant illisible devient NaN, refusé par le schéma", () => {
    const lignes = lireLignes("Transport ; mille euros");
    expect(Number.isNaN(lignes[0].montant_ht)).toBe(true);
    expect(devisSchema.safeParse({ formule: "Standard", lignes, inclus: "", arrhes_pourcentage: "30", valide_jusqu_au: "2026-12-31", statut: "envoye" }).success).toBe(false);
  });

  it("refuse un montant négatif, infini ou au-delà d'un million", () => {
    for (const m of ["-10", "Infinity", "1000001"]) {
      const lignes = lireLignes(`Transport ; ${m}`);
      expect(devisSchema.safeParse({ formule: "Standard", lignes, inclus: "", arrhes_pourcentage: "30", valide_jusqu_au: "2026-12-31", statut: "envoye" }).success).toBe(false);
    }
  });

  it("borne les arrhes de 0 à 100 %, entières", () => {
    const devis = (arrhes_pourcentage: string) =>
      devisSchema.safeParse({ formule: "Standard", lignes: [{ libelle: "Transport", montant_ht: 10 }], inclus: "a, b,", arrhes_pourcentage, valide_jusqu_au: "2026-12-31", statut: "envoye" });
    expect(devis("30").success).toBe(true);
    expect(devis("101").success).toBe(false);
    expect(devis("-1").success).toBe(false);
    expect(devis("12.5").success).toBe(false);
    const r = devis("30");
    expect(r.success && r.data.inclus).toEqual(["a", "b"]);
  });

  it("refuse un statut que l'équipe ne pose pas ici", () => {
    expect(devisSchema.safeParse({ formule: "Standard", lignes: [{ libelle: "Transport", montant_ht: 10 }], inclus: "", arrhes_pourcentage: "0", valide_jusqu_au: "2026-12-31", statut: "paye" }).success).toBe(false);
  });
});

describe("factureSchema, pieceSchema, conseillerSchema, serviceSchema", () => {
  it("facture : montant positif borné, période AAAA-MM ou rien", () => {
    const facture = (modif: Record<string, unknown>) =>
      factureSchema.safeParse({ type: "arrhes", libelle: "Arrhes", montant_ttc: "100", echeance: "2026-12-01", periode: "", ...modif });
    expect(facture({}).success).toBe(true);
    expect(facture({ montant_ttc: "0" }).success).toBe(false);
    expect(facture({ montant_ttc: "-1" }).success).toBe(false);
    expect(facture({ montant_ttc: "1000001" }).success).toBe(false);
    expect(facture({ periode: "2026-1" }).success).toBe(false);
    expect(facture({ periode: "2026-11" }).success).toBe(true);
    expect(facture({ type: "remboursement" }).success).toBe(false);
  });

  it("pièce : pays vide = toutes destinations, segment vide = null, ordre 0 à 999", () => {
    const piece = (modif: Record<string, unknown>) =>
      pieceSchema.safeParse({ pays: "", segment: "", libelle: "Passeport", description: "", obligatoire: true, ordre: "1", ...modif });
    const r = piece({});
    expect(r.success && [r.data.pays, r.data.segment]).toEqual([null, null]);
    expect(piece({ pays: "ca" }).success).toBe(true);
    expect(piece({ pays: "CAN" }).success).toBe(false);
    expect(piece({ ordre: "1000" }).success).toBe(false);
    expect(piece({ description: "a".repeat(301) }).success).toBe(false);
  });

  it("conseiller : e-mail et téléphone français exigés", () => {
    expect(conseillerSchema.safeParse({ prenom: "Céline", nom: "D", email: "c@exemple.fr", telephone: "01 69 10 35 35" }).success).toBe(true);
    expect(conseillerSchema.safeParse({ prenom: "Céline", nom: "D", email: "c@exemple.fr", telephone: "+1 555 0100" }).success).toBe(false);
  });

  it("service : bornes des textes", () => {
    expect(serviceSchema.safeParse({ titre: "Garde", accroche: "Un box", contenu: "court", prix_indicatif: "" }).success).toBe(false);
    expect(serviceSchema.safeParse({ titre: "Garde", accroche: "Un box", contenu: "Un box sécurisé", prix_indicatif: "a".repeat(41) }).success).toBe(false);
  });
});
