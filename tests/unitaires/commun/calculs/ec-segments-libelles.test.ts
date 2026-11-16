import { describe, expect, it } from "vitest";
import { estSegment, LISTE_SEGMENTS, SEGMENTS, segmentDe, segmentDuCrm } from "@/lib/espace-client/segments";
import {
  ESCALIER, libelleEtage, MODE_TRANSPORT, MODELES_MESSAGE, MONTE_MEUBLE, POIDS_LOURD, STATIONNEMENT,
  STATUT_DEVIS, STATUT_DOSSIER, STATUT_FACTURE, STATUT_LIVRAISON, STATUT_SAV, TYPE_FACTURE,
} from "@/lib/espace-client/libelles";

describe("segments — les règles du cahier des charges", () => {
  it("quatre segments, chacun sous sa propre clé", () => {
    expect(LISTE_SEGMENTS.map((s) => s.cle)).toEqual(["particulier", "grand_compte", "militaire", "logement_social"]);
    for (const [cle, s] of Object.entries(SEGMENTS)) expect(s.cle).toBe(cle);
  });

  it("paiement en ligne : particulier et logement social seulement", () => {
    expect(LISTE_SEGMENTS.filter((s) => s.paieEnLigne).map((s) => s.cle)).toEqual(["particulier", "logement_social"]);
  });

  it("masquage : jamais pour qui paie en ligne ; réglable pour le grand compte ; toujours pour le militaire", () => {
    for (const s of LISTE_SEGMENTS) if (s.paieEnLigne) expect(s.masquage).toBe("jamais");
    expect(SEGMENTS.grand_compte.masquage).toBe("reglable");
    expect(SEGMENTS.militaire.masquage).toBe("toujours");
  });

  it("étape de pièces propre : militaire et logement social", () => {
    expect(SEGMENTS.militaire.etapePieces).toBe("Documents militaires");
    expect(SEGMENTS.logement_social.etapePieces).toBe("Documents du bailleur");
    expect(SEGMENTS.particulier.etapePieces).toBeNull();
    expect(SEGMENTS.grand_compte.etapePieces).toBeNull();
  });

  it("aucune règle tarifaire spécifique n'est inventée pour le logement social (« à définir avec Bailly »)", () => {
    expect(SEGMENTS.logement_social.regles.some((r) => /non paramétrées, à définir avec Bailly/.test(r))).toBe(true);
  });

  it("estSegment reconnaît les quatre clés et rien d'autre de courant", () => {
    for (const s of LISTE_SEGMENTS) expect(estSegment(s.cle)).toBe(true);
    for (const v of ["", "Particulier", "compte", " particulier", null, undefined, 3, {}]) expect(estSegment(v)).toBe(false);
  });

  it("segmentDe : le segment du type ; le particulier à défaut", () => {
    expect(segmentDe("militaire").cle).toBe("militaire");
    expect(segmentDe(null).cle).toBe("particulier");
    expect(segmentDe(undefined).cle).toBe("particulier");
    expect(segmentDe("inconnu").cle).toBe("particulier");
  });

  // Les noms hérités d'Object.prototype ne sont pas des segments : le particulier à défaut.
  it("les noms hérités d'Object.prototype ne sont pas des segments", () => {
    for (const v of ["toString", "constructor", "__proto__", "hasOwnProperty", "valueOf"]) {
      expect(estSegment(v)).toBe(false);
      expect(segmentDe(v).cle).toBe("particulier");
    }
  });

  it.each([
    ["compte", "grand_compte"], ["partenaire", "grand_compte"], ["militaire", "militaire"],
    ["logement_social", "logement_social"], ["particulier", "particulier"], ["", "particulier"],
    [null, "particulier"], [undefined, "particulier"], ["COMPTE", "particulier"],
  ])("type du CRM %j → segment %s", (t, s) => {
    expect(segmentDuCrm(t)).toBe(s);
  });

  it("segmentDuCrm rend toujours un segment connu", () => {
    for (const t of ["compte", "partenaire", "militaire", "logement_social", "x", null]) expect(estSegment(segmentDuCrm(t))).toBe(true);
  });
});

describe("libellés", () => {
  it.each([
    [-2, "Rez-de-chaussée"], [0, "Rez-de-chaussée"], [1, "1er étage"], [2, "2e étage"], [8, "8e étage"],
    [9, "9e étage ou plus"], [42, "9e étage ou plus"],
  ])("libelleEtage(%s) = %s", (n, attendu) => {
    expect(libelleEtage(n)).toBe(attendu);
  });

  it("chaque table de libellés couvre toutes ses clés, sans libellé vide", () => {
    const tables: Record<string, Record<string, unknown>> = {
      STATUT_DEVIS, STATUT_FACTURE, TYPE_FACTURE, STATUT_SAV, STATUT_DOSSIER, STATUT_LIVRAISON,
      ESCALIER, STATIONNEMENT, POIDS_LOURD, MONTE_MEUBLE, MODE_TRANSPORT, MODELES_MESSAGE,
    };
    for (const t of Object.values(tables))
      for (const v of Object.values(t)) {
        const label = typeof v === "string" ? v : (v as { label: string }).label;
        expect(label.trim().length).toBeGreaterThan(0);
      }
    expect(Object.keys(STATUT_DEVIS).sort()).toEqual(["accepte", "envoye", "expire", "refuse"]);
    expect(Object.keys(TYPE_FACTURE).sort()).toEqual(["arrhes", "garde_meubles", "solde"]);
    expect(Object.keys(STATUT_DOSSIER).sort()).toEqual(["en_cours", "en_preparation", "planifie", "termine"]);
  });
});
