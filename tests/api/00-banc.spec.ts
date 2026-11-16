import { AVEC_COMPTES, EXT, INT, expect, requeteEn, test } from "../outils/banc";

test.describe("le banc de test @lecture", () => {
  test("les deux apps répondent", async () => {
    const r = await requeteEn(null);
    expect((await r.get(EXT + "/")).status()).toBe(200);
    expect((await r.get(INT + "/login")).status()).toBe(200);
  });

  test("la session de l'équipe ouvre le CRM", async () => {
    test.skip(!AVEC_COMPTES);
    const r = await requeteEn("equipe");
    const rep = await r.get(INT + "/api/data/equipe");
    expect(rep.status()).toBe(200);
  });
});
