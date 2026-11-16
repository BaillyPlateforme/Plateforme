/*
 * Les temps de réponse des portes d'entrée : la médiane de trois appels doit
 * rester sous un plafond (généreux : il s'agit de voir une régression nette,
 * pas de mesurer finement). En lecture seule.
 */
import { EXT, INT, LOCAL, expect, requeteEn, test } from "../outils/banc";

const PLAFOND_MS = Number(process.env.PLAFOND_MS ?? (LOCAL ? 1500 : 2500));

async function mediane(appel: () => Promise<unknown>): Promise<number> {
  await appel(); // un premier appel « à froid », non compté
  const t: number[] = [];
  for (let i = 0; i < 3; i++) {
    const d = performance.now();
    await appel();
    t.push(performance.now() - d);
  }
  return t.sort((a, b) => a - b)[1];
}

const MESURES: [string, (r: import("@playwright/test").APIRequestContext) => Promise<unknown>][] = [
  ["la page du formulaire", (r) => r.get(`${EXT}/`)],
  ["la connexion à l'espace client", (r) => r.get(`${EXT}/espace-client/connexion`)],
  ["l'estimation instantanée (API)", (r) => r.post(`${EXT}/api/estimate`, { data: { volume_m3: 25, distance_km: 300, formule: "standard" } })],
  ["la connexion de l'équipe", (r) => r.get(`${INT}/login`)],
  ["un refus du proxy (API sans session)", (r) => r.get(`${INT}/api/data/clients`)],
  ["le script d'intégration", (r) => r.get(`${EXT}/integration.js`)],
];

for (const [nom, appel] of MESURES) {
  test(`${nom} répond en moins de ${PLAFOND_MS} ms @lecture`, async () => {
    const r = await requeteEn(null);
    const ms = await mediane(() => appel(r));
    test.info().annotations.push({ type: "médiane", description: `${Math.round(ms)} ms` });
    expect(ms).toBeLessThan(PLAFOND_MS);
  });
}
