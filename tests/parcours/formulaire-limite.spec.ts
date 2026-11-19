/*
 * La limite de débit du formulaire public : deux demandes par minute et par
 * adresse IP. La troisième reçoit un 429 — et le visiteur doit lire, dans le
 * formulaire resté rempli, pourquoi et quand réessayer : pas une page cassée.
 * Sur bureau et sur téléphone.
 */
import {
  DUREE_PARCOURS,
  action,
  champ,
  erreurFormulaire,
  exigerEcritures,
  expect,
  ouvrirPorte,
  remplirExpress,
  test,
  verifierPagePropre,
} from "./formulaire-outils";
import { EXT, emailUnique, requeteEn } from "../outils/banc";

test.describe.configure({ mode: "parallel", timeout: DUREE_PARCOURS });

/** Une demande complète, telle que le devis express l'envoie. */
const demande = (email: string) => ({
  client: { nom: "Testeur Limite", email },
  depart: { ville: "Lyon", code_postal: "69001" },
  arrivee: { ville: "Paris", code_postal: "75011" },
  volume: { method: "explicit", volume_m3: 10 },
  distance_km: 465,
  flexibilite: "Je ne sais pas encore",
  type_client: "particulier",
  details: { express: true },
});

test("trois demandes dans la minute depuis la même adresse IP : la troisième lit un message clair", async ({ page, visiteur, db }) => {
  exigerEcritures();
  // La troisième sera celle du formulaire : on le remplit d'abord, pour que les trois tombent dans la même minute.
  const email = emailUnique("limite");
  await ouvrirPorte(page, "express");
  await remplirExpress(page, "Testeur Limite", email);

  // Les deux premières partent directement à l'API, sous l'adresse IP de ce navigateur.
  const api = await requeteEn(null, { extraHTTPHeaders: { "x-real-ip": visiteur.ip } });
  for (let i = 0; i < 2; i++) {
    const rep = await api.post(EXT + "/api/requests", { data: demande(emailUnique("limite")) });
    expect(rep.status(), await rep.text()).toBe(201);
  }
  await api.dispose();

  const reponse = page.waitForResponse((r) => r.url().endsWith("/api/requests") && r.request().method() === "POST");
  await action(page, "Obtenir mon estimation").click();
  const r = await reponse;
  expect(r.status()).toBe(429);
  expect(Number(r.headers()["retry-after"])).toBeGreaterThan(0);

  await expect(erreurFormulaire(page)).toContainText("Plusieurs demandes viennent déjà d'être envoyées.");
  await expect(erreurFormulaire(page)).toContainText(/Réessayez (dans une minute|dans \d+ minutes|dans \d+ heures|demain)\./);
  // Le formulaire est resté là, rempli : le visiteur pourra renvoyer sans rien ressaisir.
  await expect(page.getByRole("heading", { name: /Estimation rapide/ })).toBeVisible();
  await expect(champ(page, "E-mail")).toHaveValue(email);
  await expect(action(page, "Obtenir mon estimation")).toBeEnabled();
  expect(await db.demandes(email), "la demande refusée n'est pas enregistrée").toHaveLength(0);

  await verifierPagePropre(page, visiteur);
});
