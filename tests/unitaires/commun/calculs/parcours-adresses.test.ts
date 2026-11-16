import { afterEach, describe, expect, it, vi } from "vitest";
import { libelleParcours, NOM_PARCOURS, parcoursDeLaDemande, SANS_PRIX, transfertDe } from "@/lib/parcours";

describe("parcours — la porte d'entrée d'une demande", () => {
  it.each(["particulier", "mutation", "entreprise"] as const)("parcours déclaré « %s » : repris tel quel", (p) => {
    expect(parcoursDeLaDemande({ parcours: p })).toBe(p);
  });

  it("le parcours déclaré l'emporte sur une mutation ou un espace pro", () => {
    expect(parcoursDeLaDemande({ parcours: "entreprise", mutation: true, espace_nom: "Carrefour" })).toBe("entreprise");
  });

  it("demande d'avant les trois portes : une mutation déclarée (booléen ou texte) en fait une mutation", () => {
    expect(parcoursDeLaDemande({ mutation: true })).toBe("mutation");
    expect(parcoursDeLaDemande({ mutation: "true" })).toBe("mutation");
  });

  it("demande d'avant les trois portes : venue d'un espace pro, c'est une mutation", () => {
    expect(parcoursDeLaDemande({ espace_nom: "Carrefour" })).toBe("mutation");
  });

  it("à défaut : particulier (mutation « false », « non », espace vide, parcours inconnu)", () => {
    for (const t of [{}, { mutation: "false" }, { mutation: false }, { mutation: "non" }, { espace_nom: "" }, { parcours: "PARTICULIER" }, { parcours: "pro" }, { parcours: null }]) {
      expect(parcoursDeLaDemande(t)).toBe("particulier");
    }
  });

  it("transfert : « simple » ou « projet », sinon rien", () => {
    expect(transfertDe({ transfert: "simple" })).toBe("simple");
    expect(transfertDe({ transfert: "projet" })).toBe("projet");
    expect(transfertDe({ transfert: "Simple" })).toBeNull();
    expect(transfertDe({})).toBeNull();
  });

  it("libellés courts", () => {
    expect(libelleParcours({ parcours: "entreprise", transfert: "projet" })).toBe("Entreprise · projet important");
    expect(libelleParcours({ parcours: "entreprise", transfert: "simple" })).toBe("Entreprise · petit transfert");
    expect(libelleParcours({ parcours: "entreprise" })).toBe("Entreprise");
    expect(libelleParcours({ parcours: "particulier", express: "true" })).toBe("Particulier · express");
    expect(libelleParcours({ parcours: "particulier", express: "false" })).toBe("Particulier · complet");
    expect(libelleParcours({})).toBe("Particulier · complet");
    expect(libelleParcours({ parcours: "mutation" })).toBe("Mutation");
  });

  it("aucun prix pour la mutation et l'entreprise ; le particulier a son estimation", () => {
    expect(SANS_PRIX.has("mutation")).toBe(true);
    expect(SANS_PRIX.has("entreprise")).toBe(true);
    expect(SANS_PRIX.has("particulier")).toBe(false);
  });

  it("un nom pour chaque parcours", () => {
    expect(Object.keys(NOM_PARCOURS).sort()).toEqual(["entreprise", "mutation", "particulier"]);
  });
});

describe("adresses — les liens d'une app vers l'autre", () => {
  const charger = async (env: Record<string, string>) => {
    vi.resetModules();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    return import("@/lib/adresses");
  };
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("en développement, sans variable : les ports locaux 3939 et 3941", async () => {
    const a = await charger({ NODE_ENV: "development", NEXT_PUBLIC_URL_EXTERNE: "", NEXT_PUBLIC_URL_INTERNE: "" });
    expect(a.URL_EXTERNE).toBe("http://localhost:3939");
    expect(a.URL_INTERNE).toBe("http://localhost:3941");
  });

  it("la barre oblique finale est retirée", async () => {
    const a = await charger({ NEXT_PUBLIC_URL_EXTERNE: "https://devis.exemple.fr/", NEXT_PUBLIC_URL_INTERNE: "https://interne.exemple.fr" });
    expect(a.URL_EXTERNE).toBe("https://devis.exemple.fr");
    expect(a.versExterne("/espace-client/BD-2026-0001")).toBe("https://devis.exemple.fr/espace-client/BD-2026-0001");
    expect(a.versInterne("/dashboard")).toBe("https://interne.exemple.fr/dashboard");
  });

  it("en production, sans variable : aucune adresse inventée (chaîne vide, liens relatifs)", async () => {
    const a = await charger({ NODE_ENV: "production", NEXT_PUBLIC_URL_EXTERNE: "", NEXT_PUBLIC_URL_INTERNE: "" });
    expect(a.URL_EXTERNE).toBe("");
    expect(a.URL_INTERNE).toBe("");
    expect(a.versInterne("/x")).toBe("/x");
  });
});
