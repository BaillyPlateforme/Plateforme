import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { devisDuLienDocument, lienDocumentDevis } from "@/lib/espace-client/document-devis";
import { sceller } from "@/lib/espace-client/signature";
import { avecBienvenue, referenceDeLaSuite, suiteValide } from "@/lib/espace-client/suite";

const DEUX_HEURES = 2 * 60 * 60 * 1000;
const jetonDe = (lien: string) => lien.split("/signature/document/")[1];

describe("lien du devis complet — jeton signé, valable deux heures", () => {
  beforeEach(() => {
    vi.stubEnv("ESPACE_CLIENT_SECRET", "secret-de-test");
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-11-15T10:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("le lien mène à la page publique du document, et son jeton désigne le devis", () => {
    const lien = lienDocumentDevis(42);
    expect(lien).toContain("/signature/document/");
    expect(devisDuLienDocument(jetonDe(lien))).toBe(42);
  });

  it("le jeton se relit encodé dans une adresse", () => {
    const jeton = jetonDe(lienDocumentDevis(42));
    expect(devisDuLienDocument(encodeURIComponent(jeton))).toBe(42);
    expect(devisDuLienDocument(jeton.replace(".", "%2E"))).toBe(42);
  });

  it("valable deux heures, pas une milliseconde de plus", () => {
    const jeton = jetonDe(lienDocumentDevis(42));
    vi.setSystemTime(Date.parse("2026-11-15T10:00:00Z") + DEUX_HEURES - 1);
    expect(devisDuLienDocument(jeton)).toBe(42);
    vi.setSystemTime(Date.parse("2026-11-15T10:00:00Z") + DEUX_HEURES);
    expect(devisDuLienDocument(jeton)).toBeNull();
  });

  it("un jeton retouché ne vaut rien (signature ou contenu)", () => {
    const jeton = jetonDe(lienDocumentDevis(42));
    const [corps, sig] = jeton.split(".");
    const autreCaractere = (c: string) => (c === "A" ? "B" : "A");
    expect(devisDuLienDocument(`${corps}.${sig.slice(0, -1)}${autreCaractere(sig.at(-1)!)}`)).toBeNull();
    const faux = Buffer.from(JSON.stringify({ exp: Date.now() + DEUX_HEURES, d: 43 })).toString("base64url");
    expect(devisDuLienDocument(`${faux}.${sig}`)).toBeNull();
  });

  it("un jeton scellé pour un autre usage ne vaut rien ici", () => {
    expect(devisDuLienDocument(sceller({ exp: Date.now() + DEUX_HEURES, d: 42 }, "fichier"))).toBeNull();
  });

  it("un autre secret serveur invalide les jetons émis", () => {
    const jeton = jetonDe(lienDocumentDevis(42));
    vi.stubEnv("ESPACE_CLIENT_SECRET", "autre-secret");
    expect(devisDuLienDocument(jeton)).toBeNull();
  });

  it.each([[0], [-1], [1.5], ["42"], [null], [undefined]])("numéro de devis %j dans un jeton intact : refusé", (d) => {
    expect(devisDuLienDocument(sceller({ exp: Date.now() + DEUX_HEURES, d }, "document-devis"))).toBeNull();
  });

  it.each([[""], ["abc"], ["a.b"], ["."], ["..."], ["%2E"]])("jeton illisible %j : rien", (j) => {
    expect(devisDuLienDocument(j)).toBeNull();
  });

  // Un « % » isolé dans l'adresse rend null : la page dit « lien expiré » au lieu de tomber en erreur.
  it("un jeton mal encodé rend null, sans lever", () => {
    for (const j of ["%", "%E0%A4%A", "abc%zz"]) {
      expect(() => devisDuLienDocument(j)).not.toThrow();
      expect(devisDuLienDocument(j)).toBeNull();
    }
  });
});

describe("suite — la page visée avant la connexion", () => {
  it.each([
    "/espace-client/BD-2026-0164",
    "/espace-client/BD-2026-0164/devis",
    "/espace-client/BD-2026-0164/documents",
    "/espace-client/BD-2026-0164/visite",
    "/espace-client/BD-2026-0164/cartons",
    "/espace-client/BD-2026-0164/conseiller",
    "/espace-client/BD-2026-0164/sav",
    "/espace-client/BD-2026-0164/services",
    "/espace-client/BD-2026-0164/tutos",
    "/espace-client/BD-2026-0164/conteneur",
    "/espace-client/abc",
    `/espace-client/${"a".repeat(40)}`,
  ])("admise : %s", (s) => {
    expect(suiteValide(s)).toBe(s);
  });

  it.each([
    "//evil.example",
    "https://evil.example/espace-client/BD-2026-0164",
    "/espace-client/BD-2026-0164/",
    "/espace-client/BD-2026-0164/admin",
    "/espace-client/BD-2026-0164/devisx",
    "/espace-client/BD-2026-0164/devis/",
    "/espace-client/BD-2026-0164/devis/../../dashboard",
    "/espace-client/BD-2026-0164?ok=1",
    "/espace-client/BD-2026-0164#x",
    "/espace-client/BD-2026-0164\n",
    "/espace-client/BD-2026-0164\n/admin",
    "/espace-client/BD 2026",
    "/espace-client/BD_2026_0164",
    "/espace-client/BD-2026-é",
    "/espace-client/ab",
    `/espace-client/${"a".repeat(41)}`,
    "/ESPACE-CLIENT/BD-2026-0164",
    "/espace-client/%2e%2e",
    " /espace-client/BD-2026-0164",
    "/dashboard",
    "",
  ])("refusée : %j", (s) => {
    expect(suiteValide(s)).toBeNull();
  });

  it("autre chose qu'une chaîne : refusée", () => {
    for (const v of [null, undefined, 42, {}, ["/espace-client/BD-2026-0164"]]) expect(suiteValide(v)).toBeNull();
  });

  it("la référence du dossier d'une suite", () => {
    expect(referenceDeLaSuite("/espace-client/BD-2026-0164/devis")).toBe("BD-2026-0164");
    expect(referenceDeLaSuite("/espace-client/BD-2026-0164")).toBe("BD-2026-0164");
  });

  it("le mot d'accueil s'ajoute à l'adresse, et la suite reste lisible", () => {
    expect(avecBienvenue("/espace-client/BD-2026-0164/devis")).toBe("/espace-client/BD-2026-0164/devis?ok=bienvenue");
  });
});
