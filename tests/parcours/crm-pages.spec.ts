/*
 * Toutes les pages du CRM et de l'espace de l'équipe, ouvertes une à une avec
 * la session d'un membre de l'équipe : aucune ne doit planter (page d'erreur,
 * 5xx, erreur JavaScript). Les adresses à identifiant prennent un vrai
 * identifiant de la recette, lu en base sans rien modifier.
 *
 * L'espace client vu par l'équipe, la tablette et le terrain ont leurs propres
 * fichiers (espace-client-*, tablette, terrain).
 */
import { AVEC_COMPTES, INT, contexteEn, expect, pageEnErreur, surveiller, test } from "../outils/banc";
import { baseRecette } from "../outils/comptes.mjs";
import { pages, remplir } from "../outils/routes";

test.skip(!AVEC_COMPTES, "session de l'équipe seulement en recette");

const EXCLUES = /^\/(login|signature|desabonnement|terrain|tablette|espace-client\/demo-equipe|dashboard\/espace-client)(\/|$)/;
const PAGES = pages("interne").filter((p) => !EXCLUES.test(p.modele));

type Ids = Record<string, string | undefined>;
let ids: Ids | null = null;

async function lireIds(): Promise<Ids> {
  if (ids) return ids;
  const db = await baseRecette();
  const un = async (sql: string) => {
    const r = (await db.query(sql)).rows[0];
    return r ? String(Object.values(r)[0]) : undefined;
  };
  try {
    const devis = (await db.query("select dossier_id, id from crm.devis order by id desc limit 1")).rows[0];
    ids = {
      client: await un("select id from crm.clients order by id desc limit 1"),
      conteneur: await un("select id from crm.conteneurs order by id desc limit 1"),
      plan: await un("select id from crm.dispatch_plans order by id desc limit 1"),
      dossier: await un("select id from crm.dossiers order by id desc limit 1"),
      dossierDevis: devis ? String(devis.dossier_id) : undefined,
      devis: devis ? String(devis.id) : undefined,
      gardeMeuble: await un("select id from crm.garde_meuble order by id desc limit 1"),
      sousTraitant: await un("select id from crm.sous_traitants order by id desc limit 1"),
      rdv: await un("select id from crm.rendez_vous order by id desc limit 1"),
      demande: await un("select id from public.requests where lower(client_email) not like 'batterie.%' order by created_at desc limit 1"),
      emailClient: await un("select client_email from public.requests where lower(client_email) not like 'batterie.%' order by created_at desc limit 1"),
    };
    return ids;
  } finally {
    await db.end();
  }
}

/** Le chemin à ouvrir pour un modèle d'adresse, d'après les identifiants lus. */
function chemin(modele: string, v: Ids): string | null {
  const parModele: Record<string, Record<string, string | undefined>> = {
    "/bientot/[slug]": { slug: "conteneurs" },
    "/clients/[id]": { id: v.client },
    "/conteneurs/[id]": { id: v.conteneur },
    "/conteneurs/dispatch/[id]": { id: v.plan },
    "/conteneurs/dispatch/[id]/importer": { id: v.plan },
    "/dossiers/[id]": { id: v.dossier },
    "/dossiers/[id]/devis": { id: v.dossierDevis ?? v.dossier },
    "/dossiers/[id]/devis/[devisId]": { id: v.dossierDevis, devisId: v.devis },
    "/garde-meuble/[id]": { id: v.gardeMeuble },
    "/parcours/[id]": { id: v.dossier },
    "/partenaires/[id]": { id: v.sousTraitant },
    "/planning/[id]": { id: v.rdv },
    "/sous-traitants/[id]": { id: v.sousTraitant },
    "/dashboard/[id]": { id: v.demande },
    "/dashboard/clients/[email]": { email: v.emailClient },
    "/dashboard/statistiques/[[...reste]]": {},
    "/imprimer/[id]": { id: v.dossier },
    "/imprimer/dispatch/[id]": { id: v.plan },
  };
  return remplir(modele, parModele[modele] ?? {});
}

// Le banc fait tourner les serveurs en temps universel et le navigateur à Paris, comme Railway et les visiteurs :
// une date mise en forme sans fuseau y lève l'erreur d'hydratation React n° 418 (corrigé le 16/11/2026 sur
// /demandes?vue=leads et /relances/configuration).
for (const p of PAGES) {
  test(`${p.modele} s'ouvre sans erreur @lecture`, async ({ browser }) => {
    const v = await lireIds();
    const c = chemin(p.modele, v);
    test.skip(!c, `aucune donnée en recette pour ${p.modele}`);
    const ctx = await contexteEn(browser, "equipe");
    const page = await ctx.newPage();
    const s = surveiller(page);
    const rep = await page.goto(INT + c!, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    expect(rep?.status(), c!).toBeLessThan(400);
    expect(new URL(page.url()).pathname, "pas renvoyé vers la connexion").not.toMatch(/^\/login/);
    expect(await pageEnErreur(page), c!).toBeNull();
    expect(s.bilan(), c!).toEqual([]);
    await ctx.close();
  });
}

test("un identifiant qui n'existe pas donne une page propre, pas une erreur @lecture", async ({ browser }) => {
  const ctx = await contexteEn(browser, "equipe");
  const page = await ctx.newPage();
  const s = surveiller(page);
  for (const c of ["/dossiers/999999999", "/clients/999999999", "/conteneurs/999999999", "/garde-meuble/999999999", "/dossiers/abc", "/planning/abc", "/dashboard/00000000-0000-4000-8000-000000000000", "/dashboard/clients/inconnu%40example.com"]) {
    const rep = await page.goto(INT + c, { waitUntil: "domcontentloaded" });
    expect(rep?.status() ?? 0, c).toBeLessThan(500);
    expect((await page.locator("body").innerText()).replace(/\s+/g, " "), c).not.toMatch(/Application error|Internal Server Error/i);
  }
  expect(s.bilan().filter((e) => !/ 404 /.test(e))).toEqual([]);
  await ctx.close();
});
