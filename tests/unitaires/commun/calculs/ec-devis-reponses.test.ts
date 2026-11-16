import { describe, expect, it } from "vitest";
import { corpsReponse, GESTES_DEVIS, gesteDuMessage, suiviDesReponses, type MessageDuFil } from "@/lib/espace-client/devis-reponses";

const DEVIS = { numero: "D-2026-0012", formule: "Standard" };

describe("corpsReponse — le message posté au nom du client", () => {
  it("refus avec motif", () => {
    expect(corpsReponse("refus", DEVIS, "  Trop cher pour nous.  ")).toBe(
      "Je ne retiens pas le devis D-2026-0012 (formule Standard).\n\nMotif : Trop cher pour nous.",
    );
  });

  it("refus sans motif (vide, espaces, null)", () => {
    for (const t of ["", "   ", null, undefined]) expect(corpsReponse("refus", DEVIS, t)).toBe("Je ne retiens pas le devis D-2026-0012 (formule Standard).");
  });

  it("modification", () => {
    expect(corpsReponse("modification", DEVIS, "Ajouter le piano.")).toBe(
      "Je souhaite une modification du devis D-2026-0012 (formule Standard) :\n\nAjouter le piano.",
    );
  });

  it("renouvellement, avec ou sans mot", () => {
    expect(corpsReponse("renouvellement", DEVIS, null)).toBe("Pourriez-vous renouveler le devis D-2026-0012 (formule Standard), qui a expiré ?");
    expect(corpsReponse("renouvellement", DEVIS, "Même date.")).toBe(
      "Pourriez-vous renouveler le devis D-2026-0012 (formule Standard), qui a expiré ?\n\nMême date.",
    );
  });
});

describe("gesteDuMessage — relire la réponse dans le fil", () => {
  it("aller-retour : chaque geste écrit se relit à l'identique", () => {
    for (const g of GESTES_DEVIS)
      for (const t of ["", "un mot", "Motif : x\n\ny", "Je ne retiens pas le devis D-2026-0012 "]) {
        expect(gesteDuMessage(corpsReponse(g, DEVIS, t), DEVIS.numero)).toBe(g);
      }
  });

  it("un autre numéro de devis ne se confond pas, même préfixe compris (D-1 contre D-10)", () => {
    const corps = corpsReponse("refus", { numero: "D-10", formule: "Eco" }, null);
    expect(gesteDuMessage(corps, "D-1")).toBeNull();
    expect(gesteDuMessage(corps, "D-10")).toBe("refus");
  });

  it("un message libre, ou qui ne commence pas par l'ouverture, n'est pas un geste", () => {
    expect(gesteDuMessage("Bonjour, je ne retiens pas le devis D-2026-0012 (formule Standard).", DEVIS.numero)).toBeNull();
    expect(gesteDuMessage(" Je ne retiens pas le devis D-2026-0012 (formule Standard).", DEVIS.numero)).toBeNull();
    expect(gesteDuMessage("je ne retiens pas le devis D-2026-0012 (formule Standard).", DEVIS.numero)).toBeNull();
    expect(gesteDuMessage("", DEVIS.numero)).toBeNull();
  });
});

describe("suiviDesReponses — ce que le client a répondu, devis par devis", () => {
  const client = (corps: string, le: string): MessageDuFil => ({ auteur: "client", corps, le });
  const equipe = (le: string): MessageDuFil => ({ auteur: "equipe", corps: "Bien reçu.", le });
  const v1 = { id: "v1", numero: "D-1" };
  const v2 = { id: "v2", numero: "D-2" };

  it("fil vide : rien de répondu", () => {
    expect(suiviDesReponses([], [v1])).toEqual({
      v1: { refus: null, modification: null, modifications: 0, renouvellement: null, derniere: null, reponduLe: null },
    });
  });

  it("compte les demandes de modification, garde la date de la dernière", () => {
    const fil = [
      client(corpsReponse("modification", { numero: "D-1", formule: "Eco" }, "a"), "2026-11-01T10:00:00Z"),
      client(corpsReponse("modification", { numero: "D-1", formule: "Eco" }, "b"), "2026-11-03T10:00:00Z"),
    ];
    expect(suiviDesReponses(fil, [v1]).v1).toMatchObject({ modifications: 2, modification: "2026-11-03T10:00:00Z", derniere: { geste: "modification", le: "2026-11-03T10:00:00Z" } });
  });

  it("l'équipe a répondu : la date de son premier message après la dernière réponse", () => {
    const fil = [
      equipe("2026-10-30T10:00:00Z"), // avant toute réponse : ignoré
      client(corpsReponse("refus", { numero: "D-1", formule: "Eco" }, null), "2026-11-01T10:00:00Z"),
      equipe("2026-11-02T10:00:00Z"),
      equipe("2026-11-04T10:00:00Z"),
    ];
    expect(suiviDesReponses(fil, [v1]).v1).toMatchObject({ refus: "2026-11-01T10:00:00Z", reponduLe: "2026-11-02T10:00:00Z" });
  });

  it("une nouvelle réponse du client efface « répondu »", () => {
    const fil = [
      client(corpsReponse("modification", { numero: "D-1", formule: "Eco" }, "a"), "2026-11-01T10:00:00Z"),
      equipe("2026-11-02T10:00:00Z"),
      client(corpsReponse("refus", { numero: "D-1", formule: "Eco" }, null), "2026-11-05T10:00:00Z"),
    ];
    expect(suiviDesReponses(fil, [v1]).v1).toMatchObject({ reponduLe: null, derniere: { geste: "refus", le: "2026-11-05T10:00:00Z" }, modification: "2026-11-01T10:00:00Z" });
  });

  it("les réponses de chaque devis restent à leur devis", () => {
    const fil = [
      client(corpsReponse("refus", { numero: "D-1", formule: "Eco" }, null), "2026-11-01T10:00:00Z"),
      client(corpsReponse("renouvellement", { numero: "D-2", formule: "Standard" }, null), "2026-11-02T10:00:00Z"),
      client("Bonjour, une question.", "2026-11-03T10:00:00Z"),
    ];
    const s = suiviDesReponses(fil, [v1, v2]);
    expect(s.v1).toMatchObject({ refus: "2026-11-01T10:00:00Z", renouvellement: null });
    expect(s.v2).toMatchObject({ refus: null, renouvellement: "2026-11-02T10:00:00Z" });
  });

  it("aucun devis : aucun suivi", () => {
    expect(suiviDesReponses([client("x", "2026-11-01T10:00:00Z")], [])).toEqual({});
  });
});
