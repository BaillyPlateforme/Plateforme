import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cle } from "@/lib/espace-client/config";
import { desceller, empreinte, jetonAleatoire, sceller, signer, verifier } from "@/lib/espace-client/signature";

/*
 * Les signatures HMAC-SHA256 de l'espace client (signature.ts) et la clé par
 * usage dont elles dérivent (config.ts, cle) : une signature valable pour un
 * usage ne vaut rien pour un autre, ni sous une autre clé.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
/** Une écriture base64url différente des mêmes octets : on change les bits de remplissage du dernier caractère. */
function nonCanonique(b64: string): string {
  const dernier = ALPHABET.indexOf(b64.at(-1)!);
  for (const bits of [1, 2, 3]) {
    const variante = b64.slice(0, -1) + ALPHABET[dernier ^ bits];
    if (Buffer.from(variante, "base64url").equals(Buffer.from(b64, "base64url"))) return variante;
  }
  throw new Error("pas de variante non canonique");
}
const remplacer = (s: string, i: number) => s.slice(0, i) + (s[i] === "A" ? "B" : "A") + s.slice(i + 1);

beforeEach(() => {
  vi.stubEnv("ESPACE_CLIENT_SECRET", "secret-de-test-0123456789");
  vi.stubEnv("ESPACE_CLIENT_DONNEES", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("cle — une clé par usage, dérivée de la clé du serveur", () => {
  it("donne 32 octets, différents d'un usage à l'autre", () => {
    expect(cle("a")).toHaveLength(32);
    expect(cle("a").equals(cle("b"))).toBe(false);
    expect(cle("a").equals(cle("a"))).toBe(true);
  });

  it("ESPACE_CLIENT_SECRET passe avant la clé service_role", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
    const avecSecret = cle("x");
    vi.stubEnv("ESPACE_CLIENT_SECRET", "");
    const avecServiceRole = cle("x");
    expect(avecSecret.equals(avecServiceRole)).toBe(false);
    expect(avecServiceRole.equals(createHmac("sha256", "service-role").update("espace-client:x").digest())).toBe(true);
  });

  it("sans aucune clé, en mode base : refuse de signer", () => {
    vi.stubEnv("ESPACE_CLIENT_SECRET", "");
    expect(() => cle("x")).toThrow(/Aucune clé serveur/);
    expect(() => signer("v", "x")).toThrow(/Aucune clé serveur/);
  });

  it("sans aucune clé, en démonstration ET en production : refuse aussi", () => {
    vi.stubEnv("ESPACE_CLIENT_SECRET", "");
    vi.stubEnv("ESPACE_CLIENT_DONNEES", "demo");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => cle("x")).toThrow(/Aucune clé serveur/);
  });

  // Choix documenté (config.ts:93) : en démonstration et hors production, une clé de travail fixe,
  // écrite dans le code public. Tout ce qui est signé ainsi est falsifiable par qui lit le dépôt.
  it("en démonstration hors production : une clé de travail fixe (choix documenté)", () => {
    vi.stubEnv("ESPACE_CLIENT_SECRET", "");
    vi.stubEnv("ESPACE_CLIENT_DONNEES", "demo");
    vi.stubEnv("NODE_ENV", "development");
    expect(cle("x").equals(createHmac("sha256", "espace-client-developpement").update("x").digest())).toBe(true);
  });
});

describe("signer et verifier", () => {
  it("une signature base64url de 43 caractères, stable", () => {
    const s = signer("valeur", "fichier");
    expect(s).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(signer("valeur", "fichier")).toBe(s);
  });

  it("vérifie la bonne signature", () => {
    expect(verifier("valeur", signer("valeur", "fichier"), "fichier")).toBe(true);
  });

  it("refuse une signature altérée d'un caractère, à chaque position", () => {
    const s = signer("valeur", "fichier");
    for (let i = 0; i < s.length; i++) expect(verifier("valeur", remplacer(s, i), "fichier")).toBe(false);
  });

  it("refuse une signature tronquée, prolongée, vide", () => {
    const s = signer("valeur", "fichier");
    expect(verifier("valeur", s.slice(0, -1), "fichier")).toBe(false);
    expect(verifier("valeur", `${s}A`, "fichier")).toBe(false);
    expect(verifier("valeur", "", "fichier")).toBe(false);
  });

  it("refuse la même signature écrite en base64 non canonique, ou avec remplissage", () => {
    const s = signer("valeur", "fichier");
    expect(verifier("valeur", nonCanonique(s), "fichier")).toBe(false);
    expect(verifier("valeur", `${s}=`, "fichier")).toBe(false);
    expect(verifier("valeur", Buffer.from(s, "base64url").toString("base64"), "fichier")).toBe(false);
  });

  it("refuse la signature d'un autre usage, ou d'une autre clé", () => {
    const s = signer("valeur", "fichier");
    expect(verifier("valeur", s, "paiement")).toBe(false);
    vi.stubEnv("ESPACE_CLIENT_SECRET", "une-autre-cle");
    expect(verifier("valeur", s, "fichier")).toBe(false);
  });

  it("refuse la signature d'une autre valeur", () => {
    expect(verifier("valeur2", signer("valeur", "fichier"), "fichier")).toBe(false);
    expect(verifier("valeur ", signer("valeur", "fichier"), "fichier")).toBe(false);
  });

  it("une signature de même longueur en caractères mais pas en octets ne fait pas planter la comparaison", () => {
    const s = signer("valeur", "fichier");
    expect(() => verifier("valeur", `é${s.slice(1)}`, "fichier")).not.toThrow();
    expect(verifier("valeur", `é${s.slice(1)}`, "fichier")).toBe(false);
  });
});

describe("sceller et desceller", () => {
  it("rend le contenu scellé tant qu'il n'a pas expiré", () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const j = sceller({ c: "cl-1", exp: Date.now() + 60_000 }, "session-demo");
    expect(j).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    expect(desceller<{ c: string; exp: number }>(j, "session-demo")).toEqual({ c: "cl-1", exp: 1_060_000 });
  });

  it("refuse un jeton expiré, ou qui expire à l'instant même (rejeu)", () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const j = sceller({ c: "cl-1", exp: Date.now() + 60_000 }, "session-demo");
    vi.advanceTimersByTime(60_000);
    expect(desceller(j, "session-demo")).toBeNull();
    vi.advanceTimersByTime(1);
    expect(desceller(j, "session-demo")).toBeNull();
  });

  it("refuse un corps modifié (repousser l'expiration, changer de client)", () => {
    const j = sceller({ c: "cl-1", exp: Date.now() + 60_000 }, "session-demo");
    const sig = j.split(".")[1];
    const faux = Buffer.from(JSON.stringify({ c: "cl-2", exp: Date.now() + 60_000 })).toString("base64url");
    const plusLong = Buffer.from(JSON.stringify({ c: "cl-1", exp: Date.now() + 10 ** 12 })).toString("base64url");
    expect(desceller(`${faux}.${sig}`, "session-demo")).toBeNull();
    expect(desceller(`${plusLong}.${sig}`, "session-demo")).toBeNull();
  });

  it("refuse le même corps écrit en base64 non canonique (la signature porte sur le texte exact)", () => {
    const j = sceller({ c: "cl-1", exp: Date.now() + 60_000 }, "session-demo");
    const [corps, sig] = j.split(".");
    expect(desceller(`${nonCanonique(corps)}.${sig}`, "session-demo")).toBeNull();
  });

  it("refuse un caractère altéré n'importe où dans le jeton", () => {
    const j = sceller({ c: "cl-1", exp: Date.now() + 60_000 }, "session-demo");
    for (let i = 0; i < j.length; i++) {
      if (j[i] === ".") continue;
      const r = desceller(remplacer(j, i), "session-demo");
      // Seul un changement des bits de remplissage du dernier caractère laisserait le même jeton : il n'y en a pas ici.
      expect(r, `position ${i}`).toBeNull();
    }
  });

  it("refuse un jeton tronqué, sans signature, ou vide", () => {
    const j = sceller({ c: "cl-1", exp: Date.now() + 60_000 }, "session-demo");
    expect(desceller(j.slice(0, -1), "session-demo")).toBeNull();
    expect(desceller(j.split(".")[0], "session-demo")).toBeNull();
    expect(desceller(`${j.split(".")[0]}.`, "session-demo")).toBeNull();
    expect(desceller(`.${j.split(".")[1]}`, "session-demo")).toBeNull();
    expect(desceller("", "session-demo")).toBeNull();
    expect(desceller(undefined, "session-demo")).toBeNull();
  });

  it("refuse un jeton d'un autre usage ou d'une autre clé", () => {
    const j = sceller({ c: "cl-1", exp: Date.now() + 60_000 }, "apercu-equipe");
    expect(desceller(j, "session-apercu")).toBeNull();
    expect(desceller(j, "session-demo")).toBeNull();
    vi.stubEnv("ESPACE_CLIENT_SECRET", "autre-cle");
    expect(desceller(j, "apercu-equipe")).toBeNull();
  });

  it("un segment ajouté après la signature ne change pas le contenu lu", () => {
    const j = sceller({ c: "cl-1", exp: Date.now() + 60_000 }, "session-demo");
    const r = desceller<{ c: string; exp: number }>(`${j}.cl-2`, "session-demo");
    expect(r === null || r.c === "cl-1").toBe(true);
  });

  it("un corps signé mais illisible, ou sans échéance, ne vaut rien et ne lève pas d'erreur", () => {
    for (const texte of ["null", "pas du json", "[]", '{"c":"cl-1"}', '{"c":"cl-1","exp":"demain"}']) {
      const corps = Buffer.from(texte).toString("base64url");
      expect(desceller(`${corps}.${signer(corps, "session-demo")}`, "session-demo"), texte).toBeNull();
    }
  });

  it("encaisse un jeton hostile de 100 000 caractères", () => {
    expect(desceller(`${"A".repeat(100_000)}.${"B".repeat(43)}`, "session-demo")).toBeNull();
  });
});

describe("jetonAleatoire et empreinte", () => {
  it("256 bits en base64url, jamais deux fois le même", () => {
    const vus = new Set<string>();
    for (let i = 0; i < 1_000; i++) {
      const j = jetonAleatoire();
      expect(j).toMatch(/^[A-Za-z0-9_-]{43}$/);
      vus.add(j);
    }
    expect(vus.size).toBe(1_000);
  });

  it("l'empreinte est un SHA-256 en hexadécimal, qui ne contient pas le jeton", () => {
    const j = jetonAleatoire();
    expect(empreinte(j)).toMatch(/^[0-9a-f]{64}$/);
    expect(empreinte(j)).toBe(empreinte(j));
    expect(empreinte(j)).not.toBe(empreinte(remplacer(j, 0)));
    expect(empreinte(j)).not.toContain(j);
  });
});
