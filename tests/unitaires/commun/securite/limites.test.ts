import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn() }));

import { createServiceClient } from "@/lib/supabase/server";
import {
  adresseIp,
  delaiLisible,
  fenetreJour,
  fenetres,
  lireLimite,
  rendre,
  reponseTropDeDemandes,
  reserver,
  reserverDuJour,
  type Fenetre,
} from "@/lib/limites";

/*
 * Les limites de débit des portes publiques (lib/limites.ts) : fenêtre
 * glissante en mémoire, réservation atomique sur plusieurs compteurs, et un
 * plafond du jour calendaire tenu en base.
 */

type Coffre = typeof globalThis & { __limitesDebit?: Map<string, unknown[]>; __limitesNettoyage?: number };
const coffre = globalThis as Coffre;

const T0 = new Date("2026-11-15T10:00:00+01:00").getTime();
const parMinute = (max: number): Fenetre[] => [{ nom: "minute", ms: 60_000, max }];

beforeEach(() => {
  delete coffre.__limitesDebit;
  delete coffre.__limitesNettoyage;
  vi.useFakeTimers({ now: T0 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("lireLimite et fenetres", () => {
  it("lit un entier positif ou nul, sinon garde la valeur par défaut", () => {
    const cas: [string | undefined, number][] = [
      ["10", 10], ["0", 0], [" 7 ", 7], ["-1", 3], ["1.5", 3], ["abc", 3], ["", 3], ["   ", 3], ["Infinity", 3], ["NaN", 3], [undefined, 3],
    ];
    for (const [v, attendu] of cas) {
      if (v === undefined) vi.stubEnv("LIMITE_ESSAI", undefined as unknown as string);
      else vi.stubEnv("LIMITE_ESSAI", v);
      expect(lireLimite("LIMITE_ESSAI", 3), `valeur ${JSON.stringify(v)}`).toBe(attendu);
    }
  });

  it("donne les trois fenêtres, réglables chacune par sa variable", () => {
    vi.stubEnv("ESSAI_PAR_HEURE", "42");
    expect(fenetres("ESSAI", { minute: 1, heure: 2, jour: 3 })).toEqual([
      { nom: "minute", ms: 60_000, max: 1 },
      { nom: "heure", ms: 3_600_000, max: 42 },
      { nom: "jour", ms: 86_400_000, max: 3 },
    ]);
    expect(fenetreJour(5)).toEqual([{ nom: "jour", ms: 86_400_000, max: 5 }]);
  });
});

describe("reserver — fenêtre glissante", () => {
  it("accepte jusqu'au plafond, refuse au-delà en disant quand une place se libère", () => {
    expect(reserver([{ cle: "ip:a", fenetres: parMinute(2) }])).toBeNull();
    vi.advanceTimersByTime(30_000);
    expect(reserver([{ cle: "ip:a", fenetres: parMinute(2) }])).toBeNull();
    vi.advanceTimersByTime(29_000);
    expect(reserver([{ cle: "ip:a", fenetres: parMinute(2) }])).toEqual({ cle: "ip:a", fenetre: "minute", dans: 1 });
  });

  it("libère la place de la plus ancienne réservation, et elle seule", () => {
    reserver([{ cle: "ip:a", fenetres: parMinute(2) }]);
    vi.advanceTimersByTime(30_000);
    reserver([{ cle: "ip:a", fenetres: parMinute(2) }]);
    vi.advanceTimersByTime(30_001);
    expect(reserver([{ cle: "ip:a", fenetres: parMinute(2) }])).toBeNull();
    expect(reserver([{ cle: "ip:a", fenetres: parMinute(2) }])).toEqual({ cle: "ip:a", fenetre: "minute", dans: 30 });
  });

  it("un refus ne consomme rien : refusé dix fois, on repasse à l'heure dite", () => {
    reserver([{ cle: "ip:a", fenetres: parMinute(1) }]);
    for (let i = 0; i < 10; i++) expect(reserver([{ cle: "ip:a", fenetres: parMinute(1) }])).not.toBeNull();
    vi.advanceTimersByTime(60_001);
    expect(reserver([{ cle: "ip:a", fenetres: parMinute(1) }])).toBeNull();
  });

  it("vérifie chaque fenêtre : la minute libre ne suffit pas si l'heure est pleine", () => {
    const f: Fenetre[] = [{ nom: "minute", ms: 60_000, max: 2 }, { nom: "heure", ms: 3_600_000, max: 3 }];
    reserver([{ cle: "ip:a", fenetres: f }]);
    vi.advanceTimersByTime(1_000);
    reserver([{ cle: "ip:a", fenetres: f }]);
    vi.advanceTimersByTime(60_000);
    expect(reserver([{ cle: "ip:a", fenetres: f }])).toBeNull();
    vi.advanceTimersByTime(61_000);
    expect(reserver([{ cle: "ip:a", fenetres: f }])).toEqual({ cle: "ip:a", fenetre: "heure", dans: 3_600 - 122 });
  });

  it("les compteurs de deux clés sont indépendants", () => {
    expect(reserver([{ cle: "ip:a", fenetres: parMinute(1) }])).toBeNull();
    expect(reserver([{ cle: "ip:b", fenetres: parMinute(1) }])).toBeNull();
    expect(reserver([{ cle: "ip:a", fenetres: parMinute(1) }])).not.toBeNull();
  });

  it("un plafond à 0 refuse tout", () => {
    expect(reserver([{ cle: "ip:a", fenetres: parMinute(0) }])).toEqual({ cle: "ip:a", fenetre: "minute", dans: 60 });
  });
});

describe("reserver — plusieurs compteurs d'un coup", () => {
  it("si l'un refuse, rien n'est réservé sur les autres", () => {
    const ip = { cle: "demande:ip:1.2.3.4", fenetres: parMinute(5) };
    const email = { cle: "demande:email:jean@exemple.fr", fenetres: parMinute(1) };
    expect(reserver([ip, email])).toBeNull();
    for (let i = 0; i < 5; i++) expect(reserver([ip, email])).toEqual({ cle: email.cle, fenetre: "minute", dans: 60 });
    // L'adresse IP n'a été comptée qu'une fois : il lui reste quatre places.
    for (let i = 0; i < 4; i++) expect(reserver([ip])).toBeNull();
    expect(reserver([ip])?.cle).toBe(ip.cle);
  });

  it("le refus nomme le premier compteur plein, dans l'ordre donné", () => {
    reserver([{ cle: "a", fenetres: parMinute(1) }, { cle: "b", fenetres: parMinute(1) }]);
    expect(reserver([{ cle: "a", fenetres: parMinute(1) }, { cle: "b", fenetres: parMinute(1) }])?.cle).toBe("a");
    expect(reserver([{ cle: "b", fenetres: parMinute(1) }, { cle: "a", fenetres: parMinute(1) }])?.cle).toBe("b");
  });
});

describe("reserver — le poids", () => {
  it("un envoi plus lourd que le plafond est refusé d'emblée, sans rien consommer", () => {
    expect(reserver([{ cle: "gemini:ip:x", poids: 14, fenetres: parMinute(13) }])).toEqual({ cle: "gemini:ip:x", fenetre: "minute", dans: 60 });
    expect(reserver([{ cle: "gemini:ip:x", poids: 13, fenetres: parMinute(13) }])).toBeNull();
  });

  it("le poids compte en entier : 3 + 3 dépasse 5", () => {
    expect(reserver([{ cle: "k", poids: 3, fenetres: parMinute(5) }])).toBeNull();
    expect(reserver([{ cle: "k", poids: 3, fenetres: parMinute(5) }])).not.toBeNull();
    expect(reserver([{ cle: "k", poids: 2, fenetres: parMinute(5) }])).toBeNull();
  });

  it("un poids nul passe, mais n'ouvre aucune place", () => {
    reserver([{ cle: "k", fenetres: parMinute(1) }]);
    expect(reserver([{ cle: "k", poids: 0, fenetres: parMinute(1) }])).toBeNull();
    expect(reserver([{ cle: "k", fenetres: parMinute(1) }])).not.toBeNull();
  });

  // Un poids négatif compte pour zéro : il ne rouvre pas de places sur un compteur plein.
  it("un poids négatif ne fait pas crédit sur un compteur plein", () => {
    reserver([{ cle: "k", fenetres: parMinute(2) }]);
    reserver([{ cle: "k", fenetres: parMinute(2) }]);
    reserver([{ cle: "k", poids: -5, fenetres: parMinute(2) }]);
    expect(reserver([{ cle: "k", fenetres: parMinute(2) }])).not.toBeNull();
  });
});

describe("rendre", () => {
  it("rend la dernière réservation d'un compteur, et elle seule", () => {
    reserver([{ cle: "gemini:ip:x", poids: 13, fenetres: parMinute(13) }]);
    rendre("gemini:ip:x");
    expect(reserver([{ cle: "gemini:ip:x", poids: 13, fenetres: parMinute(13) }])).toBeNull();
    expect(reserver([{ cle: "gemini:ip:x", poids: 1, fenetres: parMinute(13) }])).not.toBeNull();
  });

  it("ne fait rien sur un compteur inconnu ou vide, et ne touche pas aux autres", () => {
    expect(() => rendre("jamais-vu")).not.toThrow();
    reserver([{ cle: "a", fenetres: parMinute(1) }]);
    rendre("b");
    rendre("b");
    expect(reserver([{ cle: "a", fenetres: parMinute(1) }])).not.toBeNull();
  });
});

describe("nettoyage de la mémoire", () => {
  it("au-delà de 20 000 compteurs, ceux d'hier sont retirés", () => {
    for (let i = 0; i < 20_001; i++) reserver([{ cle: `vieux:${i}`, fenetres: parMinute(1) }]);
    expect(coffre.__limitesDebit?.size).toBe(20_001);
    vi.advanceTimersByTime(25 * 3_600_000);
    reserver([{ cle: "neuf", fenetres: parMinute(1) }]);
    expect(coffre.__limitesDebit?.size).toBe(1);
  });

  it("garde les compteurs du jour même au-delà de 20 000", () => {
    reserver([{ cle: "ip:reelle", fenetres: fenetreJour(1) }]);
    for (let i = 0; i < 20_001; i++) reserver([{ cle: `autre:${i}`, fenetres: parMinute(1) }]);
    vi.advanceTimersByTime(2 * 60_000);
    reserver([{ cle: "declencheur", fenetres: parMinute(1) }]);
    expect(reserver([{ cle: "ip:reelle", fenetres: fenetreJour(1) }])).not.toBeNull();
  });

  // Comportement documenté (limites.ts:97-101, « tout repart de zéro ») : un afflux de plus de
  // 100 000 compteurs distincts vide toute la mémoire, plafonds en cours compris. À savoir : derrière
  // une adresse IPv6, chaque adresse d'un même /64 est un compteur à part.
  it("au-delà de 100 000 compteurs, tout repart de zéro (choix documenté)", () => {
    reserver([{ cle: "ip:reelle", fenetres: fenetreJour(1) }]);
    expect(reserver([{ cle: "ip:reelle", fenetres: fenetreJour(1) }])).not.toBeNull();
    for (let i = 0; i <= 100_000; i++) reserver([{ cle: `faux:${i}`, fenetres: parMinute(1) }]);
    expect(reserver([{ cle: "ip:reelle", fenetres: fenetreJour(1) }])).toBeNull();
  });
});

describe("adresseIp", () => {
  const h = (entetes: Record<string, string>) => new Headers(entetes);

  it("lit X-Real-IP d'abord, sans tenir compte d'un X-Forwarded-For forgé", () => {
    expect(adresseIp(h({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("203.0.113.7");
  });

  it("retire les blancs : une même adresse écrite avec des espaces garde son compteur", () => {
    expect(adresseIp(h({ "x-real-ip": "  203.0.113.7  " }))).toBe("203.0.113.7");
    expect(adresseIp(h({ "x-forwarded-for": "  203.0.113.7  , 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("à défaut, prend le PREMIER élément de X-Forwarded-For, jamais le relais ajouté derrière", () => {
    expect(adresseIp(h({ "x-forwarded-for": "203.0.113.7, 100.64.0.2" }))).toBe("203.0.113.7");
    expect(adresseIp(h({ "x-forwarded-for": "203.0.113.7,100.64.0.2,100.64.0.3" }))).toBe("203.0.113.7");
  });

  it("un X-Real-IP vide ou blanc ne masque pas X-Forwarded-For", () => {
    expect(adresseIp(h({ "x-real-ip": "   ", "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("sans adresse lisible : « inconnue » (un compteur commun, le côté prudent)", () => {
    expect(adresseIp(h({}))).toBe("inconnue");
    expect(adresseIp(h({ "x-forwarded-for": "" }))).toBe("inconnue");
    expect(adresseIp(h({ "x-forwarded-for": " , 100.64.0.2" }))).toBe("inconnue");
  });

  it("garde une adresse IPv6 entière", () => {
    expect(adresseIp(h({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it("un en-tête avec retour à la ligne n'arrive jamais jusqu'ici (refusé par Headers)", () => {
    expect(() => h({ "x-real-ip": "1.2.3.4\r\nx-admin: 1" })).toThrow();
  });
});

describe("delaiLisible", () => {
  it.each([
    [-5, "dans une minute"],
    [0, "dans une minute"],
    [89, "dans une minute"],
    [90, "dans 2 minutes"],
    [3_599, "dans 60 minutes"],
    [3_601, "dans 2 heures"],
    [6 * 3_600 - 1, "dans 6 heures"],
    [6 * 3_600, "demain"],
    [86_400, "demain"],
  ])("%i s → « %s »", (s, attendu) => {
    expect(delaiLisible(s)).toBe(attendu);
  });

  // Une heure s'écrit au singulier (« Réessayez dans une heure. »).
  it("3 600 s → « dans une heure », au singulier", () => {
    expect(delaiLisible(3_600)).toMatch(/^dans (une|1) heure$/);
  });
});

describe("reponseTropDeDemandes", () => {
  it("répond 429, avec Retry-After en secondes et le message lisible", async () => {
    const r = reponseTropDeDemandes({ cle: "demande:ip:x", fenetre: "heure", dans: 1_200 }, "Plusieurs demandes viennent déjà d'être envoyées.");
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("1200");
    expect(await r.json()).toEqual({ error: "Plusieurs demandes viennent déjà d'être envoyées. Réessayez dans 20 minutes.", limite: "heure" });
  });

  it("ne révèle pas la clé du compteur (adresse IP, e-mail) au visiteur", async () => {
    const r = reponseTropDeDemandes({ cle: "demande:email:victime@exemple.fr", fenetre: "jour", dans: 50_000 }, "Trop.");
    const texte = JSON.stringify(await r.json());
    expect(texte).not.toContain("victime@exemple.fr");
    expect(r.headers.get("retry-after")).toBe("50000");
  });
});

describe("reserverDuJour — le plafond du jour calendaire, en base", () => {
  const rpc = vi.fn();
  beforeEach(() => {
    rpc.mockReset();
    vi.mocked(createServiceClient).mockReturnValue({ rpc } as never);
  });

  it("passe la clé, le poids et le plafond à la fonction de la base", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await reserverDuJour("gemini:photos", 13, 150)).toBeNull();
    expect(rpc).toHaveBeenCalledWith("reserver_compteur_jour", { p_cle: "gemini:photos", p_n: 13, p_max: 150 });
  });

  it("la base refuse : refus jusqu'à minuit, heure de Paris", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const refus = await reserverDuJour("gemini:photos", 1, 150);
    // 10 h à Paris : 14 heures avant minuit.
    expect(refus).toEqual({ cle: "gemini:photos", fenetre: "jour", dans: 14 * 3_600 });
  });

  it("à quelques secondes de minuit, le délai annoncé est d'au moins une minute", async () => {
    vi.setSystemTime(new Date("2026-11-15T23:59:45+01:00"));
    rpc.mockResolvedValue({ data: false, error: null });
    expect((await reserverDuJour("gemini:photos", 1, 150))?.dans).toBe(60);
  });

  it("une réponse vide sans erreur vaut un refus (jamais un passe-droit)", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await reserverDuJour("gemini:photos", 1, 150)).not.toBeNull();
  });

  it("la base injoignable : le même plafond, tenu en mémoire", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpc.mockResolvedValue({ data: null, error: { message: "connexion refusée" } });
    expect(await reserverDuJour("gemini:photos", 1, 2)).toBeNull();
    expect(await reserverDuJour("gemini:photos", 1, 2)).toBeNull();
    const refus = await reserverDuJour("gemini:photos", 1, 2);
    expect(refus).toMatchObject({ cle: "gemini:photos", fenetre: "jour" });
    expect(console.error).toHaveBeenCalled();
  });

  it("le repli en mémoire ne se confond pas avec un compteur ordinaire du même nom", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpc.mockResolvedValue({ data: null, error: { message: "délai dépassé" } });
    await reserverDuJour("gemini:photos", 1, 1);
    expect(reserver([{ cle: "gemini:photos", fenetres: parMinute(1) }])).toBeNull();
  });

  it("le repli en mémoire refuse un poids supérieur au plafond", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpc.mockResolvedValue({ data: null, error: { message: "x" } });
    expect(await reserverDuJour("gemini:photos", 151, 150)).not.toBeNull();
  });
});
