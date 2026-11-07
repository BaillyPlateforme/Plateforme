import "server-only";
import { GoogleGenAI, Type } from "@google/genai";
import { env } from "@/lib/env";
import { photoAnalysisSchema, type PhotoAnalysisInput } from "@/lib/schemas";
import { buildSystemPrompt, type AiConfig } from "@/lib/ai-config";

// Schéma de sortie structurée imposé à Gemini.
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    piece: {
      type: Type.STRING,
      description: "Type de pièce identifié (ex : Salon, Chambre, Cuisine).",
    },
    objets: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING, description: "Nom de l'objet/meuble." },
          quantite: { type: Type.INTEGER },
          volume_m3: {
            type: Type.NUMBER,
            description: "Volume total pour cette ligne (unitaire × quantité).",
          },
        },
        required: ["label", "quantite", "volume_m3"],
      },
    },
    volume_m3: {
      type: Type.NUMBER,
      description: "Volume total estimé de la photo (somme des lignes).",
    },
  },
  required: ["piece", "objets", "volume_m3"],
};

let client: GoogleGenAI | null = null;
function getClient() {
  if (!client) client = new GoogleGenAI({ apiKey: env.geminiApiKey() });
  return client;
}

function normalizeMimeType(mime: string): string {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
  return allowed.includes(mime) ? mime : "image/jpeg";
}

// Analyse UNE photo selon la configuration (prompt, volumes, modèle, température).
export async function analyzePhoto(
  base64: string,
  mimeType: string,
  cfg: AiConfig,
): Promise<PhotoAnalysisInput> {
  const response = await getClient().models.generateContent({
    model: cfg.model || env.geminiModel(),
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: normalizeMimeType(mimeType), data: base64 } },
          { text: cfg.user_instruction },
        ],
      },
    ],
    config: {
      systemInstruction: buildSystemPrompt(cfg),
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: cfg.temperature,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini n'a pas renvoyé d'analyse.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Réponse Gemini non-JSON.");
  }

  return photoAnalysisSchema.parse(parsed);
}

/* ══════════════════ Dédoublonnage des pièces ══════════════════════════
   Trois photos d'un même salon ne montrent pas trois salons. Elles montrent
   des choses différentes — un angle dévoile une armoire que l'autre cache —
   et des choses communes : le canapé est sur les trois. Ce sont ces choses
   communes, et elles seules, qu'il ne faut pas recompter.

   On fait donc une passe de plus, qui voit toutes les photos ET leurs
   inventaires d'un coup. Elle dit quelles photos montrent la même pièce,
   puis, ligne par ligne, laquelle a déjà été vue ailleurs dans le groupe. */

const SCHEMA_GROUPES = {
  type: Type.OBJECT,
  properties: {
    groupes: {
      type: Type.ARRAY,
      description:
        "Un groupe par pièce photographiée plusieurs fois. Les pièces vues une seule fois n'apparaissent pas.",
      items: {
        type: Type.OBJECT,
        properties: {
          photos: {
            type: Type.ARRAY,
            description: "Numéros des photos montrant cette même pièce, dans l'ordre.",
            items: { type: Type.INTEGER },
          },
          piece: { type: Type.STRING, description: "La pièce en question." },
          raison: {
            type: Type.STRING,
            description: "Ce qui permet de l'affirmer, en une phrase courte.",
          },
          deja_vus: {
            type: Type.ARRAY,
            description:
              "Les lignes d'inventaire qui désignent un meuble DÉJÀ listé sur une photo précédente du groupe. C'est le même objet physique, pas un objet semblable.",
            items: {
              type: Type.OBJECT,
              properties: {
                photo: { type: Type.INTEGER, description: "Numéro de la photo." },
                ligne: { type: Type.INTEGER, description: "Numéro de la ligne dans cette photo." },
                vu_sur: {
                  type: Type.INTEGER,
                  description: "Numéro de la photo précédente où ce meuble est déjà compté.",
                },
              },
              required: ["photo", "ligne", "vu_sur"],
            },
          },
        },
        required: ["photos", "piece", "raison", "deja_vus"],
      },
    },
  },
  required: ["groupes"],
};

export type LigneVue = { photo: number; ligne: number; vu_sur: number };
export type GroupePieces = {
  photos: number[];
  piece: string;
  raison: string;
  deja_vus: LigneVue[];
};

const CONSIGNE_GROUPES = `Tu reçois les photos d'un même client qui déménage, chacune suivie de son inventaire.

Deux questions, dans cet ordre.

1) Quelles photos montrent LA MÊME pièce, sous un autre angle ou à un autre moment ?
   - Même pièce = mêmes murs, même sol, mêmes ouvertures, et surtout le même mobilier reconnaissable.
   - Deux chambres qui se ressemblent ne sont PAS la même pièce : cherche un détail qui ne trompe pas
     (un meuble précis, un tableau, la vue par la fenêtre, un motif de sol).
   - Dans le doute, ne groupe pas.
   - Ne renvoie que les groupes d'au moins deux photos.

2) Dans chaque groupe, quelles lignes d'inventaire désignent un meuble DÉJÀ listé sur une photo
   précédente du même groupe ? C'est là tout l'enjeu : le camion ne transporte qu'une fois le canapé
   visible sur les trois photos.
   - Compare les objets physiques, pas les mots : « canapé d'angle » et « canapé 3 places » peuvent
     très bien être le même meuble vu de deux côtés.
   - Si une photo révèle un meuble qu'aucune autre ne montrait, ne le signale PAS : il doit être compté.
   - Si une photo voit plus d'exemplaires qu'une autre (4 chaises contre 2), signale la ligne qui en
     voit le MOINS, et garde celle qui en voit le plus.
   - Dans le doute, ne signale pas : il vaut mieux compter un meuble en trop que d'en oublier un.`;

/**
 * Repère les photos d'une même pièce et, dans chacune, les meubles déjà
 * comptés ailleurs. Une seule requête : c'est la seule façon de comparer les
 * photos entre elles.
 */
export async function detecterDoublons(
  images: { base64: string; mimeType: string; inventaire: string[] }[],
  cfg: AiConfig,
): Promise<GroupePieces[]> {
  if (images.length < 2) return [];

  const parts: object[] = [];
  images.forEach((img, i) => {
    parts.push({ text: `Photo ${i + 1} :` });
    parts.push({ inlineData: { mimeType: normalizeMimeType(img.mimeType), data: img.base64 } });
    parts.push({
      text: img.inventaire.length
        ? `Inventaire de la photo ${i + 1} :\n${img.inventaire.map((l, n) => `${n + 1}. ${l}`).join("\n")}`
        : `Inventaire de la photo ${i + 1} : vide.`,
    });
  });
  parts.push({ text: CONSIGNE_GROUPES });

  const response = await getClient().models.generateContent({
    model: cfg.model || env.geminiModel(),
    contents: [{ role: "user", parts }],
    config: {
      responseMimeType: "application/json",
      responseSchema: SCHEMA_GROUPES,
      temperature: 0, // on veut un jugement stable, pas de la créativité
    },
  });

  const text = response.text;
  if (!text) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  const brut = (parsed as { groupes?: unknown })?.groupes;
  if (!Array.isArray(brut)) return [];

  const vus = new Set<number>();
  const groupes: GroupePieces[] = [];
  for (const g of brut) {
    if (!g || typeof g !== "object") continue;
    const { photos, piece, raison, deja_vus } = g as GroupePieces;
    if (!Array.isArray(photos)) continue;
    // Les numéros sont annoncés à partir de 1 ; on revient à des index, on
    // écarte ce qui sort du lot et ce qui a déjà été classé ailleurs.
    const index = [...new Set(photos.map((n) => Number(n) - 1))]
      .filter((i) => Number.isInteger(i) && i >= 0 && i < images.length && !vus.has(i))
      .sort((a, b) => a - b);
    if (index.length < 2) continue;
    index.forEach((i) => vus.add(i));

    const lignes: LigneVue[] = (Array.isArray(deja_vus) ? deja_vus : [])
      .map((d) => ({ photo: Number(d?.photo) - 1, ligne: Number(d?.ligne) - 1, vu_sur: Number(d?.vu_sur) - 1 }))
      .filter(
        (d) =>
          index.includes(d.photo) &&
          index.includes(d.vu_sur) &&
          d.vu_sur !== d.photo &&
          d.ligne >= 0 &&
          d.ligne < images[d.photo].inventaire.length,
      );

    groupes.push({
      photos: index,
      piece: typeof piece === "string" ? piece : "",
      raison: typeof raison === "string" ? raison : "",
      deja_vus: lignes,
    });
  }
  return groupes;
}
