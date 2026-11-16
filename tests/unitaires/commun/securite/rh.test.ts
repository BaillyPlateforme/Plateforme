import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({ getAcces: vi.fn() }));
vi.mock("@/lib/espaces-pro", async () => {
  const { ESPACES_PAR_DEFAUT, REGLES_PAR_DEFAUT } = await vi.importActual<typeof import("@/lib/espaces")>("@/lib/espaces");
  return { listEspaces: vi.fn(async () => ESPACES_PAR_DEFAUT), lireRegles: vi.fn(async () => REGLES_PAR_DEFAUT) };
});

import { getAcces } from "@/lib/supabase/auth";
import { cheminQr, matriceQr } from "@/lib/rh-qr";
import { espaceDeLaSession } from "@/lib/rh-session";

/* ─────────────────────────── rh-session.ts ─────────────────────────── */

describe("espaceDeLaSession — la seule porte des routes de l'espace RH", () => {
  const req = (q = "") => new Request(`https://plateforme.test/api/rh/demandes${q}`);
  const rh = (espaceId: string) => ({ id: "u-rh", email: "rh@carrefour.fr", role: "rh" as const, espaceId, nom: "RH" });
  const equipe = { id: "u-eq", email: "celine@bailly.fr", role: "equipe" as const };

  beforeEach(() => {
    vi.mocked(getAcces).mockReset();
  });

  it("sans session : 401", async () => {
    vi.mocked(getAcces).mockResolvedValue(null);
    expect(await espaceDeLaSession(req())).toEqual({ ok: false, statut: 401, erreur: "Non authentifié" });
  });

  it("un compte RH reçoit SON entreprise, quel que soit ?apercu=", async () => {
    vi.mocked(getAcces).mockResolvedValue(rh("carrefour"));
    for (const q of ["", "?apercu=engie", "?apercu=standard", "?apercu=carrefour&apercu=engie", "?apercu=../engie"]) {
      const r = await espaceDeLaSession(req(q));
      expect(r.ok && r.espace?.id, q).toBe("carrefour");
    }
  });

  it("un compte RH rattaché à aucune entreprise : 404, même avec ?apercu=", async () => {
    vi.mocked(getAcces).mockResolvedValue(rh(""));
    const r = await espaceDeLaSession(req("?apercu=carrefour"));
    expect(r).toMatchObject({ ok: false, statut: 404 });
  });

  it("un compte RH rattaché à l'espace standard, ou à un espace disparu : 404", async () => {
    vi.mocked(getAcces).mockResolvedValue(rh("standard"));
    expect(await espaceDeLaSession(req())).toMatchObject({ ok: false, statut: 404 });
    vi.mocked(getAcces).mockResolvedValue(rh("supprime"));
    expect(await espaceDeLaSession(req())).toMatchObject({ ok: false, statut: 404 });
  });

  it("l'équipe, sans espace choisi, reçoit la liste — sans l'espace standard", async () => {
    vi.mocked(getAcces).mockResolvedValue(equipe);
    const r = await espaceDeLaSession(req());
    expect(r.ok && r.espace).toBeNull();
    if (r.ok && r.espace === null) {
      expect(r.espaces.length).toBeGreaterThan(0);
      expect(r.espaces.some((e) => e.slug === "standard")).toBe(false);
    }
  });

  it("l'équipe ouvre l'espace demandé, jamais l'espace standard ni un inconnu", async () => {
    vi.mocked(getAcces).mockResolvedValue(equipe);
    const r = await espaceDeLaSession(req("?apercu=engie"));
    expect(r.ok && r.espace?.id).toBe("engie");
    expect(await espaceDeLaSession(req("?apercu=standard"))).toMatchObject({ ok: false, statut: 404 });
    expect(await espaceDeLaSession(req("?apercu=%27%20OR%201%3D1"))).toMatchObject({ ok: false, statut: 404 });
  });
});

/* ─────────────────────────── rh-qr.ts ─────────────────────────── */

/*
 * Un décodeur indépendant, construit sur les tables de la norme ISO/IEC 18004
 * (positions des repères d'alignement, découpage en blocs du niveau M,
 * formules des masques) et non sur le code testé : le code QR doit redonner
 * EXACTEMENT le lien, et rien d'autre.
 */
const ALIGNEMENT: Record<number, number[]> = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
/** Niveau M : [nombre de blocs, octets de données] courts puis longs, et octets de correction par bloc. */
const BLOCS_M: Record<number, { blocs: [number, number][]; ecc: number }> = {
  1: { blocs: [[1, 16]], ecc: 10 }, 2: { blocs: [[1, 28]], ecc: 16 }, 3: { blocs: [[1, 44]], ecc: 26 }, 4: { blocs: [[2, 32]], ecc: 18 },
  5: { blocs: [[2, 43]], ecc: 24 }, 6: { blocs: [[4, 27]], ecc: 16 }, 7: { blocs: [[4, 31]], ecc: 18 }, 8: { blocs: [[2, 38], [2, 39]], ecc: 22 },
  9: { blocs: [[3, 36], [2, 37]], ecc: 22 }, 10: { blocs: [[4, 43], [1, 44]], ecc: 26 },
};
const MASQUES: ((i: number, j: number) => boolean)[] = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (_, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];
const EXP: number[] = [];
const LOG: number[] = [];
for (let i = 0, x = 1; i < 255; i++, x = (x << 1) ^ (x & 0x80 ? 0x11d : 0)) {
  EXP[i] = x;
  LOG[x] = i;
}
const mul = (a: number, b: number) => (a && b ? EXP[(LOG[a] + LOG[b]) % 255] : 0);
const bch = (d: number, gen: number, deg: number) => {
  let r = d << deg;
  for (let i = 31; i >= deg; i--) if ((r >>> i) & 1) r ^= gen << (i - deg);
  return r;
};

function decoder(m: boolean[][]): { texte: string; version: number; masque: number } {
  const n = m.length;
  const v = (n - 17) / 4;
  if (!Number.isInteger(v) || v < 1 || v > 10 || m.some((l) => l.length !== n)) throw new Error("taille");
  const b = (x: number, y: number) => (m[y][x] ? 1 : 0);

  // Les bits de format, en deux exemplaires identiques.
  let a = 0;
  for (let i = 0; i <= 5; i++) a |= b(8, i) << i;
  a |= (b(8, 7) << 6) | (b(8, 8) << 7) | (b(7, 8) << 8);
  for (let i = 9; i < 15; i++) a |= b(14 - i, 8) << i;
  let c = 0;
  for (let i = 0; i < 8; i++) c |= b(n - 1 - i, 8) << i;
  for (let i = 8; i < 15; i++) c |= b(8, n - 15 + i) << i;
  if (a !== c) throw new Error("format : deux copies différentes");
  const brut = a ^ 0x5412;
  const d = brut >>> 10;
  if (bch(d, 0x537, 10) !== (brut & 0x3ff)) throw new Error("format : BCH");
  if (d >>> 3 !== 0) throw new Error("format : niveau autre que M");
  const masque = d & 7;
  if (!m[n - 8][8]) throw new Error("module sombre");
  if (v >= 7) {
    const attendu = (v << 12) | bch(v, 0x1f25, 12);
    for (let i = 0; i < 18; i++) {
      const bit = (attendu >>> i) & 1;
      if (b(n - 11 + (i % 3), Math.floor(i / 3)) !== bit || b(Math.floor(i / 3), n - 11 + (i % 3)) !== bit) throw new Error("version");
    }
  }

  // Les modules de fonction, d'après la norme.
  const f = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const fx = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < n && y < n) f[y][x] = true;
  };
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) (fx(x, y), fx(n - 1 - x, y), fx(x, n - 1 - y));
  for (let i = 0; i < n; i++) (fx(6, i), fx(i, 6));
  const al = ALIGNEMENT[v];
  for (const cy of al)
    for (const cx of al) {
      if ((cx === 6 && cy === 6) || (cx === 6 && cy === al.at(-1)) || (cx === al.at(-1) && cy === 6)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) fx(cx + dx, cy + dy);
    }
  for (let i = 0; i < 9; i++) (fx(8, i), fx(i, 8));
  for (let i = 0; i < 8; i++) (fx(n - 1 - i, 8), fx(8, n - 1 - i));
  if (v >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) (fx(n - 11 + j, i), fx(i, n - 11 + j));

  // Lecture en zigzag, masque retiré.
  const bits: number[] = [];
  for (let droite = n - 1; droite >= 1; droite -= 2) {
    if (droite === 6) droite = 5;
    for (let k = 0; k < n; k++)
      for (let j = 0; j < 2; j++) {
        const x = droite - j;
        const y = ((droite + 1) & 2) === 0 ? n - 1 - k : k;
        if (!f[y][x]) bits.push(b(x, y) ^ (MASQUES[masque](y, x) ? 1 : 0));
      }
  }
  const { blocs: forme, ecc } = BLOCS_M[v];
  const tailles = forme.flatMap(([nb, t]) => new Array<number>(nb).fill(t));
  const total = tailles.reduce((s, t) => s + t + ecc, 0);
  const octets: number[] = [];
  for (let i = 0; i < total; i++) octets.push(bits.slice(i * 8, i * 8 + 8).reduce((s, x) => (s << 1) | x, 0));

  // Désentrelacement, puis contrôle Reed-Solomon de chaque bloc (syndromes nuls).
  const blocs = tailles.map(() => [] as number[]);
  let k = 0;
  for (let i = 0; i < Math.max(...tailles); i++) tailles.forEach((t, j) => i < t && blocs[j].push(octets[k++]));
  for (let i = 0; i < ecc; i++) blocs.forEach((bl) => bl.push(octets[k++]));
  for (const bl of blocs)
    for (let s = 0; s < ecc; s++) {
      let r = 0;
      for (const o of bl) r = mul(r, EXP[s]) ^ o;
      if (r !== 0) throw new Error("Reed-Solomon");
    }

  // Les données : mode octets, longueur, octets UTF-8, puis le remplissage normal.
  const donnees = blocs.flatMap((bl, j) => bl.slice(0, tailles[j]));
  const flux = donnees.flatMap((o) => Array.from({ length: 8 }, (_, i) => (o >>> (7 - i)) & 1));
  let p = 0;
  const lire = (nb: number) => flux.slice(p, (p += nb)).reduce((s, x) => (s << 1) | x, 0);
  if (lire(4) !== 0b0100) throw new Error("mode");
  const longueur = lire(v < 10 ? 8 : 16);
  const contenu = Array.from({ length: longueur }, () => lire(8));
  // Le terminateur (jusqu'à quatre zéros), l'alignement sur l'octet, puis 0xEC, 0x11, 0xEC…
  const debut = Math.ceil((p + Math.min(4, flux.length - p)) / 8);
  if (flux.slice(p, debut * 8).some(Boolean)) throw new Error("terminateur");
  donnees.slice(debut).forEach((o, i) => {
    if (o !== (i % 2 === 0 ? 0xec : 0x11)) throw new Error("remplissage");
  });
  return { texte: new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(contenu)), version: v, masque };
}

describe("matriceQr — le code redonne exactement le lien", () => {
  const LIEN = "https://plateforme.bailly.test/pro/bcdfghjkmn/carrefour";

  it("le lien d'un espace pro se relit à l'identique", () => {
    expect(decoder(matriceQr(LIEN)).texte).toBe(LIEN);
  });

  it.each([
    [1, 1], [14, 1], [15, 2], [26, 2], [27, 3], [42, 3], [43, 4], [62, 4], [63, 5], [84, 5],
    [85, 6], [106, 6], [107, 7], [122, 7], [123, 8], [152, 8], [153, 9], [180, 9], [181, 10], [213, 10],
  ])("%i octets : version %i, relu à l'identique", (longueur, version) => {
    const texte = "https://x.fr/".concat("a".repeat(200)).slice(0, longueur);
    const r = decoder(matriceQr(texte));
    expect(r.version).toBe(version);
    expect(r.texte).toBe(texte);
    expect(matriceQr(texte)).toHaveLength(version * 4 + 17);
  });

  it("compte les octets UTF-8, pas les caractères", () => {
    expect(decoder(matriceQr("é".repeat(106))).texte).toBe("é".repeat(106));
    expect(() => matriceQr("é".repeat(107))).toThrow(/trop long/);
    expect(decoder(matriceQr("😀‮<script>")).texte).toBe("😀‮<script>");
  });

  it("refuse au-delà de 213 octets, et une chaîne de 100 000 caractères", () => {
    expect(() => matriceQr("a".repeat(214))).toThrow(/trop long/);
    expect(() => matriceQr("a".repeat(100_000))).toThrow(/trop long/);
  });

  it("porte les trois repères d'angle et les lignes de synchronisation", () => {
    const m = matriceQr(LIEN);
    const n = m.length;
    for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]])
      for (let dy = 0; dy < 7; dy++)
        for (let dx = 0; dx < 7; dx++) expect(m[oy + dy][ox + dx]).toBe(Math.max(Math.abs(dx - 3), Math.abs(dy - 3)) !== 2);
    for (let i = 8; i < n - 8; i++) {
      expect(m[6][i]).toBe(i % 2 === 0);
      expect(m[i][6]).toBe(i % 2 === 0);
    }
  });

  it("est déterministe", () => {
    expect(matriceQr(LIEN)).toEqual(matriceQr(LIEN));
  });

  it("le décodeur de contrôle n'est pas complaisant : un module de données retourné est détecté", () => {
    const m = matriceQr(LIEN).map((l) => [...l]);
    const n = m.length;
    m[n - 1][n - 1] = !m[n - 1][n - 1];
    expect(() => decoder(m)).toThrow(/Reed-Solomon/);
  });
});

describe("cheminQr — un tracé SVG sans rien d'injectable", () => {
  it("ne contient que des carrés de modules, quoi que contienne le texte", () => {
    for (const t of ['"/><script>alert(1)</script>', "javascript:alert(1)", "\u0000\r\n", "a"]) {
      const { d, cote } = cheminQr(t);
      expect(d).toMatch(/^(M\d+ \d+h1v1h-1z)+$/);
      expect(Number.isInteger(cote)).toBe(true);
    }
  });

  it("la marge par défaut est de quatre modules de chaque côté", () => {
    const { cote, d } = cheminQr("a");
    expect(cote).toBe(21 + 8);
    expect(d.startsWith("M4 4h1v1h-1z")).toBe(true);
    expect(cheminQr("a", 0).cote).toBe(21);
  });
});
