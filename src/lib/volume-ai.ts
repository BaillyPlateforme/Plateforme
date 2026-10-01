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
   Un client photographie volontiers son salon sous deux angles. Analysées
   séparément, les deux photos comptent le canapé deux fois, et le volume
   gonfle. On fait donc une passe de plus, qui voit toutes les photos
   ensemble et dit lesquelles montrent la même pièce.                    */

const SCHEMA_GROUPES = {
  type: Type.OBJECT,
  properties: {
    groupes: {
      type: Type.ARRAY,
      description:
        "Un groupe par pièce photographiée plusieurs fois. Les photos vues une seule fois n'apparaissent pas.",
      items: {
        type: Type.OBJECT,
        properties: {
          photos: {
            type: Type.ARRAY,
            description: "Numéros des photos (tels qu'annoncés) montrant cette même pièce.",
            items: { type: Type.INTEGER },
          },
          piece: { type: Type.STRING, description: "La pièce en question." },
          raison: {
            type: Type.STRING,
            description: "Ce qui permet de l'affirmer, en une phrase courte.",
          },
        },
        required: ["photos", "piece", "raison"],
      },
    },
  },
  required: ["groupes"],
};

export type GroupePieces = { photos: number[]; piece: string; raison: string };

const CONSIGNE_GROUPES = `Tu reçois plusieurs photos prises chez un même client qui déménage.
Dis lesquelles montrent LA MÊME pièce, photographiée sous un autre angle ou à un autre moment.

Comment trancher :
- Même pièce = mêmes murs, même sol, mêmes ouvertures, et surtout le même mobilier reconnaissable.
- Deux chambres qui se ressemblent ne sont PAS la même pièce : cherche un détail qui ne trompe pas
  (un meuble précis, un tableau, la vue par la fenêtre, un motif de sol).
- Dans le doute, ne groupe pas. Compter deux fois un canapé coûte au client ;
  séparer à tort deux photos ne coûte rien.
- Ne renvoie que les groupes d'au moins deux photos. Si aucune photo ne se répète, renvoie une liste vide.`;

/**
 * Repère les photos qui montrent la même pièce. Une seule requête, toutes les
 * images ensemble : c'est la seule façon de les comparer entre elles.
 */
export async function detecterDoublons(
  images: { base64: string; mimeType: string }[],
  cfg: AiConfig,
): Promise<GroupePieces[]> {
  if (images.length < 2) return [];

  const parts: object[] = [];
  images.forEach((img, i) => {
    parts.push({ text: `Photo ${i + 1} :` });
    parts.push({ inlineData: { mimeType: normalizeMimeType(img.mimeType), data: img.base64 } });
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
    const { photos, piece, raison } = g as GroupePieces;
    if (!Array.isArray(photos)) continue;
    // Les numéros sont annoncés à partir de 1 ; on revient à des index, on
    // écarte ce qui sort du lot et ce qui a déjà été classé ailleurs.
    const index = [...new Set(photos.map((n) => Number(n) - 1))]
      .filter((i) => Number.isInteger(i) && i >= 0 && i < images.length && !vus.has(i))
      .sort((a, b) => a - b);
    if (index.length < 2) continue;
    index.forEach((i) => vus.add(i));
    groupes.push({
      photos: index,
      piece: typeof piece === "string" ? piece : "",
      raison: typeof raison === "string" ? raison : "",
    });
  }
  return groupes;
}
