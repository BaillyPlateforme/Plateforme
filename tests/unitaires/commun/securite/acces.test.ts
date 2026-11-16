import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* ── Le dépôt, Supabase, les comptes, les lectures et l'envoi : simulés. ── */

const supa = vi.hoisted(() => ({ service: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => supa.service }));

const depotMock = vi.hoisted(() => ({ trouver: vi.fn(), lire: vi.fn(), lireDuClient: vi.fn() }));
vi.mock("@/lib/espace-client/depot", () => ({
  depot: () => depotMock,
  avecDelai: <T,>(p: PromiseLike<T>) => Promise.resolve(p),
  maintenant: () => new Date().toISOString(),
}));
vi.mock("@/lib/espace-client/comptes", () => ({ assurerCompte: vi.fn(async () => "auth-x"), jetonDeConnexion: vi.fn(async () => "jeton-supabase-0123456789abcdef") }));
vi.mock("@/lib/espace-client/lectures", () => ({ conseillerDe: () => null, dossiersDuClient: () => [], signatureDe: () => "", snapshotDe: () => null }));
vi.mock("@/lib/espace-client/progression", () => ({ calculerFrise: () => [] }));
const envoyer = vi.hoisted(() => vi.fn(async (n: Record<string, unknown>) => ({ id: "notif-1", ...n })));
vi.mock("@/lib/espace-client/notifier", () => ({ notifier: { envoyer } }));

import { annulerLiens, consommerLien, envoyerLienAcces, envoyerLienAuClient, estClientDemo, lireLien } from "@/lib/espace-client/acces";
import { empreinte } from "@/lib/espace-client/signature";
import { avecBienvenue, referenceDeLaSuite, suiteValide } from "@/lib/espace-client/suite";
import type { Client } from "@/lib/espace-client/types";

const client = (modif: Partial<Client> = {}) =>
  ({ id: "cl-dumont", email: "dumont@example.com", demo: true, auth_user_id: "auth-dumont", civilite: "Madame", prenom: "Anne", nom: "Dumont", conseiller_id: "c-1", sessions_revoquees_le: null, ...modif }) as Client;
const T0 = new Date("2026-11-15T10:00:00Z").getTime();

type Coffre = typeof globalThis & { __ecLiens?: unknown[] };

/** Émet un lien en démonstration et rend son jeton, tel qu'il part dans l'e-mail. */
async function emettre(c = client(), options: { reference?: string | null; suite?: string | null } = {}) {
  envoyer.mockClear();
  await envoyerLienAuClient(c, options);
  const lien = String((envoyer.mock.calls[0][0] as { payload: { lien: string } }).payload.lien);
  return { lien, jeton: new URL(lien).searchParams.get("token_hash")!, options: envoyer.mock.calls[0][1] as { confidentiel: Record<string, string> } };
}

beforeEach(() => {
  vi.stubEnv("ESPACE_CLIENT_SECRET", "secret-de-test-0123456789");
  vi.stubEnv("ESPACE_CLIENT_DONNEES", "demo");
  vi.useFakeTimers({ now: T0 });
  delete (globalThis as Coffre).__ecLiens;
  supa.service = null;
  depotMock.trouver.mockReset().mockImplementation(async (_t: string, id: string) => (id === "cl-dumont" ? client() : null));
  depotMock.lire.mockReset().mockResolvedValue({ clients: [client()] });
  depotMock.lireDuClient.mockReset().mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("estClientDemo — le double critère", () => {
  it.each([
    [true, "dumont@example.com", true],
    [true, "  Dumont@EXAMPLE.com ", true],
    [true, "dumont@exemple.fr", true],
    [true, "dumont@gmail.com", false],
    [true, "dumont@example.com.evil.fr", false],
    [true, "dumont@notexample.com", false],
    [true, "dumont@example.com@gmail.com", false],
    [false, "dumont@example.com", false],
  ])("demo=%s, %s → %s", (demo, email, attendu) => {
    expect(!!estClientDemo({ demo, email })).toBe(attendu);
  });
});

describe("le lien d'accès en démonstration", () => {
  it("part avec un jeton aléatoire de 256 bits, que le registre ne garde qu'en empreinte", async () => {
    const { jeton } = await emettre();
    expect(jeton).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const registre = (globalThis as Coffre).__ecLiens as { empreinte: string }[];
    expect(registre).toHaveLength(1);
    expect(registre[0].empreinte).toBe(empreinte(jeton));
    expect(JSON.stringify(registre)).not.toContain(jeton);
  });

  it("deux liens n'ont jamais le même jeton", async () => {
    const a = await emettre();
    const b = await emettre();
    expect(a.jeton).not.toBe(b.jeton);
  });

  it("se lit sans être consommé (les messageries qui inspectent les liens ne le brûlent pas)", async () => {
    const { jeton } = await emettre();
    expect(await lireLien(jeton)).toMatchObject({ ok: true });
    expect(await lireLien(jeton)).toMatchObject({ ok: true });
    expect(await consommerLien(jeton)).toMatchObject({ ok: true });
  });

  it("ne sert qu'une fois : le second clic est refusé comme « utilisé »", async () => {
    const { jeton } = await emettre();
    expect(await consommerLien(jeton)).toMatchObject({ ok: true, client: { id: "cl-dumont" } });
    expect(await consommerLien(jeton)).toEqual({ ok: false, raison: "utilise" });
    expect(await lireLien(jeton)).toEqual({ ok: false, raison: "utilise" });
  });

  it("expire au bout de quinze minutes, et ne se rejoue pas après", async () => {
    const { jeton } = await emettre();
    vi.advanceTimersByTime(15 * 60_000 - 1);
    expect(await lireLien(jeton)).toMatchObject({ ok: true });
    vi.advanceTimersByTime(2);
    expect(await lireLien(jeton)).toEqual({ ok: false, raison: "expire" });
    expect(await consommerLien(jeton)).toEqual({ ok: false, raison: "expire" });
  });

  it("un jeton altéré d'un seul caractère, tronqué ou prolongé est inconnu", async () => {
    const { jeton } = await emettre();
    const altere = `${jeton.slice(0, -1)}${jeton.endsWith("A") ? "B" : "A"}`;
    for (const j of [altere, jeton.slice(0, -1), `${jeton}A`, jeton.toUpperCase()]) {
      expect(await consommerLien(j)).toEqual({ ok: false, raison: "inconnu" });
    }
    // Le vrai jeton n'a pas été brûlé par ces essais.
    expect(await consommerLien(jeton)).toMatchObject({ ok: true });
  });

  it("un client disparu entre-temps : inconnu", async () => {
    const { jeton } = await emettre();
    depotMock.trouver.mockResolvedValue(null);
    expect(await lireLien(jeton)).toEqual({ ok: false, raison: "inconnu" });
  });

  it("« Couper les sessions » annule les liens encore valables du client", async () => {
    const { jeton } = await emettre();
    await annulerLiens("cl-dumont");
    expect(await consommerLien(jeton)).toEqual({ ok: false, raison: "inconnu" });
  });

  it("le registre se purge des liens expirés ou servis à chaque émission", async () => {
    const a = await emettre();
    await consommerLien(a.jeton);
    await emettre();
    vi.advanceTimersByTime(16 * 60_000);
    await emettre();
    expect((globalThis as Coffre).__ecLiens).toHaveLength(1);
  });
});

describe("le lien d'accès : ce qui part dans l'e-mail et ce que garde le journal", () => {
  it("pointe vers /espace-client/acces de l'adresse publique, jeton encodé", async () => {
    const { lien, jeton } = await emettre();
    expect(lien).toBe(`http://localhost:3939/espace-client/acces?token_hash=${jeton}`);
  });

  it("le journal d'un VRAI client ne garde que la page de connexion, jamais le lien", async () => {
    const { options } = await emettre(client({ demo: false, email: "anne.dumont@gmail.com" }));
    expect(options.confidentiel).toEqual({ lien: "http://localhost:3939/espace-client/connexion" });
  });

  it("le journal d'un client fictif garde le lien (boîte de réception de démonstration)", async () => {
    const { options } = await emettre(client());
    expect(options.confidentiel).toEqual({});
  });

  it("un client marqué démo à une vraie adresse est traité comme un vrai client", async () => {
    const { options } = await emettre(client({ demo: true, email: "anne.dumont@gmail.com" }));
    expect(options.confidentiel.lien).toMatch(/\/espace-client\/connexion$/);
  });

  it("emmène vers une page d'un dossier de l'espace, et rien d'autre", async () => {
    const ok = await emettre(client(), { suite: "/espace-client/BD-2026-0164/devis" });
    expect(new URL(ok.lien).searchParams.get("suite")).toBe("/espace-client/BD-2026-0164/devis");
    for (const suite of ["//evil.com", "https://evil.com/espace-client/BD-2026-0164", "/espace-client/../admin", "javascript:alert(1)", "/espace-client/BD-2026-0164/devis?x=1"]) {
      const r = await emettre(client(), { suite });
      expect(new URL(r.lien).searchParams.has("suite"), suite).toBe(false);
    }
  });

  it("une adresse inconnue : rien ne part, sans bruit", async () => {
    envoyer.mockClear();
    expect(await envoyerLienAcces("inconnu@example.com")).toBeNull();
    expect(await envoyerLienAcces("   ")).toBeNull();
    expect(envoyer).not.toHaveBeenCalled();
  });

  it("l'adresse saisie est comparée sans casse ni blancs", async () => {
    envoyer.mockClear();
    expect(await envoyerLienAcces("  DUMONT@Example.COM ")).not.toBeNull();
    expect(envoyer).toHaveBeenCalledTimes(1);
  });
});

describe("la forme du jeton, vérifiée avant toute lecture", () => {
  it.each([
    ["trop court", "a".repeat(19)],
    ["trop long", "a".repeat(201)],
    ["un point", `${"a".repeat(30)}.b`],
    ["un égal (base64 non url)", `${"a".repeat(30)}==`],
    ["une barre oblique", `${"a".repeat(30)}/`],
    ["un plus", `${"a".repeat(30)}+`],
    ["un pourcentage", `${"a".repeat(30)}%00`],
    ["un retour à la ligne", `${"a".repeat(30)}\n`],
    ["une balise", `<script>${"a".repeat(30)}`],
    ["une injection de filtre", `${"a".repeat(30)},empreinte.neq.x`],
    ["100 000 caractères", "a".repeat(100_000)],
    ["vide", ""],
  ])("refuse %s sans interroger la base", async (_, jeton) => {
    vi.stubEnv("ESPACE_CLIENT_DONNEES", "");
    const from = vi.fn();
    supa.service = { from };
    expect(await lireLien(jeton)).toEqual({ ok: false, raison: "inconnu" });
    expect(await consommerLien(jeton)).toEqual({ ok: false, raison: "inconnu" });
    expect(from).not.toHaveBeenCalled();
  });
});

/* ─────────────────────────── En base (Supabase simulé) ─────────────────────────── */

describe("consommerLien en base", () => {
  const JETON = "jeton-supabase-0123456789abcdef";
  let appels: unknown[][];
  /** Une fausse requête Supabase : chaque méthode s'enchaîne, et la promesse rend le résultat de l'opération. */
  const faux = (res: { maj?: { data: unknown; error: unknown }; lecture?: { data: unknown; error: unknown } }) => ({
    from: (table: string) => {
      let op: "lecture" | "maj" = "lecture";
      const chaine: Record<string | symbol, unknown> = new Proxy({}, {
        get(_, k) {
          if (k === "then") return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(op === "maj" ? res.maj : res.lecture).then(ok, ko);
          return (...args: unknown[]) => {
            appels.push([table, String(k), ...args]);
            if (k === "update") op = "maj";
            return chaine;
          };
        },
      });
      return chaine;
    },
  });
  const lien = (modif: Record<string, unknown> = {}) => ({
    empreinte: empreinte(JETON), client_id: "cl-dumont", auth_user_id: "auth-dumont", reference: null, expire_at: new Date(T0 + 60_000).toISOString(), utilise_at: null, ...modif,
  });

  beforeEach(() => {
    vi.stubEnv("ESPACE_CLIENT_DONNEES", "");
    appels = [];
  });

  it("marque le lien utilisé en une seule requête conditionnelle, sur son empreinte", async () => {
    supa.service = faux({ maj: { data: [lien()], error: null } });
    expect(await consommerLien(JETON)).toMatchObject({ ok: true, client: { id: "cl-dumont" } });
    expect(appels).toContainEqual(["ec_liens_acces", "update", { utilise_at: new Date(T0).toISOString() }]);
    expect(appels).toContainEqual(["ec_liens_acces", "eq", "empreinte", empreinte(JETON)]);
    expect(appels).toContainEqual(["ec_liens_acces", "is", "utilise_at", null]);
    expect(appels).toContainEqual(["ec_liens_acces", "gt", "expire_at", new Date(T0).toISOString()]);
  });

  it("le jeton lui-même ne part jamais vers la base", async () => {
    supa.service = faux({ maj: { data: [lien()], error: null } });
    await consommerLien(JETON);
    expect(JSON.stringify(appels)).not.toContain(JETON);
  });

  it("le lien doit viser le compte Auth du client, et lui seul", async () => {
    supa.service = faux({ maj: { data: [lien({ auth_user_id: "auth-martin" })], error: null } });
    expect(await consommerLien(JETON)).toEqual({ ok: false, raison: "inconnu" });
    supa.service = faux({ maj: { data: [lien({ auth_user_id: null })], error: null } });
    expect(await consommerLien(JETON)).toEqual({ ok: false, raison: "inconnu" });
    depotMock.trouver.mockResolvedValue(client({ auth_user_id: null }));
    supa.service = faux({ maj: { data: [lien({ auth_user_id: null })], error: null } });
    expect(await consommerLien(JETON)).toEqual({ ok: false, raison: "inconnu" });
  });

  it("rien n'a été marqué : dit pourquoi (utilisé, expiré, inconnu)", async () => {
    supa.service = faux({ maj: { data: [], error: null }, lecture: { data: lien({ utilise_at: new Date(T0 - 1_000).toISOString() }), error: null } });
    expect(await consommerLien(JETON)).toEqual({ ok: false, raison: "utilise" });
    supa.service = faux({ maj: { data: [], error: null }, lecture: { data: lien({ expire_at: new Date(T0 - 1_000).toISOString() }), error: null } });
    expect(await consommerLien(JETON)).toEqual({ ok: false, raison: "expire" });
    supa.service = faux({ maj: { data: [], error: null }, lecture: { data: null, error: null } });
    expect(await consommerLien(JETON)).toEqual({ ok: false, raison: "inconnu" });
  });

  it("une erreur de la base n'ouvre rien : elle remonte", async () => {
    supa.service = faux({ maj: { data: null, error: { message: "délai" } } });
    await expect(consommerLien(JETON)).rejects.toThrow(/Lecture du lien impossible/);
  });

  it("lireLien en base : utilisé, puis expiré", async () => {
    supa.service = faux({ lecture: { data: lien({ utilise_at: new Date(T0).toISOString() }), error: null } });
    expect(await lireLien(JETON)).toEqual({ ok: false, raison: "utilise" });
    supa.service = faux({ lecture: { data: lien({ expire_at: new Date(T0 - 1).toISOString() }), error: null } });
    expect(await lireLien(JETON)).toEqual({ ok: false, raison: "expire" });
  });
});

describe("suiteValide — la page visée avant la connexion (pas de redirection ouverte)", () => {
  it.each([
    "/espace-client/BD-2026-0164",
    "/espace-client/BD-2026-0164/devis",
    "/espace-client/BD-2026-0164/conteneur",
    "/espace-client/abc",
  ])("admet %s", (s) => {
    expect(suiteValide(s)).toBe(s);
  });

  it.each([
    "//evil.com",
    "///evil.com",
    "/\\evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "/espace-client/../admin",
    "/espace-client/BD-2026-0164/../../api",
    "/espace-client/BD-2026-0164/admin",
    "/espace-client/BD-2026-0164/devis/",
    "/espace-client/BD-2026-0164/devis?x=//evil.com",
    "/espace-client/BD-2026-0164/devis#x",
    "/espace-client/BD-2026-0164/devis\n",
    "/espace-client/BD-2026-0164%2F..%2Fadmin",
    "/espace-client/ab",
    `/espace-client/${"a".repeat(41)}`,
    "/espace-client/BD 2026",
    "/espace-client/BD-2026-0164/DEVIS",
    "",
  ])("refuse %j", (s) => {
    expect(suiteValide(s)).toBeNull();
  });

  it("refuse tout ce qui n'est pas une chaîne", () => {
    for (const v of [null, undefined, 42, {}, ["/espace-client/BD-2026-0164"], new Blob()]) expect(suiteValide(v)).toBeNull();
  });

  it("la référence se lit dans la suite, l'arrivée ajoute le mot d'accueil", () => {
    expect(referenceDeLaSuite("/espace-client/BD-2026-0164/devis")).toBe("BD-2026-0164");
    expect(avecBienvenue("/espace-client/BD-2026-0164")).toBe("/espace-client/BD-2026-0164?ok=bienvenue");
  });
});
