import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Les réglages de l'espace client (espace-client/config.ts). `adresses.ts`
 * fige URL_EXTERNE au chargement (d'après NODE_ENV) : chaque test recharge
 * les modules après avoir posé son environnement.
 */

const m = vi.hoisted(() => ({ headers: vi.fn() }));
vi.mock("next/headers", () => ({ headers: m.headers }));

async function charger(env: Record<string, string> = {}) {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  vi.resetModules();
  return import("@/lib/espace-client/config");
}

beforeEach(() => {
  m.headers.mockReset().mockResolvedValue(new Headers({ host: "pirate.example", "x-forwarded-host": "pirate.example", "x-forwarded-proto": "https" }));
  vi.stubEnv("ESPACE_CLIENT_URL", "");
  vi.stubEnv("NEXT_PUBLIC_URL_EXTERNE", "");
  vi.stubEnv("ESPACE_CLIENT_DONNEES", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("espace-client/config — adressePublique", () => {
  it("ESPACE_CLIENT_URL d'abord, sans la barre finale", async () => {
    const c = await charger({ ESPACE_CLIENT_URL: "https://espace.bailly.fr/", NEXT_PUBLIC_URL_EXTERNE: "https://autre.bailly.fr" });
    expect(await c.adressePublique()).toBe("https://espace.bailly.fr");
  });

  it("puis NEXT_PUBLIC_URL_EXTERNE (figée au chargement)", async () => {
    const c = await charger({ NODE_ENV: "production", NEXT_PUBLIC_URL_EXTERNE: "https://plateforme.bailly.fr/" });
    expect(await c.adressePublique()).toBe("https://plateforme.bailly.fr");
  });

  it("en production sans adresse réglée : lève, et ne lit JAMAIS l'hôte de la requête", async () => {
    const c = await charger({ NODE_ENV: "production" });
    await expect(c.adressePublique()).rejects.toThrow("ESPACE_CLIENT_URL ou NEXT_PUBLIC_URL_EXTERNE manquant : aucun lien ne part.");
    expect(m.headers).not.toHaveBeenCalled();
  });

  it("en développement, sans rien de réglé : le port local de l'app externe", async () => {
    const c = await charger({ NODE_ENV: "development" });
    expect(await c.adressePublique()).toBe("http://localhost:3939");
    expect(m.headers).not.toHaveBeenCalled();
  });

  it("hors production et sans adresse figée : l'hôte de la requête, http pour localhost", async () => {
    const c = await charger({ NODE_ENV: "production" }); // URL_EXTERNE figée vide
    vi.stubEnv("NODE_ENV", "development");
    expect(await c.adressePublique()).toBe("https://pirate.example");
    m.headers.mockResolvedValue(new Headers({ host: "localhost:3939" }));
    expect(await c.adressePublique()).toBe("http://localhost:3939");
    m.headers.mockRejectedValue(new Error("hors requête"));
    expect(await c.adressePublique()).toBe("http://localhost:3939");
  });
});

describe("espace-client/config — cle (une clé par usage)", () => {
  it("dérivée d'ESPACE_CLIENT_SECRET : 32 octets, stable, différente pour chaque usage", async () => {
    const c = await charger({ ESPACE_CLIENT_SECRET: "racine" });
    const a = c.cle("paiement");
    expect(a).toHaveLength(32);
    expect(c.cle("paiement").equals(a)).toBe(true);
    expect(c.cle("fichier").equals(a)).toBe(false);
  });

  it("à défaut, la clé service_role ; ESPACE_CLIENT_SECRET l'emporte", async () => {
    const c = await charger({ SUPABASE_SERVICE_ROLE_KEY: "service" });
    const parService = c.cle("paiement");
    vi.stubEnv("ESPACE_CLIENT_SECRET", "racine");
    expect(c.cle("paiement").equals(parService)).toBe(false);
  });

  it("sans aucune clé, en mode base : lève (rien ne se signe)", async () => {
    const c = await charger({ ESPACE_CLIENT_SECRET: "", SUPABASE_SERVICE_ROLE_KEY: "" });
    expect(() => c.cle("paiement")).toThrow("Aucune clé serveur");
  });

  it("sans aucune clé, en démonstration hors production : une clé de travail", async () => {
    const c = await charger({ ESPACE_CLIENT_SECRET: "", ESPACE_CLIENT_DONNEES: "demo", NODE_ENV: "development" });
    expect(c.cle("paiement")).toHaveLength(32);
  });

  it("sans aucune clé, en démonstration EN production : lève", async () => {
    const c = await charger({ ESPACE_CLIENT_SECRET: "", ESPACE_CLIENT_DONNEES: "demo", NODE_ENV: "production" });
    expect(() => c.cle("paiement")).toThrow("Aucune clé serveur");
  });
});

describe("espace-client/config — modes et raccourcis de démonstration", () => {
  it("la démonstration ne s'ouvre qu'avec ESPACE_CLIENT_DONNEES=demo exactement", async () => {
    const c = await charger();
    for (const v of ["", "DEMO", "démo", "1", "true"]) {
      vi.stubEnv("ESPACE_CLIENT_DONNEES", v);
      expect(c.modeDonnees(), v).toBe("base");
    }
    vi.stubEnv("ESPACE_CLIENT_DONNEES", "demo");
    expect(c.estDemo()).toBe(true);
  });

  it("le back-office de démonstration ne s'ouvre jamais sur la base réelle", async () => {
    const c = await charger({ ESPACE_CLIENT_DEMO_EQUIPE: "1", NODE_ENV: "development" });
    expect(c.demoEquipeActive()).toBe(false);
    vi.stubEnv("ESPACE_CLIENT_DONNEES", "demo");
    expect(c.demoEquipeActive()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ESPACE_CLIENT_DEMO_EQUIPE", "");
    expect(c.demoEquipeActive()).toBe(false);
    vi.stubEnv("ESPACE_CLIENT_DEMO_EQUIPE", "1");
    expect(c.demoEquipeActive()).toBe(true);
  });

  it("les raccourcis des profils fictifs : en développement, en démonstration, ou sur demande", async () => {
    const c = await charger({ NODE_ENV: "production" });
    expect(c.profilsDemoOuverts()).toBe(false);
    vi.stubEnv("ESPACE_CLIENT_PROFILS_DEMO", "1");
    expect(c.profilsDemoOuverts()).toBe(true);
    vi.stubEnv("ESPACE_CLIENT_PROFILS_DEMO", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(c.profilsDemoOuverts()).toBe(true);
  });

  it("la base est réglée seulement avec ses trois variables", async () => {
    const c = await charger({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" });
    expect(c.baseConfiguree()).toBe(false);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    expect(c.baseConfiguree()).toBe(true);
  });

  it("les avis à l'équipe : ESPACE_CLIENT_EMAIL_EQUIPE, sinon le conseiller", async () => {
    const c = await charger();
    expect(c.emailEquipe("nadia@bailly.fr")).toBe("nadia@bailly.fr");
    vi.stubEnv("ESPACE_CLIENT_EMAIL_EQUIPE", "equipe@bailly.fr");
    expect(c.emailEquipe("nadia@bailly.fr")).toBe("equipe@bailly.fr");
  });

  it("adresseFictive suit la règle du module d'envoi", async () => {
    const c = await charger();
    expect(c.adresseFictive("claire.dumont@example.com")).toBe(true);
    expect(c.adresseFictive("claire@gmail.com")).toBe(false);
  });

  it("les durées : lien d'accès 15 minutes, session 12 heures", async () => {
    const c = await charger();
    expect(c.DUREE_LIEN_MIN).toBe(15);
    expect(c.DUREE_SESSION_H).toBe(12);
  });
});
