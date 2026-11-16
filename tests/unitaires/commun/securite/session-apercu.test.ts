import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* ── Les dépendances du serveur, simulées : cookies, redirection, Supabase, l'équipe, le dépôt. ── */

const jar = vi.hoisted(() => {
  const m = new Map<string, { value: string; options?: unknown }>();
  return {
    m,
    api: {
      get: (n: string) => (m.has(n) ? { name: n, value: m.get(n)!.value } : undefined),
      set: (n: string, value: string, options?: unknown) => void m.set(n, { value, options }),
      delete: (x: string | { name: string }) => void m.delete(typeof x === "string" ? x : x.name),
      getAll: () => [...m].map(([name, { value }]) => ({ name, value })),
    },
  };
});
vi.mock("next/headers", () => ({ cookies: async () => jar.api, headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (u: string) => {
    throw new Error(`REDIRECT ${u}`);
  },
}));

const supa = vi.hoisted(() => ({ auth: null as unknown, service: null as unknown }));
vi.mock("@/lib/supabase/auth", () => ({ createAuthClient: async () => supa.auth }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => supa.service }));
vi.mock("@/lib/droits", async () => {
  const roles = await vi.importActual<typeof import("@/lib/roles-equipe")>("@/lib/roles-equipe");
  return { membreParEmail: vi.fn(), porteSuperAdmin: roles.porteSuperAdmin };
});

const depotMock = vi.hoisted(() => ({ trouver: vi.fn(), lire: vi.fn(), lireDuClient: vi.fn(), lireClient: vi.fn() }));
vi.mock("@/lib/espace-client/depot", () => ({
  depot: () => depotMock,
  avecDelai: <T,>(p: PromiseLike<T>) => Promise.resolve(p),
  maintenant: () => new Date().toISOString(),
}));

import { membreParEmail } from "@/lib/droits";
import {
  COOKIE_APERCU,
  DUREE_JETON_APERCU_MS,
  emettreJetonApercu,
  LECTURE_SEULE,
  lireCookieApercu,
  lireJetonApercu,
  optionsCookieApercu,
  RESERVE_AU_CLIENT,
  scellerCookieApercu,
} from "@/lib/espace-client/apercu";
import {
  apercuEquipe,
  clientConnecte,
  COOKIE_DEMO,
  editionEquipe,
  exigerClient,
  exigerClientPourAgir,
  fermerSession,
  ouvrirSessionBase,
  ouvrirSessionDemo,
  refuserEnApercu,
} from "@/lib/espace-client/session";
import { sceller } from "@/lib/espace-client/signature";

const DUMONT = { id: "cl-dumont", email: "dumont@example.com", auth_user_id: "auth-dumont", sessions_revoquees_le: null as string | null, demo: true };
const MARTIN = { id: "cl-martin", email: "martin@example.com", auth_user_id: "auth-martin", sessions_revoquees_le: null as string | null, demo: true };
const T0 = new Date("2026-11-15T10:00:00Z").getTime();

beforeEach(() => {
  vi.stubEnv("ESPACE_CLIENT_SECRET", "secret-de-test-0123456789");
  vi.stubEnv("ESPACE_CLIENT_DONNEES", "demo");
  vi.useFakeTimers({ now: T0 });
  jar.m.clear();
  supa.auth = null;
  supa.service = null;
  depotMock.trouver.mockReset().mockImplementation(async (_t: string, id: string) => [DUMONT, MARTIN].find((c) => c.id === id) ?? null);
  depotMock.lire.mockReset().mockResolvedValue({ clients: [DUMONT, MARTIN] });
  vi.mocked(membreParEmail).mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const poserApercu = (m: "lecture" | "edition", c = DUMONT.id, e = "celine@bailly.fr") =>
  jar.api.set(COOKIE_APERCU, scellerCookieApercu({ c, u: "Céline", e, m }));

/* ───────────────────────────── apercu.ts ───────────────────────────── */

describe("le jeton de passage de l'aperçu (interne → externe)", () => {
  const emettre = (mode: "lecture" | "edition" = "lecture") =>
    emettreJetonApercu({ clientId: DUMONT.id, reference: "BD-2026-0164", par: "Céline", email: "  Celine@Bailly.FR ", mode });

  it("se lit deux minutes, adresse de l'auteur normalisée", () => {
    const j = emettre();
    expect(lireJetonApercu(j)).toMatchObject({ c: DUMONT.id, r: "BD-2026-0164", u: "Céline", e: "celine@bailly.fr", m: "lecture" });
    vi.advanceTimersByTime(DUREE_JETON_APERCU_MS);
    expect(lireJetonApercu(j)).toBeNull();
  });

  it("borne le nom de l'auteur à 120 caractères", () => {
    const j = emettreJetonApercu({ clientId: DUMONT.id, reference: "R", par: "x".repeat(500), email: "c@b.fr", mode: "lecture" });
    expect(lireJetonApercu(j)?.u).toHaveLength(120);
  });

  it("ne vaut pas cookie, et le cookie ne vaut pas jeton", () => {
    expect(lireCookieApercu(emettre())).toBeNull();
    expect(lireJetonApercu(scellerCookieApercu({ c: DUMONT.id, u: "Céline", e: "c@b.fr", m: "lecture" }))).toBeNull();
  });

  it("refuse un jeton altéré, trop long, absent", () => {
    const j = emettre();
    expect(lireJetonApercu(`${j.slice(0, 10)}${j[10] === "A" ? "B" : "A"}${j.slice(11)}`)).toBeNull();
    expect(lireJetonApercu("A".repeat(2001))).toBeNull();
    expect(lireJetonApercu(null)).toBeNull();
    expect(lireJetonApercu("")).toBeNull();
  });

  it("refuse, même signé, un identifiant de client mal formé", () => {
    const exp = Date.now() + 60_000;
    for (const c of ["../admin", "cl/dumont", "cl dumont", "x".repeat(65), "", "cl-dumont\n", "'; --"]) {
      expect(lireJetonApercu(sceller({ c, r: "R", u: "Céline", e: "c@b.fr", m: "lecture", exp }, "apercu-equipe")), c).toBeNull();
    }
  });

  it("refuse, même signé, un mode inconnu, ou une édition sans l'adresse de son auteur", () => {
    const exp = Date.now() + 60_000;
    expect(lireJetonApercu(sceller({ c: DUMONT.id, r: "R", u: "C", e: "c@b.fr", m: "admin", exp }, "apercu-equipe"))).toBeNull();
    expect(lireJetonApercu(sceller({ c: DUMONT.id, r: "R", u: "C", m: "edition", exp }, "apercu-equipe"))).toBeNull();
    expect(lireJetonApercu(sceller({ c: DUMONT.id, r: "R", u: "C", e: "", m: "edition", exp }, "apercu-equipe"))).toBeNull();
    // Sans mode (aperçus d'avant l'édition) : la lecture, jamais l'édition.
    expect(lireJetonApercu(sceller({ c: DUMONT.id, r: "R", u: "C", exp }, "apercu-equipe"))?.m).toBe("lecture");
  });
});

describe("le cookie de l'aperçu", () => {
  it("une heure en lecture, trente minutes en édition", () => {
    const lecture = scellerCookieApercu({ c: DUMONT.id, u: "C", e: "c@b.fr", m: "lecture" });
    const edition = scellerCookieApercu({ c: DUMONT.id, u: "C", e: "c@b.fr", m: "edition" });
    vi.advanceTimersByTime(30 * 60_000);
    expect(lireCookieApercu(lecture)).not.toBeNull();
    expect(lireCookieApercu(edition)).toBeNull();
    vi.advanceTimersByTime(30 * 60_000);
    expect(lireCookieApercu(lecture)).toBeNull();
  });

  it("httpOnly, SameSite=Lax, limité à /espace-client, Secure en production", () => {
    expect(optionsCookieApercu("lecture")).toEqual({ httpOnly: true, sameSite: "lax", secure: false, path: "/espace-client", maxAge: 3_600 });
    expect(optionsCookieApercu("edition").maxAge).toBe(1_800);
    vi.stubEnv("NODE_ENV", "production");
    expect(optionsCookieApercu("lecture").secure).toBe(true);
  });

  it("ne vaut pas cookie de démonstration, ni l'inverse", () => {
    const demo = sceller({ c: DUMONT.id, iat: Date.now(), exp: Date.now() + 60_000 }, "session-demo");
    expect(lireCookieApercu(demo)).toBeNull();
  });
});

/* ───────────────────────────── session.ts ───────────────────────────── */

describe("la session de démonstration", () => {
  it("ouvre un cookie signé, httpOnly, SameSite=Lax, limité à /espace-client, douze heures", async () => {
    await ouvrirSessionDemo(DUMONT);
    const posé = jar.m.get(COOKIE_DEMO);
    expect(posé?.options).toEqual({ httpOnly: true, sameSite: "lax", secure: false, path: "/espace-client", maxAge: 12 * 3_600 });
    expect(await clientConnecte()).toEqual(DUMONT);
  });

  it("expire au bout de douze heures", async () => {
    await ouvrirSessionDemo(DUMONT);
    vi.advanceTimersByTime(12 * 3_600_000 - 1);
    expect(await clientConnecte()).toEqual(DUMONT);
    vi.advanceTimersByTime(1);
    expect(await clientConnecte()).toBeNull();
  });

  it("refuse un cookie altéré, ou signé pour un autre usage", async () => {
    await ouvrirSessionDemo(DUMONT);
    const v = jar.m.get(COOKIE_DEMO)!.value;
    jar.api.set(COOKIE_DEMO, `${v.slice(0, 5)}${v[5] === "A" ? "B" : "A"}${v.slice(6)}`);
    expect(await clientConnecte()).toBeNull();
    jar.api.set(COOKIE_DEMO, sceller({ c: DUMONT.id, iat: Date.now(), exp: Date.now() + 60_000 }, "session-apercu"));
    expect(await clientConnecte()).toBeNull();
  });

  it("« Couper les sessions » invalide un cookie émis avant", async () => {
    await ouvrirSessionDemo(DUMONT);
    depotMock.lire.mockResolvedValue({ clients: [{ ...DUMONT, sessions_revoquees_le: new Date(Date.now() + 1_000).toISOString() }] });
    expect(await clientConnecte()).toBeNull();
    depotMock.lire.mockResolvedValue({ clients: [{ ...DUMONT, sessions_revoquees_le: new Date(Date.now() - 1_000).toISOString() }] });
    expect(await clientConnecte()).toEqual(expect.objectContaining({ id: DUMONT.id }));
  });

  it("un client disparu n'a plus de session", async () => {
    await ouvrirSessionDemo(DUMONT);
    depotMock.lire.mockResolvedValue({ clients: [MARTIN] });
    expect(await clientConnecte()).toBeNull();
  });

  it("en mode base, le cookie de démonstration n'est jamais lu", async () => {
    await ouvrirSessionDemo(DUMONT);
    vi.stubEnv("ESPACE_CLIENT_DONNEES", "");
    supa.auth = { auth: { getClaims: async () => ({ data: { claims: null } }) } };
    expect(await clientConnecte()).toBeNull();
  });

  it("exigerClient renvoie à la connexion sans session", async () => {
    await expect(exigerClient()).rejects.toThrow("REDIRECT /espace-client/connexion");
  });
});

describe("l'aperçu de l'équipe en lecture", () => {
  it("ouvre l'espace du client du cookie, lu par la clé de service", async () => {
    poserApercu("lecture");
    expect(await clientConnecte()).toEqual(DUMONT);
    expect(depotMock.trouver).toHaveBeenCalledWith("clients", DUMONT.id);
    expect(await apercuEquipe()).toEqual({ par: "Céline", mode: "lecture" });
    expect(await editionEquipe()).toBeNull();
  });

  it("refuse toute écriture, et les gestes réservés au client", async () => {
    poserApercu("lecture");
    await expect(exigerClientPourAgir()).rejects.toThrow(LECTURE_SEULE);
    await expect(refuserEnApercu()).rejects.toThrow(LECTURE_SEULE);
  });

  it("passe AVANT une vraie session ouverte dans le même navigateur, sans s'y mêler", async () => {
    await ouvrirSessionDemo(MARTIN);
    poserApercu("lecture", DUMONT.id);
    expect((await clientConnecte())?.id).toBe(DUMONT.id);
  });

  it("un aperçu dont le client n'existe pas ne retombe pas sur la session du navigateur", async () => {
    await ouvrirSessionDemo(MARTIN);
    poserApercu("lecture", "cl-inconnu");
    expect(await clientConnecte()).toBeNull();
  });

  it("expiré, il s'efface : la session ordinaire reprend ses droits", async () => {
    await ouvrirSessionDemo(MARTIN);
    poserApercu("lecture", DUMONT.id);
    vi.advanceTimersByTime(3_600_000);
    expect((await clientConnecte())?.id).toBe(MARTIN.id);
    await expect(refuserEnApercu()).resolves.toBeUndefined();
  });

  it("une erreur de lecture du client ne connecte personne", async () => {
    poserApercu("lecture");
    depotMock.trouver.mockRejectedValue(new Error("base injoignable"));
    expect(await clientConnecte()).toBeNull();
  });
});

describe("l'aperçu de l'équipe en édition : le droit relu à chaque requête", () => {
  it("un super admin actif édite ; les gestes du client restent refusés", async () => {
    poserApercu("edition");
    vi.mocked(membreParEmail).mockResolvedValue({ id: "1", email: "celine@bailly.fr", nom: "Céline", role: "super_admin", actif: true });
    expect(await exigerClientPourAgir()).toEqual(DUMONT);
    await expect(refuserEnApercu()).rejects.toThrow(RESERVE_AU_CLIENT);
    expect(await editionEquipe()).toEqual({ par: "Céline", email: "celine@bailly.fr" });
    expect(membreParEmail).toHaveBeenCalledWith("celine@bailly.fr");
  });

  it("un simple admin retombe en lecture", async () => {
    poserApercu("edition");
    vi.mocked(membreParEmail).mockResolvedValue({ id: "1", email: "celine@bailly.fr", nom: null, role: "admin", actif: true });
    await expect(exigerClientPourAgir()).rejects.toThrow(LECTURE_SEULE);
    expect(await apercuEquipe()).toEqual({ par: "Céline", mode: "lecture" });
  });

  it("la base injoignable : la lecture, jamais l'édition", async () => {
    poserApercu("edition");
    vi.mocked(membreParEmail).mockRejectedValue(new Error("délai dépassé"));
    await expect(exigerClientPourAgir()).rejects.toThrow(LECTURE_SEULE);
    expect(await editionEquipe()).toBeNull();
  });

  it("parti de l'équipe ou désactivé : l'aperçu s'arrête", async () => {
    poserApercu("edition");
    vi.mocked(membreParEmail).mockResolvedValue(null);
    expect(await clientConnecte()).toBeNull();
    expect(await apercuEquipe()).toBeNull();
    vi.mocked(membreParEmail).mockResolvedValue({ id: "1", email: "celine@bailly.fr", nom: null, role: "super_admin", actif: false });
    expect(await clientConnecte()).toBeNull();
    expect(await editionEquipe()).toBeNull();
  });

  it("l'édition expire au bout de trente minutes", async () => {
    poserApercu("edition");
    vi.mocked(membreParEmail).mockResolvedValue({ id: "1", email: "celine@bailly.fr", nom: null, role: "super_admin", actif: true });
    vi.advanceTimersByTime(30 * 60_000);
    expect(await editionEquipe()).toBeNull();
    expect(await clientConnecte()).toBeNull();
  });

  it("un cookie d'édition sans adresse d'auteur ne vaut rien", async () => {
    jar.api.set(COOKIE_APERCU, sceller({ c: DUMONT.id, u: "C", m: "edition", iat: Date.now(), exp: Date.now() + 60_000 }, "session-apercu"));
    expect(await clientConnecte()).toBeNull();
    expect(membreParEmail).not.toHaveBeenCalled();
  });
});

describe("fermerSession", () => {
  it("pendant un aperçu : ne quitte que l'aperçu, la session du client reste", async () => {
    await ouvrirSessionDemo(MARTIN);
    poserApercu("lecture", DUMONT.id);
    expect(await fermerSession()).toEqual({ apercu: true });
    expect(jar.m.has(COOKIE_APERCU)).toBe(false);
    expect(jar.m.has(COOKIE_DEMO)).toBe(true);
  });

  it("un cookie d'aperçu périmé s'efface, et la session de démonstration se ferme", async () => {
    await ouvrirSessionDemo(MARTIN);
    poserApercu("lecture", DUMONT.id);
    vi.advanceTimersByTime(3_600_000);
    expect(await fermerSession()).toEqual({ apercu: false });
    expect(jar.m.has(COOKIE_APERCU)).toBe(false);
    expect(jar.m.has(COOKIE_DEMO)).toBe(false);
  });
});

/* ───────────────────── La session en base (Supabase Auth simulé) ───────────────────── */

describe("clientConnecte en base", () => {
  beforeEach(() => {
    vi.stubEnv("ESPACE_CLIENT_DONNEES", "");
  });
  const authAvec = (claims: unknown, lignes: unknown[] | null = [DUMONT], error: unknown = null) => {
    supa.auth = {
      auth: { getClaims: async () => ({ data: { claims } }) },
      from: () => ({ select: () => ({ limit: async () => ({ data: lignes, error }) }) }),
    };
  };

  it("le client dont la session est inscrite au registre", async () => {
    authAvec({ sub: "auth-dumont", app_metadata: { role: "client" } });
    expect(await clientConnecte()).toEqual(DUMONT);
  });

  it.each([
    ["sans rôle (l'équipe)", {}],
    ["un compte RH", { role: "rh" }],
    ["un déménageur", { role: "terrain" }],
    ["un rôle inconnu", { role: "admin" }],
  ])("refuse %s", async (_, app_metadata) => {
    authAvec({ sub: "auth-dumont", app_metadata });
    expect(await clientConnecte()).toBeNull();
  });

  it("refuse une ligne qui n'est pas celle du compte de la session", async () => {
    authAvec({ sub: "auth-martin", app_metadata: { role: "client" } });
    expect(await clientConnecte()).toBeNull();
  });

  it("refuse sans revendication, sans ligne (RLS), ou sur erreur", async () => {
    authAvec({ app_metadata: { role: "client" } });
    expect(await clientConnecte()).toBeNull();
    authAvec({ sub: "auth-dumont", app_metadata: { role: "client" } }, []);
    expect(await clientConnecte()).toBeNull();
    authAvec({ sub: "auth-dumont", app_metadata: { role: "client" } }, [DUMONT], { message: "rls" });
    expect(await clientConnecte()).toBeNull();
    supa.auth = { auth: { getClaims: async () => Promise.reject(new Error("réseau")) } };
    expect(await clientConnecte()).toBeNull();
  });
});

describe("ouvrirSessionBase — le clic « Accéder »", () => {
  const jwt = (charge: unknown) => `e30.${Buffer.from(JSON.stringify(charge)).toString("base64url")}.sig`;
  const signOut = vi.fn(async () => ({}));
  const insert = vi.fn(async () => ({ error: null as unknown }));
  const verifier = (data: unknown, error: unknown = null) => {
    supa.auth = { auth: { verifyOtp: async () => ({ data, error }), signOut } };
    supa.service = { from: () => ({ insert }) };
  };
  const trace = { ip: "203.0.113.7", user_agent: "Mozilla/5.0" };

  beforeEach(() => {
    vi.stubEnv("ESPACE_CLIENT_DONNEES", "");
    signOut.mockClear();
    insert.mockClear().mockResolvedValue({ error: null });
  });

  it("inscrit la session au registre, douze heures", async () => {
    verifier({ session: { access_token: jwt({ session_id: "s-1" }) }, user: { id: "auth-dumont", app_metadata: { role: "client" } } });
    expect(await ouvrirSessionBase(DUMONT, "hash", "auth-dumont", trace)).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith({
      session_id: "s-1", client_id: DUMONT.id, auth_user_id: "auth-dumont", expire_le: new Date(T0 + 12 * 3_600_000).toISOString(), ip: trace.ip, user_agent: trace.user_agent,
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("un lien déjà servi ou inconnu de Supabase : « utilise », sans session", async () => {
    verifier({ session: null, user: null }, { message: "Token has expired or is invalid" });
    expect(await ouvrirSessionBase(DUMONT, "hash", "auth-dumont", trace)).toEqual({ ok: false, raison: "utilise" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("le lien ouvre le compte d'un AUTRE : la session se referme aussitôt", async () => {
    verifier({ session: { access_token: jwt({ session_id: "s-1" }) }, user: { id: "auth-martin", app_metadata: { role: "client" } } });
    expect(await ouvrirSessionBase(DUMONT, "hash", "auth-dumont", trace)).toEqual({ ok: false, raison: "inconnu" });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("un compte de l'équipe ou RH ne s'ouvre pas en client", async () => {
    for (const app_metadata of [{}, { role: "rh" }, { role: "terrain" }]) {
      verifier({ session: { access_token: jwt({ session_id: "s-1" }) }, user: { id: "auth-dumont", app_metadata } });
      expect(await ouvrirSessionBase(DUMONT, "hash", "auth-dumont", trace)).toEqual({ ok: false, raison: "inconnu" });
    }
    expect(insert).not.toHaveBeenCalled();
  });

  it("un jeton d'accès sans session_id lisible : refusé", async () => {
    for (const access_token of [jwt({}), jwt({ session_id: 42 }), "pas.un.jwt", "", "a"]) {
      verifier({ session: { access_token }, user: { id: "auth-dumont", app_metadata: { role: "client" } } });
      expect(await ouvrirSessionBase(DUMONT, "hash", "auth-dumont", trace), access_token).toEqual({ ok: false, raison: "inconnu" });
    }
    expect(insert).not.toHaveBeenCalled();
  });

  it("le registre refuse l'inscription : la session se referme et l'erreur remonte", async () => {
    verifier({ session: { access_token: jwt({ session_id: "s-1" }) }, user: { id: "auth-dumont", app_metadata: { role: "client" } } });
    insert.mockResolvedValue({ error: { message: "duplicate key" } });
    await expect(ouvrirSessionBase(DUMONT, "hash", "auth-dumont", trace)).rejects.toThrow(/Ouverture de la session impossible/);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
