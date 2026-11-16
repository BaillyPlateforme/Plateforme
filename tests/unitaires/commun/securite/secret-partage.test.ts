import { beforeEach, describe, expect, it, vi } from "vitest";

const espion = vi.hoisted(() => ({ comparaisons: [] as [number, number][] }));
vi.mock("node:crypto", async (original) => {
  const vrai = await original<typeof import("node:crypto")>();
  return {
    ...vrai,
    timingSafeEqual: (a: Buffer, b: Buffer) => {
      espion.comparaisons.push([a.length, b.length]);
      return vrai.timingSafeEqual(a, b);
    },
  };
});

import { secretPresente } from "@/lib/secret-partage";

/*
 * Le secret partagé des appels de machine à machine (n8n, webhooks) :
 * « Authorization: Bearer <secret> », ou l'authentification HTTP simple avec
 * le secret en mot de passe. Sans secret réglé, rien ne passe.
 */

const SECRET = "s3cr3t-n8n-0123456789abcdef";
const req = (authorization?: string) => new Request("https://plateforme.test/api/x", { headers: authorization === undefined ? {} : { authorization } });
const basic = (utilisateur: string, motDePasse: string) => `Basic ${Buffer.from(`${utilisateur}:${motDePasse}`, "utf8").toString("base64")}`;

beforeEach(() => {
  espion.comparaisons.length = 0;
});

describe("secretPresente — sans secret réglé", () => {
  it.each([undefined, null, "", "   ", "\n\t"])("refuse tout quand le secret vaut %j", (secret) => {
    expect(secretPresente(req("Bearer "), secret)).toBe(false);
    expect(secretPresente(req("Bearer undefined"), secret)).toBe(false);
    expect(secretPresente(req("Bearer null"), secret)).toBe(false);
    expect(secretPresente(req(basic("n8n", "")), secret)).toBe(false);
    expect(secretPresente(req(), secret)).toBe(false);
  });
});

describe("secretPresente — Bearer", () => {
  it("accepte le bon secret", () => {
    expect(secretPresente(req(`Bearer ${SECRET}`), SECRET)).toBe(true);
  });

  it("ignore les blancs autour du secret, de l'en-tête comme de la variable", () => {
    expect(secretPresente(req(`Bearer   ${SECRET}   `), SECRET)).toBe(true);
    expect(secretPresente(req(`Bearer ${SECRET}`), `  ${SECRET}\n`)).toBe(true);
  });

  it("refuse un secret altéré d'un seul caractère, à chaque position", () => {
    for (let i = 0; i < SECRET.length; i++) {
      const altere = SECRET.slice(0, i) + (SECRET[i] === "x" ? "y" : "x") + SECRET.slice(i + 1);
      expect(secretPresente(req(`Bearer ${altere}`), SECRET)).toBe(false);
    }
  });

  it("refuse un secret tronqué, prolongé, ou un préfixe", () => {
    expect(secretPresente(req(`Bearer ${SECRET.slice(0, -1)}`), SECRET)).toBe(false);
    expect(secretPresente(req(`Bearer ${SECRET}x`), SECRET)).toBe(false);
    expect(secretPresente(req(`Bearer ${SECRET.slice(0, 1)}`), SECRET)).toBe(false);
    expect(secretPresente(req(`Bearer ${SECRET.toUpperCase()}`), SECRET)).toBe(false);
  });

  it("refuse un Bearer vide, un schéma absent ou inconnu", () => {
    expect(secretPresente(req("Bearer "), SECRET)).toBe(false);
    expect(secretPresente(req("Bearer"), SECRET)).toBe(false);
    expect(secretPresente(req(SECRET), SECRET)).toBe(false);
    expect(secretPresente(req(`Token ${SECRET}`), SECRET)).toBe(false);
    expect(secretPresente(req(`Digest ${SECRET}`), SECRET)).toBe(false);
    expect(secretPresente(req(), SECRET)).toBe(false);
  });

  it("refuse le secret glissé ailleurs que dans Authorization", () => {
    const r = new Request("https://plateforme.test/api/x?secret=" + SECRET, { headers: { "x-secret": SECRET, cookie: `secret=${SECRET}` } });
    expect(secretPresente(r, SECRET)).toBe(false);
  });

  it("encaisse un secret fourni de 100 000 caractères sans lever d'erreur", () => {
    expect(secretPresente(req(`Bearer ${"a".repeat(100_000)}`), SECRET)).toBe(false);
  });
});

describe("secretPresente — authentification HTTP simple", () => {
  it("accepte le secret en mot de passe, quel que soit l'utilisateur", () => {
    expect(secretPresente(req(basic("n8n", SECRET)), SECRET)).toBe(true);
    expect(secretPresente(req(basic("", SECRET)), SECRET)).toBe(true);
  });

  it("accepte un secret qui contient lui-même des deux-points", () => {
    expect(secretPresente(req(basic("n8n", "a:b:c")), "a:b:c")).toBe(true);
  });

  it("accepte un secret Unicode, encodé en UTF-8", () => {
    expect(secretPresente(req(basic("n8n", "clé-é-ü-😀")), "clé-é-ü-😀")).toBe(true);
  });

  it("refuse le secret placé en nom d'utilisateur, ou sans deux-points", () => {
    expect(secretPresente(req(basic(SECRET, "")), SECRET)).toBe(false);
    expect(secretPresente(req(`Basic ${Buffer.from(SECRET).toString("base64")}`), SECRET)).toBe(false);
  });

  it("refuse un mot de passe altéré, ou suivi d'un octet nul", () => {
    expect(secretPresente(req(basic("n8n", SECRET.slice(0, -1) + "#")), SECRET)).toBe(false);
    expect(secretPresente(req(basic("n8n", `${SECRET}\u0000`)), SECRET)).toBe(false);
  });

  it("refuse une base64 illisible ou vide", () => {
    expect(secretPresente(req("Basic "), SECRET)).toBe(false);
    expect(secretPresente(req("Basic !!!!"), SECRET)).toBe(false);
    expect(secretPresente(req("Basic Og=="), SECRET)).toBe(false); // « : » seul
  });

  it("la base64 non canonique (sans remplissage) désigne le même mot de passe : seul le contenu décodé compte", () => {
    const b64 = Buffer.from(`n8n:${SECRET}`).toString("base64").replace(/=+$/, "");
    expect(secretPresente(req(`Basic ${b64}`), SECRET)).toBe(true);
  });
});

describe("secretPresente — comparaison à temps constant", () => {
  it("compare toujours deux empreintes de 32 octets, quelle que soit la longueur fournie", () => {
    for (const fourni of ["a", SECRET, "b".repeat(5_000)]) secretPresente(req(`Bearer ${fourni}`), SECRET);
    secretPresente(req(basic("u", "court")), SECRET);
    expect(espion.comparaisons).toHaveLength(4);
    for (const [a, b] of espion.comparaisons) expect([a, b]).toEqual([32, 32]);
  });

  it("ne compare rien du tout quand aucun secret n'est fourni", () => {
    secretPresente(req("Bearer "), SECRET);
    secretPresente(req(), SECRET);
    expect(espion.comparaisons).toHaveLength(0);
  });
});
