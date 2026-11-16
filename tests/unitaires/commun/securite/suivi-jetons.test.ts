import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signer } from "@/lib/espace-client/signature";
import {
  chiffrer,
  dechiffrer,
  DUREE_JETON_VISITE_MS,
  empreinteIp,
  jetonAttribution,
  jetonEnvoi,
  jetonVisite,
  lireAttribution,
  lireJetonEnvoi,
  lireJetonVisite,
} from "@/lib/suivi-envois/jetons";

/*
 * Les jetons du suivi des e-mails (suivi-envois/jetons.ts) : le jeton d'un
 * e-mail (pixel et liens), le jeton de visite du portail, le cookie
 * d'attribution, et le chiffrement des adresses des liens.
 */

const ID = "123e4567-e89b-42d3-a456-426614174000";
const AUTRE = "00000000-0000-4000-8000-000000000001";
const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

beforeEach(() => {
  vi.stubEnv("ESPACE_CLIENT_SECRET", "secret-de-test-0123456789");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("jetonEnvoi et lireJetonEnvoi", () => {
  it("un jeton court : 22 caractères d'identifiant, un point, 22 de signature", () => {
    expect(jetonEnvoi(ID)).toMatch(/^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$/);
  });

  it("rend l'identifiant de l'envoi, en minuscules, même émis en capitales", () => {
    expect(lireJetonEnvoi(jetonEnvoi(ID))).toBe(ID);
    expect(lireJetonEnvoi(jetonEnvoi(ID.toUpperCase()))).toBe(ID);
    expect(jetonEnvoi(ID.toUpperCase())).toBe(jetonEnvoi(ID));
  });

  it("lit le jeton du pixel, suffixé .gif", () => {
    expect(lireJetonEnvoi(`${jetonEnvoi(ID)}.gif`)).toBe(ID);
    expect(lireJetonEnvoi(`${jetonEnvoi(ID)}.GIF`)).toBe(ID);
  });

  it.each(["pas-un-uuid", `${ID}\n`, ` ${ID}`, `${ID}0`, "123e4567e89b42d3a456426614174000", "", "'; DROP TABLE envois; --"])(
    "refuse d'émettre un jeton pour %j",
    (id) => expect(() => jetonEnvoi(id)).toThrow(/Identifiant d'envoi invalide/),
  );

  it("refuse une signature altérée d'un caractère, à chaque position", () => {
    const [corps, sig] = jetonEnvoi(ID).split(".");
    for (let i = 0; i < sig.length; i++) {
      for (const c of ["A", "z", "-"]) {
        if (sig[i] === c) continue;
        expect(lireJetonEnvoi(`${corps}.${sig.slice(0, i)}${c}${sig.slice(i + 1)}`)).toBeNull();
      }
    }
  });

  it("un corps altéré ne désigne jamais un autre envoi", () => {
    const [corps, sig] = jetonEnvoi(ID).split(".");
    for (let i = 0; i < corps.length; i++) {
      for (const c of B64URL) {
        const r = lireJetonEnvoi(`${corps.slice(0, i)}${c}${corps.slice(i + 1)}.${sig}`);
        // Seule une variante non canonique (bits de remplissage) redonne le même envoi ; jamais un autre.
        expect(r === null || r === ID).toBe(true);
      }
    }
  });

  it("refuse la signature d'un envoi greffée sur un autre identifiant", () => {
    const sigDeId = jetonEnvoi(ID).split(".")[1];
    const corpsAutre = jetonEnvoi(AUTRE).split(".")[0];
    expect(lireJetonEnvoi(`${corpsAutre}.${sigDeId}`)).toBeNull();
  });

  it("refuse un jeton tronqué, vide ou absent", () => {
    const j = jetonEnvoi(ID);
    expect(lireJetonEnvoi(j.slice(0, -1))).toBeNull();
    expect(lireJetonEnvoi(j.slice(1))).toBeNull();
    expect(lireJetonEnvoi(j.split(".")[0])).toBeNull();
    for (const v of ["", ".", "..", null, undefined]) expect(lireJetonEnvoi(v)).toBeNull();
  });

  it("refuse un corps trop long, et un jeton hostile de 100 000 caractères", () => {
    const [corps, sig] = jetonEnvoi(ID).split(".");
    expect(lireJetonEnvoi(`${corps}${"A".repeat(10)}.${sig}`)).toBeNull();
    expect(lireJetonEnvoi("A".repeat(100_000))).toBeNull();
    expect(lireJetonEnvoi(`${"A".repeat(100_000)}.${sig}`)).toBeNull();
  });

  it("refuse une signature d'un autre usage, ou d'une autre clé", () => {
    const corps = jetonEnvoi(ID).split(".")[0];
    expect(lireJetonEnvoi(`${corps}.${signer(ID, "suivi-visite").slice(0, 22)}`)).toBeNull();
    expect(lireJetonEnvoi(`${corps}.${signer(ID, "suivi-ip").slice(0, 22)}`)).toBeNull();
    const j = jetonEnvoi(ID);
    vi.stubEnv("ESPACE_CLIENT_SECRET", "une-autre-cle");
    expect(lireJetonEnvoi(j)).toBeNull();
  });

  it("refuse un identifiant de 16 octets qui n'en a pas la forme (corps trop court)", () => {
    const sig = jetonEnvoi(ID).split(".")[1];
    expect(lireJetonEnvoi(`${Buffer.alloc(15).toString("base64url")}.${sig}`)).toBeNull();
  });
});

describe("chiffrer et dechiffrer (AES-256-GCM)", () => {
  const LIEN = "https://plateforme.test/espace-client/acces?token_hash=abc123&suite=/espace-client/BD-2026-0164/devis";

  it("rend le texte d'origine, quel qu'il soit", () => {
    for (const t of [LIEN, "", "é😀‮<script>", "a".repeat(100_000)]) expect(dechiffrer(chiffrer(t))).toBe(t);
  });

  it("deux chiffrements d'un même lien diffèrent (vecteur aléatoire), sans laisser voir le lien", () => {
    const a = chiffrer(LIEN);
    const b = chiffrer(LIEN);
    expect(a).not.toBe(b);
    expect(a).not.toContain("token_hash");
    expect(Buffer.from(a, "base64url").toString("latin1")).not.toContain("abc123");
  });

  it("refuse un octet altéré : vecteur, étiquette ou corps", () => {
    const brut = Buffer.from(chiffrer(LIEN), "base64url");
    for (const i of [0, 11, 12, 27, 28, brut.length - 1]) {
      const altere = Buffer.from(brut);
      altere[i] ^= 0x01;
      expect(dechiffrer(altere.toString("base64url")), `octet ${i}`).toBeNull();
    }
  });

  it("refuse un chiffré tronqué, vide ou illisible", () => {
    const c = chiffrer(LIEN);
    expect(dechiffrer(c.slice(0, -2))).toBeNull();
    expect(dechiffrer(c.slice(0, 20))).toBeNull();
    expect(dechiffrer("")).toBeNull();
    expect(dechiffrer("!!!pas de la base64!!!")).toBeNull();
  });

  it("refuse un chiffré d'une autre clé", () => {
    const c = chiffrer(LIEN);
    vi.stubEnv("ESPACE_CLIENT_SECRET", "une-autre-cle");
    expect(dechiffrer(c)).toBeNull();
  });
});

describe("empreinteIp", () => {
  it("16 caractères, stables, différents d'une adresse à l'autre, sans l'adresse", () => {
    const e = empreinteIp("203.0.113.7")!;
    expect(e).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(empreinteIp("203.0.113.7")).toBe(e);
    expect(empreinteIp("203.0.113.8")).not.toBe(e);
    expect(e).not.toContain("203");
  });

  it("ne garde que la première adresse d'une liste, sans les blancs", () => {
    expect(empreinteIp(" 203.0.113.7 , 100.64.0.2")).toBe(empreinteIp("203.0.113.7"));
  });

  it("rien à empreindre : null", () => {
    for (const v of [null, undefined, "", "   ", ", 100.64.0.2"]) expect(empreinteIp(v)).toBeNull();
  });

  it("dépend de la clé du serveur : impossible à recalculer sans elle", () => {
    const e = empreinteIp("203.0.113.7");
    vi.stubEnv("ESPACE_CLIENT_SECRET", "une-autre-cle");
    expect(empreinteIp("203.0.113.7")).not.toBe(e);
  });
});

describe("jeton de visite et cookie d'attribution", () => {
  const visite = { d: "dossier-1", c: "client-1", r: "BD-2026-0164", k: 42 };

  it("le jeton de visite se lit pendant 12 heures, plus après", () => {
    vi.useFakeTimers({ now: new Date("2026-11-15T10:00:00Z") });
    const j = jetonVisite(visite);
    expect(lireJetonVisite(j)).toMatchObject(visite);
    vi.advanceTimersByTime(DUREE_JETON_VISITE_MS - 1);
    expect(lireJetonVisite(j)).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(lireJetonVisite(j)).toBeNull();
  });

  it("l'attribution rend l'envoi d'origine jusqu'à son échéance", () => {
    vi.useFakeTimers({ now: new Date("2026-11-15T10:00:00Z") });
    const j = jetonAttribution(ID, 60_000);
    expect(lireAttribution(j)).toBe(ID);
    vi.advanceTimersByTime(60_000);
    expect(lireAttribution(j)).toBeNull();
  });

  it("une durée nulle ou négative ne donne rien de lisible", () => {
    expect(lireAttribution(jetonAttribution(ID, 0))).toBeNull();
    expect(lireAttribution(jetonAttribution(ID, -1_000))).toBeNull();
  });

  it("un jeton de visite ne vaut pas attribution, ni l'inverse", () => {
    expect(lireAttribution(jetonVisite(visite))).toBeNull();
    expect(lireJetonVisite(jetonAttribution(ID, 60_000))).toBeNull();
  });

  it("refuse un jeton altéré, d'une autre clé, ou absent", () => {
    const j = jetonVisite(visite);
    const i = j.indexOf(".") + 3;
    expect(lireJetonVisite(j.slice(0, i) + (j[i] === "A" ? "B" : "A") + j.slice(i + 1))).toBeNull();
    expect(lireJetonVisite(null)).toBeNull();
    expect(lireAttribution(undefined)).toBeNull();
    vi.stubEnv("ESPACE_CLIENT_SECRET", "une-autre-cle");
    expect(lireJetonVisite(j)).toBeNull();
  });
});
