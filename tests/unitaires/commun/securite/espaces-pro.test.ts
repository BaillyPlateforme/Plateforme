import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* ── Le stockage Supabase et le disque, simulés. ── */

const stock = vi.hoisted(() => ({
  fichier: null as string | null,
  envois: [] as { chemin: string; corps: unknown; options: unknown }[],
  retraits: [] as string[][],
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    storage: {
      createBucket: async () => ({ error: null }),
      from: () => ({
        download: async () =>
          stock.fichier === null ? { data: null, error: { message: "Object not found" } } : { data: new Blob([stock.fichier]), error: null },
        upload: async (chemin: string, corps: unknown, options: unknown) => {
          stock.envois.push({ chemin, corps, options });
          if (chemin === "espaces.json") stock.fichier = String(corps);
          return { error: null };
        },
        remove: async (chemins: string[]) => {
          stock.retraits.push(chemins);
          return { error: null };
        },
      }),
    },
  }),
}));
const disque = vi.hoisted(() => ({ lus: [] as string[] }));
vi.mock("node:fs/promises", async (original) => {
  const vrai = await original<typeof import("node:fs/promises")>();
  return {
    ...vrai,
    readFile: async (p: string) => {
      disque.lus.push(String(p));
      return Buffer.from("PNG");
    },
  };
});

import { LOGO_FOURNI } from "@/lib/espaces";
import {
  codeEspace,
  enregistrerEspace,
  enregistrerLogo,
  enregistrerRegles,
  getEspace,
  getEspaceParCode,
  getEspaceParCodeOuJeton,
  lireLogo,
  listEspaces,
  POIDS_LOGO_MAX,
  reconnaitreEspace,
  renouvelerLien,
  urlLogoPublique,
} from "@/lib/espaces-pro";

/*
 * Les espaces pro (espaces-pro.ts) : le code du lien /pro/<code>/<nom> se
 * calcule par HMAC d'une clé du serveur ; le jeton de reconnaissance, remis à
 * qui tape le nom de sa société, ne l'ouvre pas.
 */

const LETTRES = /^[bcdfghjkmnpqrstvwxz23456789]+$/;

beforeEach(() => {
  vi.stubEnv("ESPACES_SECRET", "secret-espaces-de-test");
  delete (globalThis as { __espacesPro?: unknown }).__espacesPro;
  stock.fichier = null;
  stock.envois = [];
  stock.retraits = [];
  disque.lus = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("codeEspace", () => {
  it("dix caractères sans voyelle ni caractère ambigu", () => {
    const c = codeEspace({ id: "carrefour", rotation: 0 });
    expect(c).toHaveLength(10);
    expect(c).toMatch(LETTRES);
    expect(c).not.toMatch(/[aeiouyl01]/);
  });

  it("stable, mais change avec l'espace, la rotation et la clé", () => {
    const c = codeEspace({ id: "carrefour", rotation: 0 });
    expect(codeEspace({ id: "carrefour", rotation: 0 })).toBe(c);
    expect(codeEspace({ id: "engie", rotation: 0 })).not.toBe(c);
    expect(codeEspace({ id: "carrefour", rotation: 1 })).not.toBe(c);
    vi.stubEnv("ESPACES_SECRET", "une-autre-cle");
    expect(codeEspace({ id: "carrefour", rotation: 0 })).not.toBe(c);
  });

  it("un identifiant piégé (« : » du message signé) ne recrée pas le code d'un autre espace", () => {
    expect(codeEspace({ id: "carrefour:0", rotation: 0 })).not.toBe(codeEspace({ id: "carrefour", rotation: 0 }));
  });

  it("ESPACES_SECRET passe avant la clé service_role ; sans aucune clé, rien ne se calcule", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
    const avec = codeEspace({ id: "carrefour", rotation: 0 });
    vi.stubEnv("ESPACES_SECRET", "");
    expect(codeEspace({ id: "carrefour", rotation: 0 })).not.toBe(avec);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => codeEspace({ id: "carrefour", rotation: 0 })).toThrow(/Aucune clé serveur/);
  });
});

describe("le code ouvre l'espace, le nom et le jeton ne l'ouvrent pas", () => {
  it("getEspaceParCode retrouve l'espace par son code exact", async () => {
    const code = codeEspace({ id: "carrefour", rotation: 0 });
    expect((await getEspaceParCode(code))?.slug).toBe("carrefour");
  });

  it.each(["", "carrefour", "CARREFOUR", " ", "%", "*"])("getEspaceParCode(%j) : rien", async (code) => {
    expect(await getEspaceParCode(code)).toBeNull();
  });

  it("un code altéré d'un caractère, tronqué ou en capitales n'ouvre rien", async () => {
    const code = codeEspace({ id: "carrefour", rotation: 0 });
    expect(await getEspaceParCode(code.slice(0, -1))).toBeNull();
    expect(await getEspaceParCode(`${code.slice(0, -1)}${code.endsWith("b") ? "c" : "b"}`)).toBeNull();
    expect(await getEspaceParCode(code.toUpperCase())).toBeNull();
    expect(await getEspaceParCode(` ${code}`)).toBeNull();
  });

  it("reconnaitreEspace rend un jeton à la place du code, et ce jeton n'ouvre pas la page", async () => {
    const e = await reconnaitreEspace("Je travaille chez Carrefour Market");
    expect(e?.slug).toBe("carrefour");
    expect(e?.code).toMatch(/^r[bcdfghjkmnpqrstvwxz23456789]{13}$/);
    expect(e?.code).not.toBe(codeEspace({ id: "carrefour", rotation: 0 }));
    expect(await getEspaceParCode(e!.code)).toBeNull();
    // … mais il rattache bien une demande à l'espace.
    expect((await getEspaceParCodeOuJeton(e!.code))?.slug).toBe("carrefour");
  });

  it("l'espace standard n'est celui d'aucune société", async () => {
    expect(await reconnaitreEspace("Espace pro standard")).toBeNull();
  });

  it("un espace fermé n'est pas reconnu", async () => {
    await enregistrerEspace({ id: "engie", actif: false });
    expect(await reconnaitreEspace("Engie")).toBeNull();
  });

  it("getEspaceParCodeOuJeton : ni vide ni inconnu", async () => {
    expect(await getEspaceParCodeOuJeton("")).toBeNull();
    expect(await getEspaceParCodeOuJeton("rbcdfghjkmnpqr")).toBeNull();
  });

  it("le slug se retrouve par son nom, quelle que soit l'écriture", async () => {
    expect((await getEspace("Crédit Agricole"))?.slug).toBe("credit-agricole");
    expect((await getEspace("../credit-agricole"))?.slug).toBe("credit-agricole");
  });
});

describe("renouvelerLien", () => {
  it("l'ancien code cesse aussitôt de fonctionner", async () => {
    const ancien = codeEspace({ id: "carrefour", rotation: 0 });
    const maj = await renouvelerLien("carrefour");
    expect(maj.rotation).toBe(1);
    expect(maj.code).not.toBe(ancien);
    expect(await getEspaceParCode(ancien)).toBeNull();
    expect((await getEspaceParCode(maj.code))?.slug).toBe("carrefour");
  });

  it("le code n'est jamais écrit dans le fichier enregistré", async () => {
    const maj = await renouvelerLien("carrefour");
    const corps = String(stock.envois.find((e) => e.chemin === "espaces.json")?.corps);
    expect(corps).not.toContain(maj.code);
    expect(JSON.parse(corps).espaces.every((e: Record<string, unknown>) => !("code" in e))).toBe(true);
  });

  it("refuse un espace inconnu", async () => {
    await expect(renouvelerLien("inconnu")).rejects.toThrow(/introuvable/);
  });
});

describe("enregistrerEspace : ce qu'un enregistrement ne peut pas changer", () => {
  it("ni la rotation du lien, ni le logo, ni le code", async () => {
    const avant = (await listEspaces()).find((e) => e.id === "carrefour")!;
    const apres = await enregistrerEspace({ id: "carrefour", rotation: 42, logo: "../../espaces.json", code: "bcdfghjkmn" });
    expect(apres.rotation).toBe(avant.rotation);
    expect(apres.logo).toBe(avant.logo);
    expect(apres.code).toBe(avant.code);
  });

  it("un nouvel espace ne choisit pas son logo", async () => {
    const e = await enregistrerEspace({ nom: "Société Nouvelle", logo: `${LOGO_FOURNI}../../../etc/passwd` });
    expect(e.logo).toBeNull();
  });

  it.each(["red", "#12345", "#1234567", "#12345g", "#123456\" onload=\"x", "url(javascript:alert(1))"])("refuse la couleur %j", async (couleur) => {
    await expect(enregistrerEspace({ nom: "Test", couleur })).rejects.toThrow(/hexadécimal/);
  });

  it("refuse une cote hors de -50 % à +100 %, ou qui n'est pas un nombre", async () => {
    for (const ajustement_volume of [-51, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(enregistrerEspace({ nom: "Test", ajustement_volume })).rejects.toThrow(/cote sur le volume/);
    }
    await expect(enregistrerRegles({ ajustement_volume: 500 })).rejects.toThrow(/cote sur le volume/);
  });

  it("refuse un lien déjà pris par un autre espace, et un nom vide", async () => {
    await expect(enregistrerEspace({ nom: "Carrefour" })).rejects.toThrow(/déjà pris/);
    await expect(enregistrerEspace({ nom: "   " })).rejects.toThrow(/nom/);
    await expect(enregistrerEspace({ nom: "!!!" })).rejects.toThrow(/vide/);
  });
});

describe("les logos", () => {
  it("refuse un SVG (scripts), un GIF, un type vide, avant tout envoi", async () => {
    for (const type of ["image/svg+xml", "image/gif", "text/html", ""]) {
      await expect(enregistrerLogo("carrefour", { type, donnees: Buffer.from("x") })).rejects.toThrow(/PNG ou JPEG/);
    }
    expect(stock.envois).toHaveLength(0);
  });

  it("refuse un logo de plus de 600 Ko", async () => {
    await expect(enregistrerLogo("carrefour", { type: "image/png", donnees: Buffer.alloc(POIDS_LOGO_MAX + 1) })).rejects.toThrow(/600 Ko/);
    expect(stock.envois).toHaveLength(0);
  });

  it("le chemin enregistré est fabriqué par le serveur, jamais fourni", async () => {
    const e = await enregistrerLogo("carrefour", { type: "image/png", donnees: Buffer.from("PNG") });
    expect(e.logo).toMatch(/^logos\/carrefour-\d+\.png$/);
  });

  it("un logo livré ne se lit que dans le dossier des logos, quoi que contienne son chemin", async () => {
    for (const logo of [`${LOGO_FOURNI}carrefour.png`, `${LOGO_FOURNI}../../../../etc/passwd`, `${LOGO_FOURNI}..%2F..%2Fsecret.png`]) {
      await lireLogo({ logo });
    }
    const dossier = path.join(process.cwd(), "assets", "espaces");
    expect(disque.lus).toHaveLength(3);
    for (const p of disque.lus) expect(path.dirname(p)).toBe(dossier);
  });

  it("l'adresse publique du logo porte le jeton, jamais le code du lien", () => {
    const e = { id: "carrefour", rotation: 0, logo: "logos/x.png", updated_at: "2026-11-15T10:00:00.000Z" };
    const url = urlLogoPublique(e, "https://plateforme.test")!;
    expect(url).not.toContain(codeEspace(e));
    expect(url).toMatch(/^https:\/\/plateforme\.test\/api\/espaces\/r[a-z0-9]{13}\/logo\?v=2026-11-15T10%3A00%3A00.000Z$/);
    expect(urlLogoPublique({ ...e, logo: null })).toBeNull();
  });
});
