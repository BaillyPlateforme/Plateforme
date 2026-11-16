import { beforeEach, describe, expect, it, vi } from "vitest";

// Gemini simulé : aucun appel réseau. Chaque test dit ce que « répond » le modèle.
const generateContent = vi.hoisted(() => vi.fn());
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
  Type: { OBJECT: "OBJECT", STRING: "STRING", ARRAY: "ARRAY", INTEGER: "INTEGER", NUMBER: "NUMBER" },
}));
vi.mock("@/lib/env", () => ({ env: { geminiApiKey: () => "cle-de-test", geminiModel: () => "modele-par-defaut" } }));
vi.mock("@/lib/ai-config", () => ({ buildSystemPrompt: () => "consigne système" }));

import { analyzePhoto, detecterDoublons } from "@/lib/volume-ai";
import type { AiConfig } from "@/lib/ai-config";

const cfg: AiConfig = {
  model: "",
  temperature: 0.2,
  prompt_avant: "",
  prompt_apres: "",
  user_instruction: "Analyse cette pièce.",
  volume_references: [],
};
const repond = (texte: string | undefined) => generateContent.mockResolvedValueOnce({ text: texte });
const json = (v: unknown) => JSON.stringify(v);

beforeEach(() => {
  generateContent.mockReset();
});

describe("analyzePhoto — lecture et contrôle de la réponse de Gemini", () => {
  const valide = { piece: "Salon", objets: [{ label: "Canapé 3 places", quantite: 1, volume_m3: 1.5 }, { label: "Chaise", quantite: 4, volume_m3: 0.6 }], volume_m3: 2.1 };

  it("une réponse conforme est rendue telle quelle", async () => {
    repond(json(valide));
    await expect(analyzePhoto("b64", "image/png", cfg)).resolves.toEqual(valide);
  });

  it("les champs inconnus du modèle sont écartés", async () => {
    repond(json({ ...valide, secret: "ignorer", objets: [{ ...valide.objets[0], prix: 999 }] }));
    const r = await analyzePhoto("b64", "image/png", cfg);
    expect(r).not.toHaveProperty("secret");
    expect(r.objets[0]).not.toHaveProperty("prix");
  });

  it("réponse vide : erreur claire", async () => {
    repond(undefined);
    await expect(analyzePhoto("b64", "image/png", cfg)).rejects.toThrow("Gemini n'a pas renvoyé d'analyse.");
    repond("");
    await expect(analyzePhoto("b64", "image/png", cfg)).rejects.toThrow("Gemini n'a pas renvoyé d'analyse.");
  });

  it("réponse qui n'est pas du JSON (bloc de code, texte libre) : erreur claire", async () => {
    repond("```json\n" + json(valide) + "\n```");
    await expect(analyzePhoto("b64", "image/png", cfg)).rejects.toThrow("Réponse Gemini non-JSON.");
  });

  it.each([
    ["un volume total négatif", { ...valide, volume_m3: -1 }],
    ["un volume de ligne négatif", { ...valide, objets: [{ label: "x", quantite: 1, volume_m3: -0.1 }] }],
    ["une quantité nulle", { ...valide, objets: [{ label: "x", quantite: 0, volume_m3: 0.1 }] }],
    ["une quantité décimale", { ...valide, objets: [{ label: "x", quantite: 1.5, volume_m3: 0.1 }] }],
    ["un volume en texte", { ...valide, volume_m3: "2,1" }],
    ["une pièce manquante", { objets: [], volume_m3: 0 }],
    ["des objets qui ne sont pas une liste", { ...valide, objets: "canapé" }],
  ])("refuse %s", async (_, corps) => {
    repond(json(corps));
    await expect(analyzePhoto("b64", "image/png", cfg)).rejects.toThrow();
  });

  it("accepte une pièce vide (aucun objet, 0 m³)", async () => {
    repond(json({ piece: "Couloir", objets: [], volume_m3: 0 }));
    await expect(analyzePhoto("b64", "image/png", cfg)).resolves.toEqual({ piece: "Couloir", objets: [], volume_m3: 0 });
  });

  it.each([
    ["image/png", "image/png"],
    ["image/webp", "image/webp"],
    ["image/heic", "image/heic"],
    ["image/gif", "image/jpeg"],
    ["application/pdf", "image/jpeg"],
    ["", "image/jpeg"],
  ])("type %j envoyé à Gemini comme %s", async (mime, attendu) => {
    repond(json(valide));
    await analyzePhoto("b64", mime, cfg);
    const envoi = generateContent.mock.calls[0][0];
    expect(envoi.contents[0].parts[0].inlineData.mimeType).toBe(attendu);
  });

  it("modèle : celui de la configuration, sinon celui de l'environnement", async () => {
    repond(json(valide));
    await analyzePhoto("b64", "image/png", cfg);
    expect(generateContent.mock.calls[0][0].model).toBe("modele-par-defaut");
    repond(json(valide));
    await analyzePhoto("b64", "image/png", { ...cfg, model: "gemini-test" });
    expect(generateContent.mock.calls[1][0].model).toBe("gemini-test");
  });

  it("transmet la température, la consigne système et une sortie JSON imposée", async () => {
    repond(json(valide));
    await analyzePhoto("b64", "image/png", { ...cfg, temperature: 0.7 });
    const { config } = generateContent.mock.calls[0][0];
    expect(config).toMatchObject({ temperature: 0.7, systemInstruction: "consigne système", responseMimeType: "application/json" });
  });
});

describe("detecterDoublons — lecture et contrôle des groupes de pièces", () => {
  const images = (inventaires: string[][]) => inventaires.map((inventaire) => ({ base64: "b64", mimeType: "image/jpeg", inventaire }));
  const trois = images([["Canapé", "Table basse"], ["Canapé", "Armoire"], ["Lit"]]);

  it("moins de deux photos : rien à comparer, aucun appel", async () => {
    await expect(detecterDoublons(images([["Canapé"]]), cfg)).resolves.toEqual([]);
    await expect(detecterDoublons([], cfg)).resolves.toEqual([]);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("numéros de photo et de ligne à partir de 1 → index à partir de 0", async () => {
    repond(json({ groupes: [{ photos: [1, 2], piece: "Salon", raison: "même canapé", deja_vus: [{ photo: 2, ligne: 1, vu_sur: 1 }] }] }));
    await expect(detecterDoublons(trois, cfg)).resolves.toEqual([
      { photos: [0, 1], piece: "Salon", raison: "même canapé", deja_vus: [{ photo: 1, ligne: 0, vu_sur: 0 }] },
    ]);
  });

  it("photos dédoublonnées et triées", async () => {
    repond(json({ groupes: [{ photos: [2, 1, 2], piece: "Salon", raison: "r", deja_vus: [] }] }));
    expect((await detecterDoublons(trois, cfg))[0].photos).toEqual([0, 1]);
  });

  it("numéros hors du lot (0, au-delà, négatifs, décimaux) écartés ; un groupe réduit à une photo disparaît", async () => {
    repond(json({ groupes: [{ photos: [0, 2, 4, -1, 1.5], piece: "Salon", raison: "r", deja_vus: [] }] }));
    await expect(detecterDoublons(trois, cfg)).resolves.toEqual([]);
  });

  it("numéros en texte acceptés s'ils sont des entiers", async () => {
    repond(json({ groupes: [{ photos: ["1", "3"], piece: "Chambre", raison: "r", deja_vus: [] }] }));
    expect((await detecterDoublons(trois, cfg))[0].photos).toEqual([0, 2]);
  });

  it("une photo déjà classée dans un groupe ne rejoint pas un second", async () => {
    repond(json({
      groupes: [
        { photos: [1, 2], piece: "Salon", raison: "r", deja_vus: [] },
        { photos: [2, 3], piece: "Chambre", raison: "r", deja_vus: [] },
      ],
    }));
    const g = await detecterDoublons(trois, cfg);
    expect(g).toHaveLength(1);
    expect(g[0].photos).toEqual([0, 1]);
  });

  it("lignes déjà vues écartées si elles sortent du groupe ou de l'inventaire", async () => {
    repond(json({
      groupes: [{
        photos: [1, 2], piece: "Salon", raison: "r",
        deja_vus: [
          { photo: 2, ligne: 1, vu_sur: 1 }, // gardée
          { photo: 3, ligne: 1, vu_sur: 1 }, // photo hors du groupe
          { photo: 2, ligne: 1, vu_sur: 3 }, // vu_sur hors du groupe
          { photo: 2, ligne: 1, vu_sur: 2 }, // vue sur elle-même
          { photo: 2, ligne: 3, vu_sur: 1 }, // ligne au-delà de l'inventaire (2 lignes)
          { photo: 2, ligne: 0, vu_sur: 1 }, // ligne 0 → index -1
          { photo: 2, ligne: "x", vu_sur: 1 }, // illisible
          null,
        ],
      }],
    }));
    expect((await detecterDoublons(trois, cfg))[0].deja_vus).toEqual([{ photo: 1, ligne: 0, vu_sur: 0 }]);
  });

  it("pièce et raison absentes ou d'un autre type : chaînes vides ; deja_vus absent : liste vide", async () => {
    repond(json({ groupes: [{ photos: [1, 2], piece: 7, raison: null }] }));
    expect(await detecterDoublons(trois, cfg)).toEqual([{ photos: [0, 1], piece: "", raison: "", deja_vus: [] }]);
  });

  it.each([
    ["une réponse vide", undefined],
    ["du texte libre", "Les photos 1 et 2 montrent le salon."],
    ["un objet sans groupes", json({ autre: [] })],
    ["des groupes qui ne sont pas une liste", json({ groupes: "salon" })],
    ["des groupes illisibles", json({ groupes: [null, 3, "x", { photos: "1,2" }] })],
  ])("%s : aucun groupe, jamais d'exception", async (_, texte) => {
    repond(texte as string | undefined);
    await expect(detecterDoublons(trois, cfg)).resolves.toEqual([]);
  });

  it("envoie chaque photo suivie de son inventaire numéroté, température 0", async () => {
    repond(json({ groupes: [] }));
    await detecterDoublons(images([["Canapé", "Chaise"], []]), cfg);
    const envoi = generateContent.mock.calls[0][0];
    const textes = envoi.contents[0].parts.filter((p: { text?: string }) => p.text).map((p: { text: string }) => p.text);
    expect(textes).toContain("Inventaire de la photo 1 :\n1. Canapé\n2. Chaise");
    expect(textes).toContain("Inventaire de la photo 2 : vide.");
    expect(envoi.config.temperature).toBe(0);
  });

  // Une ligne n'est « déjà vue » que sur une photo PRÉCÉDENTE : deux lignes qui se désignent l'une
  // l'autre ne retirent pas toutes deux le meuble du volume.
  it("une ligne n'est « déjà vue » que sur une photo précédente du groupe (vu_sur < photo)", async () => {
    repond(json({
      groupes: [{
        photos: [1, 2], piece: "Salon", raison: "même canapé",
        deja_vus: [{ photo: 1, ligne: 1, vu_sur: 2 }, { photo: 2, ligne: 1, vu_sur: 1 }],
      }],
    }));
    const g = await detecterDoublons(trois, cfg);
    expect(g[0].deja_vus.every((d) => d.vu_sur < d.photo)).toBe(true);
    expect(g[0].deja_vus).toEqual([{ photo: 1, ligne: 0, vu_sur: 0 }]);
  });
});
