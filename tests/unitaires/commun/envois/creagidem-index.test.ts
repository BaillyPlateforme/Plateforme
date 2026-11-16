import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fausseBase, filtre, reponseHttp, type Requete } from "./_outils";
import { demande } from "./_demande";
import type { RequestRow } from "@/lib/types";

/*
 * Créagidem, l'outil de production de Bailly : une fiche de trop, c'est un
 * faux client dans leurs plannings. Le point qui compte : aucun chemin ne
 * mène à « importfiche » sans CREAGIDEM_MODE=actif (et la production, et
 * les six accès). `fetch` est simulé partout.
 */

const m = vi.hoisted(() => ({ client: null as unknown, distance: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => m.client }));
vi.mock("@/lib/trajet", () => ({ distanceEntreVilles: m.distance }));

import { environnement, reglageCreagidem, transmettreACreagidem } from "@/lib/creagidem";

const ACCES = {
  CREAGIDEM_URL: "https://api.creagidem.test/",
  CREAGIDEM_CLIENT_ID: "client-bailly",
  CREAGIDEM_PRIVATE_KEY: "cle-privee-secrete",
  CREAGIDEM_LICENCE: "licence-secrete",
  CREAGIDEM_EMETTEUR: "BAILLY-WEB",
  CREAGIDEM_GUID: "guid-licence-secret",
};

let laDemande: RequestRow | null;
let dernier: { payload: Record<string, unknown>; created_at: string } | null;
let compte: { count?: number | null; error?: { message: string } | null };
let base: ReturnType<typeof fausseBase>;

type AppelFetch = { url: string; init: { method: string; headers: Record<string, string>; body: string } };
let appels: AppelFetch[];
let repAuth: () => Response | Promise<Response>;
let repImport: () => Response | Promise<Response>;

const auths = () => appels.filter((a) => a.url.endsWith("/api/v1/authentication"));
const imports = () => appels.filter((a) => a.url.includes("importfiche"));
const evenements = () => base.de("request_events", "insert").map((r) => (r.charge as { payload: Record<string, unknown> }).payload);

function brancher() {
  base = fausseBase((r: Requete) => {
    if (r.table === "requests") return { data: laDemande };
    if (r.table === "request_events" && r.action === "select") {
      const enTete = (r.selection?.[1] as { head?: boolean } | undefined)?.head;
      if (enTete) return { count: compte.count ?? null, error: compte.error ?? null };
      return { data: dernier };
    }
    return { data: null };
  });
  m.client = base.client;
}

function production(extra: Record<string, string> = {}) {
  vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "production");
  vi.stubEnv("CREAGIDEM_MODE", "actif");
  for (const [k, v] of Object.entries({ ...ACCES, ...extra })) vi.stubEnv(k, v);
}

const jetonValable = (exp?: number) => reponseHttp(200, { access_token: "jeton-1", refresh_token: "r", ...(exp === undefined ? {} : { exp }) });

beforeEach(() => {
  (globalThis as { __jetonCreagidem?: unknown }).__jetonCreagidem = undefined;
  laDemande = demande();
  dernier = null;
  compte = { count: 0 };
  brancher();
  m.distance.mockReset().mockResolvedValue(null);
  appels = [];
  repAuth = () => jetonValable(Math.floor(Date.now() / 1000) + 7200);
  repImport = () => reponseHttp(201, { id_fiche: 517 });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: AppelFetch["init"]) => {
      appels.push({ url, init });
      if (url.endsWith("/api/v1/authentication")) return repAuth();
      if (url.endsWith("/api/v1/importfiche")) return repImport();
      throw new Error(`URL inattendue : ${url}`);
    }),
  );
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("creagidem — reglageCreagidem (le garde-fou)", () => {
  it("dans les tests (aucune variable Railway) : environnement « local », rien ne part", () => {
    const r = reglageCreagidem();
    expect(r).toMatchObject({ envoie: false, environnement: "local", modeActif: false });
    expect(r.motif).toBe("Garde-fou : environnement « local ». Seule la production remplit Créagidem ; ici, la fiche est préparée, jamais envoyée.");
  });

  it("production, mode actif, six accès : la fiche part", () => {
    expect(reglageCreagidem({ RAILWAY_ENVIRONMENT_NAME: "production", CREAGIDEM_MODE: "actif", ...ACCES })).toEqual({ envoie: true, environnement: "production", modeActif: true, manquants: [], motif: null });
  });

  it("production sans CREAGIDEM_MODE=actif : préparée, jamais envoyée", () => {
    for (const mode of [undefined, "", "inactif", "active", "actif;", "oui", "1", "true", "on", "ACTIVE"]) {
      const r = reglageCreagidem({ RAILWAY_ENVIRONMENT_NAME: "production", CREAGIDEM_MODE: mode, ...ACCES });
      expect(r.envoie, String(mode)).toBe(false);
      expect(r.motif).toBe("CREAGIDEM_MODE n'est pas « actif » : la fiche est préparée, jamais envoyée.");
    }
  });

  it("« actif » se lit sans tenir compte de la casse ni des espaces autour", () => {
    for (const mode of ["actif", "ACTIF", " Actif "]) {
      expect(reglageCreagidem({ RAILWAY_ENVIRONMENT_NAME: "production", CREAGIDEM_MODE: mode, ...ACCES }).envoie, mode).toBe(true);
    }
  });

  it("hors production, même en mode actif avec tous les accès : jamais", () => {
    for (const lieu of ["dev", "recette", "staging", "prod", "production-2", "pr-12", "preproduction"]) {
      const r = reglageCreagidem({ RAILWAY_ENVIRONMENT_NAME: lieu, CREAGIDEM_MODE: "actif", ...ACCES });
      expect(r.envoie, lieu).toBe(false);
      expect(r.motif).toContain(`environnement « ${lieu} »`);
    }
  });

  it("le nom de l'environnement se lit sans tenir compte de la casse ni des espaces", () => {
    expect(environnement({ RAILWAY_ENVIRONMENT_NAME: " Production " })).toBe("production");
    expect(environnement({})).toBe("local");
    expect(environnement({ RAILWAY_ENVIRONMENT_NAME: "   " })).toBe("local");
  });

  it("un seul accès manquant (ou fait d'espaces) suffit à tout retenir, et il est nommé", () => {
    for (const k of Object.keys(ACCES)) {
      for (const v of [undefined, "", "   "]) {
        const r = reglageCreagidem({ RAILWAY_ENVIRONMENT_NAME: "production", CREAGIDEM_MODE: "actif", ...ACCES, [k]: v });
        expect(r.envoie, `${k}=${JSON.stringify(v)}`).toBe(false);
        expect(r.manquants).toEqual([k]);
        expect(r.motif).toBe(`Accès Créagidem incomplets (${k}) : la fiche est préparée, jamais envoyée.`);
      }
    }
  });

  it("l'environnement est vérifié avant le mode, le mode avant les accès", () => {
    expect(reglageCreagidem({ RAILWAY_ENVIRONMENT_NAME: "dev" }).motif).toContain("environnement « dev »");
    expect(reglageCreagidem({ RAILWAY_ENVIRONMENT_NAME: "production" }).motif).toContain("CREAGIDEM_MODE");
  });
});

describe("creagidem — aucune fiche ne part sans CREAGIDEM_MODE=actif", () => {
  const configurations: [string, Record<string, string | undefined>][] = [
    ["tests (local), rien de réglé", { RAILWAY_ENVIRONMENT_NAME: "" }],
    ["local, mode actif, six accès", { RAILWAY_ENVIRONMENT_NAME: "", CREAGIDEM_MODE: "actif", ...ACCES }],
    ["dev, mode actif, six accès", { RAILWAY_ENVIRONMENT_NAME: "dev", CREAGIDEM_MODE: "actif", ...ACCES }],
    ["production, mode inactif", { RAILWAY_ENVIRONMENT_NAME: "production", CREAGIDEM_MODE: "inactif", ...ACCES }],
    ["production, mode absent", { RAILWAY_ENVIRONMENT_NAME: "production", CREAGIDEM_MODE: "", ...ACCES }],
    ["production, mode « active »", { RAILWAY_ENVIRONMENT_NAME: "production", CREAGIDEM_MODE: "active", ...ACCES }],
    ["production, mode actif, sans GUID", { RAILWAY_ENVIRONMENT_NAME: "production", CREAGIDEM_MODE: "actif", ...ACCES, CREAGIDEM_GUID: "" }],
    ["production, mode actif, sans URL", { RAILWAY_ENVIRONMENT_NAME: "production", CREAGIDEM_MODE: "actif", ...ACCES, CREAGIDEM_URL: " " }],
  ];

  for (const [nom, env] of configurations) {
    for (const origine of ["automatique", "manuel"] as const) {
      it(`${nom} — ${origine} : préparée, aucun appel réseau`, async () => {
        for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v ?? "");
        const ev = await transmettreACreagidem(laDemande!.id, { origine, par: origine === "manuel" ? "celine@bailly.fr" : null });
        expect(appels).toHaveLength(0);
        expect(ev?.statut).toBe("preparee");
        expect(ev?.motif).toBe(reglageCreagidem().motif);
        expect(evenements()).toHaveLength(1);
        expect(evenements()[0]).toMatchObject({ statut: "preparee", origine, environnement: environnement() });
      });
    }
  }

  it("même un jeton déjà en mémoire n'ouvre aucun chemin une fois le mode coupé", async () => {
    production();
    expect((await transmettreACreagidem(laDemande!.id)).statut).toBe("envoyee");
    expect(imports()).toHaveLength(1);
    vi.stubEnv("CREAGIDEM_MODE", "inactif");
    const ev = await transmettreACreagidem(laDemande!.id, { origine: "manuel", par: "celine@bailly.fr" });
    expect(ev?.statut).toBe("preparee");
    expect(imports()).toHaveLength(1);
    expect(appels).toHaveLength(2); // l'authentification et l'import du premier passage, rien d'autre
  });

  it("une adresse fictive n'est jamais envoyée, même tout étant actif", async () => {
    production();
    laDemande = demande({ client_email: "claire.dumont@example.com" });
    const ev = await transmettreACreagidem(laDemande.id);
    expect(ev).toMatchObject({ statut: "preparee", motif: "Adresse e-mail fictive (essai) : la fiche n'est jamais envoyée." });
    expect(appels).toHaveLength(0);
  });

  it("une fiche incomplète n'est jamais envoyée (champs obligatoires), même tout étant actif", async () => {
    production();
    laDemande = demande({ arrivee_ville: null });
    const ev = await transmettreACreagidem(laDemande.id, { origine: "manuel" });
    expect(ev?.statut).toBe("incomplete");
    expect(ev?.motif).toBe("Champs obligatoires de Créagidem manquants : ville de livraison. La fiche partira quand la demande sera complétée.");
    expect(appels).toHaveLength(0);
  });

  it("le motif d'une fiche incomplète passe avant celui du garde-fou", async () => {
    laDemande = demande({ client_nom: null, client_email: null });
    expect((await transmettreACreagidem(laDemande.id))?.statut).toBe("incomplete");
  });
});

describe("creagidem — l'envoi, tout étant actif", () => {
  beforeEach(() => production());

  it("authentification puis import, à l'adresse réglée (sans double barre)", async () => {
    const ev = await transmettreACreagidem(laDemande!.id);
    expect(appels.map((a) => a.url)).toEqual(["https://api.creagidem.test/api/v1/authentication", "https://api.creagidem.test/api/v1/importfiche"]);
    expect(JSON.parse(auths()[0].init.body)).toEqual({ client_id: "client-bailly", private_key: "cle-privee-secrete", licence: "licence-secrete" });
    expect(auths()[0].init.headers).not.toHaveProperty("Authorization");
    const imp = imports()[0];
    expect(imp.init.method).toBe("POST");
    expect(imp.init.headers.Authorization).toBe("Bearer jeton-1");
    const corps = JSON.parse(imp.init.body);
    expect(corps.guid_licence).toBe("guid-licence-secret");
    expect(corps.fiche.emetteur).toBe("BAILLY-WEB");
    expect(corps.client).toMatchObject({ nom: "Claire Dumont", email: "claire@gmail.com" });
    expect(corps.operation.distance).toBe("465.40");
    expect(ev).toMatchObject({ statut: "envoyee", motif: null, http: 201, origine: "automatique", environnement: "production" });
  });

  it("l'historique garde la fiche, jamais la clé privée, la licence ni le GUID", async () => {
    await transmettreACreagidem(laDemande!.id);
    const brut = JSON.stringify(base.de("request_events", "insert"));
    expect(brut).toContain("envoyee");
    for (const secret of ["cle-privee-secrete", "licence-secrete", "guid-licence-secret", "jeton-1"]) expect(brut).not.toContain(secret);
  });

  it("le lien de la demande dans le CRM figure dans le détail", async () => {
    await transmettreACreagidem(laDemande!.id);
    expect(JSON.parse(imports()[0].init.body).operation.detail).toContain(`/dashboard/${laDemande!.id}`);
  });

  it("sans distance en base, le calcul routier est demandé ; s'il échoue, « 0.00 »", async () => {
    laDemande = demande({ distance_km: null });
    m.distance.mockRejectedValue(new Error("OSRM en panne"));
    await transmettreACreagidem(laDemande.id);
    expect(m.distance).toHaveBeenCalledWith({ ville: "Paris", code_postal: "75002", adresse: "12 rue de la Paix" }, { ville: "Lyon", code_postal: "69002", adresse: "4 place Bellecour" });
    expect(JSON.parse(imports()[0].init.body).operation.distance).toBe("0.00");
  });

  it("une demande déjà envoyée ne repart pas automatiquement (aucun appel, aucune ligne)", async () => {
    dernier = { payload: { statut: "envoyee", motif: null, origine: "automatique", par: null, environnement: "production", fiche: null }, created_at: "2026-11-15T08:00:00Z" };
    const ev = await transmettreACreagidem(laDemande!.id);
    expect(ev).toMatchObject({ statut: "envoyee", le: "2026-11-15T08:00:00Z" });
    expect(appels).toHaveLength(0);
    expect(evenements()).toHaveLength(0);
  });

  it("une demande préparée auparavant repart automatiquement (seul « envoyee » arrête)", async () => {
    dernier = { payload: { statut: "preparee" }, created_at: "2026-11-15T08:00:00Z" };
    expect((await transmettreACreagidem(laDemande!.id))?.statut).toBe("envoyee");
  });

  it("« Envoyer dans Créagidem » renvoie à la main une demande déjà envoyée", async () => {
    dernier = { payload: { statut: "envoyee" }, created_at: "2026-11-15T08:00:00Z" };
    const ev = await transmettreACreagidem(laDemande!.id, { origine: "manuel", par: "celine@bailly.fr" });
    expect(ev).toMatchObject({ statut: "envoyee", origine: "manuel", par: "celine@bailly.fr" });
    expect(imports()).toHaveLength(1);
  });

  it("demande introuvable : null, rien d'écrit, aucun appel", async () => {
    laDemande = null;
    expect(await transmettreACreagidem("inconnue")).toBeNull();
    expect(appels).toHaveLength(0);
    expect(evenements()).toHaveLength(0);
  });

  it("une base qui lève : null, jamais d'exception (la demande du site ne doit pas échouer)", async () => {
    m.client = { from: () => { throw new Error("base injoignable"); } };
    await expect(transmettreACreagidem(laDemande!.id)).resolves.toBeNull();
    expect(appels).toHaveLength(0);
  });
});

describe("creagidem — pannes de Créagidem", () => {
  beforeEach(() => production());

  it("authentification refusée : « echec », aucun import", async () => {
    repAuth = () => reponseHttp(401, '{"error":"invalid_client"}');
    const ev = await transmettreACreagidem(laDemande!.id);
    expect(ev).toMatchObject({ statut: "echec", motif: "Créagidem a refusé la fiche.", http: 401 });
    expect(ev?.reponse).toBe('Authentification refusée (HTTP 401) : {"error":"invalid_client"}');
    expect(imports()).toHaveLength(0);
  });

  it("authentification sans JSON lisible, ou sans jeton : « echec », aucun import", async () => {
    for (const corps of ["<html>Bad gateway</html>", "{}", '{"access_token":""}', '{"access_token":42}']) {
      (globalThis as { __jetonCreagidem?: unknown }).__jetonCreagidem = undefined;
      repAuth = () => reponseHttp(200, corps);
      const ev = await transmettreACreagidem(laDemande!.id);
      expect(ev?.statut, corps).toBe("echec");
      expect(ev?.reponse).toBe("Authentification sans jeton d'accès.");
    }
    expect(imports()).toHaveLength(0);
  });

  it("jeton refusé à l'import (401) : il est oublié, un nouveau est demandé, une seule fois", async () => {
    let n = 0;
    repImport = () => (++n === 1 ? reponseHttp(401, "expired") : reponseHttp(201, "ok"));
    const ev = await transmettreACreagidem(laDemande!.id);
    expect(ev?.statut).toBe("envoyee");
    expect(auths()).toHaveLength(2);
    expect(imports()).toHaveLength(2);
  });

  it("403 à l'import : même reprise", async () => {
    let n = 0;
    repImport = () => (++n === 1 ? reponseHttp(403, "forbidden") : reponseHttp(200, "ok"));
    expect((await transmettreACreagidem(laDemande!.id))?.statut).toBe("envoyee");
    expect(auths()).toHaveLength(2);
  });

  it("refusé deux fois : « echec », pas de troisième essai", async () => {
    repImport = () => reponseHttp(401, "toujours refusé");
    const ev = await transmettreACreagidem(laDemande!.id);
    expect(ev).toMatchObject({ statut: "echec", http: 401, reponse: "toujours refusé" });
    expect(imports()).toHaveLength(2);
    expect(auths()).toHaveLength(2);
  });

  it("Créagidem en 500 : « echec » sans nouvel essai (jamais deux fiches)", async () => {
    repImport = () => reponseHttp(500, "");
    const ev = await transmettreACreagidem(laDemande!.id);
    expect(ev).toMatchObject({ statut: "echec", http: 500, reponse: "HTTP 500" });
    expect(imports()).toHaveLength(1);
  });

  it("la réponse gardée est tronquée à 1000 caractères", async () => {
    repImport = () => reponseHttp(422, "e".repeat(5000));
    expect((await transmettreACreagidem(laDemande!.id))?.reponse).toHaveLength(1000);
  });

  it("Créagidem qui ne répond pas : « echec », « Créagidem ne répond pas », sans lever", async () => {
    repImport = () => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    const ev = await transmettreACreagidem(laDemande!.id);
    expect(ev).toMatchObject({ statut: "echec", http: null, reponse: null });
    expect(ev?.motif).toBe("Créagidem ne répond pas : The operation was aborted due to timeout.");
    expect(evenements()[0].statut).toBe("echec");
  });
});

describe("creagidem — le jeton d'accès en mémoire", () => {
  beforeEach(() => {
    production();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T10:00:00.000Z"));
  });

  it("deux fiches de suite : une seule authentification", async () => {
    await transmettreACreagidem(laDemande!.id);
    await transmettreACreagidem(laDemande!.id, { origine: "manuel" });
    expect(auths()).toHaveLength(1);
    expect(imports()).toHaveLength(2);
  });

  it("gardé jusqu'à cinq minutes de sa fin (exp − 5 min), à la milliseconde près", async () => {
    const exp = Date.parse("2026-11-15T12:00:00.000Z") / 1000;
    repAuth = () => jetonValable(exp);
    await transmettreACreagidem(laDemande!.id);
    vi.setSystemTime(new Date("2026-11-15T11:54:59.999Z"));
    await transmettreACreagidem(laDemande!.id, { origine: "manuel" });
    expect(auths()).toHaveLength(1);
    vi.setSystemTime(new Date("2026-11-15T11:55:00.000Z"));
    await transmettreACreagidem(laDemande!.id, { origine: "manuel" });
    expect(auths()).toHaveLength(2);
  });

  it("sans « exp » : une heure par prudence (donc 55 minutes avec la marge)", async () => {
    repAuth = () => jetonValable();
    await transmettreACreagidem(laDemande!.id);
    vi.setSystemTime(new Date("2026-11-15T10:54:59.999Z"));
    await transmettreACreagidem(laDemande!.id, { origine: "manuel" });
    expect(auths()).toHaveLength(1);
    vi.setSystemTime(new Date("2026-11-15T10:55:00.000Z"));
    await transmettreACreagidem(laDemande!.id, { origine: "manuel" });
    expect(auths()).toHaveLength(2);
  });

  it("un jeton déjà expiré (exp dans le passé) n'est jamais réutilisé", async () => {
    repAuth = () => jetonValable(Date.parse("2026-11-15T10:04:00.000Z") / 1000);
    await transmettreACreagidem(laDemande!.id);
    await transmettreACreagidem(laDemande!.id, { origine: "manuel" });
    expect(auths()).toHaveLength(2);
  });

  it("un « exp » illisible (texte, négatif) vaut une heure", async () => {
    for (const exp of ["1763200000", -5, 0]) {
      (globalThis as { __jetonCreagidem?: unknown }).__jetonCreagidem = undefined;
      appels = [];
      repAuth = () => reponseHttp(200, { access_token: "j", exp });
      await transmettreACreagidem(laDemande!.id, { origine: "manuel" });
      vi.setSystemTime(new Date(Date.now() + 54 * 60_000));
      await transmettreACreagidem(laDemande!.id, { origine: "manuel" });
      expect(auths(), String(exp)).toHaveLength(1);
      vi.setSystemTime(new Date("2026-11-15T10:00:00.000Z"));
    }
  });
});

describe("creagidem — le plafond du jour (fiches automatiques)", () => {
  beforeEach(() => {
    production();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T10:00:00.000Z"));
  });

  it("34 fiches envoyées en 24 heures : la 35e part ; 35 : préparée, sans appel (35 par défaut)", async () => {
    compte = { count: 34 };
    expect((await transmettreACreagidem(laDemande!.id))?.statut).toBe("envoyee");
    appels = [];
    compte = { count: 35 };
    const ev = await transmettreACreagidem(laDemande!.id);
    expect(ev).toMatchObject({
      statut: "preparee",
      motif: "Plafond du jour atteint (35 fiches en 24 heures) : la fiche est préparée ; « Envoyer dans Créagidem » sur la demande l'enverra à la main.",
    });
    expect(appels).toHaveLength(0);
  });

  it("le compte porte sur les fiches envoyées des dernières 24 heures, à la milliseconde près", async () => {
    await transmettreACreagidem(laDemande!.id);
    const q = base.requetes.find((r) => r.table === "request_events" && (r.selection?.[1] as { head?: boolean } | undefined)?.head)!;
    expect(q.selection).toEqual(["id", { count: "exact", head: true }]);
    expect(filtre(q, "eq", "type")).toBe("creagidem");
    expect(filtre(q, "eq", "payload->>statut")).toBe("envoyee");
    expect(filtre(q, "gte", "created_at")).toBe("2026-11-14T10:00:00.000Z");
  });

  it("CREAGIDEM_PLAFOND_JOUR règle le plafond ; 0 retient toutes les fiches automatiques", async () => {
    vi.stubEnv("CREAGIDEM_PLAFOND_JOUR", "2");
    compte = { count: 1 };
    expect((await transmettreACreagidem(laDemande!.id))?.statut).toBe("envoyee");
    compte = { count: 2 };
    expect((await transmettreACreagidem(laDemande!.id))?.motif).toContain("(2 fiches en 24 heures)");
    vi.stubEnv("CREAGIDEM_PLAFOND_JOUR", "0");
    compte = { count: 0 };
    expect((await transmettreACreagidem(laDemande!.id))?.statut).toBe("preparee");
    expect(imports()).toHaveLength(1);
  });

  it("une valeur illisible garde 35", async () => {
    for (const v of ["abc", "-3", "2.5", " ", ""]) {
      vi.stubEnv("CREAGIDEM_PLAFOND_JOUR", v);
      compte = { count: 35 };
      expect((await transmettreACreagidem(laDemande!.id))?.statut, v).toBe("preparee");
      compte = { count: 34 };
      expect((await transmettreACreagidem(laDemande!.id))?.statut, v).toBe("envoyee");
    }
  });

  it("l'envoi à la main n'est pas plafonné (c'est le recours prévu)", async () => {
    compte = { count: 1000 };
    expect((await transmettreACreagidem(laDemande!.id, { origine: "manuel", par: "celine@bailly.fr" }))?.statut).toBe("envoyee");
  });

  it("un compte illisible ne bloque pas une vraie demande", async () => {
    compte = { error: { message: "timeout" } };
    expect((await transmettreACreagidem(laDemande!.id))?.statut).toBe("envoyee");
  });

  it("le plafond n'est même pas consulté hors production", async () => {
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "dev");
    await transmettreACreagidem(laDemande!.id);
    expect(base.requetes.some((r) => (r.selection?.[1] as { head?: boolean } | undefined)?.head)).toBe(false);
  });
});
