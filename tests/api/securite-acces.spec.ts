/*
 * La matrice des accès : chaque route d'API et chaque page, essayée avec
 * chaque sorte de compte. Ce qui n'est pas de l'équipe ne doit jamais rien
 * lire ni rien faire dans l'app de l'équipe.
 *
 * Les routes exclues du proxy par conception (signature d'un devis, tâches
 * planifiées, réponses SMS, démonstration) sont testées à part, avec leur secret.
 */
import { AVEC_COMPTES, EXT, INT, LOCAL, expect, requeteEn, test, type Sorte } from "../outils/banc";
import { pages, routes } from "../outils/routes";

const SANS_PROXY = /^\/api\/(taches|sms)\//;
const ROUTES_INTERNE = routes("interne").filter((r) => r.chemin.startsWith("/api/") && !SANS_PROXY.test(r.chemin));
const PAGES_INTERNE = pages("interne").filter((p) => !/^\/(login|signature|desabonnement|espace-client\/demo-equipe)(\/|$)/.test(p.modele));
const remplirFaux = (m: string) => m.replace(/\[\[\.\.\.[^\]]+\]\]/g, "").replace(/\[\.\.\.[^\]]+\]/g, "x").replace(/\[[^\]]+\]/g, "999999").replace(/\/+$/, "") || "/";

/** Une réponse qui livre des données : 2xx avec un corps JSON non vide (ou un fichier). */
async function livreDesDonnees(r: import("@playwright/test").APIResponse) {
  if (r.status() < 200 || r.status() >= 300) return false;
  const type = r.headers()["content-type"] ?? "";
  const corps = await r.text();
  if (/json/.test(type)) return !/^\s*(\{\s*\}|\[\s*\]|null)?\s*$/.test(corps);
  return corps.length > 0;
}

test.describe("app de l'équipe : routes d'API sans session @lecture", () => {
  for (const r of ROUTES_INTERNE) {
    test(`${r.chemin} refuse sans session`, async () => {
      const req = await requeteEn(null);
      for (const m of r.methodes.length ? r.methodes : ["GET"]) {
        const rep = await req.fetch(INT + r.chemin, { method: m, data: m === "GET" ? undefined : {} });
        expect(rep.status(), `${m} ${r.chemin}`).toBe(401);
      }
    });
  }
});

test.describe("app de l'équipe : routes d'API avec un compte qui n'est pas de l'équipe", () => {
  test.skip(!AVEC_COMPTES, "comptes de test seulement en recette");
  for (const sorte of ["intrus", "inconnu", "rh", "client", "terrain"] as Sorte[]) {
    test(`le compte « ${sorte} » n'obtient rien`, async () => {
      const req = await requeteEn(sorte);
      const ecarts: string[] = [];
      for (const r of ROUTES_INTERNE) {
        if (sorte === "terrain" && r.chemin.startsWith("/api/terrain/")) continue; // son outil : revérifié par la route
        for (const m of r.methodes.length ? r.methodes : ["GET"]) {
          const rep = await req.fetch(INT + r.chemin, { method: m, data: m === "GET" ? undefined : {} });
          if (![401, 403].includes(rep.status())) ecarts.push(`${m} ${r.chemin} → ${rep.status()}`);
        }
      }
      expect(ecarts).toEqual([]);
    });
  }

  test("le compte terrain n'ouvre que les routes du terrain, et seulement les siennes", async () => {
    const req = await requeteEn("terrain");
    for (const r of ROUTES_INTERNE.filter((x) => x.chemin.startsWith("/api/terrain/"))) {
      const rep = await req.get(INT + r.chemin);
      expect(rep.status(), r.chemin).toBeLessThan(500);
      // Une photo qui n'existe pas (identifiant fictif) ne livre rien.
      if (r.chemin.includes("00000000")) expect(await livreDesDonnees(rep), r.chemin).toBe(false);
    }
  });
});

test.describe("app de l'équipe : routes d'API avec l'équipe", () => {
  test.skip(!AVEC_COMPTES, "comptes de test seulement en recette");
  test("aucune route GET ne refuse l'équipe ni ne plante", async () => {
    const req = await requeteEn("equipe");
    const ecarts: string[] = [];
    for (const r of ROUTES_INTERNE.filter((x) => x.methodes.includes("GET"))) {
      const rep = await req.get(INT + r.chemin);
      if ([401, 403].includes(rep.status()) || rep.status() >= 500) ecarts.push(`GET ${r.chemin} → ${rep.status()} ${(await rep.text()).slice(0, 80)}`);
    }
    expect(ecarts).toEqual([]);
  });
});

test.describe("app de l'équipe : pages", () => {
  test("sans session, chaque page mène à la connexion, avec le chemin de retour @lecture", async () => {
    const req = await requeteEn(null);
    const ecarts: string[] = [];
    for (const p of PAGES_INTERNE) {
      const chemin = remplirFaux(p.modele);
      const rep = await req.get(INT + chemin);
      const vers = rep.headers()["location"] ?? "";
      const attendu = /^\/(terrain)(\/|$)/.test(chemin) ? "/terrain/connexion" : "/login";
      if (chemin === "/terrain/connexion") {
        if (rep.status() !== 200) ecarts.push(`${chemin} → ${rep.status()}`);
      } else if (![307, 308].includes(rep.status()) || !new URL(vers, INT).pathname.startsWith(attendu)) ecarts.push(`${chemin} → ${rep.status()} ${vers}`);
    }
    expect(ecarts).toEqual([]);
  });

  for (const [sorte, attendu] of [
    ["intrus", (u: URL) => u.origin === new URL(INT).origin && u.pathname === "/login" && u.searchParams.get("refus") === "1"],
    ["inconnu", (u: URL) => u.origin === new URL(INT).origin && u.pathname === "/login" && u.searchParams.get("refus") === "1"],
    ["rh", (u: URL) => u.origin === new URL(EXT).origin && u.pathname === "/rh"],
    ["client", (u: URL) => u.origin === new URL(EXT).origin && u.pathname === "/espace-client"],
    ["terrain", (u: URL) => u.origin === new URL(INT).origin && u.pathname === "/terrain"],
  ] as [Sorte, (u: URL) => boolean][]) {
    test(`le compte « ${sorte} » est renvoyé hors des pages de l'équipe`, async () => {
      test.skip(!AVEC_COMPTES, "comptes de test seulement en recette");
      const req = await requeteEn(sorte);
      const ecarts: string[] = [];
      for (const p of PAGES_INTERNE.filter((x) => !x.modele.startsWith("/terrain"))) {
        const chemin = remplirFaux(p.modele);
        const rep = await req.get(INT + chemin);
        const vers = rep.headers()["location"];
        if (!vers || !attendu(new URL(vers, INT))) ecarts.push(`${chemin} → ${rep.status()} ${vers ?? ""}`);
      }
      expect(ecarts).toEqual([]);
    });
  }
});

test.describe("routes exclues du proxy : chacune exige son secret", () => {
  test("tâches planifiées et réponses SMS refusent sans secret @lecture", async () => {
    const req = await requeteEn(null);
    for (const r of routes("interne").filter((x) => SANS_PROXY.test(x.chemin))) {
      for (const m of r.methodes) {
        const rep = await req.fetch(INT + r.chemin, { method: m, data: m === "GET" ? undefined : {} });
        expect([401, 404], `${m} ${r.chemin}`).toContain(rep.status());
        const faux = await req.fetch(INT + r.chemin, { method: m, data: m === "GET" ? undefined : {}, headers: { Authorization: "Bearer faux-secret-de-la-batterie" } });
        expect([401, 404], `${m} ${r.chemin} (faux secret)`).toContain(faux.status());
      }
    }
  });

  test("la signature d'un devis sans jeton valable ne montre rien @lecture", async () => {
    const req = await requeteEn(null);
    for (const chemin of ["/signature/jeton-invalide", "/signature/document/jeton-invalide", "/desabonnement/jeton-invalide"]) {
      const rep = await req.get(INT + chemin);
      expect(rep.status(), chemin).toBeLessThan(500);
      expect(await rep.text(), chemin).not.toMatch(/€|TTC|montant/i);
    }
  });

  test("le back-office de démonstration n'existe pas hors démonstration @lecture", async () => {
    test.skip(LOCAL && process.env.ESPACE_CLIENT_DEMO_EQUIPE === "1");
    const req = await requeteEn(null);
    const rep = await req.get(INT + "/espace-client/demo-equipe");
    expect(rep.status()).toBe(404);
    const donnees = await req.get(INT + "/espace-client/demo-equipe/donnees/clients");
    expect(donnees.status()).toBe(404);
  });
});

test.describe("app publique : routes réservées", () => {
  test("l'espace RH refuse sans session, et les fichiers de l'espace client aussi @lecture", async () => {
    const req = await requeteEn(null);
    expect((await req.get(EXT + "/api/rh/donnees")).status()).toBe(401);
    expect([401, 404]).toContain((await req.get(EXT + "/api/rh/factures/00000000-0000-4000-8000-000000000000/pdf")).status());
    const f = await req.get(EXT + "/espace-client/fichier/document/00000000-0000-4000-8000-000000000000");
    expect(f.status()).toBe(404);
  });

  test("l'espace RH : le compte RH ne lit que son entreprise, même en demandant une autre", async () => {
    test.skip(!AVEC_COMPTES);
    const rh = await requeteEn("rh");
    const a = await rh.get(EXT + "/api/rh/donnees");
    expect(a.status()).toBe(200);
    const b = await rh.get(EXT + "/api/rh/donnees?apercu=credit-agricole");
    expect(b.status()).toBe(200);
    const ja = await a.json();
    const jb = await b.json();
    // Le paramètre « apercu » est ignoré pour un compte RH : même espace, mêmes dossiers.
    expect(ja.espace?.id).toBe("carrefour");
    expect(jb.espace?.id).toBe("carrefour");
    const ids = (j: { mobilites?: { id: string }[] }) => (j.mobilites ?? []).map((m) => m.id).sort();
    expect(ids(jb)).toEqual(ids(ja));
    expect(jb.apercu).toBe(false);
  });

  for (const sorte of ["intrus", "inconnu", "client", "terrain"] as Sorte[]) {
    test(`l'espace RH refuse le compte « ${sorte} »`, async () => {
      test.skip(!AVEC_COMPTES);
      const req = await requeteEn(sorte);
      expect((await req.get(EXT + "/api/rh/donnees")).status()).toBe(401);
      expect((await req.get(EXT + "/api/rh/donnees?apercu=carrefour")).status()).toBe(401);
    });
  }

  test("l'équipe voit la liste des espaces RH, et l'aperçu de l'un d'eux", async () => {
    test.skip(!AVEC_COMPTES);
    const req = await requeteEn("equipe");
    const liste = await req.get(EXT + "/api/rh/donnees");
    expect(liste.status()).toBe(200);
    const apercu = await req.get(EXT + "/api/rh/donnees?apercu=carrefour");
    expect(apercu.status()).toBe(200);
  });
});
