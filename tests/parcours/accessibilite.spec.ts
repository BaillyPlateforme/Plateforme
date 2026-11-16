/*
 * L'accessibilité des pages que voit le public (WCAG 2.1 A et AA, par
 * axe-core) : le formulaire de devis, les connexions du client et des RH,
 * la connexion de l'équipe. Aucune violation « critique » ni « grave ».
 */
import AxeBuilder from "@axe-core/playwright";
import { EXT, INT, expect, test } from "../outils/banc";

const PAGES = [
  ["le formulaire de devis", `${EXT}/`],
  ["la connexion à l'espace client", `${EXT}/espace-client/connexion`],
  ["la connexion des RH", `${EXT}/rh/connexion`],
  ["le portail pro", `${EXT}/pro`],
  ["la connexion de l'équipe", `${INT}/login`],
  ["la connexion des déménageurs", `${INT}/terrain/connexion`],
] as const;

/** Les défauts relevés, à corriger dans l'app (ôter la ligne une fois corrigé). Ceux du 15/11/2026 le sont. */
const CONNUS: Record<string, string> = {};

for (const [nom, adresse] of PAGES) {
  test(`${nom} : aucune violation critique ni grave @lecture`, async ({ page }) => {
    if (CONNUS[nom]) test.fail(true, CONNUS[nom]);
    await page.goto(adresse, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    // Les entrées animées (fondu des cartes, jusqu'à une seconde après le chargement) : à mi-course, le texte
    // à demi transparent passe pour un contraste insuffisant. On juge la page posée ; les boucles sans fin
    // (dégradés, pulsations) et les lents zooms des photos, qui ne touchent pas au texte, ne s'attendent pas.
    await page
      .waitForFunction(
        () =>
          document.getAnimations().every((a) => {
            const t = a.effect?.getTiming();
            return a.playState !== "running" || !t || t.iterations === Infinity || Number(t.duration) > 3000;
          }),
        null,
        { timeout: 10_000 },
      )
      .catch(() => {});
    const r = await new AxeBuilder({ page })
      // La pastille « DEV » / « LOCAL » n'existe qu'en recette et sur un poste de développement, jamais en production.
      .exclude('span[title^="Environnement de développement"]')
      .exclude('span[title^="Poste de développement"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const graves = r.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    const lisible = graves.map((v) => `${v.impact} · ${v.id} : ${v.help} (${v.nodes.length} élément(s) : ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")})`);
    test.info().annotations.push(...r.violations.map((v) => ({ type: `a11y ${v.impact}`, description: `${v.id} — ${v.help} (${v.nodes.length})` })));
    expect(lisible, lisible.join("\n")).toEqual([]);
  });
}
