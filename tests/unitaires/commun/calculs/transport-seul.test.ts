import { describe, expect, it } from "vitest";
import { TRANSPORT_SEUL, transportSeul } from "@/lib/pricing/grille";
import { contexteDemande } from "@/lib/messaging";

/*
 * « Transport de meubles uniquement » (campagne du 18/11/2026, n° 29) : des
 * meubles vides, démontés et emballés par le client. L'Économique comprend le
 * démontage et le remontage du mobilier : ce n'est pas la même prestation. La
 * colonne `formule` garde la grille appliquée (« eco », faute de tableau
 * propre) ; le choix du client se lit dans ses prestations, et c'est lui qui
 * se montre.
 */
const TRANSPORT = { prestations: { fragile: "moi", embNonFragile: "moi", debNonFragile: "moi", demontage: "moi", transport: "bailly" } };
const ECO = { prestations: { fragile: "moi", embNonFragile: "moi", debNonFragile: "moi", demontage: "bailly", transport: "moi" } };

describe("transportSeul", () => {
  it("se lit dans les prestations du formulaire", () => {
    expect(transportSeul(TRANSPORT)).toBe(true);
    expect(transportSeul(ECO)).toBe(false);
  });

  it("une demande sans prestations (express, e-mail, questionnaires) n'est pas un transport seul", () => {
    for (const raw of [null, undefined, {}, { prestations: null }, { prestations: "bailly" }, "texte"]) expect(transportSeul(raw), JSON.stringify(raw)).toBe(false);
  });

  it("son nom est celui du formulaire", () => {
    expect(TRANSPORT_SEUL).toBe("Transport de meubles uniquement");
  });
});

describe("contexteDemande — l'e-mail au client dit « transport seul », pas « Économique »", () => {
  it("transport seul : la formule du message est « transport »", () => {
    expect(contexteDemande({ formule: "eco", raw_payload: TRANSPORT }).formule).toBe("transport");
  });

  it("l'Économique, et une demande sans prestations : inchangées", () => {
    expect(contexteDemande({ formule: "eco", raw_payload: ECO }).formule).toBe("eco");
    expect(contexteDemande({ formule: "standard" }).formule).toBe("standard");
    expect(contexteDemande({}).formule).toBeNull();
  });
});
